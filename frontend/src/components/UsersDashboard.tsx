import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Users as UsersIcon,
  CheckCircle,
  XCircle,
  Search,
  ArrowUpDown,
  BarChart3,
  Table as TableIcon,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Role } from "../api/users";
import { fetchUserBreakdown, RoleCount } from "../utils/userRoleCounts";
import { useTheme } from "../contexts/ThemeContext";
import SelectField from "./ui/SelectField";

interface UsersDashboardProps {
  roles: Role[];
  onSelectRole: (roleId: string) => void;
}

type SortOption = "total-desc" | "total-asc" | "name-asc";

// Status colors (fixed, never themed) — active/disabled is a state, not an
// identity, so it borrows from the status palette rather than categorical hues.
const SERIES_COLOR = { active: "#0ca30c", disabled: "#d03b3b" };

const CHROME = {
  light: {
    grid: "#e1e0d9",
    axis: "#c3c2b7",
    muted: "#898781",
    primary: "#0b0b0b",
    secondary: "#52514e",
    surface: "#fcfcfb",
  },
  dark: {
    grid: "#2c2c2a",
    axis: "#383835",
    muted: "#898781",
    primary: "#ffffff",
    secondary: "#c3c2b7",
    surface: "#1a1a19",
  },
} as const;

const SummaryCard = ({
  icon: Icon,
  label,
  value,
  accent,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  accent: string;
  loading: boolean;
}) => (
  <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-white/50 dark:border-slate-700/30 flex items-center gap-3">
    <div
      className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${accent}`}
    >
      <Icon className="w-5 h-5" />
    </div>
    <div>
      {loading ? (
        <div className="h-6 w-12 rounded bg-gray-200 dark:bg-slate-700 animate-pulse" />
      ) : (
        <p className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
          {value}
        </p>
      )}
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  </div>
);

const RoleRowSkeleton = ({ delay }: { delay: number }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay }}
    className="h-8 rounded-lg bg-gray-100 dark:bg-slate-700/50 animate-pulse"
  />
);

interface ChartRow {
  name: string;
  roleId: string;
  active: number;
  disabled: number;
  total: number;
}

interface ChromeColors {
  grid: string;
  axis: string;
  muted: string;
  primary: string;
  secondary: string;
  surface: string;
}

const CustomTooltip = ({
  active,
  payload,
  label,
  chrome,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number }>;
  label?: string;
  chrome: ChromeColors;
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const activeCount = payload.find((p) => p.dataKey === "active")?.value ?? 0;
  const disabledCount =
    payload.find((p) => p.dataKey === "disabled")?.value ?? 0;

  return (
    <div
      className="rounded-lg border px-3 py-2 shadow-lg text-xs min-w-[140px]"
      style={{ background: chrome.surface, borderColor: chrome.grid }}
    >
      <p className="font-semibold mb-1.5" style={{ color: chrome.primary }}>
        {label}
      </p>
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="flex items-center gap-1.5" style={{ color: chrome.secondary }}>
          <span
            className="inline-block w-2.5 h-[3px] rounded-full"
            style={{ background: SERIES_COLOR.active }}
          />
          Active
        </span>
        <span className="font-semibold" style={{ color: chrome.primary }}>
          {activeCount}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5" style={{ color: chrome.secondary }}>
          <span
            className="inline-block w-2.5 h-[3px] rounded-full"
            style={{ background: SERIES_COLOR.disabled }}
          />
          Disabled
        </span>
        <span className="font-semibold" style={{ color: chrome.primary }}>
          {disabledCount}
        </span>
      </div>
      <div
        className="mt-1.5 pt-1.5 border-t flex items-center justify-between gap-3"
        style={{ borderColor: chrome.grid }}
      >
        <span style={{ color: chrome.secondary }}>Total</span>
        <span className="font-semibold" style={{ color: chrome.primary }}>
          {activeCount + disabledCount}
        </span>
      </div>
    </div>
  );
};

const UsersDashboard: React.FC<UsersDashboardProps> = ({
  roles,
  onSelectRole,
}) => {
  const { theme } = useTheme();
  const chrome = CHROME[theme];
  const [roleCounts, setRoleCounts] = useState<RoleCount[]>([]);
  const [overall, setOverall] = useState({
    total: 0,
    active: 0,
    disabled: 0,
  });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("total-desc");
  const [view, setView] = useState<"chart" | "table">("chart");
  const loadInitRef = useRef(false);

  const load = useCallback(async () => {
    if (roles.length === 0) return;
    setLoading(true);
    try {
      const breakdown = await fetchUserBreakdown(roles);
      setRoleCounts(breakdown.roleCounts);
      setOverall({
        total: breakdown.overallTotal,
        active: breakdown.overallActive,
        disabled: breakdown.overallDisabled,
      });
    } catch (error) {
      console.error("Failed to load role breakdown:", error);
    } finally {
      setLoading(false);
    }
  }, [roles]);

  // Fetch once per mount (guarded against StrictMode's dev-only double
  // effect invocation); roles arrives async from the shell so wait for it.
  useEffect(() => {
    if (roles.length === 0 || loadInitRef.current) return;
    loadInitRef.current = true;
    load();
  }, [roles, load]);

  const chartData: ChartRow[] = useMemo(() => {
    const filtered = roleCounts.filter((rc) =>
      rc.role.name.toLowerCase().includes(query.trim().toLowerCase()),
    );
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "total-asc") return a.total - b.total;
      if (sortBy === "name-asc") return a.role.name.localeCompare(b.role.name);
      return b.total - a.total;
    });
    return sorted.map((rc) => ({
      name: rc.role.name,
      roleId: rc.role.role_id.toString(),
      active: rc.active,
      disabled: rc.disabled,
      total: rc.total,
    }));
  }, [roleCounts, query, sortBy]);

  return (
    <div>
      {/* KPI row */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6"
      >
        <SummaryCard
          icon={UsersIcon}
          label="Total users"
          value={overall.total}
          loading={loading}
          accent="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        />
        <SummaryCard
          icon={CheckCircle}
          label="Active users"
          value={overall.active}
          loading={loading}
          accent="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
        />
        <SummaryCard
          icon={XCircle}
          label="Disabled users"
          value={overall.disabled}
          loading={loading}
          accent="bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400"
        />
      </motion.div>

      {/* Filters row — one row, above the content it scopes */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter roles..."
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-slate-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="relative">
          <SelectField
            aria-label="Sort roles"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="appearance-none pl-3 pr-8 py-2 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-slate-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="total-desc">Total: high to low</option>
            <option value="total-asc">Total: low to high</option>
            <option value="name-asc">Name: A to Z</option>
          </SelectField>
          <ArrowUpDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        </div>
        <div className="flex gap-1 bg-white/60 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-xl p-1 sm:ml-auto w-fit">
          <button
            type="button"
            onClick={() => setView("chart")}
            aria-pressed={view === "chart"}
            aria-label="Chart view"
            className={`p-1.5 rounded-lg transition-colors ${
              view === "chart"
                ? "bg-blue-500 text-white"
                : "text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-slate-700"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            aria-pressed={view === "table"}
            aria-label="Table view"
            className={`p-1.5 rounded-lg transition-colors ${
              view === "table"
                ? "bg-blue-500 text-white"
                : "text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-slate-700"
            }`}
          >
            <TableIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chart / table card */}
      <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl border border-white/50 dark:border-slate-700/30 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Users by role
          </h3>
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: SERIES_COLOR.active }}
              />
              Active
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: SERIES_COLOR.disabled }}
              />
              Disabled
            </span>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <RoleRowSkeleton key={i} delay={i * 0.04} />
            ))}
          </div>
        ) : chartData.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-10">
            No roles match &quot;{query}&quot;
          </p>
        ) : view === "chart" ? (
          <ResponsiveContainer
            width="100%"
            // Plot height (bars) plus a fixed band for the x-axis tick labels —
            // a fixed height that only fits the bars squeezes the axis into a
            // clipped nested scroll.
            height={Math.max(chartData.length * 42, 80) + 30}
          >
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
              barCategoryGap={10}
              onClick={(state: any) => {
                const roleId = state?.activePayload?.[0]?.payload?.roleId;
                if (roleId) onSelectRole(roleId);
              }}
            >
              <CartesianGrid horizontal={false} stroke={chrome.grid} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fill: chrome.muted, fontSize: 11 }}
                axisLine={{ stroke: chrome.axis }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tick={{ fill: chrome.secondary, fontSize: 11 }}
                axisLine={{ stroke: chrome.axis }}
                tickLine={false}
              />
              <Tooltip
                cursor={{
                  fill:
                    theme === "dark"
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(11,11,11,0.03)",
                }}
                content={<CustomTooltip chrome={chrome} />}
              />
              <Bar
                dataKey="active"
                stackId="status"
                fill={SERIES_COLOR.active}
                barSize={20}
                style={{ cursor: "pointer" }}
              />
              <Bar
                dataKey="disabled"
                stackId="status"
                fill={SERIES_COLOR.disabled}
                barSize={20}
                radius={[0, 4, 4, 0]}
                style={{ cursor: "pointer" }}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-200 dark:border-slate-700">
                  <th className="py-2 pr-3 font-medium">Role</th>
                  <th className="py-2 px-3 font-medium text-right">Active</th>
                  <th className="py-2 px-3 font-medium text-right">
                    Disabled
                  </th>
                  <th className="py-2 pl-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row) => (
                  <tr
                    key={row.roleId}
                    onClick={() => onSelectRole(row.roleId)}
                    className="border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/40 cursor-pointer"
                  >
                    <td className="py-2 pr-3 text-gray-800 dark:text-white font-medium">
                      {row.name}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-600 dark:text-gray-300">
                      {row.active}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-600 dark:text-gray-300">
                      {row.disabled}
                    </td>
                    <td className="py-2 pl-3 text-right font-semibold text-gray-900 dark:text-white">
                      {row.total}
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

export default UsersDashboard;
