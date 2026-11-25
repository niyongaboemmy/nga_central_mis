import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  AlarmClock,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileStack,
  FileText,
  Gauge,
  GraduationCap,
  Hourglass,
  Package,
  PauseCircle,
  Rocket,
  School,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import TenantLogo from "../../brand/TenantLogo";
import { STEP_ICONS, STEP_LABELS, statusLabel } from "../kit";
import { TRACKER_STEPS, formatMoney, platformApi, type ApplicationStatus, type PackageInfo, type TenantListItem, type TrackerStep } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { Skeleton, cx, daysUntil, surface, usePlatform } from "./platformShared";
import { STEP_STATUSES, nextAction } from "./OverviewPage";
import TenancyHealthCard from "./TenancyHealthCard";
import { listMeters } from "./SchoolsPage";
import { BarList, DaysRing, IconTile, Panel, Ring, SegmentBar, StatTile, TONE, TrendChart, limitTone, monthLabel, type BarItem } from "../viz";

/**
 * Platform dashboard (/platform/dashboard): the whole platform at a glance, then what needs
 * the team now. Every number opens the screen that explains it.
 */

const age = (days: number) => (days <= 0 ? "today" : days === 1 ? "1 day" : `${days} days`);

/** The most-used share of a school's limits (students, staff, storage), from listMeters. */
function heaviestLimit(t: TenantListItem, pkg: PackageInfo | undefined): { label: string; ratio: number; used: string } | null {
  const gb = (mb: number) => `${(mb / 1024).toFixed(mb >= 10240 ? 0 : 1)} GB`;
  let best: { label: string; ratio: number; used: string } | null = null;
  for (const m of listMeters(t, pkg)) {
    if (!m.limit || m.ratio === null) continue;
    const fmt = m.unit === "MB" ? gb : (n: number) => n.toLocaleString();
    if (!best || m.ratio > best.ratio) best = { label: m.label, ratio: m.ratio, used: `${fmt(m.used)} / ${fmt(m.limit)}` };
  }
  return best;
}

