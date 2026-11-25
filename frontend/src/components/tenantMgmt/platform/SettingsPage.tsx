import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  Clock,
  FileBadge,
  FileClock,
  FileSignature,
  FileText,
  GitBranch,
  Hourglass,
  Image as ImageIcon,
  Minus,
  Plus,
  Receipt,
  RotateCcw,
  Save,
  Scale,
  Send,
  Timer,
  Trash2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { platformApi, type DocumentKind, type PaymentInstruction, type PaymentMethod } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { IconTile, Panel } from "../viz";
import { Btn, IconBtn, Skeleton, Switch, accent, cx, errorText, inputCls, surface, toast, usePlatform } from "./platformShared";
import { METHOD_META } from "./BillingPage";

type Item = Omit<PaymentInstruction, "id"> & { id?: number; _k: string };

/** The windows, in the order a school meets them: from its first draft to its archive being deleted. */
const TIMELINE: Array<{ key: string; label: string; hint: string; icon: LucideIcon; max: number }> = [
  { key: "application.draft_expiry_days", label: "Draft expiry", hint: "Unsent drafts close", icon: FileClock, max: 365 },
  { key: "review.sla_days", label: "Review SLA", hint: "Reviewed within", icon: Clock, max: 60 },
  { key: "application.payment_expiry_days", label: "Payment expiry", hint: "Unpaid approvals lapse", icon: Hourglass, max: 365 },
  { key: "invoice.due_days", label: "Invoice due", hint: "Invoices are due", icon: Receipt, max: 120 },
  { key: "grace.days", label: "Grace", hint: "Apps keep working", icon: Timer, max: 90 },
  { key: "archive.retention_days", label: "Retention", hint: "Archives are kept", icon: Archive, max: 3650 },
];
const SWITCHES: Array<{ key: string; label: string; hint: string; icon: LucideIcon }> = [
  { key: "billing.auto_issue_on_approval", label: "Auto-issue on approval", hint: "The invoice goes out the moment an application is approved", icon: Send },
  { key: "billing.separation_of_duties", label: "Separation of duties", hint: "Whoever approves a school can't also confirm its payment", icon: Scale },
];
const DOC_KINDS: Array<{ kind: DocumentKind; label: string; icon: LucideIcon }> = [
  { kind: "REGISTRATION_CERT", label: "Registration", icon: FileBadge },
  { kind: "AUTHORISATION_LETTER", label: "Authorisation", icon: FileSignature },
  { kind: "LOGO", label: "Logo", icon: ImageIcon },
  { kind: "OTHER", label: "Other", icon: FileText },
];
const METHODS: PaymentMethod[] = ["MOMO", "AIRTEL_MONEY", "BANK_TRANSFER", "CASH", "OTHER"];

let seq = 0;
const key = () => `k${++seq}`;
const itemsPayload = (list: Array<Omit<Item, "_k"> & { _k?: string }>) => list.map(({ _k, ...x }, i) => ({ ...x, sortOrder: i }));

