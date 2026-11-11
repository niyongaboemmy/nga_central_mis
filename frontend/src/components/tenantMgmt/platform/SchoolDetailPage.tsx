import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  Clock,
  Gauge,
  Infinity as InfinityIcon,
  LayoutGrid,
  Loader2,
  Minus,
  Package as PackageIcon,
  PauseCircle,
  PlayCircle,
  Plus,
  Receipt,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  SkipForward,
  Timer,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import ConfirmDialog from "../../ui/ConfirmDialog";
import { EmptyState, Meter, PackageCard, StatusPill, entIcon, statusLabel } from "../kit";
import SelectField from "../../ui/SelectField";
import { platformApi, type Entitlement, type PackageInfo, type ProvisioningRun, type StepStatus, type TenantDetail, type TenantLifecycle } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { Btn, Card, IconBtn, ReasonDialog, Spinner, Stepper, Switch, TabBar, act, cx, errorText, fmtDate, fmtDateTime, inputCls, usePlatform } from "./platformShared";
import { InvoiceList } from "./BillingPage";
import { PeriodChip } from "./SchoolsPage";
import { useChartTheme } from "./chartTheme";

type Tab = "overview" | "package" | "apps" | "usage" | "billing" | "lifecycle" | "audit";
type LAction = TenantDetail["allowedActions"][number];

const SchoolDetailPage: React.FC = () => {
  const tid = Number(useParams().tid);
  const [d, setD] = useState<TenantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [deleted, setDeleted] = useState(false);
  useEffect(() => {
    platformApi.tenant(tid).then(setD, (e) => setError(errorText(e)));
  }, [tid]);
  if (deleted) return <EmptyState icon={Trash2} title="Deleted"><Link to="/platform/schools" className="text-brand-700 underline dark:text-brand-200">Schools</Link></EmptyState>;
  if (error) return <EmptyState icon={TriangleAlert} title={error} />;
  if (!d) return <Spinner />;
  const t = d.tenant;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/platform/schools" className="rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Back to schools">
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <h1 className="flex min-w-0 flex-1 items-center gap-2 truncate text-xl font-bold text-slate-900 dark:text-white">
          {t.isPrimary && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              Primary
            </span>
          )}
          <span className="truncate">{t.name}</span>
        </h1>
        <StatusPill status={t.status} />
        <PeriodChip periodEnd={t.periodEnd} graceUntil={t.status === "GRACE" ? t.graceUntil : null} />
      </div>
      <TabBar
        id="school"
        label="School"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "overview", label: "Overview", icon: Gauge, badge: d.provisioning?.status === "FAILED" ? 1 : 0 },
          { value: "package", label: "Package", icon: PackageIcon },
          { value: "apps", label: "Apps", icon: LayoutGrid },
          { value: "usage", label: "Usage", icon: BarChart3 },
          { value: "billing", label: "Billing", icon: Receipt },
          { value: "lifecycle", label: "Lifecycle", icon: Timer },
          { value: "audit", label: "Audit", icon: ScrollText },
        ]}
      />
      <div role="tabpanel">
        {tab === "overview" && <OverviewTab d={d} onRun={(run) => setD({ ...d, provisioning: run })} />}
        {tab === "package" && <PackageTab d={d} onChange={setD} />}
        {tab === "apps" && <AppsTab d={d} onChange={setD} />}
        {tab === "usage" && <UsageTab d={d} />}
        {tab === "billing" && <InvoiceList invoices={d.invoices} onChange={(inv) => setD({ ...d, invoices: d.invoices.map((x) => (x.id === inv.id ? inv : x)) })} />}
        {tab === "lifecycle" && <LifecycleTab d={d} onChange={setD} onDeleted={() => setDeleted(true)} />}
        {tab === "audit" && <AuditList entries={d.audit} />}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Overview + provisioning
// ---------------------------------------------------------------------------

const OverviewTab: React.FC<{ d: TenantDetail; onRun: (r: ProvisioningRun) => void }> = ({ d, onRun }) => {
  const t = d.tenant;
  const facts: Array<[string, React.ReactNode]> = [
    ["Address", <span className="font-mono">{t.slug}</span>],
    ["Package", d.subscription ? `${d.subscription.packageCode} · ${d.subscription.billingCycle === "YEAR" ? "Year" : "Term"}` : t.pkg],
    ["Period", d.subscription ? `${fmtDate(d.subscription.periodStart)} → ${fmtDate(d.subscription.periodEnd)}` : "—"],
    ["Active 7d", t.activeUsers7d.toLocaleString()],
    ["Since", fmtDate(t.activatedAt ?? t.createdAt)],
    ["Timezone", t.timezone],
  ];
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap justify-around gap-4">
          {d.usage.meters.map((m) => (
            <Meter key={m.key} meter={m} />
          ))}
        </div>
      </Card>
      <Card>
        <dl className="grid gap-3 sm:grid-cols-3">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-slate-600 dark:text-slate-300">{k}</dt>
              <dd className="text-sm font-semibold text-slate-900 dark:text-white">{v}</dd>
            </div>
          ))}
        </dl>
        {t.statusReason && <p className="mt-3 rounded-xl bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">{t.statusReason}</p>}
      </Card>
      {d.provisioning && <ProvisioningPanel run={d.provisioning} onRun={onRun} />}
    </div>
  );
};

