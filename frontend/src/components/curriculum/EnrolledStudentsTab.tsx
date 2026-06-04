import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import {
  Users,
  Search,
  FileSpreadsheet,
  ChevronUp,
  ChevronDown as ChevronDownSm,
  UserPlus,
  UserMinus,
  X,
  AlertCircle,
  Loader2,
  Filter,
  GraduationCap,
} from "lucide-react";
import {
  AcademicYear,
  EnrolledStudent,
  academicYearsApi,
  myAssignedSubjectsApi,
  studentEnrollmentApi,
} from "../../api/academics";
import { userApi } from "../../api/documents";
import { usePermissions } from "../../hooks/usePermissions";
import { useToast } from "../../contexts/ToastContext";
import { Permissions } from "../../constants/permissions";

interface SearchUser {
  user_id: number;
  username: string;
  first_name: string | null;
  last_name: string | null;
  user_type: string | null;
}

type SortField = "name" | "username" | "class_group" | "grade" | "program" | "enrolled_date";
type SortOrder = "asc" | "desc";

interface Props {
  subjectId: number;
  subjectName: string;
}

const EnrolledStudentsTab: React.FC<Props> = ({ subjectId, subjectName }) => {
  const { hasPermission } = usePermissions();
  const { showToast } = useToast();
  const canManage = hasPermission(Permissions.MANAGE_STUDENT_ENROLLMENTS);

  // Academic year
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [yearsLoading, setYearsLoading] = useState(true);

  // Students
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGrade, setSelectedGrade] = useState("all");
  const [selectedProgram, setSelectedProgram] = useState("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // Add panel
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [enrollingId, setEnrollingId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load years on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await academicYearsApi.getAll();
        const data: AcademicYear[] = (res.data as any)?.data ?? res.data ?? [];
        setYears(data);
        const current = data.find((y) => y.is_current) ?? data[0];
        if (current) setSelectedYearId(current.academic_year_id);
      } finally {
        setYearsLoading(false);
      }
    })();
  }, []);

  // Load students when year changes
  useEffect(() => {
    if (selectedYearId) loadStudents();
  }, [selectedYearId, subjectId]);

  const loadStudents = async () => {
    if (!selectedYearId) return;
    setLoading(true);
    try {
      const res = await myAssignedSubjectsApi.getEnrolledStudents(subjectId, selectedYearId);
      setStudents(res.data.data ?? []);
    } catch {
      showToast("Failed to load students", "error");
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  // Derived / filtered list
  const filteredStudents = (() => {
    let list = students;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (s) =>
          s.first_name.toLowerCase().includes(q) ||
          s.last_name.toLowerCase().includes(q) ||
          s.username.toLowerCase().includes(q)
      );
    }
    if (selectedGrade !== "all") list = list.filter((s) => s.grade_name === selectedGrade);
    if (selectedProgram !== "all") list = list.filter((s) => s.program_name === selectedProgram);

    return [...list].sort((a, b) => {
      let av = "", bv = "";
      switch (sortField) {
        case "name":
          av = `${a.first_name} ${a.last_name}`.toLowerCase();
          bv = `${b.first_name} ${b.last_name}`.toLowerCase();
          break;
        case "username":
          av = a.username.toLowerCase();
          bv = b.username.toLowerCase();
          break;
        case "class_group":
          av = (a.class_group_name ?? "").toLowerCase();
          bv = (b.class_group_name ?? "").toLowerCase();
          break;
        case "grade":
          av = (a.grade_name ?? "").toLowerCase();
          bv = (b.grade_name ?? "").toLowerCase();
          break;
        case "program":
          av = (a.program_name ?? "").toLowerCase();
          bv = (b.program_name ?? "").toLowerCase();
          break;
        case "enrolled_date":
          return sortOrder === "asc"
            ? new Date(a.enrolled_at).getTime() - new Date(b.enrolled_at).getTime()
            : new Date(b.enrolled_at).getTime() - new Date(a.enrolled_at).getTime();
      }
      if (av < bv) return sortOrder === "asc" ? -1 : 1;
      if (av > bv) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  })();

  const uniqueGrades = Array.from(new Set(students.map((s) => s.grade_name).filter(Boolean) as string[]));
  const uniquePrograms = Array.from(new Set(students.map((s) => s.program_name).filter(Boolean) as string[]));

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortOrder("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) =>
    sortField !== field ? <div className="w-3 h-3" /> :
    sortOrder === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDownSm className="w-3 h-3" />;

  const selectedYear = years.find((y) => y.academic_year_id === selectedYearId);

  // Excel export
  const exportToExcel = () => {
    const rows = filteredStudents.map((s, i) => ({
      "#": i + 1,
      "Full Name": `${s.first_name} ${s.last_name}`,
      Username: s.username,
      Gender: s.gender ?? "—",
      "Class Group": s.class_group_name ?? "—",
      Grade: s.grade_name ?? "—",
      Program: s.program_name ?? "—",
      "Enrolled Date": new Date(s.enrolled_at).toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric",
      }),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    // Auto column widths
    const colWidths = Object.keys(rows[0] ?? {}).map((k) => ({
      wch: Math.max(k.length, ...rows.map((r) => String((r as any)[k]).length)) + 2,
    }));
    ws["!cols"] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, `${subjectName.replace(/\s+/g, "_")}_students_${selectedYear?.name ?? ""}.xlsx`);
  };

  // Add student search
  const handleAddQuery = useCallback((q: string) => {
    setAddQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setAddResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await userApi.searchUsers(q);
        const raw = (res.data as any)?.data ?? res.data ?? [];
        setAddResults(Array.isArray(raw) ? raw : []);
      } catch {
        showToast("Search failed", "error");
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  const handleEnroll = async (user: SearchUser) => {
    if (!selectedYearId) return;
    setEnrollingId(user.user_id);
    try {
      await studentEnrollmentApi.enroll({
        user_id: user.user_id,
        subject_id: subjectId,
        academic_year_id: selectedYearId,
      });
      showToast(`${user.first_name ?? user.username} enrolled`, "success");
      setAddResults((prev) => prev.filter((u) => u.user_id !== user.user_id));
      loadStudents();
    } catch {
      showToast("Failed to enroll student", "error");
    } finally {
      setEnrollingId(null);
    }
  };

  const handleRemove = async (s: EnrolledStudent) => {
    if (!selectedYearId) return;
    setRemovingId(s.user_id);
    try {
      await studentEnrollmentApi.unenroll(s.user_id, subjectId, selectedYearId);
      setStudents((prev) => prev.filter((x) => x.user_id !== s.user_id));
      showToast(`${s.first_name} ${s.last_name} removed`, "success");
    } catch {
      showToast("Failed to remove student", "error");
    } finally {
      setRemovingId(null);
    }
  };

  const enrolledIds = new Set(students.map((s) => s.user_id));

  if (yearsLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Year selector */}
        <div className="relative">
          <select
            value={selectedYearId ?? ""}
            onChange={(e) => setSelectedYearId(Number(e.target.value))}
            className="appearance-none pl-9 pr-8 py-2.5 text-sm font-medium border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-sm"
          >
            {years.map((y) => (
              <option key={y.academic_year_id} value={y.academic_year_id}>
                {y.name}{y.is_current ? " (Current)" : ""}
              </option>
            ))}
          </select>
          <GraduationCap className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 pointer-events-none" />
          <ChevronDownSm className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>

        {/* Stats pill */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 rounded-xl text-sm">
          <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="font-bold text-gray-900 dark:text-white">{filteredStudents.length}</span>
          <span className="text-gray-500 dark:text-gray-400">
            {filteredStudents.length !== students.length ? `of ${students.length} ` : ""}students enrolled
          </span>
        </div>

        <div className="sm:ml-auto flex items-center gap-2 flex-wrap">
          {/* Excel download */}
          <button
            onClick={exportToExcel}
            disabled={filteredStudents.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Download Excel
          </button>

          {/* Add student */}
          {canManage && (
            <button
              onClick={() => {
                setShowAddPanel((v) => !v);
                if (showAddPanel) { setAddQuery(""); setAddResults([]); }
              }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-all shadow-sm ${
                showAddPanel
                  ? "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-slate-700"
                  : "bg-blue-600 hover:bg-blue-700 text-white border border-blue-600"
              }`}
            >
              {showAddPanel ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {showAddPanel ? "Cancel" : "Add Student"}
            </button>
          )}
        </div>
      </div>

      {/* Add student panel */}
      <AnimatePresence>
        {showAddPanel && canManage && (
          <motion.div
            key="add-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="rounded-2xl border border-blue-200 dark:border-blue-800/50 bg-blue-50/60 dark:bg-blue-900/10 p-4 space-y-3">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-widest">
                Search &amp; Enroll Student
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
                )}
                <input
                  autoFocus
                  type="text"
                  placeholder="Type a name or username…"
                  value={addQuery}
                  onChange={(e) => handleAddQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <AnimatePresence>
                {addQuery.trim() && !searching && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-2 max-h-56 overflow-y-auto pr-0.5"
                  >
                    {addResults.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-gray-400 text-sm">
                        <AlertCircle className="w-4 h-4" />
                        No users found for &quot;{addQuery}&quot;
                      </div>
                    ) : (
                      addResults.map((u) => {
                        const already = enrolledIds.has(u.user_id);
                        const isEnrolling = enrollingId === u.user_id;
                        const name = u.first_name || u.last_name
                          ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim()
                          : u.username;
                        return (
                          <div
                            key={u.user_id}
                            className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${
                              already
                                ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/40 opacity-70"
                                : "bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                                {name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">{name}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  @{u.username}
                                  {u.user_type && (
                                    <span className="ml-2 px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 rounded text-gray-500">
                                      {u.user_type}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                            {already ? (
                              <span className="text-xs font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                                Enrolled
                              </span>
                            ) : (
                              <button
                                onClick={() => handleEnroll(u)}
                                disabled={isEnrolling}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-medium rounded-full transition-colors"
                              >
                                {isEnrolling ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
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

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or username…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="appearance-none pl-8 pr-7 py-2.5 text-sm border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">All Grades</option>
              {uniqueGrades.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <ChevronDownSm className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
          </div>
          <div className="relative">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <select
              value={selectedProgram}
              onChange={(e) => setSelectedProgram(e.target.value)}
              className="appearance-none pl-8 pr-7 py-2.5 text-sm border border-gray-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">All Programs</option>
              {uniquePrograms.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <ChevronDownSm className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">Loading students…</p>
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700/50">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <Users className="w-7 h-7 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
            {students.length === 0 ? "No students enrolled" : "No results found"}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {students.length === 0
              ? canManage
                ? "Use the Add Student button to enroll students for this year."
                : "No students have been enrolled yet."
              : "Try adjusting your search or filter criteria."}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700/50 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700/60">
                  <th className="px-4 py-3 text-left w-10">
                    <span className="text-xs font-semibold text-gray-400 dark:text-slate-500">#</span>
                  </th>
                  {(
                    [
                      { label: "Student", field: "name" },
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
                        className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white uppercase tracking-wide transition-colors"
                      >
                        {label}
                        <SortIcon field={field} />
                      </button>
                    </th>
                  ))}
                  {canManage && <th className="px-4 py-3 w-20" />}
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {filteredStudents.map((s, idx) => (
                    <motion.tr
                      key={s.user_id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, x: 30 }}
                      transition={{ duration: 0.15 }}
                      className="group border-b border-gray-100 dark:border-slate-800 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors"
                    >
                      <td className="px-4 py-3 text-xs text-gray-400 dark:text-slate-500 font-mono">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white ${
                              s.gender === "MALE"
                                ? "bg-gradient-to-br from-blue-400 to-blue-600"
                                : s.gender === "FEMALE"
                                ? "bg-gradient-to-br from-pink-400 to-rose-500"
                                : "bg-gradient-to-br from-gray-400 to-gray-600"
                            }`}
                          >
                            {s.first_name.charAt(0)}{s.last_name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white leading-tight">
                              {s.first_name} {s.last_name}
                            </p>
                            {s.gender && (
                              <p className="text-xs text-gray-400 dark:text-slate-500 capitalize">
                                {s.gender.toLowerCase()}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-slate-400 font-mono text-xs">
                        @{s.username}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-slate-400 text-xs">
                        {s.class_group_name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {s.grade_name ? (
                          <span className="inline-block px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                            {s.grade_name}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-xs">
                        {s.program_name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-xs whitespace-nowrap">
                        {new Date(s.enrolled_at).toLocaleDateString("en-US", {
                          year: "2-digit", month: "short", day: "numeric",
                        })}
                      </td>
                      {canManage && (
                        <td className="px-3 py-3">
                          <button
                            onClick={() => handleRemove(s)}
                            disabled={removingId === s.user_id}
                            title="Remove from subject"
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all disabled:opacity-50"
                          >
                            {removingId === s.user_id ? (
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

          {/* Table footer */}
          <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
            <p className="text-xs text-gray-400 dark:text-slate-500">
              Showing {filteredStudents.length} of {students.length} students
            </p>
            <button
              onClick={exportToExcel}
              disabled={filteredStudents.length === 0}
              className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium disabled:opacity-40 transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export visible rows
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnrolledStudentsTab;
