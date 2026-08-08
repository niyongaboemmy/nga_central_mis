import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Users, Plus, X, Search, RefreshCw, UserMinus, AlertTriangle, Download, UserPlus, GraduationCap, CheckCircle2, ChevronDown, FileDown } from "lucide-react";
import { mentorshipApi, MentorAssignmentRecord } from "../../api/mentorship";
import { userApi } from "../../api/documents";
import { MentorshipReportService } from "../../services/MentorshipReportService";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { useToast } from "../../contexts/ToastContext";

interface SearchResultUser {
  user_id: number;
  username: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  user_type: string | null;
}

const AdminMentorAssignments: React.FC = () => {
  const { years, selectedYearId } = useAcademicPeriod();
  const { showToast } = useToast();

  const [yearFilter, setYearFilter] = useState<number | "">(selectedYearId ?? "");
  const [assignments, setAssignments] = useState<MentorAssignmentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [unassigned, setUnassigned] = useState<
    { student_id: number; student_name: string | null; class_group_name: string | null }[]
  >([]);
  const [showGapPanel, setShowGapPanel] = useState(false);
  const [downloadingMentorId, setDownloadingMentorId] = useState<number | null>(null);
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const reportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedYearId && yearFilter === "") setYearFilter(selectedYearId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYearId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mentorshipApi.listAssignments({
        academic_year_id: yearFilter === "" ? undefined : Number(yearFilter),
      });
      const data = (res as any).data?.data ?? (res as any).data ?? [];
      setAssignments(Array.isArray(data) ? data : []);
    } catch {
      showToast("Failed to load mentor assignments", "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearFilter]);

  const loadUnassigned = useCallback(async () => {
    try {
      const res = await mentorshipApi.getUnassignedStudents(
        yearFilter === "" ? undefined : Number(yearFilter),
      );
      const data = (res as any).data?.data ?? (res as any).data ?? [];
      setUnassigned(Array.isArray(data) ? data : []);
    } catch {
      setUnassigned([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearFilter]);

  useEffect(() => {
    load();
    loadUnassigned();
  }, [load, loadUnassigned]);

  const handleEnd = async (assignmentId: number) => {
    if (!window.confirm("End this mentor assignment?")) return;
    try {
      await mentorshipApi.endAssignment(assignmentId);
      showToast("Assignment ended", "success");
      load();
    } catch {
      showToast("Failed to end assignment", "error");
    }
  };

  const activeAssignments = assignments.filter((a) => a.status === "ACTIVE");
  const endedAssignments = assignments.filter((a) => a.status === "ENDED");

  // One row per mentor (not per assignment) so admin can download a given
  // mentor's consolidated periodic report — the report is mentor-scoped,
  // covering all of that mentor's active mentees at once.
  const mentorSummary = useMemo(() => {
    const map = new Map<number, { mentor_id: number; mentor_name: string | null; menteeCount: number }>();
    for (const a of activeAssignments) {
      const existing = map.get(a.mentor_id);
      if (existing) existing.menteeCount += 1;
      else map.set(a.mentor_id, { mentor_id: a.mentor_id, mentor_name: a.mentor_name, menteeCount: 1 });
    }
    return [...map.values()].sort((a, b) => (a.mentor_name ?? "").localeCompare(b.mentor_name ?? ""));
  }, [activeAssignments]);

  const filteredMentorSummary = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    if (!q) return mentorSummary;
    return mentorSummary.filter((m) => (m.mentor_name ?? `#${m.mentor_id}`).toLowerCase().includes(q));
  }, [mentorSummary, reportSearch]);

  useEffect(() => {
    if (!showReportMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (reportMenuRef.current && !reportMenuRef.current.contains(e.target as Node)) {
        setShowReportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showReportMenu]);

  const selectedYearName =
    (typeof yearFilter === "number" ? years.find((y) => y.academic_year_id === yearFilter)?.name : undefined) ??
    "All Years";

  const handleDownloadMentorReport = async (mentorId: number, mentorName: string | null) => {
    setDownloadingMentorId(mentorId);
    try {
      const res = await mentorshipApi.getConsolidatedReport({
        mentor_id: mentorId,
        academic_year_id: typeof yearFilter === "number" ? yearFilter : undefined,
      });
      const report = (res as any).data?.data ?? (res as any).data;
      if (!report || report.mentees.length === 0) {
        showToast("This mentor has no mentees in the selected year — nothing to generate", "error");
        return;
      }
      MentorshipReportService.download(report, {
        schoolName: "NGA MIS",
        academicYearName: selectedYearName,
        generatedBy: "Admin",
      });
      showToast(`Report downloaded for ${mentorName ?? "mentor"}`, "success");
    } catch {
      showToast("Failed to generate consolidated report", "error");
    } finally {
      setDownloadingMentorId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            Mentor Assignments
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {activeAssignments.length} active assignment{activeAssignments.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {unassigned.length > 0 && (
            <button
              onClick={() => setShowGapPanel((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5 rounded-full hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              {unassigned.length} unassigned
            </button>
          )}
          <div className="flex items-center gap-2">
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value ? Number(e.target.value) : "")}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">All Years</option>
              {years.map((y) => (
                <option key={y.academic_year_id} value={y.academic_year_id}>
                  {y.name}{y.is_current ? " (Current)" : ""}
                </option>
              ))}
            </select>
            {/* Mentor assignments are year-scoped — make it unambiguous
                whether the admin is viewing the school's current academic
                year or has browsed to a past/future one. */}
            {typeof yearFilter === "number" && (
              years.find((y) => y.academic_year_id === yearFilter)?.is_current ? (
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 rounded-full whitespace-nowrap">
                  Current year
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 rounded-full whitespace-nowrap">
                  Past/other year
                </span>
              )
            )}
          </div>

          {mentorSummary.length > 0 && (
            <div ref={reportMenuRef} className="relative">
              <button
                onClick={() => setShowReportMenu((v) => !v)}
                className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium border border-gray-200 dark:border-gray-600 rounded-full bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <FileDown className="w-4 h-4 text-blue-500" />
                Download Report
                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showReportMenu ? "rotate-180" : ""}`} />
              </button>

              {showReportMenu && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-lg z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                  <div className="p-2.5 border-b border-gray-100 dark:border-gray-700">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        autoFocus
                        value={reportSearch}
                        onChange={(e) => setReportSearch(e.target.value)}
                        placeholder="Search mentor..."
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-1.5">
                    {filteredMentorSummary.length === 0 ? (
                      <p className="text-center text-xs text-gray-400 py-6">No mentor matches "{reportSearch}"</p>
                    ) : (
                      filteredMentorSummary.map((m) => {
                        const name = m.mentor_name ?? `#${m.mentor_id}`;
                        const isDownloading = downloadingMentorId === m.mentor_id;
                        return (
                          <button
                            key={m.mentor_id}
                            onClick={() => handleDownloadMentorReport(m.mentor_id, m.mentor_name)}
                            disabled={isDownloading}
                            className="group w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left hover:bg-blue-600 disabled:opacity-50 transition-colors"
                          >
                            <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center text-[11px] font-bold shrink-0 group-hover:bg-white/20 group-hover:text-white">
                              {initialsOf(name)}
                            </div>
                            <span className="min-w-0 flex-1 truncate">
                              <span className="text-sm text-gray-900 dark:text-white font-medium group-hover:text-white">{name}</span>{" "}
                              <span className="text-xs text-gray-400 group-hover:text-blue-100">({m.menteeCount})</span>
                            </span>
                            {isDownloading ? (
                              <RefreshCw className="w-3.5 h-3.5 text-blue-500 group-hover:text-white animate-spin shrink-0" />
                            ) : (
                              <Download className="w-3.5 h-3.5 text-blue-500 group-hover:text-white shrink-0" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setShowAssignModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-sm font-semibold transition-all"
          >
            <Plus className="w-4 h-4" />
            Assign Mentor
          </button>
        </div>
      </div>

      {showGapPanel && unassigned.length > 0 && (
        <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-2xl p-4">
          <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-2">
            Enrolled students with no active mentor this year
          </p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((u) => (
              <span
                key={u.student_id}
                className="text-xs px-2.5 py-1 bg-white dark:bg-gray-800 border border-amber-100 dark:border-amber-900/30 rounded-full text-gray-700 dark:text-gray-300"
              >
                {u.student_name ?? `#${u.student_id}`}
                {u.class_group_name ? ` · ${u.class_group_name}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center text-gray-400 py-16">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Loading assignments...
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800/30 rounded-2xl border border-gray-100 dark:border-gray-700/20 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 text-xs uppercase font-bold">
              <tr>
                <th className="text-left px-4 py-3">Mentor</th>
                <th className="text-left px-4 py-3">Student</th>
                <th className="text-left px-4 py-3">Academic Year</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Assigned</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/30">
              {activeAssignments.map((a) => (
                <tr key={a.assignment_id}>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{a.mentor_name ?? `#${a.mentor_id}`}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{a.student_name ?? `#${a.student_id}`}</td>
                  <td className="px-4 py-3 text-gray-500">{a.academic_year_name ?? a.academic_year_id}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-full text-xs font-medium">
                      Active
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{a.assigned_at?.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleEnd(a.assignment_id)}
                      className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                      End
                    </button>
                  </td>
                </tr>
              ))}
              {activeAssignments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    No active mentor assignments{yearFilter ? " for this year" : ""}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {endedAssignments.length > 0 && (
            <details className="border-t border-gray-100 dark:border-gray-700/30 px-4 py-3">
              <summary className="text-xs font-semibold text-gray-400 cursor-pointer">
                {endedAssignments.length} ended assignment{endedAssignments.length !== 1 ? "s" : ""} (history)
              </summary>
              <table className="w-full text-sm mt-3">
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/30">
                  {endedAssignments.map((a) => (
                    <tr key={a.assignment_id} className="text-gray-400">
                      <td className="py-2">{a.mentor_name ?? `#${a.mentor_id}`}</td>
                      <td className="py-2">{a.student_name ?? `#${a.student_id}`}</td>
                      <td className="py-2">{a.academic_year_name ?? a.academic_year_id}</td>
                      <td className="py-2 text-xs">Ended {a.ended_at?.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}

      {showAssignModal && (
        <AssignMentorModal
          defaultYearId={typeof yearFilter === "number" ? yearFilter : selectedYearId ?? undefined}
          onClose={() => setShowAssignModal(false)}
          onAssigned={() => {
            setShowAssignModal(false);
            load();
            loadUnassigned();
          }}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Assign / bulk-assign modal
// ─────────────────────────────────────────────────────────────────────────────
const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
};

const AssignMentorModal: React.FC<{
  defaultYearId?: number;
  onClose: () => void;
  onAssigned: () => void;
}> = ({ defaultYearId, onClose, onAssigned }) => {
  const { showToast } = useToast();
  const [mentorQuery, setMentorQuery] = useState("");
  const [mentorResults, setMentorResults] = useState<SearchResultUser[]>([]);
  const [selectedMentor, setSelectedMentor] = useState<SearchResultUser | null>(null);

  const [studentQuery, setStudentQuery] = useState("");
  const [studentResults, setStudentResults] = useState<SearchResultUser[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<SearchResultUser[]>([]);

  const [submitting, setSubmitting] = useState(false);

  const searchMentors = async (q: string) => {
    setMentorQuery(q);
    if (q.trim().length < 2) { setMentorResults([]); return; }
    try {
      const res: any = await userApi.searchUsers(q);
      const data = res?.data?.data ?? res?.data ?? [];
      setMentorResults((Array.isArray(data) ? data : []).filter((u: SearchResultUser) => u.user_type === "TEACHER"));
    } catch {
      setMentorResults([]);
    }
  };

  const searchStudents = async (q: string) => {
    setStudentQuery(q);
    if (q.trim().length < 2) { setStudentResults([]); return; }
    try {
      const res: any = await userApi.searchUsers(q);
      const data = res?.data?.data ?? res?.data ?? [];
      setStudentResults((Array.isArray(data) ? data : []).filter((u: SearchResultUser) => u.user_type === "STUDENT"));
    } catch {
      setStudentResults([]);
    }
  };

  const toggleStudent = (u: SearchResultUser) => {
    setSelectedStudents((prev) =>
      prev.some((s) => s.user_id === u.user_id)
        ? prev.filter((s) => s.user_id !== u.user_id)
        : [...prev, u],
    );
  };

  const handleSubmit = async () => {
    if (!selectedMentor || selectedStudents.length === 0) {
      showToast("Select a mentor and at least one student", "error");
      return;
    }
    setSubmitting(true);
    try {
      if (selectedStudents.length === 1) {
        await mentorshipApi.createAssignment({
          mentor_id: selectedMentor.user_id,
          student_id: selectedStudents[0].user_id,
          academic_year_id: defaultYearId,
          reassign: true,
        });
      } else {
        await mentorshipApi.bulkAssignMentor({
          mentor_id: selectedMentor.user_id,
          student_ids: selectedStudents.map((s) => s.user_id),
          academic_year_id: defaultYearId,
          reassign: true,
        });
      }
      showToast("Mentor assigned successfully", "success");
      onAssigned();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? "Failed to assign mentor", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const displayName = (u: SearchResultUser) =>
    `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.username;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-lg max-h-[85vh] overflow-y-auto animate-in zoom-in-95 slide-in-from-bottom-2 duration-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <UserPlus className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Assign Mentor</h3>
              <p className="text-xs text-gray-400">Pair a mentor with one or more mentees</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Mentor picker */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-wide">
              <UserPlus className="w-3.5 h-3.5" />
              Mentor
            </label>
            {selectedMentor ? (
              <div className="mt-2 flex items-center justify-between px-3.5 py-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-full">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                    {initialsOf(displayName(selectedMentor))}
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{displayName(selectedMentor)}</span>
                </div>
                <button
                  onClick={() => setSelectedMentor(null)}
                  className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-white/60 dark:hover:bg-black/20 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative mt-2">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={mentorQuery}
                  onChange={(e) => searchMentors(e.target.value)}
                  placeholder="Search teacher by name/email..."
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {mentorResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1.5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-lg max-h-48 overflow-y-auto p-1.5">
                    {mentorResults.map((u) => (
                      <button
                        key={u.user_id}
                        onClick={() => { setSelectedMentor(u); setMentorResults([]); setMentorQuery(""); }}
                        className="group w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-xl text-sm hover:bg-blue-600 transition-colors"
                      >
                        <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center text-[11px] font-bold shrink-0 group-hover:bg-white/20 group-hover:text-white">
                          {initialsOf(displayName(u))}
                        </div>
                        <span className="min-w-0 truncate">
                          <span className="text-gray-900 dark:text-white font-medium group-hover:text-white">{displayName(u)}</span>{" "}
                          <span className="text-gray-400 text-xs group-hover:text-blue-100">{u.email}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Student picker (multi) */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-wide">
              <GraduationCap className="w-3.5 h-3.5" />
              Students (mentees)
            </label>
            {selectedStudents.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedStudents.map((s) => (
                  <span key={s.user_id} className="flex items-center gap-1.5 pl-1 pr-2 py-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-full text-xs text-gray-800 dark:text-gray-200">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold">
                      {initialsOf(displayName(s))}
                    </span>
                    {displayName(s)}
                    <button
                      onClick={() => toggleStudent(s)}
                      className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-white/60 dark:hover:bg-black/20"
                    >
                      <X className="w-3 h-3 text-gray-400" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative mt-2">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={studentQuery}
                onChange={(e) => searchStudents(e.target.value)}
                placeholder="Search student by name/email..."
                className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {studentResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1.5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-lg max-h-48 overflow-y-auto p-1.5">
                  {studentResults.map((u) => {
                    const isSelected = selectedStudents.some((s) => s.user_id === u.user_id);
                    return (
                      <button
                        key={u.user_id}
                        onClick={() => toggleStudent(u)}
                        className={`group w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-xl text-sm transition-colors hover:bg-blue-600 ${
                          isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                        }`}
                      >
                        <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center text-[11px] font-bold shrink-0 group-hover:bg-white/20 group-hover:text-white">
                          {initialsOf(displayName(u))}
                        </div>
                        <span className="min-w-0 truncate flex-1">
                          <span className="text-gray-900 dark:text-white font-medium group-hover:text-white">{displayName(u)}</span>{" "}
                          <span className="text-gray-400 text-xs group-hover:text-blue-100">{u.email}</span>
                        </span>
                        {isSelected && (
                          <span className="flex items-center gap-1 text-blue-500 text-xs font-semibold shrink-0 group-hover:text-white">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Selected
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">Reassigning an already-mentored student replaces their current mentor for this year.</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-full transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !selectedMentor || selectedStudents.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-full text-sm font-semibold transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            {submitting ? "Assigning..." : `Assign ${selectedStudents.length || ""} Student${selectedStudents.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminMentorAssignments;
