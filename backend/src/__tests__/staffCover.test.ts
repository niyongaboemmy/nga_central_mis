// Staff absence and cover (services/staffCover.ts, routes/staffCover.ts) against
// the test database (migration 114). Timetables are supplied through
// setLessonSource (the test DB's calendar data is not stable enough).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { createUser } from "../test/fixtures";
import { staffCoverRouter } from "../routes/staffCover";
import { datesBetween, overlaps, rankCandidates, setLessonSource, type LessonOnDate } from "../services/staffCover";

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));

let absent: number, free1: number, free2: number, busy: number, boss: number;
const managers = new Set<number>();
// A far-future week so no real data collides: Mon 2031-03-03 .. Fri 2031-03-07.
const MON = "2031-03-03";
const TUE = "2031-03-04";
const lesson = (slot: number, date: string, start: string, end: string, extra: Partial<LessonOnDate> = {}): LessonOnDate => ({
  slot_id: slot, date, start, end, subject_id: 501, subject_name: "Mathematics", class_group_id: 601, class_name: "S2 A", location: "B3", ...extra,
});
let timetable: Record<number, LessonOnDate[]> = {};

const app = express();
app.use(express.json());
app.use(
  "/cover",
  staffCoverRouter(
    (req: any, res, next) => {
      const id = Number(req.get("X-Test-User"));
      if (!id) return res.status(401).end();
      req.user = { userId: id };
      next();
    },
    (req: any, res, next) => (managers.has(Number(req.user.userId)) ? next() : res.status(403).json({ message: "Forbidden" })),
    async (req: any) => managers.has(Number(req.user.userId)),
  ),
);
const as = (id: number) => ({ "X-Test-User": String(id) });

beforeAll(async () => {
  absent = await createUser({ userType: "TEACHER" });
  free1 = await createUser({ userType: "TEACHER" });
  free2 = await createUser({ userType: "TEACHER" });
  busy = await createUser({ userType: "TEACHER" });
  boss = await createUser({ userType: "ADMIN" });
  managers.add(boss);
  timetable = {
    [absent]: [lesson(9001, MON, "08:00", "08:40"), lesson(9002, MON, "10:00", "10:40", { subject_name: "Physics", subject_id: 502 }), lesson(9003, TUE, "08:00", "08:40")],
    [busy]: [lesson(9100, MON, "08:20", "09:00", { class_group_id: 602, class_name: "S3 B" })],
    [free1]: [],
    [free2]: [],
  };
  setLessonSource(async (teacherId, from, to) => (timetable[teacherId] ?? []).filter((l) => l.date >= from && l.date <= to));
});

afterAll(async () => {
  setLessonSource(null);
  const list = sql.join([absent, free1, free2, busy, boss].map((i) => sql`${i}`), sql`, `);
  await db.execute(sql`DELETE c FROM CoverLesson c JOIN StaffAbsence a ON a.absence_id = c.absence_id WHERE a.teacher_id IN (${list})`);
  await db.execute(sql`DELETE FROM StaffAbsence WHERE teacher_id IN (${list})`);
  await db.execute(sql`DELETE FROM Notification WHERE user_id IN (${list})`);
});

describe("cover rules", () => {
  it("dates and overlaps", () => {
    expect(datesBetween(MON, "2031-03-05")).toEqual([MON, TUE, "2031-03-05"]);
    expect(overlaps("08:00", "08:40", "08:20", "09:00")).toBe(true);
    expect(overlaps("08:00", "08:40", "08:40", "09:20")).toBe(false);
    expect(overlaps("08:00", null, "08:30", null)).toBe(true); // a missing end counts 40 min
  });

  it("ranks free colleagues: subject, then class, then fewest covers", () => {
    const r = rankCandidates([
      { teacherId: 1, name: "Busy", busy: true, sameSubject: true, teachesClass: true, coversThisWeek: 0 },
      { teacherId: 2, name: "Bea", busy: false, sameSubject: false, teachesClass: false, coversThisWeek: 0 },
      { teacherId: 3, name: "Cal", busy: false, sameSubject: true, teachesClass: false, coversThisWeek: 2 },
      { teacherId: 4, name: "Dee", busy: false, sameSubject: true, teachesClass: true, coversThisWeek: 1 },
    ]);
    expect(r.map((s) => s.name)).toEqual(["Dee", "Cal", "Bea"]);
    expect(r[0].reasons).toEqual(["Teaches this subject", "Teaches this class", "1 cover this week"]);
  });
});

