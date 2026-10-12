import UserAvatar from "../ui/UserAvatar";
import React from "react";
import { motion } from "framer-motion";

/**
 * The surface, motion and typography vocabulary the rest of the app already
 * uses (see UsersManagement's StatCard and EnrollmentManager's CardShell),
 * factored out so every lens reads as one page rather than five.
 */

export const CardShell: React.FC<{
  children?: React.ReactNode;
  className?: string;
  delay?: number;
}> = ({ children, className = "", delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className={`bg-white/70 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl border border-white/50 dark:border-slate-700/30 ${className}`}
  >
    {children}
  </motion.div>
);

export const StatTile: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent: string;
  loading?: boolean;
}> = ({ icon: Icon, label, value, accent, loading }) => (
  <motion.div
    whileHover={{ y: -2 }}
    className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-3 border border-white/50 dark:border-slate-700/30"
  >
    <div className="flex items-center gap-2">
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${accent}`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        {loading ? (
          <div className="h-5 w-8 rounded bg-gray-200 dark:bg-slate-700 animate-pulse" />
        ) : (
          <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
            {value}
          </p>
        )}
        <p className="text-xs text-gray-400 truncate">{label}</p>
      </div>
    </div>
  </motion.div>
);

export const getInitials = (first?: string | null, last?: string | null) =>
  `${first?.[0] || ""}${last?.[0] || ""}`.toUpperCase() || "?";

export const fullName = (first?: string | null, last?: string | null) =>
  [first, last].filter(Boolean).join(" ").trim();

/** A person in a class-group view: their NGA photo when they have one, else initials. */
export const Avatar: React.FC<{
  first?: string | null;
  last?: string | null;
  userId?: number | null;
  size?: "sm" | "md";
}> = ({ first, last, userId, size = "md" }) => (
  <UserAvatar
    decorative
    userId={userId}
    name={fullName(first, last) || "?"}
    size={size === "sm" ? 28 : 36}
    shape="rounded"
  />
);

export const EmptyState: React.FC<{
  icon: React.ElementType;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}> = ({ icon: Icon, title, hint, action }) => (
  <div className="flex flex-col items-center justify-center text-center py-12 px-6">
    <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center mb-3">
      <Icon className="w-6 h-6 text-gray-400" />
    </div>
    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
      {title}
    </p>
    {hint && (
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
        {hint}
      </p>
    )}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const SkeletonRows: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="space-y-2 p-3">
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        className="flex items-center gap-3 p-3 bg-white/60 dark:bg-slate-800/40 rounded-2xl border border-white/50 dark:border-slate-700/20 animate-pulse"
      >
        <div className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-slate-700 shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-3.5 w-40 rounded bg-gray-200 dark:bg-slate-700" />
          <div className="h-3 w-56 rounded bg-gray-200 dark:bg-slate-700" />
        </div>
      </div>
    ))}
  </div>
);

/** A read-only lens still shows everything; only its controls go dead. */
export const ReadOnlyNotice: React.FC<{ what: string }> = ({ what }) => (
  <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl px-3 py-2">
    You can view {what} but not change them — you are missing the required
    permission.
  </div>
);
