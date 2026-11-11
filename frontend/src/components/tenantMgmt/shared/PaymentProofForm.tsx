import React, { useId, useState } from "react";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { AlertTriangle, Check, FileCheck2, Loader2, Send, X } from "lucide-react";
import type { Invoice, PaymentMethod } from "../../../api/tenantMgmt";
import { formatMoney } from "../../../api/tenantMgmt";
import { DropZone } from "../kit";
import { useMotion } from "../../../design/motion";
import { ALL_METHODS, METHOD_INFO, btn, cx } from "./paymentBits";

/**
 * Submit payment proof for an invoice: method tiles, reference, amount, date, receipt.
 * Shared by the applicant tracker and the school's subscription page.
 * OWNED BY WORK PACKAGE G (keep these props).
 */
export interface PaymentProofFormProps {
  invoice: Invoice;
  /** methods to offer (from the payment instructions); default: all */
  methods?: PaymentMethod[];
  onSubmit: (body: { method: PaymentMethod; reference: string; amount: number; paidAt: string }, proof?: File) => Promise<void>;
  onCancel?: () => void;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const inputCls = (bad: boolean) =>
  cx(
    "w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-brand-500 dark:bg-slate-900 dark:text-white",
    bad ? "border-red-400 dark:border-red-500" : "border-slate-300 dark:border-slate-600",
  );

type Field = "method" | "reference" | "amount" | "paidAt";

const PaymentProofForm: React.FC<PaymentProofFormProps> = ({ invoice, methods, onSubmit, onCancel }) => {
  const m = useMotion();
  const id = useId();
  const offered = methods && methods.length > 0 ? ALL_METHODS.filter((x) => methods.includes(x)) : ALL_METHODS;
  const [method, setMethod] = useState<PaymentMethod | null>(offered.length === 1 ? offered[0] : null);
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState(String(invoice.amount));
  const [paidAt, setPaidAt] = useState(today());
  const [proof, setProof] = useState<File | null>(null);
  const [errors, setErrors] = useState<Set<Field>>(new Set());
  const controls = useAnimationControls();
  const shakeIt = () => {
    const s = m("shake");
    if (s.animate) void controls.start({ ...s.animate, transition: s.transition });
  };
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const amountNum = Number(amount);
  const mismatch = amount !== "" && Number.isFinite(amountNum) && amountNum !== invoice.amount;

  const validate = () => {
    const bad = new Set<Field>();
    if (!method) bad.add("method");
    if (!reference.trim()) bad.add("reference");
    if (!(Number.isFinite(amountNum) && amountNum > 0)) bad.add("amount");
    if (!paidAt || paidAt > today()) bad.add("paidAt");
    return bad;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const bad = validate();
    setErrors(bad);
    setServerError(null);
    if (bad.size > 0) return shakeIt();
    setBusy(true);
    try {
      await onSubmit({ method: method!, reference: reference.trim(), amount: amountNum, paidAt }, proof ?? undefined);
      setDone(true);
    } catch (err: any) {
      setServerError(err?.response?.data?.message || err?.message || "Could not send");
      shakeIt();
    } finally {
      setBusy(false);
    }
  };

  const clear = (f: Field) => errors.has(f) && setErrors((s) => new Set([...s].filter((x) => x !== f)));

  if (done) {
    return (
      <motion.div {...m("reveal")} className="flex flex-col items-center gap-3 py-8 text-center" role="status">
        <motion.span {...m("check")} className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
          <Check className="h-9 w-9" aria-hidden />
        </motion.span>
        <p className="font-semibold text-slate-900 dark:text-white">Proof sent</p>
        {onCancel && (
          <button type="button" className={btn.ghost} onClick={onCancel}>
            Close
          </button>
        )}
      </motion.div>
    );
  }

  return (
    <motion.form
      noValidate
      onSubmit={submit}
      animate={controls}
      className="space-y-4"
      aria-label="Payment proof"
    >
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Method</legend>
        <div role="radiogroup" aria-label="Payment method" aria-invalid={errors.has("method") || undefined} className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {offered.map((x) => {
            const info = METHOD_INFO[x];
            const Icon = info.icon;
            const on = method === x;
            return (
              <motion.button
                key={x}
                type="button"
                role="radio"
                aria-checked={on}
                {...m("tap")}
                onClick={() => {
                  setMethod(x);
                  clear("method");
                }}
                className={cx(
                  "relative flex flex-col items-center gap-1 rounded-xl border-2 p-2.5 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                  on ? cx("border-brand-500", info.tone) : "border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-200",
                  errors.has("method") && !on && "border-red-300 dark:border-red-500/60",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {info.label}
                <AnimatePresence>
                  {on && (
                    <motion.span {...m("check")} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white">
                      <Check className="h-3 w-3" aria-hidden />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2" htmlFor={`${id}-ref`}>
          <span className="mb-1 block text-sm font-semibold text-slate-800 dark:text-slate-100">Reference</span>
          <input
            id={`${id}-ref`}
            className={inputCls(errors.has("reference"))}
            value={reference}
            aria-invalid={errors.has("reference") || undefined}
            autoComplete="off"
            onChange={(e) => {
              setReference(e.target.value);
              clear("reference");
            }}
          />
        </label>
        <label className="block" htmlFor={`${id}-amt`}>
          <span className="mb-1 flex items-center gap-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
            Amount <span className="text-xs font-medium text-slate-600 dark:text-slate-300">({invoice.currency})</span>
            <AnimatePresence>
              {mismatch && (
                <motion.span {...m("check")} className="ml-auto inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300" title={`Invoice: ${formatMoney(invoice.amount, invoice.currency)}`} data-testid="amount-mismatch">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">Differs from the invoice amount</span>
                  {formatMoney(invoice.amount, invoice.currency)}
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          <input
            id={`${id}-amt`}
            type="number"
            inputMode="decimal"
            min={0}
            className={inputCls(errors.has("amount"))}
            value={amount}
            aria-invalid={errors.has("amount") || undefined}
            onChange={(e) => {
              setAmount(e.target.value);
              clear("amount");
            }}
          />
        </label>
        <label className="block" htmlFor={`${id}-date`}>
          <span className="mb-1 block text-sm font-semibold text-slate-800 dark:text-slate-100">Paid on</span>
          <input
            id={`${id}-date`}
            type="date"
            max={today()}
            className={inputCls(errors.has("paidAt"))}
            value={paidAt}
            aria-invalid={errors.has("paidAt") || undefined}
            onChange={(e) => {
              setPaidAt(e.target.value);
              clear("paidAt");
            }}
          />
        </label>
      </div>

      <div>
        <span className="mb-1 block text-sm font-semibold text-slate-800 dark:text-slate-100">Receipt</span>
        {proof ? (
          <motion.div {...m("reveal")} className="flex items-center gap-3 rounded-xl border-2 border-emerald-400 bg-emerald-50 p-3 dark:bg-emerald-400/10">
            <FileCheck2 className="h-5 w-5 text-emerald-600 dark:text-emerald-300" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm text-slate-800 dark:text-slate-100">{proof.name}</span>
            <button type="button" onClick={() => setProof(null)} className="rounded-lg p-1.5 text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800">
              <X className="h-4 w-4" aria-hidden />
              <span className="sr-only">Remove receipt</span>
            </button>
          </motion.div>
        ) : (
          <DropZone onFile={setProof} label="Photo or PDF" />
        )}
      </div>

      {serverError && (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-200">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {serverError}
        </p>
      )}
      {errors.size > 0 && <p className="sr-only" role="alert">Check the highlighted fields</p>}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        {onCancel && (
          <button type="button" className={btn.ghost} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <motion.button type="submit" {...m("tap")} className={btn.primary} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          Send proof
        </motion.button>
      </div>
    </motion.form>
  );
};

export default PaymentProofForm;
