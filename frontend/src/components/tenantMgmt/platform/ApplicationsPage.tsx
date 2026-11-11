import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Clock, FileStack, Inbox, Search, UserRound } from "lucide-react";
import { EmptyState, Segmented, StatusPill, accentOf } from "../kit";
import SelectField from "../../ui/SelectField";
import { platformApi, type ApplicationListItem, type ApplicationStatus, type PackageInfo, type TrackerStep } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { CountBadge, Spinner, Switch, cx, errorText, initials, inputCls } from "./platformShared";
import { STEP_STATUSES } from "./OverviewPage";

type Filter = "all" | "new" | "review" | "changes" | "payment" | "setup" | "closed";

const FILTERS: Array<{ value: Filter; label: string; statuses: ApplicationStatus[] | null }> = [
  { value: "all", label: "All", statuses: null },
  { value: "new", label: "New", statuses: ["SUBMITTED"] },
  { value: "review", label: "Review", statuses: ["UNDER_REVIEW"] },
  { value: "changes", label: "Changes", statuses: ["CHANGES_REQUESTED"] },
  { value: "payment", label: "Payment", statuses: ["APPROVED_AWAITING_PAYMENT", "PAYMENT_SUBMITTED", "PAYMENT_REJECTED", "PAYMENT_CONFIRMED"] },
  { value: "setup", label: "Setup", statuses: ["PROVISIONING", "PROVISIONING_FAILED"] },
  { value: "closed", label: "Closed", statuses: ["ACTIVE", "REJECTED", "WITHDRAWN", "EXPIRED"] },
];

/** ?status=X or ?step=Y (from overview tiles) -> the filter chip and any exact status. */
const fromParams = (status: string | null, step: string | null): { filter: Filter; exact: ApplicationStatus[] | null } => {
  if (step && step in STEP_STATUSES) return { filter: "all", exact: STEP_STATUSES[step as TrackerStep] };
  if (status) {
    const f = FILTERS.find((x) => x.statuses?.includes(status as ApplicationStatus));
    return { filter: f?.value ?? "all", exact: f?.statuses?.length === 1 ? null : [status as ApplicationStatus] };
  }
  return { filter: "all", exact: null };
};

const ApplicationsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const init = fromParams(params.get("status"), params.get("step"));
  const [filter, setFilter] = useState<Filter>(init.filter);
  const [exact, setExact] = useState<ApplicationStatus[] | null>(init.exact);
  const [pkg, setPkg] = useState(params.get("package") ?? "");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [mine, setMine] = useState(params.get("mine") === "1");
  const [rows, setRows] = useState<ApplicationListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [packages, setPackages] = useState<PackageInfo[]>([]);

  useEffect(() => {
    platformApi.packages().then(setPackages, () => undefined);
  }, []);

  useEffect(() => {
    let live = true;
    const t = window.setTimeout(() => {
      platformApi
        .applications({ package: pkg || undefined, q: q.trim() || undefined, mine: mine || undefined })
        .then((r) => live && (setRows(r), setError(null)))
        .catch((e) => live && setError(errorText(e)));
    }, q ? 250 : 0);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [pkg, q, mine]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (filter !== "all") next.set("status", FILTERS.find((f) => f.value === filter)!.statuses![0]);
    if (pkg) next.set("package", pkg);
    if (q) next.set("q", q);
    if (mine) next.set("mine", "1");
    if (exact && filter === "all") return; // keep the deep link until the user picks a chip
    setParams(next, { replace: true });
  }, [filter, pkg, q, mine, exact, setParams]);

  const counts = useMemo(() => {
    const out: Record<Filter, number> = { all: 0, new: 0, review: 0, changes: 0, payment: 0, setup: 0, closed: 0 };
    for (const r of rows ?? []) {
      out.all++;
      const f = FILTERS.find((x) => x.statuses?.includes(r.status));
      if (f) out[f.value]++;
    }
    return out;
  }, [rows]);

  const shown = useMemo(() => {
    const st = exact ?? FILTERS.find((f) => f.value === filter)!.statuses;
    return (rows ?? []).filter((r) => !st || st.includes(r.status));
  }, [rows, filter, exact]);

  const pkgByCode = useMemo(() => Object.fromEntries(packages.map((p) => [p.code, p])), [packages]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="max-w-full overflow-x-auto">
          <Segmented
            label="Status"
            value={filter}
            onChange={(v) => {
              setExact(null);
              setFilter(v);
            }}
            options={FILTERS.map((f) => ({ value: f.value, label: `${f.label} ${counts[f.value]}` }))}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
          <input aria-label="Search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className={cx(inputCls, "pl-9")} />
        </div>
        <SelectField aria-label="Package" value={pkg} onChange={(e) => setPkg(e.target.value)} className={cx(inputCls, "w-auto")}>
          <option value="">All packages</option>
          {packages.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </SelectField>
        <Switch checked={mine} onChange={setMine} label="Mine" showLabel />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      {!rows ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState icon={Inbox} title="Nothing here" />
      ) : (
        <ul className="space-y-2" aria-label="Applications">
          <AnimatePresence initial={false}>
            {shown.map((r) => (
              <AppRow key={r.id} row={r} accent={accentOf(pkgByCode[r.requestedPackage ?? ""]?.accent).bg} pkgName={pkgByCode[r.requestedPackage ?? ""]?.name ?? r.requestedPackage} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
};

const AppRow: React.FC<{ row: ApplicationListItem; accent: string; pkgName: string | null }> = ({ row: r, accent, pkgName }) => {
  const m = useMotion();
  const reduced = useReducedMotion();
  return (
    <motion.li layout {...m("reveal")}>
      <Link
        to={`/platform/applications/${r.id}`}
        className="relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 pl-4 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 md:grid md:grid-cols-[1fr_auto_auto_auto_auto] md:items-center md:gap-4"
      >
        <span className={cx("absolute inset-y-0 left-0 w-1", accent)} aria-hidden />
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            {r.unread > 0 && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" title={`${r.unread} unread`}>
                <span className="sr-only">{r.unread} unread</span>
              </span>
            )}
            <span className="truncate font-semibold text-slate-900 dark:text-white">{r.schoolName}</span>
          </span>
          <span className="block truncate text-xs text-slate-600 dark:text-slate-300">
            {[r.ref, r.district, r.applicantName].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <StatusPill status={r.status} />
          {pkgName && <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{pkgName}</span>}
        </span>
        <span className={cx("inline-flex items-center gap-1 text-xs font-semibold tabular-nums", r.slaBreached ? "text-red-700 dark:text-red-300" : "text-slate-600 dark:text-slate-300")}>
          {r.slaBreached && !reduced ? (
            <motion.span animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 1.2, repeat: Infinity }} className="inline-flex">
              <Clock className="h-3.5 w-3.5" aria-hidden />
            </motion.span>
          ) : (
            <Clock className="h-3.5 w-3.5" aria-hidden />
          )}
          {r.ageDays}d{r.slaBreached && <span className="sr-only"> past review time</span>}
        </span>
        <span className="flex items-center gap-1">
          {r.assignedTo ? (
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-200"
              title={r.assignedTo.name}
            >
              {initials(r.assignedTo.name)}
              <span className="sr-only">Assigned to {r.assignedTo.name}</span>
            </span>
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400 dark:border-slate-600" title="Unassigned">
              <UserRound className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Unassigned</span>
            </span>
          )}
        </span>
        <span className="hidden md:block">
          <CountBadge n={r.unread} tone="slate" label="unread" />
          {!r.unread && <FileStack className="h-4 w-4 text-slate-300 dark:text-slate-600" aria-hidden />}
        </span>
      </Link>
    </motion.li>
  );
};

export default ApplicationsPage;