const SettingsPage: React.FC = () => {
  const { setDirty } = usePlatform();
  const [base, setBase] = useState<Record<string, unknown> | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [items, setItems] = useState<Item[] | null>(null);
  const [itemsBase, setItemsBase] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = useMotion();

  useEffect(() => {
    platformApi.settings().then(
      (s) => {
        setBase(s);
        setDraft(s);
      },
      (e) => setError(errorText(e)),
    );
    platformApi.paymentInstructions().then(
      (list) => {
        const sorted = [...list].sort((a, b) => a.sortOrder - b.sortOrder).map((x) => ({ ...x, _k: key() }));
        setItems(sorted);
        setItemsBase(sorted);
      },
      () => setItems([]),
    );
  }, []);

  const changed = useMemo(() => (base ? Object.keys(draft).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(base[k])) : []), [base, draft]);
  const itemsDirty = items ? JSON.stringify(itemsPayload(items)) !== JSON.stringify(itemsPayload(itemsBase)) : false;
  const total = changed.length + (itemsDirty ? 1 : 0);
  useEffect(() => {
    setDirty(total > 0);
    return () => setDirty(false);
  }, [total, setDirty]);

  if (error) return <p className="text-sm text-red-600 dark:text-red-300">{error}</p>;
  if (!base) return <SettingsSkeleton />;

  const num = (k: string) => Number(draft[k] ?? 0);
  const docs = (Array.isArray(draft["documents.required"]) ? draft["documents.required"] : []) as string[];
  const setItem = (i: number, patch: Partial<Item>) => setItems((l) => (l ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) =>
    setItems((l) => {
      const out = [...(l ?? [])];
      const j = i + d;
      if (j < 0 || j >= out.length) return out;
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    });

  const save = async () => {
    setBusy(true);
    let ok = true;
    if (changed.length) {
      try {
        const patch = Object.fromEntries(changed.map((k) => [k, draft[k]]));
        const next = await platformApi.saveSettings(patch);
        const merged = { ...base, ...patch, ...(next ?? {}) };
        setBase(merged);
        setDraft(merged);
      } catch (e) {
        ok = false;
        toast(errorText(e), "error");
      }
    }
    if (itemsDirty && items) {
      try {
        const saved = await platformApi.savePaymentInstructions(itemsPayload(items).filter((x) => x.label.trim() || x.details.trim()));
        const sorted = [...saved].sort((a, b) => a.sortOrder - b.sortOrder).map((x) => ({ ...x, _k: key() }));
        setItems(sorted);
        setItemsBase(sorted);
      } catch (e) {
        ok = false;
        toast(errorText(e), "error");
      }
    }
    setBusy(false);
    if (ok) toast("Settings saved");
  };

  const discard = () => {
    setDraft(base);
    setItems(itemsBase);
    toast("Changes discarded", "info");
  };

  return (
    <div className="space-y-4 pb-20">
      {/* The school's journey, with every window on it */}
      <Panel title="Timeline" icon={GitBranch} aside="days at each step">
        <ol className="relative grid gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-label="Timeline">
          <span className="absolute left-[8%] right-[8%] top-6 hidden h-0.5 rounded-full bg-gray-100 dark:bg-gray-800 xl:block" aria-hidden />
          {TIMELINE.map((w, i) => (
            <TimelineNode key={w.key} index={i} icon={w.icon} label={w.label} hint={w.hint} value={num(w.key)} max={w.max} changed={changed.includes(w.key)} onChange={(v) => setDraft((d) => ({ ...d, [w.key]: v }))} />
          ))}
        </ol>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Rules */}
        <Panel title="Approvals" icon={Scale}>
          <ul className="space-y-2">
            {SWITCHES.map((s) => (
              <li key={s.key} className={cx("flex items-center gap-3 p-3", surface.inset)}>
                <IconTile icon={s.icon} size="sm" tone={draft[s.key] ? "blue" : "gray"} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-900 dark:text-white">{s.label}</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">{s.hint}</span>
                </span>
                <Switch checked={!!draft[s.key]} onChange={(v) => setDraft((d) => ({ ...d, [s.key]: v }))} label={s.label} />
              </li>
            ))}
          </ul>
          <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Required documents</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Required documents">
            {DOC_KINDS.map((k) => {
              const on = docs.includes(k.kind);
              return (
                <button
                  key={k.kind}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDraft((d) => ({ ...d, "documents.required": on ? docs.filter((x) => x !== k.kind) : [...docs, k.kind] }))}
                  className={cx(
                    "relative flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-xs font-semibold transition-colors",
                    accent.focus,
                    on ? "bg-blue-50 text-blue-700 ring-2 ring-blue-600 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500" : "bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-800/50 dark:text-gray-300 dark:hover:bg-gray-800/80",
                  )}
                >
                  <k.icon className="h-5 w-5" aria-hidden />
                  {k.label}
                  {on && (
                    <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-white" aria-hidden>
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Panel>

        {/* Payment methods */}
        <Panel
          title="How schools pay"
          icon={Wallet}
          aside={items ? `${items.filter((x) => x.isActive).length} active` : undefined}
          action={
            <Btn size="sm" icon={Plus} onClick={() => setItems((l) => [...(l ?? []), { method: "MOMO", label: "", details: "", sortOrder: (l ?? []).length, isActive: true, _k: key() }])}>
              Add
            </Btn>
          }
        >
          {!items ? (
            <div className="space-y-3" role="status" aria-busy="true" aria-label="Loading payment methods">
              {[0, 1].map((k) => (
                <Skeleton key={k} className="h-28 !rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <IconTile icon={Wallet} tone="gray" size="lg" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No payment methods yet</p>
            </div>
          ) : (
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {items.map((it, i) => {
                  const meta = METHOD_META[it.method] ?? METHOD_META.OTHER;
                  return (
                    <motion.li key={it._k} layout {...m("reveal")} className={cx("space-y-2 p-3", surface.inset, !it.isActive && "opacity-60")}>
                      <div className="flex items-center gap-2">
                        <IconTile icon={meta.icon} size="sm" tone={it.isActive ? "blue" : "gray"} />
                        <input aria-label="Label" placeholder="Name shown to schools" value={it.label} onChange={(e) => setItem(i, { label: e.target.value })} className={cx(inputCls, "flex-1 py-1.5 font-semibold")} />
                        <span className="flex items-center">
                          <IconBtn icon={ArrowUp} label="Move up" onClick={() => move(i, -1)} disabled={i === 0} className="h-8 w-8" />
                          <IconBtn icon={ArrowDown} label="Move down" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="h-8 w-8" />
                          <IconBtn icon={Trash2} label="Remove" tone="danger" onClick={() => setItems((l) => (l ?? []).filter((_, j) => j !== i))} className="h-8 w-8" />
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`Method ${i + 1}`}>
                        {METHODS.map((mt) => {
                          const mm = METHOD_META[mt];
                          const on = it.method === mt;
                          return (
                            <button
                              key={mt}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              onClick={() => setItem(i, { method: mt })}
                              className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors", accent.focus, on ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/70")}
                            >
                              <mm.icon className="h-3.5 w-3.5" aria-hidden />
                              {mm.label}
                            </button>
                          );
                        })}
                      </div>
                      <textarea aria-label="Details" placeholder="Account number, steps, reference to use…" rows={2} value={it.details} onChange={(e) => setItem(i, { details: e.target.value })} className={cx(inputCls, "font-mono text-xs")} />
                      <Switch checked={it.isActive} onChange={(v) => setItem(i, { isActive: v })} label="Active" showLabel />
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </Panel>
      </div>

      <SaveBar open={total > 0} total={total} busy={busy} onDiscard={discard} onSave={save} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Timeline node: icon, label, the number of days (− / +), a short hint
// ---------------------------------------------------------------------------

const TimelineNode: React.FC<{ index: number; icon: LucideIcon; label: string; hint: string; value: number; max: number; changed: boolean; onChange: (v: number) => void }> = ({
  index,
  icon: Icon,
  label,
  hint,
  value,
  max,
  changed,
  onChange,
}) => {
  const reduced = useReducedMotion();
  return (
    <motion.li
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: reduced ? 0 : index * 0.05 }}
      className="relative flex flex-col items-center gap-2 text-center"
    >
      <span className={cx("relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl ring-4 ring-white dark:ring-[#0c1016]", changed ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400")} aria-hidden>
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-sm font-semibold text-gray-900 dark:text-white">{label}</span>
      <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-50 p-0.5 dark:bg-gray-800/60" role="group" aria-label={label}>
        <IconBtn icon={Minus} label={`${label}: less`} onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} className="h-7 w-7" />
        <input
          type="number"
          aria-label={label}
          value={value}
          min={0}
          max={max}
          onChange={(e) => onChange(Math.min(max, Math.max(0, Number(e.target.value) || 0)))}
          className="w-12 bg-transparent text-center text-base font-bold tabular-nums text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/40 dark:text-white"
        />
        <IconBtn icon={Plus} label={`${label}: more`} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="h-7 w-7" />
      </span>
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {hint} · {value === 1 ? "1 day" : `${value} days`}
      </span>
    </motion.li>
  );
};

const SettingsSkeleton: React.FC = () => (
  <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading settings">
    <div className={cx(surface.card, "grid gap-3 p-5 sm:grid-cols-3 xl:grid-cols-6")}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-2">
          <Skeleton className="h-12 w-12 !rounded-2xl" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-8 w-28 !rounded-full" />
        </div>
      ))}
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Skeleton className="h-64 !rounded-2xl" />
      <Skeleton className="h-64 !rounded-2xl" />
    </div>
  </div>
);

const SaveBar: React.FC<{ open: boolean; total: number; busy: boolean; onDiscard: () => void; onSave: () => void }> = ({ open, total, busy, onDiscard, onSave }) => {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="region"
          aria-label="Unsaved changes"
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
          className="sticky bottom-4 z-30 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-gray-700/40 dark:bg-gray-900/95"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden />
            <span data-testid="settings-dirty">{total}</span> unsaved {total === 1 ? "change" : "changes"}
          </span>
          <span className="ml-auto flex gap-2">
            <Btn size="sm" icon={RotateCcw} onClick={onDiscard} disabled={busy}>
              Discard
            </Btn>
            <Btn size="sm" tone="primary" icon={Save} busy={busy} onClick={onSave}>
              Save changes
            </Btn>
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SettingsPage;
