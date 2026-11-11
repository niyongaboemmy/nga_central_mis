import React, { Fragment, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Infinity as InfinityIcon, Package as PackageIcon, Save } from "lucide-react";
import { EmptyState, Segmented, accentOf, entIcon } from "../kit";
import { platformApi, type EntKind, type Entitlement, type PackageInfo } from "../../../api/tenantMgmt";
import { Btn, Card, Spinner, Switch, cx, errorText, inputCls, toast, usePlatform } from "./platformShared";

type Meta = Pick<PackageInfo, "name" | "tagline" | "priceTerm" | "priceYear" | "isPublic" | "isActive">;
/** per key: APP/FEATURE -> held (value null); LIMIT -> number | null (∞) */
type Cell = { on: boolean; value: number | null };
type Draft = { meta: Meta; cells: Record<string, Cell> };

const META_KEYS: Array<keyof Meta> = ["name", "tagline", "priceTerm", "priceYear", "isPublic", "isActive"];

const toDraft = (p: PackageInfo, catalog: Entitlement[]): Draft => {
  const cells: Record<string, Cell> = {};
  for (const e of catalog) {
    const held = p.entitlements.find((x) => x.key === e.key);
    cells[e.key] = e.kind === "LIMIT" ? { on: true, value: held ? held.value : null } : { on: !!held, value: null };
  }
  return { meta: { name: p.name, tagline: p.tagline, priceTerm: p.priceTerm, priceYear: p.priceYear, isPublic: p.isPublic, isActive: p.isActive }, cells };
};

