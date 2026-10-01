import React, { useEffect, useId, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  Heading as HeadingIcon,
  HelpCircle,
  Lock,
  MessageSquare,
  Paperclip,
  PlayCircle,
  Layers,
  Ticket,
  Hammer,
  type LucideIcon,
} from "lucide-react";
import type { CourseItemType, ProgressState } from "../../../api/elearning";
import { useMotion, useReducedMotionPref } from "../../../design/motion";
import Mascot, { MascotPose } from "./Mascot";
import SubjectIcon from "./subjectIcons";

// ---------------------------------------------------------------- ProgressRing

interface RingProps {
  value: number; // 0..100
  size?: number;
  stroke?: number;
  label?: React.ReactNode;
  color?: string; // CSS colour for the arc; defaults to brand
  className?: string;
  ariaLabel?: string;
  /** Keep printing the number at 100% instead of the completion tick. */
  alwaysShowValue?: boolean;
}

/**
 * Fits the readout to the hole in the middle of the ring.
 *
 * The label used to be a fixed 11px whatever the ring's size, so "100%" — the widest
 * string it can ever show — spanned almost the whole 36px interior of a 44px ring and read
 * as off-centre and cramped. Everything here is derived from the usable inner diameter
 * instead, and the widest cases degrade in order: full size → smaller → drop the per-cent
 * sign → a tick.
 */
const fitRingLabel = (innerDiameter: number, digits: number, complete: boolean) => {
  const fontSize = Math.round(Math.max(9, Math.min(18, innerDiameter * 0.32)));
  // Semibold tabular digits run ~0.58em wide; the per-cent glyph ~0.72em of its own size.
  const pctSize = Math.round(fontSize * 0.66);
  const budget = innerDiameter * 0.94;
  const withPct = digits * fontSize * 0.58 + pctSize * 0.72;
  if (withPct <= budget) return { fontSize, pctSize, showPct: true, tick: false };
  const bare = digits * fontSize * 0.58;
  if (bare <= budget) return { fontSize, pctSize, showPct: false, tick: false };
  // Nothing legible fits: a finished ring says so with a tick, an unfinished one shrinks.
  if (complete) return { fontSize, pctSize, showPct: false, tick: true };
  const small = Math.max(8, Math.floor(budget / (digits * 0.58)));
  return { fontSize: small, pctSize: Math.round(small * 0.66), showPct: false, tick: false };
};

/**
 * SVG ring that animates from its previous value, never from 0 on re-render (UX plan `fill`).
 *
 * The arc is a gradient from the given colour into a lighter tint of itself, which reads as
 * a lit arc rather than a flat band, and a completed ring gains a soft halo — the one state
 * worth celebrating on a page full of rings.
 */
export const ProgressRing: React.FC<RingProps> = ({
  value,
  size = 56,
  stroke = 6,
  label,
  color,
  className = "",
  ariaLabel,
  alwaysShowValue,
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const reduced = useReducedMotionPref();
  const gradientId = useId();
  const arc = color || "#3b6cff";
  const complete = clamped === 100;
  const inner = size - stroke * 2;
  const fit = fitRingLabel(inner, String(clamped).length, complete);
  // Below roughly a 44px interior, "100%" is technically legible but busy — a finished
  // ring reads better as a tick. Larger rings keep the number.
  const showTick = complete && !alwaysShowValue && (fit.tick || inner < 44);

  return (
    <div
      className={`relative inline-flex items-center justify-center flex-shrink-0 ${className}`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel || `${clamped}% complete`}
      style={{ width: size, height: size }}
    >
      {complete && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{ boxShadow: `0 0 0 ${Math.max(2, stroke * 0.6)}px ${arc}1f` }}
        />
      )}
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={arc} />
            <stop offset="100%" stopColor={arc} stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          className="fill-none stroke-gray-200/90 dark:stroke-white/[0.10]"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          className="fill-none"
          style={{ stroke: `url(#${gradientId})` }}
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c - (c * clamped) / 100 }}
          transition={{ duration: reduced ? 0.12 : 0.45, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {label ?? (
          showTick ? (
            <Check
              className="text-success-600 dark:text-success-500"
              style={{ width: inner * 0.55, height: inner * 0.55 }}
              strokeWidth={3}
              aria-hidden
            />
          ) : (
            // baseline alignment, not a raised per-cent sign: a full-size "%" drags the
            // numerals off the optical centre, which is what made this look misaligned.
            <span
              className="inline-flex items-baseline font-semibold tabular-nums leading-none text-gray-700 dark:text-gray-200"
              style={{ fontSize: fit.fontSize }}
            >
              {clamped}
              {fit.showPct && (
                <span style={{ fontSize: fit.pctSize }} className="ml-[0.5px] opacity-70">
                  %
                </span>
              )}
            </span>
          )
        )}
      </div>
    </div>
  );
};

