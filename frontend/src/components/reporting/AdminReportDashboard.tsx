import React, { useMemo } from "react";
import UserAvatar from "../ui/UserAvatar";
import { format } from "date-fns";
import {
  Users,
  BookOpen,
  TrendingUp,
  AlertCircle,
  Activity,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Target,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  AdminDashboardStats,
  InstructorCompliance,
  SubjectCoverageItem,
  CategorySummaryItem,
} from "../../api/reports";

interface AdminReportDashboardProps {
  reports: any[];
  loading: boolean;
  adminStats?: AdminDashboardStats | null;
  complianceData?: InstructorCompliance[];
  subjectCoverage?: SubjectCoverageItem[];
  supportRequestSummary?: CategorySummaryItem[];
  challengeSummary?: CategorySummaryItem[];
}

const parseLocalNoShift = (dateStr: string) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const AdminReportDashboard: React.FC<AdminReportDashboardProps> = ({
  reports,
  loading,
  adminStats,
  complianceData = [],
  subjectCoverage = [],
  supportRequestSummary = [],
  challengeSummary = [],
}) => {
  // Derive legacy stats from InstructorReport array when adminStats not yet loaded
  const legacyStats = useMemo(() => {
    if (!reports || reports.length === 0) return null;
    const totalReports  = reports.length;
    const totalLessons  = reports.reduce((s, r) => s + (r.lessons_delivered_count || 0), 0);
    const totalMentorship = reports.reduce((s, r) => s + (r.mentorship_sessions_count || 0), 0);
    const onTrackCount  = reports.filter(
      (r) => r.progress_status === "ON_TRACK" || r.progress_status === "AHEAD",
    ).length;

    const trendMap = new Map<string, { lessons: number; mentorship: number }>();
    reports.forEach((r) => {
      const date = r.start_date || (r.submission_date ? r.submission_date.split("T")[0] : null);
      if (!date) return;
      const cur = trendMap.get(date) || { lessons: 0, mentorship: 0 };
      trendMap.set(date, {
        lessons:    cur.lessons    + (r.lessons_delivered_count    || 0),
        mentorship: cur.mentorship + (r.mentorship_sessions_count  || 0),
      });
    });

    const trendData = Array.from(trendMap.entries())
      .map(([date, vals]) => ({ rawDate: date, ...vals }))
      .sort((a, b) => (a.rawDate || "").localeCompare(b.rawDate || ""))
      .map((d) => {
        const parsed = parseLocalNoShift(d.rawDate);
        return { ...d, name: parsed ? format(parsed, "dd/MM") : d.rawDate };
      });

    return {
      totalReports,
      totalLessons,
      totalMentorship,
      onTrackRate: Math.round((onTrackCount / totalReports) * 100),
      behindCount: totalReports - onTrackCount,
      trendData,
    };
  }, [reports]);

  // Average compliance across all instructors
  const avgCompliance = useMemo(() => {
    if (!complianceData || complianceData.length === 0) return null;
    const avg = Math.round(
      complianceData.reduce((s, i) => s + i.compliance_pct, 0) / complianceData.length,
    );
    return avg;
  }, [complianceData]);

  // Coverage chart data from adminStats
  const coverageChartData = useMemo(() => {
    if (!adminStats) return null;
    const delivered = adminStats.delivered_entries;
    const pending   = Math.max(0, adminStats.total_sow_entries - delivered);
    return [
      { name: "Delivered", value: delivered, color: "#10B981" },
      { name: "Pending",   value: pending,   color: "#F59E0B" },
    ];
  }, [adminStats]);

  // Schedule health chart
  const scheduleChartData = useMemo(() => {
    if (!adminStats) return null;
    const map: Record<string, number> = {};
    adminStats.schedule_breakdown.forEach((s) => {
      map[s.schedule_flag] = s.total;
    });
    return [
      { name: "On Time", value: map["ON_TIME"] ?? 0, color: "#10B981" },
      { name: "Ahead",   value: map["AHEAD"]   ?? 0, color: "#3B82F6" },
      { name: "Behind",  value: map["BEHIND"]  ?? 0, color: "#F59E0B" },
    ];
  }, [adminStats]);

  // Live trend from adminStats, fall back to legacy
  const trendData = useMemo(() => {
    if (adminStats && adminStats.trend_data.length > 0) {
      return adminStats.trend_data.map((d) => {
        const parsed = parseLocalNoShift(d.date);
        return { name: parsed ? format(parsed, "dd/MM") : d.date, lessons: d.total };
      });
    }
    return legacyStats?.trendData ?? [];
  }, [adminStats, legacyStats]);

  if (loading && !adminStats && !legacyStats) {
    return (
      <div className="space-y-6 animate-pulse p-1">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-100 dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-80 bg-gray-100 dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700" />
          <div className="h-80 bg-gray-100 dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700" />
        </div>
        <div className="h-40 bg-gray-100 dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700" />
      </div>
    );
  }

  if (!adminStats && !legacyStats) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-gray-50 dark:bg-gray-800/30 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-8 text-center">
        <Activity className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-xl font-bold text-gray-700 dark:text-gray-300">No data for visualization</h3>
        <p className="text-gray-500 max-w-xs mt-2 font-medium">
          Please adjust your filters or wait for more reports to be submitted.
        </p>
      </div>
    );
  }

  const totalLessonReports      = adminStats?.total_lesson_reports      ?? legacyStats?.totalLessons      ?? 0;
  const totalMentorshipSessions = adminStats?.total_mentorship_sessions ?? legacyStats?.totalMentorship   ?? 0;
  const coveragePct             = adminStats?.curriculum_coverage_pct   ?? legacyStats?.onTrackRate       ?? 0;
  const compliancePct           = avgCompliance                          ?? legacyStats?.onTrackRate       ?? 0;

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          label="Lesson Reports"
          value={totalLessonReports}
          icon={<BookOpen className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          label="Mentorship Sessions"
          value={totalMentorshipSessions}
          icon={<Users className="w-6 h-6" />}
          color="emerald"
        />
        <StatCard
          label="Curriculum Coverage"
          value={`${coveragePct}%`}
          icon={<Target className="w-6 h-6" />}
          color={coveragePct >= 70 ? "emerald" : "amber"}
          subText={adminStats ? `${adminStats.delivered_entries} / ${adminStats.total_sow_entries} topics` : undefined}
        />
        <StatCard
          label="Reporting Compliance"
          value={`${compliancePct}%`}
          icon={<ShieldCheck className="w-6 h-6" />}
          color={compliancePct >= 80 ? "emerald" : compliancePct >= 50 ? "amber" : "red"}
          subText={complianceData.length > 0 ? `${complianceData.length} instructors` : undefined}
        />
        <StatCard
          label={adminStats ? "Behind Schedule" : "On-Track Rate"}
          value={
            adminStats
              ? (adminStats.schedule_breakdown.find((s) => s.schedule_flag === "BEHIND")?.total ?? 0)
              : `${legacyStats?.onTrackRate ?? 0}%`
          }
          icon={<TrendingUp className="w-6 h-6" />}
          color={
            adminStats
              ? (adminStats.schedule_breakdown.find((s) => s.schedule_flag === "BEHIND")?.total ?? 0) === 0
                ? "emerald"
                : "amber"
              : (legacyStats?.onTrackRate ?? 0) > 80
              ? "emerald"
              : "amber"
          }
          subText={legacyStats && !adminStats ? `${legacyStats.behindCount} reports behind` : undefined}
        />
      </div>

      {/* Trend + Schedule Health row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Lesson Delivery Trend */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800/40 p-6 rounded-3xl border border-gray-100 dark:border-gray-800/50 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              Daily Lesson Delivery Trend
            </h3>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span>Lessons Reported</span>
            </div>
          </div>
          <div className="h-64">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9ca3af" }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "12px", color: "#fff", fontSize: "12px" }}
                    itemStyle={{ color: "#fff" }}
                  />
                  <Line type="monotone" dataKey="lessons" stroke="#3B82F6" strokeWidth={3} dot={{ r: 4, fill: "#3B82F6", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-gray-400 font-medium">No trend data available for the selected range.</p>
              </div>
            )}
          </div>
        </div>

        {/* Schedule Health Donut */}
        <div className="bg-white dark:bg-gray-800/40 p-6 rounded-3xl border border-gray-100 dark:border-gray-800/50 shadow-sm">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            Scheduling Health
          </h3>
          {scheduleChartData ? (
            <>
              <div className="flex items-center justify-center h-32">
                <div className="relative w-32 h-32">
                  <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                    <path
                      className="text-gray-100 dark:text-gray-800 stroke-current"
                      strokeWidth="3.8" fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-emerald-500 stroke-current"
                      strokeWidth="3.8"
                      strokeDasharray={`${scheduleChartData[0].value + scheduleChartData[1].value > 0
                        ? Math.round(((scheduleChartData[0].value + scheduleChartData[1].value) /
                          (scheduleChartData[0].value + scheduleChartData[1].value + scheduleChartData[2].value || 1)) * 100)
                        : 0}, 100`}
                      strokeLinecap="round" fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-black text-gray-900 dark:text-white leading-none">
                      {scheduleChartData[0].value + scheduleChartData[1].value + scheduleChartData[2].value > 0
                        ? Math.round(((scheduleChartData[0].value + scheduleChartData[1].value) /
                            (scheduleChartData[0].value + scheduleChartData[1].value + scheduleChartData[2].value)) * 100)
                        : 0}%
                    </span>
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight mt-0.5">OK</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2 mt-4">
                {scheduleChartData.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between p-2.5 bg-gray-50/50 dark:bg-gray-800/40 rounded-xl border border-gray-100/30"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400 uppercase">{item.name}</span>
                    </div>
                    <span className="text-xs font-black text-gray-700 dark:text-gray-200">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-48">
              <p className="text-sm text-gray-400 font-medium">No schedule data yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Curriculum Coverage Chart */}
      {coverageChartData && (
        <div className="bg-white dark:bg-gray-800/40 p-6 rounded-3xl border border-gray-100 dark:border-gray-800/50 shadow-sm">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-500" />
            Curriculum Coverage — Topics by Status
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={coverageChartData} layout="vertical" barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} strokeOpacity={0.1} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                  <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#6b7280", fontWeight: 700 }} width={70} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "12px", color: "#fff", fontSize: "12px" }}
                    itemStyle={{ color: "#fff" }}
                  />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                    {coverageChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100/30">
                <div className="p-2.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Topics Delivered</p>
                  <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{coverageChartData[0].value}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 p-4 bg-amber-50/50 dark:bg-amber-900/10 rounded-2xl border border-amber-100/30">
                <div className="p-2.5 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
                  <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Topics Pending</p>
                  <p className="text-2xl font-black text-amber-700 dark:text-amber-300">{coverageChartData[1].value}</p>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Coverage Rate</span>
                <span className="text-sm font-black text-gray-800 dark:text-white">{coveragePct}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subject Performance — coverage per subject */}
      {subjectCoverage.length > 0 && (
        <div className="bg-white dark:bg-gray-800/40 p-6 rounded-3xl border border-gray-100 dark:border-gray-800/50 shadow-sm">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-500" />
            Subject Delivery Coverage
          </h3>
          <div className="space-y-3">
            {subjectCoverage.map((s) => (
              <div key={s.subject_id} className="flex items-center gap-4 p-3 bg-gray-50/50 dark:bg-gray-800/40 rounded-2xl border border-gray-100/50 dark:border-gray-700/30">
                <div className="flex-shrink-0 w-28 truncate">
                  <span className="text-[10px] font-black text-gray-700 dark:text-gray-200 truncate block">{s.subject_name}</span>
                  {s.subject_code && (
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">{s.subject_code}</span>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">
                      {s.delivered} / {s.total_entries} topics
                    </span>
                    <span className={`text-[10px] font-black ${
                      s.coverage_pct >= 70 ? "text-emerald-600" : s.coverage_pct >= 40 ? "text-amber-600" : "text-red-500"
                    }`}>
                      {s.coverage_pct}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        s.coverage_pct >= 70 ? "bg-emerald-500" : s.coverage_pct >= 40 ? "bg-amber-400" : "bg-red-400"
                      }`}
                      style={{ width: `${s.coverage_pct}%` }}
                    />
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                    s.pending === 0
                      ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border-emerald-100/50"
                      : "bg-amber-50 dark:bg-amber-900/20 text-amber-600 border-amber-100/50"
                  }`}>
                    {s.pending === 0 ? "Complete" : `${s.pending} pending`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Support Requests / Top Challenges — categorized ranking (Phase 4) */}
      {(supportRequestSummary.length > 0 || challengeSummary.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {supportRequestSummary.length > 0 && (
            <RankedCategoryList
              title="Top Support Requests"
              icon={<AlertCircle className="w-5 h-5 text-blue-500" />}
              items={supportRequestSummary}
              barColor="bg-blue-500"
            />
          )}
          {challengeSummary.length > 0 && (
            <RankedCategoryList
              title="Top Challenges"
              icon={<AlertCircle className="w-5 h-5 text-red-500" />}
              items={challengeSummary}
              barColor="bg-red-500"
            />
          )}
        </div>
      )}

      {/* Compliance Leaderboard */}
      {complianceData.length > 0 && (
        <div className="bg-white dark:bg-gray-800/40 p-6 rounded-3xl border border-gray-100 dark:border-gray-800/50 shadow-sm">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-500" />
            Instructor Reporting Compliance
          </h3>
          <div className="space-y-3">
            {complianceData.slice(0, 8).map((inst) => (
              <div key={inst.user_id} className="flex items-center gap-4 p-3 bg-gray-50/50 dark:bg-gray-800/40 rounded-2xl border border-gray-100/50 dark:border-gray-700/30">
                <UserAvatar decorative userId={inst.user_id} name={inst.instructor_name} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gray-800 dark:text-white truncate">{inst.instructor_name}</span>
                    <span className={`text-[10px] font-black ml-2 flex-shrink-0 ${inst.compliance_pct >= 80 ? "text-emerald-600" : inst.compliance_pct >= 50 ? "text-amber-600" : "text-red-500"}`}>
                      {inst.compliance_pct}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        inst.compliance_pct >= 80 ? "bg-emerald-500" : inst.compliance_pct >= 50 ? "bg-amber-400" : "bg-red-400"
                      }`}
                      style={{ width: `${inst.compliance_pct}%` }}
                    />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">{inst.reported_lessons}/{inst.expected_lessons}</div>
                  {inst.non_delivered > 0 && (
                    <div className="flex items-center gap-0.5 text-[9px] font-bold text-amber-500 mt-0.5">
                      <AlertCircle className="w-2.5 h-2.5" />
                      {inst.non_delivered} pending
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity (legacy fallback when adminStats not yet populated) */}
      {!adminStats && legacyStats && reports.slice(0, 4).length > 0 && (
        <div className="bg-white dark:bg-gray-800/40 p-6 rounded-3xl border border-gray-100 dark:border-gray-800/50 shadow-sm">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-500" />
            Recent Activity Insights
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {reports.slice(0, 4).map((r, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700/50">
                <div className="flex items-center gap-3">
                  <UserAvatar decorative userId={r.reported_by} name={r.instructor_name || "?"} size={32} />
                  <div>
                    <div className="text-xs font-bold text-gray-800 dark:text-white">{r.instructor_name}</div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                      {format(new Date(r.submission_date), "MMM dd, HH:mm")}
                    </div>
                  </div>
                </div>
                <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                  r.progress_status === "ON_TRACK" || r.progress_status === "AHEAD"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  {r.progress_status}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const RankedCategoryList: React.FC<{
  title: string;
  icon: React.ReactNode;
  items: CategorySummaryItem[];
  barColor: string;
}> = ({ title, icon, items, barColor }) => {
  const maxTotal = Math.max(...items.map((i) => Number(i.total)), 1);
  return (
    <div className="bg-white dark:bg-gray-800/40 p-6 rounded-3xl border border-gray-100 dark:border-gray-800/50 shadow-sm">
      <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
        {icon}
        {title}
      </h3>
      <div className="space-y-3">
        {items.slice(0, 8).map((item) => (
          <div key={item.category_id} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">{item.label}</span>
                <span className="text-[10px] font-black text-gray-400 ml-2 flex-shrink-0">{item.total}</span>
              </div>
              <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                  style={{ width: `${(Number(item.total) / maxTotal) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const StatCard: React.FC<{
  label: string;
  value: any;
  icon: React.ReactNode;
  color: string;
  subText?: string;
}> = ({ label, value, icon, color, subText }) => {
  const colorClasses: Record<string, string> = {
    blue:    "bg-blue-50    text-blue-600    border-blue-100    dark:bg-blue-900/30    dark:text-blue-400    dark:border-blue-800/50",
    indigo:  "bg-indigo-50  text-indigo-600  border-indigo-100  dark:bg-indigo-900/30  dark:text-indigo-400  dark:border-indigo-800/50",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50",
    amber:   "bg-amber-50   text-amber-600   border-amber-100   dark:bg-amber-900/30   dark:text-amber-400   dark:border-amber-800/50",
    red:     "bg-red-50     text-red-600     border-red-100     dark:bg-red-900/30     dark:text-red-400     dark:border-red-800/50",
  };

  return (
    <div className="bg-white dark:bg-gray-800/40 p-6 rounded-3xl border border-gray-100 dark:border-gray-800/50 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">{label}</p>
          <h4 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">{value}</h4>
          {subText && (
            <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {subText}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-2xl border ${colorClasses[color] ?? colorClasses.blue}`}>{icon}</div>
      </div>
    </div>
  );
};

export default AdminReportDashboard;
