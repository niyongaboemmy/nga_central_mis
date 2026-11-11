/**
 * Small pieces shared by InvoiceCard, PaymentProofForm and the school's account
 * pages: payment-method icons, a countdown ring and a one-tap copy button.
 */
import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Banknote, Check, Copy, Landmark, Smartphone, Wallet, type LucideIcon } from "lucide-react";
import type { PaymentMethod } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

export const ALL_METHODS: PaymentMethod[] = ["MOMO", "AIRTEL_MONEY", "BANK_TRANSFER", "CASH", "OTHER"];

export const METHOD_INFO: Record<PaymentMethod, { icon: LucideIcon; label: string; tone: string }> = {
  MOMO: { icon: Smartphone, label: "MoMo", tone: "bg-yellow-100 text-yellow-800 dark:bg-yellow-400/15 dark:text-yellow-200" },
  AIRTEL_MONEY: { icon: Smartphone, label: "Airtel", tone: "bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-200" },
  BANK_TRANSFER: { icon: Landmark, label: "Bank", tone: "bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200" },
  CASH: { icon: Banknote, label: "Cash", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200" },
  OTHER: { icon: Wallet, label: "Other", tone: "bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200" },
};

const DAY = 86_400_000;

/** Whole days from now until `iso` (negative once past). */
export const daysUntil = (iso: string | null | undefined, now = Date.now()): number | null =>
  iso ? Math.ceil((new Date(iso).getTime() - now) / DAY) : null;

export const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

/**
 * A ring that empties as a deadline approaches. `left` and `total` share a unit
 * (days or hours); red once `left` is 0 or below, amber in the last fifth.
 */
export const CountdownRing: React.FC<{
  left: number;
  total: number;
  unit?: string;
  size?: number;
  label: string;
  /** shown in the middle instead of `left` */
  center?: React.ReactNode;
  /** "progress": a filling ring (done / total), never red */
  mode?: "countdown" | "progress";
}> = ({ left, total, unit = "d", size = 64, label, center, mode = "countdown" }) => {
  const reduced = useReducedMotion();
  const ratio = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const overdue = mode === "countdown" && left <= 0;
  const color =
    mode === "progress" ? (ratio >= 1 ? "stroke-emerald-500" : "stroke-brand-500") : overdue ? "stroke-red-500" : ratio <= 0.2 ? "stroke-amber-500" : "stroke-emerald-500";
  const text = overdue ? "text-red-600 dark:text-red-300" : "text-slate-900 dark:text-white";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label} data-overdue={overdue || undefined}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={6} className="fill-none stroke-slate-200 dark:stroke-slate-700" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={6}
          strokeLinecap="round"
          className={cx("fill-none", color)}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: overdue ? 0 : c * (1 - ratio) }}
          data-ratio={ratio}
          transition={{ duration: reduced ? 0 : 0.9, ease: "easeOut" }}
        />
      </svg>
      <span className={cx("absolute inset-0 flex flex-col items-center justify-center leading-none", text)} aria-hidden>
        {center ?? (
          <>
            <span className="text-base font-extrabold tabular-nums">{Math.abs(left)}</span>
            <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">{overdue && left < 0 ? `${unit} late` : unit}</span>
          </>
        )}
      </span>
    </div>
  );
};

async function writeClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand?.("copy") ?? false;
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Icon button: copies `text`, then shows an animated tick for 1.6 s. */
export const CopyButton: React.FC<{ text: string; label: string; className?: string }> = ({ text, label, className }) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>();
  const m = useMotion();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <motion.button
      type="button"
      {...m("tap")}
      onClick={async (e) => {
        e.stopPropagation();
        if (await writeClipboard(text)) {
          setCopied(true);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setCopied(false), 1600);
        }
      }}
      className={cx(
        "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        copied ? "bg-emerald-500 text-white" : "bg-white/70 text-slate-700 hover:bg-white dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span key="ok" {...m("check")} className="inline-flex items-center gap-1">
            <Check className="h-4 w-4" aria-hidden />
            <span>Copied</span>
          </motion.span>
        ) : (
          <motion.span key="copy" {...m("fade")} className="inline-flex">
            <Copy className="h-4 w-4" aria-hidden />
            <span className="sr-only">{label}</span>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
};

/** Spinner-free primary button style used across the account screens. */
export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500",
};

export const card = "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";
