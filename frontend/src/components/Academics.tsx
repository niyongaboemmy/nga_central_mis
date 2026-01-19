import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useToast } from "../contexts/ToastContext";
import {
  Clock,
  GraduationCap,
  BarChart3,
  BookOpen,
  Users,
  Calendar1,
} from "lucide-react";
import {
  academicYearsApi,
  academicTermsApi,
  programsApi,
  gradesApi,
  subjectsApi,
  classGroupsApi,
  courseCategoriesApi,
  AcademicYear,
  AcademicTerm,
  Program,
  Grade,
  Subject,
  ClassGroup,
  CourseCategory,
} from "../api/academics";

// Import sub-components
import AcademicYearsTab from "./academics/AcademicYearsTab";
import AcademicTermsTab from "./academics/AcademicTermsTab";
import ProgramsTab from "./academics/ProgramsTab";
import GradesTab from "./academics/GradesTab";
import SubjectsTab from "./academics/SubjectsTab";
import ClassGroupsTab from "./academics/ClassGroupsTab";
import CourseCategoriesTab from "./academics/CourseCategoriesTab";

const Academics: React.FC = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState("academic-years");

  // State for data
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [academicTerms, setAcademicTerms] = useState<AcademicTerm[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  const [courseCategories, setCourseCategories] = useState<CourseCategory[]>(
    [],
  );

  // Loading states
  const [loading, setLoading] = useState({
    academicYears: false,
    academicTerms: false,
    programs: false,
    grades: false,
    subjects: false,
    classGroups: false,
    courseCategories: false,
  });

  // Fetch data functions
  const fetchAcademicYears = async () => {
    setLoading((prev) => ({ ...prev, academicYears: true }));
    try {
      const response = await academicYearsApi.getAll();
      setAcademicYears(response.data.data);
    } catch (error: any) {
      showToast("Failed to fetch academic years", "error");
    } finally {
      setLoading((prev) => ({ ...prev, academicYears: false }));
    }
  };

  const fetchAcademicTerms = async () => {
    setLoading((prev) => ({ ...prev, academicTerms: true }));
    try {
      const response = await academicTermsApi.getAll();
      setAcademicTerms(response.data.data);
    } catch (error: any) {
      showToast("Failed to fetch academic terms", "error");
    } finally {
      setLoading((prev) => ({ ...prev, academicTerms: false }));
    }
  };

  const fetchPrograms = async () => {
    setLoading((prev) => ({ ...prev, programs: true }));
    try {
      const response = await programsApi.getAll();
      setPrograms(response.data.data);
    } catch (error: any) {
      showToast("Failed to fetch programs", "error");
    } finally {
      setLoading((prev) => ({ ...prev, programs: false }));
    }
  };

  const fetchGrades = async () => {
    setLoading((prev) => ({ ...prev, grades: true }));
    try {
      const response = await gradesApi.getAll();
      setGrades(response.data.data);
    } catch (error: any) {
      showToast("Failed to fetch grades", "error");
    } finally {
      setLoading((prev) => ({ ...prev, grades: false }));
    }
  };

  const fetchSubjects = async () => {
    setLoading((prev) => ({ ...prev, subjects: true }));
    try {
      const response = await subjectsApi.getAll();
      setSubjects(response.data.data);
    } catch (error: any) {
      showToast("Failed to fetch subjects", "error");
    } finally {
      setLoading((prev) => ({ ...prev, subjects: false }));
    }
  };

  const fetchClassGroups = async () => {
    setLoading((prev) => ({ ...prev, classGroups: true }));
    try {
      const response = await classGroupsApi.getAll();
      setClassGroups(response.data.data);
    } catch (error: any) {
      showToast("Failed to fetch class groups", "error");
    } finally {
      setLoading((prev) => ({ ...prev, classGroups: false }));
    }
  };

  const fetchCourseCategories = async () => {
    setLoading((prev) => ({ ...prev, courseCategories: true }));
    try {
      const response = await courseCategoriesApi.getAll();
      setCourseCategories(response.data.data);
    } catch (error: any) {
      showToast("Failed to fetch course categories", "error");
    } finally {
      setLoading((prev) => ({ ...prev, courseCategories: false }));
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchAcademicYears();
    fetchAcademicTerms();
    fetchPrograms();
    fetchGrades();
    fetchSubjects();
    fetchClassGroups();
    fetchCourseCategories();
  }, []);

  const tabs = [
    {
      id: "academic-years",
      label: "Academic Years",
      icon: Calendar1,
      color: "text-blue-500",
    },
    {
      id: "academic-terms",
      label: "Academic Terms",
      icon: Clock,
      color: "text-green-500",
    },
    {
      id: "programs",
      label: "Programs",
      icon: GraduationCap,
      color: "text-purple-500",
    },
    {
      id: "grades",
      label: "Grades",
      icon: BarChart3,
      color: "text-orange-500",
    },
    {
      id: "course-categories",
      label: "Course Categories",
      icon: BookOpen,
      color: "text-pink-500",
    },
    {
      id: "subjects",
      label: "Subjects",
      icon: BookOpen,
      color: "text-red-500",
    },
    {
      id: "class-groups",
      label: "Class Groups",
      icon: Users,
      color: "text-indigo-500",
    },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "academic-years":
        return (
          <AcademicYearsTab
            data={academicYears}
            loading={loading.academicYears}
            onRefresh={fetchAcademicYears}
            onCreate={async (data) => {
              await academicYearsApi.create(data);
              fetchAcademicYears();
              showToast("Academic year created successfully", "success");
            }}
            onUpdate={async (id, data) => {
              await academicYearsApi.update(id, data);
              fetchAcademicYears();
              showToast("Academic year updated successfully", "success");
            }}
            onDelete={async (id) => {
              await academicYearsApi.delete(id);
              fetchAcademicYears();
              showToast("Academic year deleted successfully", "success");
            }}
          />
        );
      case "academic-terms":
        return (
          <AcademicTermsTab
            data={academicTerms}
            academicYears={academicYears}
            loading={loading.academicTerms}
            onRefresh={fetchAcademicTerms}
            onCreate={async (data) => {
              await academicTermsApi.create(data);
              fetchAcademicTerms();
              showToast("Academic term created successfully", "success");
            }}
            onUpdate={async (id, data) => {
              await academicTermsApi.update(id, data);
              fetchAcademicTerms();
              showToast("Academic term updated successfully", "success");
            }}
            onDelete={async (id) => {
              await academicTermsApi.delete(id);
              fetchAcademicTerms();
              showToast("Academic term deleted successfully", "success");
            }}
          />
        );
      case "programs":
        return (
          <ProgramsTab
            data={programs}
            loading={loading.programs}
            onRefresh={fetchPrograms}
            onCreate={async (data) => {
              await programsApi.create(data);
              fetchPrograms();
              showToast("Program created successfully", "success");
            }}
            onUpdate={async (id, data) => {
              await programsApi.update(id, data);
              fetchPrograms();
              showToast("Program updated successfully", "success");
            }}
            onDelete={async (id) => {
              await programsApi.delete(id);
              fetchPrograms();
              showToast("Program deleted successfully", "success");
            }}
          />
        );
      case "grades":
        return (
          <GradesTab
            data={grades}
            programs={programs}
            loading={loading.grades}
            onRefresh={fetchGrades}
            onCreate={async (data) => {
              await gradesApi.create(data);
              fetchGrades();
              showToast("Grade created successfully", "success");
            }}
            onUpdate={async (id, data) => {
              await gradesApi.update(id, data);
              fetchGrades();
              showToast("Grade updated successfully", "success");
            }}
            onDelete={async (id) => {
              await gradesApi.delete(id);
              fetchGrades();
              showToast("Grade deleted successfully", "success");
            }}
          />
        );
      case "course-categories":
        return (
          <CourseCategoriesTab
            data={courseCategories}
            loading={loading.courseCategories}
            onRefresh={fetchCourseCategories}
            onCreate={async (data) => {
              await courseCategoriesApi.create(data);
              fetchCourseCategories();
              showToast("Course category created successfully", "success");
            }}
            onUpdate={async (id, data) => {
              await courseCategoriesApi.update(id, data);
              fetchCourseCategories();
              showToast("Course category updated successfully", "success");
            }}
            onDelete={async (id) => {
              await courseCategoriesApi.delete(id);
              fetchCourseCategories();
              showToast("Course category deleted successfully", "success");
            }}
          />
        );
      case "subjects":
        return (
          <SubjectsTab
            data={subjects}
            loading={loading.subjects}
            onRefresh={fetchSubjects}
            onCreate={async (data) => {
              await subjectsApi.create(data);
              fetchSubjects();
              showToast("Subject created successfully", "success");
            }}
            onUpdate={async (id, data) => {
              await subjectsApi.update(id, data);
              fetchSubjects();
              showToast("Subject updated successfully", "success");
            }}
            onDelete={async (id) => {
              await subjectsApi.delete(id);
              fetchSubjects();
              showToast("Subject deleted successfully", "success");
            }}
          />
        );
      case "class-groups":
        return (
          <ClassGroupsTab
            data={classGroups}
            academicYears={academicYears}
            grades={grades}
            loading={loading.classGroups}
            onRefresh={fetchClassGroups}
            onCreate={async (data) => {
              await classGroupsApi.create(data);
              fetchClassGroups();
              showToast("Class group created successfully", "success");
            }}
            onUpdate={async (id, data) => {
              await classGroupsApi.update(id, data);
              fetchClassGroups();
              showToast("Class group updated successfully", "success");
            }}
            onDelete={async (id) => {
              await classGroupsApi.delete(id);
              fetchClassGroups();
              showToast("Class group deleted successfully", "success");
            }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="px-4 md:px-6 pb-8">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{ repeat: Infinity, duration: 8 }}
          className="absolute top-20 right-[10%] w-96 h-96 bg-blue-200/30 dark:bg-blue-900/20 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.1, 0.15, 0.1],
          }}
          transition={{ repeat: Infinity, duration: 10, delay: 2 }}
          className="absolute bottom-20 left-[10%] w-[500px] h-[500px] bg-purple-200/30 dark:bg-purple-900/20 rounded-full blur-3xl"
        />
      </div>

      <div className="relative z-10 pt-4 pb-4">
        <div className="max-w-7xl mx-auto">
          {/* Tabs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-slate-800/70 rounded-2xl lg:rounded-full border border-white dark:border-slate-700/40 p-3"
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
                  transition={{ delay: 0.3 + index * 0.1 }}
                  whileHover={{
                    scale: 1.05,
                  }}
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
                  <span>{tab.label}</span>
                </motion.button>
              ))}
            </nav>
          </motion.div>
        </div>
      </div>
      {renderTabContent()}
    </div>
  );
};

export default Academics;
