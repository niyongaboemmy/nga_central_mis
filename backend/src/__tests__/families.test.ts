// Families (services/families.ts, routes/families.ts) against the test DB (migration 115).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { createUser } from "../test/fixtures";
import { familiesRouter } from "../routes/families";
import { describe as describeChild, digestText, importParents, sendWeeklyDigests, setAccountMailer, setFamilySender, weekOf } from "../services/families";

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));

let kid1: number, kid2: number, teacher: number, parent: number;
const made: number[] = [];
const mails: Array<[string, string]> = [];
const sent: Array<{ via: string; to: number | string; title: string }> = [];
let perms: string[] = [];

const app = express();
app.use(express.json());
app.use(
  "/families",
  familiesRouter((req: any, res, next) => {
    const id = Number(req.get("X-Test-User"));
    if (!id) return res.status(401).end();
    req.user = { userId: id, permissions: perms };
    next();
  }),
);
const as = (id: number) => ({ "X-Test-User": String(id) });

beforeAll(async () => {
  kid1 = await createUser({ userType: "STUDENT" });
  kid2 = await createUser({ userType: "STUDENT" });
  teacher = await createUser({ userType: "TEACHER" });
  setAccountMailer(async (email, username) => {
    mails.push([email, username]);
  });
  setFamilySender({
    telegram: async (id, t) => (sent.push({ via: "telegram", to: id, title: t.title }), false),
    email: async (to, subject) => (sent.push({ via: "email", to, title: subject }), true),
  });
  const today = new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
  await db.execute(sql`INSERT INTO StudentSignal (student_id, source, metrics, as_of, updated_at) VALUES
    (${kid1}, 'tendo', ${JSON.stringify({ absences_14d: 3, lates_14d: 1, incidents_30d: 0 })}, ${today}, UTC_TIMESTAMP()),
    (${kid1}, 'taskmentor', ${JSON.stringify({ due_14d: 5, missed_14d: 1, avg_pct_30d: 71.6 })}, ${today}, UTC_TIMESTAMP())`);
});

afterAll(async () => {
  setFamilySender(null);
  const all = [kid1, kid2, teacher, ...made];
  const list = sql.join(all.map((i) => sql`${i}`), sql`, `);
  await db.execute(sql`DELETE FROM StudentSignal WHERE student_id IN (${list})`);
  await db.execute(sql`DELETE FROM Parenting WHERE student_id IN (${list}) OR parent_id IN (${list})`);
  await db.execute(sql`DELETE FROM FamilyDigestLog WHERE parent_id IN (${list})`);
  await db.execute(sql`DELETE FROM FamilyPreference WHERE parent_id IN (${list})`);
  await db.execute(sql`DELETE FROM Notification WHERE user_id IN (${list})`);
  if (made.length) {
    const m = sql.join(made.map((i) => sql`${i}`), sql`, `);
    await db.execute(sql`DELETE FROM UserRole WHERE user_id IN (${m})`);
    await db.execute(sql`DELETE FROM AccessGrant WHERE user_id IN (${m})`).catch(() => undefined);
    await db.execute(sql`DELETE FROM AuthCredential WHERE user_id IN (${m})`);
    await db.execute(sql`DELETE FROM UserProfile WHERE user_id IN (${m})`);
    await db.execute(sql`DELETE FROM User WHERE user_id IN (${m})`);
  }
});

describe("plain words for parents", () => {
  it("describes a week without staff jargon, and flags what deserves attention", () => {
    const d = describeChild({ absences_14d: 3, lates_14d: 1, incidents_30d: 0 }, { due_14d: 5, missed_14d: 1, avg_pct_30d: 71.6 });
    expect(d).toEqual({
      attendance: "In the last 2 weeks: missed 3 lessons and was late 1 time.",
      conduct: "No discipline notes this month.",
      schoolwork: "Handed in 4 of 5 pieces of work in the last 2 weeks; average mark 72% this month.",
      attention: true,
    });
    expect(describeChild({ absences_14d: 0, lates_14d: 0 }, null)).toMatchObject({ attendance: "At every lesson on time in the last 2 weeks.", schoolwork: null, attention: false });
    expect(describeChild(null, null)).toEqual({ attendance: null, conduct: null, schoolwork: null, attention: false });
  });

  it("writes the weekly summary", () => {
    const t = digestText([
      { studentId: 1, name: "Aline U", firstName: "Aline", className: "S2 A", asOf: null, attendance: "At every lesson on time in the last 2 weeks.", conduct: null, schoolwork: null, attention: false },
      { studentId: 2, name: "Bob", firstName: "Bob", className: null, asOf: null, attendance: null, conduct: null, schoolwork: null, attention: true },
    ]);
    expect(t.title).toBe("This week at school: worth a look");
    expect(t.body).toContain("Aline (S2 A): At every lesson on time in the last 2 weeks.");
    expect(t.body).toContain("Bob: no information from the school this week.");
    expect(weekOf("2026-10-09")).toBe("2026-10-05");
  });
});

