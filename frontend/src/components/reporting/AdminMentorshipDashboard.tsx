import React, { useEffect, useState, useCallback } from "react";
import {
  Users,
  UserCheck,
  ClipboardList,
  AlertTriangle,
  Clock,
  MessageCircle,
  RefreshCw,
  Trophy,
} from "lucide-react";
import { mentorshipApi, AdminMentorshipDashboardData } from "../../api/mentorship";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { useToast } from "../../contexts/ToastContext";
import SelectField from "../ui/SelectField";

type StatColor = "blue" | "indigo" | "orange" | "red" | "amber" | "green";
const STAT_STYLES: Record<StatColor, { chip: string; text: string; hover: string }> = {
  blue: { chip: "bg-gradient-to-br from-blue-500/15 to-blue-600/5", text: "text-blue-600 dark:text-blue-400", hover: "hover:shadow-blue-500/10" },
  indigo: { chip: "bg-gradient-to-br from-indigo-500/15 to-indigo-600/5", text: "text-indigo-600 dark:text-indigo-400", hover: "hover:shadow-indigo-500/10" },
  orange: { chip: "bg-gradient-to-br from-orange-500/15 to-orange-600/5", text: "text-orange-600 dark:text-orange-400", hover: "hover:shadow-orange-500/10" },
  red: { chip: "bg-gradient-to-br from-red-500/15 to-red-600/5", text: "text-red-600 dark:text-red-400", hover: "hover:shadow-red-500/10" },
  amber: { chip: "bg-gradient-to-br from-amber-500/15 to-amber-600/5", text: "text-amber-600 dark:text-amber-400", hover: "hover:shadow-amber-500/10" },
  green: { chip: "bg-gradient-to-br from-green-500/15 to-green-600/5", text: "text-green-600 dark:text-green-400", hover: "hover:shadow-green-500/10" },
};

const StatCard: React.FC<{ title: string; value: number; icon: React.ReactNode; color: StatColor }> = ({
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

const WELLBEING_COLOR: Record<string, string> = {
  STRUGGLING: "bg-red-500",
  CONCERNED: "bg-orange-500",
  NEUTRAL: "bg-gray-400",
  GOOD: "bg-blue-500",
  EXCELLENT: "bg-green-500",
};

const AdminMentorshipDashboard: React.FC = () => {
  const { years, selectedYearId } = useAcademicPeriod();
  const { showToast } = useToast();

  const [yearFilter, setYearFilter] = useState<number | "">(selectedYearId ?? "");
  const [data, setData] = useState<AdminMentorshipDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await mentorshipApi.getAdminMentorshipDashboard({
        academic_year_id: yearFilter === "" ? undefined : Number(yearFilter),
      });
      const result = (res as any).data?.data ?? (res as any).data;
      setData(result ?? null);
    } catch {
      showToast("Failed to load the mentorship dashboard", "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = data?.totals;
  const wellbeing = data?.wellbeing_distribution.filter((w) => w.status) ?? [];
  const totalWellbeing = wellbeing.reduce((sum, w) => sum + w.count, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading mentorship dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">Mentorship Dashboard</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">School-wide mentorship activity and approvals.</p>
        </div>
        <SelectField
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value ? Number(e.target.value) : "")}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        >
          <option value="">All Years</option>
          {years.map((y) => (
            <option key={y.academic_year_id} value={y.academic_year_id}>{y.name}</option>
          ))}
        </SelectField>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Mentees" value={totals?.total_mentees ?? 0} icon={<Users className="w-4 h-4" />} color="blue" />
        <StatCard title="Mentors" value={totals?.total_mentors ?? 0} icon={<UserCheck className="w-4 h-4" />} color="indigo" />
        <StatCard title="Sessions" value={totals?.total_sessions ?? 0} icon={<ClipboardList className="w-4 h-4" />} color="green" />
        <StatCard title="Overdue Mentees" value={totals?.overdue_mentees ?? 0} icon={<Clock className="w-4 h-4" />} color="orange" />
        <StatCard title="Flagged Sessions" value={totals?.flagged_sessions ?? 0} icon={<AlertTriangle className="w-4 h-4" />} color="red" />
        <StatCard title="Open Follow-ups" value={totals?.follow_ups_open ?? 0} icon={<AlertTriangle className="w-4 h-4" />} color="amber" />
        <StatCard title="Mentee Reports" value={totals?.total_checkins ?? 0} icon={<MessageCircle className="w-4 h-4" />} color="indigo" />
        <StatCard title="Pending Approval" value={totals?.pending_checkins ?? 0} icon={<Clock className="w-4 h-4" />} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Wellbeing distribution */}
        <div className="bg-white dark:bg-gray-800/30 rounded-3xl p-5 border border-gray-100 dark:border-gray-700/20">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Wellbeing Distribution</p>
          {totalWellbeing === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No wellbeing data logged yet.</p>
          ) : (
            <div className="space-y-2">
              {wellbeing.map((w) => (
                <div key={w.status} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-24 flex-shrink-0">{w.status}</span>
                  <div className="flex-1 h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${WELLBEING_COLOR[w.status ?? ""] ?? "bg-gray-400"}`}
                      style={{ width: `${(w.count / totalWellbeing) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-6 text-right">{w.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top mentors */}
        <div className="bg-white dark:bg-gray-800/30 rounded-3xl p-5 border border-gray-100 dark:border-gray-700/20">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-amber-500" />
            Top Mentors by Sessions
          </p>
          {!data?.top_mentors.length ? (
            <p className="text-sm text-gray-400 py-6 text-center">No sessions logged yet.</p>
          ) : (
            <div className="space-y-2">
              {data.top_mentors.map((m, i) => (
                <div key={m.mentor_id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <span className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-500">
                      {i + 1}
                    </span>
                    {m.mentor_name ?? `#${m.mentor_id}`}
                  </span>
                  <span className="text-xs font-bold text-gray-500">{m.session_count} sessions</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminMentorshipDashboard;
