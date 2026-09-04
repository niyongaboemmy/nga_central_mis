import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Search,
  UserPlus,
  Users,
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
} from "../../api/academics";
import { searchUsers, UserSearchResult } from "../../api/users";
import RichSelect from "../ui/RichSelect";
import Button from "../ui/Button";
import { useToast } from "../../contexts/ToastContext";
import { usePermissions } from "../../hooks/usePermissions";
import { Permissions } from "../../constants/permissions";

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

  const [roster, setRoster] = useState<ClassGroupEnrollmentRoster | null>(
    null,
  );
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<number>>(
    new Set(),
  );
  const [enrolling, setEnrolling] = useState(false);

  const [mode, setMode] = useState<"roster" | "assign">("roster");
  const [studentSearch, setStudentSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedAssignIds, setSelectedAssignIds] = useState<Set<number>>(
    new Set(),
  );
  const [assigning, setAssigning] = useState(false);

  // Initial reference data
  useEffect(() => {
    academicYearsApi.getAll().then((res) => {
      const years = res.data.data;
      setAcademicYears(years);
      const current = years.find((y) => y.is_current === 1);
      setAcademicYearId(current?.academic_year_id ?? years[0]?.academic_year_id ?? null);
    });
    programsApi.getAll().then((res) => setPrograms(res.data.data));
  }, []);

  // Grades follow the selected program
  useEffect(() => {
    setGradeId(null);
    setClassGroupId(null);
    gradesApi.getAll(programId ?? undefined).then((res) => setGrades(res.data.data));
  }, [programId]);

  // Class groups follow the selected grade
  useEffect(() => {
    setClassGroupId(null);
    if (!gradeId) {
      setClassGroups([]);
      return;
    }
    classGroupsApi.getAll(gradeId).then((res) => setClassGroups(res.data.data));
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

  const allSelected =
    !!roster && roster.students.length > 0 &&
    roster.students.every((s) => selectedStudentIds.has(s.user_id));

  const toggleAll = () => {
    if (!roster) return;
    setSelectedStudentIds(
      allSelected ? new Set() : new Set(roster.students.map((s) => s.user_id)),
    );
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
        `Enrolled ${res.data.data.enrolled} subject enrollment(s) (${res.data.data.skipped} already enrolled)`,
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

  return (
    <div className="space-y-6">
      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-slate-800/70 rounded-2xl border border-white dark:border-slate-700/40 p-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <RichSelect
            label="Program"
            value={programId}
            onChange={(v) => setProgramId((v as number) || null)}
            placeholder="All programs..."
            isClearable
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
            options={academicYears.map((y) => ({
              value: y.academic_year_id,
              label: y.name,
              badge: y.is_current === 1 ? "Current" : undefined,
            }))}
          />
        </div>
      </motion.div>

      {!classGroupId ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          Select a grade and class group to view its curriculum and students.
        </div>
      ) : loadingRoster ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500 dark:text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading roster...
        </div>
      ) : roster ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Curriculum panel */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-800/70 rounded-2xl border border-white dark:border-slate-700/40 p-5 h-fit"
          >
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-4 h-4 text-blue-500" />
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                {roster.class_group.grade_name} curriculum
              </h3>
            </div>
            {roster.subjects.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No subjects have been assigned to this grade yet. Configure
                the grade's curriculum in the Subjects tab.
              </p>
            ) : (
              <ul className="space-y-2">
                {roster.subjects.map((subject) => (
                  <li
                    key={subject.subject_id}
                    className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: subject.color || "#3B82F6" }}
                    />
                    <span className="truncate">{subject.name}</span>
                    {subject.code && (
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {subject.code}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>

          {/* Roster / assign panel */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-2 bg-white dark:bg-slate-800/70 rounded-2xl border border-white dark:border-slate-700/40 p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" />
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                  {roster.class_group.class_group_name} students
                </h3>
              </div>
              {canAssign && (
                <div className="flex gap-1.5 bg-gray-50 dark:bg-slate-700/40 rounded-full p-1">
                  <button
                    onClick={() => setMode("roster")}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                      mode === "roster"
                        ? "bg-blue-600 text-white"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    Roster
                  </button>
                  <button
                    onClick={() => setMode("assign")}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors flex items-center gap-1 ${
                      mode === "assign"
                        ? "bg-blue-600 text-white"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    <UserPlus className="w-3 h-3" /> Add students
                  </button>
                </div>
              )}
            </div>

            {mode === "roster" ? (
              <>
                {roster.students.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                    No students are assigned to this class group for the
                    selected year yet.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
                    <div className="flex items-center gap-3 px-2 py-1.5 text-xs font-medium text-gray-400 uppercase">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-400"
                      />
                      <span className="flex-1">Student</span>
                      <span>Coverage</span>
                    </div>
                    {roster.students.map((student) => {
                      const fullyEnrolled =
                        student.total_subjects > 0 &&
                        student.enrolled_count === student.total_subjects;
                      return (
                        <div
                          key={student.user_id}
                          className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.has(student.user_id)}
                            onChange={() => toggleStudent(student.user_id)}
                            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-400"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {student.first_name} {student.last_name}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                              {student.email}
                            </p>
                          </div>
                          <span
                            className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 ${
                              fullyEnrolled
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            }`}
                          >
                            {fullyEnrolled && (
                              <CheckCircle2 className="w-3 h-3" />
                            )}
                            {student.enrolled_count}/{student.total_subjects}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <AnimatePresence>
                  {canEnroll && selectedStudentIds.size > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mt-4 flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30"
                    >
                      <p className="text-sm text-blue-800 dark:text-blue-300">
                        <span className="font-semibold">
                          {selectedStudentIds.size}
                        </span>{" "}
                        student{selectedStudentIds.size === 1 ? "" : "s"}{" "}
                        selected -- {selectedMissingCount} enrollment
                        {selectedMissingCount === 1 ? "" : "s"} will be added.
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
                        <ClipboardCheck className="w-4 h-4 mr-1.5 inline" />
                        Enroll in curriculum
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
                    className="w-full pl-9 pr-3 py-2 text-sm border rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                {searching ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-gray-500 dark:text-gray-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Searching...
                  </div>
                ) : studentSearch.trim().length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                    Type a name, username or email to find students.
                  </p>
                ) : searchResults.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                    No matching students outside this class group.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-[360px] overflow-y-auto pr-1">
                    {searchResults.map((u) => (
                      <div
                        key={u.user_id}
                        className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedAssignIds.has(u.user_id)}
                          onChange={() => toggleAssignStudent(u.user_id)}
                          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-400"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {u.first_name} {u.last_name}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            {u.email}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <AnimatePresence>
                  {selectedAssignIds.size > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mt-4 flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30"
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
          </motion.div>
        </div>
      ) : null}
    </div>
  );
};

export default EnrollmentManager;