export const ProgressBar: React.FC<{ value: number; className?: string; color?: string; ariaLabel?: string }> = ({
  value,
  className = "",
  color,
  ariaLabel,
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const reduced = useReducedMotionPref();
  return (
    <div
      className={`h-2 rounded-pill bg-gray-200 dark:bg-white/[0.10] overflow-hidden ${className}`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel || `${clamped}% complete`}
    >
      <motion.div
        className="h-full rounded-pill"
        style={{ background: color || "#3b6cff" }}
        initial={false}
        animate={{ width: `${clamped}%` }}
        transition={{ duration: reduced ? 0.12 : 0.4, ease: "easeOut" }}
      />
    </div>
  );
};

// ---------------------------------------------------------------- CompletionDot

export const CompletionDot: React.FC<{ state: ProgressState; locked?: boolean; size?: number; className?: string }> = ({
  state,
  locked,
  size = 18,
  className = "",
}) => {
  const m = useMotion();
  const label = locked ? "Locked" : state === "COMPLETED" ? "Done" : state === "IN_PROGRESS" ? "In progress" : "Not started";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-label={label}
      title={label}
    >
      {locked ? (
        <Lock className="text-gray-400" style={{ width: size * 0.7, height: size * 0.7 }} />
      ) : state === "COMPLETED" ? (
        <motion.span
          key="done"
          {...m("check")}
          className="flex items-center justify-center rounded-full bg-success-500 text-white"
          style={{ width: size, height: size }}
        >
          <Check strokeWidth={3} style={{ width: size * 0.6, height: size * 0.6 }} />
        </motion.span>
      ) : state === "IN_PROGRESS" ? (
        <span
          className="rounded-full border-2 border-brand-500"
          style={{ width: size, height: size, background: "linear-gradient(90deg, #3b6cff 50%, transparent 50%)" }}
        />
      ) : (
        <span className="rounded-full border-2 border-gray-300 dark:border-white/20" style={{ width: size, height: size }} />
      )}
    </span>
  );
};

// ---------------------------------------------------------------- Item type icon

export const ITEM_TYPE_ICON: Record<CourseItemType, LucideIcon> = {
  HEADER: HeadingIcon,
  LESSON_NOTE: BookOpen,
  SUBJECT_DOCUMENT: Paperclip,
  PAGE: FileText,
  VIDEO: PlayCircle,
  LINK: ExternalLink,
  TASKMENTOR_QUIZ: ClipboardList,
  TASKMENTOR_ASSIGNMENT: ClipboardList,
  KNOWLEDGE_CHECK: HelpCircle,
  DISCUSSION: MessageSquare,
  FILE: Paperclip,
  FLASHCARDS: Layers,
  EXIT_TICKET: Ticket,
  PRACTICAL_TASK: Hammer,
};

export const ItemTypeIcon: React.FC<{ type: CourseItemType; className?: string }> = ({ type, className = "w-4 h-4" }) => {
  const Icon = ITEM_TYPE_ICON[type] || FileText;
  return <Icon className={className} aria-hidden />;
};

// ---------------------------------------------------------------- WeekPill

