import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  signToken,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createSubject,
  createTeacherSubjectAssignment,
  createRoleWithPermissions,
  assignRole,
} from "../test/fixtures";

// A teacher's TeacherSubjectAssignment rows span every year they've ever
// taught. GET /academics/my-assigned-subjects?academic_term_id=X must scope
// the result to the academic year that term belongs to — otherwise pickers
// that use this endpoint (e.g. the ad-hoc lesson report modal) show subjects
// from unrelated years alongside the ones relevant to the selected period.
describe("GET /academics/my-assigned-subjects — academic year scoping", () => {
  let token: string;
  let termYearA: number;
  let termYearB: number;
  let subjectYearA: number;
  let subjectYearB: number;

  beforeAll(async () => {
    const userId = await createUser();
    token = signToken(userId);
    const roleId = await createRoleWithPermissions("teacher", ["VIEW_MY_ASSIGNED_SUBJECTS"]);
    await assignRole(userId, roleId);

    const periodA = await createAcademicPeriod();
    const periodB = await createAcademicPeriod();
    termYearA = periodA.academicTermId;
    termYearB = periodB.academicTermId;

    const classGroupA = await createProgramGradeClassGroup();
    const classGroupB = await createProgramGradeClassGroup();

    subjectYearA = await createSubject();
    subjectYearB = await createSubject();

    await createTeacherSubjectAssignment({ userId, subjectId: subjectYearA, classGroupId: classGroupA, academicYearId: periodA.academicYearId });
    await createTeacherSubjectAssignment({ userId, subjectId: subjectYearB, classGroupId: classGroupB, academicYearId: periodB.academicYearId });
  });

  it("returns only the assignment belonging to the requested term's academic year", async () => {
    const res = await request(app)
      .get("/academics/my-assigned-subjects")
      .query({ academic_term_id: termYearA })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const subjectIds = res.body.data.map((s: any) => s.subject_id);
    expect(subjectIds).toContain(subjectYearA);
    expect(subjectIds).not.toContain(subjectYearB);
  });

  it("returns the other year's assignment when queried with that year's term", async () => {
    const res = await request(app)
      .get("/academics/my-assigned-subjects")
      .query({ academic_term_id: termYearB })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const subjectIds = res.body.data.map((s: any) => s.subject_id);
    expect(subjectIds).toContain(subjectYearB);
    expect(subjectIds).not.toContain(subjectYearA);
  });

  it("returns every year's assignments when no academic_term_id is given (unfiltered, existing behavior)", async () => {
    const res = await request(app)
      .get("/academics/my-assigned-subjects")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const subjectIds = res.body.data.map((s: any) => s.subject_id);
    expect(subjectIds).toContain(subjectYearA);
    expect(subjectIds).toContain(subjectYearB);
  });
});
