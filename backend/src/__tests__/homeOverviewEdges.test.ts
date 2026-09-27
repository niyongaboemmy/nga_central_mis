import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { and, eq, sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { AcademicTerm, AcademicYear, LessonNote, SchemeOfWorkEntry, UserProfile } from "../db/schema";
import { AccessAudit, AccessGrant, AccessRole, UserAccessVersion } from "../db/accessSchema";
import { ensureAccessRegistry } from "../services/access/registry";
import { clearSnapshotCache } from "../services/access/snapshotCache";
import { clearHomeCache } from "../services/home/buildHomeOverview";
import {
  assignRole,
  createProgramGradeClassGroupDetailed,
  createProgramLead,
  createRoleWithPermissions,
  createSchemeOfWork,
  createSchemeOfWorkEntry,
  createSubject,
  createTeacherSubjectAssignment,
  createUser,
  signToken,
} from "../test/fixtures";

/**
 * Home, edges and scale: missing periods, the one-minute cache, audited
 * preview, a programme with a large validation queue, nameless people, and a
 * relay that must never be steered to an arbitrary host.
 */

let yearId: number;
let termId: number;

const home = (userId: number, q: Record<string, string> = {}) =>
  request(app)
    .get("/home/overview")
    .query({ academic_year_id: yearId, academic_term_id: termId, ...q })
    .set("Authorization", `Bearer ${signToken(userId)}`);

beforeAll(async () => {
  clearHomeCache();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [y] = (await db.insert(AcademicYear).values({
    name: `EdgeYear_${Date.now()}`,
    start_date: iso(new Date(Date.now() - 100 * 86_400_000)),
    end_date: iso(new Date(Date.now() + 100 * 86_400_000)),
    is_current: 0,
  } as any)) as any;
  yearId = y.insertId;
  const [t] = (await db.insert(AcademicTerm).values({
    academic_year_id: yearId,
    name: `EdgeTerm_${Date.now()}`,
    start_date: iso(new Date(Date.now() - 50 * 86_400_000)),
    end_date: iso(new Date(Date.now() + 50 * 86_400_000)),
    is_current: 0,
  } as any)) as any;
  termId = t.insertId;
});

describe("Home edges", () => {
  it("answers calmly when the requested period does not exist", async () => {
    const teacher = await createUser({ userType: "TEACHER" });
    const res = await request(app)
      .get("/home/overview")
      .query({ academic_year_id: 99999999, academic_term_id: 99999999, refresh: "1" })
      .set("Authorization", `Bearer ${signToken(teacher)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.period).toMatchObject({ academic_term_id: null, week_of_term: null });
    expect(res.body.data.today.lessons).toEqual([]);
  });

  it("rejects malformed ids instead of guessing", async () => {
    const teacher = await createUser({ userType: "TEACHER" });
    const res = await request(app)
      .get("/home/overview")
      .query({ academic_term_id: "1; DROP TABLE User" })
      .set("Authorization", `Bearer ${signToken(teacher)}`);
    expect(res.status).toBe(400);
  });

  it("gives a student with no class this year an empty, working Home", async () => {
    const student = await createUser({ userType: "STUDENT" });
    const res = await home(student, { refresh: "1" });
    expect(res.status).toBe(200);
    expect(res.body.data.lenses.map((l: any) => l.key)).toEqual(["SELF"]);
    expect(res.body.data.today.lessons).toEqual([]);
  });

  it("serves the one-minute cache, and recomputes on refresh", async () => {
    const teacher = await createUser({ userType: "TEACHER" });
    await assignRole(teacher, await createRoleWithPermissions("edge-notes", ["MANAGE_LESSON_NOTES"]));
    const g = await createProgramGradeClassGroupDetailed();
    const s = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacher, subjectId: s, classGroupId: g.classGroupId, academicYearId: yearId });
    const note = () =>
      db.insert(LessonNote).values({ user_id: teacher, subject_id: s, class_group_id: g.classGroupId, academic_term_id: termId, title: "Draft", status: "DRAFT" } as any);
    await note();
    const count = (body: any) => body.data.items.find((i: any) => i.kind === "T-16")?.count ?? 0;
    expect(count((await home(teacher, { refresh: "1" })).body)).toBe(1);
    await note();
    expect(count((await home(teacher)).body)).toBe(1); // cached
    expect(count((await home(teacher, { refresh: "1" })).body)).toBe(2); // recomputed
  });

  it("names people without a profile name by their username, never 'undefined'", async () => {
    const lead = await createUser({ userType: "TEACHER" });
    await assignRole(lead, await createRoleWithPermissions("edge-lead", ["VALIDATE_SCHEME_OF_WORK"]));
    const g = await createProgramGradeClassGroupDetailed();
    await createProgramLead({ userId: lead, programId: g.programId, academicYearId: yearId });
    const nameless = await createUser({ userType: "TEACHER" });
    await db.update(UserProfile).set({ first_name: null, last_name: null } as any).where(eq(UserProfile.user_id, nameless));
    const id = await createSchemeOfWork({ userId: nameless, subjectId: await createSubject(), classGroupId: g.classGroupId, academicTermId: termId });
    await createSchemeOfWorkEntry(id);
    await db.update(SchemeOfWorkEntry).set({ validation_status: "PENDING" } as any).where(eq(SchemeOfWorkEntry.scheme_id, id));
    const body = (await home(lead, { refresh: "1" })).body.data;
    const p01 = body.items.find((i: any) => i.kind === "P-01");
    expect(p01.entities.join(" ")).not.toMatch(/undefined|null/);
    expect(p01.entities[0]).toMatch(/user_/); // fixture usernames
  });

  it("stays fast and bounded with a large validation queue", async () => {
    const lead = await createUser({ userType: "TEACHER" });
    await assignRole(lead, await createRoleWithPermissions("edge-biglead", ["VALIDATE_SCHEME_OF_WORK"]));
    const g = await createProgramGradeClassGroupDetailed();
    await createProgramLead({ userId: lead, programId: g.programId, academicYearId: yearId });
    const author = await createUser({ userType: "TEACHER" });
    const subject = await createSubject();
    for (let i = 0; i < 150; i++) {
      const id = await createSchemeOfWork({ userId: author, subjectId: subject, classGroupId: g.classGroupId, academicTermId: termId });
      await createSchemeOfWorkEntry(id);
      await db.update(SchemeOfWorkEntry).set({ validation_status: "PENDING" } as any).where(eq(SchemeOfWorkEntry.scheme_id, id));
    }
    const t0 = Date.now();
    const body = (await home(lead, { refresh: "1" })).body.data;
    const ms = Date.now() - t0;
    const p01 = body.items.find((i: any) => i.kind === "P-01");
    expect(p01.count).toBe(150);
    expect(p01.entities.length).toBeLessThanOrEqual(6);
    expect(ms).toBeLessThan(3000);
  }, 60_000);
});

describe("Home preview and relay safety", () => {
  it("lets someone with ACCESS_PREVIEW_AS preview another Home, read-only and audited", async () => {
    await ensureAccessRegistry();
    clearSnapshotCache();
    const it = await createUser({ userType: "ADMIN" });
    const [role] = await db.select().from(AccessRole).where(eq(AccessRole.preset_key, "it_support")).limit(1);
    await db.insert(AccessGrant).values({ user_id: it, role_id: role.role_id, scope_type: "SCHOOL", source: "MANUAL", status: "ACTIVE" } as any);
    await db
      .update(UserAccessVersion)
      .set({ access_version: sql`${UserAccessVersion.access_version} + 1` })
      .where(eq(UserAccessVersion.user_id, it));
    const target = await createUser({ userType: "STUDENT" });
    const res = await home(it, { as: String(target), refresh: "1" });
    expect(res.status).toBe(200);
    expect(res.body.data.viewer).toMatchObject({ user_id: target, preview_of: target });
    const audit = await db
      .select()
      .from(AccessAudit)
      .where(and(eq(AccessAudit.actor_id, it), eq(AccessAudit.subject_user_id, target), eq(AccessAudit.action, "preview.as")));
    expect(audit.length).toBe(1);
  });

  it("never lets the path choose where the relay goes", async () => {
    const user = await createUser({ userType: "STUDENT" });
    for (const source of ["evil.example", "..%2F..%2Fadmin", "taskmentor%00"]) {
      const res = await request(app)
        .post(`/home/apps/${source}/summary`)
        .set("Authorization", `Bearer ${signToken(user)}`);
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) expect(res.body.data.status).toBe("unavailable");
    }
  });
});
