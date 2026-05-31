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
} from "lucide-react";
import { mentorshipApi, AdminLogEntry, SessionStatus } from "../../api/mentorship";
import { useToast } from "../../contexts/ToastContext";

const WELLBEING_EMOJI: Record<string, string> = {
  STRUGGLING: "😢",
  CONCERNED:  "😟",
  NEUTRAL:    "😐",
  GOOD:       "🙂",
  EXCELLENT:  "😄",
};

const STATUS_STYLE: Record<SessionStatus, string> = {
  OPEN:        "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
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

  const [entries, setEntries] = useState<AdminLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterFlags, setFilterFlags] = useState<"all" | "dishonesty" | "stress" | "follow_up">("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const hasFetched = useRef(false);

  const fetchLog = async () => {
    setLoading(true);
    try {
      const res = await mentorshipApi.getAdminLog({ limit: 200 });
      const data = (res as any).data?.data ?? (res as any).data ?? [];
      setEntries(Array.isArray(data) ? data : []);
    } catch {
      showToast("Failed to load mentoring log", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchLog();
  }, []);

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
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Print / Export</span>
          </button>

          {/* Refresh */}
          <button
            onClick={() => { hasFetched.current = false; fetchLog(); }}
            className="p-2 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
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
