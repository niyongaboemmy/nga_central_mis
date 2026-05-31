import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  EnrolledStudent,
  myAssignedSubjectsApi,
  studentEnrollmentApi,
} from "../api/academics";
import { documentsApi } from "../api/documents";
import Button from "./ui/Button";
import Modal from "./ui/Modal";
import CurriculumTab from "./curriculum/CurriculumTab";
import SubjectMaterialsTab from "./curriculum/SubjectMaterialsTab";
import { usePermissions } from "../hooks/usePermissions";
import { useToast } from "../contexts/ToastContext";
import { Permissions } from "../constants/permissions";
import {
  Users,
  User,
  Search,
  Download,
  ChevronUp,
  ChevronDown,
  BookOpen,
  Files,
  UserPlus,
  UserMinus,
  X,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface EnrolledStudentsProps {
  subjectId: number;
  subjectName: string;
  academicYearId: number;
  academicYearName: string;
  isOpen: boolean;
  onClose: () => void;
}

interface SearchUser {
  user_id: number;
  username: string;
  first_name: string | null;
  last_name: string | null;
  user_type: string | null;
}

type SortField =
  | "name"
  | "username"
  | "class_group"
  | "grade"
  | "program"
  | "enrolled_date";
type SortOrder = "asc" | "desc";
type ActiveTab = "students" | "curriculum" | "materials";

const tabs = [
  { id: "students" as const, label: "Enrolled Students", icon: Users },
  { id: "curriculum" as const, label: "Curriculum", icon: BookOpen },
  { id: "materials" as const, label: "Subject Materials", icon: Files },
];

const EnrolledStudents: React.FC<EnrolledStudentsProps> = ({
  subjectId,
  subjectName,
  academicYearId,
  academicYearName,
  isOpen,
  onClose,
}) => {
  const { hasPermission } = usePermissions();
  const { showToast } = useToast();

  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<EnrolledStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [selectedProgram, setSelectedProgram] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [activeTab, setActiveTab] = useState<ActiveTab>("students");

  // Enroll / remove state
  const [removingUserId, setRemovingUserId] = useState<number | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState("");
  const [addSearchResults, setAddSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [enrollingUserId, setEnrollingUserId] = useState<number | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canManageEnrollments = hasPermission(
    Permissions.MANAGE_STUDENT_ENROLLMENTS
  );

  useEffect(() => {
    if (isOpen) {
      setActiveTab("students");
      setShowAddPanel(false);
      setAddSearchQuery("");
      setAddSearchResults([]);
      loadEnrolledStudents();
    }
  }, [isOpen, subjectId, academicYearId]);

  useEffect(() => {
    filterAndSortStudents();
  }, [students, searchTerm, selectedGrade, selectedProgram, sortField, sortOrder]);

  const loadEnrolledStudents = async () => {
    setLoading(true);
    try {
      const response = await myAssignedSubjectsApi.getEnrolledStudents(
        subjectId,
        academicYearId
      );
      setStudents(response.data.data || []);
    } catch {
      console.error("Failed to load enrolled students");
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortStudents = () => {
    let filtered = students;

    if (searchTerm) {
      filtered = filtered.filter(
        (s) =>
          s.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.username.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (selectedGrade !== "all") {
      filtered = filtered.filter((s) => s.grade_name === selectedGrade);
    }
    if (selectedProgram !== "all") {
      filtered = filtered.filter((s) => s.program_name === selectedProgram);
    }

    filtered.sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortField) {
        case "name":
          aVal = `${a.first_name} ${a.last_name}`.toLowerCase();
          bVal = `${b.first_name} ${b.last_name}`.toLowerCase();
          break;
        case "username":
          aVal = a.username.toLowerCase();
          bVal = b.username.toLowerCase();
          break;
        case "class_group":
          aVal = (a.class_group_name || "").toLowerCase();
          bVal = (b.class_group_name || "").toLowerCase();
          break;
        case "grade":
          aVal = (a.grade_name || "").toLowerCase();
          bVal = (b.grade_name || "").toLowerCase();
          break;
        case "program":
          aVal = (a.program_name || "").toLowerCase();
          bVal = (b.program_name || "").toLowerCase();
          break;
        case "enrolled_date":
          aVal = new Date(a.enrolled_at).getTime();
          bVal = new Date(b.enrolled_at).getTime();
          break;
        default:
          return 0;
      }
      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    setFilteredStudents(filtered);
  };

  const getUniqueGrades = () =>
    Array.from(
      new Set(students.map((s) => s.grade_name).filter((g): g is string => g != null))
    );

  const getUniquePrograms = () =>
    Array.from(
      new Set(students.map((s) => s.program_name).filter((p): p is string => p != null))
    );

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
    const headers = ["Name", "Username", "Gender", "Class Group", "Grade", "Program", "Enrolled Date"];
    const csvContent = [
      headers.join(","),
      ...filteredStudents.map((s) =>
        [
          `"${s.first_name} ${s.last_name}"`,
          s.username,
          s.gender || "",
          `"${s.class_group_name || ""}"`,
          `"${s.grade_name || ""}"`,
          `"${s.program_name || ""}"`,
          new Date(s.enrolled_at).toLocaleDateString(),
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

  // ── Enroll / Remove handlers ──────────────────────────────────────────────

  const handleRemoveStudent = async (student: EnrolledStudent) => {
    setRemovingUserId(student.user_id);
    try {
      await studentEnrollmentApi.unenroll(student.user_id, subjectId, academicYearId);
      setStudents((prev) => prev.filter((s) => s.user_id !== student.user_id));
      showToast(`${student.first_name} ${student.last_name} removed from subject`, "success");
    } catch {
      showToast("Failed to remove student", "error");
    } finally {
      setRemovingUserId(null);
    }
  };

  const handleAddSearchChange = useCallback((query: string) => {
    setAddSearchQuery(query);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!query.trim()) {
      setAddSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await documentsApi.searchUsers(query);
        const raw = (response.data as any)?.data ?? response.data ?? [];
        setAddSearchResults(Array.isArray(raw) ? raw : []);
      } catch {
        showToast("Failed to search users", "error");
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  const handleEnrollStudent = async (user: SearchUser) => {
    setEnrollingUserId(user.user_id);
    try {
      await studentEnrollmentApi.enroll({
        user_id: user.user_id,
        subject_id: subjectId,
        academic_year_id: academicYearId,
      });
      showToast(
        `${user.first_name || user.username} enrolled successfully`,
        "success"
      );
      setAddSearchResults((prev) => prev.filter((u) => u.user_id !== user.user_id));
      loadEnrolledStudents();
    } catch {
      showToast("Failed to enroll student", "error");
    } finally {
      setEnrollingUserId(null);
    }
  };

  const enrolledIds = new Set(students.map((s) => s.user_id));

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={subjectName} size="2xl">
      <div className="flex flex-col gap-4">

        {/* Header Stats — Students tab only */}
        <AnimatePresence initial={false}>
          {activeTab === "students" && (
            <motion.div
              key="stats"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl p-4 border border-blue-100 dark:border-blue-800/50"
            >
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
                <p className="text-xs text-gray-500 dark:text-gray-400">{academicYearName}</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                  {subjectName}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800/60 p-1 rounded-xl w-fit">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  isActive
                    ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >

            {/* ── Students Tab ─────────────────────────────────────────── */}
            {activeTab === "students" && (
              <div className="space-y-3">

                {/* Toolbar */}
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
                    {getUniqueGrades().map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>

                  <select
                    value={selectedProgram}
                    onChange={(e) => setSelectedProgram(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Programs</option>
                    {getUniquePrograms().map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>

                  <div className="flex gap-2">
                    <Button
                      onClick={exportToCSV}
                      className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm px-4 py-2 rounded-full flex items-center gap-2 whitespace-nowrap"
                    >
                      <Download className="w-4 h-4" />
                      Export
                    </Button>

                    {canManageEnrollments && (
                      <Button
                        onClick={() => {
                          setShowAddPanel(!showAddPanel);
                          if (showAddPanel) {
                            setAddSearchQuery("");
                            setAddSearchResults([]);
                          }
                        }}
                        className={`text-sm px-4 py-2 rounded-full flex items-center gap-2 whitespace-nowrap transition-all ${
                          showAddPanel
                            ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                            : "bg-blue-600 hover:bg-blue-700 text-white"
                        }`}
                      >
                        {showAddPanel ? (
                          <X className="w-4 h-4" />
                        ) : (
                          <UserPlus className="w-4 h-4" />
                        )}
                        {showAddPanel ? "Cancel" : "Add Student"}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Add Student Panel */}
                <AnimatePresence>
                  {showAddPanel && canManageEnrollments && (
                    <motion.div
                      key="add-panel"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: "easeInOut" }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="border border-blue-200 dark:border-blue-800/50 rounded-2xl bg-blue-50/50 dark:bg-blue-900/10 p-4 space-y-3">
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">
                          Search &amp; Enroll Student
                        </p>

                        {/* Search box */}
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          {searching && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
                          )}
                          <input
                            type="text"
                            autoFocus
                            placeholder="Type a name or username to search..."
                            value={addSearchQuery}
                            onChange={(e) => handleAddSearchChange(e.target.value)}
                            className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        {/* Results */}
                        <AnimatePresence>
                          {addSearchQuery.trim() && !searching && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="space-y-2 max-h-52 overflow-y-auto"
                            >
                              {addSearchResults.length === 0 ? (
                                <div className="flex items-center gap-2 py-4 justify-center text-gray-400 dark:text-gray-500 text-sm">
                                  <AlertCircle className="w-4 h-4" />
                                  No users found for &quot;{addSearchQuery}&quot;
                                </div>
                              ) : (
                                addSearchResults.map((user) => {
                                  const alreadyEnrolled = enrolledIds.has(user.user_id);
                                  const isEnrolling = enrollingUserId === user.user_id;
                                  return (
                                    <div
                                      key={user.user_id}
                                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${
                                        alreadyEnrolled
                                          ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/40 opacity-70"
                                          : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                                      }`}
                                    >
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                                          <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                        </div>
                                        <div>
                                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                                            {user.first_name || user.last_name
                                              ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()
                                              : user.username}
                                          </p>
                                          <p className="text-xs text-gray-500 dark:text-gray-400">
                                            @{user.username}
                                            {user.user_type && (
                                              <span className="ml-2 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-500 dark:text-gray-400">
                                                {user.user_type}
                                              </span>
                                            )}
                                          </p>
                                        </div>
                                      </div>

                                      {alreadyEnrolled ? (
                                        <span className="text-xs font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
                                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                                          Enrolled
                                        </span>
                                      ) : (
                                        <button
                                          onClick={() => handleEnrollStudent(user)}
                                          disabled={isEnrolling}
                                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-medium rounded-full transition-colors"
                                        >
                                          {isEnrolling ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                          ) : (
                                            <UserPlus className="w-3 h-3" />
                                          )}
                                          Enroll
                                        </button>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Student Table */}
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-14 gap-3">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">
                      Loading students...
                    </p>
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="text-center py-14">
                    <User className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                      {students.length === 0 ? "No students enrolled" : "No results found"}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {students.length === 0
                        ? "Use the Add Student button to enroll students."
                        : "Try adjusting your search or filters."}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                          {(
                            [
                              { label: "Name", field: "name" },
                              { label: "Username", field: "username" },
                              { label: "Class", field: "class_group" },
                              { label: "Grade", field: "grade" },
                              { label: "Program", field: "program" },
                              { label: "Enrolled", field: "enrolled_date" },
                            ] as { label: string; field: SortField }[]
                          ).map(({ label, field }) => (
                            <th key={field} className="px-4 py-3 text-left">
                              <button
                                onClick={() => handleSort(field)}
                                className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                              >
                                {label}
                                <SortIcon field={field} />
                              </button>
                            </th>
                          ))}
                          {canManageEnrollments && (
                            <th className="px-4 py-3 text-left w-16" />
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence initial={false}>
                          {filteredStudents.map((student, index) => (
                            <motion.tr
                              key={student.user_id}
                              layout
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, x: 40 }}
                              transition={{ duration: 0.18 }}
                              className={`group border-b border-gray-100 dark:border-gray-700 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors ${
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
                                  <p className="font-medium text-gray-900 dark:text-white">
                                    {student.first_name} {student.last_name}
                                  </p>
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
                                {new Date(student.enrolled_at).toLocaleDateString("en-US", {
                                  year: "2-digit",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </td>
                              {canManageEnrollments && (
                                <td className="px-3 py-3">
                                  <button
                                    onClick={() => handleRemoveStudent(student)}
                                    disabled={removingUserId === student.user_id}
                                    title="Remove student from subject"
                                    className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all disabled:opacity-50"
                                  >
                                    {removingUserId === student.user_id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <UserMinus className="w-3.5 h-3.5" />
                                    )}
                                    Remove
                                  </button>
                                </td>
                              )}
                            </motion.tr>
                          ))}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === "curriculum" && <CurriculumTab subjectId={subjectId} />}
            {activeTab === "materials" && <SubjectMaterialsTab subjectId={subjectId} />}
          </motion.div>
        </AnimatePresence>
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
