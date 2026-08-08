import React, { useEffect, useMemo, useState } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import {
  TrendingUp,
  BookOpen,
  FileText,
  ArrowUpRight,
  CalendarCheck,
  Calendar as CalendarIcon,
  Download,
  Loader2,
  ClipboardList,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  subDays,
} from "date-fns";
import { reportsApi, LessonReportsRollup } from "../../api/reports";
import { LessonReportRollupService } from "../../services/LessonReportRollupService";
import { useTheme } from "../../contexts/ThemeContext";

const parseLocalNoShift = (dateStr: string) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d);
};

interface ReportingDashboardProps {
  stats: any;
  loading: boolean;
  onLoad: (params?: { start_date?: string; end_date?: string }) => void;
  academicTermId?: number | null;
  academicTermName?: string;
  instructorName?: string;
}

type PresetType = "today" | "week" | "month" | "custom";

const ReportingDashboard: React.FC<ReportingDashboardProps> = ({
  stats,
  loading,
  onLoad,
  academicTermId,
  academicTermName,
  instructorName,
}) => {
  const [activePreset, setActivePreset] = useState<PresetType>("week");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<"pdf" | "csv">("pdf");
  const [rollup, setRollup] = useState<LessonReportsRollup | null>(null);
  const [rollupLoading, setRollupLoading] = useState(false);
  const [rollupError, setRollupError] = useState<string | null>(null);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const getPresetRange = (preset: PresetType) => {
    const now = new Date();
    switch (preset) {
      case "today":
        return {
          start: format(startOfDay(now), "yyyy-MM-dd"),
          end: format(endOfDay(now), "yyyy-MM-dd"),
        };
      case "week":
        // Default to last 7 days as requested "a week" usually implies trailing
        return {
          start: format(subDays(now, 7), "yyyy-MM-dd"),
          end: format(now, "yyyy-MM-dd"),
        };
      case "month":
        return {
          start: format(startOfMonth(now), "yyyy-MM-dd"),
          end: format(endOfMonth(now), "yyyy-MM-dd"),
        };
      default:
        return null;
    }
  };

  // Mirrors whatever range is currently on screen, so the Download button
  // always exports exactly what the instructor is looking at.
  const [activeRange, setActiveRange] = useState<{ start_date?: string; end_date?: string }>({});

  // On mount or when preset changes (non-custom)
  useEffect(() => {
    if (activePreset !== "custom") {
      const range = getPresetRange(activePreset);
      if (range) {
        setActiveRange({ start_date: range.start, end_date: range.end });
        onLoad({ start_date: range.start, end_date: range.end });
      } else {
        setActiveRange({});
        onLoad();
      }
    }
  }, [activePreset, onLoad]);

  const handleFilter = () => {
    const range = {
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    };
    setActiveRange(range);
    onLoad(range);
  };

  // Drives both the "Submitted Reports" list and the Download button — one
  // fetch backs both, so the list is always what gets downloaded and vice
  // versa. Re-fires whenever the active range or academic term changes.
  useEffect(() => {
    if (!academicTermId || !activeRange.start_date || !activeRange.end_date) {
      setRollup(null);
      return;
    }
    let cancelled = false;
    setRollupLoading(true);
    setRollupError(null);
    reportsApi
      .getMyLessonReportsRollup({
        start_date: activeRange.start_date,
        end_date: activeRange.end_date,
        academic_term_id: academicTermId,
      })
      .then((res) => {
        if (cancelled) return;
        setRollup((res as any).data?.data ?? (res as any).data);
      })
      .catch(() => {
        if (!cancelled) setRollupError("Failed to load your submitted reports.");
      })
      .finally(() => {
        if (!cancelled) setRollupLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [academicTermId, activeRange.start_date, activeRange.end_date]);

  const flatEntries = useMemo(() => {
    if (!rollup) return [];
    const rows: {
      key: string;
      subjectLabel: string;
      classGroupName: string;
      weekNumber: number;
      deliveryDate: string;
      status: string;
      completionRate: number | null;
      reflectionNotes: string | null;
      topic: string | null;
      instructorName: string;
    }[] = [];
    for (const subject of rollup.subjects) {
      const subjectLabel = subject.subject_code
        ? `[${subject.subject_code}] ${subject.subject_name}`
        : subject.subject_name;
      for (const classGroup of subject.class_groups) {
        for (const week of classGroup.weeks) {
          for (const entry of week.entries) {
            rows.push({
              key: `${entry.lesson_report_id}`,
              subjectLabel,
              classGroupName: classGroup.class_group_name,
              weekNumber: week.week_number,
              deliveryDate: entry.delivery_date,
              status: entry.status,
              completionRate: entry.completion_rate,
              reflectionNotes: entry.reflection_notes,
              topic: entry.topic,
              instructorName: entry.instructor_name,
            });
          }
        }
      }
    }
    return rows.sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate));
  }, [rollup]);

  const handleDownload = () => {
    setDownloadError(null);
    if (!academicTermId) {
      setDownloadError("Select an academic term (top bar) before downloading.");
      return;
    }
    if (!rollup) {
      setDownloadError("Your reports are still loading — try again in a moment.");
      return;
    }
    if (downloadFormat === "csv") {
      LessonReportRollupService.generateCsv(rollup);
    } else {
      LessonReportRollupService.generate(rollup, {
        schoolName: "NGA Coding Academy",
        academicTermName: academicTermName ?? "",
        generatedBy: instructorName ?? "",
      });
    }
  };

  const trend = stats?.trend || [];

  // Format trend data labels: show just dd/MM for chart readability
  const chartData = trend.map((t: any) => {
    const date = t.name ? parseLocalNoShift(t.name) : null;
    return {
      ...t,
      name: date ? format(date, "dd/MM") : (t.name || "N/A"),
    };
  });

  const lastReportDate = stats?.lastReportDate
    ? (() => {
        const d = parseLocalNoShift(stats.lastReportDate);
        return d ? format(d, "dd/MM/yyyy") : stats.lastReportDate;
      })()
    : "N/A";

  if (loading && !stats) {
    return (
      <div className="space-y-6 animate-pulse p-1">
        <div className="h-16 bg-white dark:bg-gray-800/30 rounded-3xl border border-gray-100 dark:border-gray-700/20"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-32 bg-white dark:bg-gray-800/30 rounded-3xl border border-gray-100 dark:border-gray-700/20"
            ></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-80 bg-white dark:bg-gray-800/30 rounded-3xl border border-gray-100 dark:border-gray-700/20"></div>
          <div className="h-80 bg-blue-600/20 rounded-3xl border border-blue-500/20"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* Date Filter Bar */}
      <div className="bg-white dark:bg-gray-800/30 px-6 py-4 rounded-3xl border border-gray-100 dark:border-gray-700/20 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-blue-500" />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Range:
            </span>
          </div>

          <div className="flex p-1 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700/50">
            {(["today", "week", "month", "custom"] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setActivePreset(preset)}
                aria-pressed={activePreset === preset}
                className={`px-4 py-1.5 rounded-xl text-[10px] font-bold uppercase cursor-pointer transition-all duration-200 ${
                  activePreset === preset
                    ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-white border border-blue-500 dark:border-blue-400 shadow-sm scale-[1.02]"
                    : "text-gray-400 border border-transparent hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {activePreset === "custom" && (
            <div className="flex items-center gap-3 animate-in fade-in zoom-in duration-300">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-gray-50 dark:bg-gray-800 border-none rounded-xl px-3 py-1.5 text-[10px] font-bold text-gray-600 dark:text-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <span className="text-gray-300 text-xs">→</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-gray-50 dark:bg-gray-800 border-none rounded-xl px-3 py-1.5 text-[10px] font-bold text-gray-600 dark:text-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <button
                onClick={handleFilter}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
              >
                Apply
              </button>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl text-[10px] font-black uppercase tracking-widest animate-pulse">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping"></span>
              Updating Results
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex p-1 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700/50">
              {(["pdf", "csv"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setDownloadFormat(f)}
                  aria-pressed={downloadFormat === f}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-all duration-200 ${
                    downloadFormat === f
                      ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-white border border-blue-500 dark:border-blue-400 shadow-sm"
                      : "text-gray-400 border border-transparent hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <button
              onClick={handleDownload}
              disabled={rollupLoading || !rollup || flatEntries.length === 0}
              title={
                flatEntries.length === 0
                  ? "No reports in this range to download"
                  : `Download your lesson reports for this range as a ${downloadFormat.toUpperCase()}`
              }
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md shadow-blue-500/20 transition-all duration-200 hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:from-gray-300 disabled:to-gray-300 disabled:dark:from-gray-700 disabled:dark:to-gray-700 disabled:shadow-none disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {rollupLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Download Report
            </button>
          </div>
        </div>
      </div>

      {downloadError && (
        <p className="text-xs font-medium text-red-500 -mt-3 px-1">{downloadError}</p>
      )}

      {/* Top Stats */}
      <div>
        <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2 px-1">
          Curriculum Delivery
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard
            title="Total Reports"
            value={stats?.totalReports ?? 0}
            icon={<FileText className="w-5 h-5" />}
            color="blue"
          />
          <StatCard
            title="Lessons Delivered"
            value={stats?.totalLessons ?? 0}
            icon={<BookOpen className="w-5 h-5" />}
            color="green"
          />
          <StatCard
            title="Last Lesson Report"
            value={lastReportDate}
            icon={<CalendarCheck className="w-5 h-5" />}
            color="amber"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800/30 p-6 rounded-3xl border border-gray-100 dark:border-gray-700/20">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                Reporting Trend
              </h3>
              <p className="text-gray-400 text-xs mt-0.5">
                Reports submitted per day
              </p>
            </div>
            <span className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-0.5 rounded-full bg-blue-500 inline-block" />
              <span className="text-gray-400 font-medium">Reports</span>
            </span>
          </div>

          {chartData.length > 0 ? (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="lessonsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="0"
                    vertical={false}
                    stroke={isDark ? "#27303f" : "#f0f0f0"}
                  />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    dy={8}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    allowDecimals={false}
                    width={28}
                  />
                  <Tooltip
                    cursor={{ stroke: isDark ? "#3B4252" : "#e5e7eb", strokeWidth: 1 }}
                    contentStyle={{
                      backgroundColor: isDark ? "#1f2937" : "#fff",
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 4px 20px rgb(0 0 0 / 0.08)",
                      fontSize: 12,
                      color: isDark ? "#f3f4f6" : "#111827",
                    }}
                    labelStyle={{ color: isDark ? "#f3f4f6" : "#111827", fontWeight: 600, marginBottom: 4 }}
                    formatter={(value: number | undefined) => [value ?? 0, "Reports"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="lessons"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    fill="url(#lessonsFill)"
                    dot={{ r: 4, fill: "#3B82F6", strokeWidth: 2, stroke: isDark ? "#111827" : "#fff" }}
                    activeDot={{ r: 6, strokeWidth: 2, stroke: isDark ? "#111827" : "#fff" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-gray-400 text-sm">
              <div className="text-center">
                <TrendingUp className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                No data yet. Submit your first report.
              </div>
            </div>
          )}
        </div>

        {/* Info Panel */}
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-6 text-white flex flex-col justify-between">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-10 w-40 h-40 rounded-full bg-blue-400/20 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="bg-white/20 w-fit p-2.5 rounded-xl mb-4">
              <SparklesIcon />
            </div>
            <h3 className="text-xl font-black mb-3 leading-tight">
              Your reports make a difference.
            </h3>
            <p className="text-blue-100 text-xs leading-relaxed mb-6">
              Data collected from your reports directly informs clinical support
              and curriculum adjustments at HQ.
            </p>

            <div className="space-y-2.5">
              {[
                `Last report: ${lastReportDate}`,
                `Total submissions: ${stats?.totalReports ?? 0}`,
                `Total lessons logged: ${stats?.totalLessons ?? 0}`,
              ].map((text, i) => (
                <div
                  key={i}
                  className="flex items-center space-x-3 bg-white/10 p-2.5 rounded-xl border border-white/10"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-300" />
                  <span className="text-xs font-bold">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <button className="mt-8 bg-white text-blue-600 w-full py-3 rounded-2xl font-bold flex items-center justify-center space-x-2 group hover:scale-105 transition-all">
            <span>View HQ Feedback</span>
            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
          </button>
        </div>
      </div>

      {/* Submitted Reports list */}
      <div className="bg-white dark:bg-gray-800/30 rounded-3xl border border-gray-100 dark:border-gray-700/20 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700/20">
          <div className="flex items-center gap-2.5">
            <ClipboardList className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-bold text-gray-800 dark:text-white">
              Submitted Reports
            </h3>
            {flatEntries.length > 0 && (
              <span className="text-[10px] font-bold text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                {flatEntries.length}
              </span>
            )}
          </div>
        </div>

        {!academicTermId ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">
            Select an academic term (top bar) to view your submitted reports.
          </div>
        ) : rollupLoading ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading your reports…
          </div>
        ) : rollupError ? (
          <div className="px-6 py-10 text-center text-sm text-red-500">{rollupError}</div>
        ) : flatEntries.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">
            No lesson reports submitted in this range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  <th className="px-6 py-3 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 whitespace-nowrap">Subject</th>
                  <th className="px-4 py-3 whitespace-nowrap">Class Group</th>
                  <th className="px-4 py-3 whitespace-nowrap">Week</th>
                  <th className="px-4 py-3">Topic / Activity</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 whitespace-nowrap">Completion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {flatEntries.map((entry) => (
                  <tr
                    key={entry.key}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    <td className="px-6 py-3 whitespace-nowrap font-bold text-gray-700 dark:text-gray-200">
                      {entry.deliveryDate}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{entry.subjectLabel}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{entry.classGroupName}</td>
                    <td className="px-4 py-3 text-gray-400">Week {entry.weekNumber}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-xs truncate" title={entry.topic ?? ""}>
                      {entry.topic ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={entry.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {entry.completionRate != null ? `${entry.completionRate}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  DELIVERED: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100/50 dark:border-emerald-800/30",
  PARTIAL: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-100/50 dark:border-amber-800/30",
  MISSED: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100/50 dark:border-red-800/30",
  UNPLANNED: "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 border-violet-100/50 dark:border-violet-800/30",
};

const STATUS_LABEL: Record<string, string> = {
  DELIVERED: "Delivered",
  PARTIAL: "Partial",
  MISSED: "Missed",
  UNPLANNED: "Unscheduled",
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span
    className={`inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
      STATUS_BADGE_CLASSES[status] ?? STATUS_BADGE_CLASSES.UNPLANNED
    }`}
  >
    {STATUS_LABEL[status] ?? status}
  </span>
);

type StatCardColor = "blue" | "green" | "amber";

const STAT_CARD_STYLES: Record<StatCardColor, { iconChip: string; iconText: string; hoverShadow: string }> = {
  blue: {
    iconChip: "bg-gradient-to-br from-blue-500/15 to-blue-600/5",
    iconText: "text-blue-600 dark:text-blue-400",
    hoverShadow: "hover:shadow-blue-500/10",
  },
  green: {
    iconChip: "bg-gradient-to-br from-green-500/15 to-green-600/5",
    iconText: "text-green-600 dark:text-green-400",
    hoverShadow: "hover:shadow-green-500/10",
  },
  amber: {
    iconChip: "bg-gradient-to-br from-amber-500/15 to-amber-600/5",
    iconText: "text-amber-600 dark:text-amber-400",
    hoverShadow: "hover:shadow-amber-500/10",
  },
};

const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: StatCardColor;
}> = ({ title, value, icon, color }) => {
  const styles = STAT_CARD_STYLES[color];
  return (
    <div
      className={`bg-white dark:bg-gray-800/30 p-5 rounded-3xl border border-gray-100 dark:border-gray-700/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${styles.hoverShadow}`}
    >
      <div className={`p-2.5 rounded-xl w-fit mb-3 ${styles.iconChip} ${styles.iconText}`}>
        {icon}
      </div>
      <div className="space-y-0.5">
        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
          {title}
        </h4>
        <div className="text-2xl font-black text-gray-800 dark:text-white">{value}</div>
      </div>
    </div>
  );
};

const SparklesIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-white"
  >
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    <path d="M5 3v4" />
    <path d="M19 17v4" />
    <path d="M3 5h4" />
    <path d="M17 19h4" />
  </svg>
);

export default ReportingDashboard;
