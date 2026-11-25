import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, ArrowDownAZ, CalendarClock, ChevronRight, Gauge, Inbox, LayoutGrid, List, Package as PackageIcon, Search, ShieldCheck, Users } from "lucide-react";
import { EmptyState, MeterBar, Segmented, StatusPill, accentOf, formatMb } from "../kit";
import TenantLogo from "../../brand/TenantLogo";
import { loadBranding } from "../../../hooks/useTenantBranding";
import { platformApi, type PackageInfo, type TenantLifecycle, type TenantListItem, type UsageMeter } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { SkeletonGrid, accent, ago, cx, daysUntil, errorText, inputCls, surface } from "./platformShared";

type Filter = "all" | TenantLifecycle;
type Sort = "name" | "activity" | "renewal" | "usage";
type View = "grid" | "table";
const VIEW_KEY = "platform.schools.view";

/** The fullest limit of a school (0..1), null when everything is unlimited. */
const fullest = (meters: UsageMeter[]) => meters.reduce<number | null>((m, x) => (x.ratio === null ? m : Math.max(m ?? 0, x.ratio)), null);

const SORTS: Record<Sort, (a: TenantListItem, b: TenantListItem, pkg: (c: string) => PackageInfo | undefined) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  activity: (a, b) => b.activeUsers7d - a.activeUsers7d || a.name.localeCompare(b.name),
  renewal: (a, b) => (daysUntil(a.periodEnd) ?? 1e9) - (daysUntil(b.periodEnd) ?? 1e9),
  usage: (a, b, pkg) => (fullest(listMeters(b, pkg(b.pkg))) ?? -1) - (fullest(listMeters(a, pkg(a.pkg))) ?? -1),
};

/** List rows carry raw counts; the package gives the limits for the bars. */
/**
 * A school's usage against its limits. Uses the school's effective limits from the API
 * (package + overrides, nothing for the primary school) and falls back to the package's.
 */
export const listMeters = (t: TenantListItem, pkg: PackageInfo | undefined): UsageMeter[] => {
  const fromPkg = (k: string) => {
    const e = pkg?.entitlements.find((x) => x.key === k);
    return e ? e.value : null;
  };
  const eff: Record<string, number | null> | null = t.limits ? { "limit.students": t.limits.students, "limit.staff": t.limits.staff, "limit.storage_gb": t.limits.storageGb } : null;
  const lim = (k: string) => (eff ? eff[k] : fromPkg(k));
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
  const tone = d < 0 ? "bg-red-100 text-red-800 dark:bg-red-400/15 dark:text-red-200" : d <= 30 ? "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200";
  return (
    <span
      className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", tone)}
      title={`${graceUntil ? "Grace ends" : "Period ends"} ${new Date(graceUntil ?? periodEnd!).toLocaleDateString()}`}
    >
      <CalendarClock className="h-3.5 w-3.5" aria-hidden />
      {graceUntil ? (d < 0 ? `Grace ended ${-d}d ago` : `Grace ends in ${d}d`) : d < 0 ? `Expired ${-d}d ago` : `Renews in ${d}d`}
    </span>
  );
};

/** The school's own logo (public branding), initials while it loads or when there is none. */
const SchoolLogo: React.FC<{ slug: string; name: string; primary: boolean; size?: "sm" | "md" }> = ({ slug, name, primary, size = "md" }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadBranding(slug).then((b) => live && setUrl(b?.logo_url ?? null));
    return () => {
      live = false;
    };
  }, [slug]);
  return (
    <span className={cx("flex shrink-0 items-center justify-center rounded-xl bg-gray-50 p-1 dark:bg-gray-900/50", size === "sm" ? "h-9 w-9" : "h-12 w-12")}>
      <TenantLogo src={url} name={name} isPrimary={primary} className="h-full w-full" rounded="rounded-lg" />
    </span>
  );
};

