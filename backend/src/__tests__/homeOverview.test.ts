import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { AcademicTerm, AcademicYear, MenteeCheckIn, MentorAssignment, SchemeOfWorkEntry } from "../db/schema";
import { AccessGrant, AccessRole, UserAccessVersion } from "../db/accessSchema";
import { ensureAccessRegistry } from "../services/access/registry";
import { clearSnapshotCache } from "../services/access/snapshotCache";
import { clearHomeCache } from "../services/home/buildHomeOverview";
import {
  assignRole,
  createAcademicPeriod,
  createCalendarSlot,
  createProgramGradeClassGroupDetailed,
  createProgramLead,
  createRoleWithPermissions,
  createSchemeOfWork,
  createSchemeOfWorkEntry,
  createStudentClassGroup,
  createStudentSubjectEnrollment,
  createSubject,
  createTeacherSubjectAssignment,
  createUser,
  createUserGradeAssignment,
  signToken,
} from "../test/fixtures";

/**
 * Home (HOME_OVERVIEW_IMPLEMENTATION_PLAN.md): one page, every module, and
 * every user level seeing exactly its own lenses -- a teacher never gets a
 * school lens, a programme lead only their programme, a summary-depth viewer
 * never a name.
 */

let yearId: number;
let termId: number;
let progA: { programId: number; gradeId: number; classGroupId: number };
let progB: { programId: number; gradeId: number; classGroupId: number };
let maths: number;
let physics: number;
let untaughtSubject: number;

let teacher: number;
let student: number;
let lead: number;
let admin: number;
let classTeacher: number;
let mentor: number;

const todayDow = new Date().getDay();

const home = (userId: number, extra: Record<string, string> = {}) =>
  request(app)
    .get("/home/overview")
    .query({ academic_year_id: yearId, academic_term_id: termId, refresh: "1", ...extra })
    .set("Authorization", `Bearer ${signToken(userId)}`);

const lensKeys = (body: any) => body.lenses.map((l: any) => l.key);
const kinds = (body: any) => body.items.map((i: any) => i.kind);

