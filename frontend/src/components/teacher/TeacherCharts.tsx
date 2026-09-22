import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CheckCircle2, CircleSlash } from "lucide-react";
import { STATUS, useChartTheme, type StatusKey } from "./chartTheme";
import {
  truncateTick,
  type CoverageRow,
  type LoadPoint,
  type SubjectLoadPoint,
} from "./analytics";

// ─── Charts ─────────────────────────────────────────────────────────────────
// Three questions the numbers alone don't answer:
//   1. Which class has fallen behind the term?  → coverage bullets
//   2. Which day is the heavy one?              → load columns (emphasis)
//   3. Where does the week actually go?         → periods per class
//
// House rules applied throughout: solid hairline gridlines (never dashed),
// thin marks with rounded data-ends, no number on every point where an axis
// will do, a hover tooltip on every mark, and a table view behind each chart
// so no value is reachable only by hovering.
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_ICON: Record<StatusKey, React.ReactNode> = {
  critical: <CircleSlash className="w-3 h-3" />,
  warning: <AlertTriangle className="w-3 h-3" />,
  good: <CheckCircle2 className="w-3 h-3" />,
};

/** Status never carries meaning by colour alone — icon + word, every time. */
const StatusPill: React.FC<{ status: StatusKey; label: string }> = ({
  status,
  label,
}) => (
  <span
    className="inline-flex items-center gap-1 text-[11px] font-medium"
    style={{ color: STATUS[status] }}
  >
    {STATUS_ICON[status]}
    <span className="text-text-secondary-light dark:text-text-secondary-dark/80">
      {label}
    </span>
  </span>
);

const TableToggle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <details className="mt-3 group">
    <summary className="cursor-pointer text-[11px] text-blue-600 dark:text-blue-400 hover:underline">
      Table view
    </summary>
    <div className="mt-2 overflow-x-auto">{children}</div>
  </details>
);

const th = "py-1 pr-4 text-left font-medium";
const td = "py-1 pr-4 tabular-nums";

// ─── 1. Scheme coverage vs the calendar ─────────────────────────────────────

export const CoverageChart: React.FC<{
  rows: CoverageRow[];
  week: number | null;
}> = ({ rows, week }) => {
  const t = useChartTheme();

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
        No schemes to track for this term.
      </p>
    );
  }

  // Bullet bars: one row per class, the bar is weeks planned, the reference
  // line is the week the term is actually in. A bar short of the line is the
  // whole message.
  const max = Math.max(week ?? 0, ...rows.map((r) => r.planned), 1);

  return (
    <div>
      <div style={{ height: Math.max(120, rows.length * 44 + 28) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={rows}
            margin={{ top: 4, right: 56, left: 4, bottom: 4 }}
            barCategoryGap="28%"
          >
            <CartesianGrid horizontal={false} stroke={t.grid} />
            <XAxis
              type="number"
              domain={[0, max]}
              allowDecimals={false}
              tick={{ fontSize: 11, fill: t.ink }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="axisLabel"
              width={150}
              tickFormatter={(v: string) => truncateTick(v)}
              tick={{ fontSize: 11, fill: t.ink }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: t.grid, opacity: 0.35 }}
              contentStyle={{
                borderRadius: 12,
                fontSize: 12,
                background: t.tooltipBg,
                border: `1px solid ${t.tooltipBorder}`,
              }}
              formatter={(value: any, _n: any, entry: any) => [
                `${value} of ${entry?.payload?.target || "—"} weeks · ${entry?.payload?.statusLabel}`,
                entry?.payload?.classGroup || "Weeks planned",
              ]}
              labelFormatter={(label: any) => String(label)}
            />
            {week !== null && (
              <ReferenceLine
                x={week}
                stroke={t.ink}
                strokeWidth={2}
                label={{
                  value: `week ${week}`,
                  position: "top",
                  fontSize: 10,
                  fill: t.ink,
                }}
              />
            )}
            <Bar dataKey="planned" radius={[0, 4, 4, 0]} barSize={14}>
              {rows.map((row) => (
                <Cell key={row.key} fill={STATUS[row.status]} />
              ))}
              <LabelList
                dataKey="planned"
                position="right"
                formatter={(v: any) => `${v} wk`}
                style={{ fontSize: 10, fill: t.ink }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend: identity is never colour-alone. */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <StatusPill status="good" label="On track" />
        <StatusPill status="warning" label="Behind the calendar" />
        <StatusPill status="critical" label="Not submitted / sent back" />
      </div>

      <TableToggle>
        <table className="w-full text-xs">
          <thead className="text-text-secondary-light dark:text-text-secondary-dark/70">
            <tr>
              <th className={th}>Subject</th>
              <th className={th}>Class</th>
              <th className={th}>Planned</th>
              <th className={th}>Target</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody className="text-text-primary-light dark:text-text-primary-dark">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="py-1 pr-4">{row.subject}</td>
                <td className="py-1 pr-4">{row.classGroup}</td>
                <td className={td}>{row.planned}</td>
                <td className={td}>{row.target || "—"}</td>
                <td className="py-1 pr-4">{row.statusLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableToggle>
    </div>
  );
};

// ─── 2. Weekly teaching load ────────────────────────────────────────────────

export const WeeklyLoadChart: React.FC<{ points: LoadPoint[] }> = ({
  points,
}) => {
  const t = useChartTheme();
  if (points.length === 0) return null;

  // Emphasis, not categorical: one hue, today stepped forward. A legend would
  // be noise — the title names the single series.
  return (
    <div>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={points}
            margin={{ top: 14, right: 4, left: -24, bottom: 0 }}
            barCategoryGap="26%"
          >
            <CartesianGrid vertical={false} stroke={t.grid} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: t.ink }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: t.ink }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: t.grid, opacity: 0.35 }}
              contentStyle={{
                borderRadius: 12,
                fontSize: 12,
                background: t.tooltipBg,
                border: `1px solid ${t.tooltipBorder}`,
              }}
              formatter={(v: any) => [
                `${v} ${v === 1 ? "period" : "periods"}`,
                "Timetabled",
              ]}
            />
            <Bar dataKey="periods" radius={[4, 4, 0, 0]} maxBarSize={44}>
              {points.map((p) => (
                <Cell key={p.day} fill={p.isToday ? t.accent : t.muted} />
              ))}
              <LabelList
                dataKey="periods"
                position="top"
                formatter={(v: any) => (v ? v : "")}
                style={{ fontSize: 10, fill: t.ink }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11px] text-text-secondary-light dark:text-text-secondary-dark/60">
        <span
          className="inline-block w-2 h-2 rounded-sm align-middle mr-1"
          style={{ backgroundColor: t.accent }}
        />
        Today
      </p>
    </div>
  );
};

