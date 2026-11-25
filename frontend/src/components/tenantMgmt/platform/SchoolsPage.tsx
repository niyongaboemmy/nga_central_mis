import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, CalendarClock, ChevronRight, Inbox, Search, ShieldCheck, Users } from "lucide-react";
import { EmptyState, MeterBar, Segmented, StatusPill, accentOf } from "../kit";
import TenantLogo from "../../brand/TenantLogo";
import { loadBranding } from "../../../hooks/useTenantBranding";
import { platformApi, type PackageInfo, type TenantLifecycle, type TenantListItem, type UsageMeter } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { SkeletonGrid, accent, ago, cx, daysUntil, errorText, inputCls, surface } from "./platformShared";

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
const SchoolLogo: React.FC<{ slug: string; name: string; primary: boolean }> = ({ slug, name, primary }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadBranding(slug).then((b) => live && setUrl(b?.logo_url ?? null));
    return () => {
      live = false;
    };
  }, [slug]);
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-50 p-1 dark:bg-gray-900/50">
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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
          <input aria-label="Search schools" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className={cx(inputCls, "pl-9")} />
        </div>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      {!rows ? (
        <SkeletonGrid cards={6} label="Loading schools" cardClassName="h-56" />
      ) : shown.length === 0 ? (
        <EmptyState icon={Inbox} title="No schools" />
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
