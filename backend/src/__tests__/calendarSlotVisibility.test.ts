import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { CalendarSlot } from "../db/schema";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createSubject,
  createTeacherSubjectAssignment,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";

// A slot created on a calendar has to come back from the endpoint the
// calendar grid reads (GET /calendar/slots). The admin grid asks for slots by
// academic term only and then filters client-side by calendar_id, so a slot
// whose stored term drifts from its calendar's term disappears from the grid
// while still colliding with the "already exists at this time" check on
// create -- the exact symptom reported (empty grid + 409 on re-add).
describe("Calendar slot visibility", () => {
  let adminToken: string;
  let academicYearId: number;
  let academicTermId: number;
  let otherTermId: number;
  let classGroupId: number;
  let subjectId: number;
  let teacherId: number;

  beforeAll(async () => {
    const adminId = await createUser({ userType: "ADMIN" });
    const roleId = await createRoleWithPermissions("calendar-admin", [
      "MANAGE_ACADEMIC_CALENDAR",
      "VIEW_ACADEMIC_CALENDAR",
      "CREATE_ACADEMIC_CALENDAR",
      "UPDATE_CALENDAR_SLOT",
    ]);
    await assignRole(adminId, roleId);
    adminToken = signToken(adminId);

    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    academicTermId = period.academicTermId;
    const otherPeriod = await createAcademicPeriod();
    otherTermId = otherPeriod.academicTermId;

    const chain = await createProgramGradeClassGroupDetailed();
    classGroupId = chain.classGroupId;

    subjectId = await createSubject();
    teacherId = await createUser({ userType: "TEACHER" });
    await createTeacherSubjectAssignment({
      userId: teacherId,
      subjectId,
      classGroupId,
      academicYearId,
    });
  });

  it("returns a newly created slot from GET /calendar/slots for the calendar's term", async () => {
    const calendarRes = await request(app)
      .post("/calendar/calendars")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        academic_year_id: academicYearId,
        academic_term_id: academicTermId,
        class_group_id: classGroupId,
        name: "Visibility Calendar",
      });
    expect(calendarRes.status).toBe(200);
    const calendarId = calendarRes.body.data.calendar_id;

    const slotRes = await request(app)
      .post("/calendar/slots")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        calendar_id: calendarId,
        academic_term_id: academicTermId,
        class_group_id: classGroupId,
        subject_id: subjectId,
        user_id: teacherId,
        day_of_week: 3,
        start_time: "11:00",
        end_time: "11:50",
      });
    expect(slotRes.status).toBe(201);

    const listRes = await request(app)
      .get("/calendar/slots")
      .query({ academic_term_id: academicTermId })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    const mine = listRes.body.data.filter(
      (s: any) => s.calendar_id === calendarId,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0].start_time).toBe("11:00");
  });

  it("still shows a slot whose stored term drifted from its calendar's", async () => {
    // Its own class group: one calendar per year+term+class group.
    const { classGroupId: driftClassGroupId } =
      await createProgramGradeClassGroupDetailed();

    const calendarRes = await request(app)
      .post("/calendar/calendars")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        academic_year_id: academicYearId,
        academic_term_id: academicTermId,
        class_group_id: driftClassGroupId,
        name: "Drifted Calendar",
      });
    const calendarId = calendarRes.body.data.calendar_id;

    const slotRes = await request(app)
      .post("/calendar/slots")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        calendar_id: calendarId,
        subject_id: subjectId,
        user_id: teacherId,
        day_of_week: 4,
        start_time: "13:40",
        end_time: "14:30",
      });
    expect(slotRes.status).toBe(201);

    // Reproduce a row written by the old path, which took the term and class
    // group from the request body -- so they could name something the slot's
    // calendar has nothing to do with.
    await db
      .update(CalendarSlot)
      .set({ academic_term_id: otherTermId, class_group_id: classGroupId })
      .where(eq(CalendarSlot.slot_id, slotRes.body.data.slot_id));

    // The grid asks by calendar id -- the same key the slot was written under.
    const byCalendar = await request(app)
      .get("/calendar/slots")
      .query({ calendar_id: calendarId })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(byCalendar.body.data).toHaveLength(1);
    // and it reports the calendar's term/class group, not the drifted copy
    expect(byCalendar.body.data[0].academic_term_id).toBe(academicTermId);
    expect(byCalendar.body.data[0].class_group_id).toBe(driftClassGroupId);

    // A term-filtered read must not lose it either.
    const byTerm = await request(app)
      .get("/calendar/slots")
      .query({ academic_term_id: academicTermId })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(
      byTerm.body.data.filter((s: any) => s.calendar_id === calendarId),
    ).toHaveLength(1);
  });

  it("still returns the slot when the client asks by calendar_id", async () => {
    const calendarRes = await request(app)
      .post("/calendar/calendars")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        academic_year_id: academicYearId,
        academic_term_id: otherTermId,
        class_group_id: classGroupId,
        name: "Other Term Calendar",
      });
    const calendarId = calendarRes.body.data.calendar_id;

    await request(app)
      .post("/calendar/slots")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        calendar_id: calendarId,
        subject_id: subjectId,
        user_id: teacherId,
        day_of_week: 2,
        start_time: "09:00",
        end_time: "09:50",
      });

    const listRes = await request(app)
      .get("/calendar/slots")
      .query({ calendar_id: calendarId })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].calendar_id).toBe(calendarId);
  });
});
