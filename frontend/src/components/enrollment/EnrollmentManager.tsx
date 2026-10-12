import React, { useEffect, useMemo, useState } from "react";
import UserAvatar from "../ui/UserAvatar";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Eraser,
  GraduationCap,
  Layers,
  Loader2,
  RefreshCcw,
  Search,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  UserSearch,
  UserX,
  X,
} from "lucide-react";
import {
  academicYearsApi,
  programsApi,
  gradesApi,
  classGroupsApi,
  studentEnrollmentApi,
  studentClassGroupApi,
  enrollmentRosterApi,
  AcademicYear,
  Program,
  Grade,
  ClassGroup,
  ClassGroupEnrollmentRoster,
  EnrollmentRosterStudent,
  EnrollmentRosterSubject,
} from "../../api/academics";
import { searchUsers, UserSearchResult } from "../../api/users";
import RichSelect from "../ui/RichSelect";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import { useToast } from "../../contexts/ToastContext";
import { usePermissions } from "../../hooks/usePermissions";
import { Permissions } from "../../constants/permissions";

// Same stat-tile language as UsersManagement's StatCard, reused here so the
// Enrollment page reads as part of the same design system rather than a
// bespoke one-off.
const StatTile: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent: string;
}> = ({ icon: Icon, label, value, accent }) => (
  <motion.div
    whileHover={{ y: -2 }}
    className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-xl p-3 border border-white/50 dark:border-gray-700/30"
  >
    <div className="flex items-center gap-2">
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${accent}`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
          {value}
        </p>
        <p className="text-xs text-gray-400 truncate">{label}</p>
      </div>
    </div>
  </motion.div>
);

const CardShell: React.FC<{
  children?: React.ReactNode;
  className?: string;
  delay?: number;
}> = ({ children, className = "", delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className={`bg-white/90 dark:bg-gray-800/60 backdrop-blur-sm rounded-2xl border border-white/50 dark:border-gray-700/30 ${className}`}
  >
    {children}
  </motion.div>
);

const EnrollmentManager: React.FC = () => {
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();
  const canEnroll = hasPermission(Permissions.MANAGE_STUDENT_ENROLLMENTS);
  const canAssign = hasPermission(Permissions.ASSIGN_STUDENT_CLASS_GROUPS);

  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);

  const [academicYearId, setAcademicYearId] = useState<number | null>(null);
  const [programId, setProgramId] = useState<number | null>(null);
  const [gradeId, setGradeId] = useState<number | null>(null);
  const [classGroupId, setClassGroupId] = useState<number | null>(null);

  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingGrades, setLoadingGrades] = useState(false);
  const [loadingClassGroups, setLoadingClassGroups] = useState(false);

  const [roster, setRoster] = useState<ClassGroupEnrollmentRoster | null>(
    null,
  );
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<number>>(
    new Set(),
  );
  const [enrolling, setEnrolling] = useState(false);
  const [rosterFilter, setRosterFilter] = useState("");

  const [mode, setMode] = useState<"roster" | "assign">("roster");
  const [studentSearch, setStudentSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedAssignIds, setSelectedAssignIds] = useState<Set<number>>(
    new Set(),
  );
  const [assigning, setAssigning] = useState(false);

  // Per-student subject detail modal: view/remove individual enrollments.
  const [detailStudent, setDetailStudent] =
    useState<EnrollmentRosterStudent | null>(null);
  const [detailEnrolledIds, setDetailEnrolledIds] = useState<Set<number>>(
    new Set(),
  );
  const [pendingSubjectIds, setPendingSubjectIds] = useState<Set<number>>(
    new Set(),
  );
  const [clearingAll, setClearingAll] = useState(false);
  const [rosterDirty, setRosterDirty] = useState(false);

  // Initial reference data
  useEffect(() => {
    setLoadingFilters(true);
    Promise.all([academicYearsApi.getAll(), programsApi.getAll()])
      .then(([yearsRes, programsRes]) => {
        const years = yearsRes.data.data;
        setAcademicYears(years);
        const current = years.find((y) => y.is_current === 1);
        setAcademicYearId(
          current?.academic_year_id ?? years[0]?.academic_year_id ?? null,
        );
        setPrograms(programsRes.data.data);
      })
      .catch(() =>
        showToast("Failed to load programs/academic years", "error"),
      )
      .finally(() => setLoadingFilters(false));
  }, []);

  // Grades follow the selected program
  useEffect(() => {
    setGradeId(null);
    setClassGroupId(null);
    setLoadingGrades(true);
    gradesApi
      .getAll(programId ?? undefined)
      .then((res) => setGrades(res.data.data))
      .catch(() => showToast("Failed to load grades", "error"))
      .finally(() => setLoadingGrades(false));
  }, [programId]);

  // Class groups follow the selected grade
  useEffect(() => {
    setClassGroupId(null);
    if (!gradeId) {
      setClassGroups([]);
      return;
    }
    setLoadingClassGroups(true);
    classGroupsApi
      .getAll(gradeId)
      .then((res) => setClassGroups(res.data.data))
      .catch(() => showToast("Failed to load class groups", "error"))
      .finally(() => setLoadingClassGroups(false));
  }, [gradeId]);

  const fetchRoster = () => {
    if (!classGroupId || !academicYearId) {
      setRoster(null);
      return;
    }
    setLoadingRoster(true);
    enrollmentRosterApi
      .get(classGroupId, academicYearId)
      .then((res) => {
        setRoster(res.data.data);
        setSelectedStudentIds(new Set());
        setRosterFilter("");
      })
      .catch((err) => {
        showToast(
          err?.response?.data?.message || "Failed to load enrollment roster",
          "error",
        );
        setRoster(null);
      })
      .finally(() => setLoadingRoster(false));
  };

  useEffect(() => {
    fetchRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classGroupId, academicYearId]);

  const visibleStudents = useMemo(() => {
    if (!roster) return [];
    const q = rosterFilter.trim().toLowerCase();
    if (!q) return roster.students;
    return roster.students.filter((s) =>
      `${s.first_name} ${s.last_name} ${s.email} ${s.registration_number ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [roster, rosterFilter]);

  const rosterStats = useMemo(() => {
    if (!roster) return { total: 0, full: 0, partial: 0, empty: 0 };
    let full = 0;
    let partial = 0;
    let empty = 0;
    for (const s of roster.students) {
      if (s.total_subjects > 0 && s.enrolled_count === s.total_subjects) full++;
      else if (s.enrolled_count > 0) partial++;
      else empty++;
    }
    return { total: roster.students.length, full, partial, empty };
  }, [roster]);

  const allVisibleSelected =
    visibleStudents.length > 0 &&
    visibleStudents.every((s) => selectedStudentIds.has(s.user_id));

  const toggleAll = () => {
    setSelectedStudentIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleStudents.forEach((s) => next.delete(s.user_id));
        return next;
      }
      const next = new Set(prev);
      visibleStudents.forEach((s) => next.add(s.user_id));
      return next;
    });
  };

  const toggleStudent = (userId: number) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const selectedMissingCount = useMemo(() => {
    if (!roster) return 0;
    return roster.students
      .filter((s) => selectedStudentIds.has(s.user_id))
      .reduce((sum, s) => sum + (s.total_subjects - s.enrolled_count), 0);
  }, [roster, selectedStudentIds]);

  const handleBulkEnroll = async () => {
    if (!roster || selectedStudentIds.size === 0) return;
    setEnrolling(true);
    try {
      const res = await studentEnrollmentApi.bulkEnroll({
        user_ids: Array.from(selectedStudentIds),
        subject_ids: roster.subjects.map((s) => s.subject_id),
        academic_year_id: academicYearId ?? undefined,
      });
      showToast(
        `Synced ${res.data.data.enrolled} missing enrollment(s) -- ${res.data.data.skipped} were already enrolled and left untouched`,
        "success",
      );
      fetchRoster();
    } catch (err: any) {
      showToast(
        err?.response?.data?.message || "Failed to enroll students",
        "error",
      );
    } finally {
      setEnrolling(false);
    }
  };

  const openDetail = (student: EnrollmentRosterStudent) => {
    setDetailStudent(student);
    setDetailEnrolledIds(new Set(student.enrolled_subject_ids));
    setRosterDirty(false);
  };

  const closeDetail = () => {
    setDetailStudent(null);
    if (rosterDirty) fetchRoster();
  };

  const toggleDetailSubject = async (subjectId: number) => {
    if (!detailStudent || !academicYearId) return;
    const isEnrolled = detailEnrolledIds.has(subjectId);
    setPendingSubjectIds((prev) => new Set(prev).add(subjectId));
    try {
      if (isEnrolled) {
        await studentEnrollmentApi.unenroll(
          detailStudent.user_id,
          subjectId,
          academicYearId,
        );
      } else {
        await studentEnrollmentApi.enroll({
          user_id: detailStudent.user_id,
          subject_id: subjectId,
          academic_year_id: academicYearId,
        });
      }
      setDetailEnrolledIds((prev) => {
        const next = new Set(prev);
        if (isEnrolled) next.delete(subjectId);
        else next.add(subjectId);
        return next;
      });
      setRosterDirty(true);
    } catch (err: any) {
      showToast(
        err?.response?.data?.message || "Failed to update enrollment",
        "error",
      );
    } finally {
      setPendingSubjectIds((prev) => {
        const next = new Set(prev);
        next.delete(subjectId);
        return next;
      });
    }
  };

  const handleClearAllForDetail = async () => {
    if (!detailStudent || !academicYearId || detailEnrolledIds.size === 0)
      return;
    setClearingAll(true);
    const subjectIds = Array.from(detailEnrolledIds);
    try {
      await Promise.all(
        subjectIds.map((subjectId) =>
          studentEnrollmentApi.unenroll(
            detailStudent.user_id,
            subjectId,
            academicYearId,
          ),
        ),
      );
      setDetailEnrolledIds(new Set());
      setRosterDirty(true);
      showToast(
        `Cleared ${subjectIds.length} subject enrollment(s) for ${detailStudent.first_name}`,
        "success",
      );
    } catch (err: any) {
      showToast(
        err?.response?.data?.message || "Failed to clear enrollments",
        "error",
      );
    } finally {
      setClearingAll(false);
    }
  };

  // Student search for the "assign to class group" flow. Uses /users/search
  // (matches first/last/full name, not just username/email) rather than the
  // paginated user list, since admins search students by name here.
  useEffect(() => {
    if (mode !== "assign" || studentSearch.trim().length === 0) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      searchUsers(studentSearch)
        .then((users) => {
          const alreadyInRoster = new Set(
            (roster?.students || []).map((s) => s.user_id),
          );
          setSearchResults(
            users.filter(
              (u) =>
                u.user_type === "STUDENT" && !alreadyInRoster.has(u.user_id),
            ),
          );
        })
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [mode, studentSearch, roster]);

  const toggleAssignStudent = (userId: number) => {
    setSelectedAssignIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleBulkAssign = async () => {
    if (!classGroupId || selectedAssignIds.size === 0) return;
    setAssigning(true);
    try {
      const res = await studentClassGroupApi.bulkAssign({
        user_ids: Array.from(selectedAssignIds),
        class_group_id: classGroupId,
        academic_year_id: academicYearId ?? undefined,
      });
      showToast(
        `Assigned ${res.data.data.assigned + res.data.data.reactivated} student(s) and auto-enrolled ${res.data.data.subjects_enrolled} subject enrollment(s)`,
        "success",
      );
      setSelectedAssignIds(new Set());
      setStudentSearch("");
      setMode("roster");
      fetchRoster();
    } catch (err: any) {
      showToast(
        err?.response?.data?.message || "Failed to assign students",
        "error",
      );
    } finally {
      setAssigning(false);
    }
  };

  const subjectEnrollmentCounts = useMemo(() => {
    const counts = new Map<number, number>();
    if (!roster) return counts;
    for (const s of roster.students) {
      for (const subjId of s.enrolled_subject_ids) {
        counts.set(subjId, (counts.get(subjId) || 0) + 1);
      }
    }
    return counts;
  }, [roster]);

  return (
    <div className="space-y-5 pt-4 pb-10 px-4 md:px-6">
      {/* Intro banner */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 px-1"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white leading-tight">
            Bulk Enrollment
          </h2>
          <p className="text-xs text-gray-400 truncate">
            Pick a class group and enroll whole cohorts into their grade's
            curriculum in one go.
          </p>
        </div>
      </motion.div>

      {/* Filters -- relative z-20 keeps the RichSelect dropdown menus (which
          rely on z-index within this card's own stacking context) painting
          above the animated cards below rather than getting hidden behind
          them, since sibling motion.divs each form their own stacking
          context ordered by DOM position when z-index is auto. */}
      <CardShell className="p-5 relative z-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <RichSelect
            label="Program"
            value={programId}
            onChange={(v) => setProgramId((v as number) || null)}
            placeholder="All programs..."
            isClearable
            isLoading={loadingFilters}
            options={programs.map((p) => ({
              value: p.program_id,
              label: p.name,
            }))}
          />
          <RichSelect
            label="Grade"
            value={gradeId}
            onChange={(v) => setGradeId((v as number) || null)}
            placeholder="Select a grade..."
            isLoading={loadingGrades}
            options={grades.map((g) => ({
              value: g.grade_id,
              label: g.name,
            }))}
          />
          <RichSelect
            label="Class Group"
            value={classGroupId}
            onChange={(v) => setClassGroupId((v as number) || null)}
            placeholder="Select a class group..."
            isDisabled={!gradeId}
            isLoading={loadingClassGroups}
            options={classGroups.map((cg) => ({
              value: cg.class_group_id,
              label: cg.name,
            }))}
          />
          <RichSelect
            label="Academic Year"
            value={academicYearId}
            onChange={(v) => setAcademicYearId((v as number) || null)}
            placeholder="Select academic year..."
            isLoading={loadingFilters}
            options={academicYears.map((y) => ({
              value: y.academic_year_id,
              label: y.name,
              badge: y.is_current === 1 ? "Current" : undefined,
            }))}
          />
        </div>
      </CardShell>

      {!classGroupId ? (
        <CardShell className="py-16 px-6 text-center" delay={0.05}>
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-3">
            <Layers className="w-7 h-7 text-blue-500" />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Select a grade and class group to get started
          </p>
          <p className="text-xs text-gray-400 mt-1">
            You'll see its curriculum and student roster here.
          </p>
        </CardShell>
      ) : loadingRoster && !roster ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <CardShell className="p-5 h-40 animate-pulse" />
          <CardShell className="p-5 h-40 lg:col-span-2 animate-pulse" />
        </div>
      ) : roster ? (
        <>
          {/* Stats strip */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-2"
          >
            <StatTile
              icon={Users}
              label="Students"
              value={rosterStats.total}
              accent="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
            />
            <StatTile
              icon={BookOpen}
              label="Curriculum subjects"
              value={roster.subjects.length}
              accent="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
            />
            <StatTile
              icon={UserCheck}
              label="Fully enrolled"
              value={rosterStats.full}
              accent="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            />
            <StatTile
              icon={UserX}
              label="Missing subjects"
              value={rosterStats.partial + rosterStats.empty}
              accent="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
            />
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Curriculum panel */}
            <CardShell className="p-5 h-fit" delay={0.1}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                    {roster.class_group.grade_name} curriculum
                  </h3>
                  <p className="text-xs text-gray-400">
                    {roster.subjects.length} subject
                    {roster.subjects.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              {roster.subjects.length === 0 ? (
                <div className="text-center py-6">
                  <BookOpen className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No subjects have been assigned to this grade yet.
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Configure the grade's curriculum in the Subjects tab.
                  </p>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {roster.subjects.map((subject) => {
                    const count = subjectEnrollmentCounts.get(subject.subject_id) || 0;
                    const total = roster.students.length;
                    return (
                      <li
                        key={subject.subject_id}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                      >
                        <span
                          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white"
                          style={{ backgroundColor: subject.color || "#3B82F6" }}
                        >
                          {subject.name.charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                            {subject.name}
                          </p>
                          {subject.code && (
                            <p className="text-[11px] text-gray-400 truncate">
                              {subject.code}
                            </p>
                          )}
                        </div>
                        <span
                          className={`flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            total > 0 && count === total
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400"
                          }`}
                        >
                          {count}/{total}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardShell>

            {/* Roster / assign panel */}
            <CardShell className="lg:col-span-2 p-5" delay={0.15}>
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm truncate flex items-center gap-1.5">
                      {roster.class_group.class_group_name}
                      {loadingRoster && (
                        <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
                      )}
                    </h3>
                    <p className="text-xs text-gray-400">
                      {rosterStats.total} student
                      {rosterStats.total === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                {canAssign && (
                  <div className="flex gap-1 bg-gray-50 dark:bg-gray-700/40 rounded-full p-1">
                    <button
                      onClick={() => setMode("roster")}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1.5 ${
                        mode === "roster"
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      }`}
                    >
                      <ClipboardList className="w-3.5 h-3.5" /> Roster
                    </button>
                    <button
                      onClick={() => setMode("assign")}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1.5 ${
                        mode === "assign"
                          ? "bg-blue-600 text-white shadow-sm"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      }`}
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Add students
                    </button>
                  </div>
                )}
              </div>

              {mode === "roster" ? (
                <>
                  {roster.students.length > 0 && (
                    <div className="relative mb-3">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={rosterFilter}
                        onChange={(e) => setRosterFilter(e.target.value)}
                        placeholder="Filter students in this roster..."
                        className="w-full pl-9 pr-8 py-2 text-sm border rounded-xl bg-gray-50 dark:bg-gray-900/40 text-gray-900 dark:text-white border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white dark:focus:bg-gray-900"
                      />
                      {rosterFilter && (
                        <button
                          onClick={() => setRosterFilter("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {roster.students.length === 0 ? (
                    <div className="text-center py-10">
                      <UserSearch className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        No students are assigned to this class group for the
                        selected year yet.
                      </p>
                      {canAssign && (
                        <button
                          onClick={() => setMode("assign")}
                          className="mt-3 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                        >
                          <UserPlus className="w-3.5 h-3.5" /> Add students
                        </button>
                      )}
                    </div>
                  ) : visibleStudents.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                      No students match "{rosterFilter}".
                    </p>
                  ) : (
                    <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
                      <div className="flex items-center gap-3 px-2 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleAll}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-400"
                        />
                        <span className="flex-1">Student</span>
                        <span>Coverage</span>
                      </div>
                      {visibleStudents.map((student) => (
                        <StudentRow
                          key={student.user_id}
                          student={student}
                          selected={selectedStudentIds.has(student.user_id)}
                          onToggle={() => toggleStudent(student.user_id)}
                          onOpenDetail={() => openDetail(student)}
                        />
                      ))}
                    </div>
                  )}

                  <AnimatePresence>
                    {canEnroll && selectedStudentIds.size > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mt-4 flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-800/30"
                      >
                        <p className="text-sm text-blue-800 dark:text-blue-300">
                          <span className="font-semibold">
                            {selectedStudentIds.size}
                          </span>{" "}
                          student{selectedStudentIds.size === 1 ? "" : "s"}{" "}
                          selected --{" "}
                          {selectedMissingCount === 0 ? (
                            "already fully enrolled, nothing to sync."
                          ) : (
                            <>
                              {selectedMissingCount} missing enrollment
                              {selectedMissingCount === 1 ? "" : "s"} will be
                              synced.
                            </>
                          )}
                        </p>
                        <Button
                          size="sm"
                          onClick={handleBulkEnroll}
                          isLoading={enrolling}
                          disabled={
                            enrolling ||
                            roster.subjects.length === 0 ||
                            selectedMissingCount === 0
                          }
                        >
                          <RefreshCcw className="w-4 h-4 mr-1.5 inline" />
                          Sync curriculum
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                <>
                  <div className="relative mb-3">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Search students by name, username or email..."
                      className="w-full pl-9 pr-3 py-2 text-sm border rounded-xl bg-gray-50 dark:bg-gray-900/40 text-gray-900 dark:text-white border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white dark:focus:bg-gray-900"
                    />
                  </div>
                  {searching ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-gray-500 dark:text-gray-400 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" /> Searching...
                    </div>
                  ) : studentSearch.trim().length === 0 ? (
                    <div className="text-center py-10">
                      <UserSearch className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Type a name, username or email to find students.
                      </p>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                      No matching students outside this class group.
                    </p>
                  ) : (
                    <div className="space-y-1 max-h-[360px] overflow-y-auto pr-1">
                      {searchResults.map((u) => (
                        <AssignRow
                          key={u.user_id}
                          user={u}
                          selected={selectedAssignIds.has(u.user_id)}
                          onToggle={() => toggleAssignStudent(u.user_id)}
                        />
                      ))}
                    </div>
                  )}

                  <AnimatePresence>
                    {selectedAssignIds.size > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mt-4 flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-100 dark:border-emerald-800/30"
                      >
                        <p className="text-sm text-emerald-800 dark:text-emerald-300">
                          <span className="font-semibold">
                            {selectedAssignIds.size}
                          </span>{" "}
                          student{selectedAssignIds.size === 1 ? "" : "s"}{" "}
                          selected to assign into{" "}
                          {roster.class_group.class_group_name}.
                        </p>
                        <Button
                          size="sm"
                          onClick={handleBulkAssign}
                          isLoading={assigning}
                          disabled={assigning}
                        >
                          Assign &amp; enroll
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </CardShell>
          </div>
        </>
      ) : null}

      {/* Per-student subject detail: view, remove, or clear enrollments */}
      <Modal
        isOpen={!!detailStudent}
        onClose={closeDetail}
        title={
          detailStudent
            ? `${detailStudent.first_name} ${detailStudent.last_name}`
            : ""
        }
        size="md"
      >
        {detailStudent && roster && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-gray-700/40">
              <UserAvatar decorative userId={detailStudent.user_id} name={`${detailStudent.first_name ?? ""} ${detailStudent.last_name ?? ""}`.trim() || "?"} size={48} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {detailStudent.email}
                </p>
                {detailStudent.registration_number && (
                  <p className="text-xs text-gray-400 truncate">
                    {detailStudent.registration_number}
                  </p>
                )}
                <p className="text-xs text-gray-400">
                  {roster.class_group.class_group_name} --{" "}
                  {roster.class_group.grade_name}
                </p>
              </div>
              <span
                className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  coverageMeta(detailEnrolledIds.size, roster.subjects.length)
                    .badgeClass
                }`}
              >
                {detailEnrolledIds.size}/{roster.subjects.length}
              </span>
            </div>

            {roster.subjects.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
                This grade has no curriculum subjects configured yet.
              </p>
            ) : (
              <div className="space-y-1 max-h-[340px] overflow-y-auto pr-1">
                {roster.subjects.map((subject: EnrollmentRosterSubject) => {
                  const isEnrolled = detailEnrolledIds.has(subject.subject_id);
                  const isPending = pendingSubjectIds.has(subject.subject_id);
                  return (
                    <div
                      key={subject.subject_id}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-colors ${
                        isEnrolled
                          ? "bg-green-50/60 dark:bg-green-900/10"
                          : "hover:bg-gray-50 dark:hover:bg-gray-700/30"
                      }`}
                    >
                      <span
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white"
                        style={{ backgroundColor: subject.color || "#3B82F6" }}
                      >
                        {subject.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                          {subject.name}
                        </p>
                        {subject.code && (
                          <p className="text-[11px] text-gray-400 truncate">
                            {subject.code}
                          </p>
                        )}
                      </div>
                      {isPending ? (
                        <Loader2 className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" />
                      ) : (
                        <button
                          onClick={() => toggleDetailSubject(subject.subject_id)}
                          disabled={!canEnroll}
                          className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            isEnrolled
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/30 dark:hover:text-rose-400"
                              : "bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
                          }`}
                        >
                          {isEnrolled ? "Remove" : "Enroll"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-between items-center pt-3 border-t border-gray-100 dark:border-gray-700/40">
              <button
                onClick={handleClearAllForDetail}
                disabled={
                  !canEnroll || clearingAll || detailEnrolledIds.size === 0
                }
                className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline inline-flex items-center gap-1.5"
              >
                {clearingAll ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Eraser className="w-3.5 h-3.5" />
                )}
                Clear all subjects
              </button>
              <Button variant="secondary" size="sm" onClick={closeDetail}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

const coverageMeta = (enrolled: number, total: number) => {
  if (total === 0)
    return {
      barClass: "bg-gray-300 dark:bg-gray-600",
      badgeClass:
        "bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400",
    };
  if (enrolled === total)
    return {
      barClass: "bg-green-500",
      badgeClass:
        "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    };
  if (enrolled === 0)
    return {
      barClass: "bg-rose-400",
      badgeClass:
        "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
    };
  return {
    barClass: "bg-amber-400",
    badgeClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  };
};

const StudentRow: React.FC<{
  student: EnrollmentRosterStudent;
  selected: boolean;
  onToggle: () => void;
  onOpenDetail: () => void;
}> = ({ student, selected, onToggle, onOpenDetail }) => {
  const fullyEnrolled =
    student.total_subjects > 0 &&
    student.enrolled_count === student.total_subjects;
  const pct =
    student.total_subjects > 0
      ? Math.round((student.enrolled_count / student.total_subjects) * 100)
      : 0;
  const { barClass, badgeClass } = coverageMeta(
    student.enrolled_count,
    student.total_subjects,
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDetail();
        }
      }}
      title="View enrolled subjects"
      className={`group flex items-center gap-3 px-2.5 py-2 rounded-xl cursor-pointer outline-none transition-colors ${
        selected
          ? "bg-blue-50 dark:bg-blue-900/15 ring-1 ring-blue-200 dark:ring-blue-800/40"
          : "hover:bg-gray-50 dark:hover:bg-gray-700/30 focus-visible:bg-gray-50 dark:focus-visible:bg-gray-700/30"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-400"
      />
      <UserAvatar decorative userId={student.user_id} name={`${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() || "?"} size={32} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {student.first_name} {student.last_name}
        </p>
        <p className="text-xs text-gray-400 truncate">
          {student.registration_number
            ? `${student.registration_number} · ${student.email}`
            : student.email}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0 w-20">
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${badgeClass}`}
        >
          {fullyEnrolled && <CheckCircle2 className="w-3 h-3" />}
          {student.enrolled_count}/{student.total_subjects}
        </span>
        <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-gray-700/60 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barClass}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
};

const AssignRow: React.FC<{
  user: UserSearchResult;
  selected: boolean;
  onToggle: () => void;
}> = ({ user, selected, onToggle }) => (
  <div
    onClick={onToggle}
    className={`flex items-center gap-3 px-2.5 py-2 rounded-xl cursor-pointer transition-colors ${
      selected
        ? "bg-emerald-50 dark:bg-emerald-900/15 ring-1 ring-emerald-200 dark:ring-emerald-800/40"
        : "hover:bg-gray-50 dark:hover:bg-gray-700/30"
    }`}
  >
    <input
      type="checkbox"
      checked={selected}
      onChange={onToggle}
      onClick={(e) => e.stopPropagation()}
      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-emerald-600 focus:ring-emerald-400"
    />
    <UserAvatar decorative userId={user.user_id} name={`${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "?"} size={32} />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
        {user.first_name} {user.last_name}
      </p>
      <p className="text-xs text-gray-400 truncate">
        {user.registration_number
          ? `${user.registration_number} · ${user.email}`
          : user.email}
      </p>
    </div>
  </div>
);

export default EnrollmentManager;
