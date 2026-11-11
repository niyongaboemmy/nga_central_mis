import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AlarmClock, AlertTriangle, CircleDollarSign, FileStack, Hourglass, PauseCircle, Receipt, School, Wallet } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CountUp, KpiTile, STEP_ICONS, STEP_LABELS } from "../kit";
import { TRACKER_STEPS, formatMoney, type ApplicationStatus, type TrackerStep } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { Card, cx, usePlatform } from "./platformShared";
import { useChartTheme } from "./chartTheme";

/** Which application statuses sit on each journey step (pipeline strip + filters). */
export const STEP_STATUSES: Record<TrackerStep, ApplicationStatus[]> = {
  submitted: ["SUBMITTED"],
  review: ["UNDER_REVIEW", "CHANGES_REQUESTED"],
  approved: ["APPROVED_AWAITING_PAYMENT"],
  payment: ["PAYMENT_SUBMITTED", "PAYMENT_REJECTED", "PAYMENT_CONFIRMED"],
  setup: ["PROVISIONING", "PROVISIONING_FAILED"],
  live: ["ACTIVE"],
};

const OverviewPage: React.FC = () => {
  const { overview, can } = usePlatform();
  const nav = useNavigate();
  const ct = useChartTheme();
  const m = useMotion();
  if (!overview) return null;
  const a = overview.applications;
  const n = (s: ApplicationStatus) => a[s] ?? 0;
  const apps = can("review", "decide");
  const billing = can("invoice", "confirm", "waive");
  const schools = can("view", "lifecycle", "entitlements");
  const go = (allowed: boolean, to: string) => (allowed ? () => nav(to) : undefined);
  const stepCount = (s: TrackerStep) => STEP_STATUSES[s].reduce((t, st) => t + n(st), 0);
  const maxStep = Math.max(1, ...TRACKER_STEPS.map(stepCount));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile icon={FileStack} label="To review" value={n("SUBMITTED") + n("UNDER_REVIEW")} onClick={go(apps, "/platform/applications?status=SUBMITTED")} />
        <KpiTile icon={Hourglass} label="Awaiting pay" value={overview.awaitingPayment} tone="text-violet-600 dark:text-violet-300" onClick={go(apps, "/platform/applications?status=APPROVED_AWAITING_PAYMENT")} />
        <KpiTile icon={Wallet} label="To confirm" value={overview.paymentsToConfirm} alert tone="text-red-600 dark:text-red-300" onClick={go(billing, "/platform/billing")} />
        <KpiTile icon={AlertTriangle} label="Setup failed" value={overview.provisioningFailures} alert tone="text-red-600 dark:text-red-300" onClick={go(apps, "/platform/applications?status=PROVISIONING_FAILED")} />
        <KpiTile
          icon={CircleDollarSign}
          label="Revenue · term"
          value={overview.revenueThisTerm}
          tone="text-emerald-600 dark:text-emerald-300"
          format={(v) => formatMoney(v, overview.currency)}
          onClick={go(billing, "/platform/billing?pane=invoices&status=PAID")}
        />
        <KpiTile icon={School} label="Active" value={overview.tenants.ACTIVE ?? 0} tone="text-emerald-600 dark:text-emerald-300" onClick={go(schools, "/platform/schools?status=ACTIVE")} />
        <KpiTile icon={AlarmClock} label="Grace" value={overview.tenants.GRACE ?? 0} tone="text-amber-600 dark:text-amber-300" onClick={go(schools, "/platform/schools?status=GRACE")} />
        <KpiTile icon={PauseCircle} label="Suspended" value={overview.tenants.SUSPENDED ?? 0} tone="text-red-600 dark:text-red-300" onClick={go(schools, "/platform/schools?status=SUSPENDED")} />
        <KpiTile icon={Receipt} label="Expiring 30d" value={overview.expiringIn30Days} tone="text-amber-600 dark:text-amber-300" onClick={go(schools, "/platform/schools?expiring=30")} />
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Pipeline</h2>
        <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Applications per step">
          {TRACKER_STEPS.map((s, i) => {
            const Icon = STEP_ICONS[s];
            const c = stepCount(s);
            const failed = s === "setup" && n("PROVISIONING_FAILED") > 0;
            const body = (
              <>
                <span className={cx("flex h-9 w-9 items-center justify-center rounded-full", failed ? "bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-200" : "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200")}>
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="text-xl font-extrabold text-slate-900 dark:text-white">
                  <CountUp value={c} />
                </span>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{STEP_LABELS[s]}</span>
                <span className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
                  <motion.span
                    className={cx("block h-full rounded-full", failed ? "bg-red-500" : "bg-gradient-to-r from-brand-500 to-emerald-500")}
                    initial={{ width: 0 }}
                    animate={{ width: `${(c / maxStep) * 100}%` }}
                    transition={{ duration: 0.8, delay: i * 0.08 }}
                  />
                </span>
              </>
            );
            return (
              <motion.li key={s} {...m("reveal")} transition={{ delay: i * 0.05 }}>
                {apps ? (
                  <button
                    type="button"
                    onClick={() => nav(`/platform/applications?step=${s}`)}
                    className="flex w-full flex-col items-center gap-1 rounded-xl p-2 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-slate-800"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-1 p-2">{body}</div>
                )}
              </motion.li>
            );
          })}
        </ol>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">12 weeks</h2>
        <div className="h-56" role="img" aria-label="Submitted applications and activated schools per week, last 12 weeks">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={overview.trend} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={ct.grid} strokeDasharray="3 3" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: ct.tick }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11, fill: ct.tick }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={ct.tooltip} />
              <Legend wrapperStyle={{ fontSize: 12, color: ct.tick }} />
              <Line type="monotone" dataKey="submitted" name="Submitted" stroke={ct.series[0]} strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="activated" name="Activated" stroke={ct.series[1]} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
};

export default OverviewPage;
