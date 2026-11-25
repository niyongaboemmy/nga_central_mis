/**
 * Visual building blocks for the platform console dashboards (redesign 2026-11-25).
 *
 * Rules (dataviz + NGA UI rules): blue is the one data hue; green / amber / red only mean
 * status and always ship with an icon + label + count (never colour alone); thin marks,
 * rounded ends, 2px gaps between segments; every chart has a hover read-out; numbers wear
 * text colours, not series colours; no shadows, borders stay hairline.
 */
import React, { useId, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, ChevronRight, type LucideIcon } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CountUp } from "../kit";
import { useChartTheme } from "../platform/chartTheme";
import { accent, surface } from "../../../design/surfaces";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

export type Tone = "blue" | "emerald" | "amber" | "red" | "gray";

/** Text + soft fill per tone (status tones are for meaning only). */
export const TONE: Record<Tone, { text: string; soft: string; solid: string; stroke: string }> = {
  blue: { text: "text-blue-600 dark:text-blue-400", soft: "bg-blue-50 dark:bg-blue-500/15", solid: "bg-blue-600 dark:bg-blue-500", stroke: "stroke-blue-600 dark:stroke-blue-500" },
  emerald: { text: "text-emerald-600 dark:text-emerald-400", soft: "bg-emerald-50 dark:bg-emerald-500/15", solid: "bg-emerald-600", stroke: "stroke-emerald-600" },
  amber: { text: "text-amber-600 dark:text-amber-400", soft: "bg-amber-50 dark:bg-amber-500/15", solid: "bg-amber-500", stroke: "stroke-amber-500" },
  red: { text: "text-red-600 dark:text-red-400", soft: "bg-red-50 dark:bg-red-500/15", solid: "bg-red-600 dark:bg-red-500", stroke: "stroke-red-600 dark:stroke-red-500" },
  gray: { text: "text-gray-500 dark:text-gray-400", soft: "bg-gray-100 dark:bg-gray-800/70", solid: "bg-gray-400 dark:bg-gray-600", stroke: "stroke-gray-400 dark:stroke-gray-600" },
};

/** Icon in a soft rounded square. */
export const IconTile: React.FC<{ icon: LucideIcon; tone?: Tone; size?: "sm" | "md" | "lg" }> = ({ icon: Icon, tone = "blue", size = "md" }) => (
  <span
    className={cx(
      "flex shrink-0 items-center justify-center rounded-xl",
      TONE[tone].soft,
      TONE[tone].text,
      size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12 rounded-2xl" : "h-10 w-10",
    )}
    aria-hidden
  >
    <Icon className={size === "lg" ? "h-6 w-6" : size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
  </span>
);

/** A dashboard section: one card, a title row with an optional icon, aside text and action. */
export const Panel: React.FC<{
  title: React.ReactNode;
  icon?: LucideIcon;
  aside?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}> = ({ title, icon: Icon, aside, action, className, bodyClassName, children }) => (
  <section className={cx(surface.card, "flex flex-col p-4 sm:p-5", className)}>
    <header className="mb-4 flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 text-gray-400 dark:text-gray-500" aria-hidden />}
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
      {aside && <span className="text-xs text-gray-500 dark:text-gray-400">{aside}</span>}
      {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
    </header>
    <div className={cx("min-h-0 flex-1", bodyClassName)}>{children}</div>
  </section>
);

// ---------------------------------------------------------------------------
// Sparkline: one series, no axes; the tile it sits in names it
// ---------------------------------------------------------------------------

export const Sparkline: React.FC<{ values: number[]; label: string; tone?: Tone; className?: string }> = ({ values, label, tone = "blue", className }) => {
  const id = useId();
  const reduced = useReducedMotion();
  if (values.length < 2) return null;
  const w = 100;
  const h = 32;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cx("h-8 w-full overflow-visible", className)} role="img" aria-label={`${label}: ${values.join(", ")}`}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <g className={TONE[tone].text}>
        <path d={area} fill={`url(#${id})`} />
        <motion.path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </g>
    </svg>
  );
};

// ---------------------------------------------------------------------------
// StatTile: icon, big number, label; optional change, sparkline, attention
// ---------------------------------------------------------------------------

