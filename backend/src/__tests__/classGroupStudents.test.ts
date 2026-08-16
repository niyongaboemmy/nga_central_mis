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

  beforeAll(async () => {
    const viewerId = await createUser({ userType: "ADMIN" });
    token = signToken(viewerId);

    const { academicYearId } = await createAcademicPeriod();
    classGroupId = await createProgramGradeClassGroup();
    otherClassGroupId = await createProgramGradeClassGroup();

    studentUserId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: studentUserId,
      classGroupId,
      academicYearId,
    });

    otherStudentUserId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: otherStudentUserId,
      classGroupId: otherClassGroupId,
      academicYearId,
    });
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
