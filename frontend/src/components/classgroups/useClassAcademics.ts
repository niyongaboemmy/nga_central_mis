import { useCallback, useEffect, useState } from "react";
import {
  gradeSubjectsApi,
  teacherSubjectAssignmentsApi,
  GradeSubject,
  AllTeacherSubjectAssignment,
} from "../../api/academics";
import {
  getAllGradeAssignments,
  AllGradeAssignment,
} from "../../api/users";
import { useClassGroups } from "./ClassGroupsContext";

export interface ClassAcademics {
  /** The selected grade's curriculum. */
  curriculum: GradeSubject[];
  /** Teacher-subject assignments for the selected class group and year. */
  assignments: AllTeacherSubjectAssignment[];
  /** The class-teacher assignment for the selected class group and year. */
  classTeacher: AllGradeAssignment | null;
  loading: boolean;
  reload: () => void;
}

/**
 * The academic side of one class group: what its grade teaches, who teaches
 * each of those subjects here, and who leads the class. The Subjects and
 * Teachers lenses both need the same three answers, so they share one fetch
 * rather than each assembling their own.
 */
export const useClassAcademics = (): ClassAcademics => {
  const { gradeId, classGroupId, academicYearId, versions } = useClassGroups();

  const [curriculum, setCurriculum] = useState<GradeSubject[]>([]);
  const [assignments, setAssignments] = useState<AllTeacherSubjectAssignment[]>(
    [],
  );
  const [classTeacher, setClassTeacher] = useState<AllGradeAssignment | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const curriculumVersion = versions.curriculum;
  const assignmentsVersion = versions.assignments;

  useEffect(() => {
    if (!gradeId || !academicYearId) {
      setCurriculum([]);
      setAssignments([]);
      setClassTeacher(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [curriculumRes, assignmentRes, classTeachers] = await Promise.all([
          gradeSubjectsApi.getByGrade(gradeId),
          teacherSubjectAssignmentsApi.getAll(academicYearId),
          getAllGradeAssignments(academicYearId).catch(() => [] as AllGradeAssignment[]),
        ]);
        if (cancelled) return;

        setCurriculum(curriculumRes.data.data ?? []);

        // getAll answers for the whole year; narrow to this class group here
        // rather than asking the server per class group.
        const forClassGroup = (assignmentRes.data.data ?? []).filter(
          (a) => a.class_group_id === classGroupId,
        );
        setAssignments(forClassGroup);

        const leaders = (classTeachers as AllGradeAssignment[]) ?? [];
        setClassTeacher(
          leaders.find(
            (a) =>
              a.class_group_id === classGroupId &&
              a.academic_year_id === academicYearId,
          ) ?? null,
        );
      } catch {
        if (!cancelled) {
          setCurriculum([]);
          setAssignments([]);
          setClassTeacher(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    gradeId,
    classGroupId,
    academicYearId,
    curriculumVersion,
    assignmentsVersion,
    nonce,
  ]);

  return { curriculum, assignments, classTeacher, loading, reload };
};
