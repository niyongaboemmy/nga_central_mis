import { describe, it, expect, beforeAll, afterEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { and, eq, like } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { MentorAssignment, StudentSubjectEnrollment, System, User } from "../db/schema";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createSubject,
  createTeacherSubjectAssignment,
  createStudentClassGroup,
  createStudentSubjectEnrollment,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";
import { listCourseMembers } from "../services/elearning/courseMembership";
import { setLogoutTransport } from "../services/sso/backchannelLogout";
import { parseStatusFilter } from "../services/activeUsers";

// ACTIVE_USERS_CONTRACTS.md: lists of people (rosters, pickers, recipients,
// counts) return ACTIVE users only; admin user management keeps everyone but
// defaults to ACTIVE; a disabled account loses its sessions everywhere.
//
// One class group, one subject, two students placed and enrolled identically:
// one ACTIVE, one INACTIVE. Every roster must return exactly the active one.

const ids = (rows: any[]) => rows.map((r: any) => Number(r.user_id ?? r.id));
const setStatus = (userId: number, status: "ACTIVE" | "INACTIVE" | "SUSPENDED") =>
  db.update(User).set({ status }).where(eq(User.user_id, userId));
const tokenVersionOf = async (userId: number) =>
  (await db.select({ v: User.token_version }).from(User).where(eq(User.user_id, userId)))[0].v;
const until = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
};

