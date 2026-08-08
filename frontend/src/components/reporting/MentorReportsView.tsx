import React, { useEffect, useState, useCallback } from "react";
import {
  Calendar,
  RefreshCw,
  ChevronLeft,
  ClipboardList,
  MessageCircle,
  AlertTriangle,
  Clock3,
  Download,
} from "lucide-react";
import { mentorshipApi, MySessionsReport } from "../../api/mentorship";
import { MentorshipReportService } from "../../services/MentorshipReportService";
import { useToast } from "../../contexts/ToastContext";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { useUser } from "../../contexts/UserContext";

type PresetType = "week" | "month" | "term" | "custom";

const toISODate = (d: Date) => d.toISOString().split("T")[0];

const STAT_STYLES = {
  blue: { chip: "bg-gradient-to-br from-blue-500/15 to-blue-600/5", text: "text-blue-600 dark:text-blue-400", hover: "hover:shadow-blue-500/10" },
  amber: { chip: "bg-gradient-to-br from-amber-500/15 to-amber-600/5", text: "text-amber-600 dark:text-amber-400", hover: "hover:shadow-amber-500/10" },
  red: { chip: "bg-gradient-to-br from-red-500/15 to-red-600/5", text: "text-red-600 dark:text-red-400", hover: "hover:shadow-red-500/10" },
  indigo: { chip: "bg-gradient-to-br from-indigo-500/15 to-indigo-600/5", text: "text-indigo-600 dark:text-indigo-400", hover: "hover:shadow-indigo-500/10" },
} as const;

const StatCard: React.FC<{ title: string; value: number; icon: React.ReactNode; color: keyof typeof STAT_STYLES }> = ({
  title,
  value,
  icon,
  color,
}) => {
  const s = STAT_STYLES[color];
  return (
    <div className={`bg-white dark:bg-gray-800/30 p-4 rounded-3xl border border-gray-100 dark:border-gray-700/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${s.hover}`}>
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl flex-shrink-0 ${s.chip} ${s.text}`}>{icon}</div>
        <div className="min-w-0">
          <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">{title}</h4>
          <div className="text-xl font-black text-gray-800 dark:text-white">{value}</div>
        </div>
      </div>
    </div>
  );
};

interface Props {
  onBack: () => void;
}

const MentorReportsView: React.FC<Props> = ({ onBack }) => {
  const { showToast } = useToast();
  const { selectedYear } = useAcademicPeriod();
  const { user } = useUser();

  const [preset, setPreset] = useState<PresetType>("month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [report, setReport] = useState<MySessionsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [tab, setTab] = useState<"sessions" | "checkins">("sessions");

  const instructorName =
    user?.profile?.first_name && user?.profile?.last_name
      ? `${user.profile.first_name} ${user.profile.last_name}`
      : user?.user?.username ?? "";

  // Resolve the preset into concrete start/end dates whenever it changes.
  useEffect(() => {
    if (preset === "custom") return;
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);
    if (preset === "week") {
      const day = now.getDay();
      start.setDate(now.getDate() - day);
      end.setDate(start.getDate() + 6);
    } else if (preset === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (preset === "term") {
      // Approximate "this term" as the last 4 months when no explicit term
      // date range is wired in here — still gives the mentor a broad,
      // useful window without requiring extra plumbing.
      start.setMonth(now.getMonth() - 4);
    }
    setStartDate(toISODate(start));
    setEndDate(toISODate(end));
  }, [preset]);

  const load = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    try {
      const res = await mentorshipApi.getMySessionsReport({ start_date: startDate, end_date: endDate });
      const data = (res as any).data?.data ?? (res as any).data;
      setReport(data ?? null);
    } catch {
      showToast("Failed to load your reports for this period", "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await mentorshipApi.getConsolidatedReport({
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });
      const data = (res as any).data?.data ?? (res as any).data;
      if (!data || data.mentees.length === 0) {
        showToast("No mentees assigned yet — nothing to generate", "error");
        return;
      }
      MentorshipReportService.download(data, {
        schoolName: "NGA MIS",
        academicYearName: selectedYear?.name ?? "",
        generatedBy: instructorName,
      });
      showToast("Report downloaded", "success");
    } catch {
      showToast("Failed to generate report", "error");
    } finally {
      setDownloading(false);
    }
  };

  const summary = report?.summary;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Mentoring Hub
        </button>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-full text-sm font-semibold transition-colors"
        >
          <Download className="w-4 h-4" />
          {downloading ? "Generating..." : "Download Report"}
        </button>
      </div>

      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-blue-500" />
          My Reports
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Every session and mentee report across your mentees, for a selected period.
        </p>
      </div>

      {/* Period presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl">
          {(["week", "month", "term", "custom"] as PresetType[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all ${
                preset === p
                  ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-white border border-blue-500 dark:border-blue-400 shadow-sm"
                  : "text-gray-500 dark:text-gray-200 border border-transparent hover:text-gray-700 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700/60"
              }`}
            >
              {p === "term" ? "Last 4 Months" : `This ${p}`}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-8 pr-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
            <span className="text-gray-400 text-xs">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
        )}
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Sessions" value={summary?.total_sessions ?? 0} icon={<ClipboardList className="w-4 h-4" />} color="blue" />
        <StatCard title="Mentee Reports" value={summary?.total_checkins ?? 0} icon={<MessageCircle className="w-4 h-4" />} color="indigo" />
        <StatCard title="Pending Review" value={summary?.pending_checkins ?? 0} icon={<Clock3 className="w-4 h-4" />} color="amber" />
        <StatCard title="Flagged Sessions" value={summary?.flagged_sessions ?? 0} icon={<AlertTriangle className="w-4 h-4" />} color="red" />
      </div>

      {/* Sessions / Check-ins toggle */}
      <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl w-fit">
        {(["sessions", "checkins"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              tab === t
                ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-white shadow-sm"
                : "text-gray-500 dark:text-gray-200 hover:text-gray-700 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700/60"
            }`}
          >
            {t === "sessions" ? "Sessions" : "Mentee Reports"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center text-gray-400 py-16">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Loading...
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800/30 rounded-2xl border border-gray-100 dark:border-gray-700/20 overflow-hidden">
          {tab === "sessions" ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 text-xs uppercase font-bold">
                <tr>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Mentee</th>
                  <th className="text-left px-4 py-3">Topic</th>
                  <th className="text-left px-4 py-3">Wellbeing</th>
                  <th className="text-left px-4 py-3">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/30">
                {(report?.sessions ?? []).map((s) => (
                  <tr key={s.mentorship_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-gray-500 text-xs">{s.session_date}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{s.student_name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.topic ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{s.wellbeing_status ?? "—"}</td>
                    <td className="px-4 py-3">
                      {(s.dishonesty_flagged || s.stress_flag) && (
                        <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full font-medium">
                          Flagged
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {(report?.sessions ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                      No sessions logged in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 text-xs uppercase font-bold">
                <tr>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Mentee</th>
                  <th className="text-left px-4 py-3">Message</th>
                  <th className="text-left px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/30">
                {(report?.checkins ?? []).map((c) => (
                  <tr key={c.checkin_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.submitted_at}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{c.student_name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[320px] truncate">
                      {c.title && <span className="font-semibold">{c.title}: </span>}
                      {c.message}
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
                  </tr>
                ))}
                {(report?.checkins ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                      No mentee reports in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default MentorReportsView;
