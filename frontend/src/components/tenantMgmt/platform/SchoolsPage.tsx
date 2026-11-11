import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, CalendarClock, Inbox, Search, ShieldCheck } from "lucide-react";
import { EmptyState, MeterBar, Segmented, StatusPill, accentOf } from "../kit";
import { platformApi, type PackageInfo, type TenantLifecycle, type TenantListItem, type UsageMeter } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { Spinner, ago, cx, daysUntil, errorText, inputCls } from "./platformShared";

type Filter = "all" | TenantLifecycle;

/** List rows carry raw counts; the package gives the limits for the bars. */
export const listMeters = (t: TenantListItem, pkg: PackageInfo | undefined): UsageMeter[] => {
  const lim = (k: string) => {
    const e = pkg?.entitlements.find((x) => x.key === k);
    return e ? e.value : null;
  };
  const mk = (key: string, label: string, unit: string, used: number, limit: number | null): UsageMeter => ({ key, label, unit, used, limit, ratio: limit ? used / limit : null });
  const gb = lim("limit.storage_gb");
  return [
    mk("limit.students", "Students", "", t.students, lim("limit.students")),
    mk("limit.staff", "Staff", "", t.staff, lim("limit.staff")),
    mk("limit.storage_gb", "Storage", "MB", Math.round(t.storageMb), gb === null ? null : gb * 1024),
  ];
};

export const PeriodChip: React.FC<{ periodEnd: string | null; graceUntil?: string | null }> = ({ periodEnd, graceUntil }) => {
  const d = daysUntil(graceUntil ?? periodEnd);
  if (d === null) return null;
  const tone = d < 0 ? "bg-red-100 text-red-800 dark:bg-red-400/15 dark:text-red-200" : d <= 30 ? "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", tone)} title={graceUntil ? "Grace ends" : "Period ends"}>
      <CalendarClock className="h-3.5 w-3.5" aria-hidden />
      {d < 0 ? `${-d}d ago` : `${d}d`}
      <span className="sr-only">{graceUntil ? " until grace ends" : " until the period ends"}</span>
    </span>
  );
};

const SchoolsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>((params.get("status") as Filter) || "all");
  const [expiring, setExpiring] = useState(params.get("expiring") === "30");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<TenantListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [packages, setPackages] = useState<PackageInfo[]>([]);
  const m = useMotion();

  useEffect(() => {
    platformApi.packages().then(setPackages, () => undefined);
  }, []);
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(
      () =>
        platformApi.tenants({ q: q.trim() || undefined }).then(
          (r) => live && setRows(r),
          (e) => live && setError(errorText(e)),
        ),
      q ? 250 : 0,
    );
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [q]);
  useEffect(() => {
    const next = new URLSearchParams();
    if (filter !== "all") next.set("status", filter);
    if (expiring) next.set("expiring", "30");
    setParams(next, { replace: true });
  }, [filter, expiring, setParams]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0 };
    for (const r of rows ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);
  const shown = (rows ?? []).filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (expiring) {
      const d = daysUntil(r.periodEnd);
      if (d === null || d < 0 || d > 30) return false;
    }
    return true;
  });
  const pkgOf = (code: string) => packages.find((p) => p.code === code);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="max-w-full overflow-x-auto">
          <Segmented
            label="School status"
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setExpiring(false);
            }}
            options={(["all", "ACTIVE", "GRACE", "SUSPENDED", "ARCHIVED", "PENDING"] as Filter[]).map((v) => ({
              value: v,
              label: `${v === "all" ? "All" : v.charAt(0) + v.slice(1).toLowerCase()} ${counts[v] ?? 0}`,
            }))}
          />
        </div>
        {expiring && (
          <button type="button" onClick={() => setExpiring(false)} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-400/15 dark:text-amber-100" aria-label="Clear: expiring in 30 days">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            ≤ 30d ×
          </button>
        )}
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
          <input aria-label="Search schools" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className={cx(inputCls, "pl-9")} />
        </div>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      {!rows ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState icon={Inbox} title="No schools" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Schools">
          <AnimatePresence initial={false}>
            {shown.map((t) => {
              const pkg = pkgOf(t.pkg);
              const a = accentOf(pkg?.accent);
              return (
                <motion.li key={t.tid} layout {...m("reveal")}>
                  <Link
                    to={`/platform/schools/${t.tid}`}
                    className="relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 pt-5 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <span className={cx("absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r", a.grad)} aria-hidden />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-semibold text-slate-900 dark:text-white">
                          {t.isPrimary && <ShieldCheck className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-200" aria-label="Primary school" />}
                          {t.name}
                        </p>
                        <p className="truncate font-mono text-xs text-slate-600 dark:text-slate-300">{t.slug}</p>
                      </div>
                      <StatusPill status={t.status} />
                    </div>
                    <div className="space-y-1.5">
                      {listMeters(t, pkg).map((mt) => (
                        <MeterBar key={mt.key} meter={mt} />
                      ))}
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <span className={cx("font-bold", a.text)}>{pkg?.name ?? t.pkg}</span>
                      <PeriodChip periodEnd={t.periodEnd} graceUntil={t.status === "GRACE" ? t.graceUntil : null} />
                      <span className="inline-flex items-center gap-1" title="Last activity">
                        <Activity className="h-3.5 w-3.5" aria-hidden />
                        {ago(t.lastActivityAt)}
                        <span className="sr-only"> since last activity</span>
                      </span>
                    </div>
                  </Link>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
};

export default SchoolsPage;
