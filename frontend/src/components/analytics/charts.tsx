import React, { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Download, Table2 } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import type { AppKey } from "../../api/monitor";
import { Empty, Panel } from "../access/shared";
import { APP_META, AppDot, useAppColors } from "./common";

/**
 * Chart building blocks for the console, following the dataviz method:
 *  - categorical series take palette slots in a fixed order (apps: slots 1-4; metric lines 1-3);
 *  - magnitude uses one hue (slot 1), light → dark;
 *  - every chart has a legend for ≥2 series, a hover layer, and a table view;
 *  - one y-axis only; text in text tokens, never series colours.
 */
export const SERIES = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500"],
};
const useInk = () => {
  const { theme } = useTheme();
  const dark = theme === "dark";
  return {
    dark,
    axis: dark ? "#cbd5e1" : "#475569",
    grid: dark ? "#334155" : "#e2e8f0",
    surface: dark ? "#1e293b" : "#ffffff",
    series: dark ? SERIES.dark : SERIES.light,
    seq: dark ? "57,135,229" : "42,120,214",
  };
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
export const fmtInt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString());
export const fmtPct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n}%`);
export const fmtDur = (s: number | null | undefined) => {
  if (s === null || s === undefined) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};
export const fmtMsDur = (ms: number | null | undefined) => (ms === null || ms === undefined ? "—" : fmtDur(Math.round(ms / 1000)));
export const fmtDate = (v: string | null | undefined, withTime = false) => {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return withTime
    ? d.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "2-digit", month: "short", year: v.length === 10 ? undefined : "numeric" });
};
export const bucketLabel = (b: string, gran: string) => {
  const d = new Date(`${b}T00:00:00`);
  if (gran === "month") return d.toLocaleDateString([], { month: "short", year: "numeric" });
  if (gran === "week") return `wk ${d.toLocaleDateString([], { day: "2-digit", month: "short" })}`;
  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
};

export const Delta: React.FC<{ value: number | null | undefined; invert?: boolean }> = ({ value, invert }) => {
  if (value === null || value === undefined) return null;
  const good = invert ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUp : value < 0 ? ArrowDown : ArrowUpDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${value === 0 ? "text-slate-600 dark:text-slate-300" : good ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
      <Icon className="w-3 h-3" aria-hidden />
      {value > 0 ? "+" : ""}
      {value}%<span className="sr-only"> vs comparison period</span>
    </span>
  );
};

// ---------------------------------------------------------------------------
// Chart panel with a table view
// ---------------------------------------------------------------------------
export const ChartPanel: React.FC<{
  title: React.ReactNode;
  table: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, table, children, actions, className = "" }) => {
  const [asTable, setAsTable] = useState(false);
  return (
    <Panel
      className={`min-w-0 ${className}`}
      title={title}
      actions={
        <div className="flex items-center gap-3">
          {actions}
          <button className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300 hover:underline" onClick={() => setAsTable((v) => !v)}>
            {asTable ? <BarChart3 className="w-3.5 h-3.5" aria-hidden /> : <Table2 className="w-3.5 h-3.5" aria-hidden />}
            {asTable ? "Chart" : "Table"}
          </button>
        </div>
      }
    >
      {asTable ? <div className="max-h-72 overflow-auto">{table}</div> : children}
    </Panel>
  );
};

const TipBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-lg border border-border-light dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs shadow-lg text-text-primary-light dark:text-text-primary-dark">{children}</div>
);

export const Legend: React.FC<{ items: { label: string; color: string; dashed?: boolean }[] }> = ({ items }) => (
  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-2 text-slate-700 dark:text-slate-200" aria-label="Legend">
    {items.map((i) => (
      <li key={i.label} className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-block w-4 h-0.5 rounded" style={{ background: i.color, borderTop: i.dashed ? `2px dashed ${i.color}` : undefined }} />
        {i.label}
      </li>
    ))}
  </ul>
);

// ---------------------------------------------------------------------------
// Lines (≤3 metric series, crosshair tooltip)
// ---------------------------------------------------------------------------
export const TrendLines: React.FC<{
  data: Record<string, any>[];
  x: string;
  series: { key: string; label: string; unit?: string }[];
  xLabel?: (v: string) => string;
  height?: number;
  ariaLabel: string;
}> = ({ data, x, series, xLabel = (v) => v, height = 220, ariaLabel }) => {
  const ink = useInk();
  if (!data.length) return <Empty>No data in this range.</Empty>;
  return (
    <div>
      {series.length > 1 && <Legend items={series.map((s, i) => ({ label: s.label, color: ink.series[i] }))} />}
      <div style={{ height }} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={ink.grid} strokeDasharray="3 3" />
            <XAxis dataKey={x} tickFormatter={xLabel} tick={{ fontSize: 11, fill: ink.axis }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} width={36} tick={{ fontSize: 11, fill: ink.axis }} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ stroke: ink.axis, strokeDasharray: "3 3" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TipBox>
                    <div className="font-medium mb-1">{xLabel(String(label))}</div>
                    {series.map((s, i) => (
                      <div key={s.key} className="flex items-center justify-between gap-4">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block w-2.5 h-0.5" style={{ background: ink.series[i] }} />
                          {s.label}
                        </span>
                        <span className="tabular-nums">
                          {fmtInt((payload[0].payload as any)[s.key])}
                          {s.unit ?? ""}
                        </span>
                      </div>
                    ))}
                  </TipBox>
                ) : null
              }
            />
            {series.map((s, i) => (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={ink.series[i]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: ink.surface, strokeWidth: 2 }} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Stacked bars by app (categorical slots 1-4, fixed per app)
// ---------------------------------------------------------------------------
export const AppStackedBars: React.FC<{
  data: { bucket: string; apps: Record<string, number> }[];
  gran: string;
  height?: number;
  ariaLabel: string;
  valueLabel?: string;
}> = ({ data, gran, height = 220, ariaLabel, valueLabel = "People" }) => {
  const ink = useInk();
  const color = useAppColors();
  const apps = (["mis", "tm", "tendo", "tupo"] as AppKey[]).filter((a) => data.some((d) => (d.apps[a] ?? 0) > 0));
  if (!data.length || !apps.length) return <Empty>No activity in this range.</Empty>;
  const rows = data.map((d) => ({ bucket: d.bucket, ...Object.fromEntries(apps.map((a) => [a, d.apps[a] ?? 0])) }));
  return (
    <div>
      <ul className="flex flex-wrap gap-3 text-xs mb-2" aria-label="Legend">
        {apps.map((a) => (
          <li key={a}><AppDot app={a} /></li>
        ))}
      </ul>
      <div style={{ height }} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke={ink.grid} strokeDasharray="3 3" />
            <XAxis dataKey="bucket" tickFormatter={(v) => bucketLabel(v, gran)} tick={{ fontSize: 11, fill: ink.axis }} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis allowDecimals={false} width={36} tick={{ fontSize: 11, fill: ink.axis }} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: ink.dark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.05)" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TipBox>
                    <div className="font-medium mb-1">{bucketLabel(String(label), gran)}</div>
                    {apps.map((a) => (
                      <div key={a} className="flex justify-between gap-4">
                        <AppDot app={a} />
                        <span className="tabular-nums">{fmtInt((payload[0].payload as any)[a])}</span>
                      </div>
                    ))}
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{valueLabel} per app</div>
                  </TipBox>
                ) : null
              }
            />
            {apps.map((a, i) => (
              <Bar key={a} dataKey={a} stackId="s" fill={color(a)} stroke={ink.surface} strokeWidth={1} radius={i === apps.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Simple bars: one series (magnitude) → one hue
// ---------------------------------------------------------------------------
export const SimpleBars: React.FC<{ data: { x: string; y: number }[]; xLabel?: (v: string) => string; height?: number; ariaLabel: string; unit?: string }> = ({
  data,
  xLabel = (v) => v,
  height = 200,
  ariaLabel,
  unit = "",
}) => {
  const ink = useInk();
  if (!data.length) return <Empty>No data in this range.</Empty>;
  return (
    <div style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke={ink.grid} strokeDasharray="3 3" />
          <XAxis dataKey="x" tickFormatter={xLabel} tick={{ fontSize: 11, fill: ink.axis }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis allowDecimals={false} width={36} tick={{ fontSize: 11, fill: ink.axis }} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: ink.dark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.05)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TipBox>
                  <span className="font-medium">{xLabel(String(label))}</span>: <span className="tabular-nums">{fmtInt(payload[0].value as number)}{unit}</span>
                </TipBox>
              ) : null
            }
          />
          <Bar dataKey="y" fill={ink.series[0]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/** Ranked horizontal bars rendered in HTML (labels never collide; fits narrow screens). */
export const BarList: React.FC<{
  rows: { key: string; label: React.ReactNode; value: number; display?: React.ReactNode; hint?: React.ReactNode; href?: string }[];
  ariaLabel: string;
  max?: number;
}> = ({ rows, ariaLabel, max }) => {
  const ink = useInk();
  if (!rows.length) return <Empty>Nothing yet in this range.</Empty>;
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-1.5" aria-label={ariaLabel}>
      {rows.map((r) => (
        <li key={r.key} className="text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-text-primary-light dark:text-text-primary-dark">{r.label}</span>
            <span className="shrink-0 tabular-nums text-slate-700 dark:text-slate-200">{r.display ?? fmtInt(r.value)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 mt-1 overflow-hidden" aria-hidden>
            <div className="h-full rounded-r-[4px]" style={{ width: `${Math.max(1.5, (r.value / top) * 100)}%`, background: ink.series[0] }} />
          </div>
          {r.hint && <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">{r.hint}</div>}
        </li>
      ))}
    </ul>
  );
};

// ---------------------------------------------------------------------------
// Heatmap (hour × weekday): sequential, one hue
// ---------------------------------------------------------------------------
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const Heatmap: React.FC<{ grid: { users: number; visitors: number; logins: number; failed: number }[][]; metric: "users" | "logins" | "visitors" }> = ({ grid, metric }) => {
  const ink = useInk();
  const max = Math.max(1, ...grid.flat().map((c) => c[metric]));
  return (
    <div className="overflow-x-auto">
      <table className="text-[10px] border-separate" style={{ borderSpacing: 2 }} aria-label={`${metric} by hour and weekday`}>
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="font-normal text-slate-600 dark:text-slate-300 w-6">{h % 3 === 0 ? `${String(h).padStart(2, "0")}` : ""}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, d) => (
            <tr key={d}>
              <th className="font-normal text-slate-600 dark:text-slate-300 pr-1 text-right">{DAYS[d]}</th>
              {row.map((c, h) => {
                const v = c[metric];
                const a = v ? 0.12 + 0.88 * (v / max) : 0;
                return (
                  <td
                    key={h}
                    title={`${DAYS[d]} ${String(h).padStart(2, "0")}:00 — ${v} ${metric}`}
                    className="w-6 h-5 rounded"
                    style={{ background: v ? `rgba(${ink.seq},${a.toFixed(2)})` : ink.dark ? "#1e293b" : "#f1f5f9" }}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-600 dark:text-slate-300">
        Less
        {[0.12, 0.34, 0.56, 0.78, 1].map((a) => (
          <span key={a} className="inline-block w-4 h-3 rounded" style={{ background: `rgba(${ink.seq},${a})` }} />
        ))}
        More · Kigali time
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sortable table with optional CSV export
// ---------------------------------------------------------------------------
export interface Column<T> {
  key: string;
  label: React.ReactNode;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => number | string | null;
  align?: "left" | "right";
  className?: string;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  empty = "Nothing in this range.",
  initialSort,
  onExport,
  maxHeight,
  dense,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string;
  empty?: React.ReactNode;
  initialSort?: { key: string; dir: "asc" | "desc" };
  onExport?: () => void;
  maxHeight?: number;
  dense?: boolean;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const v = (r: T) => col.sortValue!(r);
    return [...rows].sort((a, b) => {
      const x = v(a), y = v(b);
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (x > y ? 1 : -1) * (sort.dir === "asc" ? 1 : -1);
    });
  }, [rows, sort, columns]);
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div>
      {onExport && (
        <div className="flex justify-end mb-1">
          <button className="inline-flex items-center gap-1 text-xs text-slate-700 dark:text-slate-200 hover:underline" onClick={onExport}>
            <Download className="w-3.5 h-3.5" aria-hidden /> Export CSV
          </button>
        </div>
      )}
      <div className="relative overflow-auto -mx-4 px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600" style={maxHeight ? { maxHeight } : undefined} tabIndex={0} role="region" aria-label="Table, scrollable">
        <table className={`w-full ${dense ? "text-xs" : "text-sm"}`}>
          <thead className="sticky top-0 bg-white/95 dark:bg-slate-900/95">
            <tr className="text-left text-xs text-slate-600 dark:text-slate-300 border-b border-border-light dark:border-slate-700">
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} className={`py-2 pr-3 font-medium whitespace-nowrap ${c.align === "right" ? "text-right" : ""}`} aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}>
                    {c.sortValue ? (
                      <button
                        className="inline-flex items-center gap-1 hover:underline"
                        onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === "desc" ? "asc" : "desc" }))}
                      >
                        {c.label}
                        {active ? sort!.dir === "asc" ? <ArrowUp className="w-3 h-3" aria-hidden /> : <ArrowDown className="w-3 h-3" aria-hidden /> : <ArrowUpDown className="w-3 h-3 opacity-50" aria-hidden />}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={rowKey(r)} className="border-b border-border-light/60 dark:border-slate-800 align-top">
                {columns.map((c) => (
                  <td key={c.key} className={`${dense ? "py-1.5" : "py-2"} pr-3 ${c.align === "right" ? "text-right tabular-nums" : ""} ${c.className ?? ""}`}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const Pager: React.FC<{ page: number; total: number; limit: number; onPage: (p: number) => void }> = ({ page, total, limit, onPage }) => {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">{fmtInt(total)} total</p>;
  return (
    <div className="flex items-center justify-between mt-2 text-xs text-slate-700 dark:text-slate-200">
      <span>
        {fmtInt((page - 1) * limit + 1)}–{fmtInt(Math.min(total, page * limit))} of {fmtInt(total)}
      </span>
      <div className="flex gap-1">
        <button className="px-2 py-1 rounded border border-border-light dark:border-slate-700 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <button className="px-2 py-1 rounded border border-border-light dark:border-slate-700 disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
};

export const appLabel = (a: AppKey | string) => APP_META[a as AppKey]?.label ?? a;
