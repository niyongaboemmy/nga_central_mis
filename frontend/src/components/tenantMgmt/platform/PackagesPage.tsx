import React, { Fragment, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Eye, EyeOff, Infinity as InfinityIcon, Package as PackageIcon, Pencil, Power, RotateCcw, Save, School } from "lucide-react";
import Modal from "../../ui/Modal";
import { ACCENTS, EmptyState, EntitlementIcons, Segmented, accentOf, entIcon } from "../kit";
import { platformApi, type EntKind, type Entitlement, type PackageInfo } from "../../../api/tenantMgmt";
import { Btn, Field, IconBtn, Skeleton, SkeletonGrid, Switch, cx, errorText, inputCls, surface, toast, usePlatform } from "./platformShared";

type Meta = Pick<PackageInfo, "name" | "tagline" | "description" | "accent" | "priceTerm" | "priceYear" | "isPublic" | "isActive">;
/** per key: APP/FEATURE -> held (value null); LIMIT -> number | null (∞) */
type Cell = { on: boolean; value: number | null };
type Draft = { meta: Meta; cells: Record<string, Cell> };

const META_KEYS: Array<keyof Meta> = ["name", "tagline", "description", "accent", "priceTerm", "priceYear", "isPublic", "isActive"];

/** The matrix card's surface as one opaque colour, so sticky cells mask what scrolls under them. */
const STICKY_BG = "bg-white dark:bg-[#0c1016]";

const toDraft = (p: PackageInfo, catalog: Entitlement[]): Draft => {
  const cells: Record<string, Cell> = {};
  for (const e of catalog) {
    const held = p.entitlements.find((x) => x.key === e.key);
    cells[e.key] = e.kind === "LIMIT" ? { on: true, value: held ? held.value : null } : { on: !!held, value: null };
  }
  return {
    meta: { name: p.name, tagline: p.tagline, description: p.description, accent: p.accent, priceTerm: p.priceTerm, priceYear: p.priceYear, isPublic: p.isPublic, isActive: p.isActive },
    cells,
  };
};

const metaDiff = (a: Draft, b: Draft) => META_KEYS.filter((k) => (a.meta[k] ?? null) !== (b.meta[k] ?? null));
const cellDiff = (a: Draft, b: Draft) => Object.keys(b.cells).filter((k) => a.cells[k]?.on !== b.cells[k].on || a.cells[k]?.value !== b.cells[k].value);
export const diffCount = (a: Draft, b: Draft) => metaDiff(a, b).length + cellDiff(a, b).length;

const GROUPS: Array<{ kind: EntKind; label: string }> = [
  { kind: "APP", label: "Apps" },
  { kind: "FEATURE", label: "Features" },
  { kind: "LIMIT", label: "Limits" },
];

