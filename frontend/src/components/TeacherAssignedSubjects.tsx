import React, { useState, useEffect } from "react";
import { MyAssignedSubject, myAssignedSubjectsApi } from "../api/academics";
import Button from "./ui/Button";
import EnrolledStudents from "./EnrolledStudents";
import {
  BookOpen,
  Users,
  GraduationCap,
  Calendar,
  Eye,
  Filter,
  Search,
  BarChart3,
} from "lucide-react";

const TeacherAssignedSubjects: React.FC = () => {
  const [subjects, setSubjects] = useState<MyAssignedSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStudentsModal, setShowStudentsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTerm, setFilterTerm] = useState<string>("all");
  const [selectedSubjectData, setSelectedSubjectData] = useState<{
    subjectId: number;
    subjectName: string;
    academicTermId: number;
    academicTermName: string;
  } | null>(null);

  useEffect(() => {
    loadAssignedSubjects();
  }, []);

  const loadAssignedSubjects = async () => {
    try {
      const response = await myAssignedSubjectsApi.getAll();
      setSubjects(response.data.data || []);
    } catch (error) {
      console.error("Failed to load assigned subjects:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewStudents = (subject: MyAssignedSubject, grade: any) => {
    setSelectedSubjectData({
      subjectId: subject.subject_id,
      subjectName: subject.subject_name,
      academicTermId: grade.academic_term_id,
      academicTermName: grade.academic_term_name,
    });
    setShowStudentsModal(true);
  };

  const getUniqueGrades = () => {
    const gradeSet = new Set<string>();
    subjects.forEach((subject) => {
      subject.grades.forEach((grade) => {
        gradeSet.add(`${grade.grade_name} - ${grade.program_name}`);
      });
    });
    return gradeSet.size;
  };

  const getTotalClassGroups = () => {
    const classGroupSet = new Set<string>();
    subjects.forEach((subject) => {
      subject.grades.forEach((grade) => {
        classGroupSet.add(grade.class_group_name);
      });
    });
    return classGroupSet.size;
  };

  const getUniqueTerm = () => {
    const termSet = new Set<string>();
    subjects.forEach((subject) => {
      subject.grades.forEach((grade) => {
        termSet.add(grade.academic_term_name);
      });
    });
    return Array.from(termSet);
  };

  const filteredSubjects = subjects
    .map((subject) => ({
      ...subject,
      grades:
        filterTerm === "all"
          ? subject.grades
          : subject.grades.filter((g) => g.academic_term_name === filterTerm),
    }))
    .filter(
      (subject) =>
        subject.subject_name
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        subject.subject_code?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .filter((subject) => subject.grades.length > 0);

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

  const uniqueTerms = getUniqueTerm();

  return (
    <>
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
            {/* <BookOpen className="w-12 h-12 opacity-20 animate-pulse" /> */}
          </div>

          {/* Stats Row */}
          <div className="flex flex-row flex-wrap justify-center gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 hover:bg-white/20 transition-all duration-200 w-full sm:w-max">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-blue-200 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-blue-100 text-xs">Total Subjects</p>
                  <p className="text-xl font-bold">{subjects.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 hover:bg-white/20 transition-all duration-200 w-full sm:w-max">
              <div className="flex items-center gap-2">
                <Users className="w-6 h-6 text-blue-200 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-blue-100 text-xs">Class Groups</p>
                  <p className="text-xl font-bold">{getTotalClassGroups()}</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 hover:bg-white/20 transition-all duration-200 w-full sm:w-max">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-6 h-6 text-blue-200 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-blue-100 text-xs">Grades/Programs</p>
                  <p className="text-xl font-bold">{getUniqueGrades()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filter Section */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search subjects by name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/40 rounded-2xl px-4 py-3">
            <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <select
              value={filterTerm}
              onChange={(e) => setFilterTerm(e.target.value)}
              className="bg-transparent text-gray-900 dark:text-white focus:outline-none text-sm"
            >
              <option value="all">All Terms</option>
              {uniqueTerms.map((term) => (
                <option key={term} value={term}>
                  {term}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Subjects Grid */}
        {filteredSubjects.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <BookOpen className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              {subjects.length === 0
                ? "No Assigned Subjects"
                : "No matches found"}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto">
              {subjects.length === 0
                ? "Subjects will appear once you're assigned to classes."
                : "Try adjusting your search or filters."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredSubjects.map((subject) => (
              <div
                key={subject.subject_id}
                className="group bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700/40 overflow-hidden shadow-sm hover:shadow-lg hover:scale-105 transition-all duration-300 hover:border-blue-300 dark:hover:border-blue-600"
              >
                {/* Subject Header */}
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-900 p-4 border-b border-gray-200 dark:border-gray-700/60">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-xl flex items-center justify-center group-hover:bg-blue-200 dark:group-hover:bg-blue-800/50 transition-colors">
                        <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                          {subject.subject_name}
                        </h3>
                        {subject.subject_code && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {subject.subject_code}
                          </p>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-semibold px-2 py-0.5 rounded-full truncate">
                        {subject.grades.length} class
                        {subject.grades.length !== 1 ? "es" : ""}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Assignments */}
                <div className="p-4 space-y-2">
                  {subject.grades.map((grade, index) => (
                    <div
                      key={index}
                      className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600/20 rounded-xl p-3 hover:bg-gray-100 dark:hover:bg-gray-800/40 transition-all duration-200 hover:border-blue-300 dark:hover:border-blue-500"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 dark:text-white text-xs mb-1">
                            {grade.grade_name}
                            <span className="text-gray-500 dark:text-gray-400 font-normal">
                              {" "}
                              • {grade.program_name}
                            </span>
                          </h4>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                            <span className="flex items-center gap-1 bg-white dark:bg-gray-800 px-2 py-0.5 rounded-md">
                              <Users className="w-3 h-3" />
                              {grade.class_group_name}
                            </span>
                            <span className="flex items-center gap-1 bg-white dark:bg-gray-800 px-2 py-0.5 rounded-md">
                              <Calendar className="w-3 h-3" />
                              {grade.academic_term_name} (
                              {grade.academic_year_name})
                            </span>
                          </div>
                        </div>
                        <Button
                          onClick={() => handleViewStudents(subject, grade)}
                          className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-full px-3 py-1.5 flex items-center gap-1.5 whitespace-nowrap text-xs font-medium transition-colors shadow-sm hover:shadow-md"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">View</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Enrolled Students Modal */}
      {selectedSubjectData && (
        <EnrolledStudents
          subjectId={selectedSubjectData.subjectId}
          subjectName={selectedSubjectData.subjectName}
          academicTermId={selectedSubjectData.academicTermId}
          academicTermName={selectedSubjectData.academicTermName}
          isOpen={showStudentsModal}
          onClose={() => {
            setShowStudentsModal(false);
            setSelectedSubjectData(null);
          }}
        />
      )}
    </>
  );
};

export default TeacherAssignedSubjects;
