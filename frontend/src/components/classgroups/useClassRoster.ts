import { useCallback, useEffect, useState } from "react";
import {
  classGroupsApi,
  enrollmentRosterApi,
  EnrollmentRosterSubject,
} from "../../api/academics";
import { useClassGroups } from "./ClassGroupsContext";

export interface RosterStudent {
  user_id: number;
  username: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  gender: string | null;
  registration_number: string | null;
  /** Only populated when the enrollment roster was readable. */
  enrolled_subject_ids: number[] | null;
  enrolled_count: number | null;
  total_subjects: number | null;
}

export interface ClassRoster {
  students: RosterStudent[];
  subjects: EnrollmentRosterSubject[];
  /** false when the caller could only read the permission-light roster, so
   * per-student subject coverage is unknown. */
  hasCoverage: boolean;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const EMPTY: RosterStudent[] = [];

/**
 * One class group's students for the selected year. Admins who can manage
 * enrollments get the richer roster (subjects plus per-student coverage) in
 * the same single request the matrix needs; everyone else falls back to the
 * permission-light member list and simply loses the coverage column.
 */
export const useClassRoster = (): ClassRoster => {
  const { classGroupId, academicYearId, versions, can } = useClassGroups();

  const [students, setStudents] = useState<RosterStudent[]>(EMPTY);
  const [subjects, setSubjects] = useState<EnrollmentRosterSubject[]>([]);
  const [hasCoverage, setHasCoverage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const rosterVersion = versions.roster;
  const curriculumVersion = versions.curriculum;
  const canReadCoverage = can.manageEnrollments;

  useEffect(() => {
    if (!classGroupId || !academicYearId) {
      setStudents(EMPTY);
      setSubjects([]);
      setHasCoverage(false);
      setError(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (canReadCoverage) {
          const res = await enrollmentRosterApi.get(
            classGroupId,
            academicYearId,
          );
          if (cancelled) return;
          const roster = res.data.data;
          setSubjects(roster?.subjects ?? []);
          setStudents(
            (roster?.students ?? []).map((s) => ({
              user_id: s.user_id,
              username: s.username,
              email: s.email,
              first_name: s.first_name,
              last_name: s.last_name,
              gender: s.gender,
              registration_number: s.registration_number,
              enrolled_subject_ids: s.enrolled_subject_ids,
              enrolled_count: s.enrolled_count,
              total_subjects: s.total_subjects,
            })),
          );
          setHasCoverage(true);
        } else {
          const res = await classGroupsApi.students(
            classGroupId,
            academicYearId,
          );
          if (cancelled) return;
          setSubjects([]);
          setStudents(
            (res.data.data ?? []).map((s) => ({
              user_id: s.user_id,
              username: s.username,
              email: s.email,
              first_name: s.first_name,
              last_name: s.last_name,
              gender: s.gender,
              registration_number: s.registration_number,
              enrolled_subject_ids: null,
              enrolled_count: null,
              total_subjects: null,
            })),
          );
          setHasCoverage(false);
        }
      } catch {
        if (!cancelled) {
          setStudents(EMPTY);
          setSubjects([]);
          setError("Could not load this class group's roster.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    classGroupId,
    academicYearId,
    canReadCoverage,
    rosterVersion,
    curriculumVersion,
    nonce,
  ]);

  return { students, subjects, hasCoverage, loading, error, reload };
};
