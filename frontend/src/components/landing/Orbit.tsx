import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AmashuriMark } from "../brand/AmashuriLogo";
import { APPS, ALL_FEATURES } from "./content";

/**
 * Hero visual: the mark in the middle, the four apps on the inner ring and
 * their features on the outer one, turning in opposite directions. Nodes
 * counter-rotate so their icons stay upright.
 */

const Ring: React.FC<{
  radius: number; // % of the box
  duration: number;
  reverse?: boolean;
  children: React.ReactNode[];
}> = ({ radius, duration, reverse, children }) => {
  const reduced = useReducedMotion();
  const turn = reverse ? -360 : 360;
  return (
    <motion.div
      className="absolute inset-0"
      animate={reduced ? undefined : { rotate: turn }}
      transition={{ repeat: Infinity, ease: "linear", duration }}
    >
      <div
        className="absolute rounded-full border border-[var(--lp-hair)]"
        style={{ inset: `${50 - radius}%` }}
        aria-hidden
      />
      {children.map((child, i) => {
        const angle = (i / children.length) * Math.PI * 2 - Math.PI / 2;
        return (
          <div
            key={i}
            className="absolute"
            style={{ left: `${50 + radius * Math.cos(angle)}%`, top: `${50 + radius * Math.sin(angle)}%`, transform: "translate(-50%, -50%)" }}
          >
            <motion.div animate={reduced ? undefined : { rotate: -turn }} transition={{ repeat: Infinity, ease: "linear", duration }}>
              {child}
            </motion.div>
          </div>
        );
      })}
    </motion.div>
  );
};

const OUTER = ALL_FEATURES.filter((_, i) => i % 3 === 0).slice(0, 10);

const Orbit: React.FC = () => {
  const reduced = useReducedMotion();
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[min(480px,78vw)]" aria-hidden>
      {/* soft light behind the mark */}
      <div className="absolute inset-[30%] rounded-full bg-[var(--lp-blue)]/15 blur-3xl" />
      <Ring radius={47} duration={120} reverse>
        {OUTER.map(({ icon: Icon, label }) => (
          <span
            key={label}
            title={label}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--lp-card)] text-[var(--lp-text)] shadow-[0_4px_14px_rgba(0,0,0,0.08)] ring-1 ring-[var(--lp-hair)] sm:h-11 sm:w-11"
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
        ))}
      </Ring>
      <Ring radius={31} duration={70}>
        {APPS.map(({ key, icon: Icon, grad, name }) => (
          <span key={key} className="flex flex-col items-center gap-1">
            <span className={`flex h-12 w-12 items-center justify-center rounded-[16px] bg-gradient-to-br ${grad} text-white shadow-[0_8px_24px_rgba(0,113,227,0.25)] sm:h-14 sm:w-14 sm:rounded-[18px]`}>
              <Icon className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <span className="whitespace-nowrap text-[11px] font-medium text-[var(--lp-muted)] sm:text-xs">
              {name}
            </span>
          </span>
        ))}
      </Ring>
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          initial={reduced ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1, ease: [0.25, 0.1, 0.25, 1] }}
          className="rounded-[2rem] shadow-[0_24px_60px_rgba(0,113,227,0.35)]"
        >
          <AmashuriMark size={112} animated live />
        </motion.div>
      </div>
    </div>
  );
};

export default Orbit;
