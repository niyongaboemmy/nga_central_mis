import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, ArrowDown, ArrowUp, Check, Clock, FileClock, FileText, Hourglass, Plus, Receipt, Save, Scale, Send, Timer, Trash2, type LucideIcon } from "lucide-react";
import { platformApi, type DocumentKind, type PaymentInstruction, type PaymentMethod } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { Btn, Card, IconBtn, Spinner, Stepper, Switch, cx, errorText, inputCls, toast, usePlatform } from "./platformShared";
import { METHOD_META } from "./BillingPage";

type Item = Omit<PaymentInstruction, "id"> & { id?: number; _k: string };

const WINDOWS: Array<{ key: string; label: string; icon: LucideIcon; max: number }> = [
  { key: "grace.days", label: "Grace", icon: Timer, max: 90 },
  { key: "archive.retention_days", label: "Retention", icon: Archive, max: 3650 },
  { key: "invoice.due_days", label: "Invoice due", icon: Receipt, max: 120 },
  { key: "application.payment_expiry_days", label: "Payment expiry", icon: Hourglass, max: 365 },
  { key: "application.draft_expiry_days", label: "Draft expiry", icon: FileClock, max: 365 },
  { key: "review.sla_days", label: "Review SLA", icon: Clock, max: 60 },
];
const SWITCHES: Array<{ key: string; label: string; icon: LucideIcon }> = [
  { key: "billing.auto_issue_on_approval", label: "Auto-issue on approval", icon: Send },
  { key: "billing.separation_of_duties", label: "Separation of duties", icon: Scale },
];
const DOC_KINDS: Array<{ kind: DocumentKind; label: string }> = [
  { kind: "REGISTRATION_CERT", label: "Registration" },
  { kind: "AUTHORISATION_LETTER", label: "Authorisation" },
  { kind: "LOGO", label: "Logo" },
  { kind: "OTHER", label: "Other" },
];
const METHODS: PaymentMethod[] = ["MOMO", "AIRTEL_MONEY", "BANK_TRANSFER", "CASH", "OTHER"];

let seq = 0;
const key = () => `k${++seq}`;

