import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MyAssignedSubject, myAssignedSubjectsApi } from "../api/academics";
import { useAcademicPeriod } from "../contexts/AcademicPeriodContext";
import {
  BookOpen,
  Users,
  GraduationCap,
  Calendar,
  Search,
  BarChart3,
  X,
  ArrowUpDown,
  Layers,
} from "lucide-react";
import SubjectItemCard from "./subjects/SubjectItemCard";

type SortMode = "name" | "classes";

const TeacherAssignedSubjects: React.FC = () => {
  const navigate = useNavigate();
  const { selectedYearId, selectedTermId } = useAcademicPeriod();
  const [subjects, setSubjects] = useState<MyAssignedSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [programFilter, setProgramFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("name");

  useEffect(() => {
    loadAssignedSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTermId]);

  const loadAssignedSubjects = async () => {
    try {
      setLoading(true);
      const response = await myAssignedSubjectsApi.getAll(
        selectedTermId ?? undefined,
      );
      setSubjects(response.data.data || []);
    } catch (error) {
      console.error("Failed to load assigned subjects:", error);
    } finally {
      setLoading(false);
    }
  };

  const getUniqueGrades = (list: MyAssignedSubject[]) => {
    const gradeSet = new Set<string>();
    list.forEach((subject) => {
      subject.grades.forEach((grade) => {
        gradeSet.add(`${grade.grade_name} - ${grade.program_name}`);
      });
    });
    return gradeSet.size;
  };

  const getTotalClassGroups = (list: MyAssignedSubject[]) => {
    const classGroupSet = new Set<string>();
    list.forEach((subject) => {
      subject.grades.forEach((grade) => {
        classGroupSet.add(grade.class_group_name);
      });
    });
    return classGroupSet.size;
  };

  const yearFilteredSubjects = subjects
    .map((subject) => ({
      ...subject,
      grades: selectedYearId
        ? subject.grades.filter((g) => g.academic_year_id === selectedYearId)
        : subject.grades,
    }))
    .filter((subject) => subject.grades.length > 0);

  const gradeOptions = useMemo(
    () =>
      Array.from(
        new Set(yearFilteredSubjects.flatMap((s) => s.grades.map((g) => g.grade_name))),
      ).sort(),
    [yearFilteredSubjects],
  );
  const programOptions = useMemo(
    () =>
      Array.from(
        new Set(yearFilteredSubjects.flatMap((s) => s.grades.map((g) => g.program_name))),
      ).sort(),
    [yearFilteredSubjects],
  );

  const filteredSubjects = yearFilteredSubjects
    .map((subject) => ({
      ...subject,
      grades: subject.grades.filter(
        (g) =>
          (gradeFilter === "all" || g.grade_name === gradeFilter) &&
          (programFilter === "all" || g.program_name === programFilter),
      ),
    }))
    .filter(
      (subject) =>
        subject.grades.length > 0 &&
        (subject.subject_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          subject.subject_code?.toLowerCase().includes(searchQuery.toLowerCase())),
    )
    .sort((a, b) =>
      sortMode === "classes"
        ? b.grades.length - a.grades.length
        : a.subject_name.localeCompare(b.subject_name),
    );

  const hasActiveFilters =
    searchQuery.trim() !== "" || gradeFilter !== "all" || programFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setGradeFilter("all");
    setProgramFilter("all");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">
            Loading your subjects...
          </p>
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
            <h1 className="text-2xl md:text-3xl lg:text-2xl font-bold mb-1">
              Assigned Subjects
            </h1>
            <p className="text-blue-100 text-sm">
              Manage your courses and enrolled students
            </p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex flex-row flex-wrap justify-center gap-3">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 hover:bg-white/20 transition-all duration-200 w-full sm:w-max">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-blue-200 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-blue-100 text-xs">Total Subjects</p>
                <p className="text-xl font-bold">
                  {yearFilteredSubjects.length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 hover:bg-white/20 transition-all duration-200 w-full sm:w-max">
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-200 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-blue-100 text-xs">Class Groups</p>
                <p className="text-xl font-bold">
                  {getTotalClassGroups(yearFilteredSubjects)}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 hover:bg-white/20 transition-all duration-200 w-full sm:w-max">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-6 h-6 text-blue-200 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-blue-100 text-xs">Grades/Programs</p>
                <p className="text-xl font-bold">
                  {getUniqueGrades(yearFilteredSubjects)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar: search + filters + sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search subjects by name or code..."
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
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          className="px-3 py-3 text-sm rounded-2xl border border-gray-200 dark:border-gray-700/30 bg-white dark:bg-gray-800/40 dark:backdrop-blur-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="all">All Grades</option>
          {gradeOptions.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <select
          value={programFilter}
          onChange={(e) => setProgramFilter(e.target.value)}
          className="px-3 py-3 text-sm rounded-2xl border border-gray-200 dark:border-gray-700/30 bg-white dark:bg-gray-800/40 dark:backdrop-blur-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="all">All Programs</option>
          {programOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5 px-3 py-3 text-sm rounded-2xl border border-gray-200 dark:border-gray-700/30 bg-white dark:bg-gray-800/40 dark:backdrop-blur-sm text-gray-600 dark:text-gray-300">
          <ArrowUpDown className="w-3.5 h-3.5 flex-shrink-0" />
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="bg-transparent focus:outline-none cursor-pointer"
          >
            <option value="name">Name (A-Z)</option>
            <option value="classes">Most Classes</option>
          </select>
        </div>
      </div>

      {/* Active filters */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-gray-400 dark:text-gray-500">
            {filteredSubjects.length} of {yearFilteredSubjects.length} subjects
          </span>
          <button
            onClick={clearFilters}
            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Subjects List */}
      {filteredSubjects.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800/50 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {yearFilteredSubjects.length === 0
              ? "No Assigned Subjects"
              : "No matches found"}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto">
            {yearFilteredSubjects.length === 0
              ? "Subjects will appear once you're assigned to classes."
              : "Try adjusting your search or filters."}
          </p>
        </div>
      ) : (
        <motion.div
          className="space-y-3"
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.05 } },
            hidden: {},
          }}
        >
          <AnimatePresence initial={false}>
            {filteredSubjects.map((subject) => (
              <SubjectItemCard
                key={subject.subject_id}
                subjectName={subject.subject_name}
                subjectCode={subject.subject_code}
                grades={subject.grades.map((grade, index) => ({
                  key: `${subject.subject_id}-${index}`,
                  grade_name: grade.grade_name,
                  class_group_name: grade.class_group_name,
                  academic_year_name: grade.academic_year_name,
                }))}
                onCardClick={() => navigate(`/subjects/${subject.subject_id}`)}
                animationVariants={{
                  hidden: { opacity: 0, y: 10 },
                  visible: { opacity: 1, y: 0 },
                }}
                rightMeta={
                  <>
                    <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                      <Layers className="w-3.5 h-3.5" />
                      {subject.grades.length} class
                      {subject.grades.length !== 1 ? "es" : ""}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                      <Calendar className="w-3.5 h-3.5" />
                      {subject.grades[0]?.academic_year_name}
                    </div>
                  </>
                }
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
};

export default TeacherAssignedSubjects;
