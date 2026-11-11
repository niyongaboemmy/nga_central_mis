import React, { Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CreditCard, X } from "lucide-react";
import type { UsageMeter } from "../../../api/tenantMgmt";
import { MeterBar } from "../kit";
import { useMotion } from "../../../design/motion";
import { CountdownRing, cx } from "../shared/paymentBits";
import { STATUS_REFRESH_MS, loadTenantStatus, useTenantStatus } from "./usePackage";

/**
 * Grace / limit banner on every signed-in page (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.7, §3.3),
 * plus the support-session chip when a platform user is inside this school (§6.9).
 * Silent on errors and for an ACTIVE school with no warnings.
 */

const DISMISS_KEY = "nga.tenant.limitWarnings.dismissed";
const todayKey = () => new Date().toISOString().slice(0, 10);

const readDismissed = (): string[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "null");
    return raw && raw.day === todayKey() && Array.isArray(raw.keys) ? raw.keys : [];
  } catch {
    return [];
  }
};
const writeDismissed = (keys: string[]) => {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify({ day: todayKey(), keys }));
  } catch {
    /* private mode */
  }
};

/** Payload of the session JWT, unverified (display only). */
export const readTokenClaims = (): Record<string, any> | null => {
  try {
    const t = localStorage.getItem("token");
    const part = t?.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    return JSON.parse(json);
  } catch {
    return null;
  }
};

export const isSupportToken = (claims: Record<string, any> | null) => !!claims && (claims.support === true || !!claims.act);

// Package F's chip, picked up when that file exists (import.meta.glob resolves to {} otherwise).
const chipModules = import.meta.glob<{ default: React.ComponentType<any> }>("../platform/SupportSessionChip.tsx");
const chipLoader = Object.values(chipModules)[0];
const SupportSessionChip = chipLoader ? React.lazy(chipLoader) : null;

const TenantStatusBanner: React.FC = () => {
  const m = useMotion();
  const { data } = useTenantStatus();
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const support = useMemo(() => isSupportToken(readTokenClaims()), []);

  useEffect(() => {
    const t = window.setInterval(() => void loadTenantStatus(true), STATUS_REFRESH_MS);
    return () => window.clearInterval(t);
  }, []);

  const warnings: UsageMeter[] = (data?.warnings ?? []).filter((w) => (w.ratio ?? 0) >= 0.9 && !dismissed.includes(w.key));
  const grace = data?.status === "GRACE";
  const suspended = data?.status === "SUSPENDED";
  const daysLeft = data?.daysLeft ?? 0;

  const dismiss = (key: string) => {
    const next = [...dismissed, key];
    setDismissed(next);
    writeDismissed(next);
  };

  if (!grace && !suspended && warnings.length === 0 && !support) return null;

  return (
    <div className="space-y-2 px-4 pt-3 md:px-0" data-testid="tenant-status-banner">
      {support && SupportSessionChip && (
        <Suspense fallback={null}>
          <SupportSessionChip />
        </Suspense>
      )}
      <AnimatePresence>
        {(grace || suspended) && (
          <motion.div
            key="grace"
            {...m("reveal")}
            role="alert"
            className={cx(
              "flex items-center gap-3 rounded-2xl border px-3 py-2",
              suspended
                ? "border-red-300 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100"
                : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
            )}
          >
            {grace ? (
              <CountdownRing size={44} left={daysLeft} total={14} label={`Grace period: ${daysLeft} days left`} />
            ) : (
              <AlertTriangle className="h-6 w-6 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 flex-1 text-sm font-semibold">{grace ? "Subscription expired" : "School suspended"}</span>
            <Link
              to="/settings/subscription"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-white dark:text-slate-900"
            >
              <CreditCard className="h-4 w-4" aria-hidden /> Pay
            </Link>
          </motion.div>
        )}
        {warnings.length > 0 && (
          <motion.ul key="limits" {...m("reveal")} className="flex flex-wrap gap-2" aria-label="Limits almost reached">
            {warnings.map((w) => (
              <motion.li
                key={w.key}
                layout
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex w-full items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-1.5 shadow-sm dark:border-red-500/40 dark:bg-slate-900 sm:w-72"
              >
                <span className="sr-only">{w.label} almost at its limit</span>
                <div className="min-w-0 flex-1">
                  <MeterBar meter={w} />
                </div>
                <Link to="/settings/subscription" className="text-xs font-semibold text-brand-700 underline dark:text-brand-200">
                  Upgrade
                </Link>
                <button
                  type="button"
                  onClick={() => dismiss(w.key)}
                  className="rounded-lg p-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Hide {w.label} warning for today</span>
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TenantStatusBanner;
