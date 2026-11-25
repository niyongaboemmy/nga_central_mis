import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  Archive,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Crown,
  Globe2,
  GraduationCap,
  HardDrive,
  Image as ImageIcon,
  Infinity as InfinityIcon,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  Loader2,
  Lock,
  MapPin,
  Minus,
  Package as PackageIcon,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  Receipt,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Timer,
  Trash2,
  TriangleAlert,
  UserCog,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import ConfirmDialog from "../../ui/ConfirmDialog";
import { EmptyState, PackageCard, Pill, StatusPill, entIcon, formatMb, isLiveStatus, statusLabel } from "../kit";
import SelectField from "../../ui/SelectField";
import { formatMoney, platformApi, type Entitlement, type PackageInfo, type ProvisioningRun, type StepStatus, type TenantAdmin, type TenantDetail, type TenantLifecycle } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { Btn, Card, IconBtn, ReasonDialog, Skeleton, SkeletonGrid, SkeletonPage, Stepper, Switch, TabBar, act, ago, cx, daysUntil, errorText, fmtDate, fmtDateTime, initials, inputCls, sectionTitle, surface, usePlatform } from "./platformShared";
import { DailyBars, DaysRing, IconTile, Panel, StatTile, TONE, limitTone } from "../viz";
import { InvoiceList } from "./BillingPage";
import SchoolAdminsTab from "./SchoolAdminsTab";
import EditSchoolDetailsDialog, { LogoEditor } from "./EditSchoolDetailsDialog";

type Tab = "dashboard" | "admins" | "plan" | "billing" | "lifecycle" | "audit";
type LAction = TenantDetail["allowedActions"][number];