const STEP_ICON: Record<StepStatus, { icon: LucideIcon; cls: string; spin?: boolean }> = {
  PENDING: { icon: Clock, cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300" },
  RUNNING: { icon: Loader2, cls: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200", spin: true },
  DONE: { icon: Check, cls: "bg-emerald-500 text-white" },
  FAILED: { icon: X, cls: "bg-red-500 text-white" },
  SKIPPED: { icon: SkipForward, cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300" },
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
        <h2 className="flex-1 text-sm font-bold text-slate-900 dark:text-white">Setup · #{run.attempt}</h2>
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
              <details className="group rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <summary className="flex cursor-pointer list-none items-center gap-3 p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                  <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", meta.cls)}>
                    <Icon className={cx("h-4 w-4", meta.spin && "animate-spin")} aria-hidden />
                  </span>
                  <span className="flex-1 text-sm font-medium text-slate-900 dark:text-white">{s.label}</span>
                  <span className="sr-only">{statusLabel(s.status)}</span>
                  {s.finishedAt && <span className="text-xs text-slate-600 dark:text-slate-300">{fmtDateTime(s.finishedAt)}</span>}
                  {s.log && <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" aria-hidden />}
                </summary>
                {s.log && <pre className="mx-2 mb-2 max-h-60 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{s.log}</pre>}
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

const PackageTab: React.FC<{ d: TenantDetail; onChange: (d: TenantDetail) => void }> = ({ d, onChange }) => {
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
        <Spinner />
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
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
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
                  disabled={!reason.trim()}
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
      <h2 className="text-sm font-bold text-slate-900 dark:text-white">Overrides</h2>
      {d.overrides.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">—</p>
      ) : (
        <ul className="space-y-1.5">
          {d.overrides.map((o) => {
            const Icon = entIcon(o.key);
            const kind = catalog.find((e) => e.key === o.key)?.kind ?? (o.key.startsWith("limit.") ? "LIMIT" : "FEATURE");
            return (
              <li key={o.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-2 dark:bg-slate-800">
                <Icon className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {labelOf(o.key)}{" "}
                    <span className={cx("ml-1 rounded-full px-1.5 text-xs", o.enabled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200" : "bg-red-100 text-red-800 dark:bg-red-400/15 dark:text-red-200")}>
                      {kind === "LIMIT" ? (o.value === null ? "∞" : o.value.toLocaleString()) : o.enabled ? "On" : "Off"}
                    </span>
                  </p>
                  <p className="truncate text-xs text-slate-600 dark:text-slate-300">
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
          className="grid gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!ent || !reason.trim()) return;
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
            {ent && React.createElement(entIcon(ent.key), { className: "h-5 w-5 shrink-0 text-brand-600 dark:text-brand-200", "aria-hidden": true })}
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
                <input aria-label="Value" type="number" min={0} value={value} disabled={unlimited} onChange={(e) => setValue(Number(e.target.value))} className={cx(inputCls, "w-32")} />
                <button
                  type="button"
                  aria-pressed={unlimited}
                  onClick={() => setUnlimited(!unlimited)}
                  className={cx("flex h-9 w-9 items-center justify-center rounded-full", unlimited ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")}
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
            <Btn type="submit" tone="primary" icon={Plus} disabled={!ent || !reason.trim()} busy={busy}>
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
          <li key={a.systemId} className={cx("flex items-center gap-3 rounded-2xl border p-3 shadow-sm transition-colors", on ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-400/30 dark:bg-emerald-400/5" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900")}>
            <span className={cx("flex h-10 w-10 items-center justify-center rounded-xl", on ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300")}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-900 dark:text-white">{a.name}</p>
              <span className={cx("rounded-full px-1.5 text-[11px] font-bold", a.source === "OVERRIDE" ? "bg-violet-100 text-violet-800 dark:bg-violet-400/15 dark:text-violet-200" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200")}>
                {a.source === "OVERRIDE" ? "Override" : "Package"}
              </span>
            </div>
            {busy === a.systemId ? (
              <Loader2 className="h-5 w-5 animate-spin text-brand-500" aria-label="Saving" />
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
// Usage
// ---------------------------------------------------------------------------

const UsageTab: React.FC<{ d: TenantDetail }> = ({ d }) => {
  const ct = useChartTheme();
  const data = d.usage.daily.map((x) => ({ ...x, day: x.day.slice(5) }));
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap justify-around gap-4">
          {d.usage.meters.map((m) => (
            <Meter key={m.key} meter={m} />
          ))}
        </div>
      </Card>
      <Card>
        <h2 className="mb-2 text-sm font-bold text-slate-900 dark:text-white">30 days</h2>
        <div className="h-60" role="img" aria-label="Active users, AI requests and code runs per day, last 30 days">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={ct.grid} strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: ct.tick }} tickLine={false} axisLine={false} interval={4} />
              <YAxis allowDecimals={false} width={32} tick={{ fontSize: 11, fill: ct.tick }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={ct.tooltip} />
              <Legend wrapperStyle={{ fontSize: 12, color: ct.tick }} />
              <Line type="monotone" dataKey="activeUsers" name="Active" stroke={ct.series[0]} strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="aiRequests" name="AI" stroke={ct.series[2]} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="codeRuns" name="Code runs" stroke={ct.series[3]} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const STATES: Array<{ s: TenantLifecycle; icon: LucideIcon; ring: string; fill: string }> = [
  { s: "ACTIVE", icon: PlayCircle, ring: "ring-emerald-400", fill: "bg-emerald-500" },
  { s: "GRACE", icon: Timer, ring: "ring-amber-400", fill: "bg-amber-500" },
  { s: "SUSPENDED", icon: PauseCircle, ring: "ring-red-400", fill: "bg-red-500" },
  { s: "ARCHIVED", icon: Archive, ring: "ring-slate-400", fill: "bg-slate-500" },
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
                {i > 0 && <ArrowRight className="mx-auto h-5 w-5 rotate-90 text-slate-400 sm:rotate-0" aria-hidden />}
                <li aria-current={on ? "step" : undefined} className="relative flex flex-1 flex-col items-center gap-2 rounded-2xl p-3">
                  <span className="relative">
                    {on && !reduced && (
                      <motion.span className={cx("absolute inset-0 rounded-full", st.fill)} animate={{ scale: [1, 1.5], opacity: [0.45, 0] }} transition={{ duration: 1.8, repeat: Infinity }} aria-hidden />
                    )}
                    <span
                      className={cx(
                        "relative flex h-14 w-14 items-center justify-center rounded-full transition-all",
                        on ? cx(st.fill, "text-white shadow-lg ring-4", st.ring) : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
                      )}
                    >
                      <Icon className="h-7 w-7" aria-hidden />
                    </span>
                  </span>
                  <span className={cx("text-sm font-semibold", on ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300")}>{statusLabel(st.s)}</span>
                  {on && st.s === "GRACE" && t.graceUntil && <span className="text-xs text-slate-600 dark:text-slate-300">→ {fmtDate(t.graceUntil)}</span>}
                </li>
              </React.Fragment>
            );
          })}
        </ol>
      </Card>
      {t.isPrimary && (
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-200">
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
    <ol className="relative space-y-3 border-l-2 border-slate-200 pl-5 dark:border-slate-700" aria-label="Audit">
      <AnimatePresence initial={false}>
        {entries.map((e) => (
          <motion.li key={e.id} layout {...m("reveal")} className="relative">
            <span className="absolute -left-[1.6rem] top-1.5 h-3 w-3 rounded-full bg-brand-500 ring-4 ring-white dark:ring-slate-950" aria-hidden />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">{auditLabel(e.action)}</span>
              {schoolName && e.targetTid !== null && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">{schoolName(e.targetTid) ?? `#${e.targetTid}`}</span>}
              <time className="text-xs text-slate-600 dark:text-slate-300" dateTime={e.at}>
                {fmtDateTime(e.at)}
              </time>
              {e.actor && <span className="text-xs text-slate-600 dark:text-slate-300">· {e.actor}</span>}
            </div>
            {e.payload !== null && e.payload !== undefined && typeof e.payload === "object" && Object.keys(e.payload as object).length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-slate-600 dark:text-slate-300">Details</summary>
                <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-50 p-2 text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-100">{JSON.stringify(e.payload, null, 2)}</pre>
              </details>
            )}
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
};

export default SchoolDetailPage;
