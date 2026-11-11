import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Circle, Clock, CreditCard, Hourglass, Loader2, Minus, Rocket, Search, Wrench, type LucideIcon } from "lucide-react";
import type { ApplicationStatus, ProvisioningRun, StepStatus } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { cx } from "../register/fields";

/** What "waiting" means per status: one icon, one short line, the expected time. */
export const WAIT_COPY: Partial<Record<ApplicationStatus, { icon: LucideIcon; line: string; eta: string }>> = {
  SUBMITTED: { icon: Search, line: "Reviewing your school", eta: "~2 working days" },
  UNDER_REVIEW: { icon: Search, line: "Reviewing your school", eta: "~2 working days" },
  PAYMENT_SUBMITTED: { icon: CreditCard, line: "Checking your payment", eta: "~1 working day" },
  PAYMENT_CONFIRMED: { icon: Rocket, line: "Setting up your school", eta: "a few minutes" },
  PROVISIONING: { icon: Rocket, line: "Setting up your school", eta: "a few minutes" },
  PROVISIONING_FAILED: { icon: Wrench, line: "Finishing setup", eta: "we're on it" },
};

/** An orbiting "something is happening" illustration around one icon. */
export const WaitIllustration: React.FC<{ status: ApplicationStatus }> = ({ status }) => {
  const reduced = useReducedMotion();
  const c = WAIT_COPY[status] ?? { icon: Hourglass, line: "In progress", eta: "" };
  const Icon = c.icon;
  return (
    <div className="flex items-center gap-4" role="status">
      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
        {!reduced && (
          <>
            <motion.span className="absolute inset-0 rounded-full bg-brand-500/15" animate={{ scale: [1, 1.35], opacity: [0.8, 0] }} transition={{ duration: 1.8, repeat: Infinity }} aria-hidden />
            <motion.span className="absolute inset-0" animate={{ rotate: 360 }} transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }} aria-hidden>
              <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-brand-500" />
              <span className="absolute bottom-1 left-1 h-2 w-2 rounded-full bg-emerald-500" />
              <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-amber-400" />
            </motion.span>
          </>
        )}
        <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-sky-500 text-white shadow">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
      <div>
        <p className="font-semibold text-slate-900 dark:text-white">{c.line}</p>
        {c.eta && (
          <p className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {c.eta}
          </p>
        )}
      </div>
    </div>
  );
};

const STEP_VIEW: Record<StepStatus, { icon: LucideIcon; cls: string; sr: string; spin?: boolean }> = {
  PENDING: { icon: Circle, cls: "text-slate-400 dark:text-slate-500", sr: "waiting" },
  RUNNING: { icon: Loader2, cls: "text-brand-600 dark:text-brand-200", sr: "in progress", spin: true },
  DONE: { icon: Check, cls: "bg-emerald-500 text-white rounded-full p-0.5", sr: "done" },
  // an applicant never sees a raw failure: the platform retries
  FAILED: { icon: Clock, cls: "text-amber-600 dark:text-amber-300", sr: "retrying" },
  SKIPPED: { icon: Minus, cls: "text-slate-400 dark:text-slate-500", sr: "skipped" },
};

/** The provisioning run, live: spinner -> tick per step. */
export const ProvisioningSteps: React.FC<{ run: ProvisioningRun }> = ({ run }) => {
  const m = useMotion();
  const done = run.steps.filter((s) => s.status === "DONE" || s.status === "SKIPPED").length;
  const pct = run.steps.length ? Math.round((done / run.steps.length) * 100) : 0;
  return (
    <section aria-labelledby="prov-title" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2">
        <Rocket className="h-5 w-5 text-brand-600 dark:text-brand-200" aria-hidden />
        <h3 id="prov-title" className="flex-1 font-semibold text-slate-900 dark:text-white">
          Setting up
        </h3>
        <span className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">{pct}%</span>
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
        <motion.div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-500" initial={false} animate={{ width: `${pct}%` }} {...m("fill")} />
      </div>
      <ol className="space-y-2" aria-label="Setup steps">
        {run.steps.map((s) => {
          const v = STEP_VIEW[s.status] ?? STEP_VIEW.PENDING;
          return (
            <li key={s.key} className="flex items-center gap-3 text-sm">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={s.status} {...m("check")} className="flex h-5 w-5 items-center justify-center">
                  <v.icon className={cx("h-4 w-4", v.cls, v.spin && "animate-spin")} aria-hidden />
                </motion.span>
              </AnimatePresence>
              <span className={cx(s.status === "DONE" ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300", s.status === "RUNNING" && "font-semibold")}>{s.label}</span>
              <span className="sr-only">({v.sr})</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
