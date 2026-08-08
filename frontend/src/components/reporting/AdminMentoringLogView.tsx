import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Printer,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Users,
  Filter,
  X,
  Check,
  ThumbsDown,
} from "lucide-react";
import { mentorshipApi, AdminLogEntry, SessionStatus, MenteeCheckInRecord } from "../../api/mentorship";
import { useToast } from "../../contexts/ToastContext";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";

const CATEGORY_LABEL: Record<string, string> = {
  APPRECIATION: "Appreciation",
  CONCERN: "Concern",
  REQUEST_MEETING: "Meeting Request",
  GENERAL: "General",
};

const WELLBEING_EMOJI: Record<string, string> = {
  STRUGGLING: "😢",
  CONCERNED:  "😟",
  NEUTRAL:    "😐",
  GOOD:       "🙂",
  EXCELLENT:  "😄",
};

// Harmonized on amber for "open/pending" (matches SubmittedReports.tsx and
// the rest of the reporting area), rather than this view's previous yellow.
const STATUS_STYLE: Record<SessionStatus, string> = {
  OPEN:        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  RESOLVED:    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

const DISC_PROG_STYLE: Record<string, string> = {
  IMPROVED:   "text-green-600 dark:text-green-400",
  CONSISTENT: "text-blue-500 dark:text-blue-400",
  DECLINED:   "text-red-500 dark:text-red-400",
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const ExpandedRow: React.FC<{ entry: AdminLogEntry }> = ({ entry }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs text-gray-700 dark:text-gray-300 p-4 bg-gray-50 dark:bg-gray-800/60 border-t border-gray-200 dark:border-gray-700">
    {entry.assignment_completion && (
      <Field label="Assignment Completion" value={`${entry.assignment_completion}${entry.assignment_notes ? ` — ${entry.assignment_notes}` : ""}`} />
    )}
    {entry.punctuality_attendance && (
      <Field label="Punctuality / Attendance" value={entry.punctuality_attendance} />
    )}
    {entry.discipline_notes && (
      <Field label="Discipline Notes" value={entry.discipline_notes} />
    )}
    {entry.discipline_progress && (
      <Field label="Discipline Progress" value={entry.discipline_progress} className={DISC_PROG_STYLE[entry.discipline_progress] ?? ""} />
    )}
    {(entry.academic_planning || entry.academic_personal_notes) && (
      <Field
        label="Academic & Personal"
        value={[entry.academic_planning, entry.academic_personal_notes].filter(Boolean).join(" — ")}
        className="sm:col-span-2"
      />
    )}
    {entry.challenges_identified && (
      <Field label="Challenges Identified" value={entry.challenges_identified} className="sm:col-span-2" />
    )}
    {entry.guidance_notes && (
      <Field label="Guidance Provided" value={entry.guidance_notes} className="sm:col-span-2" />
    )}
    {entry.wellbeing_notes && (
      <Field label="Well-being Notes" value={entry.wellbeing_notes} />
    )}
    {entry.action_items && (
      <Field label="Action Items" value={entry.action_items} highlight="amber" />
    )}
    {entry.next_steps && (
      <Field label="Next Steps" value={entry.next_steps} />
    )}
    {entry.notes && (
      <Field label="Session Notes" value={entry.notes} className="sm:col-span-2" />
    )}
  </div>
);

const Field: React.FC<{
  label: string;
  value: string | null;
  className?: string;
  highlight?: "amber" | "red";
}> = ({ label, value, className = "", highlight }) => {
  if (!value) return null;
  return (
    <div className={className}>
      <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
      <p
        className={`leading-relaxed ${
          highlight === "amber"
            ? "text-amber-700 dark:text-amber-300"
            : highlight === "red"
            ? "text-red-700 dark:text-red-300"
            : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
};

const AdminMentoringLogView: React.FC = () => {
  const { showToast } = useToast();
  const { years, selectedYearId } = useAcademicPeriod();

  const [viewMode, setViewMode] = useState<"sessions" | "checkins">("sessions");
  const [entries, setEntries] = useState<AdminLogEntry[]>([]);
  const [checkIns, setCheckIns] = useState<(MenteeCheckInRecord & { mentor_name: string | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterFlags, setFilterFlags] = useState<"all" | "dishonesty" | "stress" | "follow_up">("all");
  const [yearFilter, setYearFilter] = useState<number | "">(selectedYearId ?? "");
  const [mentorFilter, setMentorFilter] = useState<number | "">("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [reviewTarget, setReviewTarget] = useState<(MenteeCheckInRecord & { mentor_name: string | null }) | null>(null);
  const [reviewMode, setReviewMode] = useState<"approve" | "reject">("approve");
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const hasFetched = useRef(false);

  const fetchLog = async () => {
    setLoading(true);
    try {
      const res = await mentorshipApi.getAdminLog({
        limit: 200,
        academic_year_id: yearFilter === "" ? undefined : Number(yearFilter),
        mentor_id: mentorFilter === "" ? undefined : Number(mentorFilter),
      });
      const data = (res as any).data?.data ?? (res as any).data ?? [];
      setEntries(Array.isArray(data) ? data : []);
    } catch {
      showToast("Failed to load mentoring log", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchCheckIns = async () => {
    setLoading(true);
    try {
      const res = await mentorshipApi.getAdminCheckIns({
        limit: 200,
        academic_year_id: yearFilter === "" ? undefined : Number(yearFilter),
        mentor_id: mentorFilter === "" ? undefined : Number(mentorFilter),
      });
      const data = (res as any).data?.data ?? (res as any).data ?? [];
      setCheckIns(Array.isArray(data) ? data : []);
    } catch {
      showToast("Failed to load mentee check-ins", "error");
    } finally {
      setLoading(false);
    }
  };

  const refresh = () => {
    if (viewMode === "sessions") fetchLog();
    else fetchCheckIns();
  };

  const openReview = (entry: MenteeCheckInRecord & { mentor_name: string | null }, mode: "approve" | "reject") => {
    setReviewTarget(entry);
    setReviewMode(mode);
    setReviewComment("");
  };

  const submitReview = async () => {
    if (!reviewTarget) return;
    if (reviewMode === "reject" && !reviewComment.trim()) {
      showToast("A comment is required when rejecting a report", "error");
      return;
    }
    setReviewSubmitting(true);
    try {
      await mentorshipApi.adminUpdateCheckIn(reviewTarget.checkin_id, {
        validation_status: reviewMode === "approve" ? "APPROVED" : "REJECTED",
        mentor_response: reviewComment.trim() || undefined,
      });
      showToast(reviewMode === "approve" ? "Report approved" : "Report rejected", "success");
      setReviewTarget(null);
      fetchCheckIns();
    } catch {
      showToast("Failed to submit review", "error");
    } finally {
      setReviewSubmitting(false);
    }
  };

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, yearFilter, mentorFilter]);

  const filtered = entries.filter((e) => {
    const name = (e.student_name ?? "").toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchFlag =
      filterFlags === "all" ||
      (filterFlags === "dishonesty" && e.dishonesty_flagged) ||
      (filterFlags === "stress" && e.stress_flag) ||
      (filterFlags === "follow_up" && e.follow_up_required);
    return matchSearch && matchFlag;
  });

  const filteredCheckIns = checkIns.filter((c) => {
    const name = (c.student_name ?? "").toLowerCase();
    return !search || name.includes(search.toLowerCase());
  });

  const mentorOptions = Array.from(
    new Map(
      [
        ...entries.filter((e) => e.mentor_name).map((e) => [e.mentor_id, e.mentor_name as string] as const),
        ...checkIns.filter((c) => c.mentor_name).map((c) => [c.mentor_id, c.mentor_name as string] as const),
      ],
    ).entries(),
  );

  const stats = {
    total: entries.length,
    flagged: entries.filter((e) => e.dishonesty_flagged || e.stress_flag).length,
    followUp: entries.filter((e) => e.follow_up_required && e.session_status !== "RESOLVED").length,
    students: new Set(entries.map((e) => e.student_id)).size,
  };

  const handlePrint = () => window.print();

  return (
    <div className="flex flex-col h-full space-y-5">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500" />
            NGA Mentoring Log
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Official session records — {stats.total} sessions across {stats.students} students
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View mode toggle */}
          <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-full">
            {(["sessions", "checkins"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  viewMode === mode
                    ? "bg-white dark:bg-gray-700 text-indigo-600 shadow-sm"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {mode === "sessions" ? "Mentor Sessions" : "Mentee Check-ins"}
              </button>
            ))}
          </div>

          {/* Academic year filter */}
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value ? Number(e.target.value) : "")}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">All Years</option>
            {years.map((y) => (
              <option key={y.academic_year_id} value={y.academic_year_id}>{y.name}</option>
            ))}
          </select>

          {/* Mentor filter */}
          {mentorOptions.length > 0 && (
            <select
              value={mentorFilter}
              onChange={(e) => setMentorFilter(e.target.value ? Number(e.target.value) : "")}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white max-w-[160px]"
            >
              <option value="">All Mentors</option>
              {mentorOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          )}

          {/* Stat chips */}
          {stats.flagged > 0 && (
            <span className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              {stats.flagged} flagged
            </span>
          )}
          {stats.followUp > 0 && (
            <span className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
              <Clock className="w-3.5 h-3.5" />
              {stats.followUp} open follow-ups
            </span>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by student..."
              className="pl-9 pr-8 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Flag filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <select
              value={filterFlags}
              onChange={(e) => setFilterFlags(e.target.value as any)}
              className="pl-8 pr-8 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
            >
              <option value="all">All sessions</option>
              <option value="dishonesty">Integrity flags</option>
              <option value="stress">Stress flags</option>
              <option value="follow_up">Open follow-ups</option>
            </select>
          </div>

          {/* Print */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Print / Export</span>
          </button>

          {/* Refresh */}
          <button
            onClick={refresh}
            className="p-2 rounded-full border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────── */}
      {viewMode === "sessions" && (
      <div className="flex-1 overflow-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/30">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Loading log...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
            <Users className="w-10 h-10" />
            <p className="text-sm">
              {entries.length === 0 ? "No sessions recorded yet." : "No sessions match your filter."}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm print:text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Student</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Date</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Topic / Subject</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Well-being</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Duration</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Flags</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((entry, idx) => (
                <React.Fragment key={entry.mentorship_id}>
                  <motion.tr
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.01 }}
                    onClick={() =>
                      setExpandedId(expandedId === entry.mentorship_id ? null : entry.mentorship_id)
                    }
                    className={`cursor-pointer transition-colors ${
                      entry.dishonesty_flagged
                        ? "bg-red-50/50 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30"
                        : entry.stress_flag
                        ? "bg-orange-50/50 dark:bg-orange-950/20 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    }`}
                  >
                    {/* Student */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-300 font-semibold text-xs flex-shrink-0">
                          {(entry.student_name?.[0] ?? "?").toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900 dark:text-white whitespace-nowrap">
                          {entry.student_name ?? "—"}
                        </span>
                      </div>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {formatDate(entry.session_date)}
                    </td>

                    {/* Topic / Subject */}
                    <td className="px-4 py-3 max-w-[180px]">
                      {entry.topic && (
                        <p className="text-gray-800 dark:text-gray-200 truncate">{entry.topic}</p>
                      )}
                      {entry.subject_name && (
                        <p className="text-xs text-indigo-500 dark:text-indigo-400 truncate">
                          {entry.subject_name}
                        </p>
                      )}
                      {!entry.topic && !entry.subject_name && (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Well-being */}
                    <td className="px-4 py-3 text-center text-lg">
                      {entry.wellbeing_status
                        ? WELLBEING_EMOJI[entry.wellbeing_status] ?? "—"
                        : "—"}
                    </td>

                    {/* Duration */}
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {entry.duration_minutes ? `${entry.duration_minutes} min` : "—"}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            STATUS_STYLE[entry.session_status]
                          }`}
                        >
                          {entry.session_status.replace("_", " ")}
                        </span>
                        {entry.is_completed && (
                          <span title="Completed">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Flags */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {entry.dishonesty_flagged && (
                          <span
                            title="Academic Integrity Flag"
                            className="text-xs px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded font-semibold"
                          >
                            Integrity
                          </span>
                        )}
                        {entry.stress_flag && (
                          <span
                            title="Stress Flag"
                            className="text-xs px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded font-semibold"
                          >
                            Stress
                          </span>
                        )}
                        {entry.follow_up_required && entry.session_status !== "RESOLVED" && (
                          <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded">
                            Follow-up
                          </span>
                        )}
                        {!entry.dishonesty_flagged && !entry.stress_flag && !entry.follow_up_required && (
                          <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                        )}
                      </div>
                    </td>

                    {/* Expand toggle */}
                    <td className="px-3 py-3 text-gray-400">
                      {expandedId === entry.mentorship_id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </td>
                  </motion.tr>

                  {/* Expanded detail row */}
                  {expandedId === entry.mentorship_id && (
                    <tr key={`exp-${entry.mentorship_id}`}>
                      <td colSpan={8} className="p-0">
                        <ExpandedRow entry={entry} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}

      {viewMode === "checkins" && (
        <div className="flex-1 overflow-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/30">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-gray-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              Loading check-ins...
            </div>
          ) : filteredCheckIns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
              <Users className="w-10 h-10" />
              <p className="text-sm">
                {checkIns.length === 0 ? "No mentee check-ins submitted yet." : "No check-ins match your filter."}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm print:text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Student</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Mentor</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Category</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400">Message</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Approval</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredCheckIns.map((c) => (
                  <tr key={c.checkin_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">{c.student_name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{c.mentor_name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{c.submitted_at ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full font-medium">
                        {CATEGORY_LABEL[c.category] ?? c.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-[320px] truncate" title={c.title ? `${c.title} — ${c.message}` : c.message}>
                      {c.title && <span className="font-semibold">{c.title}: </span>}
                      {c.message}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        c.status === "NEW"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                          : c.status === "ACKNOWLEDGED"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                          : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        c.validation_status === "APPROVED"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                          : c.validation_status === "REJECTED"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                      }`}>
                        {c.validation_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right print:hidden">
                      {c.validation_status === "PENDING" ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openReview(c, "approve")}
                            className="flex items-center gap-1 text-xs px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 rounded-full font-medium transition-colors"
                          >
                            <Check className="w-3 h-3" />
                            Approve
                          </button>
                          <button
                            onClick={() => openReview(c, "reject")}
                            className="flex items-center gap-1 text-xs px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-full font-medium transition-colors"
                          >
                            <ThumbsDown className="w-3 h-3" />
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Admin review modal (approve/reject a mentee report) ──── */}
      {reviewTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {reviewMode === "approve" ? "Approve" : "Reject"} report — {reviewTarget.student_name}
              </h3>
              <button onClick={() => setReviewTarget(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              {reviewTarget.title && <p className="text-sm font-semibold text-gray-900 dark:text-white">{reviewTarget.title}</p>}
              <p className="text-sm text-gray-600 dark:text-gray-400">{reviewTarget.message}</p>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder={reviewMode === "reject" ? "Explain why this report is being rejected (required)..." : "Add a comment (optional)..."}
                rows={3}
                className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-xl p-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => setReviewTarget(null)} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 rounded-full">
                Cancel
              </button>
              <button
                onClick={submitReview}
                disabled={reviewSubmitting}
                className={`px-4 py-2 rounded-full text-sm font-semibold text-white disabled:opacity-50 ${
                  reviewMode === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {reviewSubmitting ? "Submitting..." : reviewMode === "approve" ? "Confirm Approve" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Print styles injected inline ─────────────────────────── */}
      <style>{`
        @media print {
          body > *:not(.print-root) { display: none !important; }
          .print-root { display: block !important; }
          button, select, input { display: none !important; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ccc; padding: 6px 8px; font-size: 11px; }
          thead { background: #f3f4f6 !important; -webkit-print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
};

export default AdminMentoringLogView;