beforeAll(async () => {
  clearHomeCache();
  // A term that is running today (the shared fixture term ended in June).
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [y] = (await db.insert(AcademicYear).values({
    name: `HomeYear_${Date.now()}`,
    start_date: iso(new Date(Date.now() - 200 * 86_400_000)),
    end_date: iso(new Date(Date.now() + 200 * 86_400_000)),
    is_current: 0,
  } as any)) as any;
  yearId = y.insertId;
  const [t] = (await db.insert(AcademicTerm).values({
    academic_year_id: yearId,
    name: `HomeTerm_${Date.now()}`,
    start_date: iso(new Date(Date.now() - 60 * 86_400_000)),
    end_date: iso(new Date(Date.now() + 60 * 86_400_000)),
    is_current: 0,
  } as any)) as any;
  termId = t.insertId;
  progA = await createProgramGradeClassGroupDetailed();
  progB = await createProgramGradeClassGroupDetailed();
  maths = await createSubject();
  physics = await createSubject();
  untaughtSubject = await createSubject();
  // The grade's curriculum: maths, physics and one subject nobody teaches.
  for (const s of [maths, physics, untaughtSubject]) {
    await db.execute(sql`INSERT INTO GradeSubject (grade_id, subject_id) VALUES (${progA.gradeId}, ${s})`);
  }

  // Teacher: teaches maths + physics in class A, has a lesson today, no schemes yet.
  teacher = await createUser({ userType: "TEACHER" });
  await assignRole(
    teacher,
    await createRoleWithPermissions("home-teacher", ["TEACHER_DASHBOARD", "SUBMIT_REPORTING", "MANAGE_LESSON_NOTES"]),
  );
  for (const subjectId of [maths, physics]) {
    await createTeacherSubjectAssignment({ userId: teacher, subjectId, classGroupId: progA.classGroupId, academicYearId: yearId });
  }
  await createCalendarSlot({
    userId: teacher,
    subjectId: maths,
    classGroupId: progA.classGroupId,
    academicTermId: termId,
    dayOfWeek: todayDow,
    startTime: "00:05",
    endTime: "00:10",
  });

  // Student in class A, enrolled in maths.
  student = await createUser({ userType: "STUDENT" });
  await assignRole(student, await createRoleWithPermissions("home-student", ["SUBMIT_MENTEE_CHECKIN"]));
  await createStudentClassGroup({ userId: student, classGroupId: progA.classGroupId, academicYearId: yearId });
  await createStudentSubjectEnrollment({ userId: student, subjectId: maths, academicYearId: yearId });

  // A scheme awaiting validation in each programme.
  for (const cg of [progA.classGroupId, progB.classGroupId]) {
    const schemeId = await createSchemeOfWork({ userId: teacher, subjectId: physics, classGroupId: cg, academicTermId: termId });
    await createSchemeOfWorkEntry(schemeId);
    await db
      .update(SchemeOfWorkEntry)
      .set({ validation_status: "PENDING" } as any)
      .where(eq(SchemeOfWorkEntry.scheme_id, schemeId));
  }

  // Programme lead of programme A with validation rights.
  lead = await createUser({ userType: "TEACHER" });
  await assignRole(lead, await createRoleWithPermissions("home-lead", ["VALIDATE_SCHEME_OF_WORK", "VIEW_PROGRAM_ACADEMICS"]));
  await createProgramLead({ userId: lead, programId: progA.programId, academicYearId: yearId });

  // School administrator: enrolment rights, no placements.
  admin = await createUser({ userType: "ADMIN" });
  await assignRole(admin, await createRoleWithPermissions("home-admin", ["MANAGE_USERS", "ASSIGN_STUDENT_CLASS_GROUPS"]));
  // An active student with no class this year.
  await createUser({ userType: "STUDENT" });

  // Class teacher of class A.
  classTeacher = await createUser({ userType: "TEACHER" });
  await assignRole(classTeacher, await createRoleWithPermissions("home-ct", ["VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE", "MANAGE_ACADEMIC_CALENDAR"]));
  await createUserGradeAssignment({ userId: classTeacher, gradeId: progA.gradeId, classGroupId: progA.classGroupId, academicYearId: yearId });

  // Mentor with one mentee who sent a check-in three days ago.
  mentor = await createUser({ userType: "TEACHER" });
  await assignRole(mentor, await createRoleWithPermissions("home-mentor", ["TEACHER_DASHBOARD"]));
  await db.insert(MentorAssignment).values({ mentor_id: mentor, student_id: student, academic_year_id: yearId, status: "ACTIVE", assigned_by: admin } as any);
  await db.insert(MenteeCheckIn).values({
    student_id: student,
    mentor_id: mentor,
    academic_year_id: yearId,
    submitted_at: new Date(Date.now() - 3 * 86_400_000),
    category: "OTHER",
    title: "Need help",
    message: "Please call me",
    status: "NEW",
  } as any);
});

