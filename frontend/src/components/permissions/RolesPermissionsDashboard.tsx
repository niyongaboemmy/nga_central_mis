import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Users as UsersIcon,
  Key,
  CheckCircle,
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
import { Role } from "../../api/users";
import { useTheme } from "../../contexts/ThemeContext";
import { StatCard, SkeletonRow } from "./shared";
import SelectField from "../ui/SelectField";

type SortOption = "count-desc" | "count-asc" | "name-asc";

// Sequential magnitude encoding: one hue, per the dataviz method — this is a
// straight "compare magnitude" job, not identity, so it stays single-hue.
const SEQUENTIAL_BLUE = { light: "#2a78d6", dark: "#3987e5" };

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
  payload?: Array<{ value: number }>;
  label?: string;
  chrome: ChromeColors;
}) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 shadow-lg text-xs min-w-[120px]"
      style={{ background: chrome.surface, borderColor: chrome.grid }}
    >
      <p className="font-semibold mb-1" style={{ color: chrome.primary }}>
        {label}
      </p>
      <div className="flex items-center justify-between gap-3">
        <span style={{ color: chrome.secondary }}>Permissions</span>
        <span className="font-semibold" style={{ color: chrome.primary }}>
          {payload[0].value}
        </span>
      </div>
    </div>
  );
};

interface RolesPermissionsDashboardProps {
  roles: Role[];
  totalPermissions: number;
  activePermissions: number;
  permissionCounts: Record<number, number>;
  loading: boolean;
  onSelectRole: (role: Role) => void;
}

const RolesPermissionsDashboard: React.FC<RolesPermissionsDashboardProps> = ({
  roles,
  totalPermissions,
  activePermissions,
  permissionCounts,
  loading,
  onSelectRole,
}) => {
  const { theme } = useTheme();
  const chrome = CHROME[theme];
  const barColor = SEQUENTIAL_BLUE[theme];
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("count-desc");
  const [view, setView] = useState<"chart" | "table">("chart");

  const activeRoles = roles.filter((r) => r.status === "ACTIVE").length;

  const rows = useMemo(() => {
    const filtered = roles.filter((r) =>
      r.name.toLowerCase().includes(query.trim().toLowerCase()),
    );
    const withCounts = filtered.map((role) => ({
      role,
      name: role.name,
      count: permissionCounts[role.role_id] ?? 0,
    }));
    return [...withCounts].sort((a, b) => {
      if (sortBy === "count-asc") return a.count - b.count;
      if (sortBy === "name-asc") return a.name.localeCompare(b.name);
      return b.count - a.count;
    });
  }, [roles, permissionCounts, query, sortBy]);

  return (
    <div>
      {/* KPI row */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6"
      >
        <StatCard
          icon={UsersIcon}
          label="Total roles"
          value={roles.length}
          loading={loading}
          accent="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        />
        <StatCard
          icon={CheckCircle}
          label="Active roles"
          value={activeRoles}
          loading={loading}
          accent="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
        />
        <StatCard
          icon={Key}
          label="Total permissions"
          value={totalPermissions}
          loading={loading}
          accent="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
        />
        <StatCard
          icon={CheckCircle}
          label="Active permissions"
          value={activePermissions}
          loading={loading}
          accent="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
        />
      </motion.div>

      {/* Filters row */}
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
            <option value="count-desc">Permissions: high to low</option>
            <option value="count-asc">Permissions: low to high</option>
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
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
          Permissions per role
        </h3>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <SkeletonRow key={i} delay={i * 0.04} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-10">
            No roles match &quot;{query}&quot;
          </p>
        ) : view === "chart" ? (
          <ResponsiveContainer
            width="100%"
            height={Math.max(rows.length * 38, 80) + 30}
          >
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
              barCategoryGap={10}
              onClick={(state: any) => {
                const role = state?.activePayload?.[0]?.payload?.role;
                if (role) onSelectRole(role);
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
                dataKey="count"
                fill={barColor}
                barSize={18}
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
                  <th className="py-2 pl-3 font-medium text-right">
                    Permissions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.role.role_id}
                    onClick={() => onSelectRole(row.role)}
                    className="border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/40 cursor-pointer"
                  >
                    <td className="py-2 pr-3 text-gray-800 dark:text-white font-medium">
                      {row.name}
                    </td>
                    <td className="py-2 pl-3 text-right font-semibold text-gray-900 dark:text-white">
                      {row.count}
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

export default RolesPermissionsDashboard;
