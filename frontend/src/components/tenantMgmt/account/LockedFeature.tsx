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
    <motion.div {...m("reveal")} className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-gray-700/40 dark:bg-gray-800/40" role="status">
      <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
        <Icon className="h-8 w-8" aria-hidden />
        <motion.span
          className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white"
          animate={reduced ? undefined : { rotate: [0, -12, 12, -6, 0] }}
          transition={{ duration: 0.9, delay: 0.3 }}
        >
          <Lock className="h-4 w-4" aria-hidden />
        </motion.span>
      </span>
      <p className="font-semibold text-gray-900 dark:text-white">{label ? `${label}: not in your package` : "Not in your package"}</p>
      <Link
        to="/settings/subscription"
        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
