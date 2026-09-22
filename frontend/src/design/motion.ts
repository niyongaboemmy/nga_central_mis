import type { Transition, Variants } from "framer-motion";
import { useReducedMotion } from "framer-motion";

/**
 * Motion vocabulary for the e-learning module (UX plan §2.2). Components never hand-write
 * transitions: they ask for a named motion and get reduced-motion-safe props back.
 */
export const spring: Transition = { type: "spring", stiffness: 500, damping: 30 };
export const softSpring: Transition = { type: "spring", stiffness: 260, damping: 26 };

export type MotionName = "tap" | "reveal" | "check" | "fill" | "shake" | "fade";

const full: Record<MotionName, { variants?: Variants; initial?: any; animate?: any; exit?: any; whileTap?: any; transition?: Transition }> = {
  tap: { whileTap: { scale: 0.97 }, transition: spring },
  reveal: {
    initial: { y: 12, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: 8, opacity: 0 },
    transition: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] },
  },
  check: {
    initial: { scale: 0 },
    animate: { scale: [0, 1.15, 1] },
    transition: { duration: 0.32, ease: "easeOut" },
  },
  fill: { transition: { duration: 0.4, ease: "easeOut" } },
  shake: {
    animate: { x: [0, -4, 4, -4, 4, 0] },
    transition: { duration: 0.24 },
  },
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.12 },
  },
};

const reduced: typeof full = {
  tap: {},
  reveal: full.fade,
  check: full.fade,
  fill: { transition: { duration: 0.12 } },
  shake: {},
  fade: full.fade,
};

/** `motionProps("reveal")` → spread onto a `motion.*` element. Honours prefers-reduced-motion. */
export const useMotion = () => {
  const prefersReduced = useReducedMotion();
  return (name: MotionName) => (prefersReduced ? reduced[name] : full[name]);
};

export const useReducedMotionPref = () => !!useReducedMotion();
