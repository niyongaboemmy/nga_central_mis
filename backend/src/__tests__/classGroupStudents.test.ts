import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createStudentClassGroup,
  signToken,
} from "../test/fixtures";

// GET /academics/class-groups/:class_group_id/students -- the roster
// endpoint external SSO-linked systems (e.g. the discipline & attendance
// app) use to mark attendance per class group. Didn't exist before; nothing
// on the MIS returned "who is in this class group" in bulk.
describe("GET /academics/class-groups/:class_group_id/students", () => {
  let token: string;
  let classGroupId: number;
  let studentUserId: number;
  let otherClassGroupId: number;
  let otherStudentUserId: number;
  let thisYearId: number;
  let priorYearId: number;
  let priorCohortUserId: number;
  let staffUserId: number;

  beforeAll(async () => {
    const viewerId = await createUser({ userType: "ADMIN" });
    token = signToken(viewerId);

    const prior = await createAcademicPeriod();
    priorYearId = prior.academicYearId;
    const current = await createAcademicPeriod();
    thisYearId = current.academicYearId;

    classGroupId = await createProgramGradeClassGroup();
    otherClassGroupId = await createProgramGradeClassGroup();

    studentUserId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: studentUserId,
      classGroupId,
      academicYearId: thisYearId,
    });

    // Same class group, previous year's cohort — a class group is a
    // permanent label reused each year, so both rows coexist.
    priorCohortUserId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: priorCohortUserId,
      classGroupId,
      academicYearId: priorYearId,
    });

    // A staff account that picked up a class-group row must never show up
    // on a student roster.
    staffUserId = await createUser({ userType: "TEACHER" });
    await createStudentClassGroup({
      userId: staffUserId,
      classGroupId,
      academicYearId: thisYearId,
    });

    otherStudentUserId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: otherStudentUserId,
      classGroupId: otherClassGroupId,
      academicYearId: thisYearId,
    });
  });

  it("returns only the selected academic year's cohort", async () => {
    const res = await request(app)
      .get(`/academics/class-groups/${classGroupId}/students`)
      .query({ academic_year_id: thisYearId })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((s: any) => s.user_id);
    expect(ids).toContain(studentUserId);
    expect(ids).not.toContain(priorCohortUserId);
  });

  it("returns the prior year's cohort when that year is selected", async () => {
    const res = await request(app)
      .get(`/academics/class-groups/${classGroupId}/students`)
      .query({ academic_year_id: priorYearId })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((s: any) => s.user_id);
    expect(ids).toContain(priorCohortUserId);
    expect(ids).not.toContain(studentUserId);
  });

  it("excludes non-student accounts from the roster", async () => {
    const res = await request(app)
      .get(`/academics/class-groups/${classGroupId}/students`)
      .query({ academic_year_id: thisYearId })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((s: any) => s.user_id)).not.toContain(staffUserId);
  });

  it("400s on a non-numeric academic year id", async () => {
    const res = await request(app)
      .get(`/academics/class-groups/${classGroupId}/students`)
      .query({ academic_year_id: "not-a-year" })
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it("returns only students in the requested class group", async () => {
    const res = await request(app)
      .get(`/academics/class-groups/${classGroupId}/students`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((s: any) => s.user_id);
    expect(ids).toContain(studentUserId);
    expect(ids).not.toContain(otherStudentUserId);
  });

  it("400s on a non-numeric class group id", async () => {
    const res = await request(app)
      .get("/academics/class-groups/not-a-number/students")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});
