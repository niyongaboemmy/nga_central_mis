import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlarmClock,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileStack,
  FileText,
  Hourglass,
  PauseCircle,
  Receipt,
  RefreshCw,
  School,
  Wallet,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CountUp, KpiTile, STEP_ICONS, STEP_LABELS, statusLabel } from "../kit";
import { TRACKER_STEPS, formatMoney, type ApplicationStatus, type AttentionItem, type TrackerStep } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { Card, cx, toast, usePlatform } from "./platformShared";
import { useChartTheme } from "./chartTheme";
import TenancyHealthCard from "./TenancyHealthCard";

/** Which application statuses sit on each journey step (pipeline strip + filters). */
export const STEP_STATUSES: Record<TrackerStep, ApplicationStatus[]> = {
  submitted: ["SUBMITTED"],
  review: ["UNDER_REVIEW", "CHANGES_REQUESTED"],
  approved: ["APPROVED_AWAITING_PAYMENT"],
  payment: ["PAYMENT_SUBMITTED", "PAYMENT_REJECTED", "PAYMENT_CONFIRMED"],
  setup: ["PROVISIONING", "PROVISIONING_FAILED"],
  live: ["ACTIVE"],
};

/** The next thing the platform team does for an application in this state. */
export function nextAction(a: Pick<AttentionItem, "status" | "invoiceStatus">): { label: string; tone: "danger" | "brand" | "muted" } {
  switch (a.status) {
    case "PROVISIONING_FAILED":
      return { label: "Retry setup", tone: "danger" };
    case "PAYMENT_SUBMITTED":
      return { label: "Confirm payment", tone: "brand" };
    case "SUBMITTED":
      return { label: "Start review", tone: "brand" };
    case "UNDER_REVIEW":
      return { label: "Decide", tone: "brand" };
    case "APPROVED_AWAITING_PAYMENT":
      return a.invoiceStatus === "DRAFT" ? { label: "Issue the invoice", tone: "brand" } : { label: "Waiting for the school to pay", tone: "muted" };
    case "PAYMENT_CONFIRMED":
      return { label: "Start setup", tone: "brand" };
    case "PROVISIONING":
      return { label: "Setting up…", tone: "muted" };
    default:
      return { label: "Open", tone: "muted" };
  }
}

const shortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
};

const age = (days: number) => (days <= 0 ? "today" : days === 1 ? "1 day" : `${days} days`);

const SectionTitle: React.FC<{ children: React.ReactNode; aside?: React.ReactNode }> = ({ children, aside }) => (
  <div className="mb-3 flex items-baseline justify-between gap-3">
    <h2 className="text-sm font-bold text-slate-900 dark:text-white">{children}</h2>
    {aside && <span className="text-xs text-slate-500 dark:text-gray-400">{aside}</span>}
  </div>
);

