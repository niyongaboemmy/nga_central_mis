/**
 * Tenant-management UI kit (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §8): animated,
 * icon-first building blocks shared by the register wizard, the applicant
 * tracker, the platform console and the school's subscription pages.
 *
 * Rule of the kit: show state with motion, colour and icons; keep text to a
 * label. Every animation goes through design/motion.ts (reduced-motion safe).
 */
import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "framer-motion";
import { Check, Lock, UploadCloud, X, Loader2, type LucideIcon } from "lucide-react";
import { useMotion } from "../../../design/motion";
import type { Entitlement, PackageInfo, TimelineEvent, TrackerStep, UsageMeter } from "../../../api/tenantMgmt";
import { TRACKER_STEPS, formatMoney } from "../../../api/tenantMgmt";
import { STEP_ICONS, STEP_LABELS, entIcon } from "./icons";

export { ENT_ICONS, STEP_ICONS, STEP_LABELS, entIcon } from "./icons";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

// ---------------------------------------------------------------------------
// Accent colours (Package.accent): full class names so Tailwind keeps them
// ---------------------------------------------------------------------------

// Platform palette: blue only. Packages are told apart by the shade of blue (and their
// name), never by hue -- the old sky / amber / violet / emerald accents map onto it.
export const ACCENTS: Record<string, { ring: string; bg: string; text: string; soft: string; grad: string }> = {
  sky: { ring: "ring-blue-400", bg: "bg-blue-400", text: "text-blue-600 dark:text-blue-300", soft: "bg-blue-50 dark:bg-blue-400/10", grad: "from-blue-300 to-blue-400" },
  amber: { ring: "ring-blue-500", bg: "bg-blue-500", text: "text-blue-700 dark:text-blue-300", soft: "bg-blue-50 dark:bg-blue-500/10", grad: "from-blue-400 to-blue-500" },
  violet: { ring: "ring-blue-600", bg: "bg-blue-600", text: "text-blue-700 dark:text-blue-200", soft: "bg-blue-100 dark:bg-blue-500/15", grad: "from-blue-500 to-blue-600" },
  emerald: { ring: "ring-blue-800", bg: "bg-blue-800", text: "text-blue-800 dark:text-blue-200", soft: "bg-blue-100 dark:bg-blue-600/20", grad: "from-blue-700 to-blue-800" },
};
export const accentOf = (a: string | null | undefined) => ACCENTS[a ?? ""] ?? ACCENTS.sky;

// ---------------------------------------------------------------------------
// CountUp: numbers that roll to their value
// ---------------------------------------------------------------------------

export const CountUp: React.FC<{ value: number; format?: (n: number) => string; className?: string }> = ({ value, format, className }) => {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced) return setShown(value);
    const controls = animate(from.current, value, { duration: 0.8, ease: "easeOut", onUpdate: (v) => setShown(Math.round(v)) });
    from.current = value;
    return () => controls.stop();
  }, [value, reduced]);
  return <span className={cx("tabular-nums", className)}>{format ? format(shown) : shown.toLocaleString()}</span>;
};

// ---------------------------------------------------------------------------
// JourneyStepper: the six-step applicant path, current step pulses
// ---------------------------------------------------------------------------