export const StatTile: React.FC<{
  icon: LucideIcon;
  label: string;
  value: number;
  format?: (n: number) => string;
  /** small line under the label */
  hint?: React.ReactNode;
  /** change vs the previous period; positive = up */
  delta?: number | null;
  /** is "up" good for this number (default true) */
  upIsGood?: boolean;
  spark?: number[];
  tone?: Tone;
  /** a number that needs someone: red tint + dot when > 0 */
  attention?: boolean;
  onClick?: () => void;
}> = ({ icon, label, value, format, hint, delta, upIsGood = true, spark, tone = "blue", attention, onClick }) => {
  const alert = attention && value > 0;
  const Tag: any = onClick ? motion.button : motion.div;
  const good = delta == null || delta === 0 ? null : delta > 0 === upIsGood;
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      whileHover={onClick ? { y: -2 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      className={cx(
        "group relative flex w-full flex-col gap-3 rounded-2xl border p-4 text-left transition-colors",
        alert ? "border-red-200 bg-red-50/70 dark:border-red-500/25 dark:bg-red-500/10" : "border-gray-200 bg-white dark:border-gray-700/40 dark:bg-gray-800/40",
        onClick && (alert ? "hover:border-red-300 dark:hover:border-red-500/40" : "hover:border-blue-300 dark:hover:border-blue-500/50"),
        onClick && accent.focus,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <IconTile icon={icon} tone={alert ? "red" : tone} size="sm" />
        {delta != null && delta !== 0 && (
          <span className={cx("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", good ? TONE.emerald.soft + " " + TONE.emerald.text : TONE.red.soft + " " + TONE.red.text)}>
            {delta > 0 ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ArrowDownRight className="h-3 w-3" aria-hidden />}
            {Math.abs(delta)}%
          </span>
        )}
        {alert && <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden />}
      </div>
      <div>
        <p className={cx("text-2xl font-bold tracking-tight tabular-nums", alert ? "text-red-700 dark:text-red-300" : "text-gray-900 dark:text-white")}>
          <CountUp value={value} format={format} />
        </p>
        <p className="mt-0.5 text-sm font-medium text-gray-600 dark:text-gray-300">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
      </div>
      {spark && spark.length > 1 && spark.some((v) => v > 0) && <Sparkline values={spark} label={label} tone={alert ? "red" : tone} />}
      {onClick && <ChevronRight className="absolute bottom-4 right-4 h-4 w-4 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-600" aria-hidden />}
    </Tag>
  );
};

// ---------------------------------------------------------------------------
// BarList: labelled horizontal bars, one hue, value at the end
// ---------------------------------------------------------------------------

export interface BarItem {
  key: string;
  label: React.ReactNode;
  value: number;
  /** text under / after the label */
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  onClick?: () => void;
}

export const BarList: React.FC<{ items: BarItem[]; format?: (n: number) => string; max?: number; empty?: React.ReactNode; label: string }> = ({ items, format = (n) => n.toLocaleString(), max, empty, label }) => {
  const reduced = useReducedMotion();
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{empty ?? "Nothing yet"}</div>;
  return (
    <ul className="space-y-1" aria-label={label}>
      {items.map((it, i) => {
        const body = (
          <>
            <div className="relative flex min-w-0 flex-1 items-center gap-2 py-1.5">
              <motion.span
                className={cx("absolute inset-y-0 left-0 rounded-lg", it.tone ? TONE[it.tone].soft : "bg-blue-50 dark:bg-blue-500/15")}
                initial={reduced ? false : { width: 0 }}
                animate={{ width: `${Math.max(2, (it.value / top) * 100)}%` }}
                transition={{ duration: 0.7, delay: reduced ? 0 : i * 0.04, ease: "easeOut" }}
                aria-hidden
              />
              <span className="relative flex min-w-0 items-center gap-2 pl-2.5">
                {it.icon}
                <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{it.label}</span>
                {it.hint && <span className="hidden truncate text-xs text-gray-500 dark:text-gray-400 sm:inline">{it.hint}</span>}
              </span>
            </div>
            <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{format(it.value)}</span>
          </>
        );
        return (
          <li key={it.key}>
            {it.onClick ? (
              <button type="button" onClick={it.onClick} className={cx("flex w-full items-center gap-3 rounded-lg pr-1 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50", accent.focus)}>
                {body}
              </button>
            ) : (
              <div className="flex items-center gap-3 pr-1">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

// ---------------------------------------------------------------------------
// SegmentBar: parts of a whole (status mix) + a legend that names every part
// ---------------------------------------------------------------------------

export interface Segment {
  key: string;
  label: string;
  value: number;
  tone: Tone;
  icon: LucideIcon;
  onClick?: () => void;
}

/** `columns`: legend columns from sm up (2 fits a narrow side panel). */
export const SegmentBar: React.FC<{ segments: Segment[]; label: string; columns?: 2 | 4 }> = ({ segments, label, columns = 4 }) => {
  const total = segments.reduce((t, s) => t + s.value, 0);
  const [hover, setHover] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800/70" role="img" aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
        {shown.map((s) => (
          <motion.span
            key={s.key}
            className={cx("h-full first:rounded-l-full last:rounded-r-full transition-opacity", TONE[s.tone].solid, hover && hover !== s.key && "opacity-30")}
            initial={reduced ? false : { width: 0 }}
            animate={{ width: `${(s.value / Math.max(total, 1)) * 100}%` }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <ul className={cx("mt-3 grid grid-cols-2 gap-1.5", columns === 4 && "sm:grid-cols-4")} aria-label={label}>
        {segments.map((s) => {
          const Icon = s.icon;
          const Tag: any = s.onClick ? "button" : "div";
          return (
            <li key={s.key}>
              <Tag
                type={s.onClick ? "button" : undefined}
                onClick={s.onClick}
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(s.key)}
                onBlur={() => setHover(null)}
                className={cx("flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors", s.onClick && "hover:bg-gray-50 dark:hover:bg-gray-800/50", s.onClick && accent.focus)}
              >
                <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", TONE[s.tone].soft, TONE[s.tone].text)} aria-hidden>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-bold leading-tight tabular-nums text-gray-900 dark:text-white">{s.value}</span>
                  <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{s.label}</span>
                </span>
              </Tag>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Ring: a 0..1 ratio (usage, days left), centre content is the caller's
// ---------------------------------------------------------------------------

export const Ring: React.FC<{ value: number; size?: number; stroke?: number; tone?: Tone; label: string; children?: React.ReactNode }> = ({ value, size = 64, stroke = 6, tone = "blue", label, children }) => {
  const reduced = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-gray-100 dark:stroke-gray-800" />
        {v > 0 && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            strokeLinecap="round"
            className={cx("fill-none", TONE[tone].stroke)}
            strokeDasharray={c}
            initial={reduced ? false : { strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - Math.max(v, 0.02)) }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</span>
    </span>
  );
};

/** Ratio -> tone for a usage limit: blue, amber from 75 %, red from 90 %. */
export const limitTone = (ratio: number | null): Tone => (ratio === null ? "blue" : ratio >= 0.9 ? "red" : ratio >= 0.75 ? "amber" : "blue");

// ---------------------------------------------------------------------------
// Charts (recharts): area trend and daily bars, themed, with hover read-outs
// ---------------------------------------------------------------------------

export interface Series {
  key: string;
  label: string;
}

const shortDay = (iso: string) => {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
};

/** Legend chips (identity never by colour alone: the chip carries the name). */
export const Legend: React.FC<{ series: Array<Series & { color: string }> }> = ({ series }) =>
  series.length < 2 ? null : (
    <div className="flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-300">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
          {s.label}
        </span>
      ))}
    </div>
  );

export const TrendChart: React.FC<{
  data: Array<Record<string, any>>;
  x: string;
  series: Series[];
  height?: number;
  label: string;
  format?: (n: number) => string;
  /** x tick / tooltip label; default "Mon d" */
  xFormat?: (v: string) => string;
  /** y tick column width (wider for money labels like "750k") */
  yWidth?: number;
}> = ({ data, x, series, height = 220, label, format = (n) => n.toLocaleString(), xFormat = shortDay, yWidth = 36 }) => {
  const ct = useChartTheme();
  const gid = useId().replace(/:/g, "");
  const colored = useMemo(() => series.map((s, i) => ({ ...s, color: ct.series[i % ct.series.length] })), [series, ct.series]);
  return (
    <div className="space-y-2">
      <div style={{ height }} role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
            <defs>
              {colored.map((s, i) => (
                <linearGradient key={s.key} id={`${gid}-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke={ct.grid} />
            <XAxis dataKey={x} tickFormatter={(v) => xFormat(String(v))} tick={{ fontSize: 11, fill: ct.tick }} tickLine={false} axisLine={false} minTickGap={20} />
            <YAxis allowDecimals={false} width={yWidth} tick={{ fontSize: 11, fill: ct.tick }} tickLine={false} axisLine={false} tickFormatter={(v) => format(Number(v))} />
            <Tooltip contentStyle={ct.tooltip} labelFormatter={(v) => xFormat(String(v))} formatter={(v: any, n: any) => [format(Number(v)), n]} cursor={{ stroke: ct.grid, strokeWidth: 1 }} />
            {colored.map((s, i) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} fill={`url(#${gid}-${i})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: ct.surface }} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <Legend series={colored} />
    </div>
  );
};

/** "Jul 2026" for a YYYY-MM(-DD) value. */
export const monthLabel = (v: string) => {
  const d = new Date(`${String(v).slice(0, 7)}-01T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
};

export const DailyBars: React.FC<{ data: Array<Record<string, any>>; x: string; y: string; name: string; height?: number; label: string }> = ({ data, x, y, name, height = 160, label }) => {
  const ct = useChartTheme();
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 4, top: 6, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={ct.grid} />
          <XAxis dataKey={x} tickFormatter={shortDay} tick={{ fontSize: 11, fill: ct.tick }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11, fill: ct.tick }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={ct.tooltip} labelFormatter={(v) => shortDay(String(v))} cursor={{ fill: ct.grid, opacity: 0.4 }} />
          <Bar dataKey={y} name={name} fill={ct.series[0]} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/** Days until a date as a ring that empties toward the end (renewal countdowns). */
export const DaysRing: React.FC<{ days: number | null; total?: number; size?: number; caption?: string }> = ({ days, total = 120, size = 64, caption = "days" }) => {
  if (days === null) return <Ring value={0} size={size} label="No end date" tone="gray"><span className="text-xs text-gray-400">—</span></Ring>;
  const tone: Tone = days < 0 ? "red" : days <= 14 ? "amber" : "blue";
  return (
    <Ring value={days < 0 ? 1 : days / total} size={size} tone={tone} label={days < 0 ? `Ended ${-days} days ago` : `${days} days left`}>
      <span className="text-base font-bold leading-none tabular-nums text-gray-900 dark:text-white">{Math.abs(days)}</span>
      <span className="text-[10px] text-gray-500 dark:text-gray-400">{days < 0 ? "ago" : caption}</span>
    </Ring>
  );
};