const PackagesPage: React.FC = () => {
  const { setDirty } = usePlatform();
  const [packages, setPackages] = useState<PackageInfo[] | null>(null);
  const [catalog, setCatalog] = useState<Entitlement[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [schools, setSchools] = useState<Record<string, number> | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [mobileCol, setMobileCol] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([platformApi.packages(), platformApi.entitlementCatalog()]).then(
      ([p, c]) => {
        const sorted = [...p].sort((x, y) => x.tier - y.tier);
        setPackages(sorted);
        setCatalog(c);
        setDrafts(Object.fromEntries(sorted.map((x) => [x.code, toDraft(x, c)])));
        setMobileCol(sorted[0]?.code ?? "");
      },
      (e) => setError(errorText(e)),
    );
    // Schools per plan: a nicety -- without the view capability the cards just leave it out.
    platformApi.tenants().then(
      (list) => {
        const by: Record<string, number> = {};
        for (const t of list ?? []) if (t.status !== "ARCHIVED") by[t.pkg] = (by[t.pkg] ?? 0) + 1;
        setSchools(by);
      },
      () => setSchools(null),
    );
  }, []);

  const base = useMemo(() => Object.fromEntries((packages ?? []).map((p) => [p.code, toDraft(p, catalog)])), [packages, catalog]);
  const dirtyBy = useMemo(() => Object.fromEntries(Object.keys(drafts).map((c) => [c, base[c] ? diffCount(base[c], drafts[c]) : 0])), [drafts, base]);
  const dirtyCodes = Object.keys(dirtyBy).filter((c) => dirtyBy[c] > 0);
  const anyDirty = dirtyCodes.length > 0;
  useEffect(() => {
    setDirty(anyDirty);
    return () => setDirty(false);
  }, [anyDirty, setDirty]);

  if (error) return <EmptyState icon={PackageIcon} title={error} />;
  if (!packages) return <SkeletonGrid cards={4} label="Loading packages" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" cardClassName="h-56" />;

  const setMeta = (code: string, patch: Partial<Meta>) => setDrafts((d) => ({ ...d, [code]: { ...d[code], meta: { ...d[code].meta, ...patch } } }));
  const setCell = (code: string, key: string, patch: Partial<Cell>) =>
    setDrafts((d) => ({ ...d, [code]: { ...d[code], cells: { ...d[code].cells, [key]: { ...d[code].cells[key], ...patch } } } }));

  /** Save one package: its details (if changed) then its entitlements (if changed). */
  const saveOne = async (p: PackageInfo): Promise<boolean> => {
    const draft = drafts[p.code];
    const was = base[p.code];
    let next: PackageInfo = p;
    const keys = metaDiff(was, draft);
    if (keys.length) next = await platformApi.savePackage(p.code, Object.fromEntries(keys.map((k) => [k, draft.meta[k]])) as Partial<Meta>);
    if (cellDiff(was, draft).length) {
      const ents = catalog.filter((e) => draft.cells[e.key]?.on).map((e) => ({ key: e.key, value: e.kind === "LIMIT" ? draft.cells[e.key].value : null }));
      next = await platformApi.savePackageEntitlements(p.code, ents);
    }
    setPackages((list) => (list ?? []).map((x) => (x.code === p.code ? { ...x, ...next } : x)));
    setDrafts((d) => ({ ...d, [p.code]: toDraft({ ...p, ...next }, catalog) }));
    return true;
  };

  const saveAll = async () => {
    setSaving(true);
    const names: string[] = [];
    for (const code of dirtyCodes) {
      const p = packages.find((x) => x.code === code);
      if (!p) continue;
      try {
        await saveOne(p);
        names.push(drafts[code].meta.name);
      } catch (e) {
        toast(`${drafts[code].meta.name}: ${errorText(e)}`, "error");
      }
    }
    setSaving(false);
    if (names.length) toast(`${names.join(", ")} saved`);
  };

  const discard = () => {
    setDrafts(Object.fromEntries(packages.map((p) => [p.code, toDraft(p, catalog)])));
    toast("Changes discarded", "info");
  };

  const colCls = (code: string) => (code === mobileCol ? "" : "hidden md:table-cell");
  const editPkg = editing ? packages.find((p) => p.code === editing) : null;

  return (
    <div className="space-y-4 pb-20">
      {/* Plans */}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Plans">
        {packages.map((p, i) => (
          <PlanCard
            key={p.code}
            pkg={p}
            index={i}
            draft={drafts[p.code]}
            catalog={catalog}
            changed={dirtyBy[p.code] ?? 0}
            schools={schools === undefined ? undefined : schools === null ? null : schools[p.code] ?? 0}
            onToggle={(patch) => setMeta(p.code, patch)}
            onEdit={() => setEditing(p.code)}
          />
        ))}
      </ul>

      {/* What each plan includes */}
      <div className="md:hidden">
        <Segmented label="Package column" value={mobileCol} onChange={setMobileCol} options={packages.map((p) => ({ value: p.code, label: drafts[p.code]?.meta.name ?? p.name }))} />
      </div>
      <section className={cx("overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700/40", STICKY_BG)} aria-label="What each plan includes">
        <div className="overflow-x-auto">
          <table className="w-full min-w-0 border-collapse text-sm">
            <thead>
              <tr>
                <th className={cx("sticky left-0 z-10 w-56 px-4 py-3 text-left align-bottom text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400", STICKY_BG)}>Included</th>
                {packages.map((p) => {
                  const a = accentOf(drafts[p.code].meta.accent);
                  return (
                    <th key={p.code} scope="col" className={cx("min-w-[9rem] px-3 py-3 text-center align-bottom", colCls(p.code))}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className={cx("h-2 w-2 rounded-full", a.bg)} aria-hidden />
                        <span className="font-semibold text-gray-900 dark:text-white">{drafts[p.code].meta.name}</span>
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => {
                const rows = catalog.filter((e) => e.kind === g.kind);
                if (!rows.length) return null;
                return (
                  <Fragment key={g.kind}>
                    <tr>
                      <th colSpan={packages.length + 1} scope="colgroup" className="bg-gray-50/80 px-4 pb-1.5 pt-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:bg-white/[0.02] dark:text-gray-400">
                        <span className="sticky left-4">{g.label}</span>
                      </th>
                    </tr>
                    {rows.map((e) => {
                      const Icon = entIcon(e.key);
                      return (
                        <tr key={e.key} className={cx("group border-t", surface.divider)}>
                          <th scope="row" className={cx("sticky left-0 z-10 px-4 py-2.5 text-left font-medium text-gray-800 transition-colors group-hover:bg-gray-50 dark:text-gray-100 dark:group-hover:bg-[#121821]", STICKY_BG)}>
                            <span className="flex items-center gap-2.5">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800/70 dark:text-gray-400" aria-hidden>
                                <Icon className="h-3.5 w-3.5" />
                              </span>
                              <span className="truncate">{e.label}</span>
                            </span>
                          </th>
                          {packages.map((p) => {
                            const cell = drafts[p.code].cells[e.key];
                            const changed = base[p.code] && (base[p.code].cells[e.key]?.on !== cell.on || base[p.code].cells[e.key]?.value !== cell.value);
                            return (
                              <td key={p.code} className={cx("px-3 py-2 text-center transition-colors group-hover:bg-gray-50/60 dark:group-hover:bg-white/[0.02]", changed && "!bg-blue-50 dark:!bg-blue-500/10", colCls(p.code))}>
                                {e.kind === "LIMIT" ? (
                                  <LimitInput label={`${drafts[p.code].meta.name}: ${e.label}`} value={cell.value} onChange={(v) => setCell(p.code, e.key, { value: v })} />
                                ) : (
                                  <span className="inline-flex justify-center">
                                    <Switch checked={cell.on} onChange={(v) => setCell(p.code, e.key, { on: v })} label={`${drafts[p.code].meta.name}: ${e.label}`} />
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <SaveBar
        open={anyDirty}
        busy={saving}
        changes={dirtyCodes.map((c) => ({ code: c, name: drafts[c].meta.name, n: dirtyBy[c] }))}
        onDiscard={discard}
        onSave={saveAll}
      />

      {editPkg && (
        <EditPlanModal
          pkg={editPkg}
          draft={drafts[editPkg.code]}
          onClose={() => setEditing(null)}
          onApply={(meta) => {
            setMeta(editPkg.code, meta);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Plan card
// ---------------------------------------------------------------------------

const PlanCard: React.FC<{
  pkg: PackageInfo;
  index: number;
  draft: Draft;
  catalog: Entitlement[];
  changed: number;
  /** undefined: loading; null: not allowed to see */
  schools: number | null | undefined;
  onToggle: (patch: Partial<Meta>) => void;
  onEdit: () => void;
}> = ({ pkg, index, draft, catalog, changed, schools, onToggle, onEdit }) => {
  const reduced = useReducedMotion();
  const m = draft.meta;
  const a = accentOf(m.accent);
  const held = catalog
    .filter((e) => e.kind !== "LIMIT" && draft.cells[e.key]?.on)
    .map((e) => ({ ...e, value: null }));
  const limits = catalog.filter((e) => e.kind === "LIMIT");
  return (
    <motion.li
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: reduced ? 0 : index * 0.05 }}
      className={cx("flex flex-col gap-4 p-4", surface.card, !m.isActive && "opacity-70")}
    >
      <div className="flex items-start gap-3">
        <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white", a.bg)} aria-hidden>
          {pkg.tier}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="truncate text-base font-semibold text-gray-900 dark:text-white">{m.name}</span>
            {changed > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" title="Unsaved changes" aria-label="Unsaved changes" />}
          </p>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{m.tagline || "No tagline"}</p>
        </div>
        <IconBtn icon={Pencil} label={`Edit ${m.name}`} onClick={onEdit} className="-mr-1 -mt-1 h-8 w-8" />
      </div>

      <div className="flex items-end gap-4">
        <div>
          <p className="whitespace-nowrap text-xl font-bold tabular-nums text-gray-900 dark:text-white">
            {m.priceTerm === null ? "—" : m.priceTerm.toLocaleString()}
            {m.priceTerm !== null && <span className="ml-1 text-xs font-semibold text-gray-500 dark:text-gray-400">{pkg.currency}</span>}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">per term</p>
        </div>
        <div>
          <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-200">
            {m.priceYear === null ? "—" : m.priceYear.toLocaleString()}
            {m.priceYear !== null && <span className="ml-1 text-[11px] text-gray-500 dark:text-gray-400">{pkg.currency}</span>}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">per year</p>
        </div>
        <div className="ml-auto text-right" aria-live="polite">
          {schools === undefined ? (
            <Skeleton className="ml-auto h-6 w-10" />
          ) : schools === null ? null : (
            <>
              <p className="inline-flex items-center gap-1 text-xl font-bold tabular-nums text-gray-900 dark:text-white">
                <School className="h-4 w-4 text-gray-400" aria-hidden />
                {schools}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{schools === 1 ? "school" : "schools"}</p>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {limits.map((e) => {
          const Icon = entIcon(e.key);
          const v = draft.cells[e.key]?.value ?? null;
          return (
            <span key={e.key} className="inline-flex items-center gap-1 rounded-lg bg-gray-50 px-2 py-1 text-xs font-semibold tabular-nums text-gray-700 dark:bg-gray-800/60 dark:text-gray-200" title={e.label}>
              <Icon className="h-3.5 w-3.5 text-gray-400" aria-hidden />
              {v === null ? "∞" : v.toLocaleString()}
              <span className="sr-only">{e.label}</span>
            </span>
          );
        })}
      </div>

      <EntitlementIcons entitlements={held} all={catalog} size="sm" />

      <div className="mt-auto flex gap-1.5">
        <StateChip on={m.isPublic} onIcon={Eye} offIcon={EyeOff} onLabel="Public" offLabel="Hidden" name={`${m.name} public`} onClick={() => onToggle({ isPublic: !m.isPublic })} />
        <StateChip on={m.isActive} onIcon={Power} offIcon={Power} onLabel="Active" offLabel="Inactive" name={`${m.name} active`} onClick={() => onToggle({ isActive: !m.isActive })} />
      </div>
    </motion.li>
  );
};

const StateChip: React.FC<{ on: boolean; onIcon: React.ElementType; offIcon: React.ElementType; onLabel: string; offLabel: string; name: string; onClick: () => void }> = ({
  on,
  onIcon: OnIcon,
  offIcon: OffIcon,
  onLabel,
  offLabel,
  name,
  onClick,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={name}
    onClick={onClick}
    className={cx(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
      on ? "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:hover:bg-blue-500/25" : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800/70 dark:text-gray-400 dark:hover:bg-gray-800",
    )}
  >
    {on ? <OnIcon className="h-3.5 w-3.5" aria-hidden /> : <OffIcon className="h-3.5 w-3.5" aria-hidden />}
    {on ? onLabel : offLabel}
  </button>
);

// ---------------------------------------------------------------------------
// Edit plan details (goes into the draft; the save bar commits it)
// ---------------------------------------------------------------------------

const EditPlanModal: React.FC<{ pkg: PackageInfo; draft: Draft; onClose: () => void; onApply: (meta: Partial<Meta>) => void }> = ({ pkg, draft, onClose, onApply }) => {
  const [f, setF] = useState<Meta>(draft.meta);
  const ok = f.name.trim().length > 0;
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <Pencil className="h-5 w-5" aria-hidden />
          {pkg.name}
        </span>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onApply({ ...f, name: f.name.trim(), tagline: f.tagline?.trim() || null, description: f.description?.trim() || null });
        }}
      >
        <Field label="Name">{(id) => <input id={id} autoFocus required maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} />}</Field>
        <Field label="Tagline">{(id) => <input id={id} maxLength={160} value={f.tagline ?? ""} onChange={(e) => setF({ ...f, tagline: e.target.value })} className={inputCls} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Per term">{(id) => <PriceInput id={id} currency={pkg.currency} value={f.priceTerm} onChange={(v) => setF({ ...f, priceTerm: v })} />}</Field>
          <Field label="Per year">{(id) => <PriceInput id={id} currency={pkg.currency} value={f.priceYear} onChange={(v) => setF({ ...f, priceYear: v })} />}</Field>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">Colour</p>
          <div className="flex gap-2" role="radiogroup" aria-label="Colour">
            {Object.keys(ACCENTS).map((k) => {
              const on = (f.accent ?? "sky") === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`Shade ${Object.keys(ACCENTS).indexOf(k) + 1}`}
                  onClick={() => setF({ ...f, accent: k })}
                  className={cx("flex h-9 w-9 items-center justify-center rounded-full text-white transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2", ACCENTS[k].bg, on && "ring-2 ring-offset-2 ring-blue-600 dark:ring-offset-gray-900")}
                >
                  {on && <Check className="h-4 w-4" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-5">
          <Switch checked={f.isPublic} onChange={(v) => setF({ ...f, isPublic: v })} label="Shown to schools" showLabel />
          <Switch checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Active" showLabel />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn type="submit" tone="primary" icon={Check} disabled={!ok}>
            Apply
          </Btn>
        </div>
      </form>
    </Modal>
  );
};

const PriceInput: React.FC<{ id: string; currency: string; value: number | null; onChange: (v: number | null) => void }> = ({ id, currency, value, onChange }) => (
  <span className="relative block">
    <input
      id={id}
      type="number"
      min={0}
      placeholder="On request"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className={cx(inputCls, "pr-14 text-right tabular-nums")}
    />
    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500 dark:text-gray-400">{currency}</span>
  </span>
);

// ---------------------------------------------------------------------------
// Limit cell: a number or ∞
// ---------------------------------------------------------------------------

const LimitInput: React.FC<{ label: string; value: number | null; onChange: (v: number | null) => void }> = ({ label, value, onChange }) => {
  const [last, setLast] = useState<number>(value ?? 100);
  const unlimited = value === null;
  return (
    <span className="inline-flex items-center gap-1 rounded-xl bg-gray-50 p-0.5 dark:bg-gray-800/60">
      {unlimited ? (
        <span className="w-16 text-center text-base font-bold text-blue-600 dark:text-blue-400" aria-hidden>
          ∞
        </span>
      ) : (
        <input
          type="number"
          min={0}
          aria-label={label}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value) || 0;
            setLast(n);
            onChange(n);
          }}
          className="w-16 rounded-lg bg-transparent px-1.5 py-1 text-right text-sm font-semibold tabular-nums text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/40 dark:text-white"
        />
      )}
      <button
        type="button"
        aria-pressed={unlimited}
        aria-label={`${label}: unlimited`}
        title="Unlimited"
        onClick={() => onChange(unlimited ? last : null)}
        className={cx("flex h-7 w-7 items-center justify-center rounded-full transition-colors", unlimited ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700/60")}
      >
        <InfinityIcon className="h-4 w-4" aria-hidden />
      </button>
    </span>
  );
};

// ---------------------------------------------------------------------------
// Save bar: appears with the first change, lists what changed
// ---------------------------------------------------------------------------

const SaveBar: React.FC<{ open: boolean; busy: boolean; changes: Array<{ code: string; name: string; n: number }>; onDiscard: () => void; onSave: () => void }> = ({ open, busy, changes, onDiscard, onSave }) => {
  const reduced = useReducedMotion();
  const total = changes.reduce((t, c) => t + c.n, 0);
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
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {total} {total === 1 ? "change" : "changes"}
          </span>
          <span className="flex flex-wrap gap-1.5">
            {changes.map((c) => (
              <span key={c.code} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                {c.name}
                <span className="rounded-full bg-blue-600 px-1.5 text-[11px] font-bold text-white" data-testid={`dirty-${c.code}`}>
                  {c.n}
                </span>
              </span>
            ))}
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

export default PackagesPage;