export const JourneyStepper: React.FC<{ current: TrackerStep; failed?: boolean; compact?: boolean }> = ({ current, failed, compact }) => {
  const idx = TRACKER_STEPS.indexOf(current);
  const reduced = useReducedMotion();
  return (
    <ol className="relative flex items-start justify-between gap-1" aria-label="Progress">
      <div className="absolute left-5 right-5 top-5 h-1 rounded-full bg-slate-200 dark:bg-gray-700" aria-hidden />
      <motion.div
        className={cx("absolute left-5 top-5 h-1 rounded-full", failed ? "bg-red-500" : "bg-gradient-to-r from-brand-500 to-emerald-500")}
        initial={{ width: 0 }}
        animate={{ width: `calc((100% - 2.5rem) * ${Math.max(0, idx) / (TRACKER_STEPS.length - 1)})` }}
        transition={{ duration: reduced ? 0 : 0.9, ease: "easeOut" }}
        aria-hidden
      />
      {TRACKER_STEPS.map((s, i) => {
        const Icon = STEP_ICONS[s];
        const done = i < idx || current === "live";
        const active = i === idx && current !== "live";
        return (
          <li key={s} className="relative z-10 flex flex-1 flex-col items-center gap-1.5" aria-current={active ? "step" : undefined}>
            <motion.span
              className={cx(
                "flex h-10 w-10 items-center justify-center rounded-full border-2 shadow-sm",
                done && "border-emerald-500 bg-emerald-500 text-white",
                active && !failed && "border-brand-500 bg-white text-brand-600 dark:bg-gray-900 dark:text-brand-200",
                active && failed && "border-red-500 bg-white text-red-600 dark:bg-gray-900",
                !done && !active && "border-slate-300 bg-white text-slate-400 dark:border-gray-600 dark:bg-gray-800",
              )}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: reduced ? 0 : i * 0.08, type: "spring", stiffness: 400, damping: 22 }}
            >
              {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              {active && !reduced && (
                <motion.span
                  className={cx("absolute inset-0 rounded-full", failed ? "bg-red-400/30" : "bg-brand-500/25")}
                  animate={{ scale: [1, 1.6], opacity: [0.7, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                  aria-hidden
                />
              )}
            </motion.span>
            {!compact && (
              <span className={cx("text-[11px] font-medium sm:text-xs", active ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-gray-300")}>
                {STEP_LABELS[s]}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
};

// ---------------------------------------------------------------------------
// StatusPill: one colour + dot per status, live statuses breathe
// ---------------------------------------------------------------------------

const STATUS_TONE: Record<string, { tone: string; live?: boolean }> = {
  DRAFT: { tone: "slate" },
  SUBMITTED: { tone: "sky", live: true },
  UNDER_REVIEW: { tone: "sky", live: true },
  CHANGES_REQUESTED: { tone: "amber", live: true },
  REJECTED: { tone: "red" },
  WITHDRAWN: { tone: "slate" },
  APPROVED_AWAITING_PAYMENT: { tone: "violet", live: true },
  PAYMENT_SUBMITTED: { tone: "violet", live: true },
  PAYMENT_REJECTED: { tone: "red", live: true },
  PAYMENT_CONFIRMED: { tone: "emerald" },
  EXPIRED: { tone: "slate" },
  PROVISIONING: { tone: "sky", live: true },
  PROVISIONING_FAILED: { tone: "red", live: true },
  ACTIVE: { tone: "emerald" },
  GRACE: { tone: "amber", live: true },
  SUSPENDED: { tone: "red" },
  ARCHIVED: { tone: "slate" },
  PENDING: { tone: "sky", live: true },
  ISSUED: { tone: "violet" },
  PAID: { tone: "emerald" },
  VOID: { tone: "slate" },
  OVERDUE: { tone: "red", live: true },
  CONFIRMED: { tone: "emerald" },
};
const TONES: Record<string, { pill: string; dot: string }> = {
  slate: { pill: "bg-slate-100 text-slate-700 dark:bg-gray-700/60 dark:text-gray-200", dot: "bg-slate-400" },
  sky: { pill: "bg-blue-100 text-blue-800 dark:bg-blue-400/15 dark:text-blue-200", dot: "bg-blue-500" },
  amber: { pill: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200", dot: "bg-amber-500" },
  violet: { pill: "bg-violet-100 text-violet-800 dark:bg-violet-400/15 dark:text-violet-200", dot: "bg-violet-500" },
  emerald: { pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200", dot: "bg-emerald-500" },
  red: { pill: "bg-red-100 text-red-800 dark:bg-red-400/15 dark:text-red-200", dot: "bg-red-500" },
};

export const statusLabel = (s: string) =>
  s === "APPROVED_AWAITING_PAYMENT" ? "Awaiting payment" : s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

export const StatusPill: React.FC<{ status: string; label?: string; className?: string }> = ({ status, label, className }) => {
  const { tone, live } = STATUS_TONE[status] ?? { tone: "slate" };
  const t = TONES[tone];
  const reduced = useReducedMotion();
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", t.pill, className)}>
      <span className="relative flex h-2 w-2">
        {live && !reduced && <motion.span className={cx("absolute inline-flex h-full w-full rounded-full", t.dot)} animate={{ scale: [1, 2.2], opacity: [0.6, 0] }} transition={{ duration: 1.4, repeat: Infinity }} />}
        <span className={cx("relative inline-flex h-2 w-2 rounded-full", t.dot)} />
      </span>
      {label ?? statusLabel(status)}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Meter: animated ring for a usage limit (green -> amber at 75 % -> red at 90 %)
// ---------------------------------------------------------------------------

export const Meter: React.FC<{ meter: UsageMeter; size?: number }> = ({ meter, size = 84 }) => {
  const Icon = entIcon(meter.key);
  const unlimited = meter.limit === null;
  const ratio = meter.ratio === null ? 0 : Math.min(1, meter.ratio);
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  // Blue while there is room, amber from 75 %, red from 90 %. Unlimited draws no arc at all:
  // a full green ring read as "at capacity".
  const color = ratio >= 0.9 ? "stroke-red-500" : ratio >= 0.75 ? "stroke-amber-500" : "stroke-brand-600 dark:stroke-brand-500";
  const reduced = useReducedMotion();
  const mb = meter.unit === "MB";
  const fmt = (v: number) => (mb ? formatMb(v) : v.toLocaleString());
  const unit = mb || !meter.unit ? "" : ` ${meter.unit}`;
  const text = unlimited ? `${fmt(meter.used)}${unit} · Unlimited` : `${fmt(meter.used)} of ${fmt(meter.limit!)}${unit}`;
  return (
    <div className="flex flex-col items-center gap-1.5" title={`${meter.label}: ${text}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={6} className="fill-none stroke-slate-100 dark:stroke-gray-800" />
          {!unlimited && meter.used > 0 && (
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              strokeWidth={6}
              strokeLinecap="round"
              className={cx("fill-none", color)}
              strokeDasharray={c}
              initial={{ strokeDashoffset: c }}
              animate={{ strokeDashoffset: c * (1 - Math.max(ratio, 0.02)) }}
              transition={{ duration: reduced ? 0 : 1, ease: "easeOut" }}
            />
          )}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon className="h-4 w-4 text-slate-500 dark:text-gray-400" aria-hidden />
          <span className="text-sm font-bold text-slate-900 dark:text-white">{mb ? fmt(meter.used) : <CountUp value={meter.used} />}</span>
        </span>
      </div>
      <span className="text-xs font-semibold text-slate-700 dark:text-gray-200">{meter.label}</span>
      <span className="-mt-1 text-xs tabular-nums text-slate-500 dark:text-gray-400">
        {unlimited ? "Unlimited" : `of ${fmt(meter.limit!)}`}
        {unit}
      </span>
      <span className="sr-only">
        {meter.label}: {fmt(meter.used)} of {unlimited ? "unlimited" : fmt(meter.limit!)}
      </span>
    </div>
  );
};

/** "49 MB", "1.2 GB", "250 GB": storage meters count megabytes. */
export const formatMb = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toLocaleString(undefined, { maximumFractionDigits: mb >= 10240 ? 0 : 1 })} GB` : `${Math.round(mb).toLocaleString()} MB`);

/**
 * One usage limit as a labelled bar. Blue while there is room, amber from 75 %, red from 90 %.
 * An unlimited limit draws no bar at all (a full bar read as "at capacity"), just the usage
 * and "Unlimited".
 */
export const MeterBar: React.FC<{ meter: UsageMeter; showLabel?: boolean }> = ({ meter, showLabel = false }) => {
  const ratio = meter.ratio === null ? 0 : Math.min(1, meter.ratio);
  const color = ratio >= 0.9 ? "bg-red-500" : ratio >= 0.75 ? "bg-amber-500" : "bg-brand-600 dark:bg-brand-500";
  const Icon = entIcon(meter.key);
  const mb = meter.unit === "MB";
  const fmt = (v: number) => (mb ? formatMb(v) : v.toLocaleString());
  const unlimited = meter.limit === null;
  const text = unlimited ? `${fmt(meter.used)} · Unlimited` : `${fmt(meter.used)} of ${fmt(meter.limit!)}`;
  return (
    <div className="flex items-center gap-2" title={`${meter.label}: ${text}`}>
      <Icon className="h-4 w-4 shrink-0 text-slate-500 dark:text-gray-400" aria-hidden />
      {showLabel && <span className="w-16 shrink-0 text-xs font-medium text-slate-600 dark:text-gray-300">{meter.label}</span>}
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800" role="meter" aria-label={meter.label} aria-valuemin={0} aria-valuemax={unlimited ? undefined : meter.limit!} aria-valuenow={meter.used} aria-valuetext={text}>
        {!unlimited && <motion.div className={cx("h-full rounded-full", color)} initial={{ width: 0 }} animate={{ width: `${Math.max(ratio * 100, meter.used > 0 ? 2 : 0)}%` }} transition={{ duration: 0.8 }} />}
      </div>
      <span className="w-28 shrink-0 text-right text-xs tabular-nums text-slate-600 dark:text-gray-300">
        {fmt(meter.used)}
        <span className="text-slate-400 dark:text-gray-500">{unlimited ? " · ∞" : ` / ${fmt(meter.limit!)}`}</span>
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// EntitlementIcons: a package's apps + features as an icon grid
// ---------------------------------------------------------------------------

export const EntitlementIcons: React.FC<{ entitlements: Entitlement[]; all?: Entitlement[]; size?: "sm" | "md" }> = ({ entitlements, all, size = "md" }) => {
  const held = new Set(entitlements.filter((e) => e.kind !== "LIMIT").map((e) => e.key));
  const rows = (all ?? entitlements).filter((e) => e.kind !== "LIMIT");
  const box = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  return (
    <ul className="flex flex-wrap gap-1.5">
      {rows.map((e, i) => {
        const Icon = entIcon(e.key);
        const on = held.has(e.key);
        return (
          <motion.li
            key={e.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            title={`${e.label}${on ? "" : " — not included"}`}
            className={cx(
              "relative flex items-center justify-center rounded-lg",
              box,
              on ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300" : "bg-slate-100 text-slate-400 dark:bg-gray-800 dark:text-gray-500",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {!on && <Lock className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-white p-px text-slate-500 dark:bg-gray-900" aria-hidden />}
            <span className="sr-only">
              {e.label} {on ? "included" : "not included"}
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
};

// ---------------------------------------------------------------------------
// PackageCard: selectable, lifts on hover, glows when chosen
// ---------------------------------------------------------------------------

export const PackageCard: React.FC<{
  pkg: PackageInfo;
  allEntitlements?: Entitlement[];
  cycle: "TERM" | "YEAR";
  selected?: boolean;
  recommended?: boolean;
  current?: boolean;
  onSelect?: () => void;
}> = ({ pkg, allEntitlements, cycle, selected, recommended, current, onSelect }) => {
  const a = accentOf(pkg.accent);
  const m = useMotion();
  const price = cycle === "YEAR" ? pkg.priceYear : pkg.priceTerm;
  const limits = pkg.entitlements.filter((e) => e.kind === "LIMIT" && ["limit.students", "limit.staff", "limit.storage_gb"].includes(e.key));
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      {...m("tap")}
      whileHover={{ y: -4 }}
      className={cx(
        "relative flex w-full flex-col gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition-shadow focus:outline-none focus-visible:ring-2 dark:bg-gray-900",
        selected ? cx("ring-2 shadow-lg", a.ring, "border-transparent") : "border-slate-200 hover:shadow-md dark:border-gray-700",
      )}
    >
      <div className={cx("absolute inset-x-0 top-0 h-1.5 rounded-t-2xl bg-gradient-to-r", a.grad)} aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <span className={cx("text-lg font-bold", a.text)}>{pkg.name}</span>
        <AnimatePresence>
          {selected && (
            <motion.span {...m("check")} className={cx("flex h-6 w-6 items-center justify-center rounded-full text-white", a.bg)}>
              <Check className="h-4 w-4" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {(recommended || current) && (
        <span className={cx("absolute -top-3 right-4 rounded-full px-2 py-0.5 text-[11px] font-bold text-white shadow", current ? "bg-slate-700" : a.bg)}>
          {current ? "Current" : "★ Best fit"}
        </span>
      )}
      <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
        {price === null ? <span className="text-base font-semibold text-slate-600 dark:text-gray-300">Price on approval</span> : formatMoney(price, pkg.currency)}
        {price !== null && <span className="ml-1 text-xs font-medium text-slate-600 dark:text-gray-300">/{cycle === "YEAR" ? "yr" : "term"}</span>}
      </div>
      <div className="flex gap-3">
        {limits.map((l) => {
          const Icon = entIcon(l.key);
          return (
            <span key={l.key} className="flex items-center gap-1 text-sm font-semibold text-slate-700 dark:text-gray-200" title={l.label}>
              <Icon className="h-4 w-4 text-slate-500 dark:text-gray-300" aria-hidden />
              {l.value === null ? "∞" : l.value.toLocaleString()}
              {l.key === "limit.storage_gb" ? "GB" : ""}
              <span className="sr-only">{l.label}</span>
            </span>
          );
        })}
      </div>
      <EntitlementIcons entitlements={pkg.entitlements} all={allEntitlements} size="sm" />
    </motion.button>
  );
};

// ---------------------------------------------------------------------------
// Timeline: events slide in, newest first
// ---------------------------------------------------------------------------

export const Timeline: React.FC<{ events: TimelineEvent[]; iconFor?: (e: TimelineEvent) => LucideIcon }> = ({ events, iconFor }) => {
  const m = useMotion();
  return (
    <ol className="relative space-y-3 border-l-2 border-slate-200 pl-5 dark:border-gray-700">
      <AnimatePresence initial={false}>
        {events.map((e) => {
          const Icon = iconFor?.(e);
          return (
            <motion.li key={e.id} layout {...m("reveal")} className="relative">
              <span className="absolute -left-[1.85rem] top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white ring-2 ring-slate-200 dark:bg-gray-900 dark:ring-gray-700">
                {Icon ? <Icon className="h-3.5 w-3.5 text-brand-600 dark:text-brand-200" /> : <span className="h-2 w-2 rounded-full bg-brand-500" />}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {e.to && <StatusPill status={e.to} />}
                <time className="text-xs text-slate-600 dark:text-gray-300" dateTime={e.at}>
                  {new Date(e.at).toLocaleString()}
                </time>
                {e.visibleToApplicant === false && <Lock className="h-3 w-3 text-slate-500" aria-label="Internal" />}
              </div>
              {e.message && <p className="mt-1 text-sm text-slate-700 dark:text-gray-200">{e.message}</p>}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
};

// ---------------------------------------------------------------------------
// ActionCard: an icon-led call to action that nudges until handled
// ---------------------------------------------------------------------------

export const ActionCard: React.FC<{
  icon: LucideIcon;
  title: string;
  tone?: "brand" | "amber" | "red" | "emerald" | "violet";
  children?: React.ReactNode;
  action?: React.ReactNode;
  pulse?: boolean;
}> = ({ icon: Icon, title, tone = "brand", children, action, pulse }) => {
  const m = useMotion();
  const reduced = useReducedMotion();
  const tones = {
    brand: "from-brand-500 to-blue-500",
    amber: "from-amber-400 to-orange-500",
    red: "from-red-500 to-rose-500",
    emerald: "from-emerald-500 to-teal-500",
    violet: "from-violet-500 to-fuchsia-500",
  };
  return (
    <motion.section {...m("reveal")} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-start gap-3 p-4">
        <motion.span
          className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow", tones[tone])}
          animate={pulse && !reduced ? { rotate: [0, -8, 8, -4, 0] } : undefined}
          transition={pulse ? { duration: 0.8, repeat: Infinity, repeatDelay: 3 } : undefined}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </motion.span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
          {children && <div className="mt-1 text-sm text-slate-600 dark:text-gray-300">{children}</div>}
        </div>
      </div>
      {action && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/50">{action}</div>}
    </motion.section>
  );
};

// ---------------------------------------------------------------------------
// KpiTile: icon + rolling number; clickable
// ---------------------------------------------------------------------------

export const KpiTile: React.FC<{ icon: LucideIcon; label: string; value: number; tone?: string; format?: (n: number) => string; onClick?: () => void; alert?: boolean }> = ({
  icon: Icon,
  label,
  value,
  tone = "text-brand-600 dark:text-brand-200",
  format,
  onClick,
  alert,
}) => {
  const m = useMotion();
  const Tag: any = onClick ? motion.button : motion.div;
  return (
    <Tag
      {...m("reveal")}
      {...(onClick ? { ...m("tap"), whileHover: { y: -3 }, onClick, type: "button" } : {})}
      className={cx(
        "relative flex w-full flex-col items-start gap-2 rounded-2xl border bg-white p-4 text-left transition-colors dark:bg-gray-900",
        alert && value > 0 ? "border-red-300 dark:border-red-500/50" : "border-slate-200 dark:border-gray-700",
      )}
    >
      <Icon className={cx("h-5 w-5", tone)} aria-hidden />
      <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
        <CountUp value={value} format={format} />
      </span>
      <span className="text-xs font-medium text-slate-600 dark:text-gray-300">{label}</span>
      {alert && value > 0 && <span className="absolute right-3 top-3 h-2.5 w-2.5 animate-ping rounded-full bg-red-500" aria-hidden />}
    </Tag>
  );
};

// ---------------------------------------------------------------------------
// DropZone: drag a file in; animated states
// ---------------------------------------------------------------------------

export const DropZone: React.FC<{
  accept?: string;
  label?: string;
  icon?: LucideIcon;
  busy?: boolean;
  done?: boolean;
  onFile: (f: File) => void;
  maxMb?: number;
}> = ({ accept = "image/*,application/pdf", label = "Drop a file or tap", icon: Icon = UploadCloud, busy, done, onFile, maxMb = 10 }) => {
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const m = useMotion();
  const take = (f?: File | null) => {
    if (!f) return;
    if (f.size > maxMb * 1024 * 1024) return setError(`Max ${maxMb} MB`);
    setError(null);
    onFile(f);
  };
  return (
    <motion.div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files?.[0]);
      }}
      animate={over ? { scale: 1.02 } : error ? m("shake").animate : { scale: 1 }}
      className={cx(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-5 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        over ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : done ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-400/10" : "border-slate-300 dark:border-gray-600",
      )}
    >
      <input ref={input} type="file" accept={accept} className="hidden" onChange={(e) => take(e.target.files?.[0])} />
      {busy ? (
        <Loader2 className="h-7 w-7 animate-spin text-brand-500" />
      ) : done ? (
        <motion.span {...m("check")}>
          <Check className="h-7 w-7 text-emerald-600" />
        </motion.span>
      ) : (
        <motion.span animate={over ? { y: -4 } : { y: 0 }}>
          <Icon className="h-7 w-7 text-slate-500 dark:text-gray-300" />
        </motion.span>
      )}
      <span className="text-sm font-medium text-slate-700 dark:text-gray-200">{label}</span>
      {error && (
        <span className="flex items-center gap-1 text-xs text-red-600">
          <X className="h-3 w-3" />
          {error}
        </span>
      )}
    </motion.div>
  );
};

// ---------------------------------------------------------------------------
// EmptyState and Burst (celebration)
// ---------------------------------------------------------------------------

export const EmptyState: React.FC<{ icon: LucideIcon; title: string; children?: React.ReactNode }> = ({ icon: Icon, title, children }) => {
  const reduced = useReducedMotion();
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <motion.span
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-300"
        animate={reduced ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <Icon className="h-8 w-8" aria-hidden />
      </motion.span>
      <p className="font-semibold text-slate-800 dark:text-gray-100">{title}</p>
      {children && <div className="text-sm text-slate-600 dark:text-gray-300">{children}</div>}
    </div>
  );
};

/** A short confetti burst (e.g. "Your school is live"). Renders nothing with reduced motion. */
export const Burst: React.FC<{ show: boolean }> = ({ show }) => {
  const reduced = useReducedMotion();
  if (!show || reduced) return null;
  const colors = ["bg-brand-500", "bg-emerald-500", "bg-amber-400", "bg-violet-500", "bg-rose-500"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: 28 }).map((_, i) => (
        <motion.span
          key={i}
          className={cx("absolute left-1/2 top-1/3 h-2 w-2 rounded-sm", colors[i % colors.length])}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: (Math.random() - 0.5) * 520, y: Math.random() * 360 - 60, opacity: 0, rotate: Math.random() * 540 }}
          transition={{ duration: 1.6 + Math.random(), ease: "easeOut" }}
        />
      ))}
    </div>
  );
};

/** Segmented toggle (billing cycle, filters). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string; icon?: LucideIcon }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="relative inline-flex rounded-full bg-slate-100 p-1 dark:bg-gray-800">
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx("relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors", on ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-gray-300")}
          >
            {on && <motion.span layoutId={`seg-${label}`} className="absolute inset-0 -z-10 rounded-full bg-white shadow dark:bg-gray-700" transition={{ type: "spring", stiffness: 500, damping: 35 }} />}
            {Icon && <Icon className="h-4 w-4" aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
