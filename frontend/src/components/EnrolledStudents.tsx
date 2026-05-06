import React, { useState, useEffect } from "react";
import { EnrolledStudent, myAssignedSubjectsApi } from "../api/academics";
import Button from "./ui/Button";
import Modal from "./ui/Modal";
import {
  Users,
  User,
  Search,
  Download,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

interface EnrolledStudentsProps {
  subjectId: number;
  subjectName: string;
  academicYearId: number;
  academicYearName: string;
  isOpen: boolean;
  onClose: () => void;
}

type SortField =
  | "name"
  | "username"
  | "class_group"
  | "grade"
  | "program"
  | "enrolled_date";
type SortOrder = "asc" | "desc";

const EnrolledStudents: React.FC<EnrolledStudentsProps> = ({
  subjectId,
  subjectName,
  academicYearId,
  academicYearName,
  isOpen,
  onClose,
}) => {
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<EnrolledStudent[]>(
    []
  );
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [selectedProgram, setSelectedProgram] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  useEffect(() => {
    if (isOpen) {
      loadEnrolledStudents();
    }
  }, [isOpen, subjectId, academicYearId]);

  useEffect(() => {
    filterAndSortStudents();
  }, [
    students,
    searchTerm,
    selectedGrade,
    selectedProgram,
    sortField,
    sortOrder,
  ]);

  const loadEnrolledStudents = async () => {
    setLoading(true);
    try {
      const response = await myAssignedSubjectsApi.getEnrolledStudents(
        subjectId,
        academicYearId
      );
      setStudents(response.data.data || []);
    } catch (error) {
      console.error("Failed to load enrolled students:", error);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortStudents = () => {
    let filtered = students;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (student) =>
          student.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          student.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          student.username.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Grade filter
    if (selectedGrade !== "all") {
      filtered = filtered.filter(
        (student) => student.grade_name === selectedGrade
      );
    }

    // Program filter
    if (selectedProgram !== "all") {
      filtered = filtered.filter(
        (student) => student.program_name === selectedProgram
      );
    }

    // Sorting
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortField) {
        case "name":
          aValue = `${a.first_name} ${a.last_name}`.toLowerCase();
          bValue = `${b.first_name} ${b.last_name}`.toLowerCase();
          break;
        case "username":
          aValue = a.username.toLowerCase();
          bValue = b.username.toLowerCase();
          break;
        case "class_group":
          aValue = (a.class_group_name || "").toLowerCase();
          bValue = (b.class_group_name || "").toLowerCase();
          break;
        case "grade":
          aValue = (a.grade_name || "").toLowerCase();
          bValue = (b.grade_name || "").toLowerCase();
          break;
        case "program":
          aValue = (a.program_name || "").toLowerCase();
          bValue = (b.program_name || "").toLowerCase();
          break;
        case "enrolled_date":
          aValue = new Date(a.enrolled_at).getTime();
          bValue = new Date(b.enrolled_at).getTime();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
      if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    setFilteredStudents(filtered);
  };

  const getUniqueGrades = () => {
    return Array.from(
      new Set(
        students.map((s) => s.grade_name).filter((g): g is string => g != null)
      )
    );
  };

  const getUniquePrograms = () => {
    return Array.from(
      new Set(
        students
          .map((s) => s.program_name)
          .filter((p): p is string => p != null)
      )
    );
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <div className="w-4 h-4" />;
    return sortOrder === "asc" ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  const exportToCSV = () => {
    const headers = [
      "Name",
      "Username",
      "Gender",
      "Class Group",
      "Grade",
      "Program",
      "Enrolled Date",
    ];
    const csvContent = [
      headers.join(","),
      ...filteredStudents.map((student) =>
        [
          `"${student.first_name} ${student.last_name}"`,
          student.username,
          student.gender || "",
          `"${student.class_group_name || ""}"`,
          `"${student.grade_name || ""}"`,
          `"${student.program_name || ""}"`,
          new Date(student.enrolled_at).toLocaleDateString(),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${subjectName.replace(/\s+/g, "_")}_students.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Enrolled Students - ${subjectName}`}
      size="2xl"
    >
      <div className="space-y-4">
        {/* Header Stats */}
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl p-4 border border-blue-100 dark:border-blue-800/50">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                Total Students
              </p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {filteredStudents.length}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {academicYearName}
            </p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
              {subjectName}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search name or username..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Grades</option>
            {getUniqueGrades().map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>

          <select
            value={selectedProgram}
            onChange={(e) => setSelectedProgram(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Programs</option>
            {getUniquePrograms().map((program) => (
              <option key={program} value={program}>
                {program}
              </option>
            ))}
          </select>

          <Button
            onClick={exportToCSV}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-full flex items-center gap-2 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="text-center py-12">
            <User className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
              {students.length === 0
                ? "No students enrolled"
                : "No results found"}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {students.length === 0
                ? "No students are enrolled in this subject yet."
                : "Try adjusting your search or filters."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort("name")}
                      className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                    >
                      Name
                      <SortIcon field="name" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort("username")}
                      className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                    >
                      Username
                      <SortIcon field="username" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort("class_group")}
                      className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                    >
                      Class
                      <SortIcon field="class_group" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort("grade")}
                      className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                    >
                      Grade
                      <SortIcon field="grade" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort("program")}
                      className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                    >
                      Program
                      <SortIcon field="program" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort("enrolled_date")}
                      className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                    >
                      Enrolled
                      <SortIcon field="enrolled_date" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student, index) => (
                  <tr
                    key={student.user_id}
                    className={`border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                      index % 2 === 0
                        ? "bg-white dark:bg-gray-800/30"
                        : "bg-gray-50/50 dark:bg-gray-800/50"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            student.gender === "MALE"
                              ? "bg-blue-100 dark:bg-blue-900/30"
                              : student.gender === "FEMALE"
                              ? "bg-pink-100 dark:bg-pink-900/30"
                              : "bg-gray-100 dark:bg-gray-700"
                          }`}
                        >
                          <User
                            className={`w-4 h-4 ${
                              student.gender === "MALE"
                                ? "text-blue-600 dark:text-blue-400"
                                : student.gender === "FEMALE"
                                ? "text-pink-600 dark:text-pink-400"
                                : "text-gray-500"
                            }`}
                          />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {student.first_name} {student.last_name}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      @{student.username}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {student.class_group_name || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                        {student.grade_name || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">
                      {student.program_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">
                      {new Date(student.enrolled_at).toLocaleDateString(
                        "en-US",
                        {
                          year: "2-digit",
                          month: "short",
                          day: "numeric",
                        }
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex justify-end mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button
          onClick={onClose}
          className="bg-gray-600 hover:bg-gray-700 text-white text-sm px-6 py-2 rounded-full"
        >
          Close
        </Button>
      </div>
    </Modal>
  );
};

export default EnrolledStudents;