export const WeekPill: React.FC<{
  weekNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  current?: boolean;
  className?: string;
}> = ({ weekNumber, startDate, endDate, current, className = "" }) => {
  const fmt = (d: string | null) =>
    d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
  const range = startDate ? `${fmt(startDate)}${endDate ? ` – ${fmt(endDate)}` : ""}` : null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[11px] font-semibold whitespace-nowrap ${
        current ? "bg-brand-500 text-white shadow-glow" : "el-chip"
      } ${className}`}
    >
      {weekNumber || "Week"}
      {range && <span className={`hidden sm:inline font-normal ${current ? "text-white/80" : "text-gray-400"}`}>· {range}</span>}
      {current && <span className="sr-only">(this week)</span>}
    </span>
  );
};

// ---------------------------------------------------------------- SubjectCover

/** Colour-tinted header. Subject colour tinted with color-mix so it works on both themes. */
export const SubjectCover: React.FC<{
  name: string;
  code?: string | null;
  color?: string | null;
  icon?: string | null;
  size?: "sm" | "md" | "lg";
  children?: React.ReactNode;
  className?: string;
}> = ({ name, code, color, icon, size = "md", children, className = "" }) => {
  const base = color || "#3b6cff";
  const pad = size === "lg" ? "p-5" : size === "sm" ? "p-3" : "p-4";
  const tile = size === "lg" ? "w-14 h-14" : size === "sm" ? "w-8 h-8" : "w-11 h-11";
  const glyph = size === "lg" ? "w-7 h-7" : size === "sm" ? "w-4 h-4" : "w-5 h-5";
  return (
    <div
      className={`rounded-2xl ${pad} ${className}`}
      style={{
        background: `linear-gradient(135deg, color-mix(in oklab, ${base} 16%, transparent), color-mix(in oklab, ${base} 4%, transparent))`,
        borderColor: `color-mix(in oklab, ${base} 18%, transparent)`,
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex items-center justify-center rounded-xl ${tile} flex-shrink-0`}
          style={{
            background: `color-mix(in oklab, ${base} 24%, transparent)`,
            boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${base} 30%, transparent)`,
            color: base,
          }}
          aria-hidden
        >
          <SubjectIcon subjectName={name} icon={icon} className={glyph} />
        </span>
        <div className="min-w-0 flex-1">
          {code && (
            <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md mb-1" style={{ background: base, color: "#fff" }}>
              {code}
            </span>
          )}
          {children}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- EmptyState

export const EmptyState: React.FC<{
  pose?: MascotPose;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}> = ({ pose = "sleepy", title, body, action, className = "" }) => (
  <div className={`flex flex-col items-center text-center py-12 px-6 ${className}`}>
    <Mascot pose={pose} size={72} />
    <h3 className="mt-4 text-base font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
    {body && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm">{body}</p>}
    {action && (
      <button
        onClick={action.onClick}
        className="mt-5 min-h-[44px] px-5 rounded-pill bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-soft focus:outline-none focus-visible:shadow-glow"
      >
        {action.label}
      </button>
    )}
  </div>
);

// ---------------------------------------------------------------- Skeleton

export const Skeleton: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`relative overflow-hidden rounded-xl bg-gray-200/70 dark:bg-white/[0.06] ${className}`} aria-hidden>
    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent" />
  </div>
);

// ---------------------------------------------------------------- Celebration

/** Confetti burst ≤ 600 ms, max once per event; pure CSS/motion, no dependency; off under reduced motion. */
export const Celebration: React.FC<{ show: boolean; onDone?: () => void }> = ({ show, onDone }) => {
  const reduced = useReducedMotionPref();
  const [pieces, setPieces] = useState<{ id: number; x: number; y: number; r: number; c: string; d: number }[]>([]);
  useEffect(() => {
    if (!show || reduced) {
      if (show && reduced) onDone?.();
      return;
    }
    const colours = ["#3b6cff", "#ff8a3d", "#22c55e", "#f59e0b", "#ef4444", "#a855f7"];
    setPieces(
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 420,
        y: -120 - Math.random() * 220,
        r: Math.random() * 720 - 360,
        c: colours[i % colours.length],
        d: 0.45 + Math.random() * 0.15,
      })),
    );
    const t = setTimeout(() => {
      setPieces([]);
      onDone?.();
    }, 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, reduced]);
  if (pieces.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute w-2.5 h-2.5 rounded-sm"
          style={{ background: p.c }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
          animate={{ x: p.x, y: p.y + 260, opacity: 0, rotate: p.r, scale: 0.6 }}
          transition={{ duration: p.d, ease: "easeOut" }}
        />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------- BottomActionBar

export const BottomActionBar: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => {
  // Hides on scroll-down, shows on scroll-up (thumb-zone chrome that gets out of the way).
  const [hidden, setHidden] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setHidden(y > last.current + 8 && y > 80);
      if (Math.abs(y - last.current) > 8) last.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <AnimatePresence>
      {!hidden && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-2 py-2 rounded-pill el-float print:hidden ${className}`}
          role="toolbar"
          aria-label="Item actions"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const DoneBadge: React.FC<{ className?: string }> = ({ className = "" }) => (
  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold text-success-700 dark:text-success-500 ${className}`}>
    <CheckCircle2 className="w-3.5 h-3.5" /> Done
  </span>
);
