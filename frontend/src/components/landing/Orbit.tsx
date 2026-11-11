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
        className="absolute rounded-full border border-dashed border-slate-300/70 dark:border-white/10"
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
    <div className="relative mx-auto aspect-square w-full max-w-[min(480px,88vw)]" aria-hidden>
      {/* glow */}
      <motion.div
        className="absolute inset-[22%] rounded-full bg-gradient-to-br from-brand-500/40 via-indigo-500/30 to-amber-400/30 blur-3xl"
        animate={reduced ? undefined : { scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
      />
      <Ring radius={47} duration={90} reverse>
        {OUTER.map(({ icon: Icon, label }) => (
          <span
            key={label}
            title={label}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-300 sm:h-10 sm:w-10"
          >
            <Icon className="h-4 w-4" />
          </span>
        ))}
      </Ring>
      <Ring radius={31} duration={50}>
        {APPS.map(({ key, icon: Icon, grad, name }) => (
          <span key={key} className="flex flex-col items-center gap-1">
            <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${grad} text-white shadow-lg ring-4 ring-white/70 dark:ring-slate-950/70 sm:h-14 sm:w-14`}>
              <Icon className="h-6 w-6" />
            </span>
            <span className="whitespace-nowrap rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-slate-700 shadow-sm dark:bg-slate-900/90 dark:text-slate-200 sm:text-xs">
              {name}
            </span>
          </span>
        ))}
      </Ring>
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          initial={reduced ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 160, damping: 14 }}
          className="rounded-[2rem] shadow-2xl shadow-brand-600/40"
        >
          <AmashuriMark size={112} animated live />
        </motion.div>
      </div>
    </div>
  );
};

export default Orbit;