const DashboardPage: React.FC = () => {
  const { overview, can } = usePlatform();
  const nav = useNavigate();
  const m = useMotion();
  const canSchools = can("view", "lifecycle", "entitlements");
  const canApps = can("review", "decide");
  const canBilling = can("invoice", "confirm", "waive");
  const [schools, setSchools] = useState<TenantListItem[] | null>(null);
  const [packages, setPackages] = useState<PackageInfo[] | null>(null);

  useEffect(() => {
    let live = true;
    if (canSchools) platformApi.tenants().then((r) => live && setSchools(r), () => live && setSchools([]));
    else setSchools([]);
    platformApi.packages().then((r) => live && setPackages(r), () => live && setPackages([]));
    return () => {
      live = false;
    };
  }, [canSchools]);

  const derived = useMemo(() => {
    // Every school counts, the primary one (NGA) included: the headline "Live schools" number
    // (overview.tenants) includes it, so the totals beside it must too.
    const list = schools ?? [];
    const pkgOf = (code: string) => packages?.find((p) => p.code === code);
    const live = list.filter((t) => t.status === "ACTIVE" || t.status === "GRACE");
    const students = live.reduce((n, t) => n + t.students, 0);
    const active7 = live.reduce((n, t) => n + t.activeUsers7d, 0);
    const mix = (packages ?? [])
      .slice()
      .sort((a, b) => a.tier - b.tier)
      .map((p) => ({ p, n: live.filter((t) => t.pkg === p.code).length }));
    const nearLimits = live
      .map((t) => ({ t, h: heaviestLimit(t, pkgOf(t.pkg)) }))
      .filter((x): x is { t: TenantListItem; h: NonNullable<ReturnType<typeof heaviestLimit>> } => !!x.h && x.h.ratio >= 0.75)
      .sort((a, b) => b.h.ratio - a.h.ratio)
      .slice(0, 5);
    const renewals = list
      .map((t) => ({ t, d: daysUntil(t.status === "GRACE" ? t.graceUntil : t.periodEnd) }))
      .filter((x): x is { t: TenantListItem; d: number } => x.d !== null && x.d <= 30)
      .sort((a, b) => a.d - b.d)
      .slice(0, 5);
    const busiest = live
      .slice()
      .sort((a, b) => b.activeUsers7d - a.activeUsers7d)
      .slice(0, 6);
    const snapshotOnly = live.some((t) => t.usageLive === false);
    return { live, students, active7, mix, nearLimits, renewals, busiest, snapshotOnly };
  }, [schools, packages]);

  if (!overview) return null;
  const tenants = overview.tenants;
  const a = overview.applications;
  const n = (s: ApplicationStatus) => a[s] ?? 0;
  const go = (allowed: boolean, to: string) => (allowed ? () => nav(to) : undefined);
  const stepCount = (s: TrackerStep) => STEP_STATUSES[s].reduce((t, st) => t + n(st), 0);
  const attention = overview.attention ?? [];
  const waiting = (["SUBMITTED", "UNDER_REVIEW", "APPROVED_AWAITING_PAYMENT", "PAYMENT_SUBMITTED", "PAYMENT_CONFIRMED", "PROVISIONING", "PROVISIONING_FAILED"] as ApplicationStatus[]).reduce((t, s) => t + n(s), 0);
  const drafts = overview.draftInvoices ?? 0;
  const liveNow = (tenants.ACTIVE ?? 0) + (tenants.GRACE ?? 0);
  // live schools at the end of each of the 12 weeks: today's count minus the schools that went live after that week
  const activations = overview.trend.map((w) => w.activated);
  const liveWeekly = activations.map((_, i) => Math.max(0, liveNow - activations.slice(i + 1).reduce((t, v) => t + v, 0)));
  const submittedWeekly = overview.trend.map((w) => w.submitted);
  const totals = overview.trend.reduce((t, w) => ({ submitted: t.submitted + w.submitted, activated: t.activated + w.activated }), { submitted: 0, activated: 0 });
  const loadingSchools = canSchools && schools === null;
  const money = (v: number) => formatMoney(v, overview.currency);
  const collected = (overview.collectedMonthly ?? []).map((c) => ({ month: `${c.month}-01`, collected: c.amount }));
  const windowMonths = overview.revenueWindowMonths ?? 4;
  const schoolsTotal = (["ACTIVE", "GRACE", "SUSPENDED", "PENDING"] as const).reduce((t, k) => t + (tenants[k] ?? 0), 0);
  const archived = tenants.ARCHIVED ?? 0;

  return (
    <div className="space-y-5">
      {/* Headline numbers */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Headline numbers">
        <StatTile icon={School} label="Live schools" value={liveNow} hint={`active or in grace · ${totals.activated} joined in 12 weeks`} spark={liveWeekly} onClick={go(canSchools, "/platform/schools?status=ACTIVE")} />
        {loadingSchools ? (
          <Skeleton className="h-full min-h-[9.5rem] !rounded-2xl" />
        ) : (
          <StatTile icon={GraduationCap} label="Students" value={derived.students} hint={`active accounts · ${derived.live.length} live ${derived.live.length === 1 ? "school" : "schools"}`} onClick={go(canSchools, "/platform/schools")} />
        )}
        {loadingSchools ? (
          <Skeleton className="h-full min-h-[9.5rem] !rounded-2xl" />
        ) : (
          <StatTile icon={Activity} label="Active this week" value={derived.active7} hint="used an app or signed in · last 7 days" onClick={go(canSchools, "/platform/schools?sort=activity")} />
        )}
        <StatTile icon={CircleDollarSign} label="Collected" value={overview.revenueThisTerm} format={money} hint={`confirmed payments · last ${windowMonths} months`} tone="emerald" spark={collected.map((c) => c.collected)} onClick={go(canBilling, "/platform/billing?pane=invoices&status=PAID")} />
      </section>

      {derived.snapshotOnly && (
        <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">Some schools didn't answer in time: their numbers are from last night's count.</p>
      )}

      {/* Needs you now + platform health */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel
          title="Needs you now"
          icon={AlarmClock}
          className="lg:col-span-2"
          aside={waiting ? (waiting > attention.length ? `${waiting} waiting · most urgent ${attention.length}` : `${waiting} waiting`) : undefined}
        >
          {attention.length === 0 ? (
            <div className="flex h-full min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl bg-emerald-50 p-6 text-center dark:bg-emerald-500/10">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">All clear: no application is waiting on the platform team.</p>
            </div>
          ) : (
            <ul className={cx("-mx-2 divide-y", surface.divide)} aria-label="Applications waiting on the platform team">
              {attention.map((it, i) => {
                const act = nextAction(it);
                const step = (Object.keys(STEP_STATUSES) as TrackerStep[]).find((s) => STEP_STATUSES[s].includes(it.status)) ?? "submitted";
                const body = (
                  <>
                    <IconTile icon={STEP_ICONS[step]} tone={act.tone === "danger" ? "red" : "blue"} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">{it.schoolName}</span>
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                        {[it.ref, statusLabel(it.status), it.pkg ? `${it.pkg[0].toUpperCase()}${it.pkg.slice(1)} package` : null, it.invoiceStatus === "DRAFT" ? "invoice not issued" : null, age(it.ageDays)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span
                      className={cx(
                        "hidden shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold sm:inline-flex",
                        act.tone === "danger" ? "bg-red-600 text-white" : act.tone === "brand" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-800/70 dark:text-gray-300",
                      )}
                    >
                      {act.label} {act.tone !== "muted" && <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 sm:hidden" aria-hidden />
                  </>
                );
                return (
                  <motion.li key={it.applicationId} {...m("reveal")} transition={{ delay: i * 0.04 }}>
                    {canApps ? (
                      <button
                        type="button"
                        onClick={() => nav(`/platform/applications/${it.applicationId}`)}
                        aria-label={`${it.schoolName}: ${act.label}`}
                        className="flex w-full items-center gap-3 rounded-full px-2 py-3 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-gray-800/50"
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
        </Panel>

        <Panel title="Schools" icon={Gauge} aside={`${schoolsTotal} in total${archived ? ` · ${archived} archived` : ""}`}>
          <SegmentBar
            columns={2}
            label="Schools by status"
            segments={[
              { key: "ACTIVE", label: "Active", value: tenants.ACTIVE ?? 0, tone: "emerald", icon: CheckCircle2, onClick: go(canSchools, "/platform/schools?status=ACTIVE") },
              { key: "GRACE", label: "In grace", value: tenants.GRACE ?? 0, tone: "amber", icon: AlarmClock, onClick: go(canSchools, "/platform/schools?status=GRACE") },
              { key: "SUSPENDED", label: "Suspended", value: tenants.SUSPENDED ?? 0, tone: "red", icon: PauseCircle, onClick: go(canSchools, "/platform/schools?status=SUSPENDED") },
              { key: "PENDING", label: "Setting up", value: tenants.PENDING ?? 0, tone: "gray", icon: Hourglass, onClick: go(canSchools, "/platform/schools?status=PENDING") },
            ]}
          />
          {canSchools && (
            <div className="mt-5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Near their limits
              </p>
              {loadingSchools ? (
                <div className="space-y-2">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : derived.nearLimits.length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-3 py-2.5 text-sm text-gray-600 dark:bg-gray-800/50 dark:text-gray-300">Every school has room to grow.</p>
              ) : (
                <ul className="space-y-1" aria-label="Schools near their limits">
                  {derived.nearLimits.map(({ t, h }) => (
                    <li key={t.tid}>
                      <button type="button" onClick={() => nav(`/platform/schools/${t.tid}`)} className="flex w-full items-center gap-3 rounded-full px-2 py-1.5 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-gray-800/50">
                        <Ring value={h.ratio} size={36} stroke={4} tone={limitTone(h.ratio)} label={`${h.label} ${Math.round(h.ratio * 100)}%`}>
                          <span className="text-[10px] font-bold tabular-nums text-gray-700 dark:text-gray-200">{Math.round(h.ratio * 100)}</span>
                        </Ring>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{t.name}</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            {h.label} · {h.used}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* Application KPIs */}
      <section aria-label="Applications" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={FileStack} label="To review" value={n("SUBMITTED") + n("UNDER_REVIEW")} hint="line: applications per week" spark={submittedWeekly} onClick={go(canApps, "/platform/applications?status=SUBMITTED")} />
        <StatTile
          icon={Hourglass}
          label="Awaiting pay"
          value={overview.awaitingPayment}
          hint={drafts ? `${drafts} invoice${drafts === 1 ? "" : "s"} to issue` : undefined}
          onClick={go(canApps, "/platform/applications?status=APPROVED_AWAITING_PAYMENT")}
        />
        <StatTile icon={Wallet} label="Payments to confirm" value={overview.paymentsToConfirm} attention onClick={go(canBilling, "/platform/billing")} />
        <StatTile icon={AlertTriangle} label="Setup failed" value={overview.provisioningFailures} attention onClick={go(canApps, "/platform/applications?status=PROVISIONING_FAILED")} />
      </section>
      {drafts > 0 && canBilling && (
        <button
          type="button"
          onClick={() => nav("/platform/billing?pane=invoices&status=DRAFT")}
          className="-mt-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden /> {drafts} draft {drafts === 1 ? "invoice" : "invoices"} to issue <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}

      {/* Pipeline + trend */}
      <div className="grid gap-5 lg:grid-cols-5">
        <Panel title="Pipeline" icon={Rocket} aside={`${n("ACTIVE")} live from applications`} className="lg:col-span-2">
          <ol className="space-y-1" aria-label="Applications per step">
            {TRACKER_STEPS.map((s, i) => {
              const Icon = STEP_ICONS[s];
              const c = stepCount(s);
              const failed = s === "setup" && n("PROVISIONING_FAILED") > 0;
              const max = Math.max(1, ...TRACKER_STEPS.map(stepCount));
              const row = (
                <>
                  <span className={cx("relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full", failed ? "bg-red-600 text-white" : c > 0 ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500")}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="w-20 shrink-0 text-sm font-medium text-gray-700 dark:text-gray-200">{STEP_LABELS[s]}</span>
                  <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800/70">
                    <motion.span className={cx("absolute inset-y-0 left-0 rounded-full", failed ? TONE.red.solid : TONE.blue.solid)} initial={{ width: 0 }} animate={{ width: `${(c / max) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.05 }} />
                  </span>
                  <span className="w-8 shrink-0 text-right text-sm font-bold tabular-nums text-gray-900 dark:text-white">{c}</span>
                </>
              );
              return (
                <li key={s} className="relative">
                  {i < TRACKER_STEPS.length - 1 && <span className="absolute left-[1.1rem] top-9 h-3 w-px bg-gray-200 dark:bg-gray-700/50" aria-hidden />}
                  {canApps ? (
                    <button type="button" onClick={() => nav(`/platform/applications?step=${s}`)} aria-label={`${STEP_LABELS[s]}: ${c}`} className="flex w-full items-center gap-3 rounded-full px-1 py-1 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-gray-800/50">
                      {row}
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 px-1 py-1">{row}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </Panel>
        <Panel title="Last 12 weeks" icon={Sparkles} aside={`${totals.submitted} applied · ${totals.activated} went live`} className="lg:col-span-3">
          <TrendChart
            data={overview.trend}
            x="week"
            series={[
              { key: "submitted", label: "Applied" },
              { key: "activated", label: "Went live" },
            ]}
            label={`Applications submitted and schools activated per week over the last 12 weeks: ${totals.submitted} submitted, ${totals.activated} activated`}
          />
        </Panel>
      </div>

      {/* Schools: plans, renewals, activity; money */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Plans" icon={Package} aside="live schools">
          {packages === null || loadingSchools ? (
            <div className="space-y-2">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : (
            <BarList
              label="Live schools per plan"
              items={derived.mix.map(({ p, n: count }): BarItem => ({ key: p.code, label: p.name, value: count, onClick: canSchools ? () => nav(`/platform/schools?package=${p.code}`) : undefined }))}
              empty="No plans yet"
            />
          )}
        </Panel>
        <Panel title="Renewals" icon={AlarmClock} aside="next 30 days">
          {loadingSchools ? (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : derived.renewals.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <p className="text-sm text-gray-600 dark:text-gray-300">No renewal in the next 30 days.</p>
            </div>
          ) : (
            <ul className="space-y-1" aria-label="Renewals in the next 30 days">
              {derived.renewals.map(({ t, d }) => (
                <li key={t.tid}>
                  <button type="button" onClick={() => nav(`/platform/schools/${t.tid}`)} className="flex w-full items-center gap-3 rounded-full px-2 py-1.5 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-gray-800/50">
                    <DaysRing days={d} total={30} size={48} caption="days" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{t.name}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">{t.status === "GRACE" ? "Grace period ends" : d < 0 ? "Period ended" : "Period ends"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Most active" icon={Users} aside="people signed in · 7 days">
          {loadingSchools ? (
            <div className="space-y-2">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : (
            <BarList
              label="Most active schools this week"
              items={derived.busiest.map(
                (t): BarItem => ({
                  key: String(t.tid),
                  label: t.name,
                  value: t.activeUsers7d,
                  icon: <TenantLogo src={null} name={t.name} isPrimary={false} className="h-5 w-5 shrink-0" />,
                  onClick: () => nav(`/platform/schools/${t.tid}`),
                }),
              )}
              empty="No activity yet"
            />
          )}
        </Panel>
      </div>

      {canBilling && (
        <Panel title="Collected" icon={CircleDollarSign} aside="confirmed payments per month · last 6 months">
          <TrendChart data={collected} x="month" xFormat={monthLabel} yWidth={48} series={[{ key: "collected", label: "Collected" }]} format={(v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} height={180} label={`Money received from confirmed payments per month over the last 6 months: ${collected.map((c) => money(c.collected)).join(", ")}`} />
        </Panel>
      )}

      <TenancyHealthCard />
    </div>
  );
};

export default DashboardPage;
