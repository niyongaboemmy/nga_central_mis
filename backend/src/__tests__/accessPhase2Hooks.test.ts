import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { AccessGrant, AccessRole, UserAccessVersion } from "../db/accessSchema";
import {
  assignRole,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createRoleWithPermissions,
  createSubject,
  createUser,
  signToken,
} from "../test/fixtures";
import { ensureAccessRegistry } from "../services/access/registry";
import { getSnapshot } from "../services/access/snapshotCache";
import { compileSnapshot } from "../services/access/compile";
import { touchLearners } from "../services/access/ruleEngine";
import { Parenting, StudentClassGroup } from "../db/schema";

/**
 * Access control v2 -- Phase 2 placement hooks: the EXISTING screens
 * (class teachers, subject assignments, mentors, parents, users, class groups)
 * now keep grants in step, through their real HTTP endpoints.
 */

const presetRole = async (key: string) =>
  (await db.select().from(AccessRole).where(eq(AccessRole.preset_key, key)).limit(1))[0].role_id;
const grantsOf = (userId: number) => db.select().from(AccessGrant).where(eq(AccessGrant.user_id, userId));
const version = async (userId: number) =>
  (await db.select({ v: UserAccessVersion.access_version }).from(UserAccessVersion).where(eq(UserAccessVersion.user_id, userId)))[0].v;

let admin: number;
let token: string;
let yearId: number;
let chain: { programId: number; gradeId: number; classGroupId: number };

beforeAll(async () => {
  await ensureAccessRegistry();
  const role = await createRoleWithPermissions("HOOK_ADMIN", [
    "ASSIGN_GRADE_TO_CLASS_TEACHER",
    "MANAGE_ACADEMICS",
    "MANAGE_MENTOR_ASSIGNMENTS",
    "MANAGE_USERS",
  ]);
  admin = await createUser({ userType: "ADMIN" });
  await assignRole(admin, role);
  token = signToken(admin);
  yearId = (await createAcademicPeriod()).academicYearId;
  chain = await createProgramGradeClassGroupDetailed();
});

