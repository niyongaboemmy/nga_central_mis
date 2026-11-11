import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  CreditCard,
  FileDown,
  Gauge,
  History,
  LifeBuoy,
  Loader2,
  Lock,
  Minus,
  Plus,
  Receipt,
  RefreshCw,
  Zap,
} from "lucide-react";
import {
  tenantApi,
  formatMoney,
  type BillingCycle,
  type Entitlement,
  type Invoice,
  type PackageInfo,
  type PaymentMethod,
  type TenantAccount,
} from "../../../api/tenantMgmt";
import { CountUp, EmptyState, EntitlementIcons, Meter, PackageCard, Segmented, StatusPill, ActionCard, accentOf, entIcon } from "../kit";
import { useMotion } from "../../../design/motion";
import { useAccess } from "../../../hooks/useAccess";
import Modal from "../../ui/Modal";
import InvoiceCard from "../shared/InvoiceCard";
import PaymentProofForm from "../shared/PaymentProofForm";
import { CountdownRing, btn, card, cx, daysUntil, shortDate } from "../shared/paymentBits";
import { loadTenantStatus } from "./usePackage";

/** School subscription, /settings/subscription (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.7). */

type Effective = "NOW" | "NEXT_PERIOD";

const pdfOf = (inv: Invoice) => inv.pdfUrl ?? tenantApi.invoicePdfUrl(inv.id);
const isOpen = (inv: Invoice) => inv.status === "ISSUED" || inv.status === "OVERDUE" || inv.status === "DRAFT";
const keysOf = (es: Entitlement[]) => new Set(es.filter((e) => e.kind !== "LIMIT").map((e) => e.key));
const limitOf = (p: PackageInfo, key: string) => p.entitlements.find((e) => e.key === key);

/** What changes between two packages: icons in / out, limits up / down. */
export function packageDiff(from: PackageInfo, to: PackageInfo) {
  const a = keysOf(from.entitlements);
  const b = keysOf(to.entitlements);
  const gained = to.entitlements.filter((e) => e.kind !== "LIMIT" && !a.has(e.key));
  const lost = from.entitlements.filter((e) => e.kind !== "LIMIT" && !b.has(e.key));
  const limitKeys = new Set([...from.entitlements, ...to.entitlements].filter((e) => e.kind === "LIMIT").map((e) => e.key));
  const limits = [...limitKeys]
    .map((key) => {
      const x = limitOf(from, key);
      const y = limitOf(to, key);
      const before = x ? x.value : 0;
      const after = y ? y.value : 0;
      const rank = (v: number | null) => (v === null ? Infinity : v);
      return { key, label: (y ?? x)!.label, before, after, up: rank(after) > rank(before) };
    })
    .filter((l) => l.before !== l.after);
  return { gained, lost, limits, downgrade: to.tier < from.tier };
}