describe("GET /home/overview", () => {
  it("requires a session", async () => {
    expect((await request(app).get("/home/overview")).status).toBe(401);
  });

  it("gives a teacher their teaching lens, today's lessons with marks, and their paperwork", async () => {
    const res = await home(teacher);
    expect(res.status).toBe(200);
    const body = res.body.data;
    expect(lensKeys(body)).toEqual(expect.arrayContaining(["TEACHING", "SELF"]));
    expect(lensKeys(body)).not.toContain("SCHOOL");
    // Both assignments lack a scheme; teaching has started long ago -> blocking.
    const missing = body.items.find((i: any) => i.kind === "T-04");
    expect(missing).toMatchObject({ tier: "blocking", count: 1, lens: "TEACHING" });
    // Today's maths lesson (00:05-00:10) is over: no plan, report pending.
    const lesson = body.today.lessons.find((l: any) => l.subject_id === maths);
    expect(lesson).toMatchObject({ kind: "teaching", plan: "missing", report: "pending" });
    expect(kinds(body)).toContain("T-08");
    expect(body.tiles.map((t: any) => t.label)).toContain("Schemes submitted");
    expect(body.access.source).toBe("legacy");
  });

  it("gives a student their timetable and no staff lenses", async () => {
    const body = (await home(student)).body.data;
    expect(lensKeys(body)).toEqual(["SELF"]);
    expect(body.today.lessons.every((l: any) => l.kind === "learning")).toBe(true);
    expect(body.today.lessons.map((l: any) => l.subject_id)).toContain(maths);
    expect(body.items.some((i: any) => i.kind.startsWith("T-") || i.kind.startsWith("P-"))).toBe(false);
  });

  it("scopes a programme lead's validation queue to their own programme", async () => {
    const body = (await home(lead)).body.data;
    expect(lensKeys(body)).toContain(`PROGRAM:${progA.programId}`);
    expect(lensKeys(body)).not.toContain("SCHOOL");
    const queue = body.items.find((i: any) => i.kind === "P-01");
    expect(queue).toBeDefined();
    expect(queue.count).toBe(1); // programme B's scheme is not theirs
    expect(queue.lens).toBe(`PROGRAM:${progA.programId}`);
  });

  it("gives a school administrator school operations without teaching or programme lenses", async () => {
    const body = (await home(admin)).body.data;
    expect(lensKeys(body)).toContain("SCHOOL");
    expect(lensKeys(body)).not.toContain("TEACHING");
    const unplaced = body.items.find((i: any) => i.kind === "O-01");
    expect(unplaced).toBeDefined();
    expect(unplaced.depth).toBe("summary");
    expect(unplaced.entities).toEqual([]); // counts only, never names
    expect(kinds(body)).not.toContain("P-01"); // holds no validation rights
    // Learner content follows being a student, not holding student permissions.
    expect(body.tiles.map((t: any) => t.label)).not.toContain("Learning progress");
    expect(body.quick_actions.map((a: any) => a.id)).not.toContain("my-learning");
  });

  it("gives a class teacher their class, with the subject nobody teaches", async () => {
    const body = (await home(classTeacher)).body.data;
    const key = `CLASS_GROUP:${progA.classGroupId}`;
    expect(lensKeys(body)).toContain(key);
    const gap = body.items.find((i: any) => i.kind === "C-08" && i.lens === key);
    expect(gap).toBeDefined();
    expect(gap.count).toBe(1);
    expect(body.tiles.find((t: any) => t.lens === key && t.label === "Subjects with a teacher").value).toBe("2/3");
  });

  it("never widens a class teacher to the school when the selected year has no placement for them", async () => {
    const other = await createAcademicPeriod(); // a year classTeacher has no placement in
    const body = (
      await request(app)
        .get("/home/overview")
        .query({ academic_year_id: other.academicYearId, academic_term_id: other.academicTermId, refresh: "1" })
        .set("Authorization", `Bearer ${signToken(classTeacher)}`)
    ).body.data;
    expect(lensKeys(body)).not.toContain("SCHOOL");
    expect(lensKeys(body)).toEqual(["SELF"]);
  });

  it("puts a waiting mentee check-in at the top of a mentor's list", async () => {
    const body = (await home(mentor)).body.data;
    expect(lensKeys(body)).toContain("MENTEES");
    const checkin = body.items.find((i: any) => i.kind === "E-01");
    expect(checkin).toMatchObject({ tier: "blocking", count: 1 }); // waited > 48h
    expect(body.items[0].tier).toBe("blocking");
  });

  it("refuses a preview of someone else's Home without ACCESS_PREVIEW_AS", async () => {
    expect((await home(teacher, { as: String(student) })).status).toBe(403);
  });

  it("shows no lessons and no reporting nags for a term that has ended", async () => {
    const ended = await createAcademicPeriod(); // Jan-Jun 2026
    await createTeacherSubjectAssignment({ userId: teacher, subjectId: maths, classGroupId: progA.classGroupId, academicYearId: ended.academicYearId });
    await createCalendarSlot({
      userId: teacher,
      subjectId: maths,
      classGroupId: progA.classGroupId,
      academicTermId: ended.academicTermId,
      dayOfWeek: todayDow,
      startTime: "00:05",
      endTime: "00:10",
    });
    const body = (
      await request(app)
        .get("/home/overview")
        .query({ academic_year_id: ended.academicYearId, academic_term_id: ended.academicTermId, refresh: "1" })
        .set("Authorization", `Bearer ${signToken(teacher)}`)
    ).body.data;
    expect(body.today.lessons).toEqual([]);
    expect(kinds(body)).not.toContain("T-08");
    expect(kinds(body)).not.toContain("T-09");
  });

  it("orders items blocking -> slipping -> tidy", async () => {
    const body = (await home(teacher)).body.data;
    const order = { blocking: 0, slipping: 1, tidy: 2 } as Record<string, number>;
    const tiers = body.items.map((i: any) => order[i.tier]);
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
  });
});

