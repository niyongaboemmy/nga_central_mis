import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { GraduationCap, BookOpen, Users, Search } from "lucide-react";
import { useUser } from "../contexts/UserContext";
import {
  gradesApi,
  subjectsApi,
  classGroupsApi,
  Grade,
  Subject,
  ClassGroup,
} from "../api/academics";
import { useToast } from "../contexts/ToastContext";
import { Permissions } from "../constants/permissions";

// Animated floating particles
const FloatingParticles = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
    {[...Array(8)].map((_, i) => (
      <motion.div
        key={i}
        initial={{
          opacity: 0,
          x: `${Math.random() * 100}%`,
          y: "100%",
        }}
        animate={{
          opacity: [0, 0.3, 0],
          y: "-10%",
        }}
        transition={{
          repeat: Infinity,
          duration: 20 + Math.random() * 20,
          delay: Math.random() * 20,
          ease: "linear",
        }}
        className="absolute"
        style={{ left: `${Math.random() * 100}%` }}
      >
        <div className="w-2 h-2 bg-blue-300/30 rounded-full" />
      </motion.div>
    ))}
  </div>
);

// Grade card component
const GradeCard = ({ grade, index }: { grade: Grade; index: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.02 }}
    className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 border border-white/50 dark:border-slate-700/30"
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
          <GraduationCap className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-gray-900 dark:text-white text-sm">
            {grade.name}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Level {grade.level_order}
          </p>
        </div>
      </div>
    </div>
  </motion.div>
);

