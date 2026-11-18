import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertOctagon, Bot, BrainCircuit, CheckCircle2, CircleDashed, Clock3, Cpu, FileCheck2, FileClock, FileText, Gamepad2, Globe,
  Hourglass, LineChart, Lightbulb, Loader2, PauseCircle, Rocket, ShieldCheck, Smartphone, Sparkles, UploadCloud, BadgeCheck, MessageSquareWarning,
} from "lucide-react";
import type { DocType, Health, ReviewState, Status } from "../../api/sideProjects";

/**
 * Side projects visual language. Status colours are the validated three-slot categorical set
 * (dataviz reference palette: orange / blue / aqua, light and dark steps), always paired with an
 * icon and a label so colour never carries meaning alone.
 */

export const STATUS_META: Record<Status, { label: string; icon: React.ElementType; color: string; dark: string; soft: string; ring: string; text: string }> = {
  IDEA: {
    label: "Idea",
    icon: Lightbulb,
    color: "#eb6834",
    dark: "#d95926",
    soft: "bg-orange-50 dark:bg-orange-500/10",
    ring: "ring-orange-200 dark:ring-orange-500/30",
    text: "text-orange-700 dark:text-orange-300",
  },
  IN_PROGRESS: {
    label: "In progress",
    icon: Rocket,
    color: "#2a78d6",
    dark: "#3987e5",
    soft: "bg-blue-50 dark:bg-blue-500/10",
    ring: "ring-blue-200 dark:ring-blue-500/30",
    text: "text-blue-700 dark:text-blue-300",
  },
  COMPLETED: {
    label: "Completed",
    icon: CheckCircle2,
    color: "#1baf7a",
    dark: "#199e70",
    soft: "bg-emerald-50 dark:bg-emerald-500/10",
    ring: "ring-emerald-200 dark:ring-emerald-500/30",
    text: "text-emerald-700 dark:text-emerald-300",
  },
};
export const STATUS_ORDER: Status[] = ["IDEA", "IN_PROGRESS", "COMPLETED"];
/** Darker steps of the same hues for solid fills that carry white text (>= 4.5:1). */
export const STATUS_SOLID: Record<Status, string> = { IDEA: "#c2410c", IN_PROGRESS: "#1d4ed8", COMPLETED: "#047857" };

/** Status palette (good / warning / serious / critical), always with an icon + label. */
export const HEALTH_META: Record<Health, { label: string; icon: React.ElementType; color: string; cls: string }> = {
  ON_TRACK: { label: "On track", icon: CheckCircle2, color: "#0ca30c", cls: "text-green-700 dark:text-green-400" },
  STALE: { label: "No recent activity", icon: PauseCircle, color: "#fab219", cls: "text-amber-700 dark:text-amber-300" },
  OVERDUE: { label: "Overdue", icon: Clock3, color: "#d03b3b", cls: "text-red-700 dark:text-red-400" },
  BLOCKED: { label: "Blocked", icon: AlertOctagon, color: "#ec835a", cls: "text-orange-700 dark:text-orange-300" },
  DONE: { label: "Done", icon: BadgeCheck, color: "#0ca30c", cls: "text-green-700 dark:text-green-400" },
  IDLE: { label: "Not started", icon: CircleDashed, color: "#94a3b8", cls: "text-slate-600 dark:text-gray-300" },
};

