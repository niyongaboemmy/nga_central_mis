import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import UserAvatar from "../ui/UserAvatar";
import { Users, Plus, X, Search, RefreshCw, UserMinus, AlertTriangle, Download, UserPlus, CheckCircle2, ChevronDown, FileDown, Repeat } from "lucide-react";
import { mentorshipApi, MentorAssignmentRecord, MentorCandidate } from "../../api/mentorship";
import { MentorshipReportService } from "../../services/MentorshipReportService";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import SelectField from "../ui/SelectField";

const AdminMentorAssignments: React.FC = () => {
  const { years, selectedYearId } = useAcademicPeriod();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [yearFilter, setYearFilter] = useState<number | "">(selectedYearId ?? "");
  const [assignments, setAssignments] = useState<MentorAssignmentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  // null = closed; an array = open, preloaded with those students.
  const [assignFor, setAssignFor] = useState<MentorCandidate[] | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [unassigned, setUnassigned] = useState<
    {
      student_id: number;
      student_name: string | null;
      registration_number: string | null;
      class_group_name: string | null;
    }[]
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
    if (
      !(await confirm({
        title: "End this mentor assignment?",
        message: "The mentor stops seeing this student. Past sessions are kept.",
        confirmText: "End assignment",
        tone: "warning",
      }))
    )
      return;
    try {
      await mentorshipApi.endAssignment(assignmentId);
      showToast("Assignment ended", "success");
      load();
    } catch {
      showToast("Failed to end assignment", "error");
    }
  };

  const activeAssignments = assignments.filter((a) => a.status === "ACTIVE");
  const visibleAssignments = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return activeAssignments;
    return activeAssignments.filter((a) =>
      `${a.mentor_name ?? ""} ${a.student_name ?? ""} ${a.student_registration_number ?? ""}`.toLowerCase().includes(q),
    );
  }, [activeAssignments, tableSearch]);

  const unassignedAsCandidate = (u: (typeof unassigned)[number]): MentorCandidate => ({
    user_id: u.student_id,
    username: "",
    email: null,
    first_name: null,
    last_name: null,
    user_type: "STUDENT",
    name: u.student_name ?? `#${u.student_id}`,
    registration_number: u.registration_number,
    class_group_name: u.class_group_name,
    current_mentor_id: null,
    current_mentor_name: null,
  });
  const assignmentAsCandidate = (a: MentorAssignmentRecord): MentorCandidate => ({
    user_id: a.student_id,
    username: "",
    email: null,
    first_name: null,
    last_name: null,
    user_type: "STUDENT",
    name: a.student_name ?? `#${a.student_id}`,
    registration_number: a.student_registration_number ?? null,
    class_group_name: null,
    current_mentor_id: a.mentor_id,
    current_mentor_name: a.mentor_name,
  });
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

  // "All Years" in the filter still assigns into the period-selector year.
  const modalYearId = typeof yearFilter === "number" ? yearFilter : selectedYearId ?? undefined;

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
            <SelectField
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
            </SelectField>
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
                            <UserAvatar decorative userId={m.mentor_id} name={name} size={28} />
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
            onClick={() => setAssignFor([])}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-sm font-semibold transition-all"
          >
            <Plus className="w-4 h-4" />
            Assign Mentor
          </button>
        </div>
      </div>

      {showGapPanel && unassigned.length > 0 && (
        <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
              Enrolled students with no active mentor this year
            </p>
            <button
              onClick={() => setAssignFor(unassigned.map(unassignedAsCandidate))}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-full transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Assign all {unassigned.length} to a mentor
            </button>
          </div>
          <p className="text-[11px] text-amber-700/80 dark:text-amber-400/70 mb-2">Click a student to assign them a mentor.</p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((u) => (
              <button
                key={u.student_id}
                onClick={() => setAssignFor([unassignedAsCandidate(u)])}
                className="text-xs px-2.5 py-1 bg-white dark:bg-gray-800 border border-amber-100 dark:border-amber-900/30 rounded-full text-gray-700 dark:text-gray-300 hover:border-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
              >
                {u.student_name ?? `#${u.student_id}`}
                {u.registration_number ? ` (${u.registration_number})` : ""}
                {u.class_group_name ? ` · ${u.class_group_name}` : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeAssignments.length > 0 && (
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            placeholder="Filter by mentor or student…"
            aria-label="Filter assignments"
            autoComplete="off"
            spellCheck={false}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
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
              {visibleAssignments.map((a) => (
                <tr key={a.assignment_id}>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                    {a.mentor_name ?? `#${a.mentor_id}`}
                    {a.mentor_user_type && a.mentor_user_type !== "TEACHER" && (
                      <span className="ml-1.5 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 align-middle">
                        {roleLabel(a.mentor_user_type)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {a.student_name ?? `#${a.student_id}`}
                    {a.student_registration_number && (
                      <span className="block text-[11px] text-gray-400">{a.student_registration_number}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{a.academic_year_name ?? a.academic_year_id}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-full text-xs font-medium">
                      Active
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{a.assigned_at?.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => setAssignFor([assignmentAsCandidate(a)])}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium mr-3"
                      title="Move this student to a different mentor"
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      Change mentor
                    </button>
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
                    <p>No active mentor assignments{yearFilter ? " for this year" : ""}.</p>
                    <button
                      onClick={() => setAssignFor([])}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <Plus className="w-4 h-4" />
                      Assign the first mentor
                    </button>
                  </td>
                </tr>
              )}
              {activeAssignments.length > 0 && visibleAssignments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No assignment matches “{tableSearch}”.
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

      {assignFor && (
        <AssignMentorModal
          yearId={modalYearId}
          yearName={years.find((y) => y.academic_year_id === modalYearId)?.name}
          initialStudents={assignFor}
          onClose={() => setAssignFor(null)}
          onAssigned={() => {
            setAssignFor(null);
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

const ROLE_LABELS: Record<string, string> = {
  TEACHER: "Teacher",
  STAFF: "Staff",
  ADMIN: "Admin",
  PARENT: "Parent",
  STUDENT: "Student",
};
const roleLabel = (t: string | null | undefined) => (t ? ROLE_LABELS[t] ?? t : "No type");

/** Debounced, race-safe search against /mentorship/admin/candidates. */
function useCandidateSearch(
  role: "mentor" | "student",
  yearId: number | undefined,
  opts: { enabled: boolean; unassignedOnly?: boolean },
) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MentorCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (!opts.enabled) return;
    const id = ++requestId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await mentorshipApi.searchCandidates({
          role,
          q: query.trim() || undefined,
          academic_year_id: yearId,
          ...(opts.unassignedOnly ? { unassigned_only: 1 as const } : {}),
        });
        if (id !== requestId.current) return;
        const data = (res as any).data?.data ?? [];
        setResults(Array.isArray(data) ? data : []);
        setError(false);
      } catch {
        if (id === requestId.current) {
          setResults([]);
          setError(true);
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [role, yearId, query, opts.enabled, opts.unassignedOnly]);

  return { query, setQuery, results, loading, error };
}

const SEARCH_INPUT_PROPS = {
  // The OS autocorrect bubble ("Assadou ×") covered the results list.
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const;

const ResultsState: React.FC<{ loading: boolean; error: boolean; empty: boolean; query: string; noun: string }> = ({
  loading,
  error,
  empty,
  query,
  noun,
}) =>
  loading && empty ? (
    <p className="flex items-center justify-center gap-2 text-xs text-gray-400 py-5">
      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Searching…
    </p>
  ) : error ? (
    <p className="text-center text-xs text-red-500 py-5">Search failed — check your connection and try again.</p>
  ) : empty ? (
    <p className="text-center text-xs text-gray-400 py-5">
      {query ? `No ${noun} matches “${query}”.` : `No ${noun}s found.`}
    </p>
  ) : null;

export const AssignMentorModal: React.FC<{
  yearId?: number;
  yearName?: string;
  initialStudents?: MentorCandidate[];
  onClose: () => void;
  onAssigned: () => void;
}> = ({ yearId, yearName, initialStudents = [], onClose, onAssigned }) => {
  const { showToast } = useToast();
  const [selectedMentor, setSelectedMentor] = useState<MentorCandidate | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<MentorCandidate[]>(initialStudents);
  const [mentorOpen, setMentorOpen] = useState(false);
  const [studentOpen, setStudentOpen] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [mentorActive, setMentorActive] = useState(0);
  const [studentActive, setStudentActive] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const mentorSearch = useCandidateSearch("mentor", yearId, { enabled: mentorOpen && !selectedMentor });
  const studentSearch = useCandidateSearch("student", yearId, { enabled: studentOpen, unassignedOnly });

  const mentorBoxRef = useRef<HTMLDivElement>(null);
  const studentBoxRef = useRef<HTMLDivElement>(null);
  const mentorInputRef = useRef<HTMLInputElement>(null);
  const studentInputRef = useRef<HTMLInputElement>(null);

  // Start on the mentor field (or students, when the mentor is the open question).
  useEffect(() => {
    mentorInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (mentorBoxRef.current && !mentorBoxRef.current.contains(e.target as Node)) setMentorOpen(false);
      if (studentBoxRef.current && !studentBoxRef.current.contains(e.target as Node)) setStudentOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mentorOpen || studentOpen) {
        setMentorOpen(false);
        setStudentOpen(false);
      } else if (!submitting) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [mentorOpen, studentOpen, submitting, onClose]);

  useEffect(() => setMentorActive(0), [mentorSearch.results]);
  useEffect(() => setStudentActive(0), [studentSearch.results]);

  const pickMentor = (u: MentorCandidate) => {
    setSelectedMentor(u);
    setMentorOpen(false);
    mentorSearch.setQuery("");
  };

  // Mentor chosen → straight on to the students.
  useEffect(() => {
    if (selectedMentor) studentInputRef.current?.focus();
  }, [selectedMentor]);

  const isSelected = (id: number) => selectedStudents.some((s) => s.user_id === id);
  const toggleStudent = (u: MentorCandidate) => {
    setSelectedStudents((prev) =>
      prev.some((s) => s.user_id === u.user_id) ? prev.filter((s) => s.user_id !== u.user_id) : [...prev, u],
    );
  };

  const alreadyMine = (u: MentorCandidate) =>
    !!selectedMentor && u.current_mentor_id === selectedMentor.user_id;

  const selectable = studentSearch.results.filter((u) => !alreadyMine(u) && u.user_id !== selectedMentor?.user_id);
  const addAllShown = () =>
    setSelectedStudents((prev) => [...prev, ...selectable.filter((u) => !prev.some((p) => p.user_id === u.user_id))]);

  // What will actually happen — spelled out before the admin confirms.
  const toAssign = selectedStudents.filter((s) => !alreadyMine(s));
  const moving = toAssign.filter((s) => s.current_mentor_id);
  const fresh = toAssign.length - moving.length;
  const unchanged = selectedStudents.length - toAssign.length;
  const selfMentor = !!selectedMentor && selectedStudents.some((s) => s.user_id === selectedMentor.user_id);

  const handleSubmit = async () => {
    if (!selectedMentor || toAssign.length === 0 || selfMentor) return;
    setSubmitting(true);
    try {
      const res = await mentorshipApi.bulkAssignMentor({
        mentor_id: selectedMentor.user_id,
        student_ids: toAssign.map((s) => s.user_id),
        academic_year_id: yearId,
        reassign: true,
      });
      const outcome = (res as any).data?.data ?? {};
      const parts = [
        outcome.assigned ? `${outcome.assigned} assigned` : null,
        outcome.moved ? `${outcome.moved} moved from their previous mentor` : null,
        outcome.unchanged ? `${outcome.unchanged} already with this mentor` : null,
      ].filter(Boolean);
      showToast(`${selectedMentor.name}: ${parts.join(", ") || "no change"}`, "success");
      onAssigned();
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? "Failed to assign mentor", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const listKeys = (
    e: React.KeyboardEvent,
    count: number,
    active: number,
    setActive: (n: number) => void,
    open: () => void,
    choose: () => void,
  ) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      open();
      setActive(Math.min(active + 1, Math.max(count - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(active - 1, 0));
    } else if (e.key === "Enter" && count > 0) {
      e.preventDefault();
      choose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-mentor-title"
        className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-xl max-h-[90vh] flex flex-col animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <UserPlus className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 id="assign-mentor-title" className="font-semibold text-gray-900 dark:text-white">Assign Mentor</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Pair a mentor with one or more mentees{yearName ? ` for ${yearName}` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Step 1 — mentor */}
          <div>
            <label htmlFor="assign-mentor-search" className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center">1</span>
              Mentor
            </label>
            <p className="text-[11px] text-gray-400 mt-0.5">Any teacher or staff member can mentor.</p>
            {selectedMentor ? (
              <div className="mt-2 flex items-center justify-between px-3.5 py-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-2xl">
                <div className="flex items-center gap-2.5 min-w-0">
                  <UserAvatar decorative userId={selectedMentor.user_id} name={selectedMentor.name} size={32} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {selectedMentor.name}{" "}
                      <span className="text-[10px] font-semibold uppercase text-blue-600 dark:text-blue-400">{roleLabel(selectedMentor.user_type)}</span>
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      {selectedMentor.email ?? selectedMentor.username} · {selectedMentor.mentee_count ?? 0} current mentee
                      {(selectedMentor.mentee_count ?? 0) !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedMentor(null);
                    setTimeout(() => {
                      mentorInputRef.current?.focus();
                      setMentorOpen(true);
                    }, 0);
                  }}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0 px-2"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative mt-2" ref={mentorBoxRef}>
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="assign-mentor-search"
                  ref={mentorInputRef}
                  {...SEARCH_INPUT_PROPS}
                  role="combobox"
                  aria-expanded={mentorOpen}
                  aria-controls="assign-mentor-results"
                  value={mentorSearch.query}
                  onFocus={() => setMentorOpen(true)}
                  onChange={(e) => {
                    mentorSearch.setQuery(e.target.value);
                    setMentorOpen(true);
                  }}
                  onKeyDown={(e) =>
                    listKeys(e, mentorSearch.results.length, mentorActive, setMentorActive, () => setMentorOpen(true), () =>
                      mentorSearch.results[mentorActive] && pickMentor(mentorSearch.results[mentorActive]),
                    )
                  }
                  placeholder="Search staff by name, email or username…"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {mentorOpen && (
                  <div
                    id="assign-mentor-results"
                    role="listbox"
                    className="absolute z-20 w-full mt-1.5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-lg max-h-64 overflow-y-auto p-1.5"
                  >
                    <ResultsState
                      loading={mentorSearch.loading}
                      error={mentorSearch.error}
                      empty={mentorSearch.results.length === 0}
                      query={mentorSearch.query}
                      noun="staff member"
                    />
                    {mentorSearch.results.map((u, i) => (
                      <button
                        key={u.user_id}
                        role="option"
                        aria-selected={i === mentorActive}
                        onMouseEnter={() => setMentorActive(i)}
                        onClick={() => pickMentor(u)}
                        className={`w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-xl text-sm transition-colors ${
                          i === mentorActive ? "bg-blue-50 dark:bg-blue-900/30" : ""
                        }`}
                      >
                        <UserAvatar decorative userId={u.user_id} name={u.name} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-gray-900 dark:text-white font-medium">{u.name}</span>
                          <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">{u.email ?? u.username}</span>
                        </span>
                        <span className="flex flex-col items-end gap-0.5 shrink-0">
                          <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            {roleLabel(u.user_type)}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {u.mentee_count ?? 0} mentee{(u.mentee_count ?? 0) !== 1 ? "s" : ""}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2 — mentees */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="assign-student-search" className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center">2</span>
                Students (mentees)
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={unassignedOnly}
                  onChange={(e) => {
                    setUnassignedOnly(e.target.checked);
                    setStudentOpen(true);
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Only students without a mentor
              </label>
            </div>
            {selectedStudents.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedStudents.map((s) => {
                  const mine = alreadyMine(s);
                  const moves = !mine && !!s.current_mentor_id;
                  return (
                    <span
                      key={s.user_id}
                      title={
                        mine
                          ? "Already this mentor's mentee — nothing will change"
                          : moves
                            ? `Currently mentored by ${s.current_mentor_name ?? "another mentor"}`
                            : undefined
                      }
                      className={`flex items-center gap-1.5 pl-1 pr-2 py-1 border rounded-full text-xs ${
                        mine
                          ? "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 line-through"
                          : moves
                            ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/40 text-gray-800 dark:text-gray-200"
                            : "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/30 text-gray-800 dark:text-gray-200"
                      }`}
                    >
                      <UserAvatar decorative userId={s.user_id} name={s.name} size={20} />
                      {s.name}
                      <button
                        onClick={() => toggleStudent(s)}
                        aria-label={`Remove ${s.name}`}
                        className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-white/60 dark:hover:bg-black/20"
                      >
                        <X className="w-3 h-3 text-gray-400" />
                      </button>
                    </span>
                  );
                })}
                <button onClick={() => setSelectedStudents([])} className="text-[11px] text-gray-400 hover:text-red-500 px-1">
                  Clear all
                </button>
              </div>
            )}
            <div className="relative mt-2" ref={studentBoxRef}>
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="assign-student-search"
                ref={studentInputRef}
                {...SEARCH_INPUT_PROPS}
                role="combobox"
                aria-expanded={studentOpen}
                aria-controls="assign-student-results"
                value={studentSearch.query}
                onFocus={() => setStudentOpen(true)}
                onChange={(e) => {
                  studentSearch.setQuery(e.target.value);
                  setStudentOpen(true);
                }}
                onKeyDown={(e) =>
                  listKeys(e, studentSearch.results.length, studentActive, setStudentActive, () => setStudentOpen(true), () => {
                    const u = studentSearch.results[studentActive];
                    if (u && !alreadyMine(u)) toggleStudent(u);
                  })
                }
                placeholder="Search students by name, reg. number or email…"
                className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {studentOpen && (
                <div
                  id="assign-student-results"
                  role="listbox"
                  aria-multiselectable="true"
                  className="absolute z-20 w-full mt-1.5 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-lg max-h-72 overflow-y-auto p-1.5"
                >
                  {selectable.length > 1 && (
                    <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px] text-gray-400">
                      <span>{studentSearch.results.length} shown{studentSearch.results.length >= 50 ? " — refine the search for more" : ""}</span>
                      <button onClick={addAllShown} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                        Select all shown
                      </button>
                    </div>
                  )}
                  <ResultsState
                    loading={studentSearch.loading}
                    error={studentSearch.error}
                    empty={studentSearch.results.length === 0}
                    query={studentSearch.query}
                    noun="student"
                  />
                  {studentSearch.results.map((u, i) => {
                    const selected = isSelected(u.user_id);
                    const mine = alreadyMine(u);
                    return (
                      <button
                        key={u.user_id}
                        role="option"
                        aria-selected={selected}
                        disabled={mine}
                        onMouseEnter={() => setStudentActive(i)}
                        onClick={() => toggleStudent(u)}
                        className={`w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          i === studentActive && !mine ? "bg-blue-50 dark:bg-blue-900/30" : ""
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            selected ? "bg-blue-600 border-blue-600" : "border-gray-300 dark:border-gray-600"
                          }`}
                        >
                          {selected && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-gray-900 dark:text-white font-medium">{u.name}</span>
                          <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">
                            {[u.registration_number, u.class_group_name ?? "No class this year"].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        {mine ? (
                          <span className="text-[10px] font-semibold text-gray-500 shrink-0">Already this mentor's</span>
                        ) : u.current_mentor_id ? (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 shrink-0 max-w-[45%] truncate">
                            Mentor: {u.current_mentor_name ?? "assigned"}
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 shrink-0">
                            No mentor
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* What will happen */}
          {selectedMentor && selectedStudents.length > 0 && (
            <div
              className={`rounded-2xl px-4 py-3 text-xs border ${
                selfMentor
                  ? "bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30 text-red-700 dark:text-red-400"
                  : moving.length
                    ? "bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/30 text-amber-800 dark:text-amber-300"
                    : "bg-gray-50 dark:bg-gray-800/60 border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300"
              }`}
              aria-live="polite"
            >
              {selfMentor ? (
                <p>{selectedMentor.name} cannot mentor themselves — remove them from the students.</p>
              ) : (
                <>
                  <p className="font-semibold">
                    {selectedMentor.name} will mentor {toAssign.length} more student{toAssign.length !== 1 ? "s" : ""}
                    {fresh && moving.length ? ` (${fresh} new, ${moving.length} moving)` : ""}.
                  </p>
                  {moving.length > 0 && (
                    <p className="mt-1">
                      {moving.map((s) => `${s.name} (from ${s.current_mentor_name ?? "another mentor"})`).join(", ")} will
                      leave their current mentor for this year. Past sessions stay on record.
                    </p>
                  )}
                  {unchanged > 0 && <p className="mt-1">{unchanged} already mentored by {selectedMentor.name} — skipped.</p>}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-full transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !selectedMentor || toAssign.length === 0 || selfMentor}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full text-sm font-semibold transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            {submitting
              ? "Assigning…"
              : !selectedMentor
                ? "Choose a mentor"
                : toAssign.length === 0
                  ? "Choose students"
                  : `Assign ${toAssign.length} student${toAssign.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminMentorAssignments;
