import React, { useEffect } from "react";
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
  Users,
  BookOpen,
  FileText,
  ArrowUpRight,
  CalendarCheck,
} from "lucide-react";
import { format } from "date-fns";

const parseLocalNoShift = (dateStr: string) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d);
};

interface ReportingDashboardProps {
  stats: any;
  loading: boolean;
  onLoad: () => void;
}

const ReportingDashboard: React.FC<ReportingDashboardProps> = ({
  stats,
  loading,
  onLoad,
}) => {
  useEffect(() => {
    onLoad();
  }, [onLoad]);

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );

  const trend = stats?.trend || [];

  // Format trend data labels: show just dd/MM for chart readability
  const chartData = trend.map((t: any) => {
    const date = parseLocalNoShift(t.name);
    return {
      ...t,
      name: date ? format(date, "dd/MM") : t.name,
    };
  });

  const lastReportDate = stats?.lastReportDate
    ? (() => {
        const d = parseLocalNoShift(stats.lastReportDate);
        return d ? format(d, "dd/MM/yyyy") : stats.lastReportDate;
      })()
    : "N/A";

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          title="Mentorship Sessions"
          value={stats?.totalMentorship ?? 0}
          icon={<Users className="w-5 h-5" />}
          color="purple"
        />
        <StatCard
          title="Last Report"
          value={lastReportDate}
          icon={<CalendarCheck className="w-5 h-5" />}
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                Reporting Trend
              </h3>
              <p className="text-gray-400 text-xs mt-0.5">
                Lessons delivered & mentorship sessions per report
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
                <span className="text-gray-400 font-medium">Lessons</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-purple-500 inline-block" />
                <span className="text-gray-400 font-medium">Mentorship</span>
              </span>
            </div>
          </div>

          {chartData.length > 0 ? (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorLessons" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorMentorship" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
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
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 4px 20px rgb(0 0 0 / 0.08)",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="lessons"
                    stroke="#3B82F6"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorLessons)"
                  />
                  <Area
                    type="monotone"
                    dataKey="mentorship"
                    stroke="#8B5CF6"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorMentorship)"
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
        <div className="bg-blue-600 rounded-3xl p-6 text-white flex flex-col justify-between">
          <div>
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
    </div>
  );
};

const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}> = ({ title, value, icon, color }) => (
  <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-800">
    <div className={`p-2.5 bg-${color}-50 dark:bg-${color}-900/20 rounded-xl text-${color}-600 w-fit mb-3`}>
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
