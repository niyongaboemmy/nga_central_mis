// Home <- safeguarding, early warning, staff cover and families
// (services/home/careProvider.ts), against the test database (migrations 112-116).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { Parenting } from "../db/schema";
import { AccessGrant, AccessRole, UserAccessVersion } from "../db/accessSchema";
import { ensureAccessRegistry } from "../services/access/registry";
import { clearSnapshotCache } from "../services/access/snapshotCache";
import { clearHomeCache } from "../services/home/buildHomeOverview";
import { addDaysYmd, kigaliParts } from "../services/reminders/time";
import { weekStart } from "../services/safeguarding";
import { createUser, signToken } from "../test/fixtures";

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const today = kigaliParts(new Date()).ymd;
const slot = () => 900_000_000 + Math.floor(Math.random() * 90_000_000);

const home = (userId: number) =>
  request(app).get("/home/overview").query({ refresh: "1" }).set("Authorization", `Bearer ${signToken(userId)}`);
const items = async (userId: number) => {
  const res = await home(userId);
  expect(res.status).toBe(200);
  return res.body.data as { items: any[]; tiles: any[] };
};
const kinds = (d: { items: any[] }) => d.items.map((i) => i.kind);

async function grant(userId: number, preset: string) {
  const [role] = await db.select().from(AccessRole).where(eq(AccessRole.preset_key, preset)).limit(1);
  await db.insert(AccessGrant).values({ user_id: userId, role_id: role.role_id, scope_type: "SCHOOL", source: "MANUAL", status: "ACTIVE" } as any);
  await db
    .update(UserAccessVersion)
    .set({ access_version: sql`${UserAccessVersion.access_version} + 1` })
    .where(eq(UserAccessVersion.user_id, userId));
}

let lead: number, manager: number, teacher: number, coverer: number, student: number, atRisk: number, parent: number, child: number;
const users: number[] = [];

beforeAll(async () => {
  await ensureAccessRegistry();
  clearSnapshotCache();
  clearHomeCache();
  lead = await createUser({ userType: "STAFF" });
  manager = await createUser({ userType: "STAFF" });
  teacher = await createUser({ userType: "TEACHER" });
  coverer = await createUser({ userType: "TEACHER" });
  student = await createUser({ userType: "STUDENT" });
  atRisk = await createUser({ userType: "STUDENT" });
  parent = await createUser({ userType: "PARENT" });
  child = await createUser({ userType: "STUDENT" });
  users.push(lead, manager, teacher, coverer, student, atRisk, parent, child);
  await grant(lead, "safeguarding_lead");
  await grant(manager, "deputy_head_academics");
});

afterAll(async () => {
  const list = sql.join(users.map((i) => sql`${i}`), sql`, `);
  await db.execute(sql`DELETE FROM SafeguardingConcern WHERE student_id IN (${list})`);
  await db.execute(sql`DELETE FROM WellbeingCheckIn WHERE student_id IN (${list})`);
  await db.execute(sql`DELETE c FROM CoverLesson c JOIN StaffAbsence a ON a.absence_id = c.absence_id WHERE a.teacher_id IN (${list})`);
  await db.execute(sql`DELETE FROM StaffAbsence WHERE teacher_id IN (${list})`);
  await db.execute(sql`DELETE FROM EarlyWarningIntervention WHERE student_id IN (${list})`);
  await db.execute(sql`DELETE FROM StudentSignal WHERE student_id IN (${list})`);
  await db.execute(sql`DELETE FROM Parenting WHERE parent_id IN (${list})`);
  await db.execute(sql`DELETE FROM AccessGrant WHERE user_id IN (${list})`);
  clearSnapshotCache();
});