/** One school: identity, status, labelled usage, package, renewal and activity. */
export const SchoolCard: React.FC<{ t: TenantListItem; pkg: PackageInfo | undefined }> = ({ t, pkg }) => {
  const a = accentOf(pkg?.accent);
  return (
    <Link
      to={`/platform/schools/${t.tid}`}
      aria-label={`${t.name}, ${t.status.toLowerCase()}, ${pkg?.name ?? t.pkg} package`}
      className={cx(surface.card, "group flex h-full flex-col gap-4 p-4 transition-colors hover:border-blue-300 dark:hover:border-blue-500/50", accent.focus)}
    >
      <div className="flex items-start gap-3">
        <SchoolLogo slug={t.slug} name={t.name} primary={t.isPrimary} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-semibold leading-snug text-gray-900 dark:text-white" title={t.name}>
            {t.name}
          </p>
          <p className="flex items-center gap-1.5 truncate text-xs text-gray-500 dark:text-gray-400">
            <span className="font-mono">{t.slug}</span>
            {t.isPrimary && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-400">
                <ShieldCheck className="h-3 w-3" aria-hidden /> Primary
              </span>
            )}
          </p>
        </div>
        <StatusPill status={t.status} />
      </div>

      <div className="space-y-2">
        {listMeters(t, pkg).map((mt) => (
          <MeterBar key={mt.key} meter={mt} showLabel />
        ))}
      </div>

      <div className={cx(surface.inset, "mt-auto space-y-2 px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300")}>
        <div className="flex items-center gap-2">
          <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 font-semibold", a.soft, a.text)}>{pkg?.name ?? t.pkg}</span>
          {t.isPrimary ? (
            <span className="text-gray-500 dark:text-gray-400">No renewal</span>
          ) : (
            <PeriodChip periodEnd={t.periodEnd} graceUntil={t.status === "GRACE" ? t.graceUntil : null} />
          )}
          <ChevronRight className="ml-auto h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" aria-hidden />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1" title="People who signed in during the last 7 days">
            <Users className="h-3.5 w-3.5" aria-hidden /> {t.activeUsers7d} active this week
          </span>
          <span className="inline-flex items-center gap-1" title={t.lastActivityAt ? `Last activity ${new Date(t.lastActivityAt).toLocaleString()}` : "No activity yet"}>
            <Activity className="h-3.5 w-3.5" aria-hidden />
            {!t.lastActivityAt ? "No activity yet" : ago(t.lastActivityAt) === "now" ? "Active now" : `Active ${ago(t.lastActivityAt)} ago`}
          </span>
        </div>
      </div>
    </Link>
  );
};

/** A compact usage bar for the table (blue, amber from 75 %, red from 90 %; none when unlimited). */
const MiniBar: React.FC<{ m: UsageMeter; fmt?: (n: number) => string }> = ({ m, fmt = (n) => n.toLocaleString() }) => {
  const r = m.ratio === null ? null : Math.min(1, m.ratio);
  const color = r === null ? "" : r >= 0.9 ? "bg-red-500" : r >= 0.75 ? "bg-amber-500" : "bg-blue-600 dark:bg-blue-500";
  return (
    <div className="min-w-[6rem]" title={`${m.label}: ${fmt(m.used)}${m.limit === null ? " · Unlimited" : ` of ${fmt(m.limit)}`}`}>
      <p className="text-sm tabular-nums text-gray-900 dark:text-white">
        {fmt(m.used)}
        <span className="text-xs text-gray-400 dark:text-gray-500">{m.limit === null ? " · ∞" : ` / ${fmt(m.limit)}`}</span>
      </p>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800" aria-hidden>
        {r !== null && <div className={cx("h-full rounded-full", color)} style={{ width: `${Math.max(r * 100, m.used > 0 ? 3 : 0)}%` }} />}
      </div>
    </div>
  );
};

