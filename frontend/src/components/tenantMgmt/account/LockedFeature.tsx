import React from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Lock, Sparkles } from "lucide-react";
import { entIcon } from "../kit";
import { useMotion } from "../../../design/motion";
import { usePackageFeature } from "./usePackage";

/** "Not in your package" card with an Upgrade link (§3.3). */
export const LockedCard: React.FC<{ feature: string; label?: string }> = ({ feature, label }) => {
  const m = useMotion();
  const reduced = useReducedMotion();
  const Icon = entIcon(feature);
  return (
    <motion.div {...m("reveal")} className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900" role="status">
      <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        <Icon className="h-8 w-8" aria-hidden />
        <motion.span
          className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white shadow"
          animate={reduced ? undefined : { rotate: [0, -12, 12, -6, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 2.5 }}
        >
          <Lock className="h-4 w-4" aria-hidden />
        </motion.span>
      </span>
      <p className="font-semibold text-slate-900 dark:text-white">{label ? `${label}: not in your package` : "Not in your package"}</p>
      <Link
        to="/settings/subscription"
        className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Sparkles className="h-4 w-4" aria-hidden /> Upgrade
      </Link>
    </motion.div>
  );
};

/** Renders children when the package includes `feature`, otherwise the lock card (or `fallback`). */
export const LockedFeature: React.FC<{ feature: string; label?: string; fallback?: React.ReactNode; children: React.ReactNode }> = ({
  feature,
  label,
  fallback,
  children,
}) => {
  const { allowed, loading } = usePackageFeature(feature);
  if (loading) return null;
  if (allowed) return <>{children}</>;
  return <>{fallback ?? <LockedCard feature={feature} label={label} />}</>;
};

export default LockedFeature;
