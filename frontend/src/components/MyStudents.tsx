import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { myStudentsApi, MyStudent, MyStudentsResponse } from "../api/academics";
import { useAcademicPeriod } from "../contexts/AcademicPeriodContext";
import { useScopedGrades } from "../hooks/useScopedGrades";
import {
  Users,
  GraduationCap,
  Layers,
  Search,
  X,
  Mail,
  BookOpen,
} from "lucide-react";

const getInitials = (first?: string, last?: string) =>
  `${first?.[0] || ""}${last?.[0] || ""}`.toUpperCase() || "?";

const EMPTY: MyStudentsResponse = {
  students: [],
  filters: { subjects: [], class_groups: [] },
  academic_year_id: 0,
  total: 0,
};

const MyStudents: React.FC = () => {
  const { selectedYearId } = useAcademicPeriod();
  const scope = useScopedGrades();
  const [data, setData] = useState<MyStudentsResponse>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [classGroupFilter, setClassGroupFilter] = useState<string>("all");
  // The profile default is applied once per academic year, so choosing "All
  // Class Groups" afterwards is not immediately undone by the next fetch.
  const appliedDefaultForYear = useRef<number | null>(null);

  // Server-side filters (subject/class group) -- refetches, since they
  // narrow which of the teacher's own assignments the roster is drawn from.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const response = await myStudentsApi.getAll({
          academicYearId: selectedYearId ?? undefined,
          subjectId: subjectFilter !== "all" ? Number(subjectFilter) : undefined,
          classGroupId: classGroupFilter !== "all" ? Number(classGroupFilter) : undefined,
        });
        if (!cancelled) setData(response.data.data || EMPTY);
      } catch (error) {
        console.error("Failed to load my students:", error);
        if (!cancelled) setData(EMPTY);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedYearId, subjectFilter, classGroupFilter]);

  // A class teacher lands on their own class group rather than on everyone
  // they teach. Only when that group is actually one they teach a subject to
  // -- a class-teacher assignment is not a teaching assignment, and
  // defaulting to a group absent from the options would render an empty
  // roster with a filter the teacher never set.
  useEffect(() => {
    if (selectedYearId == null) return;
    if (appliedDefaultForYear.current === selectedYearId) return;
    if (data.filters.class_groups.length === 0) return;

    appliedDefaultForYear.current = selectedYearId;

    const preferred = scope.defaultClassGroupId;
    if (
      preferred &&
      data.filters.class_groups.some((c) => c.class_group_id === preferred)
    ) {
      setClassGroupFilter(String(preferred));
    }
  }, [selectedYearId, data.filters.class_groups, scope.defaultClassGroupId]);

  // Switching year re-opens the question of which group to land on.
  useEffect(() => {
    appliedDefaultForYear.current = null;
    setClassGroupFilter("all");
    setSubjectFilter("all");
  }, [selectedYearId]);

  // Free-text search is applied client-side against the already-fetched page.
  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return data.students;
    return data.students.filter(
      (s) =>
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.username?.toLowerCase().includes(q),
    );
  }, [data.students, searchQuery]);

  const classGroupCount = useMemo(
    () => new Set(data.students.map((s) => s.class_group_id)).size,
    [data.students],
  );

  const hasActiveFilters =
    searchQuery.trim() !== "" || subjectFilter !== "all" || classGroupFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setSubjectFilter("all");
    setClassGroupFilter("all");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading your students...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-3 md:p-5">
      {/* Hero Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 dark:from-blue-700 dark:via-blue-800 dark:to-blue-900 rounded-3xl p-3 md:p-4 text-white shadow-lg hover:shadow-xl transition-all duration-300 flex flex-col lg:flex-row items-center justify-center lg:justify-between gap-4">
        <div className="flex items-center justify-between pl-2 md:pl-4">
          <div className="text-center lg:text-left">
            <h1 className="text-2xl md:text-3xl lg:text-2xl font-bold mb-1">My Students</h1>
            <p className="text-blue-100 text-sm">
              Every student across all your assigned subjects and class groups
            </p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex flex-row flex-wrap justify-center gap-3">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 hover:bg-white/20 transition-all duration-200 w-full sm:w-max">
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-200 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-blue-100 text-xs">Total Students</p>
                <p className="text-xl font-bold">{data.total}</p>
              </div>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 hover:bg-white/20 transition-all duration-200 w-full sm:w-max">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-6 h-6 text-blue-200 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-blue-100 text-xs">Class Groups</p>
                <p className="text-xl font-bold">{classGroupCount}</p>
              </div>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 hover:bg-white/20 transition-all duration-200 w-full sm:w-max">
            <div className="flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-blue-200 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-blue-100 text-xs">Subjects</p>
                <p className="text-xl font-bold">{data.filters.subjects.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar: search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search students by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-9 py-3 rounded-2xl border border-gray-200 dark:border-gray-700/30 bg-white dark:bg-gray-800/40 dark:backdrop-blur-sm text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          className="px-3 py-3 text-sm rounded-2xl border border-gray-200 dark:border-gray-700/30 bg-white dark:bg-gray-800/40 dark:backdrop-blur-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="all">All Subjects</option>
          {data.filters.subjects.map((s) => (
            <option key={s.subject_id} value={s.subject_id}>
              {s.subject_name}
            </option>
          ))}
        </select>

        <select
          value={classGroupFilter}
          onChange={(e) => setClassGroupFilter(e.target.value)}
          className="px-3 py-3 text-sm rounded-2xl border border-gray-200 dark:border-gray-700/30 bg-white dark:bg-gray-800/40 dark:backdrop-blur-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="all">All Class Groups</option>
          {data.filters.class_groups.map((c) => (
            <option key={c.class_group_id} value={c.class_group_id}>
              {c.class_group_name} · {c.grade_name}
            </option>
          ))}
        </select>
      </div>

      {/* Active filters */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-gray-400 dark:text-gray-500">
            {filteredStudents.length} of {data.total} students
          </span>
          <button
            onClick={clearFilters}
            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Students List */}
      {filteredStudents.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800/50 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Users className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {data.total === 0 ? "No Students Yet" : "No matches found"}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto">
            {data.total === 0
              ? "Students will appear here once you're assigned to a subject with an active class group."
              : "Try adjusting your search or filters."}
          </p>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.03 } },
            hidden: {},
          }}
        >
          <AnimatePresence initial={false}>
            {filteredStudents.map((student) => (
              <StudentCard key={student.user_id} student={student} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
};

const StudentCard: React.FC<{ student: MyStudent }> = ({ student }) => (
  <motion.div
    variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
    whileHover={{ y: -2 }}
    className="bg-white dark:bg-gray-800/40 dark:backdrop-blur-sm rounded-2xl p-4 border border-gray-200 dark:border-gray-700/30 shadow-sm hover:shadow-md transition-all duration-200"
  >
    <div className="flex items-center gap-3">
      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 text-sm font-bold text-white">
        {getInitials(student.first_name, student.last_name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
          {student.first_name} {student.last_name}
        </p>
        {student.email && (
          <p className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 truncate">
            <Mail className="w-3 h-3 flex-shrink-0" />
            {student.email}
          </p>
        )}
      </div>
    </div>

    <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      <Layers className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="truncate">
        {student.class_group_name} · {student.grade_name}
      </span>
    </div>

    {student.subjects.length > 0 && (
      <div className="mt-3 flex flex-wrap gap-1.5">
        {student.subjects.map((s) => (
          <span
            key={s.subject_id}
            className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-[11px] font-medium"
          >
            {s.subject_name}
          </span>
        ))}
      </div>
    )}
  </motion.div>
);

export default MyStudents;