const SchoolTable: React.FC<{ rows: TenantListItem[]; pkgOf: (c: string) => PackageInfo | undefined }> = ({ rows, pkgOf }) => (
  <div className={cx(surface.card, "overflow-x-auto")}>
    <table className="w-full min-w-[56rem] text-left text-sm" aria-label="Schools">
      <thead>
        <tr className={cx("border-b text-xs font-medium text-gray-500 dark:text-gray-400", surface.divider)}>
          <th className="px-4 py-3 font-medium">School</th>
          <th className="px-3 py-3 font-medium">Status</th>
          <th className="px-3 py-3 font-medium">Package</th>
          <th className="px-3 py-3 font-medium">Students</th>
          <th className="px-3 py-3 font-medium">Staff</th>
          <th className="px-3 py-3 font-medium">Storage</th>
          <th className="px-3 py-3 font-medium">Active 7d</th>
          <th className="px-3 py-3 font-medium">Renewal</th>
          <th className="w-8" />
        </tr>
      </thead>
      <tbody className={cx("divide-y", surface.divide)}>
        {rows.map((t) => {
          const pkg = pkgOf(t.pkg);
          const [stu, staff, store] = listMeters(t, pkg);
          const a = accentOf(pkg?.accent);
          return (
            <tr key={t.tid} className="group relative transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40">
              <td className="px-4 py-3">
                <Link to={`/platform/schools/${t.tid}`} className="flex items-center gap-3 focus:outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-blue-500" aria-label={`${t.name}, ${t.status.toLowerCase()}, ${pkg?.name ?? t.pkg} package`}>
                  <SchoolLogo slug={t.slug} name={t.name} primary={t.isPrimary} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-gray-900 dark:text-white">{t.name}</span>
                    <span className="block truncate font-mono text-xs text-gray-500 dark:text-gray-400">{t.slug}</span>
                  </span>
                </Link>
              </td>
              <td className="px-3 py-3">
                <StatusPill status={t.status} />
              </td>
              <td className="px-3 py-3">
                <span className={cx("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", a.soft, a.text)}>{pkg?.name ?? t.pkg}</span>
              </td>
              <td className="px-3 py-3">
                <MiniBar m={stu} />
              </td>
              <td className="px-3 py-3">
                <MiniBar m={staff} />
              </td>
              <td className="px-3 py-3">
                <MiniBar m={store} fmt={formatMb} />
              </td>
              <td className="px-3 py-3 tabular-nums text-gray-900 dark:text-white">{t.activeUsers7d.toLocaleString()}</td>
              <td className="px-3 py-3">{t.isPrimary ? <span className="text-xs text-gray-400">—</span> : <PeriodChip periodEnd={t.periodEnd} graceUntil={t.status === "GRACE" ? t.graceUntil : null} />}</td>
              <td className="pr-3">
                <ChevronRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600 dark:text-gray-600" aria-hidden />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const SchoolsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>((params.get("status") as Filter) || "all");
  const [expiring, setExpiring] = useState(params.get("expiring") === "30");
  const [planFilter, setPlanFilter] = useState<string>(params.get("package") ?? "");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<TenantListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [packages, setPackages] = useState<PackageInfo[]>([]);
  const [sort, setSort] = useState<Sort>((params.get("sort") as Sort) || "name");
  const [view, setView] = useState<View>(() => (localStorage.getItem(VIEW_KEY) === "table" ? "table" : "grid"));
  const m = useMotion();
  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  useEffect(() => {
    platformApi.packages().then(setPackages, () => undefined);
  }, []);
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(
      () =>
        platformApi.tenants({ q: q.trim() || undefined }).then(
          (r) => {
            if (!live) return;
            setRows(r);
            setError(null);
          },
          (e) => {
            if (!live) return;
            setError(errorText(e));
            setRows((prev) => prev ?? []); // stop the spinner; the error says why
          },
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
    if (planFilter) next.set("package", planFilter);
    if (sort !== "name") next.set("sort", sort);
    setParams(next, { replace: true });
  }, [filter, expiring, planFilter, sort, setParams]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0 };
    for (const r of rows ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);
  const shown = (rows ?? []).filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (planFilter && r.pkg !== planFilter) return false;
    if (expiring) {
      const d = daysUntil(r.periodEnd);
      if (d === null || d < 0 || d > 30) return false;
    }
    return true;
  });
  const pkgOf = (code: string) => packages.find((p) => p.code === code);
  shown.sort((a, b) => (a.isPrimary !== b.isPrimary ? (a.isPrimary ? -1 : 1) : SORTS[sort](a, b, pkgOf)));

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
        {planFilter && (
          <button type="button" onClick={() => setPlanFilter("")} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" aria-label={`Clear: ${packages.find((p) => p.code === planFilter)?.name ?? planFilter} plan`}>
            <PackageIcon className="h-3.5 w-3.5" aria-hidden />
            {packages.find((p) => p.code === planFilter)?.name ?? planFilter} ×
          </button>
        )}
        {expiring && (
          <button type="button" onClick={() => setExpiring(false)} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-400/15 dark:text-amber-100" aria-label="Clear: expiring in 30 days">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            ≤ 30d ×
          </button>
        )}
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
          <input aria-label="Search schools" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className={cx(inputCls, "pl-9")} />
        </div>
        <Segmented
          label="Sort schools"
          value={sort}
          onChange={setSort}
          options={[
            { value: "name", label: "Name", icon: ArrowDownAZ },
            { value: "activity", label: "Activity", icon: Activity },
            { value: "renewal", label: "Renewal", icon: CalendarClock },
            { value: "usage", label: "Usage", icon: Gauge },
          ]}
        />
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "grid", label: "Grid", icon: LayoutGrid },
            { value: "table", label: "Table", icon: List },
          ]}
        />
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      {!rows ? (
        <SkeletonGrid cards={6} label="Loading schools" cardClassName="h-56" />
      ) : shown.length === 0 ? (
        <EmptyState icon={Inbox} title="No schools" />
      ) : view === "table" ? (
        <SchoolTable rows={shown} pkgOf={pkgOf} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Schools">
          <AnimatePresence initial={false}>
            {shown.map((t) => (
              <motion.li key={t.tid} layout {...m("reveal")}>
                <SchoolCard t={t} pkg={pkgOf(t.pkg)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
};

export default SchoolsPage;
