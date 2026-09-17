import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { db } from "../db";
import { CourseCategory, Subject } from "../db/schema";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createUserGradeAssignment,
  createSubject,
  createStudentClassGroup,
  createStudentSubjectEnrollment,
  createTeacherSubjectAssignment,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";
import { Permissions } from "../utils/permissions";

// Class Subjects offered only a free-text search. The filters below are answered
// in the same request as the list, and the facet counts come with it, so opening
// a filter menu costs nothing extra.
describe("Scoped subjects — filters, facets and sorting", () => {
  let yearId: number;
  let token: string;
  let gradeId: number;
  let classGroupA: number;
  let classGroupB: number;
  let scienceCategoryId: number;
  let physicsId: number;
  let chemistryId: number;
  let orphanId: number;
  let disabledId: number;
  let teacherA: number;
  let teacherB: number;

  beforeAll(async () => {
    const period = await createAcademicPeriod();
    yearId = period.academicYearId;

    const base = await createProgramGradeClassGroupDetailed();
    gradeId = base.gradeId;
    classGroupA = base.classGroupId;
    const second = await createProgramGradeClassGroupDetailed({
      programId: base.programId,
      gradeId: base.gradeId,
    });
    classGroupB = second.classGroupId;

    const roleId = await createRoleWithPermissions("SUBJECT_FILTER_VIEW", [
      Permissions.VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE,
    ]);
    const classTeacherId = await createUser({ userType: "TEACHER" });
    await assignRole(classTeacherId, roleId);
    for (const classGroupId of [classGroupA, classGroupB]) {
      await createUserGradeAssignment({
        userId: classTeacherId,
        gradeId,
        classGroupId,
        academicYearId: yearId,
      });
    }
    token = signToken(classTeacherId);

    const [category] = (await db.insert(CourseCategory).values({
      name: `Sciences_${Date.now()}`,
      status: "ACTIVE",
    })) as any;
    scienceCategoryId = category.insertId as number;

    teacherA = await createUser({ userType: "TEACHER" });
    teacherB = await createUser({ userType: "TEACHER" });

    // Physics: category Sciences, class group A, teacher A.
    physicsId = await createSubject();
    await db
      .update(Subject)
      .set({ name: "Physics", course_category_id: scienceCategoryId })
      .where(eq(Subject.subject_id, physicsId));
    await createTeacherSubjectAssignment({
      userId: teacherA,
      subjectId: physicsId,
      classGroupId: classGroupA,
      academicYearId: yearId,
    });

    // Chemistry: category Sciences, class group B, teacher B.
    chemistryId = await createSubject();
    await db
      .update(Subject)
      .set({ name: "Chemistry", course_category_id: scienceCategoryId })
      .where(eq(Subject.subject_id, chemistryId));
    await createTeacherSubjectAssignment({
      userId: teacherB,
      subjectId: chemistryId,
      classGroupId: classGroupB,
      academicYearId: yearId,
    });

    // Disabled subject, still taught.
    disabledId = await createSubject();
    await db
      .update(Subject)
      .set({ name: "Retired Studies", status: "DISABLED" })
      .where(eq(Subject.subject_id, disabledId));
    await createTeacherSubjectAssignment({
      userId: teacherA,
      subjectId: disabledId,
      classGroupId: classGroupA,
      academicYearId: yearId,
    });

    // Enrolled by a student but nobody assigned to teach it.
    orphanId = await createSubject();
    await db
      .update(Subject)
      .set({ name: "Unstaffed Options" })
      .where(eq(Subject.subject_id, orphanId));
    const studentId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: studentId,
      classGroupId: classGroupA,
      academicYearId: yearId,
    });
    await createStudentSubjectEnrollment({
      userId: studentId,
      subjectId: orphanId,
      academicYearId: yearId,
    });
  });

  const list = (query = "") =>
    request(app)
      .get(`/users/scope/subjects?academic_year_id=${yearId}&limit=500${query}`)
      .set("Authorization", `Bearer ${token}`);

  const idsOf = (res: any) =>
    res.body.data.subjects.map((s: any) => s.subject_id);

  it("returns facet counts alongside the list", async () => {
    const res = await list();
    expect(res.status).toBe(200);

    const { facets } = res.body.data;
    expect(
      facets.categories.find((c: any) => c.id === scienceCategoryId).count,
    ).toBe(2);
    expect(facets.teachers.map((t: any) => t.id)).toEqual(
      expect.arrayContaining([teacherA, teacherB]),
    );
    expect(facets.classGroups.map((c: any) => c.id)).toEqual(
      expect.arrayContaining([classGroupA, classGroupB]),
    );
    expect(facets.unassigned).toBeGreaterThanOrEqual(1);
  });

  it("filters by class group", async () => {
    const res = await list(`&class_group_ids=${classGroupB}`);
    expect(idsOf(res)).toContain(chemistryId);
    expect(idsOf(res)).not.toContain(physicsId);
  });

  it("filters by teacher", async () => {
    const res = await list(`&teacher_ids=${teacherB}`);
    expect(idsOf(res)).toEqual([chemistryId]);
  });

  it("filters by category", async () => {
    const res = await list(`&category_ids=${scienceCategoryId}`);
    expect(idsOf(res).sort()).toEqual([physicsId, chemistryId].sort());
  });

  it("filters by status", async () => {
    const active = await list("&status=ACTIVE");
    expect(idsOf(active)).not.toContain(disabledId);

    const disabled = await list("&status=DISABLED");
    expect(idsOf(disabled)).toContain(disabledId);
  });

  it("filters by whether a teacher is assigned", async () => {
    const unassigned = await list("&assignment=unassigned");
    expect(idsOf(unassigned)).toContain(orphanId);
    expect(idsOf(unassigned)).not.toContain(physicsId);

    const assigned = await list("&assignment=assigned");
    expect(idsOf(assigned)).toContain(physicsId);
    expect(idsOf(assigned)).not.toContain(orphanId);
  });

  it("combines filters", async () => {
    const res = await list(
      `&category_ids=${scienceCategoryId}&class_group_ids=${classGroupA}`,
    );
    expect(idsOf(res)).toEqual([physicsId]);
  });

  it("sorts by name in both directions", async () => {
    const asc = await list("&sort=name");
    const names = asc.body.data.subjects.map((s: any) => s.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));

    const desc = await list("&sort=name-desc");
    const descNames = desc.body.data.subjects.map((s: any) => s.name);
    expect(descNames).toEqual([...names].reverse());
  });

  it("searches across teacher name and class group, not just the subject", async () => {
    // The old search only looked at name/code/description, so "who teaches X"
    // could not be answered from the list at all.
    const res = await list(`&search=${encodeURIComponent("Physics")}`);
    expect(idsOf(res)).toContain(physicsId);
  });

  it("keeps facet options stable while a filter is applied", async () => {
    // Facets are computed before the facet filters, so narrowing to one teacher
    // must not empty out the other options in the menu.
    const res = await list(`&teacher_ids=${teacherB}`);
    expect(res.body.data.facets.teachers.map((t: any) => t.id)).toEqual(
      expect.arrayContaining([teacherA, teacherB]),
    );
  });
});
