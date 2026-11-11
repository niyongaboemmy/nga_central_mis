import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ban,
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
import Modal from "../../ui/Modal";
import api from "../../../services/api";
import { EmptyState, Segmented, StatusPill } from "../kit";
import { formatMoney, platformApi, type Invoice, type InvoiceLine, type Payment, type PaymentMethod } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { Btn, Card, IconBtn, Lightbox, ReasonDialog, Spinner, TabBar, act, cx, fmtDate, inputCls, isPdf, toast, usePlatform } from "./platformShared";

export const METHOD_META: Record<PaymentMethod, { label: string; icon: LucideIcon; tone: string }> = {
  MOMO: { label: "MoMo", icon: Smartphone, tone: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200" },
  AIRTEL_MONEY: { label: "Airtel", icon: Smartphone, tone: "bg-red-100 text-red-800 dark:bg-red-400/15 dark:text-red-200" },
  BANK_TRANSFER: { label: "Bank", icon: Landmark, tone: "bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-200" },
  CASH: { label: "Cash", icon: Banknote, tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200" },
  OTHER: { label: "Other", icon: CircleDollarSign, tone: "bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200" },
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
  if (!rows) return <Spinner />;
  if (!rows.length) return <EmptyState icon={CheckCircle2} title="All confirmed" />;
  const allowed = can("confirm");
  return (
    <>
      <ul className="grid gap-3 md:grid-cols-2" aria-label="Payments to confirm">
        <AnimatePresence initial={false}>
          {rows.map((p) => {
            const match = p.amount === p.invoice.amount;
            return (
              <motion.li key={p.id} layout {...m("reveal")} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => p.proofUrl && setPreview(p)}
                  disabled={!p.proofUrl}
                  className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-default dark:bg-slate-800"
                >
                  {p.proofUrl && !isPdf(p.proofUrl) ? <img src={p.proofUrl} alt="" className="h-full w-full object-cover" /> : <FileText className="h-8 w-8 text-slate-400" aria-hidden />}
                  <span className="sr-only">{p.proofUrl ? "View proof" : "No proof"}</span>
                </button>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-slate-900 dark:text-white">{p.schoolName}</span>
                    <MethodChip method={p.method} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(p.amount, p.invoice.currency)}</span>
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
                  <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
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
      <ul className="space-y-2" aria-label="Invoices">
        <AnimatePresence initial={false}>
          {invoices.map((inv) => {
            const open = inv.status === "ISSUED" || inv.status === "OVERDUE";
            return (
              <motion.li
                key={inv.id}
                layout
                {...m("reveal")}
                className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:flex-row md:items-center md:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{inv.number ?? `#${inv.id}`}</span>
                    <StatusPill status={inv.status} />
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      {inv.packageCode} · {inv.billingCycle === "YEAR" ? "Year" : "Term"} · {inv.kind.toLowerCase()}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    {inv.dueAt ? `Due ${fmtDate(inv.dueAt)}` : inv.issuedAt ? fmtDate(inv.issuedAt) : "Draft"}
                    {inv.paidAt && ` · Paid ${fmtDate(inv.paidAt)}`}
                  </div>
                </div>
                <span className="text-lg font-extrabold tabular-nums text-slate-900 dark:text-white">{formatMoney(inv.amount, inv.currency)}</span>
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
            <label htmlFor="inv-amount" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
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
            <label htmlFor="inv-due" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
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
      <TabBar id="billing" label="Billing" value={pane} onChange={setPane} tabs={panes} />
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
          {!invoices ? <Spinner /> : <InvoiceList invoices={invoices} onChange={(inv) => setInvoices((list) => (list ?? []).map((x) => (x.id === inv.id ? inv : x)))} />}
        </Card>
      )}
    </div>
  );
};

export default BillingPage;