const OverviewPage: React.FC = () => {
  const { overview, can, reload } = usePlatform();
  const nav = useNavigate();
  const ct = useChartTheme();
  const m = useMotion();
  const [refreshing, setRefreshing] = useState(false);
  if (!overview) return null;

  const a = overview.applications;
  const n = (s: ApplicationStatus) => a[s] ?? 0;
  const apps = can("review", "decide");
  const billing = can("invoice", "confirm", "waive");
  const schools = can("view", "lifecycle", "entitlements");
  const go = (allowed: boolean, to: string) => (allowed ? () => nav(to) : undefined);
  const stepCount = (s: TrackerStep) => STEP_STATUSES[s].reduce((t, st) => t + n(st), 0);
  const inFlight = TRACKER_STEPS.filter((s) => s !== "live").reduce((t, s) => t + stepCount(s), 0);
  const attention = overview.attention ?? [];
  const waiting = (["SUBMITTED", "UNDER_REVIEW", "APPROVED_AWAITING_PAYMENT", "PAYMENT_SUBMITTED", "PAYMENT_CONFIRMED", "PROVISIONING", "PROVISIONING_FAILED"] as ApplicationStatus[]).reduce((t, s) => t + n(s), 0);
  const drafts = overview.draftInvoices ?? 0;
  const totals = overview.trend.reduce((t, w) => ({ submitted: t.submitted + w.submitted, activated: t.activated + w.activated }), { submitted: 0, activated: 0 });
  const updated = overview.generatedAt ? new Date(overview.generatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await reload();
      toast("Overview refreshed", "success");
    } catch {
      toast("Couldn't refresh the overview", "error");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Platform at a glance</h1>
          <p className="text-sm text-slate-600 dark:text-gray-300">
            {inFlight ? `${inFlight} ${inFlight === 1 ? "school is" : "schools are"} on the way in` : "No applications in progress"}
            {updated ? ` · updated ${updated}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-brand-500 hover:text-brand-700 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:text-brand-200"
        >
          <RefreshCw className={cx("h-4 w-4", refreshing && "animate-spin")} aria-hidden /> Refresh
        </button>
      </div>

      {/* Needs you now */}
      <Card>
        <SectionTitle aside={waiting ? (waiting > attention.length ? `${waiting} waiting · most urgent ${attention.length}` : `${waiting} waiting`) : undefined}>Needs you now</SectionTitle>
        {attention.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200">
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden /> All clear: no application is waiting on the platform team.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-gray-800" aria-label="Applications waiting on the platform team">
            {attention.map((it, i) => {
              const act = nextAction(it);
              const step = (Object.keys(STEP_STATUSES) as TrackerStep[]).find((s) => STEP_STATUSES[s].includes(it.status)) ?? "submitted";
              const Icon = STEP_ICONS[step];
              const body = (
                <>
                  <span
                    className={cx(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                      act.tone === "danger" ? "bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-200" : "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200",
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{it.schoolName}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-gray-400">
                      {[it.ref, statusLabel(it.status), it.pkg ? `${it.pkg[0].toUpperCase()}${it.pkg.slice(1)} package` : null, it.invoiceStatus === "DRAFT" ? "invoice not issued" : null, age(it.ageDays)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span
                    className={cx(
                      "hidden shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold sm:inline-flex",
                      act.tone === "danger"
                        ? "bg-red-600 text-white"
                        : act.tone === "brand"
                          ? "bg-brand-600 text-white"
                          : "bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300",
                    )}
                  >
                    {act.label} {act.tone !== "muted" && <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 sm:hidden" aria-hidden />
                </>
              );
              return (
                <motion.li key={it.applicationId} {...m("reveal")} transition={{ delay: i * 0.04 }}>
                  {apps ? (
                    <button
                      type="button"
                      onClick={() => nav(`/platform/applications/${it.applicationId}`)}
                      aria-label={`${it.schoolName}: ${act.label}`}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-gray-800/60"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 px-2 py-3">{body}</div>
                  )}
                </motion.li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Applications */}
      <section aria-label="Applications">
        <SectionTitle>Applications</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile icon={FileStack} label="To review" value={n("SUBMITTED") + n("UNDER_REVIEW")} onClick={go(apps, "/platform/applications?status=SUBMITTED")} />
          <KpiTile icon={Hourglass} label={drafts ? `Awaiting pay · ${drafts} invoice${drafts === 1 ? "" : "s"} to issue` : "Awaiting pay"} value={overview.awaitingPayment} onClick={go(apps, "/platform/applications?status=APPROVED_AWAITING_PAYMENT")} />
          <KpiTile icon={Wallet} label="Payments to confirm" value={overview.paymentsToConfirm} alert tone="text-red-600 dark:text-red-300" onClick={go(billing, "/platform/billing")} />
          <KpiTile icon={AlertTriangle} label="Setup failed" value={overview.provisioningFailures} alert tone="text-red-600 dark:text-red-300" onClick={go(apps, "/platform/applications?status=PROVISIONING_FAILED")} />
        </div>
      </section>

      {/* Pipeline */}
      <Card>
        <SectionTitle aside={`${n("ACTIVE")} live from applications`}>Pipeline</SectionTitle>
        <ol className="relative grid grid-cols-3 gap-y-4 sm:grid-cols-6" aria-label="Applications per step">
          <span className="absolute left-[8%] right-[8%] top-5 hidden h-0.5 bg-slate-200 dark:bg-gray-700 sm:block" aria-hidden />
          {TRACKER_STEPS.map((s, i) => {
            const Icon = STEP_ICONS[s];
            const c = stepCount(s);
            const failed = s === "setup" && n("PROVISIONING_FAILED") > 0;
            const active = c > 0;
            const body = (
              <>
                <span
                  className={cx(
                    "relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors",
                    failed
                      ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200"
                      : active
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-slate-200 bg-white text-slate-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {active && !failed && <span className="absolute inset-0 animate-ping rounded-full bg-brand-500/30" aria-hidden />}
                </span>
                <span className={cx("text-2xl font-extrabold", active ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-gray-500")}>
                  <CountUp value={c} />
                </span>
                <span className="text-xs font-medium text-slate-600 dark:text-gray-300">{STEP_LABELS[s]}</span>
              </>
            );
            return (
              <motion.li key={s} {...m("reveal")} transition={{ delay: i * 0.05 }} className="flex justify-center">
                {apps ? (
                  <button
                    type="button"
                    onClick={() => nav(`/platform/applications?step=${s}`)}
                    aria-label={`${STEP_LABELS[s]}: ${c}`}
                    className="flex w-full flex-col items-center gap-1 rounded-xl p-2 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-gray-800/60"
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

      {/* Schools and billing */}
      <section aria-label="Schools and billing">
        <SectionTitle>Schools and billing</SectionTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiTile icon={School} label="Active" value={overview.tenants.ACTIVE ?? 0} tone="text-emerald-600 dark:text-emerald-300" onClick={go(schools, "/platform/schools?status=ACTIVE")} />
          <KpiTile icon={AlarmClock} label="In grace" value={overview.tenants.GRACE ?? 0} tone="text-amber-600 dark:text-amber-300" onClick={go(schools, "/platform/schools?status=GRACE")} />
          <KpiTile icon={PauseCircle} label="Suspended" value={overview.tenants.SUSPENDED ?? 0} tone="text-red-600 dark:text-red-300" onClick={go(schools, "/platform/schools?status=SUSPENDED")} />
          <KpiTile icon={Receipt} label="Renewing in 30 days" value={overview.expiringIn30Days} tone="text-amber-600 dark:text-amber-300" onClick={go(schools, "/platform/schools?expiring=30")} />
          <KpiTile
            icon={CircleDollarSign}
            label="Revenue · this term"
            value={overview.revenueThisTerm}
            tone="text-emerald-600 dark:text-emerald-300"
            format={(v) => formatMoney(v, overview.currency)}
            onClick={go(billing, "/platform/billing?pane=invoices&status=PAID")}
          />
        </div>
        {drafts > 0 && billing && (
          <button
            type="button"
            onClick={() => nav("/platform/billing?pane=invoices&status=DRAFT")}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-200"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden /> {drafts} draft {drafts === 1 ? "invoice" : "invoices"} to issue <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </section>

      {/* Trend */}
      <Card>
        <SectionTitle aside={`${totals.submitted} submitted · ${totals.activated} activated`}>Last 12 weeks</SectionTitle>
        <div className="h-56" role="img" aria-label={`Applications submitted and schools activated per week over the last 12 weeks: ${totals.submitted} submitted, ${totals.activated} activated`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={overview.trend} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="ovSubmitted" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ct.series[0]} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={ct.series[0]} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ovActivated" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ct.series[1]} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={ct.series[1]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={ct.grid} strokeDasharray="3 3" />
              <XAxis dataKey="week" tickFormatter={shortDate} tick={{ fontSize: 11, fill: ct.tick }} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11, fill: ct.tick }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={ct.tooltip} labelFormatter={(w) => `Week of ${shortDate(String(w))}`} />
              <Area type="monotone" dataKey="submitted" name="Submitted" stroke={ct.series[0]} strokeWidth={2.5} fill="url(#ovSubmitted)" dot={false} activeDot={{ r: 4 }} />
              <Area type="monotone" dataKey="activated" name="Activated" stroke={ct.series[1]} strokeWidth={2.5} fill="url(#ovActivated)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex justify-center gap-5 text-xs text-slate-600 dark:text-gray-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: ct.series[0] }} aria-hidden /> Submitted
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: ct.series[1] }} aria-hidden /> Activated
          </span>
        </div>
      </Card>

      {can("view") && <TenancyHealthCard />}
    </div>
  );
};

export default OverviewPage;