describe("Active users only (MIS)", () => {
  let yearId: number;
  let termId: number;
  let classGroupId: number;
  let subjectId: number;

  let teacherId: number;
  let teacherToken: string;
  let adminId: number;
  let adminToken: string;

  let activeStudent: number;
  let inactiveStudent: number;
  let droppedEnrolment: number; // active account, DISABLED subject enrolment
  let sharedRoleId: number;

  const tag = `au_${Date.now()}`;
  const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  const clientId = `${tag}_app`;

  beforeAll(async () => {
    const period = await createAcademicPeriod();
    yearId = period.academicYearId;
    termId = period.academicTermId;
    const cg = await createProgramGradeClassGroupDetailed();
    classGroupId = cg.classGroupId;
    subjectId = await createSubject();

    teacherId = await createUser({ userType: "TEACHER" });
    await assignRole(
      teacherId,
      await createRoleWithPermissions("AU_TEACHER", [
        "VIEW_SUBJECT_ENROLLED_STUDENTS",
        "VIEW_MY_STUDENTS",
        "UPLOAD_DOCUMENTS",
        "TEACHER_DASHBOARD",
      ]),
    );
    teacherToken = signToken(teacherId);
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId: yearId });

    adminId = await createUser({ userType: "ADMIN" });
    await assignRole(
      adminId,
      await createRoleWithPermissions("AU_ADMIN", [
        "MANAGE_USERS",
        "MANAGE_STUDENT_ENROLLMENTS",
        "ASSIGN_STUDENT_CLASS_GROUPS",
        "MANAGE_MENTOR_ASSIGNMENTS",
        "VIEW_SUBJECT_ENROLLED_STUDENTS",
      ]),
    );
    adminToken = signToken(adminId);

    sharedRoleId = await createRoleWithPermissions("AU_STUDENT_ROLE", []);
    activeStudent = await createUser({ userType: "STUDENT" });
    inactiveStudent = await createUser({ userType: "STUDENT" });
    droppedEnrolment = await createUser({ userType: "STUDENT" });
    for (const s of [activeStudent, inactiveStudent, droppedEnrolment]) {
      await createStudentClassGroup({ userId: s, classGroupId, academicYearId: yearId });
      await createStudentSubjectEnrollment({ userId: s, subjectId, academicYearId: yearId });
      await assignRole(s, sharedRoleId);
      await db.insert(MentorAssignment).values({
        mentor_id: teacherId,
        student_id: s,
        academic_year_id: yearId,
        status: "ACTIVE",
        assigned_by: adminId,
      });
    }
    await db
      .update(StudentSubjectEnrollment)
      .set({ status: "DISABLED" })
      .where(and(eq(StudentSubjectEnrollment.user_id, droppedEnrolment), eq(StudentSubjectEnrollment.subject_id, subjectId)));
    await setStatus(inactiveStudent, "INACTIVE");

    await db.update(System).set({ status: "DISABLED" }).where(like(System.name, "au_%"));
    await db.insert(System).values({
      name: `${tag}_app`,
      client_id: clientId,
      client_secret: "s3cret",
      icon_url: "x",
      home_url: "https://au.test",
      backchannel_logout_uri: "https://au.test/bcl",
      status: "ACTIVE",
    } as any);
  });
  afterEach(() => setLogoutTransport(null));

  // ── rosters ────────────────────────────────────────────────────────────────

  describe("rosters return the active student only", () => {
    it("subject roster (by year) also drops a DISABLED enrolment", async () => {
      const res = await request(app)
        .get(`/academics/subjects/${subjectId}/years/${yearId}/students`)
        .set("Authorization", `Bearer ${teacherToken}`);
      expect(res.status).toBe(200);
      const got = ids(res.body.data);
      expect(got).toContain(activeStudent);
      expect(got).not.toContain(inactiveStudent);
      expect(got).not.toContain(droppedEnrolment);
    });

    it("subject roster (by term)", async () => {
      const res = await request(app)
        .get(`/academics/subjects/${subjectId}/terms/${termId}/students`)
        .set("Authorization", `Bearer ${teacherToken}`);
      expect(res.status).toBe(200);
      expect(ids(res.body.data)).toEqual([activeStudent]);
    });

    it("include_inactive=1 is honoured for MANAGE_USERS only, and carries status", async () => {
      const teacher = await request(app)
        .get(`/academics/subjects/${subjectId}/years/${yearId}/students?include_inactive=1`)
        .set("Authorization", `Bearer ${teacherToken}`);
      expect(ids(teacher.body.data)).not.toContain(inactiveStudent);

      const admin = await request(app)
        .get(`/academics/subjects/${subjectId}/years/${yearId}/students?include_inactive=1`)
        .set("Authorization", `Bearer ${adminToken}`);
      const row = admin.body.data.find((r: any) => r.user_id === inactiveStudent);
      expect(row).toMatchObject({ status: "INACTIVE" });
    });

    it("my-students", async () => {
      const res = await request(app)
        .get("/academics/my-students")
        .query({ academic_year_id: yearId })
        .set("Authorization", `Bearer ${teacherToken}`);
      expect(res.status).toBe(200);
      expect(ids(res.body.data.students)).toEqual([activeStudent]);
    });

    it("class-group students", async () => {
      const res = await request(app)
        .get(`/academics/class-groups/${classGroupId}/students`)
        .query({ academic_year_id: yearId })
        .set("Authorization", `Bearer ${teacherToken}`);
      expect(res.status).toBe(200);
      const got = ids(res.body.data);
      expect(got).toContain(activeStudent);
      expect(got).toContain(droppedEnrolment); // in the class, just not the subject
      expect(got).not.toContain(inactiveStudent);
    });

    it("class-group enrollment roster", async () => {
      const res = await request(app)
        .get(`/academics/class-groups/${classGroupId}/enrollment-roster`)
        .query({ academic_year_id: yearId })
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(ids(res.body.data.students)).not.toContain(inactiveStudent);
      expect(ids(res.body.data.students)).toContain(activeStudent);
    });

    it("mentorship roster, with a disabled mentee still openable by id (history)", async () => {
      const res = await request(app)
        .get("/mentorship/students")
        .query({ academic_year_id: yearId })
        .set("Authorization", `Bearer ${teacherToken}`);
      expect(res.status).toBe(200);
      const got = ids(res.body.data);
      expect(got).toContain(activeStudent);
      expect(got).not.toContain(inactiveStudent);

      const one = await request(app)
        .get(`/mentorship/students/${inactiveStudent}`)
        .set("Authorization", `Bearer ${teacherToken}`);
      expect(one.status).toBe(200);
      expect(one.body.data.inactive).toBe(true);
    });

    it("documents role picker", async () => {
      const res = await request(app)
        .get(`/documents/roles/${sharedRoleId}/users`)
        .query({ classGroupId, academic_year_id: yearId })
        .set("Authorization", `Bearer ${teacherToken}`);
      expect(res.status).toBe(200);
      const got = ids(res.body.data.users);
      expect(got).toContain(activeStudent);
      expect(got).not.toContain(inactiveStudent);

      const unfiltered = await request(app)
        .get(`/documents/roles/${sharedRoleId}/users`)
        .set("Authorization", `Bearer ${teacherToken}`);
      expect(ids(unfiltered.body.data.users)).not.toContain(inactiveStudent);
    });

    it("e-learning course members", async () => {
      const members = await listCourseMembers({
        subject_id: subjectId,
        class_group_id: classGroupId,
        academic_term_id: termId,
      } as any);
      expect(ids(members)).toEqual([activeStudent]);
    });
  });

  // ── GET /users ─────────────────────────────────────────────────────────────

  describe("GET /users", () => {
    const usernameOf = async (id: number) =>
      (await db.select({ u: User.username }).from(User).where(eq(User.user_id, id)))[0].u;
    const find = (query: Record<string, string>) =>
      request(app).get("/users").query({ limit: 50, ...query }).set("Authorization", `Bearer ${adminToken}`);

    it("defaults to ACTIVE; status=all, INACTIVE and SUSPENDED filter; bad status is 400", async () => {
      const inactiveName = await usernameOf(inactiveStudent);
      const def = await find({ search: inactiveName });
      expect(def.status).toBe(200);
      expect(def.body.data).toHaveLength(0);

      const all = await find({ search: inactiveName, status: "all" });
      expect(all.body.data.map((u: any) => u.user.user_id)).toEqual([inactiveStudent]);
      expect(all.body.data[0].user.status).toBe("INACTIVE");

      const only = await find({ search: inactiveName, status: "INACTIVE" });
      expect(only.body.data).toHaveLength(1);
      const lower = await find({ search: inactiveName, status: "inactive" });
      expect(lower.body.data).toHaveLength(1);
      const suspended = await find({ search: inactiveName, status: "SUSPENDED" });
      expect(suspended.body.data).toHaveLength(0);

      const activeName = await usernameOf(activeStudent);
      expect((await find({ search: activeName })).body.data).toHaveLength(1);

      expect((await find({ status: "BOGUS" })).status).toBe(400);
    });

    it("parseStatusFilter", () => {
      expect(parseStatusFilter(undefined)).toBe("ACTIVE");
      expect(parseStatusFilter("")).toBe("ACTIVE");
      expect(parseStatusFilter("all")).toBeNull();
      expect(parseStatusFilter("ALL")).toBeNull();
      expect(parseStatusFilter("suspended")).toBe("SUSPENDED");
      expect(parseStatusFilter(undefined, null)).toBeNull();
      expect(() => parseStatusFilter("x")).toThrow();
    });
  });

  // ── assign validation ─────────────────────────────────────────────────────

  describe("assignment validation rejects inactive students", () => {
    it("class-group assignment", async () => {
      const res = await request(app)
        .post("/academics/students/assign-class-group")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ user_id: inactiveStudent, class_group_id: classGroupId, academic_year_id: yearId });
      expect(res.status).toBe(400);
    });

    it("mentor assignment", async () => {
      const mentor = await createUser({ userType: "TEACHER" });
      const res = await request(app)
        .post("/mentorship/assignments")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ mentor_id: mentor, student_id: inactiveStudent, academic_year_id: yearId, reassign: true });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/active/i);
    });
  });

  // ── sessions ───────────────────────────────────────────────────────────────

  describe("sessions of a non-ACTIVE account", () => {
    it("an existing token is refused with 401 ACCOUNT_INACTIVE, /auth/verify included", async () => {
      const userId = await createUser({ userType: "TEACHER" });
      const token = signToken(userId);
      expect((await request(app).get("/auth/verify").set("Authorization", `Bearer ${token}`)).status).toBe(200);

      await setStatus(userId, "SUSPENDED");
      const verify = await request(app).get("/auth/verify").set("Authorization", `Bearer ${token}`);
      expect(verify.status).toBe(401);
      expect(verify.body.code).toBe("ACCOUNT_INACTIVE");
      const me = await request(app).get("/users/me").set("Authorization", `Bearer ${token}`);
      expect(me.status).toBe(401);
      expect(me.body.code).toBe("ACCOUNT_INACTIVE");

      await setStatus(userId, "ACTIVE");
      expect((await request(app).get("/auth/verify").set("Authorization", `Bearer ${token}`)).status).toBe(200);
    });

    it("disable bumps token_version and sends a back-channel logout; enable restores", async () => {
      const calls: string[] = [];
      setLogoutTransport(async (url, body) => {
        if (url === "https://au.test/bcl") calls.push(new URLSearchParams(body).get("logout_token")!);
        return 200;
      });
      const userId = await createUser({ userType: "TEACHER" });
      const before = await tokenVersionOf(userId);
      const oldToken = jwt.sign({ userId, tokenVersion: before }, process.env.JWT_SECRET!, { expiresIn: "1h" });

      const res = await request(app).put(`/users/${userId}/disable`).set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(await tokenVersionOf(userId)).toBe(before + 1);
      await until(() => calls.length > 0);
      expect(calls).toHaveLength(1);
      expect((jwt.decode(calls[0]) as any).sub).toBe(String(userId));
      expect((await request(app).get("/auth/verify").set("Authorization", `Bearer ${oldToken}`)).status).toBe(401);

      const enable = await request(app).put(`/users/${userId}/enable`).set("Authorization", `Bearer ${adminToken}`);
      expect(enable.status).toBe(200);
      expect(await tokenVersionOf(userId)).toBe(before + 1); // no logout on enable
      const fresh = jwt.sign({ userId, tokenVersion: before + 1 }, process.env.JWT_SECRET!, { expiresIn: "1h" });
      expect((await request(app).get("/auth/verify").set("Authorization", `Bearer ${fresh}`)).status).toBe(200);
    });

    it("updateUser validates status and ends sessions when it deactivates", async () => {
      const calls: string[] = [];
      setLogoutTransport(async (url, body) => {
        if (url === "https://au.test/bcl") calls.push(new URLSearchParams(body).get("logout_token")!);
        return 200;
      });
      const userId = await createUser({ userType: "TEACHER" });
      const before = await tokenVersionOf(userId);

      const bad = await request(app).put(`/users/${userId}`).set("Authorization", `Bearer ${adminToken}`).send({ status: "DELETED" });
      expect(bad.status).toBe(400);

      const self = await request(app).put(`/users/${adminId}`).set("Authorization", `Bearer ${adminToken}`).send({ status: "INACTIVE" });
      expect(self.status).toBe(400);

      const ok = await request(app).put(`/users/${userId}`).set("Authorization", `Bearer ${adminToken}`).send({ status: "suspended" });
      expect(ok.status).toBe(200);
      const [row] = await db.select({ s: User.status, v: User.token_version }).from(User).where(eq(User.user_id, userId));
      expect(row).toEqual({ s: "SUSPENDED", v: before + 1 });
      await until(() => calls.length > 0);
      expect((jwt.decode(calls[0]) as any).sub).toBe(String(userId));

      // Re-activating through the same endpoint does not sign anyone out.
      const back = await request(app).put(`/users/${userId}`).set("Authorization", `Bearer ${adminToken}`).send({ status: "ACTIVE" });
      expect(back.status).toBe(200);
      expect(await tokenVersionOf(userId)).toBe(before + 1);
    });
  });

  // ── status for the spokes ──────────────────────────────────────────────────

  describe("status for the spokes", () => {
    it("profile-media lookup carries each user's status", async () => {
      const res = await request(app)
        .post("/users/profile-media/lookup")
        .set("Authorization", basic(clientId, "s3cret"))
        .send({ user_ids: [activeStudent, inactiveStudent, 999999999] });
      expect(res.status).toBe(200);
      const byId = new Map(res.body.data.users.map((u: any) => [u.user_id, u.status]));
      expect(byId.get(activeStudent)).toBe("ACTIVE");
      expect(byId.get(inactiveStudent)).toBe("INACTIVE");
      expect(byId.has(999999999)).toBe(false); // absent = removed
    });

    it("sync/people keeps everyone by default and filters on ?status", async () => {
      const page = (q: Record<string, unknown>) =>
        request(app)
          .get("/integrations/sync/people")
          .query({ cursor: inactiveStudent - 1, limit: 1, ...q })
          .set("Authorization", basic(clientId, "s3cret"));
      const all = await page({});
      expect(all.status).toBe(200);
      const first = JSON.stringify(all.body.data);
      expect(first).toContain(`"id":${inactiveStudent}`);
      expect(first).toContain('"status":"INACTIVE"');

      const active = await page({ status: "ACTIVE" });
      expect(active.status).toBe(200);
      expect(JSON.stringify(active.body.data)).not.toContain(`"id":${inactiveStudent},`);
      expect((await page({ status: "nope" })).status).toBe(400);
    });
  });
});
