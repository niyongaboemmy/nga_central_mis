import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import {
  AcademicCalendar,
  CalendarSlot,
  Subject,
  StudentClassGroup,
} from "../db/schema";
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

// Every timetable read (teacher my-calendar, student-calendar, the admin /
// attendance-sync slots list, upcoming-lesson reminders) must only show
// *live* lessons: an active slot, on an active calendar, teaching an ACTIVE
// subject, backed by a current assignment / enrolment. Disabling a subject
// used to leave its slots on everyone's timetable next to the replacement
// subject's, which read as duplicated lessons on the teacher dashboard.
describe("Calendar live-lesson rules", () => {
  let adminToken: string;
  let academicYearId: number;
  let academicTermId: number;
  let classGroupId: number;
  let calendarId: number;
  let liveSubjectId: number;
  let teacherId: number;
  let teacherToken: string;

  const createCalendar = async (groupId: number, name: string) => {
    const res = await request(app)
      .post("/calendar/calendars")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        academic_year_id: academicYearId,
        academic_term_id: academicTermId,
        class_group_id: groupId,
        name,
      });
    expect(res.status).toBe(200);
    return res.body.data.calendar_id as number;
  };

  const createSlot = async (params: {
    calendarId: number;
    subjectId: number;
    userId: number;
    day: number;
    start: string;
    end: string;
  }) => {
    const res = await request(app)
      .post("/calendar/slots")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        calendar_id: params.calendarId,
        subject_id: params.subjectId,
        user_id: params.userId,
        day_of_week: params.day,
        start_time: params.start,
        end_time: params.end,
      });
    expect(res.status).toBe(201);
    return res.body.data.slot_id as number;
  };

  const myCalendar = async (token = teacherToken) => {
    const res = await request(app)
      .get("/calendar/my-calendar")
      .query({ academic_term_id: academicTermId })
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    return res.body.data.slots as any[];
  };

  beforeAll(async () => {
    const adminId = await createUser({ userType: "ADMIN" });
    const adminRole = await createRoleWithPermissions("live-cal-admin", [
      "MANAGE_ACADEMIC_CALENDAR",
      "VIEW_ACADEMIC_CALENDAR",
      "CREATE_ACADEMIC_CALENDAR",
      "UPDATE_CALENDAR_SLOT",
      "MANAGE_ACADEMICS",
    ]);
    await assignRole(adminId, adminRole);
    adminToken = signToken(adminId);

    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    academicTermId = period.academicTermId;

    const chain = await createProgramGradeClassGroupDetailed();
    classGroupId = chain.classGroupId;
    calendarId = await createCalendar(classGroupId, "Live Lessons Calendar");

    liveSubjectId = await createSubject();
    teacherId = await createUser({ userType: "TEACHER" });
    const teacherRole = await createRoleWithPermissions("live-cal-teacher", [
      "VIEW_MY_CALENDAR",
    ]);
    await assignRole(teacherId, teacherRole);
    teacherToken = signToken(teacherId);
    await createTeacherSubjectAssignment({
      userId: teacherId,
      subjectId: liveSubjectId,
      classGroupId,
      academicYearId,
    });
    await createSlot({
      calendarId,
      subjectId: liveSubjectId,
      userId: teacherId,
      day: 1,
      start: "08:00",
      end: "08:50",
    });
  });

  it("hides a disabled subject's lessons from the teacher and admin timetables", async () => {
    const retiredSubjectId = await createSubject();
    await createTeacherSubjectAssignment({
      userId: teacherId,
      subjectId: retiredSubjectId,
      classGroupId,
      academicYearId,
    });
    const retiredSlotId = await createSlot({
      calendarId,
      subjectId: retiredSubjectId,
      userId: teacherId,
      day: 2,
      start: "08:00",
      end: "08:50",
    });

    // Visible while the subject is live.
    expect((await myCalendar()).some((s) => s.slot_id === retiredSlotId)).toBe(
      true,
    );

    // The academics "delete subject" path soft-deletes to DISABLED.
    await db
      .update(Subject)
      .set({ status: "DISABLED" })
      .where(eq(Subject.subject_id, retiredSubjectId));

    const teacherSlots = await myCalendar();
    expect(teacherSlots.some((s) => s.slot_id === retiredSlotId)).toBe(false);
    // ...and the live subject is still there: this is a filter, not a wipe.
    expect(teacherSlots.some((s) => s.subject_id === liveSubjectId)).toBe(true);

    const adminRes = await request(app)
      .get("/calendar/slots")
      .query({ calendar_id: calendarId })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data.some((s: any) => s.slot_id === retiredSlotId)).toBe(
      false,
    );
  });

  it("lets a new slot take over the timeslot of a disabled subject's slot instead of 409ing", async () => {
    const retiredSubjectId = await createSubject();
    const retiredSlotId = await createSlot({
      calendarId,
      subjectId: retiredSubjectId,
      userId: teacherId,
      day: 3,
      start: "09:00",
      end: "09:50",
    });
    await db
      .update(Subject)
      .set({ status: "DISABLED" })
      .where(eq(Subject.subject_id, retiredSubjectId));

    // The hidden row must not block the cell it no longer draws in.
    const replacement = await request(app)
      .post("/calendar/slots")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        calendar_id: calendarId,
        subject_id: liveSubjectId,
        user_id: teacherId,
        day_of_week: 3,
        start_time: "09:00",
        end_time: "09:50",
      });
    expect(replacement.status).toBe(201);
    // Revived in place (same unique_slot key), now teaching the live subject.
    expect(replacement.body.data.slot_id).toBe(retiredSlotId);
    const [row] = await db
      .select({ subject_id: CalendarSlot.subject_id })
      .from(CalendarSlot)
      .where(eq(CalendarSlot.slot_id, retiredSlotId));
    expect(row.subject_id).toBe(liveSubjectId);
  });

  it("hides every lesson on a calendar that has been deactivated", async () => {
    const { classGroupId: offGroup } =
      await createProgramGradeClassGroupDetailed();
    await createTeacherSubjectAssignment({
      userId: teacherId,
      subjectId: liveSubjectId,
      classGroupId: offGroup,
      academicYearId,
    });
    const offCalendarId = await createCalendar(offGroup, "Deactivated");
    const slotId = await createSlot({
      calendarId: offCalendarId,
      subjectId: liveSubjectId,
      userId: teacherId,
      day: 4,
      start: "10:00",
      end: "10:50",
    });
    expect((await myCalendar()).some((s) => s.slot_id === slotId)).toBe(true);

    const off = await request(app)
      .put(`/calendar/calendars/${offCalendarId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ is_active: 0 });
    expect(off.status).toBe(200);

    expect((await myCalendar()).some((s) => s.slot_id === slotId)).toBe(false);
  });

  it("draws a lesson once when a drifted duplicate row resolves to the same cell", async () => {
    const { classGroupId: driftGroup } =
      await createProgramGradeClassGroupDetailed();
    await createTeacherSubjectAssignment({
      userId: teacherId,
      subjectId: liveSubjectId,
      classGroupId: driftGroup,
      academicYearId,
    });
    const driftCalendarId = await createCalendar(driftGroup, "Drift");
    const goodSlotId = await createSlot({
      calendarId: driftCalendarId,
      subjectId: liveSubjectId,
      userId: teacherId,
      day: 5,
      start: "11:00",
      end: "11:50",
    });

    // A second row for the same lesson, written by the old path with a
    // stale term/class group copy -- unique_slot lets it through because it
    // is keyed on those denormalised columns.
    const otherPeriod = await createAcademicPeriod();
    const [dup] = (await db.insert(CalendarSlot).values({
      calendar_id: driftCalendarId,
      academic_term_id: otherPeriod.academicTermId,
      class_group_id: classGroupId,
      subject_id: liveSubjectId,
      user_id: teacherId,
      day_of_week: 5,
      start_time: "11:00",
      end_time: "11:50",
      is_active: 1,
    })) as any;
    const dupSlotId = dup.insertId as number;

    const cell = (await myCalendar()).filter(
      (s) => s.class_group_id === driftGroup && s.day_of_week === 5,
    );
    expect(cell).toHaveLength(1);
    // The row whose own columns agree with its calendar wins.
    expect(cell[0].slot_id).toBe(goodSlotId);
    expect(cell[0].slot_id).not.toBe(dupSlotId);
  });

  it("moves live slots to the new teacher when an assignment is reassigned", async () => {
    const { classGroupId: handGroup } =
      await createProgramGradeClassGroupDetailed();
    const handCalendarId = await createCalendar(handGroup, "Handover");
    const oldTeacherId = await createUser({ userType: "TEACHER" });
    const newTeacherId = await createUser({ userType: "TEACHER" });
    const teacherRole = await createRoleWithPermissions("handover-teacher", [
      "VIEW_MY_CALENDAR",
    ]);
    await assignRole(oldTeacherId, teacherRole);
    await assignRole(newTeacherId, teacherRole);
    await createTeacherSubjectAssignment({
      userId: oldTeacherId,
      subjectId: liveSubjectId,
      classGroupId: handGroup,
      academicYearId,
    });
    const slotId = await createSlot({
      calendarId: handCalendarId,
      subjectId: liveSubjectId,
      userId: oldTeacherId,
      day: 1,
      start: "14:00",
      end: "14:50",
    });

    const res = await request(app)
      .put("/academics/teachers/assignment")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        current_user_id: oldTeacherId,
        current_subject_id: liveSubjectId,
        current_class_group_id: handGroup,
        current_academic_year_id: academicYearId,
        user_id: newTeacherId,
        subject_id: liveSubjectId,
        class_group_id: handGroup,
        academic_year_id: academicYearId,
      });
    expect(res.status).toBe(200);

    const [row] = await db
      .select({ user_id: CalendarSlot.user_id })
      .from(CalendarSlot)
      .where(eq(CalendarSlot.slot_id, slotId));
    expect(row.user_id).toBe(newTeacherId);

    const newTeacherSlots = await myCalendar(signToken(newTeacherId));
    expect(newTeacherSlots.some((s) => s.slot_id === slotId)).toBe(true);
    const oldTeacherSlots = await myCalendar(signToken(oldTeacherId));
    expect(oldTeacherSlots.some((s) => s.slot_id === slotId)).toBe(false);
  });

  describe("student calendar", () => {
    let studentId: number;
    let studentToken: string;

    beforeAll(async () => {
      studentId = await createUser({ userType: "STUDENT" });
      const studentRole = await createRoleWithPermissions("live-cal-student", [
        "VIEW_STUDENT_CALENDAR",
      ]);
      await assignRole(studentId, studentRole);
      studentToken = signToken(studentId);
      await createStudentClassGroup({
        userId: studentId,
        classGroupId,
        academicYearId,
      });
      await createStudentSubjectEnrollment({
        userId: studentId,
        subjectId: liveSubjectId,
        academicYearId,
      });
    });

    const studentCalendar = async () => {
      const res = await request(app)
        .get("/calendar/student-calendar")
        .query({ academic_term_id: academicTermId })
        .set("Authorization", `Bearer ${studentToken}`);
      expect(res.status).toBe(200);
      return res.body.data.slots as any[];
    };

    it("shows the enrolled live lesson and hides a disabled subject's", async () => {
      const retiredSubjectId = await createSubject();
      await createStudentSubjectEnrollment({
        userId: studentId,
        subjectId: retiredSubjectId,
        academicYearId,
      });
      const retiredSlotId = await createSlot({
        calendarId,
        subjectId: retiredSubjectId,
        userId: teacherId,
        day: 1,
        start: "15:00",
        end: "15:50",
      });
      expect(
        (await studentCalendar()).some((s) => s.slot_id === retiredSlotId),
      ).toBe(true);

      await db
        .update(Subject)
        .set({ status: "DISABLED" })
        .where(eq(Subject.subject_id, retiredSubjectId));

      const slots = await studentCalendar();
      expect(slots.some((s) => s.slot_id === retiredSlotId)).toBe(false);
      expect(slots.some((s) => s.subject_id === liveSubjectId)).toBe(true);
    });

    it("ignores a class group the student sat in during another academic year", async () => {
      // Last year's group, still ACTIVE on its own year row, has a calendar
      // this term teaching the same subject -- before the year scope that
      // lesson appeared on the student's timetable as a second copy.
      const otherPeriod = await createAcademicPeriod();
      const { classGroupId: lastYearGroup } =
        await createProgramGradeClassGroupDetailed();
      await db.insert(StudentClassGroup).values({
        user_id: studentId,
        class_group_id: lastYearGroup,
        academic_year_id: otherPeriod.academicYearId,
        status: "ACTIVE",
      });
      const lastYearCalendarId = await createCalendar(
        lastYearGroup,
        "Last year's group",
      );
      const leakSlotId = await createSlot({
        calendarId: lastYearCalendarId,
        subjectId: liveSubjectId,
        userId: teacherId,
        day: 1,
        start: "08:00",
        end: "08:50",
      });

      const slots = await studentCalendar();
      expect(slots.some((s) => s.slot_id === leakSlotId)).toBe(false);
      const monday8 = slots.filter(
        (s) => s.day_of_week === 1 && s.start_time === "08:00",
      );
      expect(monday8).toHaveLength(1);
      expect(monday8[0].class_group_id).toBe(classGroupId);
    });

    it("hides lessons on a deactivated calendar", async () => {
      // Deactivating the student's own calendar empties their timetable for
      // the term; re-enable afterwards so later assertions aren't affected.
      await db
        .update(AcademicCalendar)
        .set({ is_active: 0 })
        .where(eq(AcademicCalendar.calendar_id, calendarId));
      try {
        const slots = await studentCalendar();
        expect(slots.filter((s) => s.calendar_id === calendarId)).toHaveLength(
          0,
        );
      } finally {
        await db
          .update(AcademicCalendar)
          .set({ is_active: 1 })
          .where(eq(AcademicCalendar.calendar_id, calendarId));
      }
    });
  });
});