export const REVIEW_META: Record<ReviewState, { label: string; icon: React.ElementType; cls: string } | null> = {
  NONE: null,
  CHANGES_REQUESTED: { label: "Changes requested", icon: MessageSquareWarning, cls: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100" },
  AWAITING_VERIFICATION: { label: "Awaiting verification", icon: Hourglass, cls: "bg-blue-100 text-blue-900 dark:bg-blue-500/15 dark:text-blue-100" },
  VERIFIED: { label: "Verified", icon: ShieldCheck, cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-100" },
};

export const DOC_META: Record<DocType, { label: string; short: string; icon: React.ElementType; required: boolean }> = {
  CONCEPT: { label: "Concept note", short: "Concept", icon: FileCheck2, required: true },
  SRS: { label: "SRS", short: "SRS", icon: FileText, required: false },
  IMPLEMENTATION_PLAN: { label: "Implementation plan", short: "Plan", icon: FileClock, required: false },
};

export const CATEGORY_ICON: Record<string, React.ElementType> = {
  globe: Globe,
  smartphone: Smartphone,
  brain: BrainCircuit,
  cpu: Cpu,
  bot: Bot,
  gamepad: Gamepad2,
  chart: LineChart,
  shield: ShieldCheck,
  sparkles: Sparkles,
};

export const useIsDark = () => {
  const get = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const [dark, setDark] = useState(get);
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(get()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
};

export const statusColor = (s: Status, dark: boolean) => (dark ? STATUS_META[s].dark : STATUS_META[s].color);

export const StatusPill: React.FC<{ status: Status; size?: "sm" | "md" }> = ({ status, size = "sm" }) => {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ring-1 ${m.soft} ${m.ring} ${m.text} ${size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"}`}>
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
      {m.label}
    </span>
  );
};

export const ReviewBadge: React.FC<{ state: ReviewState; compact?: boolean }> = ({ state, compact }) => {
  const m = REVIEW_META[state];
  if (!m) return null;
  const Icon = m.icon;
  return (
    <span title={m.label} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.cls}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {compact ? <span className="sr-only">{m.label}</span> : m.label}
    </span>
  );
};

export const HealthDot: React.FC<{ health: Health; withLabel?: boolean }> = ({ health, withLabel }) => {
  const m = HEALTH_META[health];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${m.cls}`} title={m.label}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {withLabel ? m.label : <span className="sr-only">{m.label}</span>}
    </span>
  );
};

/** Circular progress. Animated stroke; the number sits inside. */
export const ProgressRing: React.FC<{ value: number; size?: number; stroke?: number; color?: string; label?: string; children?: React.ReactNode }> = ({
  value,
  size = 44,
  stroke = 4,
  color = "#2a78d6",
  label,
  children,
}) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label ?? `${v}% done`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-200 dark:stroke-gray-700" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={color}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (v / 100) * c }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </svg>
      <span className="absolute text-[11px] font-bold text-slate-700 dark:text-gray-100">{children ?? `${v}%`}</span>
    </div>
  );
};

/**
 * Progress on a photo or a gradient: a frosted, see-through ring (no solid disc) with a
 * gradient arc, a soft glow and the value in white. Used in the project drawer's cover.
 */
export const GlassRing: React.FC<{ value: number; size?: number; stroke?: number; accent?: string; caption?: string; label?: string }> = ({ value, size = 76, stroke = 6, accent = "#6ee7b7", caption = "done", label }) => {
  const r = (size - stroke) / 2 - 4;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const id = React.useId().replace(/:/g, "");
  return (
    <div
      className="relative inline-flex items-center justify-center rounded-full bg-white/10 ring-1 ring-inset ring-white/25 backdrop-blur-md"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${v}% ${caption}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`gr-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor={accent} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="rgba(255,255,255,0.22)" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={`url(#gr-${id})`}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (v / 100) * c }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      <span className="absolute flex flex-col items-center leading-none text-white">
        <span className="text-lg font-extrabold tabular-nums ">
          {v}
          <span className="text-[10px] font-bold opacity-90">%</span>
        </span>
        <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/85">{caption}</span>
      </span>
    </div>
  );
};

export const ProgressBar: React.FC<{ value: number; color: string; className?: string }> = ({ value, color, className = "" }) => (
  <div className={`h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-gray-700/50 ${className}`} role="progressbar" aria-label={`${value}% done`} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <motion.div className="h-full rounded-full" style={{ backgroundColor: color }} initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.6 }} />
  </div>
);

