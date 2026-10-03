import { eq } from "drizzle-orm";
import { db } from "../db";
import { AcademicTerm, AcademicYear } from "../db/schema";
import { OfficeHourSetting } from "../db/officeHoursSchema";
import { setOfficeHoursClock } from "../services/officeHours/common";
import { invalidateSettings } from "../services/officeHours/settings";
import { kigaliInstant } from "../services/reminders/time";
import {
  assignRole,
  createProgramGradeClassGroupDetailed,
  createRoleWithPermissions,
  createStudentClassGroup,
  createSubject,
  createTeacherSubjectAssignment,
  createUser,
  signToken,
} from "./fixtures";

/**
 * A small school for office-hours tests: one term (2026-01-05 .. 2026-06-26),
 * one class group, two subject teachers, a leader, a student role and N
 * students. The module clock is pinned to Monday 2026-03-02 09:00 Kigali.
 */
export const OH_MONDAY = "2026-03-02";

export const pinClock = (ymd: string, hhmm = "09:00") => {
  const [h, m] = hhmm.split(":").map(Number);
  const at = kigaliInstant(ymd, h * 60 + m);
  setOfficeHoursClock(() => at);
  return at;
};

export const resetSettings = async () => {
  await db
    .update(OfficeHourSetting)
    .set({
      student_lock_mode: "TERM",
      allow_any_student: 0,
      band_start: "16:20",
      band_end: "17:20",
      allowed_window_start: "16:00",
      allowed_window_end: "18:00",
      default_capacity: 15,
      max_capacity: 40,
      roster_cutoff_time: "14:00",
      late_after_minutes: 10,
      register_edit_days: 7,
      auto_close_unmarked: 0,
      escalation_consecutive_l1: 2,
      escalation_month_l1: 2,
      escalation_consecutive_l2: 3,
      rate_band_consistent: 90,
      rate_band_watch: 80,
      min_sessions_for_rate: 3,
      parent_notifications: "ESCALATIONS",
      qr_checkin_enabled: 0,
    })
    .where(eq(OfficeHourSetting.id, 1));
  invalidateSettings();
};

export interface OhWorld {
  yearId: number;
  termId: number;
  programId: number;
  gradeId: number;
  classGroupId: number;
  otherClassGroupId: number;
  subjectA: number;
  subjectB: number;
  teacherA: number;
  teacherB: number;
  leader: number;
  outsider: number;
  students: number[];
  otherStudents: number[];
  tokens: Record<string, string>;
  teacherRoleId: number;
  studentRoleId: number;
}

export const createOfficeHoursWorld = async (studentCount = 6): Promise<OhWorld> => {
  // Other suites leave stale "current" rows; make this world's year/term the only current ones.
  await db.update(AcademicYear).set({ is_current: 0 });
  await db.update(AcademicTerm).set({ is_current: 0 });
  const [y] = (await db.insert(AcademicYear).values({ name: `OH Year ${Date.now()}`, start_date: "2026-01-01", end_date: "2026-12-31", is_current: 1 } as any)) as any;
  const yearId = y.insertId as number;
  const [t] = (await db.insert(AcademicTerm).values({ academic_year_id: yearId, name: "OH Term", start_date: "2026-01-05", end_date: "2026-06-26", is_current: 1 } as any)) as any;
  const termId = t.insertId as number;

  const { programId, gradeId, classGroupId } = await createProgramGradeClassGroupDetailed();
  const other = await createProgramGradeClassGroupDetailed({ programId, gradeId });

  const subjectA = await createSubject();
  const subjectB = await createSubject();

  const teacherRoleId = await createRoleWithPermissions("OH_TEACHER", ["OFFICE_HOURS_MANAGE_OWN", "TEACHER_DASHBOARD"]);
  const leaderRoleId = await createRoleWithPermissions("OH_LEADER", ["OFFICE_HOURS_MANAGE_ANY", "OFFICE_HOURS_VIEW", "OFFICE_HOURS_CONFIGURE"]);
  const studentRoleId = await createRoleWithPermissions("OH_STUDENT", ["OFFICE_HOURS_VIEW_SELF"]);

  const teacherA = await createUser({ userType: "TEACHER" });
  const teacherB = await createUser({ userType: "TEACHER" });
  const outsider = await createUser({ userType: "TEACHER" });
  const leader = await createUser({ userType: "ADMIN" });
  for (const id of [teacherA, teacherB, outsider]) await assignRole(id, teacherRoleId);
  await assignRole(leader, leaderRoleId);

  await createTeacherSubjectAssignment({ userId: teacherA, subjectId: subjectA, classGroupId, academicYearId: yearId });
  await createTeacherSubjectAssignment({ userId: teacherB, subjectId: subjectB, classGroupId, academicYearId: yearId });

  const students: number[] = [];
  for (let i = 0; i < studentCount; i++) {
    const s = await createUser({ userType: "STUDENT" });
    await assignRole(s, studentRoleId);
    await createStudentClassGroup({ userId: s, classGroupId, academicYearId: yearId });
    students.push(s);
  }
  const otherStudents: number[] = [];
  for (let i = 0; i < 2; i++) {
    const s = await createUser({ userType: "STUDENT" });
    await assignRole(s, studentRoleId);
    await createStudentClassGroup({ userId: s, classGroupId: other.classGroupId, academicYearId: yearId });
    otherStudents.push(s);
  }

  const tokens: Record<string, string> = {
    teacherA: signToken(teacherA),
    teacherB: signToken(teacherB),
    outsider: signToken(outsider),
    leader: signToken(leader),
  };
  students.forEach((s, i) => (tokens[`s${i}`] = signToken(s)));
  return {
    yearId,
    termId,
    programId,
    gradeId,
    classGroupId,
    otherClassGroupId: other.classGroupId,
    subjectA,
    subjectB,
    teacherA,
    teacherB,
    leader,
    outsider,
    students,
    otherStudents,
    tokens,
    teacherRoleId,
    studentRoleId,
  };
};
