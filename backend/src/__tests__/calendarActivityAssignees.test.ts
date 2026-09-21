import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  createStudentClassGroup,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";

// A custom activity (non-subject event) can optionally be assigned to staff.
// Assigned activities then show on each assignee's own schedule via
// GET /calendar/my-calendar, next to their lessons — and nobody else's.
describe("Calendar activity assignees", () => {
  let adminToken: string;
  let teacherAToken: string;
  let teacherAId: number;
  let teacherBId: number;
  let teacherBToken: string;
  let academicTermId: number;
  let academicYearId: number;
  let classGroupId: number;

  const activityBody = (over: Record<string, unknown> = {}) => ({
    academic_term_id: academicTermId,
    class_group_id: classGroupId,
    activity_name: "Physical Education",
    activity_type: "Sports",
    day_of_week: 4,
    start_time: "15:30",
    end_time: "16:20",
    color: "#F59E0B",
    is_recurring: 1,
    ...over,
  });

  beforeAll(async () => {
    const adminId = await createUser({ userType: "ADMIN" });
    const adminRole = await createRoleWithPermissions("activity-admin", [
      "MANAGE_ACADEMIC_CALENDAR",
      "VIEW_ACADEMIC_CALENDAR",
    ]);
    await assignRole(adminId, adminRole);
    adminToken = signToken(adminId);

    const teacherRole = await createRoleWithPermissions("activity-teacher", [
      "VIEW_MY_CALENDAR",
    ]);
    teacherAId = await createUser({ userType: "TEACHER" });
    await assignRole(teacherAId, teacherRole);
    teacherAToken = signToken(teacherAId);
    teacherBId = await createUser({ userType: "TEACHER" });
    await assignRole(teacherBId, teacherRole);
    teacherBToken = signToken(teacherBId);

    const period = await createAcademicPeriod();
    academicTermId = period.academicTermId;
    academicYearId = period.academicYearId;
    classGroupId = (await createProgramGradeClassGroupDetailed()).classGroupId;
  });

  it("shows a student their class group's and school-wide events, not another group's", async () => {
    const studentRole = await createRoleWithPermissions("activity-student", [
      "VIEW_STUDENT_CALENDAR",
    ]);
    const studentId = await createUser({ userType: "STUDENT" });
    await assignRole(studentId, studentRole);
    await createStudentClassGroup({
      userId: studentId,
      classGroupId,
      academicYearId,
    });
    const otherGroup = (await createProgramGradeClassGroupDetailed())
      .classGroupId;

    const post = (body: Record<string, unknown>) =>
      request(app)
        .post("/calendar/activities")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(activityBody(body));
    const own = await post({ activity_name: "Student Led clubs", day_of_week: 5 });
    const schoolWide = await post({
      class_group_id: null,
      activity_name: "Sports Afternoon",
      day_of_week: 3,
    });
    const theirs = await post({ class_group_id: otherGroup, day_of_week: 2 });
    const otherTerm = await post({
      academic_term_id: (await createAcademicPeriod()).academicTermId,
    });

    const res = await request(app)
      .get("/calendar/student-calendar")
      .set("Authorization", `Bearer ${studentId ? signToken(studentId) : ""}`)
      .query({ academic_term_id: academicTermId });
    expect(res.status).toBe(200);
    const ids = res.body.data.activities.map((a: any) => a.activity_id);
    expect(ids).toContain(own.body.data.activity_id);
    expect(ids).toContain(schoolWide.body.data.activity_id);
    expect(ids).not.toContain(theirs.body.data.activity_id);
    expect(ids).not.toContain(otherTerm.body.data.activity_id);
    // no staff assignment needed for a student to see it
    const clubs = res.body.data.activities.find(
      (a: any) => a.activity_id === own.body.data.activity_id,
    );
    expect(clubs).toMatchObject({ activity_name: "Student Led clubs", assignees: [] });
  });

  it("creates an activity with no assignees (assignment is optional)", async () => {
    const res = await request(app)
      .post("/calendar/activities")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(activityBody({ activity_name: "Morning Devotion" }));
    expect(res.status).toBe(201);

    const list = await request(app)
      .get("/calendar/activities")
      .set("Authorization", `Bearer ${adminToken}`)
      .query({ academic_term_id: academicTermId });
    const created = list.body.data.find(
      (a: any) => a.activity_id === res.body.data.activity_id,
    );
    expect(created.assignees).toEqual([]);
  });

  it("stores assignees on create and returns them with the activity", async () => {
    const res = await request(app)
      .post("/calendar/activities")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(activityBody({ assigned_user_ids: [teacherAId, teacherAId] }));
    expect(res.status).toBe(201);

    const list = await request(app)
      .get("/calendar/activities")
      .set("Authorization", `Bearer ${adminToken}`)
      .query({ academic_term_id: academicTermId });
    const created = list.body.data.find(
      (a: any) => a.activity_id === res.body.data.activity_id,
    );
    // duplicated id in the request is stored once
    expect(created.assignees.map((u: any) => u.user_id)).toEqual([teacherAId]);
    expect(created.assignees[0]).toMatchObject({ first_name: "Test" });
  });

  it("shows an assigned activity on the assignee's my-calendar and nobody else's", async () => {
    const created = await request(app)
      .post("/calendar/activities")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(
        activityBody({
          activity_name: "Student Led clubs",
          day_of_week: 5,
          start_time: "11:40",
          end_time: "12:30",
          assigned_user_ids: [teacherAId],
        }),
      );
    const activityId = created.body.data.activity_id;

    const mine = await request(app)
      .get("/calendar/my-calendar")
      .set("Authorization", `Bearer ${teacherAToken}`)
      .query({ academic_term_id: academicTermId });
    expect(mine.status).toBe(200);
    const ids = mine.body.data.activities.map((a: any) => a.activity_id);
    expect(ids).toContain(activityId);
    const activity = mine.body.data.activities.find(
      (a: any) => a.activity_id === activityId,
    );
    expect(activity).toMatchObject({
      activity_name: "Student Led clubs",
      day_of_week: 5,
      start_time: "11:40",
      class_group_id: classGroupId,
    });
    expect(activity.assignees.map((u: any) => u.user_id)).toEqual([teacherAId]);

    const theirs = await request(app)
      .get("/calendar/my-calendar")
      .set("Authorization", `Bearer ${teacherBToken}`)
      .query({ academic_term_id: academicTermId });
    expect(theirs.status).toBe(200);
    expect(
      theirs.body.data.activities.map((a: any) => a.activity_id),
    ).not.toContain(activityId);
  });

  it("scopes my-calendar activities by term and by class-group filter", async () => {
    const otherTerm = (await createAcademicPeriod()).academicTermId;
    const otherGroup = (await createProgramGradeClassGroupDetailed())
      .classGroupId;
    const inOtherTerm = await request(app)
      .post("/calendar/activities")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(
        activityBody({
          academic_term_id: otherTerm,
          assigned_user_ids: [teacherAId],
        }),
      );
    const inOtherGroup = await request(app)
      .post("/calendar/activities")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(
        activityBody({
          class_group_id: otherGroup,
          day_of_week: 2,
          assigned_user_ids: [teacherAId],
        }),
      );
    const schoolWide = await request(app)
      .post("/calendar/activities")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(
        activityBody({
          class_group_id: null,
          activity_name: "Staff meeting",
          day_of_week: 3,
          assigned_user_ids: [teacherAId],
        }),
      );

    const unfiltered = await request(app)
      .get("/calendar/my-calendar")
      .set("Authorization", `Bearer ${teacherAToken}`)
      .query({ academic_term_id: academicTermId });
    const allIds = unfiltered.body.data.activities.map((a: any) => a.activity_id);
    expect(allIds).not.toContain(inOtherTerm.body.data.activity_id);
    expect(allIds).toContain(inOtherGroup.body.data.activity_id);
    expect(allIds).toContain(schoolWide.body.data.activity_id);

    const filtered = await request(app)
      .get("/calendar/my-calendar")
      .set("Authorization", `Bearer ${teacherAToken}`)
      .query({ academic_term_id: academicTermId, class_group_id: classGroupId });
    const filteredIds = filtered.body.data.activities.map(
      (a: any) => a.activity_id,
    );
    expect(filteredIds).not.toContain(inOtherGroup.body.data.activity_id);
    // school-wide events have no group and stay visible under any filter
    expect(filteredIds).toContain(schoolWide.body.data.activity_id);
  });

  it("replaces the assignee set on update, and leaves it alone when not sent", async () => {
    const created = await request(app)
      .post("/calendar/activities")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(activityBody({ assigned_user_ids: [teacherAId] }));
    const activityId = created.body.data.activity_id;

    // a partial update without assigned_user_ids keeps teacher A
    await request(app)
      .put(`/calendar/activities/${activityId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ color: "#EF4444" })
      .expect(200);
    let mine = await request(app)
      .get("/calendar/my-calendar")
      .set("Authorization", `Bearer ${teacherAToken}`)
      .query({ academic_term_id: academicTermId });
    expect(
      mine.body.data.activities.map((a: any) => a.activity_id),
    ).toContain(activityId);

    // reassigning to B removes A
    await request(app)
      .put(`/calendar/activities/${activityId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ assigned_user_ids: [teacherBId] })
      .expect(200);
    mine = await request(app)
      .get("/calendar/my-calendar")
      .set("Authorization", `Bearer ${teacherAToken}`)
      .query({ academic_term_id: academicTermId });
    expect(
      mine.body.data.activities.map((a: any) => a.activity_id),
    ).not.toContain(activityId);
    const theirs = await request(app)
      .get("/calendar/my-calendar")
      .set("Authorization", `Bearer ${teacherBToken}`)
      .query({ academic_term_id: academicTermId });
    expect(
      theirs.body.data.activities.map((a: any) => a.activity_id),
    ).toContain(activityId);

    // an empty list clears everyone
    await request(app)
      .put(`/calendar/activities/${activityId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ assigned_user_ids: [] })
      .expect(200);
    const list = await request(app)
      .get("/calendar/activities")
      .set("Authorization", `Bearer ${adminToken}`)
      .query({ academic_term_id: academicTermId });
    expect(
      list.body.data.find((a: any) => a.activity_id === activityId).assignees,
    ).toEqual([]);
  });

  it("rejects unknown or malformed assignees without creating the activity", async () => {
    const before = await request(app)
      .get("/calendar/activities")
      .set("Authorization", `Bearer ${adminToken}`)
      .query({ academic_term_id: academicTermId });

    await request(app)
      .post("/calendar/activities")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(activityBody({ assigned_user_ids: [999999999] }))
      .expect(400);
    await request(app)
      .post("/calendar/activities")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(activityBody({ assigned_user_ids: "teacherA" }))
      .expect(400);
    await request(app)
      .post("/calendar/activities")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(activityBody({ assigned_user_ids: [-1] }))
      .expect(400);

    const after = await request(app)
      .get("/calendar/activities")
      .set("Authorization", `Bearer ${adminToken}`)
      .query({ academic_term_id: academicTermId });
    expect(after.body.data.length).toBe(before.body.data.length);
  });

  it("deleting an activity removes it from the assignee's schedule", async () => {
    const created = await request(app)
      .post("/calendar/activities")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(activityBody({ assigned_user_ids: [teacherAId] }));
    const activityId = created.body.data.activity_id;

    await request(app)
      .delete(`/calendar/activities/${activityId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const mine = await request(app)
      .get("/calendar/my-calendar")
      .set("Authorization", `Bearer ${teacherAToken}`)
      .query({ academic_term_id: academicTermId });
    expect(
      mine.body.data.activities.map((a: any) => a.activity_id),
    ).not.toContain(activityId);
  });
});