describe("importing parents", () => {
  it("creates accounts, links children, reuses an existing parent, and reports bad rows", async () => {
    const email = `parent.${kid1}@example.com`;
    const res = await importParents(
      [
        { student: String(kid1), parentName: "Marie Uwase", email, phone: "+250 788 000 111", relationship: "mother" },
        { student: String(kid2), parentName: "Marie Uwase", email },
        { student: String(kid2), parentName: "Marie Uwase", email },
        { student: "nobody-here", parentName: "X Y", email: "x@example.com" },
        { student: String(kid1), parentName: "Bad", email: "not-an-email" },
      ],
      teacher,
    );
    expect(res.map((r) => r.outcome)).toEqual(["created", "linked", "already_linked", "error", "error"]);
    expect(res[3].message).toContain("No active student");
    parent = res[0].parentId!;
    made.push(parent);
    expect(mails).toEqual([[email, `parent.${kid1}`]]);
    const [p] = rows(await db.execute(sql`SELECT user_type FROM UserProfile WHERE user_id = ${parent}`));
    expect(p.user_type).toBe("PARENT");
    const links = rows(await db.execute(sql`SELECT student_id AS s, relationship AS r FROM Parenting WHERE parent_id = ${parent} ORDER BY student_id`));
    expect(links.map((l: any) => [Number(l.s), l.r])).toEqual([[kid1, "MOTHER"], [kid2, "PARENT"]]);
    const [cred] = rows(await db.execute(sql`SELECT force_password_change AS f FROM AuthCredential WHERE user_id = ${parent}`));
    expect(Number(cred.f)).toBe(1);
  });

  it("refuses to turn a staff email into a parent", async () => {
    const [t] = rows(await db.execute(sql`SELECT email FROM User WHERE user_id = ${teacher}`));
    const [r] = await importParents([{ student: String(kid1), parentName: "Staff Person", email: t.email }], teacher);
    expect(r).toMatchObject({ outcome: "error", message: "That email belongs to a staff or student account" });
  });

  it("the import route needs Manage users", async () => {
    perms = [];
    expect((await request(app).post("/families/import").set(as(teacher)).send({ rows: [] })).status).toBe(403);
    perms = ["MANAGE_USERS"];
    const r = await request(app).post("/families/import").set(as(teacher)).send({ rows: [{ student: String(kid1), parentName: "Marie Uwase", email: `parent.${kid1}@example.com` }] });
    expect(r.body.data[0].outcome).toBe("already_linked");
    perms = [];
  });
});

describe("the family page and the weekly summary", () => {
  it("shows each child in plain words, and saves preferences", async () => {
    const r = await request(app).get("/families/me").set(as(parent));
    expect(r.status).toBe(200);
    const kids = r.body.data.children;
    expect(kids.map((k: any) => k.studentId).sort()).toEqual([kid1, kid2].sort());
    const one = kids.find((k: any) => k.studentId === kid1);
    expect(one).toMatchObject({ attendance: "In the last 2 weeks: missed 3 lessons and was late 1 time.", attention: true });
    expect(kids.find((k: any) => k.studentId === kid2)).toMatchObject({ attendance: null, schoolwork: null });
    expect(r.body.data.preferences).toEqual({ weeklyDigest: true, digestEmail: true });
    const p = await request(app).put("/families/me/preferences").set(as(parent)).send({ digestEmail: false });
    expect(p.body.data).toEqual({ weeklyDigest: true, digestEmail: false });
    await request(app).put("/families/me/preferences").set(as(parent)).send({ digestEmail: true });
    // A teacher (no children) sees nothing.
    expect((await request(app).get("/families/me").set(as(teacher))).body.data.children).toEqual([]);
  });

  it("sends the weekly summary once per parent and week", async () => {
    sent.length = 0;
    const friday = new Date("2031-03-07T15:00:00Z");
    await sendWeeklyDigests(friday);
    const mine = sent.filter((s) => s.to === parent || s.to === `parent.${kid1}@example.com`);
    expect(mine.map((s) => s.via).sort()).toEqual(["email", "telegram"]);
    const [log] = rows(await db.execute(sql`SELECT channels FROM FamilyDigestLog WHERE parent_id = ${parent} AND week_start = '2031-03-03'`));
    expect(log.channels).toBe("app,email");
    const [note] = rows(await db.execute(sql`SELECT title, link FROM Notification WHERE user_id = ${parent} AND kind = 'family_digest'`));
    expect(note).toMatchObject({ title: "This week at school: worth a look", link: "/family" });
    sent.length = 0;
    await sendWeeklyDigests(friday);
    expect(sent.filter((s) => s.to === parent || s.to === `parent.${kid1}@example.com`)).toEqual([]);
  });
});