const SchoolDetailPage: React.FC = () => {
  const tid = Number(useParams().tid);
  const [d, setD] = useState<TenantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [deleted, setDeleted] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    platformApi.tenant(tid).then(setD, (e) => setError(errorText(e)));
  }, [tid]);
  if (deleted) return <EmptyState icon={Trash2} title="Deleted"><Link to="/platform/schools" className="text-blue-700 underline dark:text-blue-400">Schools</Link></EmptyState>;
  if (error) return <EmptyState icon={TriangleAlert} title={error} />;
  if (!d) return <SkeletonPage label="Loading the school" />;
  const canEdit = d.allowedActions.includes("edit_details");
  const overdue = d.invoices.filter((i) => i.status === "OVERDUE").length;
  return (
    <div className="space-y-4">
      <IdentityHero d={d} canEdit={canEdit} onChange={setD} onEdit={() => setEditing(true)} />
      <TabBar
        id="school"
        label="School"
        visible={6}
        visibleSm={2}
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "dashboard", label: "Dashboard", icon: LayoutDashboard, badge: d.provisioning?.status === "FAILED" ? 1 : 0 },
          { value: "admins", label: "Admins", icon: Users },
          { value: "plan", label: "Plan & apps", icon: PackageIcon },
          { value: "billing", label: "Billing", icon: Receipt, badge: overdue },
          { value: "lifecycle", label: "Lifecycle", icon: Timer },
          { value: "audit", label: "Audit", icon: ScrollText },
        ]}
      />
      <div role="tabpanel">
        {tab === "dashboard" && <DashboardTab d={d} onRun={(run) => setD({ ...d, provisioning: run })} go={setTab} />}
        {tab === "admins" && <SchoolAdminsTab d={d} />}
        {tab === "plan" && <PackageTab d={d} onChange={setD} apps={<AppsTab d={d} onChange={setD} />} />}
        {tab === "billing" && <InvoiceList invoices={d.invoices} onChange={(inv) => setD({ ...d, invoices: d.invoices.map((x) => (x.id === inv.id ? inv : x)) })} />}
        {tab === "lifecycle" && <LifecycleTab d={d} onChange={setD} onDeleted={() => setDeleted(true)} />}
        {tab === "audit" && <AuditList entries={d.audit} />}
      </div>
      {canEdit && (
        <EditSchoolDetailsDialog
          d={d}
          open={editing}
          onClose={() => setEditing(false)}
          onLogo={setD}
          onSaved={(next) => {
            setEditing(false);
            setD(next);
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Identity hero: logo (click / drop to change), name, address, status, plan, renewal
// ---------------------------------------------------------------------------

const Chip: React.FC<{ icon?: LucideIcon; children: React.ReactNode; mono?: boolean; title?: string }> = ({ icon: Icon, children, mono, title }) => (
  <span title={title} className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800/70 dark:text-gray-200", mono && "font-mono")}>
    {Icon && <Icon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" aria-hidden />}
    {children}
  </span>
);

const IdentityHero: React.FC<{ d: TenantDetail; canEdit: boolean; onChange: (d: TenantDetail) => void; onEdit: () => void }> = ({ d, canEdit, onChange, onEdit }) => {
  const t = d.tenant;
  const grace = t.status === "GRACE" && t.graceUntil;
  const days = t.isPrimary ? null : daysUntil(grace ? t.graceUntil : (d.subscription?.periodEnd ?? t.periodEnd));
  const pkgName = d.subscription?.packageCode ?? t.pkg;
  return (
    <section className={cx(surface.card, "p-4 sm:p-5")}>
      <Link
        to="/platform/schools"
        className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-gray-100 py-1 pl-2 pr-3 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-gray-800/70 dark:text-gray-300 dark:hover:bg-gray-800"
        aria-label="Back to schools"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        <span aria-hidden>Schools</span>
      </Link>
      <div className="flex flex-wrap items-center gap-4">
        <LogoEditor d={d} canEdit={canEdit} onChange={onChange} />
        <div className="min-w-[12rem] flex-1">
          <h1 className="line-clamp-2 break-words text-xl font-bold tracking-tight text-gray-900 dark:text-white sm:truncate sm:text-2xl" title={t.name}>{t.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusPill status={t.status} live={isLiveStatus(t.status)} />
            {t.isPrimary && (
              <Pill tone="blue" icon={ShieldCheck}>
                Primary
              </Pill>
            )}
            <Chip icon={Globe2} mono title="Web address">
              {t.slug}
            </Chip>
            <Chip icon={PackageIcon} title="Package">
              <span className="capitalize">{pkgName}</span>
              {d.subscription && <span className="text-gray-400 dark:text-gray-500">· {d.subscription.billingCycle === "YEAR" ? "year" : "term"}</span>}
            </Chip>
            {t.country && <Chip icon={MapPin}>{t.country}</Chip>}
            <Chip icon={Clock}>{t.timezone.replace(/_/g, " ")}</Chip>
          </div>
          {t.statusReason && <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-400/10 dark:text-amber-100"><TriangleAlert className="h-3.5 w-3.5" aria-hidden />{t.statusReason}</p>}
        </div>
        <div className="flex items-center gap-4">
          {!t.isPrimary && (
            <div className="flex items-center gap-2">
              <DaysRing days={days} size={60} />
              <div className="text-xs leading-tight">
                <p className="font-semibold text-gray-900 dark:text-white">{grace ? "Grace" : days !== null && days < 0 ? "Expired" : "Renews"}</p>
                <p className="text-gray-500 dark:text-gray-400">{fmtDate(grace ? t.graceUntil : (d.subscription?.periodEnd ?? t.periodEnd))}</p>
              </div>
            </div>
          )}
          {canEdit && (
            <Btn tone="primary" icon={Pencil} onClick={onEdit}>
              Edit details
            </Btn>
          )}
        </div>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Dashboard: usage, activity, apps, money, people, history
// ---------------------------------------------------------------------------

const LimitHint: React.FC<{ used: number; limit: number | null; ratio: number | null; fmt: (n: number) => string }> = ({ used, limit, ratio, fmt }) =>
  limit === null ? (
    <span className="inline-flex items-center gap-1">
      <InfinityIcon className="h-3.5 w-3.5" aria-hidden /> Unlimited
    </span>
  ) : (
    <span className="block">
      <span className="mb-1 block h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800" role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} aria-label={`${fmt(used)} of ${fmt(limit)}`}>
        <span className={cx("block h-full rounded-full", TONE[limitTone(ratio)].solid)} style={{ width: `${Math.max(2, Math.min(100, (ratio ?? 0) * 100))}%` }} />
      </span>
      of {fmt(limit)}
    </span>
  );

const auditIcon = (action: string): LucideIcon => {
  if (action.includes("logo")) return ImageIcon;
  if (action.includes("details")) return Pencil;
  if (action.includes("suspend")) return PauseCircle;
  if (action.includes("reactivate")) return PlayCircle;
  if (action.includes("archive")) return Archive;
  if (action.includes("delete")) return Trash2;
  if (action.includes("package")) return PackageIcon;
  if (action.includes("override") || action.includes("app")) return LayoutGrid;
  if (action.includes("admin") || action.includes("person")) return UserCog;
  if (action.includes("invoice") || action.includes("payment")) return Receipt;
  if (action.includes("grace")) return Timer;
  return Activity;
};

const DashboardTab: React.FC<{ d: TenantDetail; onRun: (r: ProvisioningRun) => void; go: (t: Tab) => void }> = ({ d, onRun, go }) => {
  const t = d.tenant;
  const meter = (k: string) => d.usage.meters.find((m) => m.key === k);
  const daily = d.usage.daily;
  const sum = (k: "aiRequests" | "codeRuns") => daily.reduce((n, x) => n + (x[k] ?? 0), 0);
  const peak = daily.reduce((n, x) => Math.max(n, x.activeUsers), 0);
  const tiles: Array<{ key: string; icon: LucideIcon; label: string; fmt: (n: number) => string; fallback: number }> = [
    { key: "limit.students", icon: GraduationCap, label: "Students", fmt: (n) => n.toLocaleString(), fallback: t.students },
    { key: "limit.staff", icon: Users, label: "Staff", fmt: (n) => n.toLocaleString(), fallback: t.staff },
    { key: "limit.storage_gb", icon: HardDrive, label: "Storage", fmt: formatMb, fallback: t.storageMb },
  ];
  return (
    <div className="space-y-4">
      {d.provisioning && <ProvisioningPanel run={d.provisioning} onRun={onRun} />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((x) => {
          const m = meter(x.key);
          const used = m?.used ?? x.fallback;
          return (
            <StatTile
              key={x.key}
              icon={x.icon}
              label={x.label}
              value={used}
              format={x.fmt}
              tone={limitTone(m?.ratio ?? null)}
              hint={m ? <LimitHint used={used} limit={m.limit} ratio={m.ratio} fmt={x.fmt} /> : undefined}
            />
          );
        })}
        <StatTile icon={Activity} label="Active this week" value={t.activeUsers7d} spark={daily.map((x) => x.activeUsers)} hint={t.lastActivityAt ? `last seen ${ago(t.lastActivityAt)} ago` : "no activity yet"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Activity" icon={Activity} aside="30 days" className="lg:col-span-2">
          {daily.length ? (
            <>
              <DailyBars data={daily} x="day" y="activeUsers" name="Active people" label="Active people per day, last 30 days" />
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { icon: Users, label: "Busiest day", value: peak },
                  { icon: Sparkles, label: "AI requests", value: sum("aiRequests") },
                  { icon: Code2, label: "Code runs", value: sum("codeRuns") },
                ].map((s) => (
                  <div key={s.label} className={cx(surface.inset, "flex items-center gap-2 px-3 py-2")}>
                    <s.icon className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">{s.value.toLocaleString()}</p>
                      <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon={Activity} title="No activity yet" />
          )}
        </Panel>
        <Panel
          title="Apps"
          icon={LayoutGrid}
          aside={`${d.apps.filter((a) => a.status === "ACTIVE").length} on`}
          action={<LinkBtn onClick={() => go("plan")} label="Plan & apps" />}
        >
          {d.apps.length ? (
            <ul className="grid grid-cols-3 gap-2" aria-label="Apps">
              {d.apps.map((a) => {
                const Icon = entIcon(appKeyOf(a.name, a.clientId));
                const on = a.status === "ACTIVE";
                return (
                  <li key={a.systemId} title={`${a.name}: ${on ? "on" : "off"}`} className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-center">
                    <span className={cx("relative flex h-11 w-11 items-center justify-center rounded-xl", on ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400 dark:bg-gray-800/70 dark:text-gray-500")}>
                      <Icon className="h-5 w-5" aria-hidden />
                      {!on && <Lock className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-white p-0.5 text-gray-500 dark:bg-gray-900" aria-hidden />}
                    </span>
                    <span className={cx("w-full truncate text-[11px] font-medium", on ? "text-gray-800 dark:text-gray-100" : "text-gray-400 dark:text-gray-500")}>{a.name}</span>
                    <span className="sr-only">{on ? "on" : "off"}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={LayoutGrid} title="No apps" />
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <BillingSnapshot d={d} go={go} />
        <AdminsSnapshot tid={t.tid} go={go} />
        <Panel title="Recent activity" icon={ScrollText} action={d.audit.length > 5 ? <LinkBtn onClick={() => go("audit")} label="All" /> : undefined}>
          {d.audit.length ? (
            <ol className="space-y-3" aria-label="Recent activity">
              {d.audit.slice(0, 5).map((e) => {
                const Icon = auditIcon(e.action);
                return (
                  <li key={e.id} className="flex items-start gap-3">
                    <IconTile icon={Icon} tone="gray" size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{auditLabel(e.action)}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {e.actor ?? "System"} · {ago(e.at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState icon={ScrollText} title="Nothing recorded yet" />
          )}
        </Panel>
      </div>
    </div>
  );
};

const LinkBtn: React.FC<{ onClick: () => void; label: string }> = ({ onClick, label }) => (
  <button type="button" onClick={onClick} className="inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400 dark:hover:bg-blue-500/10">
    {label}
    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
  </button>
);

const BillingSnapshot: React.FC<{ d: TenantDetail; go: (t: Tab) => void }> = ({ d, go }) => {
  const open = d.invoices.filter((i) => i.status === "ISSUED" || i.status === "OVERDUE");
  const overdue = open.filter((i) => i.status === "OVERDUE");
  const owed = open.reduce((n, i) => n + i.amount, 0);
  const currency = open[0]?.currency ?? d.invoices[0]?.currency ?? "RWF";
  const nextDue = open.map((i) => i.dueAt).filter(Boolean).sort()[0] ?? null;
  const lastPaid = d.invoices.filter((i) => i.status === "PAID" && i.paidAt).sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)))[0];
  return (
    <Panel title="Billing" icon={Wallet} action={<LinkBtn onClick={() => go("billing")} label="Invoices" />}>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <IconTile icon={owed > 0 ? (overdue.length ? TriangleAlert : Receipt) : CheckCircle2} tone={overdue.length ? "red" : owed > 0 ? "amber" : "emerald"} />
          <div>
            <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">{formatMoney(owed, currency)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{owed > 0 ? `outstanding · ${open.length} open${overdue.length ? ` · ${overdue.length} overdue` : ""}` : "nothing owed"}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2">
          <div className={cx(surface.inset, "px-3 py-2")}>
            <dt className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Next due
            </dt>
            <dd className="text-sm font-semibold text-gray-900 dark:text-white">{nextDue ? fmtDate(nextDue) : "—"}</dd>
          </div>
          <div className={cx(surface.inset, "px-3 py-2")}>
            <dt className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Last paid
            </dt>
            <dd className="text-sm font-semibold text-gray-900 dark:text-white">{lastPaid ? fmtDate(lastPaid.paidAt) : "—"}</dd>
          </div>
        </dl>
      </div>
    </Panel>
  );
};

const AdminsSnapshot: React.FC<{ tid: number; go: (t: Tab) => void }> = ({ tid, go }) => {
  const [admins, setAdmins] = useState<TenantAdmin[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.resolve(platformApi.admins(tid))
      .then((r) => live && setAdmins(Array.isArray(r) ? r : []))
      .catch(() => live && (setAdmins([]), setFailed(true)));
    return () => {
      live = false;
    };
  }, [tid]);
  const active = admins?.filter((a) => a.status === "ACTIVE") ?? [];
  const owners = active.filter((a) => a.kind === "OWNER").length;
  const pending = active.filter((a) => a.mustChangePassword).length;
  return (
    <Panel title="Administrators" icon={UserCog} action={<LinkBtn onClick={() => go("admins")} label="Manage" />}>
      {admins === null ? (
        <div className="space-y-3" role="status" aria-busy="true" aria-label="Loading administrators">
          <div className="flex -space-x-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-10 !rounded-full ring-2 ring-white dark:ring-gray-900" />
            ))}
          </div>
          <Skeleton className="h-3.5 w-32" />
        </div>
      ) : failed ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Couldn't load the administrators.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2" aria-hidden>
              {active.slice(0, 5).map((a) => (
                <span key={a.userId} title={a.name} className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700 ring-2 ring-white dark:bg-blue-500/15 dark:text-blue-300 dark:ring-gray-900">
                  {initials(a.name) || "?"}
                </span>
              ))}
              {active.length > 5 && <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600 ring-2 ring-white dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-900">+{active.length - 5}</span>}
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-white">{active.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">active</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Pill tone="blue" icon={Crown}>
              {owners} {owners === 1 ? "owner" : "owners"}
            </Pill>
            {pending > 0 && (
              <Pill tone="amber" icon={KeyRound}>
                {pending} without a password
              </Pill>
            )}
            {owners === 0 && (
              <Pill tone="red" icon={TriangleAlert}>
                No owner
              </Pill>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
};

const STEP_ICON: Record<StepStatus, { icon: LucideIcon; cls: string; spin?: boolean }> = {
  PENDING: { icon: Clock, cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300" },
  RUNNING: { icon: Loader2, cls: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200", spin: true },
  DONE: { icon: Check, cls: "bg-emerald-500 text-white" },
  FAILED: { icon: X, cls: "bg-red-500 text-white" },
  SKIPPED: { icon: SkipForward, cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300" },
};

export const ProvisioningPanel: React.FC<{ run: ProvisioningRun; onRun: (r: ProvisioningRun) => void }> = ({ run, onRun }) => {
  const { can } = usePlatform();
  const [busy, setBusy] = useState(false);
  const m = useMotion();
  const live = run.status === "RUNNING" || run.status === "PENDING";
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  useEffect(() => {
    if (!live) return;
    const h = window.setInterval(() => platformApi.provisioning(run.id).then((r) => onRunRef.current(r), () => undefined), 3000);
    return () => window.clearInterval(h);
  }, [live, run.id]);
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <h2 className={cx(sectionTitle, "flex-1")}>Setup · #{run.attempt}</h2>
        <StatusPill status={run.status === "DONE" ? "CONFIRMED" : run.status === "FAILED" ? "PROVISIONING_FAILED" : "PROVISIONING"} label={statusLabel(run.status)} />
        {run.status === "FAILED" && can("lifecycle") && (
          <Btn
            size="sm"
            tone="primary"
            icon={RotateCcw}
            busy={busy}
            onClick={async () => {
              setBusy(true);
              const next = await act(() => platformApi.retryProvisioning(run.id), "Retrying");
              setBusy(false);
              if (next) onRun(next);
            }}
          >
            Retry
          </Btn>
        )}
      </div>
      <ol className="space-y-1.5">
        {run.steps.map((s) => {
          const meta = STEP_ICON[s.status];
          const Icon = meta.icon;
          return (
            <motion.li key={s.key} layout {...m("reveal")}>
              <details className="group rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60">
                <summary className="flex cursor-pointer list-none items-center gap-3 p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", meta.cls)}>
                    <Icon className={cx("h-4 w-4", meta.spin && "animate-spin")} aria-hidden />
                  </span>
                  <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">{s.label}</span>
                  <span className="sr-only">{statusLabel(s.status)}</span>
                  {s.finishedAt && <span className="text-xs text-gray-600 dark:text-gray-300">{fmtDateTime(s.finishedAt)}</span>}
                  {s.log && <ChevronDown className="h-4 w-4 text-gray-500 transition-transform group-open:rotate-180" aria-hidden />}
                </summary>
                {s.log && <pre className="mx-2 mb-2 max-h-60 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">{s.log}</pre>}
              </details>
            </motion.li>
          );
        })}
      </ol>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Package & limits
// ---------------------------------------------------------------------------

const PackageTab: React.FC<{ d: TenantDetail; onChange: (d: TenantDetail) => void; apps?: React.ReactNode }> = ({ d, onChange, apps }) => {
  const [packages, setPackages] = useState<PackageInfo[] | null>(null);
  const [catalog, setCatalog] = useState<Entitlement[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const canChange = d.allowedActions.includes("change_package");
  const canOverride = d.allowedActions.includes("override");
  useEffect(() => {
    platformApi.packages().then(setPackages, () => setPackages([]));
    platformApi.entitlementCatalog().then(setCatalog, () => undefined);
  }, []);
  const current = packages?.find((p) => p.code === d.entitlements.pkg) ?? packages?.find((p) => p.code === d.tenant.pkg);
  const target = packages?.find((p) => p.code === pick);
  const diff = useMemo(() => {
    if (!current || !target) return { gained: [] as Entitlement[], lost: [] as Entitlement[] };
    const held = (p: PackageInfo) => new Set(p.entitlements.filter((e) => e.kind !== "LIMIT").map((e) => e.key));
    const a = held(current);
    const b = held(target);
    return { gained: target.entitlements.filter((e) => e.kind !== "LIMIT" && !a.has(e.key)), lost: current.entitlements.filter((e) => e.kind !== "LIMIT" && !b.has(e.key)) };
  }, [current, target]);
  const cycle = d.subscription?.billingCycle ?? "TERM";

  return (
    <div className="space-y-4">
      {!packages ? (
        <SkeletonGrid cards={4} label="Loading packages" className="grid gap-4 pt-3 sm:grid-cols-2 lg:grid-cols-4" cardClassName="h-48" />
      ) : (
        <div className="grid gap-4 pt-3 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Package">
          {packages.map((p) => (
            <PackageCard
              key={p.code}
              pkg={p}
              allEntitlements={catalog.length ? catalog : undefined}
              cycle={cycle}
              current={p.code === current?.code}
              selected={p.code === pick}
              onSelect={canChange && p.code !== current?.code ? () => setPick(p.code === pick ? null : p.code) : undefined}
            />
          ))}
        </div>
      )}
      <AnimatePresence>
        {target && current && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
            <Card className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                {current.name}
                <ArrowRight className="h-4 w-4" aria-hidden />
                {target.name}
              </div>
              <DiffRow items={diff.gained} kind="gained" />
              <DiffRow items={diff.lost} kind="lost" />
              <textarea aria-label="Reason" placeholder="Reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
              <div className="flex justify-end gap-2">
                <Btn onClick={() => setPick(null)}>Cancel</Btn>
                <Btn
                  tone="primary"
                  icon={Check}
                  disabled={reason.trim().length < 3}
                  busy={busy}
                  onClick={async () => {
                    setBusy(true);
                    const next = await act(() => platformApi.changePackage(d.tenant.tid, target.code, reason.trim()), "Package changed");
                    setBusy(false);
                    if (next) {
                      onChange(next);
                      setPick(null);
                      setReason("");
                    }
                  }}
                >
                  Change
                </Btn>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      {apps && (
        <Panel title="Apps" icon={LayoutGrid} aside={`${d.apps.filter((a) => a.status === "ACTIVE").length} of ${d.apps.length} on`}>
          {apps}
        </Panel>
      )}
      <Overrides d={d} catalog={catalog} canEdit={canOverride} onChange={onChange} />
    </div>
  );
};

const DiffRow: React.FC<{ items: Entitlement[]; kind: "gained" | "lost" }> = ({ items, kind }) => {
  const reduced = useReducedMotion();
  if (!items.length) return null;
  const Sign = kind === "gained" ? Plus : Minus;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={kind === "gained" ? "Gained" : "Lost"}>
      <Sign className={cx("h-4 w-4", kind === "gained" ? "text-emerald-600" : "text-red-600")} aria-hidden />
      {items.map((e, i) => {
        const Icon = entIcon(e.key);
        return (
          <motion.span
            key={e.key}
            title={e.label}
            initial={reduced ? false : { scale: 0, rotate: kind === "gained" ? -20 : 20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: i * 0.04, type: "spring", stiffness: 500, damping: 20 }}
            className={cx(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              kind === "gained" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200" : "bg-red-100 text-red-700 line-through dark:bg-red-400/15 dark:text-red-200",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span className="sr-only">
              {e.label} {kind}
            </span>
          </motion.span>
        );
      })}
    </div>
  );
};

const Overrides: React.FC<{ d: TenantDetail; catalog: Entitlement[]; canEdit: boolean; onChange: (d: TenantDetail) => void }> = ({ d, catalog, canEdit, onChange }) => {
  const [key, setKey] = useState("");
  const [value, setValue] = useState<number>(0);
  const [unlimited, setUnlimited] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const ent = catalog.find((e) => e.key === key);
  const labelOf = (k: string) => catalog.find((e) => e.key === k)?.label ?? k;
  const reset = () => {
    setKey("");
    setValue(0);
    setUnlimited(false);
    setEnabled(true);
    setReason("");
    setExpiresAt("");
  };
  return (
    <Card className="space-y-3">
      <h2 className={sectionTitle}>Overrides</h2>
      {d.overrides.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">—</p>
      ) : (
        <ul className="space-y-1.5">
          {d.overrides.map((o) => {
            const Icon = entIcon(o.key);
            const kind = catalog.find((e) => e.key === o.key)?.kind ?? (o.key.startsWith("limit.") ? "LIMIT" : "FEATURE");
            return (
              <li key={o.id} className="flex items-center gap-3 rounded-xl bg-gray-50 p-2 dark:bg-gray-800/50">
                <Icon className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-300" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                    {labelOf(o.key)}{" "}
                    <span className={cx("ml-1 rounded-full px-1.5 text-xs", o.enabled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200" : "bg-red-100 text-red-800 dark:bg-red-400/15 dark:text-red-200")}>
                      {kind === "LIMIT" ? (o.value === null ? "∞" : o.value.toLocaleString()) : o.enabled ? "On" : "Off"}
                    </span>
                  </p>
                  <p className="truncate text-xs text-gray-600 dark:text-gray-300">
                    {o.reason}
                    {o.expiresAt && ` · ⏳ ${fmtDate(o.expiresAt)}`}
                    {o.grantedBy && ` · ${o.grantedBy}`}
                  </p>
                </div>
                {canEdit && (
                  <IconBtn
                    icon={removing === o.id ? Loader2 : Trash2}
                    label={`Remove ${labelOf(o.key)}`}
                    tone="danger"
                    disabled={removing !== null}
                    onClick={async () => {
                      setRemoving(o.id);
                      const next = await act(() => platformApi.removeOverride(d.tenant.tid, o.id), "Removed");
                      setRemoving(null);
                      if (next) onChange(next);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && (
        <form
          className={cx(surface.inset, "grid gap-2 p-3 sm:grid-cols-2")}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!ent || reason.trim().length < 3) return;
            setBusy(true);
            const next = await act(
              () =>
                platformApi.addOverride(d.tenant.tid, {
                  key: ent.key,
                  value: ent.kind === "LIMIT" ? (unlimited ? null : value) : null,
                  enabled: ent.kind === "LIMIT" ? true : enabled,
                  reason: reason.trim(),
                  expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
                }),
              "Override added",
            );
            setBusy(false);
            if (next) {
              onChange(next);
              reset();
            }
          }}
        >
          <div className="flex items-center gap-2">
            {ent && React.createElement(entIcon(ent.key), { className: "h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400", "aria-hidden": true })}
            <SelectField aria-label="Entitlement" value={key} onChange={(e) => setKey(e.target.value)} className={inputCls}>
              <option value="">Entitlement…</option>
              {(["APP", "FEATURE", "LIMIT"] as const).map((k) => (
                <optgroup key={k} label={k === "APP" ? "Apps" : k === "FEATURE" ? "Features" : "Limits"}>
                  {catalog
                    .filter((e) => e.kind === k)
                    .map((e) => (
                      <option key={e.key} value={e.key}>
                        {e.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </SelectField>
          </div>
          <div className="flex items-center gap-2">
            {ent?.kind === "LIMIT" ? (
              <>
                <input aria-label="Value" type="number" min={0} value={Number.isNaN(value) ? "" : value} disabled={unlimited} onChange={(e) => setValue(e.target.value === "" ? NaN : Number(e.target.value))} className={cx(inputCls, "w-32")} />
                <button
                  type="button"
                  aria-pressed={unlimited}
                  onClick={() => setUnlimited(!unlimited)}
                  className={cx("flex h-9 w-9 items-center justify-center rounded-full", unlimited ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300")}
                  title="Unlimited"
                >
                  <InfinityIcon className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Unlimited</span>
                </button>
              </>
            ) : ent ? (
              <Switch checked={enabled} onChange={setEnabled} label={enabled ? "On" : "Off"} showLabel />
            ) : null}
            <input aria-label="Expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={cx(inputCls, "ml-auto w-40")} title="Expires" />
          </div>
          <input aria-label="Reason" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className={cx(inputCls, "sm:col-span-2")} />
          <div className="flex justify-end sm:col-span-2">
            <Btn type="submit" tone="primary" icon={Plus} disabled={!ent || reason.trim().length < 3 || (ent.kind === "LIMIT" && !unlimited && !(Number.isInteger(value) && value >= 0))} busy={busy}>
              Add
            </Btn>
          </div>
        </form>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Apps
// ---------------------------------------------------------------------------

const APP_HINTS: Array<[string, string]> = [
  ["tmcode", "app.tmcode"],
  ["task", "app.taskmentor"],
  ["tendo", "app.tendo"],
  ["discipline", "app.tendo"],
  ["tupo", "app.tupo"],
  ["desktop", "app.desktop"],
  ["mis", "app.mis"],
];
/** TenantSystem rows carry a name / client id, not the entitlement key: match for the icon. */
const appKeyOf = (name: string, clientId: string | null) => {
  const hay = `${clientId ?? ""} ${name}`.toLowerCase();
  return APP_HINTS.find(([h]) => hay.includes(h))?.[1] ?? "";
};

const AppsTab: React.FC<{ d: TenantDetail; onChange: (d: TenantDetail) => void }> = ({ d, onChange }) => {
  const { can } = usePlatform();
  const [busy, setBusy] = useState<number | null>(null);
  const edit = can("entitlements");
  if (!d.apps.length) return <EmptyState icon={LayoutGrid} title="No apps" />;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {d.apps.map((a) => {
        const Icon = entIcon(appKeyOf(a.name, a.clientId));
        const on = a.status === "ACTIVE";
        return (
          <li key={a.systemId} className={cx("flex items-center gap-3 rounded-2xl p-3 transition-colors", on ? "bg-blue-50 ring-1 ring-inset ring-blue-500/20 dark:bg-blue-500/10 dark:ring-blue-400/20" : "bg-white dark:bg-gray-800/40")}>
            <span className={cx("flex h-10 w-10 items-center justify-center rounded-xl", on ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300")}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-gray-900 dark:text-white">{a.name}</p>
              <span className={cx("rounded-full px-1.5 text-[11px] font-bold", a.source === "OVERRIDE" ? "bg-blue-100 text-blue-800 dark:bg-blue-400/15 dark:text-blue-200" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200")}>
                {a.source === "OVERRIDE" ? "Override" : "Package"}
              </span>
            </div>
            {busy === a.systemId ? (
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" aria-label="Saving" />
            ) : (
              <Switch
                checked={on}
                label={a.name}
                disabled={!edit}
                onChange={async (v) => {
                  setBusy(a.systemId);
                  const next = await act(() => platformApi.setTenantApp(d.tenant.tid, a.systemId, v ? "ACTIVE" : "DISABLED"));
                  setBusy(null);
                  if (next) onChange(next);
                }}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const STATES: Array<{ s: TenantLifecycle; icon: LucideIcon; ring: string; fill: string }> = [
  { s: "ACTIVE", icon: PlayCircle, ring: "ring-emerald-400/30", fill: "bg-emerald-500" },
  { s: "GRACE", icon: Timer, ring: "ring-amber-400/30", fill: "bg-amber-500" },
  { s: "SUSPENDED", icon: PauseCircle, ring: "ring-red-400/30", fill: "bg-red-500" },
  { s: "ARCHIVED", icon: Archive, ring: "ring-gray-400/30", fill: "bg-gray-500" },
];

const LifecycleTab: React.FC<{ d: TenantDetail; onChange: (d: TenantDetail) => void; onDeleted: () => void }> = ({ d, onChange, onDeleted }) => {
  const t = d.tenant;
  const reduced = useReducedMotion();
  const [dialog, setDialog] = useState<LAction | null>(null);
  const [days, setDays] = useState(7);
  const [deleting, setDeleting] = useState(false);
  const destructive: LAction[] = ["suspend", "archive", "delete"];
  const allowed = (x: LAction) => d.allowedActions.includes(x) && !(t.isPrimary && destructive.includes(x));
  const run = async (fn: () => Promise<TenantDetail>, ok: string) => {
    const next = await act(fn, ok);
    if (next) {
      onChange(next);
      setDialog(null);
    }
  };
  const ACTIONS: Array<{ a: LAction; label: string; icon: LucideIcon; tone: "primary" | "danger" | "warning" | "success" | "ghost" }> = [
    { a: "reactivate", label: "Reactivate", icon: PlayCircle, tone: "success" },
    { a: "extend_grace", label: "Grace", icon: Timer, tone: "warning" },
    { a: "suspend", label: "Suspend", icon: PauseCircle, tone: "danger" },
    { a: "archive", label: "Archive", icon: Archive, tone: "ghost" },
    { a: "delete", label: "Delete", icon: Trash2, tone: "danger" },
  ];
  return (
    <div className="space-y-4">
      <Card>
        <ol className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center" aria-label="Lifecycle">
          {STATES.map((st, i) => {
            const on = st.s === t.status;
            const Icon = st.icon;
            return (
              <React.Fragment key={st.s}>
                {i > 0 && <ArrowRight className="mx-auto h-5 w-5 rotate-90 text-gray-400 sm:rotate-0" aria-hidden />}
                <li aria-current={on ? "step" : undefined} className="relative flex flex-1 flex-col items-center gap-2 rounded-2xl p-3">
                  <span className="relative">
                    {on && !reduced && (
                      <motion.span className={cx("absolute inset-0 rounded-full", st.fill)} animate={{ scale: [1, 1.5], opacity: [0.45, 0] }} transition={{ duration: 1.8, repeat: Infinity }} aria-hidden />
                    )}
                    <span
                      className={cx(
                        "relative flex h-14 w-14 items-center justify-center rounded-full transition-all",
                        on ? cx(st.fill, "text-white ring-4", st.ring) : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500",
                      )}
                    >
                      <Icon className="h-7 w-7" aria-hidden />
                    </span>
                  </span>
                  <span className={cx("text-sm font-semibold", on ? "text-gray-900 dark:text-white" : "text-gray-600 dark:text-gray-300")}>{statusLabel(st.s)}</span>
                  {on && st.s === "GRACE" && t.graceUntil && <span className="text-xs text-gray-600 dark:text-gray-300">→ {fmtDate(t.graceUntil)}</span>}
                </li>
              </React.Fragment>
            );
          })}
        </ol>
      </Card>
      {t.isPrimary && (
        <p className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-400">
          <ShieldCheck className="h-5 w-5" aria-hidden />
          Primary
        </p>
      )}
      <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Lifecycle actions">
        {ACTIONS.filter((x) => allowed(x.a)).map((x) => (
          <Btn key={x.a} icon={x.icon} tone={x.tone} onClick={() => setDialog(x.a)}>
            {x.label}
          </Btn>
        ))}
      </div>

      <ReasonDialog open={dialog === "suspend"} title="Suspend" icon={PauseCircle} confirmText="Suspend" tone="danger" onClose={() => setDialog(null)} onSubmit={(r) => run(() => platformApi.suspend(t.tid, r), "Suspended")} />
      <ReasonDialog open={dialog === "reactivate"} title="Reactivate" icon={PlayCircle} confirmText="Reactivate" tone="success" onClose={() => setDialog(null)} onSubmit={(r) => run(() => platformApi.reactivate(t.tid, r), "Reactivated")} />
      <ReasonDialog open={dialog === "archive"} title="Archive" icon={Archive} confirmText="Archive" tone="warning" onClose={() => setDialog(null)} onSubmit={(r) => run(() => platformApi.archive(t.tid, r), "Archived")} />
      <ReasonDialog
        open={dialog === "extend_grace"}
        title="Extend grace"
        icon={Timer}
        confirmText={`+${days}d`}
        tone="warning"
        onClose={() => setDialog(null)}
        onSubmit={(r) => run(() => platformApi.extendGrace(t.tid, days, r), "Grace extended")}
      >
        <div className="flex justify-center">
          <Stepper value={days} onChange={setDays} min={1} max={90} label="Days" />
        </div>
      </ReasonDialog>
      <ConfirmDialog
        isOpen={dialog === "delete"}
        isLoading={deleting}
        tone="danger"
        title={`Delete ${t.name}`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmationPhrase={t.name}
        onCancel={() => setDialog(null)}
        onConfirm={async () => {
          setDeleting(true);
          const ok = await act(() => platformApi.deleteTenant(t.tid, t.name), "Deleted");
          setDeleting(false);
          setDialog(null);
          if (ok) onDeleted();
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Audit (school + platform-wide)
// ---------------------------------------------------------------------------

export const auditLabel = (action: string) => {
  const s = action.replace(/^platform\./i, "").replace(/[._]/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const AuditList: React.FC<{ entries: TenantDetail["audit"]; schoolName?: (tid: number | null) => string | null }> = ({ entries, schoolName }) => {
  const m = useMotion();
  if (!entries.length) return <EmptyState icon={ScrollText} title="No entries" />;
  return (
    <ol className={cx("relative space-y-3 border-l pl-5", surface.rail)} aria-label="Audit">
      <AnimatePresence initial={false}>
        {entries.map((e) => (
          <motion.li key={e.id} layout {...m("reveal")} className="relative">
            <span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full bg-blue-500" aria-hidden />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{auditLabel(e.action)}</span>
              {schoolName && e.targetTid !== null && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200">{schoolName(e.targetTid) ?? `#${e.targetTid}`}</span>}
              <time className="text-xs text-gray-600 dark:text-gray-300" dateTime={e.at}>
                {fmtDateTime(e.at)}
              </time>
              {e.actor && <span className="text-xs text-gray-600 dark:text-gray-300">· {e.actor}</span>}
            </div>
            {e.payload !== null && e.payload !== undefined && typeof e.payload === "object" && Object.keys(e.payload as object).length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-gray-600 dark:text-gray-300">Details</summary>
                <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-gray-50 p-2 text-xs text-gray-800 dark:bg-gray-800/50 dark:text-gray-100">{JSON.stringify(e.payload, null, 2)}</pre>
              </details>
            )}
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
};

export default SchoolDetailPage;