describe("Home: safeguarding", () => {
  it("asks the safeguarding team to acknowledge new concerns, by count only", async () => {
    await db.execute(sql`
      INSERT INTO SafeguardingConcern (student_id, source, category, severity, status, summary, created_at, updated_at)
      VALUES (${student}, 'student', 'unsafe', 'high', 'new', 'Secret words the page must not show', UTC_TIMESTAMP(), UTC_TIMESTAMP()),
             (${student}, 'staff', 'bullying', 'medium', 'acknowledged', 'Another', UTC_TIMESTAMP(), UTC_TIMESTAMP())`);
    await db.execute(sql`
      INSERT INTO SafeguardingConcern (student_id, source, category, severity, status, summary, assigned_to, created_at, updated_at)
      VALUES (${student}, 'staff', 'health', 'medium', 'in_progress', 'Mine', ${lead}, UTC_TIMESTAMP(), UTC_TIMESTAMP())`);
    const d = await items(lead);
    const fresh = d.items.find((i) => i.kind === "SG-01");
    expect(fresh).toMatchObject({ tier: "blocking", depth: "summary", entities: [], cta: { href: "/safeguarding" } });
    expect(fresh.count).toBeGreaterThanOrEqual(1);
    expect(d.items.find((i) => i.kind === "SG-02")).toMatchObject({ count: 1, tier: "slipping" });
    expect(d.tiles.find((t) => t.id === "mis:safeguarding:open")).toMatchObject({ status: "critical" });
    expect(JSON.stringify(d)).not.toContain("Secret words");
  });

  it("shows nothing about concerns to a teacher outside the team", async () => {
    const d = await items(teacher);
    expect(kinds(d)).not.toContain("SG-01");
    expect(d.tiles.some((t) => t.id === "mis:safeguarding:open")).toBe(false);
  });

  it("reminds a student of this week's check-in until it is done", async () => {
    expect(kinds(await items(student))).toContain("SG-S1");
    await db.execute(sql`
      INSERT INTO WellbeingCheckIn (student_id, week_start, mood, safe, wants_talk, comment, created_at)
      VALUES (${student}, ${weekStart()}, 4, 5, 0, NULL, UTC_TIMESTAMP())`);
    expect(kinds(await items(student))).not.toContain("SG-S1");
    // Not a student: never asked.
    expect(kinds(await items(teacher))).not.toContain("SG-S1");
  });
});

describe("Home: staff cover", () => {
  it("asks a cover manager to decide absences and cover tomorrow's lessons", async () => {
    await db.execute(sql`
      INSERT INTO StaffAbsence (teacher_id, from_date, to_date, reason, status, reported_by, created_at)
      VALUES (${teacher}, ${addDaysYmd(today, 1)}, ${addDaysYmd(today, 2)}, 'sick', 'pending', ${teacher}, UTC_TIMESTAMP())`);
    const res: any = await db.execute(sql`
      INSERT INTO StaffAbsence (teacher_id, from_date, to_date, reason, status, reported_by, created_at)
      VALUES (${teacher}, ${addDaysYmd(today, 1)}, ${addDaysYmd(today, 1)}, 'training', 'approved', ${teacher}, UTC_TIMESTAMP())`);
    const absenceId = Number((Array.isArray(res) ? res[0] : res).insertId);
    await db.execute(sql`
      INSERT INTO CoverLesson (absence_id, slot_id, lesson_date, start_time, end_time, subject_name, class_name, status, created_at)
      VALUES (${absenceId}, ${slot()}, ${addDaysYmd(today, 1)}, '08:00', '08:40', 'Physics', 'S4 A', 'open', UTC_TIMESTAMP())`);
    const d = await items(manager);
    expect(d.items.find((i) => i.kind === "CV-01")).toMatchObject({ tier: "blocking", cta: { href: "/cover" } });
    const cover = d.items.find((i) => i.kind === "CV-02");
    expect(cover.tier).toBe("blocking");
    expect(cover.entities.join(" ")).toContain("Physics · S4 A · tomorrow 08:00");
    expect(kinds(await items(teacher))).not.toContain("CV-01");
  });

  it("tells a teacher which lessons they are covering", async () => {
    const res: any = await db.execute(sql`
      INSERT INTO StaffAbsence (teacher_id, from_date, to_date, reason, status, reported_by, created_at)
      VALUES (${manager}, ${today}, ${today}, 'official', 'approved', ${manager}, UTC_TIMESTAMP())`);
    const absenceId = Number((Array.isArray(res) ? res[0] : res).insertId);
    await db.execute(sql`
      INSERT INTO CoverLesson (absence_id, slot_id, lesson_date, start_time, end_time, subject_name, class_name, location, cover_teacher_id, status, created_at)
      VALUES (${absenceId}, ${slot()}, ${today}, '23:58', '23:59', 'Chemistry', 'S5 B', 'Lab 2', ${coverer}, 'assigned', UTC_TIMESTAMP())`);
    const mine = (await items(coverer)).items.find((i) => i.kind === "CV-03");
    expect(mine).toMatchObject({ tier: "slipping", count: 1, title: "You're covering 1 lesson today" });
    expect(mine.entities[0]).toContain("Chemistry · S5 B");
    expect(kinds(await items(teacher))).not.toContain("CV-03");
  });
});

