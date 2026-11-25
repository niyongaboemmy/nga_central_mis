import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Ban,
  CalendarCheck,
  Clock,
  HandCoins,
  Siren,
  Banknote,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  FileDown,
  FileText,
  Gift,
  Inbox,
  Landmark,
  Pencil,
  Plus,
  Send,
  Smartphone,
  Trash2,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Modal from "../../ui/Modal";
import api from "../../../services/api";
import { EmptyState, Segmented, StatusPill } from "../kit";
import { formatMoney, platformApi, type Invoice, type InvoiceLine, type Payment, type PaymentMethod } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { Panel, SegmentBar, StatTile } from "../viz";
import { useChartTheme } from "./chartTheme";
import { Btn, Card, IconBtn, Lightbox, ReasonDialog, Skeleton, SkeletonGrid, act, cx, fmtDate, inputCls, isPdf, surface, toast, usePlatform } from "./platformShared";

export const METHOD_META: Record<PaymentMethod, { label: string; icon: LucideIcon; tone: string }> = {
  MOMO: { label: "MoMo", icon: Smartphone, tone: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200" },
  AIRTEL_MONEY: { label: "Airtel", icon: Smartphone, tone: "bg-red-100 text-red-800 dark:bg-red-400/15 dark:text-red-200" },
  BANK_TRANSFER: { label: "Bank", icon: Landmark, tone: "bg-blue-100 text-blue-800 dark:bg-blue-400/15 dark:text-blue-200" },
  CASH: { label: "Cash", icon: Banknote, tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200" },
  OTHER: { label: "Other", icon: CircleDollarSign, tone: "bg-gray-100 text-gray-700 dark:bg-gray-800/70 dark:text-gray-200" },
};

export const MethodChip: React.FC<{ method: PaymentMethod }> = ({ method }) => {
  const meta = METHOD_META[method] ?? METHOD_META.OTHER;
  const Icon = meta.icon;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", meta.tone)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {meta.label}
    </span>
  );
};

/** Platform PDFs need the session header: fetch as a blob and open it. */
export const openInvoicePdf = async (inv: Invoice) => {
  const url = inv.pdfUrl ?? platformApi.invoicePdfUrl(inv.id);
  const w = window.open("", "_blank");
  try {
    const r = await api.get(url, { responseType: "blob" });
    const blobUrl = URL.createObjectURL(r.data as Blob);
    if (w) w.location.href = blobUrl;
    else window.location.assign(blobUrl);
  } catch {
    w?.close();
    toast("PDF unavailable", "error");
  }
};

const CopyBtn: React.FC<{ text: string }> = ({ text }) => {
  const [done, setDone] = useState(false);
  return (
    <IconBtn
      icon={done ? Check : Copy}
      label="Copy reference"
      className="h-7 w-7"
      onClick={async () => {
        try {
          await navigator.clipboard?.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard refused */
        }
      }}
    />
  );
};

// ---------------------------------------------------------------------------
// Payments to confirm
// ---------------------------------------------------------------------------

type ReviewPayment = Payment & { invoice: Invoice; schoolName: string };

export const PaymentsQueue: React.FC = () => {
  const { can, reload } = usePlatform();
  const [rows, setRows] = useState<ReviewPayment[] | null>(null);
  const [preview, setPreview] = useState<ReviewPayment | null>(null);
  const [dialog, setDialog] = useState<{ kind: "confirm" | "reject"; p: ReviewPayment } | null>(null);
  const m = useMotion();
  useEffect(() => {
    platformApi.paymentsToReview().then(setRows, () => setRows([]));
  }, []);
  const done = (id: number) => {
    setRows((r) => (r ?? []).filter((x) => x.id !== id));
    setDialog(null);
    void reload();
  };
  if (!rows) return <SkeletonGrid cards={4} label="Loading payments" className="grid gap-3 md:grid-cols-2" cardClassName="h-32" />;
  if (!rows.length) return <EmptyState icon={CheckCircle2} title="All confirmed" />;
  const allowed = can("confirm");
  return (
    <>
      <ul className="grid gap-3 md:grid-cols-2" aria-label="Payments to confirm">
        <AnimatePresence initial={false}>
          {rows.map((p) => {
            const match = p.amount === p.invoice.amount;
            return (
              <motion.li key={p.id} layout {...m("reveal")} className={cx("flex gap-3 p-3", surface.card)}>
                <button
                  type="button"
                  onClick={() => p.proofUrl && setPreview(p)}
                  disabled={!p.proofUrl}
                  className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-default dark:bg-gray-800"
                >
                  {p.proofUrl && !isPdf(p.proofUrl) ? <img src={p.proofUrl} alt="" className="h-full w-full object-cover" /> : <FileText className="h-8 w-8 text-gray-400" aria-hidden />}
                  <span className="sr-only">{p.proofUrl ? "View proof" : "No proof"}</span>
                </button>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-gray-900 dark:text-white">{p.schoolName}</span>
                    <MethodChip method={p.method} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="font-bold tabular-nums text-gray-900 dark:text-white">{formatMoney(p.amount, p.invoice.currency)}</span>
                    {match ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Matches invoice" />
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-300">
                        <XCircle className="h-4 w-4" aria-hidden />
                        <span className="sr-only">Invoice amount</span>
                        {formatMoney(p.invoice.amount, p.invoice.currency)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                    <span className="truncate font-mono">{p.reference ?? "—"}</span>
                    {p.reference && <CopyBtn text={p.reference} />}
                    <span className="ml-auto">{fmtDate(p.paidAt ?? p.submittedAt)}</span>
                  </div>
                  {allowed && (
                    <div className="flex justify-end gap-2 pt-1">
                      <Btn size="sm" tone="danger" icon={XCircle} onClick={() => setDialog({ kind: "reject", p })}>
                        Reject
                      </Btn>
                      <Btn size="sm" tone="success" icon={CheckCircle2} onClick={() => setDialog({ kind: "confirm", p })}>
                        Confirm
                      </Btn>
                    </div>
                  )}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      <Lightbox url={preview?.proofUrl ?? null} title={preview?.schoolName ?? ""} onClose={() => setPreview(null)} />
      <ReasonDialog
        open={dialog?.kind === "confirm"}
        title="Confirm payment"
        icon={CheckCircle2}
        confirmText="Confirm"
        tone="success"
        placeholder="Note"
        optional
        onClose={() => setDialog(null)}
        onSubmit={async (note) => {
          const p = dialog!.p;
          if (await act(() => platformApi.confirmPayment(p.id, note || undefined), "Confirmed")) done(p.id);
        }}
      />
      <ReasonDialog
        open={dialog?.kind === "reject"}
        title="Reject payment"
        icon={XCircle}
        confirmText="Reject"
        tone="danger"
        placeholder="Note to the school"
        onClose={() => setDialog(null)}
        onSubmit={async (note) => {
          const p = dialog!.p;
          if (await act(() => platformApi.rejectPayment(p.id, note), "Rejected")) done(p.id);
        }}
      />
    </>
  );
};

// ---------------------------------------------------------------------------
// Invoice list with row actions (also used by application + school detail)
// ---------------------------------------------------------------------------

type InvDialog = { kind: "edit" | "void" | "waive"; inv: Invoice } | null;

export const InvoiceList: React.FC<{ invoices: Invoice[]; onChange: (inv: Invoice) => void }> = ({ invoices, onChange }) => {
  const { can } = usePlatform();
  const [dialog, setDialog] = useState<InvDialog>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const m = useMotion();
  const manage = can("invoice");
  const update = (inv: Invoice | undefined) => {
    if (inv) {
      onChange(inv);
      setDialog(null);
    }
  };
  if (!invoices.length) return <EmptyState icon={Inbox} title="No invoices" />;
  return (
    <>
      <ul className={cx("divide-y", surface.divide)} aria-label="Invoices">
        <AnimatePresence initial={false}>
          {invoices.map((inv) => {
            const open = inv.status === "ISSUED" || inv.status === "OVERDUE";
            return (
              <motion.li
                key={inv.id}
                layout
                {...m("reveal")}
                className="flex flex-col gap-2 py-3 first:pt-1 last:pb-1 md:flex-row md:items-center md:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">{inv.number ?? `#${inv.id}`}</span>
                    <StatusPill status={inv.status} />
                    <span className="text-xs text-gray-600 dark:text-gray-300">
                      {inv.packageCode} · {inv.billingCycle === "YEAR" ? "Year" : "Term"} · {inv.kind.toLowerCase()}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-300">
                    {inv.dueAt ? `Due ${fmtDate(inv.dueAt)}` : inv.issuedAt ? fmtDate(inv.issuedAt) : "Draft"}
                    {inv.paidAt && ` · Paid ${fmtDate(inv.paidAt)}`}
                  </div>
                </div>
                <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{formatMoney(inv.amount, inv.currency)}</span>
                <div className="flex items-center justify-end gap-1">
                  {manage && inv.status === "DRAFT" && (
                    <>
                      <IconBtn icon={Pencil} label="Edit" onClick={() => setDialog({ kind: "edit", inv })} />
                      <Btn
                        size="sm"
                        tone="primary"
                        icon={Send}
                        busy={busy === inv.id}
                        onClick={async () => {
                          setBusy(inv.id);
                          update(await act(() => platformApi.issueInvoice(inv.id), "Issued"));
                          setBusy(null);
                        }}
                      >
                        Issue
                      </Btn>
                    </>
                  )}
                  {can("waive") && open && <IconBtn icon={Gift} label="Waive" onClick={() => setDialog({ kind: "waive", inv })} />}
                  {manage && (inv.status === "DRAFT" || open) && <IconBtn icon={Ban} label="Void" tone="danger" onClick={() => setDialog({ kind: "void", inv })} />}
                  <IconBtn icon={FileDown} label="PDF" onClick={() => void openInvoicePdf(inv)} />
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {dialog?.kind === "edit" && <EditInvoiceDialog inv={dialog.inv} onClose={() => setDialog(null)} onSaved={update} />}
      <ReasonDialog
        open={dialog?.kind === "void"}
        title="Void invoice"
        icon={Ban}
        confirmText="Void"
        tone="danger"
        onClose={() => setDialog(null)}
        onSubmit={async (r) => update(await act(() => platformApi.voidInvoice(dialog!.inv.id, r), "Voided"))}
      />
      <ReasonDialog
        open={dialog?.kind === "waive"}
        title="Waive invoice"
        icon={Gift}
        confirmText="Waive"
        tone="warning"
        onClose={() => setDialog(null)}
        onSubmit={async (r) => update(await act(() => platformApi.waiveInvoice(dialog!.inv.id, r), "Waived"))}
      />
    </>
  );
};

const EditInvoiceDialog: React.FC<{ inv: Invoice; onClose: () => void; onSaved: (inv: Invoice | undefined) => void }> = ({ inv, onClose, onSaved }) => {
  const [lines, setLines] = useState<InvoiceLine[]>(inv.lines.length ? inv.lines : [{ label: inv.packageCode, amount: inv.amount }]);
  const [amount, setAmount] = useState<number>(inv.amount);
  const [auto, setAuto] = useState(true);
  const [dueAt, setDueAt] = useState(inv.dueAt?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(inv.notes ?? "");
  const [busy, setBusy] = useState(false);
  const total = lines.reduce((t, l) => t + (Number(l.amount) || 0), 0);
  const shownAmount = auto ? total : amount;
  const setLine = (i: number, patch: Partial<InvoiceLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <Modal isOpen onClose={() => !busy && onClose()} size="lg" title={<span className="flex items-center gap-2"><Pencil className="h-5 w-5" aria-hidden />{inv.number ?? `#${inv.id}`}</span>}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const out = await act(
            () =>
              platformApi.updateInvoice(inv.id, {
                amount: shownAmount,
                lines: lines.filter((l) => l.label.trim()),
                dueAt: dueAt ? new Date(`${dueAt}T00:00:00`).toISOString() : null,
                notes: notes.trim() || null,
              }),
            "Saved",
          );
          setBusy(false);
          onSaved(out);
        }}
      >
        <ul className="space-y-2" aria-label="Lines">
          {lines.map((l, i) => (
            <li key={i} className="flex items-center gap-2">
              <input aria-label={`Line ${i + 1} label`} value={l.label} onChange={(e) => setLine(i, { label: e.target.value })} className={inputCls} />
              <input
                aria-label={`Line ${i + 1} amount`}
                type="number"
                min={0}
                value={l.amount}
                onChange={(e) => setLine(i, { amount: Number(e.target.value) })}
                className={cx(inputCls, "w-36 text-right tabular-nums")}
              />
              <IconBtn icon={Trash2} label={`Remove line ${i + 1}`} tone="danger" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} />
            </li>
          ))}
        </ul>
        <Btn size="sm" icon={Plus} onClick={() => setLines((ls) => [...ls, { label: "", amount: 0 }])}>
          Line
        </Btn>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="inv-amount" className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
              Total
            </label>
            <input
              id="inv-amount"
              type="number"
              min={0}
              value={shownAmount}
              onChange={(e) => {
                setAuto(false);
                setAmount(Number(e.target.value));
              }}
              className={cx(inputCls, "text-right font-bold tabular-nums")}
            />
          </div>
          <div>
            <label htmlFor="inv-due" className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">
              Due
            </label>
            <input id="inv-due" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={inputCls} />
          </div>
        </div>
        <textarea aria-label="Notes" placeholder="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
        <div className="flex justify-end gap-2">
          <Btn onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn type="submit" tone="primary" busy={busy}>
            Save
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Insights: money at a glance (tiles, collected per month, overdue ageing)
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (key: string) => {
  const d = new Date(`${key}-01T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? key : d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
};

const BillingInsights: React.FC<{ onOpen: (pane: "confirm" | "invoices", status?: InvFilter) => void }> = ({ onOpen }) => {
  const { overview, can } = usePlatform();
  const ct = useChartTheme();
  const [all, setAll] = useState<Invoice[] | null>(null);
  useEffect(() => {
    platformApi.invoices({}).then(setAll, () => setAll([]));
  }, []);
  const currency = overview?.currency ?? all?.[0]?.currency ?? "RWF";
  const money = (n: number) => formatMoney(n, currency);
  const data = useMemo(() => {
    const list = all ?? [];
    const now = Date.now();
    const open = list.filter((i) => i.status === "ISSUED" || i.status === "OVERDUE");
    const pastDue = (i: Invoice) => (i.dueAt ? Math.floor((now - new Date(i.dueAt).getTime()) / DAY) : -1);
    const overdue = open.filter((i) => i.status === "OVERDUE" || pastDue(i) > 0);
    // last 6 months of money collected (paid invoices by paid date)
    const months: string[] = [];
    const d = new Date();
    for (let k = 5; k >= 0; k--) months.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k, 1)).toISOString().slice(0, 7));
    const paid = new Map(months.map((m) => [m, 0]));
    for (const i of list) if (i.status === "PAID" && i.paidAt && paid.has(monthKey(i.paidAt))) paid.set(monthKey(i.paidAt), paid.get(monthKey(i.paidAt))! + (Number(i.amount) || 0));
    return {
      outstanding: open.reduce((t, i) => t + (Number(i.amount) || 0), 0),
      overdueCount: overdue.length,
      monthly: months.map((m) => ({ month: m, collected: paid.get(m) ?? 0 })),
      ageing: {
        notDue: open.filter((i) => pastDue(i) <= 0 && i.status !== "OVERDUE").length,
        d30: overdue.filter((i) => pastDue(i) <= 30).length,
        d60: overdue.filter((i) => pastDue(i) > 30 && pastDue(i) <= 60).length,
        d61: overdue.filter((i) => pastDue(i) > 60).length,
      },
    };
  }, [all]);

  if (!all)
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="status" aria-busy="true" aria-label="Loading billing">
        {[0, 1, 2, 3].map((k) => (
          <div key={k} className={cx(surface.card, "h-[7.5rem] animate-pulse")} />
        ))}
      </div>
    );
  const collectedTotal = data.monthly.reduce((t, m) => t + m.collected, 0);
  const openCount = data.ageing.notDue + data.ageing.d30 + data.ageing.d60 + data.ageing.d61;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {can("confirm") && <StatTile icon={Wallet} label="Payments to confirm" value={overview?.paymentsToConfirm ?? 0} attention onClick={() => onOpen("confirm")} />}
        <StatTile icon={HandCoins} label="Outstanding" value={data.outstanding} format={money} hint={`${openCount} open`} onClick={() => onOpen("invoices", "ISSUED")} />
        <StatTile icon={AlertTriangle} label="Overdue" value={data.overdueCount} attention onClick={() => onOpen("invoices", "OVERDUE")} />
        <StatTile icon={CircleDollarSign} label="Collected this term" value={overview?.revenueThisTerm ?? 0} format={money} tone="emerald" onClick={() => onOpen("invoices", "PAID")} />
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Panel title="Collected" aside="last 6 months" icon={CircleDollarSign} className="lg:col-span-3">
          <div className="h-44" role="img" aria-label={`Money collected per month, last 6 months: ${data.monthly.map((m) => `${monthLabel(m.month)} ${money(m.collected)}`).join(", ")}`}>
            {collectedTotal === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">No payments in the last 6 months</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthly} margin={{ left: 0, right: 4, top: 6, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={ct.grid} />
                  <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: ct.tick }} tickLine={false} axisLine={false} />
                  <YAxis width={44} tick={{ fontSize: 11, fill: ct.tick }} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1_000_000 ? `${Math.round(v / 100_000) / 10}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip contentStyle={ct.tooltip} labelFormatter={(v) => monthLabel(String(v))} formatter={(v: any) => [money(Number(v)), "Collected"]} cursor={{ fill: ct.grid, opacity: 0.4 }} />
                  <Bar dataKey="collected" name="Collected" fill={ct.series[0]} radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>
        <Panel title="Open invoices" aside="by days past due" icon={Clock} className="lg:col-span-2">
          {openCount === 0 ? (
            <div className="flex h-full min-h-[8rem] flex-col items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden />
              Nothing open
            </div>
          ) : (
            <SegmentBar
              columns={2}
              label="Open invoices by days past due"
              segments={[
                { key: "notDue", label: "Not due yet", value: data.ageing.notDue, tone: "blue", icon: CalendarCheck, onClick: () => onOpen("invoices", "ISSUED") },
                { key: "d30", label: "1–30 days late", value: data.ageing.d30, tone: "amber", icon: Clock, onClick: () => onOpen("invoices", "OVERDUE") },
                { key: "d60", label: "31–60 days late", value: data.ageing.d60, tone: "red", icon: AlertTriangle, onClick: () => onOpen("invoices", "OVERDUE") },
                { key: "d61", label: "61+ days late", value: data.ageing.d61, tone: "red", icon: Siren, onClick: () => onOpen("invoices", "OVERDUE") },
              ]}
            />
          )}
        </Panel>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type InvFilter = "all" | "DRAFT" | "ISSUED" | "OVERDUE" | "PAID" | "VOID";

const BillingPage: React.FC = () => {
  const { overview, can } = usePlatform();
  const [params, setParams] = useSearchParams();
  const canConfirm = can("confirm");
  const canInvoices = can("invoice", "waive");
  const [wanted, setPane] = useState<"confirm" | "invoices">(params.get("pane") === "invoices" ? "invoices" : "confirm");
  const pane = canConfirm ? wanted : "invoices";
  const [status, setStatus] = useState<InvFilter>((params.get("status") as InvFilter) || "all");
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);

  const load = useCallback(() => {
    setInvoices(null);
    platformApi.invoices({ status: status === "all" ? undefined : status }).then(setInvoices, () => setInvoices([]));
  }, [status]);
  useEffect(() => {
    if (pane === "invoices") load();
  }, [pane, load]);
  useEffect(() => {
    const next = new URLSearchParams();
    next.set("pane", pane);
    if (status !== "all") next.set("status", status);
    setParams(next, { replace: true });
  }, [pane, status, setParams]);

  const panes = [
    ...(canConfirm ? [{ value: "confirm" as const, label: "To confirm", icon: Wallet, badge: overview?.paymentsToConfirm ?? 0 }] : []),
    ...(canInvoices || canConfirm ? [{ value: "invoices" as const, label: "Invoices", icon: FileText }] : []),
  ];

  return (
    <div className="space-y-4">
      <BillingInsights
        onOpen={(p, st) => {
          setPane(p);
          if (st) setStatus(st);
        }}
      />
      {panes.length > 1 && (
        <Segmented label="Billing" value={pane} onChange={setPane} options={panes.map((p) => ({ value: p.value, icon: p.icon, label: p.badge ? `${p.label} ${p.badge}` : p.label }))} />
      )}
      {pane === "confirm" && canConfirm ? (
        <PaymentsQueue />
      ) : (
        <Card className="space-y-3">
          <div className="max-w-full overflow-x-auto">
            <Segmented
              label="Invoice status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All" },
                { value: "DRAFT", label: "Draft" },
                { value: "ISSUED", label: "Issued" },
                { value: "OVERDUE", label: "Overdue" },
                { value: "PAID", label: "Paid" },
                { value: "VOID", label: "Void" },
              ]}
            />
          </div>
          {!invoices ? (
            <div className="space-y-3 py-1" role="status" aria-busy="true" aria-label="Loading invoices">
              {[0, 1, 2, 3].map((k) => (
                <Skeleton key={k} className="h-12" />
              ))}
            </div>
          ) : <InvoiceList invoices={invoices} onChange={(inv) => setInvoices((list) => (list ?? []).map((x) => (x.id === inv.id ? inv : x)))} />}
        </Card>
      )}
    </div>
  );
};

export default BillingPage;
