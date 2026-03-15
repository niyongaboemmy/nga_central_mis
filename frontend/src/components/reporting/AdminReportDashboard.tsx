import React, { useMemo } from "react";
import { format } from "date-fns";
import {
  Users,
  BookOpen,
  Clock,
  TrendingUp,
  AlertCircle,
  FileText,
  Activity,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface AdminReportDashboardProps {
  reports: any[];
  loading: boolean;
}

export const AdminReportDashboard: React.FC<AdminReportDashboardProps> = ({
  reports,
  loading,
}) => {
  const stats = useMemo(() => {
    if (!reports || reports.length === 0) return null;

    const totalReports = reports.length;
    const totalLessons = reports.reduce(
      (sum, r) => sum + (r.lessons_delivered_count || 0),
      0,
    );
    const totalMentorship = reports.reduce(
      (sum, r) => sum + (r.mentorship_sessions_count || 0),
      0,
    );
    const onTrackCount = reports.filter(
      (r) => r.progress_status === "ON_TRACK" || r.progress_status === "AHEAD",
    ).length;
    const behindCount = totalReports - onTrackCount;

    // Process Trend Data - group by date
    const trendMap = new Map();
    reports.forEach((r) => {
      const date = r.start_date;
      const current = trendMap.get(date) || { lessons: 0, mentorship: 0 };
      trendMap.set(date, {
        lessons: current.lessons + (r.lessons_delivered_count || 0),
        mentorship: current.mentorship + (r.mentorship_sessions_count || 0),
      });
    });

    const trendData = Array.from(trendMap.entries())
      .map(([date, vals]) => ({
        name: date,
        ...vals,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => ({
        ...d,
        name: format(new Date(d.name), "dd/MM"),
      }));

    return {
      totalReports,
      totalLessons,
      totalMentorship,
      onTrackRate: Math.round((onTrackCount / totalReports) * 100),
      behindCount,
      trendData,
    };
  }, [reports]);

  if (loading && (!reports || reports.length === 0)) {
    return (
      <div className="space-y-6 animate-pulse p-1">
        {/* Stats Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-32 bg-gray-100 dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700"
            ></div>
          ))}
        </div>

        {/* Charts Row Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-80 bg-gray-100 dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700"></div>
          <div className="h-80 bg-gray-100 dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700"></div>
        </div>

        {/* Insights Skeleton */}
        <div className="h-40 bg-gray-100 dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-gray-50 dark:bg-gray-800/30 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-8 text-center">
        <Activity className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-xl font-bold text-gray-700 dark:text-gray-300">
          No data for visualization
        </h3>
        <p className="text-gray-500 max-w-xs mt-2 font-medium">
          Please adjust your filters or wait for more reports to be submitted.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Reports"
          value={stats.totalReports}
          icon={<FileText className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          label="Lessons Delivered"
          value={stats.totalLessons}
          icon={<BookOpen className="w-6 h-6" />}
          color="indigo"
        />
        <StatCard
          label="Mentorship Sessions"
          value={stats.totalMentorship}
          icon={<Users className="w-6 h-6" />}
          color="emerald"
        />
        <StatCard
          label="On-Track Rate"
          value={`${stats.onTrackRate}%`}
          icon={<TrendingUp className="w-6 h-6" />}
          color={stats.onTrackRate > 80 ? "emerald" : "amber"}
          subText={`${stats.behindCount} reports behind`}
        />
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800/40 p-6 rounded-3xl border border-gray-100 dark:border-gray-800/50 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              Reporting Trend
            </h3>
            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-gray-400">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span>Lessons</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span>Mentorship</span>
              </div>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.trendData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  strokeOpacity={0.1}
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
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1f2937",
                    border: "none",
                    borderRadius: "12px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                  itemStyle={{ color: "#fff" }}
                />
                <Line
                  type="monotone"
                  dataKey="lessons"
                  stroke="#3B82F6"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "#3B82F6", strokeWidth: 2, stroke: "#fff" }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="mentorship"
                  stroke="#10B981"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "#10B981", strokeWidth: 2, stroke: "#fff" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribution Circle */}
        <div className="bg-white dark:bg-gray-800/40 p-6 rounded-3xl border border-gray-100 dark:border-gray-800/50 shadow-sm">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            Performance
          </h3>
          <div className="flex items-center justify-center h-48">
            <div className="relative w-40 h-40">
              <svg
                viewBox="0 0 36 36"
                className="w-full h-full transform -rotate-90"
              >
                <path
                  className="text-gray-100 dark:text-gray-800 stroke-current"
                  strokeWidth="3.8"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-emerald-500 stroke-current"
                  strokeWidth="3.8"
                  strokeDasharray={`${stats.onTrackRate}, 100`}
                  strokeLinecap="round"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-gray-900 dark:text-white leading-none">
                  {stats.onTrackRate}%
                </span>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight mt-1">
                  On Track
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-2 mt-4">
            <div className="flex items-center justify-between p-2.5 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-xl border border-emerald-100/30">
              <span className="text-[10px] font-bold text-emerald-600 uppercase">On Track</span>
              <span className="text-xs font-black text-emerald-700">{stats.onTrackRate}%</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-amber-50/50 dark:bg-amber-900/10 rounded-xl border border-amber-100/30">
              <span className="text-[10px] font-bold text-amber-600 uppercase">Behind</span>
              <span className="text-xs font-black text-amber-700">{100 - stats.onTrackRate}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800/40 p-6 rounded-3xl border border-gray-100 dark:border-gray-800/50 shadow-sm">
        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-500" />
          Recent Activity Insights
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {reports.slice(0, 4).map((r, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700/50"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white dark:bg-gray-800 dark:text-white rounded-full flex items-center justify-center text-[16px] font-black shadow-sm">
                  {r.instructor_name?.charAt(0)}
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-800 dark:text-white">
                    {r.instructor_name}
                  </div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                    {format(new Date(r.submission_date), "MMM dd, HH:mm")}
                  </div>
                </div>
              </div>
              <div
                className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                  r.progress_status === "ON_TRACK" || r.progress_status === "AHEAD"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {r.progress_status}
              </div>
            </div>
          ))}
        </div>
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
    blue: "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50",
    indigo:
      "bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800/50",
    emerald:
      "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50",
    amber:
      "bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50",
  };

  return (
    <div className="bg-white dark:bg-gray-800/40 p-6 rounded-3xl border border-gray-100 dark:border-gray-800/50 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">
            {label}
          </p>
          <h4 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            {value}
          </h4>
          {subText && (
            <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {subText}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-2xl border ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

export default AdminReportDashboard;