describe("existing screens keep grants in step", () => {
  it("class-teacher assign/remove creates and ends the CLASS_GROUP grant", async () => {
    const teacher = await createUser();
    const assign = await request(app)
      .post(`/users/${teacher}/grades`)
      .set("Authorization", `Bearer ${token}`)
      .send({ grade_id: chain.gradeId, class_group_id: chain.classGroupId, academic_year_id: yearId });
    expect(assign.status).toBeLessThan(300);
    const classTeacher = await presetRole("class_teacher");
    let g = (await grantsOf(teacher)).find((x) => x.role_id === classTeacher);
    expect(g).toMatchObject({ scope_type: "CLASS_GROUP", scope_id: chain.classGroupId, status: "ACTIVE", source: "RULE" });

    const remove = await request(app)
      .delete(`/users/${teacher}/grades/${chain.gradeId}/class-groups/${chain.classGroupId}/years/${yearId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(remove.status).toBeLessThan(300);
    g = (await grantsOf(teacher)).find((x) => x.role_id === classTeacher);
    expect(g?.status).toBe("ENDED");
  });

  it("subject assignment creates a SUBJECT_CLASS grant and refreshes programme leaders", async () => {
    const dos = await createUser();
    await db.insert(AccessGrant).values({
      user_id: dos, role_id: await presetRole("director_of_studies"), scope_type: "PROGRAM", scope_id: chain.programId, source: "MANUAL", status: "ACTIVE",
    });
    const dosBefore = await version(dos);

    const teacher = await createUser();
    const subjectId = await createSubject();
    const res = await request(app)
      .post("/academics/teachers/assign-subject")
      .set("Authorization", `Bearer ${token}`)
      .send({ user_id: teacher, subject_id: subjectId, class_group_id: chain.classGroupId, academic_year_id: yearId });
    expect(res.status).toBeLessThan(300);
    expect((await grantsOf(teacher)).find((x) => x.scope_type === "SUBJECT_CLASS")).toMatchObject({
      scope_id: subjectId, scope_id2: chain.classGroupId, status: "ACTIVE",
    });
    // The DOS's programme scope lists the subjects taught in it -- refreshed.
    expect(await version(dos)).toBeGreaterThan(dosBefore);
    const s = await getSnapshot(dos, "mis", { yearId });
    expect(s.caps.VIEW_RESULTS?.[0].scope.subjects).toContain(subjectId);
  });

  it("reassigning a mentee refreshes both mentors", async () => {
    const student = await createUser({ userType: "STUDENT" });
    const m1 = await createUser();
    const m2 = await createUser();
    const a1 = await request(app)
      .post("/mentorship/assignments")
      .set("Authorization", `Bearer ${token}`)
      .send({ mentor_id: m1, student_id: student, academic_year_id: yearId });
    expect(a1.status).toBe(201);
    expect((await getSnapshot(m1, "mis", { yearId })).caps.VIEW_RESULTS?.[0].scope.students).toEqual([student]);

    const m1Before = await version(m1);
    const a2 = await request(app)
      .post("/mentorship/assignments")
      .set("Authorization", `Bearer ${token}`)
      .send({ mentor_id: m2, student_id: student, academic_year_id: yearId, reassign: true });
    expect(a2.status).toBe(201);
    expect(await version(m1)).toBeGreaterThan(m1Before);
    const s1 = await getSnapshot(m1, "mis", { yearId });
    expect(s1.caps.VIEW_RESULTS?.[0]?.scope.students ?? []).toEqual([]);
    expect((await getSnapshot(m2, "mis", { yearId })).caps.VIEW_RESULTS?.[0].scope.students).toEqual([student]);
  });

  it("linking a parent gives them their child, and unlinking removes it", async () => {
    const student = await createUser({ userType: "STUDENT" });
    const parent = await createUser({ userType: "PARENT" as any });
    const link = await request(app).post("/parenting/assign").set("Authorization", `Bearer ${token}`).send({ student_id: student, parent_id: parent });
    expect(link.status).toBeLessThan(300);
    const parentRole = await presetRole("parent");
    expect((await grantsOf(parent)).find((g) => g.scope_type === "CHILDREN")).toMatchObject({ role_id: parentRole, status: "ACTIVE" });

    const unlink = await request(app).post("/parenting/remove").set("Authorization", `Bearer ${token}`).send({ student_id: student, parent_id: parent });
    expect(unlink.status).toBeLessThan(300);
    expect((await grantsOf(parent)).find((g) => g.scope_type === "CHILDREN")?.status).toBe("ENDED");
  });

  it("disabling an account empties its snapshot; enabling restores it", async () => {
    const u = await createUser();
    await db.insert(AccessGrant).values({
      user_id: u, role_id: await presetRole("counsellor"), scope_type: "SCHOOL", source: "MANUAL", status: "ACTIVE",
    });
    const dis = await request(app).put(`/users/${u}/disable`).set("Authorization", `Bearer ${token}`);
    expect(dis.status).toBe(200);
    expect(Object.keys((await getSnapshot(u, "mis")).caps)).toEqual([]);
    const en = await request(app).put(`/users/${u}/enable`).set("Authorization", `Bearer ${token}`);
    expect(en.status).toBe(200);
    expect((await getSnapshot(u, "mis")).caps.VIEW_LEADERSHIP_STRUCTURE).toBeDefined();
  });

  it("deleting a class group ends every grant anchored on it", async () => {
    const own = await createProgramGradeClassGroupDetailed();
    const holder = await createUser();
    await db.insert(AccessGrant).values({
      user_id: holder, role_id: await presetRole("class_teacher"), scope_type: "CLASS_GROUP", scope_id: own.classGroupId, source: "MANUAL", status: "ACTIVE",
    });
    const del = await request(app).delete(`/academics/class-groups/${own.classGroupId}`).set("Authorization", `Bearer ${token}`);
    expect(del.status).toBeLessThan(300);
    const [g] = await db
      .select()
      .from(AccessGrant)
      .where(and(eq(AccessGrant.user_id, holder), eq(AccessGrant.scope_id, own.classGroupId)));
    expect(g).toMatchObject({ status: "ENDED", end_reason: "class group deleted" });
  });

  it("tells apps which class a student (or a parent's child) belongs to, and refreshes both on a move", async () => {
    const student = await createUser({ userType: "STUDENT" });
    const parent = await createUser({ userType: "PARENT" as any });
    await db.insert(Parenting).values({ student_id: student, parent_id: parent });
    await db.insert(StudentClassGroup).values({ user_id: student, class_group_id: chain.classGroupId, academic_year_id: yearId, status: "ACTIVE" });

    expect((await compileSnapshot(student, "mis", { yearId })).user.class_groups).toEqual([chain.classGroupId]);
    expect((await compileSnapshot(parent, "mis", { yearId })).user.class_groups).toEqual([chain.classGroupId]);
    const teacher = await createUser();
    expect((await compileSnapshot(teacher, "mis", { yearId })).user.class_groups).toEqual([]);

    const [s0, p0] = [await version(student), await version(parent)];
    await touchLearners([student]);
    expect(await version(student)).toBeGreaterThan(s0);
    expect(await version(parent)).toBeGreaterThan(p0);
  });
});