// Subject card component
const SubjectCard = ({
  subject,
  index,
}: {
  subject: Subject & { teachers?: Array<{ teacher_name: string }> };
  index: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.02 }}
    className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 border border-white/50 dark:border-slate-700/30"
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
          <BookOpen className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-gray-900 dark:text-white text-sm">
            {subject.name}
          </h3>
          {subject.code && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Code: {subject.code}
            </p>
          )}
          {subject.teachers && subject.teachers.length > 0 && (
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Teachers: {subject.teachers.map((t) => t.teacher_name).join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  </motion.div>
);

// Class Group card component
const ClassGroupCard = ({
  classGroup,
  index,
}: {
  classGroup: ClassGroup;
  index: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.02 }}
    className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 border border-white/50 dark:border-slate-700/30"
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
          <Users className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-gray-900 dark:text-white text-sm">
            {classGroup.name}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {classGroup.grade_name}
          </p>
        </div>
      </div>
    </div>
  </motion.div>
);

// Program Academic Page
const ProgramAcademicPage: React.FC = () => {
  const { user } = useUser();
  const { showToast } = useToast();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [subjects, setSubjects] = useState<
    (Subject & {
      teachers?: Array<{ teacher_name: string; teacher_username: string }>;
    })[]
  >([]);
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  const [loading, setLoading] = useState({
    grades: false,
    subjects: false,
    classGroups: false,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [subjectsSearchTerm, setSubjectsSearchTerm] = useState("");
  const [classGroupsSearchTerm, setClassGroupsSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<string>("grades");
  const hasLoadedData = useRef(false);

  const canView = user?.permissions?.includes(
    Permissions.VIEW_PROGRAM_ACADEMICS
  );
  const assignedProgram = user?.assignedPrograms?.[0];

  const loadGrades = useCallback(async () => {
    if (!assignedProgram) return;

    setLoading((prev) => ({ ...prev, grades: true }));
    try {
      const result = await gradesApi.getAll(assignedProgram.program_id);
      setGrades(result.data.data);
    } catch (error) {
      console.error("Failed to load grades:", error);
      showToast("Failed to load grades", "error");
    } finally {
      setLoading((prev) => ({ ...prev, grades: false }));
    }
  }, [assignedProgram, showToast]);

  const loadSubjects = useCallback(async () => {
    if (!assignedProgram) return;

    setLoading((prev) => ({ ...prev, subjects: true }));
    try {
      const result = await subjectsApi.getAll();
      setSubjects(result.data.data);
    } catch (error) {
      console.error("Failed to load subjects:", error);
      showToast("Failed to load subjects", "error");
    } finally {
      setLoading((prev) => ({ ...prev, subjects: false }));
    }
  }, [assignedProgram, showToast]);

  const loadClassGroups = useCallback(async () => {
    if (!assignedProgram || grades.length === 0) return;

    setLoading((prev) => ({ ...prev, classGroups: true }));
    try {
      const allClassGroups: ClassGroup[] = [];
      for (const grade of grades) {
        const result = await classGroupsApi.getAll(grade.grade_id);
        allClassGroups.push(...result.data.data);
      }
      setClassGroups(allClassGroups);
    } catch (error) {
      console.error("Failed to load class groups:", error);
      showToast("Failed to load class groups", "error");
    } finally {
      setLoading((prev) => ({ ...prev, classGroups: false }));
    }
  }, [assignedProgram, grades, showToast]);

  // Load all data when component mounts (only once)
  useEffect(() => {
    if (canView && assignedProgram && !hasLoadedData.current) {
      hasLoadedData.current = true;
      loadGrades();
      loadSubjects();
    }
  }, [canView, assignedProgram]); // Removed function dependencies to prevent re-runs

  // Load class groups when grades are loaded
  useEffect(() => {
    if (grades.length > 0 && canView && assignedProgram) {
      loadClassGroups();
    }
  }, [grades.length, canView, assignedProgram]); // Removed loadClassGroups to prevent re-runs

  if (!canView) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black overflow-hidden relative">
        <FloatingParticles />
        <div className="relative z-10 pb-10 pt-4 px-4 md:px-6">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-8"
            >
              <BookOpen className="w-10 h-10 text-gray-400 mx-auto mb-2" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                Access Denied
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No permission to view program academics.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    {
      id: "grades",
      label: "Grades",
      icon: GraduationCap,
      color: "text-blue-500",
      count: grades.length,
    },
    {
      id: "subjects",
      label: "Subjects",
      icon: BookOpen,
      color: "text-red-500",
      count: subjects.length,
    },
    {
      id: "class-groups",
      label: "Class Groups",
      icon: Users,
      color: "text-blue-500",
      count: classGroups.length,
    },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "grades":
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Grades in {assignedProgram?.name || "Program"}
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {grades.length} grades
                </span>
              </div>
            </div>

            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                  }}
                  placeholder="Search grades..."
                  className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-slate-700 dark:text-white rounded-[0.8rem] text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Grades List */}
            {loading.grades ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {grades.length > 0 ? (
                  grades
                    .filter((grade) =>
                      grade.name
                        .toLowerCase()
                        .includes(searchTerm.toLowerCase())
                    )
                    .map((grade, index) => (
                      <GradeCard
                        key={grade.grade_id}
                        grade={grade}
                        index={index}
                      />
                    ))
                ) : (
                  <div className="col-span-full text-center py-6 text-sm text-gray-400">
                    No grades found
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        );
      case "subjects":
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Subjects in {assignedProgram?.name || "Program"}
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {subjects.length} subjects
                </span>
              </div>
            </div>

            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={subjectsSearchTerm}
                  onChange={(e) => {
                    setSubjectsSearchTerm(e.target.value);
                  }}
                  placeholder="Search subjects..."
                  className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-slate-700 dark:text-white rounded-[0.8rem] text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Subjects List */}
            {loading.subjects ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {subjects.length > 0 ? (
                  subjects
                    .filter(
                      (subject) =>
                        subject.name
                          .toLowerCase()
                          .includes(subjectsSearchTerm.toLowerCase()) ||
                        subject.code
                          ?.toLowerCase()
                          .includes(subjectsSearchTerm.toLowerCase()) ||
                        subject.teachers?.some((teacher) =>
                          teacher.teacher_name
                            .toLowerCase()
                            .includes(subjectsSearchTerm.toLowerCase())
                        )
                    )
                    .map((subject, index) => (
                      <SubjectCard
                        key={subject.subject_id}
                        subject={subject}
                        index={index}
                      />
                    ))
                ) : (
                  <div className="col-span-full text-center py-6 text-sm text-gray-400">
                    No subjects found
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        );
      case "class-groups":
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Class Groups in {assignedProgram?.name || "Program"}
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {classGroups.length} class groups
                </span>
              </div>
            </div>

            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={classGroupsSearchTerm}
                  onChange={(e) => {
                    setClassGroupsSearchTerm(e.target.value);
                  }}
                  placeholder="Search class groups..."
                  className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-slate-700 dark:text-white rounded-[0.8rem] text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Class Groups List */}
            {loading.classGroups ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {classGroups.length > 0 ? (
                  classGroups
                    .filter(
                      (classGroup) =>
                        classGroup.name
                          .toLowerCase()
                          .includes(classGroupsSearchTerm.toLowerCase()) ||
                        classGroup.grade_name
                          ?.toLowerCase()
                          .includes(classGroupsSearchTerm.toLowerCase())
                    )
                    .map((classGroup, index) => (
                      <ClassGroupCard
                        key={classGroup.class_group_id}
                        classGroup={classGroup}
                        index={index}
                      />
                    ))
                ) : (
                  <div className="col-span-full text-center py-6 text-sm text-gray-400">
                    No class groups found
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen overflow-hidden relative">
      <FloatingParticles />

      <div className="relative z-10 pb-10 pt-4 px-4 md:px-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4"
          >
            <div>
              <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
                Program Academics
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                View academic details in your assigned program
              </p>
            </div>
          </motion.div>

          {/* Tabs */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-slate-800/70 rounded-2xl lg:rounded-full border border-white dark:border-slate-700/40 p-3 mb-6"
          >
            <nav
              className="flex flex-wrap gap-2 justify-start"
              aria-label="Tabs"
            >
              {tabs.map((tab, index) => (
                <motion.button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + index * 0.1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`flex items-center space-x-3 px-4 py-2 rounded-full font-normal text-sm transition-all duration-300 ${
                    activeTab === tab.id
                      ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-500/25"
                      : "bg-gray-50 dark:bg-slate-700/50 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-slate-600/50 hover:bg-blue-100/50 hover:text-blue-700"
                  }`}
                >
                  <tab.icon
                    className={`w-4 h-4 ${
                      activeTab === tab.id ? "text-white" : tab.color
                    }`}
                  />
                  <span>
                    {tab.label} ({tab.count})
                  </span>
                </motion.button>
              ))}
            </nav>
          </motion.div>

          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};

export default ProgramAcademicPage;
