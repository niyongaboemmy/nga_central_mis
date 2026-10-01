import React, { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, Brush, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, Download, Table2 } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import type { AppKey } from "../../api/monitor";
import { Empty, Panel } from "../access/shared";
import { APP_META, AppDot, useAppColors } from "./common";
import { RefreshBar, SkeletonChart, SkeletonTable } from "./Skeleton";

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
  /** Refreshing data already on screen: a thin bar runs along the top. */
  loading?: boolean;
  /** First load, nothing to show yet: a chart-shaped skeleton. */
  pending?: boolean;
  skeletonHeight?: number;
}> = ({ title, table, children, actions, className = "", loading = false, pending = false, skeletonHeight = 220 }) => {
  const [asTable, setAsTable] = useState(false);
  return (
    <Panel
      className={`min-w-0 relative an-rise ${className}`}
      title={title}
      actions={
        <div className="flex items-center gap-2">
          {actions}
          <div role="radiogroup" aria-label="Show as" className="inline-flex rounded-lg border border-border-light dark:border-slate-700 p-0.5">
            {[
              { v: false, label: "Chart", Icon: BarChart3 },
              { v: true, label: "Table", Icon: Table2 },
            ].map(({ v, label, Icon }) => (
              <button
                key={label}
                role="radio"
                aria-checked={asTable === v}
                title={`Show as ${label.toLowerCase()}`}
                onClick={() => setAsTable(v)}
                className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
                  asTable === v ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 dark:text-slate-300 hover:bg-surface-light dark:hover:bg-slate-800"
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      }
    >
      <RefreshBar active={loading} className="absolute left-4 right-4 top-0" />
      {pending ? (
        <SkeletonChart height={skeletonHeight} />
      ) : (
        <div className={`transition-opacity duration-200 ${loading ? "opacity-70" : ""}`}>{asTable ? <div className="max-h-72 overflow-auto">{table}</div> : children}</div>
      )}
    </Panel>
  );
};

const TipBox: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-xl border border-border-light dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-3 py-2 text-xs shadow-xl text-text-primary-light dark:text-text-primary-dark min-w-[140px]">{children}</div>
);

export interface LegendItem {
  key?: string;
  label: React.ReactNode;
  color: string;
  dashed?: boolean;
  value?: React.ReactNode;
}

/**
 * Legend. Static by default; with `onToggle` each entry is a button that shows or
 * hides its series (pressed = shown), and hovering one brings its series forward.
 */
export const Legend: React.FC<{
  items: LegendItem[];
  hidden?: Set<string>;
  onToggle?: (key: string) => void;
  onHover?: (key: string | null) => void;
  className?: string;
}> = ({ items, hidden, onToggle, onHover, className = "mb-2" }) => (
  <ul className={`flex flex-wrap gap-x-1 gap-y-1 text-xs text-slate-700 dark:text-slate-200 ${className}`} aria-label="Legend">
    {items.map((i, idx) => {
      const key = i.key ?? String(idx);
      const off = hidden?.has(key) ?? false;
      const swatch = (
        <span
          aria-hidden
          className="inline-block w-3 h-3 rounded-[4px] shrink-0 transition-opacity"
          style={{ background: i.dashed ? "transparent" : i.color, border: i.dashed ? `2px dashed ${i.color}` : undefined, opacity: off ? 0.35 : 1 }}
        />
      );
      return (
        <li key={key}>
          {onToggle ? (
            <button
              type="button"
              aria-pressed={!off}
              onClick={() => onToggle(key)}
              onMouseEnter={() => onHover?.(key)}
              onMouseLeave={() => onHover?.(null)}
              onFocus={() => onHover?.(key)}
              onBlur={() => onHover?.(null)}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors ${
                off ? "border-dashed border-border-light dark:border-slate-700 text-slate-500 dark:text-slate-400 line-through" : "border-transparent hover:bg-surface-light dark:hover:bg-slate-800"
              }`}
              title={off ? "Show this series" : "Hide this series"}
            >
              {swatch}
              {i.label}
              {i.value !== undefined && <span className="tabular-nums font-medium">{i.value}</span>}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-1">
              {swatch}
              {i.label}
              {i.value !== undefined && <span className="tabular-nums font-medium">{i.value}</span>}
            </span>
          )}
        </li>
      );
    })}
  </ul>
);

/** Toggle state shared by interactive legends: never lets the last series be hidden. */
const useSeriesToggle = (keys: string[]) => {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const toggle = (k: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(k)) next.delete(k);
      else if (keys.filter((x) => !next.has(x)).length > 1) next.add(k);
      return next;
    });
  return { hidden, hover, setHover, toggle };
};

const axisProps = (ink: ReturnType<typeof useInk>) => ({ tick: { fontSize: 11, fill: ink.axis }, tickLine: false, axisLine: false });
const BRUSH_AFTER = 31;

// ---------------------------------------------------------------------------
// Trends (≤3 metric series): gradient areas, crosshair tooltip, toggleable
// legend, and a brush to zoom into long ranges.
// ---------------------------------------------------------------------------
export const TrendLines: React.FC<{
  data: Record<string, any>[];
  x: string;
  series: { key: string; label: string; unit?: string }[];
  xLabel?: (v: string) => string;
  height?: number;
  ariaLabel: string;
  /** Show the zoom brush (default: when there are more than 31 points). */
  brush?: boolean;
}> = ({ data, x, series, xLabel = (v) => v, height = 220, ariaLabel, brush }) => {
  const ink = useInk();
  const uid = useId().replace(/:/g, "");
  const { hidden, hover, setHover, toggle } = useSeriesToggle(series.map((s) => s.key));
  if (!data.length) return <Empty>No data in this range.</Empty>;
  const showBrush = brush ?? data.length > BRUSH_AFTER;
  const color = (i: number) => ink.series[i % ink.series.length];
  const last = data[data.length - 1];
  return (
    <div>
      {series.length > 1 && (
        <Legend
          items={series.map((s, i) => ({ key: s.key, label: s.label, color: color(i), value: last ? `${fmtInt(last[s.key])}${s.unit ?? ""}` : undefined }))}
          hidden={hidden}
          onToggle={toggle}
          onHover={setHover}
        />
      )}
      <div style={{ height: height + (showBrush ? 30 : 0) }} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s.key} id={`g-${uid}-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color(i)} stopOpacity={series.length > 1 ? 0.22 : 0.32} />
                  <stop offset="100%" stopColor={color(i)} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke={ink.grid} strokeDasharray="3 3" />
            <XAxis dataKey={x} tickFormatter={xLabel} {...axisProps(ink)} minTickGap={24} />
            <YAxis allowDecimals={false} width={40} {...axisProps(ink)} tickFormatter={(v) => (v >= 10000 ? `${Math.round(v / 1000)}k` : String(v))} />
            <Tooltip
              cursor={{ stroke: ink.axis, strokeDasharray: "3 3" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TipBox>
                    <div className="font-medium mb-1">{xLabel(String(label))}</div>
                    {series.map((s, i) =>
                      hidden.has(s.key) ? null : (
                        <div key={s.key} className="flex items-center justify-between gap-4">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: color(i) }} />
                            {s.label}
                          </span>
                          <span className="tabular-nums font-medium">
                            {fmtInt((payload[0].payload as any)[s.key])}
                            {s.unit ?? ""}
                          </span>
                        </div>
                      ),
                    )}
                  </TipBox>
                ) : null
              }
            />
            {series.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                hide={hidden.has(s.key)}
                stroke={color(i)}
                strokeWidth={hover === s.key ? 3 : 2}
                strokeOpacity={hover && hover !== s.key ? 0.25 : 1}
                fill={`url(#g-${uid}-${i})`}
                fillOpacity={hover && hover !== s.key ? 0.2 : 1}
                dot={false}
                activeDot={{ r: 4.5, stroke: ink.surface, strokeWidth: 2 }}
                animationDuration={600}
                animationEasing="ease-out"
              />
            ))}
            {showBrush && (
              <Brush dataKey={x} height={22} travellerWidth={8} stroke={ink.dark ? "#64748b" : "#94a3b8"} fill={ink.surface} tickFormatter={xLabel} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {showBrush && <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">Drag the handles under the chart to zoom into a period.</p>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Stacked bars by app (categorical slots 1-4, fixed per app): click an app in
// the legend to hide it, hover it to bring it forward.
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
  const { hidden, hover, setHover, toggle } = useSeriesToggle(apps);
  if (!data.length || !apps.length) return <Empty>No activity in this range.</Empty>;
  const shown = apps.filter((a) => !hidden.has(a));
  const rows = data.map((d) => ({ bucket: d.bucket, ...Object.fromEntries(apps.map((a) => [a, d.apps[a] ?? 0])) }));
  const totals = Object.fromEntries(apps.map((a) => [a, data.reduce((n, d) => n + (d.apps[a] ?? 0), 0)]));
  const showBrush = data.length > BRUSH_AFTER;
  return (
    <div>
      <Legend
        items={apps.map((a) => ({ key: a, label: APP_META[a].label, color: color(a) }))}
        hidden={hidden}
        onToggle={toggle}
        onHover={setHover}
      />
      <div style={{ height: height + (showBrush ? 30 : 0) }} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke={ink.grid} strokeDasharray="3 3" />
            <XAxis dataKey="bucket" tickFormatter={(v) => bucketLabel(v, gran)} {...axisProps(ink)} minTickGap={16} />
            <YAxis allowDecimals={false} width={40} {...axisProps(ink)} />
            <Tooltip
              cursor={{ fill: ink.dark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.05)", radius: 6 } as any}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TipBox>
                    <div className="font-medium mb-1">{bucketLabel(String(label), gran)}</div>
                    {shown.map((a) => (
                      <div key={a} className="flex justify-between gap-4">
                        <AppDot app={a} />
                        <span className="tabular-nums font-medium">{fmtInt((payload[0].payload as any)[a])}</span>
                      </div>
                    ))}
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{valueLabel} per app</div>
                  </TipBox>
                ) : null
              }
            />
            {shown.map((a, i) => (
              <Bar
                key={a}
                dataKey={a}
                name={APP_META[a].label}
                stackId="s"
                fill={color(a)}
                fillOpacity={hover && hover !== a ? 0.3 : 1}
                stroke={ink.surface}
                strokeWidth={1}
                radius={i === shown.length - 1 ? [4, 4, 0, 0] : 0}
                animationDuration={500}
              />
            ))}
            {showBrush && <Brush dataKey="bucket" height={22} travellerWidth={8} stroke={ink.dark ? "#64748b" : "#94a3b8"} fill={ink.surface} tickFormatter={(v) => bucketLabel(v, gran)} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">
        Totals for the range: {apps.map((a) => `${APP_META[a].label} ${fmtInt(totals[a])}`).join(", ")}.
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Simple bars: one series (magnitude) → one hue, hovered bar emphasised
// ---------------------------------------------------------------------------
export const SimpleBars: React.FC<{ data: { x: string; y: number }[]; xLabel?: (v: string) => string; height?: number; ariaLabel: string; unit?: string }> = ({
  data,
  xLabel = (v) => v,
  height = 200,
  ariaLabel,
  unit = "",
}) => {
  const ink = useInk();
  const [active, setActive] = useState<number | null>(null);
  if (!data.length) return <Empty>No data in this range.</Empty>;
  return (
    <div style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="20%" onMouseLeave={() => setActive(null)}>
          <CartesianGrid vertical={false} stroke={ink.grid} strokeDasharray="3 3" />
          <XAxis dataKey="x" tickFormatter={xLabel} {...axisProps(ink)} minTickGap={16} />
          <YAxis allowDecimals={false} width={40} {...axisProps(ink)} />
          <Tooltip
            cursor={false}
            content={({ active: on, payload, label }) =>
              on && payload?.length ? (
                <TipBox>
                  <span className="font-medium">{xLabel(String(label))}</span>: <span className="tabular-nums">{fmtInt(payload[0].value as number)}{unit}</span>
                </TipBox>
              ) : null
            }
          />
          <Bar dataKey="y" radius={[4, 4, 0, 0]} animationDuration={500} onMouseEnter={(_, i) => setActive(i)}>
            {data.map((_, i) => (
              <Cell key={i} fill={ink.series[0]} fillOpacity={active === null || active === i ? 1 : 0.45} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/**
 * Ranked horizontal bars rendered in HTML (labels never collide; fits narrow
 * screens). Bars grow in on load; a row with `href` or `onSelect` is a link.
 */
export const BarList: React.FC<{
  rows: { key: string; label: React.ReactNode; value: number; display?: React.ReactNode; hint?: React.ReactNode; href?: string; color?: string }[];
  ariaLabel: string;
  max?: number;
  /** Show only this many, with a "Show all" toggle. */
  limit?: number;
  onSelect?: (key: string) => void;
}> = ({ rows, ariaLabel, max, limit = 10, onSelect }) => {
  const ink = useInk();
  const [all, setAll] = useState(false);
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(t);
  }, []);
  if (!rows.length) return <Empty>Nothing yet in this range.</Empty>;
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  const visible = all ? rows : rows.slice(0, limit);
  return (
    <div>
      <ul className="space-y-1" aria-label={ariaLabel}>
        {visible.map((r, i) => {
          const body = (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-text-primary-light dark:text-text-primary-dark">{r.label}</span>
                <span className="shrink-0 tabular-nums text-slate-700 dark:text-slate-200 font-medium">{r.display ?? fmtInt(r.value)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 mt-1 overflow-hidden" aria-hidden>
                <div
                  className="h-full rounded-r-[4px] transition-[width] duration-700 ease-out group-hover:brightness-110"
                  style={{ width: grown ? `${Math.max(1.5, (r.value / top) * 100)}%` : "0%", background: r.color ?? ink.series[0], transitionDelay: `${Math.min(i, 10) * 30}ms` }}
                />
              </div>
              {r.hint && <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">{r.hint}</div>}
            </>
          );
          const cls = "group block w-full text-left text-sm rounded-lg px-1.5 py-1 -mx-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60";
          return (
            <li key={r.key}>
              {r.href ? (
                <Link to={r.href} className={cls}>{body}</Link>
              ) : onSelect ? (
                <button type="button" className={cls} onClick={() => onSelect(r.key)}>{body}</button>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {rows.length > limit && (
        <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-sky-300 hover:underline" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? "Show fewer" : `Show all ${fmtInt(rows.length)}`}
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Donut: a part-to-whole split with ≤4 named parts (the rest folds into
// "Other"). Hover a slice or legend row to read it in the centre.
// ---------------------------------------------------------------------------
export const Donut: React.FC<{
  data: { key: string; label: string; value: number; color?: string }[];
  ariaLabel: string;
  centerLabel?: string;
  size?: number;
  format?: (n: number) => string;
}> = ({ data, ariaLabel, centerLabel = "Total", size = 168, format = fmtInt }) => {
  const ink = useInk();
  const [active, setActive] = useState<string | null>(null);
  const parts = useMemo(() => {
    const sorted = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
    const head = sorted.slice(0, sorted.length > 5 ? 4 : 5);
    const rest = sorted.slice(head.length);
    const other = rest.reduce((n, r) => n + r.value, 0);
    const out = head.map((d, i) => ({ ...d, color: d.color ?? (i < 4 ? ink.series[i] : ink.dark ? "#64748b" : "#94a3b8") }));
    if (other > 0) out.push({ key: "__other", label: `Other (${rest.length})`, value: other, color: ink.dark ? "#64748b" : "#94a3b8" });
    return out;
  }, [data, ink]);
  const total = parts.reduce((n, p) => n + p.value, 0);
  if (!total) return <Empty>Nothing yet in this range.</Empty>;
  const focus = parts.find((p) => p.key === active);
  const pct = (v: number) => `${Math.round((v / total) * 1000) / 10}%`;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${ariaLabel}: ${parts.map((p) => `${p.label} ${pct(p.value)}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={parts}
              dataKey="value"
              nameKey="label"
              innerRadius="64%"
              outerRadius="100%"
              paddingAngle={parts.length > 1 ? 2 : 0}
              cornerRadius={4}
              stroke={ink.surface}
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              animationDuration={600}
              onMouseLeave={() => setActive(null)}
            >
              {parts.map((p) => (
                <Cell
                  key={p.key}
                  fill={p.color}
                  fillOpacity={!active || active === p.key ? 1 : 0.3}
                  onMouseEnter={() => setActive(p.key)}
                  style={{ cursor: "pointer", outline: "none", transition: "fill-opacity 150ms" }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-6">
          <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-full">{focus ? focus.label : centerLabel}</span>
          <span className="text-xl font-semibold tabular-nums text-text-primary-light dark:text-text-primary-dark">{format(focus ? focus.value : total)}</span>
          {focus && <span className="text-[11px] tabular-nums text-slate-600 dark:text-slate-300">{pct(focus.value)}</span>}
        </div>
      </div>
      <ul className="flex-1 min-w-[170px] space-y-1 text-sm" aria-label="Legend">
        {parts.map((p) => (
          <li key={p.key}>
            <button
              type="button"
              className={`w-full flex items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors ${active === p.key ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"}`}
              onMouseEnter={() => setActive(p.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(p.key)}
              onBlur={() => setActive(null)}
            >
              <span aria-hidden className="inline-block w-3 h-3 rounded-[4px] shrink-0" style={{ background: p.color }} />
              <span className="flex-1 min-w-0 break-words leading-tight text-text-primary-light dark:text-text-primary-dark">{p.label}</span>
              <span className="tabular-nums text-slate-700 dark:text-slate-200 font-medium">{format(p.value)}</span>
              <span className="tabular-nums text-xs text-slate-600 dark:text-slate-300 w-12 text-right">{pct(p.value)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** A word-sized trend for KPI tiles. Decorative: the tile states the number. */
export const Sparkline: React.FC<{ values: number[]; color?: string; height?: number }> = ({ values, color, height = 28 }) => {
  const ink = useInk();
  const uid = useId().replace(/:/g, "");
  if (values.length < 2) return null;
  const c = color ?? ink.series[0];
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div aria-hidden style={{ height }} className="mt-1.5 -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 2 }} accessibilityLayer={false} tabIndex={-1}>
          <defs>
            <linearGradient id={`sp-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={0.3} />
              <stop offset="100%" stopColor={c} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={c} strokeWidth={1.75} fill={`url(#sp-${uid})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
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
                    className="w-6 h-5 rounded transition-transform hover:scale-125 hover:ring-2 hover:ring-slate-500/60"
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
  loading,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string;
  empty?: React.ReactNode;
  initialSort?: { key: string; dir: "asc" | "desc" };
  onExport?: () => void;
  maxHeight?: number;
  dense?: boolean;
  /** First load shows skeleton rows; a reload keeps the rows and runs a bar. */
  loading?: boolean;
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
  if (!rows.length) return loading ? <SkeletonTable rows={dense ? 4 : 6} cols={Math.min(columns.length, 6)} /> : <Empty>{empty}</Empty>;
  return (
    <div className={`relative transition-opacity ${loading ? "opacity-70" : ""}`}>
      <RefreshBar active={!!loading} className="absolute inset-x-0 -top-1" />
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
              <tr key={rowKey(r)} className="border-b border-border-light/60 dark:border-slate-800 align-top transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
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