// ─── 3. Where the week goes ─────────────────────────────────────────────────

export const SubjectLoadChart: React.FC<{ points: SubjectLoadPoint[] }> = ({
  points,
}) => {
  const t = useChartTheme();

  if (points.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
        No periods timetabled yet.
      </p>
    );
  }

  // One measure, one hue — a bar per class, ranked. Colouring these by subject
  // would double-encode length as hue and burn the only free channel.
  return (
    <div>
      <div style={{ height: Math.max(110, points.length * 34 + 16) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={points}
            margin={{ top: 0, right: 40, left: 4, bottom: 0 }}
            barCategoryGap="30%"
          >
            <CartesianGrid horizontal={false} stroke={t.grid} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: t.ink }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={150}
              tickFormatter={(v: string) => truncateTick(v)}
              tick={{ fontSize: 11, fill: t.ink }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: t.grid, opacity: 0.35 }}
              contentStyle={{
                borderRadius: 12,
                fontSize: 12,
                background: t.tooltipBg,
                border: `1px solid ${t.tooltipBorder}`,
              }}
              formatter={(v: any, _n: any, entry: any) => [
                `${v} ${v === 1 ? "period" : "periods"} a week`,
                entry?.payload?.classGroup || "Timetabled",
              ]}
            />
            <Bar
              dataKey="periods"
              fill={t.accent}
              radius={[0, 4, 4, 0]}
              barSize={12}
            >
              <LabelList
                dataKey="periods"
                position="right"
                style={{ fontSize: 10, fill: t.ink }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <TableToggle>
        <table className="w-full text-xs">
          <thead className="text-text-secondary-light dark:text-text-secondary-dark/70">
            <tr>
              <th className={th}>Subject</th>
              <th className={th}>Class</th>
              <th className={th}>Periods / week</th>
            </tr>
          </thead>
          <tbody className="text-text-primary-light dark:text-text-primary-dark">
            {points.map((p) => (
              <tr key={p.label}>
                <td className="py-1 pr-4">{p.subject}</td>
                <td className="py-1 pr-4">{p.classGroup || "—"}</td>
                <td className={td}>{p.periods}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableToggle>
    </div>
  );
};