const DiffPanel: React.FC<{ from: PackageInfo; to: PackageInfo }> = ({ from, to }) => {
  const d = useMemo(() => packageDiff(from, to), [from, to]);
  const fmt = (v: number | null, key: string) => (v === null ? "∞" : `${v.toLocaleString()}${key === "limit.storage_gb" ? " GB" : ""}`);
  return (
    <div className="space-y-3" data-testid="plan-diff">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
        <span>{from.name}</span>
        <ArrowRight className="h-4 w-4" aria-hidden />
        <span className={accentOf(to.accent).text}>{to.name}</span>
        {d.downgrade ? <ArrowDown className="h-4 w-4 text-amber-600" aria-label="Downgrade" /> : <ArrowUp className="h-4 w-4 text-emerald-600" aria-label="Upgrade" />}
      </div>
      {d.gained.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Gained">
          {d.gained.map((e, i) => {
            const Icon = entIcon(e.key);
            return (
              <motion.li
                key={e.key}
                data-testid={`gain-${e.key}`}
                title={e.label}
                initial={{ opacity: 0, x: -24, scale: 0.6 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ delay: i * 0.06, type: "spring", stiffness: 420, damping: 22 }}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
              >
                <Icon className="h-4 w-4" aria-hidden />
                <Plus className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-emerald-500 p-px text-white" aria-hidden />
                <span className="sr-only">Gain {e.label}</span>
              </motion.li>
            );
          })}
        </ul>
      )}
      {d.lost.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Lost">
          {d.lost.map((e, i) => {
            const Icon = entIcon(e.key);
            return (
              <motion.li
                key={e.key}
                data-testid={`lose-${e.key}`}
                title={e.label}
                initial={{ opacity: 1 }}
                animate={{ opacity: 0.55 }}
                transition={{ delay: 0.2 + i * 0.06, duration: 0.5 }}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-300"
              >
                <Icon className="h-4 w-4" aria-hidden />
                <Minus className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-red-500 p-px text-white" aria-hidden />
                <span className="sr-only">Lose {e.label}</span>
              </motion.li>
            );
          })}
        </ul>
      )}
      {d.limits.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {d.limits.map((l) => {
            const Icon = entIcon(l.key);
            return (
              <li
                key={l.key}
                title={l.label}
                className={cx(
                  "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
                  l.up ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200" : "bg-red-50 text-red-800 dark:bg-red-400/10 dark:text-red-200",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">{l.label}</span>
                {fmt(l.before, l.key)}
                <ArrowRight className="h-3 w-3" aria-hidden />
                {fmt(l.after, l.key)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const SubscriptionPage: React.FC = () => {
  const access = useAccess();
  const m = useMotion();
  const [acct, setAcct] = useState<TenantAccount | null>(null);
  const [history, setHistory] = useState<Invoice[]>([]);
  const [error, setError] = useState(false);
  const [payFor, setPayFor] = useState<Invoice | null>(null);
  const [changing, setChanging] = useState(false);
  const [cycle, setCycle] = useState<BillingCycle>("TERM");
  const [target, setTarget] = useState<PackageInfo | null>(null);
  const [effective, setEffective] = useState<Effective>("NOW");
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const allowed = access.can("SCHOOL_BILLING_MANAGE");

  const load = useCallback(async () => {
    setError(false);
    try {
      const [a, inv] = await Promise.all([tenantApi.account(), tenantApi.invoices().catch(() => [] as Invoice[])]);
      setAcct(a);
      setHistory(inv);
      if (a.subscription) setCycle(a.subscription.billingCycle);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const catalogue = useMemo(() => {
    if (!acct) return [] as Entitlement[];
    const seen = new Map<string, Entitlement>();
    for (const p of [acct.package, ...acct.options]) for (const e of p.entitlements) if (e.kind !== "LIMIT" && !seen.has(e.key)) seen.set(e.key, e);
    return [...seen.values()];
  }, [acct]);
  const held = useMemo(() => {
    if (!acct) return [] as Entitlement[];
    const ent = acct.entitlements;
    return catalogue.filter((e) => ent.unrestricted || ent.apps.includes(e.key) || ent.features.includes(e.key));
  }, [acct, catalogue]);

  if (access.loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" aria-label="Loading" />
      </div>
    );
  }
  if (!allowed) {
    return <EmptyState icon={Lock} title="Billing is for the school owner" />;
  }
  if (error && !acct) {
    return (
      <EmptyState icon={AlertTriangle} title="Couldn't load your subscription">
        <button type="button" className={cx(btn.ghost, "mt-2")} onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Retry
        </button>
      </EmptyState>
    );
  }
  if (!acct) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" aria-label="Loading" />
      </div>
    );
  }

  const { tenant, package: pkg, subscription: sub, usage, openInvoices, paymentInstructions, pendingChange } = acct;
  const a = accentOf(pkg.accent);
  const methods = Array.from(new Set(paymentInstructions.filter((p) => p.isActive !== false).map((p) => p.method))) as PaymentMethod[];
  const periodRatio = sub
    ? Math.max(0, Math.min(1, (Date.now() - new Date(sub.periodStart).getTime()) / Math.max(1, new Date(sub.periodEnd).getTime() - new Date(sub.periodStart).getTime())))
    : 0;
  const graceLeft = daysUntil(tenant.graceUntil) ?? 0;
  const firstOpen = openInvoices.find(isOpen) ?? openInvoices[0] ?? null;
  const pendingPkg = pendingChange ? acct.options.find((o) => o.code === pendingChange.packageCode) : null;
  const diff = target ? packageDiff(pkg, target) : null;
  const effectiveNow: Effective = diff?.downgrade ? "NEXT_PERIOD" : effective;

  const pick = (p: PackageInfo) => {
    setRequestError(null);
    setTarget(p.code === pkg.code && cycle === sub?.billingCycle ? null : p);
    setEffective("NOW");
  };

  const requestChange = async () => {
    if (!target) return;
    setRequesting(true);
    setRequestError(null);
    try {
      const r = await tenantApi.changeRequest({ packageCode: target.code, billingCycle: cycle, effective: effectiveNow });
      setChanging(false);
      setTarget(null);
      await load();
      setPayFor(r.invoice);
    } catch (err: any) {
      setRequestError(err?.response?.data?.message || "Request failed");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Subscription</h1>
        <Link to="/settings/support" className={btn.ghost}>
          <LifeBuoy className="h-4 w-4" aria-hidden /> Support access
        </Link>
      </header>

      {(tenant.status === "GRACE" || tenant.status === "SUSPENDED") && (
        <ActionCard
          icon={tenant.status === "GRACE" ? CalendarClock : AlertTriangle}
          tone={tenant.status === "GRACE" ? "amber" : "red"}
          title={tenant.status === "GRACE" ? "Subscription expired" : "School suspended"}
          pulse
          action={
            firstOpen && (
              <button type="button" className={btn.primary} onClick={() => setPayFor(firstOpen)}>
                <CreditCard className="h-4 w-4" aria-hidden /> Pay
              </button>
            )
          }
        >
          {tenant.status === "GRACE" && (
            <div className="mt-1 flex items-center gap-3">
              <CountdownRing size={52} left={graceLeft} total={14} label={`${graceLeft} days of grace left`} />
              <span className="text-sm">until {shortDate(tenant.graceUntil)}</span>
            </div>
          )}
        </ActionCard>
      )}

      {/* Hero: the current package */}
      <motion.section {...m("reveal")} className={cx("relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-white shadow-lg", a.grad)} aria-label="Current package">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-white/90">{tenant.name}</div>
            <div className="text-3xl font-extrabold">{pkg.name}</div>
            <div className="mt-1 text-sm text-white/90">{sub?.billingCycle === "YEAR" ? "Yearly" : "Per term"}</div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusPill status={tenant.status} className="bg-white/90 text-slate-900 dark:bg-white/90 dark:text-slate-900" />
            {pendingChange && (
              <button
                type="button"
                onClick={() => {
                  const inv = openInvoices.find((i) => i.id === pendingChange.invoiceId) ?? history.find((i) => i.id === pendingChange.invoiceId);
                  if (inv) setPayFor(inv);
                }}
                className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur hover:bg-white/30"
                data-testid="pending-change"
              >
                <ArrowUpDown className="h-3.5 w-3.5" aria-hidden />
                {pendingPkg?.name ?? pendingChange.packageCode} · {pendingChange.effective === "NOW" ? "now" : "next period"}
              </button>
            )}
          </div>
        </div>
        {sub && (
          <div className="mt-5">
            <div className="flex items-end justify-between text-sm">
              <span className="text-white/90">
                {shortDate(sub.periodStart)} – {shortDate(sub.periodEnd)}
              </span>
              <span className="font-bold">
                <CountUp value={Math.max(0, sub.daysLeft)} /> <span className="text-xs font-medium text-white/90">days left</span>
              </span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/25" role="progressbar" aria-label="Period used" aria-valuenow={Math.round(periodRatio * 100)} aria-valuemin={0} aria-valuemax={100}>
              <motion.div className="h-full rounded-full bg-white" initial={{ width: 0 }} animate={{ width: `${periodRatio * 100}%` }} transition={{ duration: 1, ease: "easeOut" }} />
            </div>
          </div>
        )}
      </motion.section>

      <section className={cx(card, "p-4")} aria-label="What's included">
        <EntitlementIcons entitlements={held} all={catalogue} />
      </section>

      <section className={cx(card, "p-4")} aria-label="Usage">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <Gauge className="h-4 w-4" aria-hidden /> Usage
        </h2>
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-6" data-testid="meters">
          {usage.meters.map((mt) => (
            <Meter key={mt.key} meter={mt} size={76} />
          ))}
        </div>
      </section>

      {openInvoices.length > 0 && (
        <section className="space-y-3" aria-label="Open invoices">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Receipt className="h-4 w-4" aria-hidden /> To pay
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {openInvoices.map((inv) => (
              <InvoiceCard key={inv.id} invoice={inv} instructions={paymentInstructions} pdfUrl={pdfOf(inv)} onPay={() => setPayFor(inv)} />
            ))}
          </div>
        </section>
      )}

      {/* Change plan */}
      <section className={cx(card, "p-4")} aria-label="Change plan">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Zap className="h-4 w-4" aria-hidden /> Plans
          </h2>
          {changing ? (
            <Segmented<BillingCycle>
              label="Billing cycle"
              value={cycle}
              onChange={(c) => {
                setCycle(c);
                setTarget(null);
              }}
              options={[
                { value: "TERM", label: "Term" },
                { value: "YEAR", label: "Year" },
              ]}
            />
          ) : (
            <button type="button" className={btn.ghost} onClick={() => setChanging(true)} disabled={!!pendingChange}>
              <ArrowUpDown className="h-4 w-4" aria-hidden /> Change plan
            </button>
          )}
        </div>
        <AnimatePresence>
          {changing && (
            <motion.div {...m("reveal")} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {acct.options.map((p) => (
                  <PackageCard
                    key={p.code}
                    pkg={p}
                    allEntitlements={catalogue}
                    cycle={cycle}
                    current={p.code === pkg.code}
                    selected={target?.code === p.code}
                    onSelect={() => pick(p)}
                  />
                ))}
              </div>
              <AnimatePresence mode="wait">
                {target && diff && (
                  <motion.div key={target.code} {...m("reveal")} className="space-y-4 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                    <DiffPanel from={pkg} to={target} />
                    <div className="flex flex-wrap items-center gap-3">
                      {diff.downgrade ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-800 dark:bg-amber-400/15 dark:text-amber-200" data-testid="effective-next">
                          <CalendarClock className="h-4 w-4" aria-hidden /> Next period
                        </span>
                      ) : (
                        <Segmented<Effective>
                          label="When"
                          value={effective}
                          onChange={setEffective}
                          options={[
                            { value: "NOW", label: "Now", icon: Zap },
                            { value: "NEXT_PERIOD", label: "Next period", icon: CalendarClock },
                          ]}
                        />
                      )}
                      <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                        {formatMoney(cycle === "YEAR" ? target.priceYear : target.priceTerm, target.currency)}
                      </span>
                      <div className="ml-auto flex gap-2">
                        <button type="button" className={btn.ghost} onClick={() => setTarget(null)}>
                          Cancel
                        </button>
                        <motion.button type="button" {...m("tap")} className={btn.primary} onClick={requestChange} disabled={requesting}>
                          {requesting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
                          Request
                        </motion.button>
                      </div>
                    </div>
                    {requestError && (
                      <p role="alert" className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
                        <AlertTriangle className="h-4 w-4" aria-hidden /> {requestError}
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {history.length > 0 && (
        <section className={cx(card, "p-4")} aria-label="Invoice history">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <History className="h-4 w-4" aria-hidden /> History
          </h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {history.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{inv.number ?? `#${inv.id}`}</span>
                <StatusPill status={inv.status} />
                <span className="text-xs text-slate-600 dark:text-slate-300">{shortDate(inv.issuedAt ?? inv.periodStart)}</span>
                <span className="ml-auto tabular-nums font-semibold text-slate-900 dark:text-white">{formatMoney(inv.amount, inv.currency)}</span>
                <a href={pdfOf(inv)} target="_blank" rel="noopener noreferrer" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                  <FileDown className="h-4 w-4" aria-hidden />
                  <span className="sr-only">PDF of {inv.number ?? inv.id}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal isOpen={!!payFor} onClose={() => setPayFor(null)} title={payFor ? `Pay ${payFor.number ?? `#${payFor.id}`}` : "Pay"} size="lg">
        {payFor && (
          <div className="space-y-4">
            <InvoiceCard invoice={payFor} instructions={paymentInstructions} pdfUrl={pdfOf(payFor)} />
            <PaymentProofForm
              invoice={payFor}
              methods={methods.length ? methods : undefined}
              onCancel={() => setPayFor(null)}
              onSubmit={async (body, proof) => {
                await tenantApi.submitPayment(payFor.id, body, proof);
                void load();
                void loadTenantStatus(true);
              }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SubscriptionPage;