export const diffCount = (a: Draft, b: Draft) =>
  META_KEYS.filter((k) => (a.meta[k] ?? null) !== (b.meta[k] ?? null)).length +
  Object.keys(b.cells).filter((k) => a.cells[k]?.on !== b.cells[k].on || a.cells[k]?.value !== b.cells[k].value).length;

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
  const [saving, setSaving] = useState<string | null>(null);
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
  }, []);

  const base = useMemo(() => Object.fromEntries((packages ?? []).map((p) => [p.code, toDraft(p, catalog)])), [packages, catalog]);
  const dirtyBy = useMemo(() => Object.fromEntries(Object.keys(drafts).map((c) => [c, base[c] ? diffCount(base[c], drafts[c]) : 0])), [drafts, base]);
  const anyDirty = Object.values(dirtyBy).some((n) => n > 0);
  useEffect(() => {
    setDirty(anyDirty);
    return () => setDirty(false);
  }, [anyDirty, setDirty]);

  if (error) return <EmptyState icon={PackageIcon} title={error} />;
  if (!packages) return <Spinner />;

  const setMeta = (code: string, patch: Partial<Meta>) => setDrafts((d) => ({ ...d, [code]: { ...d[code], meta: { ...d[code].meta, ...patch } } }));
  const setCell = (code: string, key: string, patch: Partial<Cell>) =>
    setDrafts((d) => ({ ...d, [code]: { ...d[code], cells: { ...d[code].cells, [key]: { ...d[code].cells[key], ...patch } } } }));

  const save = async (p: PackageInfo) => {
    const draft = drafts[p.code];
    const was = base[p.code];
    setSaving(p.code);
    try {
      let next: PackageInfo = p;
      const metaPatch: Partial<Meta> = {};
      for (const k of META_KEYS) if ((was.meta[k] ?? null) !== (draft.meta[k] ?? null)) (metaPatch as Record<string, unknown>)[k] = draft.meta[k];
      if (Object.keys(metaPatch).length) next = await platformApi.savePackage(p.code, metaPatch);
      const entsChanged = Object.keys(draft.cells).some((k) => was.cells[k]?.on !== draft.cells[k].on || was.cells[k]?.value !== draft.cells[k].value);
      if (entsChanged) {
        const ents = catalog.filter((e) => draft.cells[e.key]?.on).map((e) => ({ key: e.key, value: e.kind === "LIMIT" ? draft.cells[e.key].value : null }));
        next = await platformApi.savePackageEntitlements(p.code, ents);
      }
      setPackages((list) => (list ?? []).map((x) => (x.code === p.code ? { ...x, ...next } : x)));
      setDrafts((d) => ({ ...d, [p.code]: toDraft({ ...p, ...next }, catalog) }));
      toast(`${draft.meta.name} saved`);
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setSaving(null);
    }
  };

  const colCls = (code: string) => (code === mobileCol ? "" : "hidden md:table-cell");

  return (
    <div className="space-y-3">
      <div className="md:hidden">
        <Segmented label="Package column" value={mobileCol} onChange={setMobileCol} options={packages.map((p) => ({ value: p.code, label: p.name }))} />
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-0 border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-48 bg-white p-3 text-left align-bottom dark:bg-slate-900">
                <span className="sr-only">Entitlement</span>
              </th>
              {packages.map((p) => {
                const a = accentOf(p.accent);
                const d = drafts[p.code];
                const n = dirtyBy[p.code] ?? 0;
                return (
                  <th key={p.code} scope="col" className={cx("min-w-[12rem] p-3 align-top font-normal", colCls(p.code))}>
                    <div className={cx("mb-2 h-1.5 rounded-full bg-gradient-to-r", a.grad)} aria-hidden />
                    <div className="space-y-2 text-left">
                      <input aria-label={`${p.code} name`} value={d.meta.name} onChange={(e) => setMeta(p.code, { name: e.target.value })} className={cx(inputCls, "font-bold", a.text)} />
                      <input aria-label={`${p.code} tagline`} placeholder="Tagline" value={d.meta.tagline ?? ""} onChange={(e) => setMeta(p.code, { tagline: e.target.value || null })} className={cx(inputCls, "py-1 text-xs")} />
                      <div className="grid grid-cols-2 gap-1">
                        <PriceInput label={`${p.code} price per term`} short="/term" value={d.meta.priceTerm} onChange={(v) => setMeta(p.code, { priceTerm: v })} />
                        <PriceInput label={`${p.code} price per year`} short="/yr" value={d.meta.priceYear} onChange={(v) => setMeta(p.code, { priceYear: v })} />
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Switch checked={d.meta.isPublic} onChange={(v) => setMeta(p.code, { isPublic: v })} label="Public" showLabel />
                        <Switch checked={d.meta.isActive} onChange={(v) => setMeta(p.code, { isActive: v })} label="Active" showLabel />
                      </div>
                      <Btn size="sm" tone={n ? "primary" : "ghost"} icon={Save} disabled={!n} busy={saving === p.code} onClick={() => save(p)} className="w-full" aria-label={`Save ${d.meta.name}`}>
                        Save
                        <AnimatePresence>
                          {n > 0 && (
                            <motion.span key={n} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="ml-1 rounded-full bg-white/25 px-1.5 text-[11px] font-bold" data-testid={`dirty-${p.code}`}>
                              {n}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </Btn>
                    </div>
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
                    <th colSpan={packages.length + 1} scope="colgroup" className="bg-slate-50 px-3 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {g.label}
                    </th>
                  </tr>
                  {rows.map((e) => {
                    const Icon = entIcon(e.key);
                    return (
                      <tr key={e.key} className="border-t border-slate-100 dark:border-slate-800">
                        <th scope="row" className="sticky left-0 z-10 bg-white p-2 pl-3 text-left font-medium text-slate-800 dark:bg-slate-900 dark:text-slate-100">
                          <span className="flex items-center gap-2">
                            <Icon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-300" aria-hidden />
                            <span className="truncate">{e.label}</span>
                          </span>
                        </th>
                        {packages.map((p) => {
                          const cell = drafts[p.code].cells[e.key];
                          const changed = base[p.code] && (base[p.code].cells[e.key]?.on !== cell.on || base[p.code].cells[e.key]?.value !== cell.value);
                          return (
                            <td key={p.code} className={cx("p-2 text-center", changed && "bg-brand-50 dark:bg-brand-500/10", colCls(p.code))}>
                              {e.kind === "LIMIT" ? (
                                <LimitInput label={`${drafts[p.code].meta.name}: ${e.label}`} value={cell.value} onChange={(v) => setCell(p.code, e.key, { value: v })} />
                              ) : (
                                <Switch checked={cell.on} onChange={(v) => setCell(p.code, e.key, { on: v })} label={`${drafts[p.code].meta.name}: ${e.label}`} />
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
      </Card>
    </div>
  );
};

const PriceInput: React.FC<{ label: string; short: string; value: number | null; onChange: (v: number | null) => void }> = ({ label, short, value, onChange }) => (
  <label className="relative block">
    <span className="sr-only">{label}</span>
    <input
      type="number"
      min={0}
      placeholder="—"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className={cx(inputCls, "py-1 pr-10 text-right text-xs tabular-nums")}
    />
    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 dark:text-slate-300">{short}</span>
  </label>
);

const LimitInput: React.FC<{ label: string; value: number | null; onChange: (v: number | null) => void }> = ({ label, value, onChange }) => {
  const [last, setLast] = useState<number>(value ?? 100);
  const unlimited = value === null;
  return (
    <span className="inline-flex items-center gap-1">
      {unlimited ? (
        <span className="w-20 text-center text-lg font-bold text-emerald-600 dark:text-emerald-300" aria-hidden>
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
          className={cx(inputCls, "w-20 py-1 text-right tabular-nums")}
        />
      )}
      <button
        type="button"
        aria-pressed={unlimited}
        aria-label={`${label}: unlimited`}
        title="Unlimited"
        onClick={() => onChange(unlimited ? last : null)}
        className={cx("flex h-7 w-7 items-center justify-center rounded-full", unlimited ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300")}
      >
        <InfinityIcon className="h-4 w-4" aria-hidden />
      </button>
    </span>
  );
};

export default PackagesPage;