describe("absence → approval → cover", () => {
  let absenceId = 0;

  it("a teacher reports an absence; managers are told; bad input is refused", async () => {
    expect((await request(app).post("/cover/absences").set(as(absent)).send({ from: TUE, to: MON, reason: "sick" })).status).toBe(400);
    expect((await request(app).post("/cover/absences").set(as(absent)).send({ from: MON, to: TUE, reason: "holiday!" })).status).toBe(400);
    const r = await request(app).post("/cover/absences").set(as(absent)).send({ from: MON, to: TUE, reason: "sick", note: "Doctor's appointment" });
    expect(r.status).toBe(201);
    absenceId = r.body.data.id;
    expect((await request(app).post("/cover/absences").set(as(absent)).send({ from: TUE, to: TUE, reason: "sick" })).status).toBe(400); // overlaps
    const mine = await request(app).get("/cover/mine").set(as(absent));
    expect(mine.body.data.absences[0]).toMatchObject({ id: absenceId, status: "pending", from: MON, to: TUE });
    expect(mine.body.data.canManage).toBe(false);
  });

  it("only managers see the board and decide; approval creates one cover lesson per lesson", async () => {
    expect((await request(app).get("/cover/board").set(as(free1))).status).toBe(403);
    const before = await request(app).get(`/cover/board?from=${MON}`).set(as(boss));
    expect(before.body.data.pending.find((p: any) => p.id === absenceId)).toMatchObject({ lessons: 3, reason: "sick" });
    const ok = await request(app).post(`/cover/absences/${absenceId}/decision`).set(as(boss)).send({ approve: true });
    expect(ok.body.data).toEqual({ created: 3 });
    expect((await request(app).post(`/cover/absences/${absenceId}/decision`).set(as(boss)).send({ approve: true })).status).toBe(400);
    const board = await request(app).get(`/cover/board?from=${MON}`).set(as(boss));
    const mine = board.body.data.lessons.filter((l: any) => l.absenceId === absenceId);
    expect(mine.map((l: any) => [l.date, l.start, l.subject, l.status])).toEqual([
      [MON, "08:00", "Mathematics", "open"],
      [MON, "10:00", "Physics", "open"],
      [TUE, "08:00", "Mathematics", "open"],
    ]);
    const [note] = rows(await db.execute(sql`SELECT title FROM Notification WHERE user_id = ${absent} AND kind = 'staff_cover'`));
    expect(note.title).toBe("Your absence was approved");
  });

  it("suggests free colleagues only, assigns one and tells them; a busy teacher is refused", async () => {
    const board = await request(app).get(`/cover/board?from=${MON}`).set(as(boss));
    const first = board.body.data.lessons.find((l: any) => l.absenceId === absenceId && l.date === MON && l.start === "08:00");
    const sug = await request(app).get(`/cover/lessons/${first.id}/suggestions`).set(as(boss));
    const sugIds = sug.body.data.map((s: any) => s.teacherId);
    // The test DB has many other (free) teachers, so ours may be outside the top 10.
    expect(sugIds.length).toBeGreaterThan(0);
    expect(sug.body.data[0].reasons.length).toBeGreaterThan(0);
    expect(sugIds).not.toContain(busy); // teaching 08:20-09:00
    expect(sugIds).not.toContain(absent);
    expect((await request(app).post(`/cover/lessons/${first.id}/assign`).set(as(boss)).send({ teacherId: busy })).status).toBe(400);
    const a = await request(app).post(`/cover/lessons/${first.id}/assign`).set(as(boss)).send({ teacherId: free1, note: "Worksheet on the desk" });
    expect(a.body.data).toMatchObject({ status: "assigned", coverTeacherId: free1 });
    const [n] = rows(await db.execute(sql`SELECT title, body FROM Notification WHERE user_id = ${free1} AND kind = 'staff_cover'`));
    expect(n.title).toBe("Cover: Mathematics with S2 A");
    expect(n.body).toContain("08:00–08:40 · B3 · Worksheet on the desk");
    // Now free1 is busy at that time for any other cover.
    const mine = await request(app).get("/cover/mine").set(as(free1));
    expect(mine.body.data.covers[0]).toMatchObject({ subject: "Mathematics", className: "S2 A", note: "Worksheet on the desk" });
  });

  it("withdrawing the absence removes its cover and tells the cover teacher", async () => {
    expect((await request(app).post(`/cover/absences/${absenceId}/cancel`).set(as(free2))).status).toBe(403);
    const r = await request(app).post(`/cover/absences/${absenceId}/cancel`).set(as(absent));
    expect(r.status).toBe(200);
    const [left] = rows(await db.execute(sql`SELECT COUNT(*) AS n FROM CoverLesson WHERE absence_id = ${absenceId}`));
    expect(Number(left.n)).toBe(0);
    const titles = rows(await db.execute(sql`SELECT title FROM Notification WHERE user_id = ${free1} AND kind = 'staff_cover'`)).map((x: any) => x.title);
    expect(titles).toContain("Cover no longer needed");
  });

  it("a manager can record an absence for a teacher; it is approved at once", async () => {
    const r = await request(app).post("/cover/absences").set(as(boss)).send({ teacherId: absent, from: TUE, to: TUE, reason: "training" });
    expect(r.status).toBe(201);
    const [a] = rows(await db.execute(sql`SELECT status FROM StaffAbsence WHERE absence_id = ${r.body.data.id}`));
    expect(a.status).toBe("approved");
    const [c] = rows(await db.execute(sql`SELECT COUNT(*) AS n FROM CoverLesson WHERE absence_id = ${r.body.data.id}`));
    expect(Number(c.n)).toBe(1);
  });
});
