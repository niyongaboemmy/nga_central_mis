import React, { useEffect, useRef, useState } from "react";
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
  type LucideIcon,
} from "lucide-react";
import type { CourseItemType, ProgressState } from "../../../api/elearning";
import { useMotion, useReducedMotionPref } from "../../../design/motion";
import Mascot, { MascotPose } from "./Mascot";

// ---------------------------------------------------------------- ProgressRing

interface RingProps {
  value: number; // 0..100
  size?: number;
  stroke?: number;
  label?: React.ReactNode;
  color?: string; // CSS colour for the arc; defaults to brand
  className?: string;
  ariaLabel?: string;
}

/** SVG ring that animates from its previous value, never from 0 on re-render (UX plan `fill`). */
export const ProgressRing: React.FC<RingProps> = ({ value, size = 56, stroke = 6, label, color, className = "", ariaLabel }) => {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const reduced = useReducedMotionPref();
  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel || `${clamped}% complete`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-gray-200 dark:stroke-gray-800" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          className="fill-none"
          style={{ stroke: color || "#3b6cff" }}
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c - (c * clamped) / 100 }}
          transition={{ duration: reduced ? 0.12 : 0.4, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-gray-700 dark:text-gray-200 tabular-nums">
        {label ?? `${clamped}%`}
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
      className={`h-2 rounded-pill bg-gray-200 dark:bg-gray-700 overflow-hidden ${className}`}
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
        <span className="rounded-full border-2 border-gray-300 dark:border-gray-600" style={{ width: size, height: size }} />
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

const CATEGORY_ICON: [RegExp, string][] = [
  [/ict|comput|software|web|program|coding|network|data/i, "🖥️"],
  [/math|calcul|algebra|statis/i, "📐"],
  [/physic|chem|bio|science/i, "🔬"],
  [/english|french|kinyarwanda|language|literature|communication/i, "📝"],
  [/entrepreneur|business|account|finance|economic/i, "💼"],
  [/art|design|music|draw/i, "🎨"],
  [/sport|physical|health/i, "⚽"],
  [/history|geograph|civic|social/i, "🌍"],
  [/electr|mechan|engineer|construct|build|weld|plumb/i, "🔧"],
  [/agri|farm|food|hotel|culin|tour/i, "🌱"],
];

export const iconForSubject = (name: string, override?: string | null) => {
  if (override) return override;
  const hit = CATEGORY_ICON.find(([re]) => re.test(name));
  return hit ? hit[1] : "📘";
};

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
  const iconSize = size === "lg" ? "text-4xl w-14 h-14" : size === "sm" ? "text-lg w-8 h-8" : "text-2xl w-11 h-11";
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
          className={`flex items-center justify-center rounded-xl ${iconSize} flex-shrink-0`}
          style={{ background: `color-mix(in oklab, ${base} 24%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${base} 30%, transparent)` }}
          aria-hidden
        >
          {iconForSubject(name, icon)}
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
  <div className={`relative overflow-hidden rounded-xl bg-gray-200/70 dark:bg-gray-800 ${className}`} aria-hidden>
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
