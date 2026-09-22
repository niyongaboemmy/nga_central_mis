import React from "react";
import { motion } from "framer-motion";
import { useReducedMotionPref } from "../../../design/motion";

export type MascotPose = "hello" | "thinking" | "cheering" | "sleepy" | "nudge" | "book";

interface Props {
  pose?: MascotPose;
  size?: number;
  className?: string;
  /** Short line the mascot says (≤ 12 words — UX plan §5). */
  says?: string;
}

/**
 * "Umuhoza" — a small, friendly inline-SVG owl (works at 24 px, both themes, ≤ 3 KB).
 * Appears in empty states, celebrations and the AI tutor; never blocks content.
 */
const Mascot: React.FC<Props> = ({ pose = "hello", size = 64, className = "", says }) => {
  const reduced = useReducedMotionPref();
  const eyesClosed = pose === "sleepy";
  const wingUp = pose === "cheering" || pose === "hello";
  const bob = !reduced && (pose === "cheering" ? { y: [0, -6, 0] } : pose === "nudge" ? { rotate: [0, -6, 6, 0] } : { y: [0, -2, 0] });

  return (
    <div className={`inline-flex flex-col items-center gap-2 ${className}`} role="img" aria-label={`Umuhoza the owl, ${pose}`}>
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        animate={bob || undefined}
        transition={{ duration: pose === "cheering" ? 0.6 : 2.4, repeat: pose === "cheering" ? 2 : Infinity, ease: "easeInOut" }}
      >
        {/* body */}
        <ellipse cx="32" cy="38" rx="20" ry="22" className="fill-accent-500" />
        <ellipse cx="32" cy="42" rx="13" ry="14" className="fill-accent-100" />
        {/* ear tufts */}
        <path d="M16 20 L21 8 L27 20 Z" className="fill-accent-600" />
        <path d="M48 20 L43 8 L37 20 Z" className="fill-accent-600" />
        {/* eyes */}
        <circle cx="24" cy="30" r="7" fill="#fff" />
        <circle cx="40" cy="30" r="7" fill="#fff" />
        {eyesClosed ? (
          <>
            <path d="M19 31 q5 3 10 0" stroke="#1e293b" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M35 31 q5 3 10 0" stroke="#1e293b" strokeWidth="2" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx={pose === "thinking" ? 26 : 24} cy={pose === "thinking" ? 28 : 30} r="3.2" fill="#1e293b" />
            <circle cx={pose === "thinking" ? 42 : 40} cy={pose === "thinking" ? 28 : 30} r="3.2" fill="#1e293b" />
            <circle cx={pose === "thinking" ? 27 : 25} cy={pose === "thinking" ? 27 : 29} r="1" fill="#fff" />
            <circle cx={pose === "thinking" ? 43 : 41} cy={pose === "thinking" ? 27 : 29} r="1" fill="#fff" />
          </>
        )}
        {/* beak */}
        <path d="M32 34 L28.5 39 L35.5 39 Z" fill="#b45309" />
        {/* wings */}
        <motion.path
          d={wingUp ? "M12 34 q-8 -10 2 -16 q6 6 4 16 Z" : "M12 38 q-6 8 2 16 q6 -6 4 -16 Z"}
          className="fill-accent-600"
          animate={pose === "hello" && !reduced ? { rotate: [0, -12, 0] } : undefined}
          transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1.5 }}
          style={{ transformOrigin: "14px 36px" }}
        />
        <path d={wingUp && pose === "cheering" ? "M52 34 q8 -10 -2 -16 q-6 6 -4 16 Z" : "M52 38 q6 8 -2 16 q-6 -6 -4 -16 Z"} className="fill-accent-600" />
        {/* feet */}
        <path d="M26 59 l-3 3 M26 59 l0 4 M26 59 l3 3" stroke="#b45309" strokeWidth="2" strokeLinecap="round" />
        <path d="M38 59 l-3 3 M38 59 l0 4 M38 59 l3 3" stroke="#b45309" strokeWidth="2" strokeLinecap="round" />
        {/* props */}
        {pose === "book" && <rect x="36" y="44" width="16" height="12" rx="2" className="fill-brand-500" />}
        {pose === "thinking" && (
          <>
            <circle cx="52" cy="14" r="2" className="fill-brand-200" />
            <circle cx="56" cy="8" r="3" className="fill-brand-200" />
          </>
        )}
      </motion.svg>
      {says && (
        <p className="text-sm text-center text-gray-700 dark:text-gray-200 max-w-xs leading-snug" aria-live="polite">
          {says}
        </p>
      )}
    </div>
  );
};

export default Mascot;
