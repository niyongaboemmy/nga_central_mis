/**
 * Small form pieces shared by the register wizard and the applicant tracker:
 * labelled fields that shake on error, steppers, live-check ticks, a 429
 * countdown and the resend ring. Motion goes through design/motion.ts.
 */
import React, { useEffect, useId, useState } from "react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Hourglass, Loader2, Minus, Plus, X, type LucideIcon } from "lucide-react";
import { useMotion } from "../../../design/motion";

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

export const inputCls = (error?: string | null) =>
  cx(
    "w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 transition-colors",
    "focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400",
    error ? "border-red-500 dark:border-red-400" : "border-slate-300 dark:border-slate-600",
  );

export const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-900";
export const ghostBtn =
  "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800";
export const iconBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-300 dark:hover:bg-slate-800";

/** Debounced copy of a value. */
export function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Shake an element every time `error` turns on (or changes). */
export const Shake: React.FC<{ error?: string | null; className?: string; children: React.ReactNode }> = ({ error, className, children }) => {
  const controls = useAnimationControls();
  const reduced = useReducedMotion();
  useEffect(() => {
    if (error && !reduced) void controls.start({ x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.3 } });
  }, [error, reduced, controls]);
  return (
    <motion.div animate={controls} className={className}>
      {children}
    </motion.div>
  );
};

export const ErrorLine: React.FC<{ id?: string; error?: string | null }> = ({ id, error }) => {
  const m = useMotion();
  return (
    <AnimatePresence>
      {error && (
        <motion.p id={id} role="alert" {...m("reveal")} className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </motion.p>
      )}
    </AnimatePresence>
  );
};

/** Label + control + animated error. The render prop gets the ids to wire. */
export const Field: React.FC<{
  label: string;
  icon?: LucideIcon;
  error?: string | null;
  optional?: boolean;
  className?: string;
  trailing?: React.ReactNode;
  children: (ids: { id: string; errorId: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
}> = ({ label, icon: Icon, error, optional, className, trailing, children }) => {
  const id = useId();
  const errorId = `${id}-err`;
  return (
    <Shake error={error} className={className}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
          {Icon && <Icon className="h-4 w-4 text-slate-500 dark:text-slate-300" aria-hidden />}
          {label}
          {optional && <span className="text-xs font-normal text-slate-600 dark:text-slate-300">(optional)</span>}
        </label>
        {trailing}
      </div>
      {children({ id, errorId, describedBy: error ? errorId : undefined, invalid: !!error })}
      <ErrorLine id={errorId} error={error} />
    </Shake>
  );
};

/** − value + ; arrow keys on the input work too. */
export const NumberStepper: React.FC<{
  id?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  step: number;
  min?: number;
  max?: number;
  label: string;
}> = ({ id, value, onChange, step, min = 0, max = 100000, label }) => {
  const m = useMotion();
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const btn =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800";
  return (
    <div className="flex items-center gap-2">
      <motion.button type="button" {...m("tap")} className={btn} onClick={() => onChange(clamp((value ?? 0) - step))}>
        <Minus className="h-4 w-4" aria-hidden />
        <span className="sr-only">Less {label}</span>
      </motion.button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : clamp(Number(e.target.value)))}
        className={cx(inputCls(), "min-w-0 text-center font-semibold tabular-nums")}
      />
      <motion.button type="button" {...m("tap")} className={btn} onClick={() => onChange(clamp((value ?? 0) + step))}>
        <Plus className="h-4 w-4" aria-hidden />
        <span className="sr-only">More {label}</span>
      </motion.button>
    </div>
  );
};

export type CheckState = "idle" | "checking" | "ok" | "bad";

/** Spinner -> animated tick / cross. `label` is read by screen readers. */
export const LiveCheck: React.FC<{ state: CheckState; label: string }> = ({ state, label }) => {
  const m = useMotion();
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        {state === "checking" && (
          <motion.span key="c" {...m("fade")}>
            <Loader2 className="h-4 w-4 animate-spin text-slate-500 dark:text-slate-300" aria-hidden />
          </motion.span>
        )}
        {state === "ok" && (
          <motion.span key="ok" {...m("check")} className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="h-4 w-4" aria-hidden />
          </motion.span>
        )}
        {state === "bad" && (
          <motion.span key="bad" {...m("check")} className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white">
            <X className="h-4 w-4" aria-hidden />
          </motion.span>
        )}
      </AnimatePresence>
      <span className="sr-only">{state === "idle" ? "" : label}</span>
    </span>
  );
};

/** Seconds left, ticking down to 0. Restart by changing `seconds` or `nonce`. */
export const useCountdown = (seconds: number, nonce: unknown = null) => {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    if (seconds <= 0) return;
    const t = window.setInterval(() => setLeft((l) => (l <= 1 ? (window.clearInterval(t), 0) : l - 1)), 1000);
    return () => window.clearInterval(t);
  }, [seconds, nonce]);
  return left;
};

/** A ring that empties while `left` counts down from `total`. */
export const CountdownRing: React.FC<{ left: number; total: number; size?: number }> = ({ left, total, size = 22 }) => {
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  const ratio = total > 0 ? left / total : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={3} className="stroke-slate-200 dark:stroke-slate-700" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - ratio)}
        className="stroke-brand-500 transition-[stroke-dashoffset] duration-1000 ease-linear"
      />
    </svg>
  );
};

/** 429: a friendly countdown instead of an error. Calls onDone at 0. */
export const RateLimitNotice: React.FC<{ seconds: number; nonce?: unknown; onDone?: () => void }> = ({ seconds, nonce, onDone }) => {
  const left = useCountdown(seconds, nonce);
  const m = useMotion();
  useEffect(() => {
    if (left === 0) onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);
  if (left <= 0) return null;
  return (
    <motion.div {...m("reveal")} role="status" className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
      <Hourglass className="h-4 w-4 shrink-0" aria-hidden />
      <span>Too many tries · wait</span>
      <CountdownRing left={left} total={seconds} />
      <span className="tabular-nums">{left}s</span>
    </motion.div>
  );
};

/** Back / primary row at the bottom of a wizard step (primary = form submit). */
export const StepFooter: React.FC<{ onBack?: () => void; primary: string; busy?: boolean; disabled?: boolean; primaryIcon?: LucideIcon }> = ({
  onBack,
  primary,
  busy,
  disabled,
  primaryIcon: PIcon = ArrowRight,
}) => {
  const m = useMotion();
  return (
    <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
      {onBack ? (
        <button type="button" onClick={onBack} className={ghostBtn}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </button>
      ) : (
        <span />
      )}
      <motion.button type="submit" {...m("tap")} disabled={busy || disabled} className={primaryBtn}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {primary}
        {!busy && <PIcon className="h-4 w-4" aria-hidden />}
      </motion.button>
    </div>
  );
};

/** A centred error banner (non-field errors). */
export const FormError: React.FC<{ error?: string | null; children?: React.ReactNode }> = ({ error, children }) => (
  <Shake error={error}>
    <ErrorLine error={error} />
    {error && children}
  </Shake>
);