export const DocChips: React.FC<{ docs: Record<DocType, boolean>; pending?: boolean }> = ({ docs, pending }) => (
  <div className="flex items-center gap-1">
    {(Object.keys(DOC_META) as DocType[]).map((t) => {
      const m = DOC_META[t];
      const Icon = m.icon;
      const has = docs[t];
      const warn = t === "CONCEPT" && pending;
      return (
        <span
          key={t}
          title={`${m.label}: ${has ? "added" : warn ? "needed" : "not yet"}`}
          className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${
            has
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              : warn
                ? "bg-red-100 text-red-700 animate-pulse dark:bg-red-500/15 dark:text-red-300"
                : "bg-slate-100 text-slate-400 dark:bg-gray-700/50 dark:text-gray-500"
          }`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">{m.label}</span>
        </span>
      );
    })}
  </div>
);

export const Spinner: React.FC<{ className?: string }> = ({ className = "h-5 w-5" }) => <Loader2 className={`animate-spin ${className}`} aria-hidden />;

export const Skeleton: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`animate-pulse rounded-xl bg-slate-200/70 dark:bg-gray-700/40 ${className}`} />
);

export const FieldError: React.FC<{ message?: string | null; id?: string }> = ({ message, id }) =>
  message ? (
    <p id={id} role="alert" className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
      <AlertOctagon className="h-3.5 w-3.5" aria-hidden />
      {message}
    </p>
  ) : null;

/* Tokens shared with the rest of the MIS (ui/Button, ui/Input, officeHours/ohUi): rounded-full
 * blue buttons, rounded-2xl inputs with a soft blue focus ring, rounded-3xl cards, translucent
 * gray surfaces in dark mode. */
export const inputCls =
  "w-full min-h-[44px] rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 dark:border-gray-700/60 dark:bg-gray-800/40 dark:text-gray-100 dark:placeholder:text-gray-500 dark:hover:border-gray-600";
export const inputErrCls = "!border-red-400 focus:!border-red-500 focus:!ring-red-500/15 dark:!border-red-500/70";
export const labelCls = "mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-slate-700 dark:text-gray-200";
export const primaryBtn =
  "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-gray-900";
export const secondaryBtn =
  "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700/60 dark:bg-gray-800/40 dark:text-gray-100 dark:hover:bg-gray-700/50";
export const ghostBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-300 dark:hover:bg-gray-700/50 dark:hover:text-white";
export const iconBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-white";
export const cardCls = "rounded-3xl border border-slate-200 bg-white dark:border-gray-700/30 dark:bg-gray-800/30";
/** A chip toggle (filters, view switches): rounded-full, blue when on. */
export const chipCls = (on: boolean) =>
  `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
    on
      ? "border-blue-600 bg-blue-600 text-white "
      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-gray-700/60 dark:bg-gray-800/40 dark:text-gray-300 dark:hover:bg-gray-700/50"
  }`;

/** Drop files here or click: native drag events, keyboard reachable, touch falls back to the picker. */
export const Dropzone: React.FC<{
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  busy?: boolean;
  progress?: number | null;
  error?: string | null;
  compact?: boolean;
  label?: string;
  hint?: string;
  icon?: React.ElementType;
}> = ({ onFiles, accept, multiple, disabled, busy, progress, error, compact, label = "Drop files or browse", hint, icon: Icon = UploadCloud }) => {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const take = useCallback(
    (list: FileList | null) => {
      if (!list || !list.length || disabled || busy) return;
      onFiles(Array.from(list).slice(0, multiple ? 10 : 1));
    },
    [onFiles, disabled, busy, multiple],
  );
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={label}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
      onClick={() => !busy && input.current?.click()}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current -= 1;
        if (depth.current <= 0) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        take(e.dataTransfer.files);
      }}
      className={`group relative flex cursor-pointer flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border-2 border-dashed text-center transition ${
        compact ? "px-3 py-3" : "px-4 py-7"
      } ${
        error
          ? "border-red-300 bg-red-50/60 dark:border-red-500/50 dark:bg-red-500/5"
          : over
            ? "scale-[1.01] border-blue-500 bg-blue-50 dark:bg-blue-500/10"
            : "border-slate-200 bg-slate-50/60 hover:border-blue-500/60 hover:bg-blue-50/40 dark:border-gray-700/60 dark:bg-gray-800/40 dark:hover:bg-gray-700/40"
      } ${disabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <input ref={input} type="file" className="hidden" accept={accept} multiple={multiple} onChange={(e) => (take(e.target.files), (e.target.value = ""))} />
      {busy ? (
        <>
          <ProgressRing value={progress ?? 0} size={compact ? 32 : 44} />
          <span className="text-xs font-medium text-slate-600 dark:text-gray-300">Uploading…</span>
        </>
      ) : (
        <>
          <motion.span animate={over ? { y: -4, scale: 1.1 } : { y: 0, scale: 1 }} className={`flex items-center justify-center rounded-full ${compact ? "h-8 w-8" : "h-11 w-11"} bg-white text-blue-600 dark:bg-gray-700/50 dark:text-blue-200`}>
            <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
          </motion.span>
          <span className="text-sm font-semibold text-slate-800 dark:text-white">{label}</span>
          {hint && <span className="text-xs text-slate-600 dark:text-gray-300">{hint}</span>}
        </>
      )}
      {error && <span role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
};

export const timeAgo = (iso: string | null | undefined) => {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24;
  if (d < 30) return `${Math.floor(d)}d ago`;
  const mo = d / 30;
  if (mo < 12) return `${Math.floor(mo)}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
};

export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** An illustration for empty states — a small SVG constellation, no words needed. */
export const EmptyArt: React.FC<{ icon?: React.ElementType; className?: string }> = ({ icon: Icon = Lightbulb, className = "" }) => (
  <div className={`relative mx-auto h-24 w-24 ${className}`} aria-hidden>
    <motion.div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-100 to-orange-100 dark:from-blue-500/20 dark:to-orange-500/10" animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 3 }} />
    <div className="absolute inset-3 flex items-center justify-center rounded-full bg-white dark:bg-gray-800/40">
      <Icon className="h-9 w-9 text-blue-600 dark:text-blue-200" />
    </div>
    <motion.span className="absolute -right-1 top-2 h-3 w-3 rounded-full bg-orange-400" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 2.2 }} />
    <motion.span className="absolute bottom-1 left-0 h-2 w-2 rounded-full bg-emerald-400" animate={{ y: [0, 3, 0] }} transition={{ repeat: Infinity, duration: 2.8 }} />
  </div>
);
