import { ClassGroupOverviewRow } from "../../api/classGroups";
import { Lens } from "./ClassGroupsContext";

export interface ReadinessCheck {
  key: string;
  label: string;
  /** Fails when the class group is not ready on this dimension. */
  ok: boolean;
  detail: string;
  /** Where an admin goes to fix it. */
  lens: Lens;
}

/**
 * The six things that have to be true before a class group is ready to teach.
 * Shared by the navigator (which shows the failure count) and the setup
 * checklist (which lists them and deep-links each one) so the two can never
 * disagree about what "incomplete" means.
 */
export const checksFor = (row: ClassGroupOverviewRow): ReadinessCheck[] => [
  {
    key: "students",
    label: "Has students",
    ok: row.student_count > 0,
    detail:
      row.student_count > 0
        ? `${row.student_count} student${row.student_count === 1 ? "" : "s"}`
        : "No students assigned for this year",
    lens: "students",
  },
  {
    key: "curriculum",
    label: "Grade has a curriculum",
    ok: row.curriculum_subject_count > 0,
    detail:
      row.curriculum_subject_count > 0
        ? `${row.curriculum_subject_count} subject${
            row.curriculum_subject_count === 1 ? "" : "s"
          }`
        : "No subjects in this grade's curriculum",
    lens: "subjects",
  },
  {
    key: "class-teacher",
    label: "Has a class teacher",
    ok: row.class_teacher !== null,
    detail: row.class_teacher
      ? [row.class_teacher.first_name, row.class_teacher.last_name]
          .filter(Boolean)
          .join(" ")
      : "No class teacher assigned",
    lens: "teachers",
  },
  {
    key: "coverage",
    label: "Every subject is taught",
    ok:
      row.curriculum_subject_count > 0 &&
      row.taught_subject_count >= row.curriculum_subject_count,
    detail: `${row.taught_subject_count}/${row.curriculum_subject_count} subjects staffed`,
    lens: "teachers",
  },
  {
    key: "enrollment",
    label: "Students hold the full curriculum",
    ok:
      row.student_count > 0 &&
      row.fully_enrolled_student_count >= row.student_count,
    detail: `${row.fully_enrolled_student_count}/${row.student_count} fully enrolled`,
    lens: "enrollments",
  },
];

export const failedChecks = (row: ClassGroupOverviewRow) =>
  checksFor(row).filter((c) => !c.ok);

export const isIncomplete = (row: ClassGroupOverviewRow) =>
  failedChecks(row).length > 0;

/** 0..1 -- how much of a class group's setup is done. */
export const readinessRatio = (row: ClassGroupOverviewRow) => {
  const checks = checksFor(row);
  return checks.filter((c) => c.ok).length / checks.length;
};
