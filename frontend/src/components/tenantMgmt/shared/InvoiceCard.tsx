import React from "react";
import { motion } from "framer-motion";
import { CalendarRange, CheckCircle2, CreditCard, FileDown, Hourglass, Receipt } from "lucide-react";
import type { Invoice, PaymentInstruction } from "../../../api/tenantMgmt";
import { formatMoney } from "../../../api/tenantMgmt";
import { CountUp, StatusPill } from "../kit";
import { useMotion } from "../../../design/motion";
import { CopyButton, CountdownRing, METHOD_INFO, btn, card, cx, daysUntil, shortDate } from "./paymentBits";

/**
 * An invoice at a glance: amount, due countdown, PDF, how to pay (copyable).
 * Shared by the applicant tracker and the school's subscription page.
 * OWNED BY WORK PACKAGE G (keep these props).
 */
export interface InvoiceCardProps {
  invoice: Invoice;
  instructions: PaymentInstruction[];
  pdfUrl: string;
  /** shows the "Pay" call to action when set */
  onPay?: () => void;
}

const DAY = 86_400_000;

const InvoiceCard: React.FC<InvoiceCardProps> = ({ invoice, instructions, pdfUrl, onPay }) => {
  const m = useMotion();
  const settled = invoice.status === "PAID" || invoice.status === "VOID";
  const left = daysUntil(invoice.dueAt);
  const total =
    invoice.dueAt && invoice.issuedAt ? Math.max(1, Math.round((new Date(invoice.dueAt).getTime() - new Date(invoice.issuedAt).getTime()) / DAY)) : 14;
  const overdue = invoice.status === "OVERDUE" || (left !== null && left < 0 && !settled);
  const shownLeft = overdue ? Math.min(0, left ?? 0) : left ?? 0;
  const pending = invoice.payments?.some((p) => p.status === "SUBMITTED");
  const tiles = instructions.filter((i) => i.isActive !== false).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <motion.article {...m("reveal")} className={cx(card, "overflow-hidden", overdue && "border-red-300 dark:border-red-500/50")} aria-label={`Invoice ${invoice.number ?? invoice.id}`}>
      <div className="flex flex-wrap items-start gap-4 p-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Receipt className="h-4 w-4 text-slate-500 dark:text-slate-300" aria-hidden />
            <span className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-100">{invoice.number ?? `#${invoice.id}`}</span>
            <StatusPill status={overdue && invoice.status !== "OVERDUE" ? "OVERDUE" : invoice.status} />
            {pending && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-400/15 dark:text-violet-200">
                <Hourglass className="h-3 w-3" aria-hidden /> Proof sent
              </span>
            )}
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white sm:text-3xl">
            <CountUp value={invoice.amount} format={(n) => formatMoney(n, invoice.currency)} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1">
              <CalendarRange className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Period</span>
              {shortDate(invoice.periodStart)} – {shortDate(invoice.periodEnd)}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold capitalize dark:bg-slate-800">
              {invoice.packageCode} · {invoice.billingCycle === "YEAR" ? "year" : "term"}
            </span>
          </div>
        </div>
        {settled ? (
          <motion.span {...m("check")} className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
            <CheckCircle2 className="h-8 w-8" aria-hidden />
            <span className="sr-only">{invoice.status === "PAID" ? "Paid" : "Void"}</span>
          </motion.span>
        ) : (
          invoice.dueAt && (
            <CountdownRing
              left={shownLeft}
              total={total}
              label={overdue ? `Overdue since ${shortDate(invoice.dueAt)}` : `Due in ${shownLeft} days, ${shortDate(invoice.dueAt)}`}
            />
          )
        )}
      </div>

      {invoice.lines?.length > 1 && (
        <ul className="mx-4 mb-3 divide-y divide-slate-100 rounded-xl bg-slate-50 text-xs dark:divide-slate-800 dark:bg-slate-800/50">
          {invoice.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3 px-3 py-1.5 text-slate-700 dark:text-slate-200">
              <span className="min-w-0 truncate">{l.label}</span>
              <span className="tabular-nums">{formatMoney(l.amount, invoice.currency)}</span>
            </li>
          ))}
        </ul>
      )}

      {!settled && tiles.length > 0 && (
        <ul className="grid gap-2 px-4 pb-4 sm:grid-cols-2" aria-label="How to pay">
          {tiles.map((t, i) => {
            const info = METHOD_INFO[t.method] ?? METHOD_INFO.OTHER;
            const Icon = info.icon;
            return (
              <motion.li
                key={t.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={cx("flex items-center gap-3 rounded-xl p-3", info.tone)}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold">{t.label || info.label}</div>
                  <div className="break-all font-mono text-sm">{t.details}</div>
                </div>
                <CopyButton text={t.details} label={`Copy ${t.label || info.label} details`} />
              </motion.li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50">
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className={btn.ghost}>
          <FileDown className="h-4 w-4" aria-hidden /> PDF
        </a>
        {onPay && !settled && (
          <motion.button type="button" {...m("tap")} onClick={onPay} className={btn.primary}>
            <CreditCard className="h-4 w-4" aria-hidden /> Pay
          </motion.button>
        )}
      </div>
    </motion.article>
  );
};

export default InvoiceCard;