const SettingsPage: React.FC = () => {
  const { setDirty } = usePlatform();
  const [base, setBase] = useState<Record<string, unknown> | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [items, setItems] = useState<Item[] | null>(null);
  const [itemsBase, setItemsBase] = useState<string>("[]");
  const [busy, setBusy] = useState<"settings" | "items" | null>(null);
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
        setItemsBase(JSON.stringify(sorted.map(({ _k, ...x }) => x)));
      },
      () => setItems([]),
    );
  }, []);

  const changed = useMemo(() => (base ? Object.keys(draft).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(base[k])) : []), [base, draft]);
  const itemsPayload = (list: Item[]) => list.map(({ _k, ...x }, i) => ({ ...x, sortOrder: i }));
  const itemsDirty = items ? JSON.stringify(itemsPayload(items)) !== JSON.stringify(itemsPayload(JSON.parse(itemsBase))) : false;
  useEffect(() => {
    setDirty(changed.length > 0 || itemsDirty);
    return () => setDirty(false);
  }, [changed.length, itemsDirty, setDirty]);

  if (error) return <p className="text-sm text-red-600 dark:text-red-300">{error}</p>;
  if (!base) return <Spinner />;

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

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Windows</h2>
          <Btn
            size="sm"
            tone={changed.length ? "primary" : "ghost"}
            icon={Save}
            disabled={!changed.length}
            busy={busy === "settings"}
            onClick={async () => {
              setBusy("settings");
              try {
                const patch = Object.fromEntries(changed.map((k) => [k, draft[k]]));
                const next = await platformApi.saveSettings(patch);
                const merged = { ...base, ...patch, ...(next ?? {}) };
                setBase(merged);
                setDraft(merged);
                toast("Saved");
              } catch (e) {
                toast(errorText(e), "error");
              } finally {
                setBusy(null);
              }
            }}
          >
            Save{changed.length > 0 && <span className="ml-1 rounded-full bg-white/25 px-1.5 text-[11px]">{changed.length}</span>}
          </Btn>
        </div>
        <ul className="space-y-2">
          {WINDOWS.map((w) => (
            <li key={w.key} className="flex items-center gap-3">
              <w.icon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-300" aria-hidden />
              <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">{w.label}</span>
              <Stepper label={w.label} value={num(w.key)} min={0} max={w.max} onChange={(v) => setDraft((d) => ({ ...d, [w.key]: v }))} />
            </li>
          ))}
        </ul>
        <ul className="space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          {SWITCHES.map((s) => (
            <li key={s.key} className="flex items-center gap-3">
              <s.icon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-300" aria-hidden />
              <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">{s.label}</span>
              <Switch checked={!!draft[s.key]} onChange={(v) => setDraft((d) => ({ ...d, [s.key]: v }))} label={s.label} />
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
            <FileText className="h-4 w-4 text-slate-500 dark:text-slate-300" aria-hidden />
            Required documents
          </p>
          <div className="flex flex-wrap gap-2">
            {DOC_KINDS.map((k) => {
              const on = docs.includes(k.kind);
              return (
                <button
                  key={k.kind}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDraft((d) => ({ ...d, "documents.required": on ? docs.filter((x) => x !== k.kind) : [...docs, k.kind] }))}
                  className={cx(
                    "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                    on ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200",
                  )}
                >
                  {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                  {k.label}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">How to pay</h2>
          <div className="flex gap-2">
            <Btn size="sm" icon={Plus} onClick={() => setItems((l) => [...(l ?? []), { method: "MOMO", label: "", details: "", sortOrder: (l ?? []).length, isActive: true, _k: key() }])}>
              Add
            </Btn>
            <Btn
              size="sm"
              tone={itemsDirty ? "primary" : "ghost"}
              icon={Save}
              disabled={!itemsDirty || !items}
              busy={busy === "items"}
              onClick={async () => {
                if (!items) return;
                setBusy("items");
                try {
                  const saved = await platformApi.savePaymentInstructions(itemsPayload(items).filter((x) => x.label.trim() || x.details.trim()));
                  const sorted = [...saved].sort((a, b) => a.sortOrder - b.sortOrder).map((x) => ({ ...x, _k: key() }));
                  setItems(sorted);
                  setItemsBase(JSON.stringify(sorted.map(({ _k, ...x }) => x)));
                  toast("Saved");
                } catch (e) {
                  toast(errorText(e), "error");
                } finally {
                  setBusy(null);
                }
              }}
            >
              Save
            </Btn>
          </div>
        </div>
        {!items ? (
          <Spinner />
        ) : (
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {items.map((it, i) => (
                <motion.li key={it._k} layout {...m("reveal")} className={cx("space-y-2 rounded-2xl border p-3", it.isActive ? "border-slate-200 dark:border-slate-700" : "border-dashed border-slate-300 opacity-70 dark:border-slate-600")}>
                  <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={`Method ${i + 1}`}>
                    {METHODS.map((mt) => {
                      const meta = METHOD_META[mt];
                      const on = it.method === mt;
                      return (
                        <button
                          key={mt}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setItem(i, { method: mt })}
                          className={cx("flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-all", on ? cx(meta.tone, "ring-2 ring-brand-500") : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800")}
                        >
                          <meta.icon className="h-4 w-4" aria-hidden />
                          {meta.label}
                        </button>
                      );
                    })}
                    <span className="ml-auto flex items-center">
                      <IconBtn icon={ArrowUp} label="Move up" onClick={() => move(i, -1)} disabled={i === 0} className="h-8 w-8" />
                      <IconBtn icon={ArrowDown} label="Move down" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="h-8 w-8" />
                      <IconBtn icon={Trash2} label="Remove" tone="danger" onClick={() => setItems((l) => (l ?? []).filter((_, j) => j !== i))} className="h-8 w-8" />
                    </span>
                  </div>
                  <input aria-label="Label" placeholder="Label" value={it.label} onChange={(e) => setItem(i, { label: e.target.value })} className={inputCls} />
                  <textarea aria-label="Details" placeholder="Details" rows={2} value={it.details} onChange={(e) => setItem(i, { details: e.target.value })} className={cx(inputCls, "font-mono text-xs")} />
                  <Switch checked={it.isActive} onChange={(v) => setItem(i, { isActive: v })} label="Active" showLabel />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </Card>
    </div>
  );
};

export default SettingsPage;