describe("GET /home/overview with access control v2 enforced", () => {
  const prevMode = process.env.ACCESS_V2_MIS_MODE;
  let insightsViewer: number;
  let dos: number;

  const presetRole = async (key: string) =>
    (await db.select().from(AccessRole).where(eq(AccessRole.preset_key, key)).limit(1))[0].role_id;
  const grant = async (userId: number, preset: string, scopeType: string, scopeId: number | null = null) => {
    await db.insert(AccessGrant).values({
      user_id: userId,
      role_id: await presetRole(preset),
      scope_type: scopeType as any,
      scope_id: scopeId,
      source: "MANUAL",
      status: "ACTIVE",
    });
    await db
      .update(UserAccessVersion)
      .set({ access_version: sql`${UserAccessVersion.access_version} + 1` })
      .where(eq(UserAccessVersion.user_id, userId));
  };

  beforeAll(async () => {
    await ensureAccessRegistry();
    process.env.ACCESS_V2_MIS_MODE = "enforce";
    clearSnapshotCache();
    clearHomeCache();
    insightsViewer = await createUser({ userType: "ADMIN" });
    await grant(insightsViewer, "academic_insights_viewer", "SCHOOL");
    dos = await createUser({ userType: "TEACHER" });
    await grant(dos, "director_of_studies", "PROGRAM", progB.programId);
  });

  afterAll(() => {
    if (prevMode === undefined) delete process.env.ACCESS_V2_MIS_MODE;
    else process.env.ACCESS_V2_MIS_MODE = prevMode;
    clearSnapshotCache();
    clearHomeCache();
  });

  it("decides from grants: a DOS sees only their programme's validation queue", async () => {
    const body = (await home(dos)).body.data;
    expect(body.access.source).toBe("v2");
    expect(lensKeys(body)).toContain(`PROGRAM:${progB.programId}`);
    const queue = body.items.find((i: any) => i.kind === "P-01");
    expect(queue).toMatchObject({ count: 1, lens: `PROGRAM:${progB.programId}` });
    expect(queue.via.length).toBeGreaterThan(0); // explainable: the DOS grant
  });

  it("gives an insights viewer summary tiles and no named work items", async () => {
    const body = (await home(insightsViewer)).body.data;
    expect(lensKeys(body)).toContain("SCHOOL");
    expect(kinds(body)).not.toContain("P-01");
    expect(body.tiles.some((t: any) => t.metric === "curriculum.sow_validation")).toBe(true);
    for (const i of body.items) if (i.depth === "summary") expect(i.entities).toEqual([]);
  });
});