describe("Home: early warning", () => {
  it("names at-risk students with no plan, and reviews that are due", async () => {
    await db.execute(sql`
      INSERT INTO StudentSignal (student_id, source, metrics, as_of, updated_at)
      VALUES (${atRisk}, 'taskmentor', ${JSON.stringify({ due_14d: 6, missed_14d: 5, avg_pct_30d: 30 })}, ${today}, UTC_TIMESTAMP())`);
    await db.execute(sql`
      INSERT INTO EarlyWarningIntervention (student_id, action, owner_id, created_by, review_date, status, created_at, updated_at)
      VALUES (${student}, 'talk_student', ${manager}, ${manager}, ${addDaysYmd(today, -2)}, 'open', UTC_TIMESTAMP(), UTC_TIMESTAMP())`);
    const d = await items(manager);
    const ew = d.items.find((i) => i.kind === "EW-01");
    expect(ew).toMatchObject({ tier: "slipping", depth: "detail", cta: { href: "/early-warning" } });
    const [name] = rows(await db.execute(sql`SELECT CONCAT(first_name, ' ', last_name) AS n FROM UserProfile WHERE user_id = ${atRisk}`));
    expect(ew.entities.some((e: string) => e.startsWith(name.n))).toBe(true);
    expect(d.items.find((i) => i.kind === "EW-02")).toMatchObject({ tier: "blocking", count: 1 });
    expect(d.tiles.find((t) => t.id === "mis:early-warning:at-risk")?.status).toBe("critical");
    expect(kinds(await items(teacher))).not.toContain("EW-01");
  });
});

describe("Home: families", () => {
  it("tells a parent when a child needs a word, with a tile per child", async () => {
    await db.insert(Parenting).values({ parent_id: parent, student_id: child } as any);
    await db.execute(sql`
      INSERT INTO StudentSignal (student_id, source, metrics, as_of, updated_at)
      VALUES (${child}, 'tendo', ${JSON.stringify({ absences_14d: 4, lates_14d: 0, incidents_30d: 0 })}, ${today}, UTC_TIMESTAMP())`);
    const d = await items(parent);
    const fam = d.items.find((i) => i.kind === "FAM-01");
    expect(fam).toMatchObject({ tier: "slipping", lens: "CHILDREN", cta: { href: "/family" } });
    expect(fam.why).toContain("missed 4 lessons");
    expect(d.tiles.find((t) => t.id === `mis:family:${child}`)).toMatchObject({ value: "Needs a word", status: "warning" });
    // Another parent sees nothing of this child.
    const stranger = await createUser({ userType: "PARENT" });
    users.push(stranger);
    expect(kinds(await items(stranger))).not.toContain("FAM-01");
  });
});
