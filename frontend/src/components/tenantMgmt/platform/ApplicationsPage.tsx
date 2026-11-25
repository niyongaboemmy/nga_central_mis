import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Clock, Columns3, FileStack, Hourglass, Inbox, List, Rocket, Search, TimerOff, UserRound } from "lucide-react";
import { EmptyState, STEP_ICONS, STEP_LABELS, Segmented, StatusPill, accentOf } from "../kit";
import SelectField from "../../ui/SelectField";
import { platformApi, type ApplicationListItem, type ApplicationStatus, type PackageInfo, type TrackerStep } from "../../../api/tenantMgmt";
import { useMotion } from "../../../design/motion";
import { CountBadge, SkeletonRows, Switch, cx, errorText, initials, inputCls, surface } from "./platformShared";
import { STEP_STATUSES, nextAction } from "./OverviewPage";
import { IconTile, StatTile } from "../viz";

type View = "board" | "list";
const VIEW_KEY = "platform.applications.view";
const BOARD_STEPS: TrackerStep[] = ["submitted", "review", "approved", "payment", "setup"];
const readView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "board";
  } catch {
    return "board";
  }
};

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
  // A deep link that names a status or step opens the list on it; otherwise the last view used.
  const [view, setViewState] = useState<View>(() => (params.get("status") || params.get("step") ? "list" : readView()));
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode */
    }
  };
  const showList = (f: Filter, st: ApplicationStatus[] | null = null) => {
    setFilter(f);
    setExact(st);
    setView("list");
  };

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

  const stats = useMemo(() => {
    const list = rows ?? [];
    const has = (sts: ApplicationStatus[]) => list.filter((r) => sts.includes(r.status)).length;
    return {
      toReview: has(["SUBMITTED", "UNDER_REVIEW"]),
      breached: list.filter((r) => r.slaBreached && !["ACTIVE", "REJECTED", "WITHDRAWN", "EXPIRED"].includes(r.status)).length,
      awaitingPay: has(["APPROVED_AWAITING_PAYMENT", "PAYMENT_SUBMITTED"]),
      setupFailed: has(["PROVISIONING_FAILED"]),
    };
  }, [rows]);

  // Board filters: search / package / mine apply; status is the column.
  const boardRows = useMemo(() => (rows ?? []).filter((r) => BOARD_STEPS.some((s) => STEP_STATUSES[s].includes(r.status))), [rows]);

  const pkgByCode = useMemo(() => Object.fromEntries(packages.map((p) => [p.code, p])), [packages]);

  return (
    <div className="space-y-4">
      {/* What needs the team, at a glance: each tile opens the list on it */}
      {!rows ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="status" aria-busy="true" aria-label="Loading counts">
          {[0, 1, 2, 3].map((k) => (
            <div key={k} className={cx(surface.card, "h-[7.5rem] animate-pulse")} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon={FileStack} label="To review" value={stats.toReview} onClick={() => showList("all", ["SUBMITTED", "UNDER_REVIEW"])} />
          <StatTile icon={TimerOff} label="Past review time" value={stats.breached} attention onClick={() => showList("all")} />
          <StatTile icon={Hourglass} label="Awaiting payment" value={stats.awaitingPay} onClick={() => showList("payment")} />
          <StatTile icon={Rocket} label="Setup failed" value={stats.setupFailed} attention onClick={() => showList("setup", ["PROVISIONING_FAILED"])} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "board", label: "Board", icon: Columns3 },
            { value: "list", label: "List", icon: List },
          ]}
        />
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
          <input aria-label="Search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className={cx(inputCls, "pl-9")} />
        </div>
        <div className="w-44 shrink-0">
        <SelectField aria-label="Package" value={pkg} onChange={(e) => setPkg(e.target.value)} className={inputCls}>
          <option value="">All packages</option>
          {packages.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </SelectField>
        </div>
        <Switch checked={mine} onChange={setMine} label="Mine" showLabel />
      </div>

      {view === "list" && (
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
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      {view === "board" ? (
        !rows ? (
          <BoardSkeleton />
        ) : (
          <Board rows={boardRows} pkgByCode={pkgByCode} closed={counts.closed} onClosed={() => showList("closed")} />
        )
      ) : !rows ? (
        <SkeletonRows rows={6} label="Loading applications" />
      ) : shown.length === 0 ? (
        <EmptyState icon={Inbox} title="Nothing here" />
      ) : (
        <ul className={cx(surface.card, "divide-y p-1.5", surface.divide)} aria-label="Applications">
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

// ---------------------------------------------------------------------------
// Pipeline board: one column per journey step, a card per application
// ---------------------------------------------------------------------------

const BoardSkeleton: React.FC = () => (
  <div className="flex gap-3 overflow-x-auto pb-2" role="status" aria-busy="true" aria-label="Loading the board">
    {BOARD_STEPS.map((s) => (
      <div key={s} className={cx(surface.card, "w-64 shrink-0 space-y-2 p-3 lg:w-auto lg:flex-1")}>
        <div className="h-8 w-28 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800/70" />
        {[0, 1].map((k) => (
          <div key={k} className="h-24 animate-pulse rounded-xl bg-gray-50 dark:bg-gray-800/50" />
        ))}
      </div>
    ))}
  </div>
);

const Board: React.FC<{ rows: ApplicationListItem[]; pkgByCode: Record<string, PackageInfo>; closed: number; onClosed: () => void }> = ({ rows, pkgByCode, closed, onClosed }) => {
  const m = useMotion();
  const byStep = useMemo(() => {
    const out = Object.fromEntries(BOARD_STEPS.map((s) => [s, [] as ApplicationListItem[]])) as Record<TrackerStep, ApplicationListItem[]>;
    for (const r of rows) {
      const step = BOARD_STEPS.find((s) => STEP_STATUSES[s].includes(r.status));
      if (step) out[step].push(r);
    }
    // oldest first: what has waited longest is on top
    for (const s of BOARD_STEPS) out[s].sort((a, b) => b.ageDays - a.ageDays);
    return out;
  }, [rows]);
  return (
    <div className="space-y-2">
      <div className="flex gap-3 overflow-x-auto pb-2" role="list" aria-label="Applications board">
        {BOARD_STEPS.map((s) => {
          const items = byStep[s];
          const failed = s === "setup" && items.some((r) => r.status === "PROVISIONING_FAILED");
          return (
            <section key={s} role="listitem" aria-label={`${STEP_LABELS[s]}: ${items.length}`} className={cx(surface.card, "flex w-64 shrink-0 flex-col p-2.5 lg:w-auto lg:min-w-0 lg:flex-1")}>
              <header className="mb-2 flex items-center gap-2 px-1">
                <IconTile icon={STEP_ICONS[s]} tone={failed ? "red" : "blue"} size="sm" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{STEP_LABELS[s]}</h3>
                <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-600 dark:bg-gray-800/70 dark:text-gray-300">{items.length}</span>
              </header>
              <ul className="flex min-h-[6rem] flex-1 flex-col gap-2" aria-label={STEP_LABELS[s]}>
                <AnimatePresence initial={false}>
                  {items.map((r) => (
                    <motion.li key={r.id} layout {...m("reveal")}>
                      <BoardCard row={r} pkg={pkgByCode[r.requestedPackage ?? ""]} />
                    </motion.li>
                  ))}
                </AnimatePresence>
                {!items.length && (
                  <li className="flex flex-1 items-center justify-center rounded-xl bg-gray-50 px-3 py-6 text-xs text-gray-400 dark:bg-gray-800/30 dark:text-gray-500">
                    <span className="flex flex-col items-center gap-1">
                      {React.createElement(STEP_ICONS[s], { className: "h-4 w-4", "aria-hidden": true })}
                      Empty
                    </span>
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
      {closed > 0 && (
        <button type="button" onClick={onClosed} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800/70">
          {closed} closed <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
};

const BoardCard: React.FC<{ row: ApplicationListItem; pkg: PackageInfo | undefined }> = ({ row: r, pkg }) => {
  const next = nextAction({ status: r.status, invoiceStatus: null });
  const failed = r.status === "PROVISIONING_FAILED" || r.status === "PAYMENT_REJECTED";
  return (
    <Link
      to={`/platform/applications/${r.id}`}
      aria-label={`${r.schoolName}: ${next.label}`}
      className={cx(
        "group block rounded-xl p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        failed ? "bg-red-50 hover:bg-red-100/70 dark:bg-red-500/10 dark:hover:bg-red-500/15" : "bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/50 dark:hover:bg-gray-800/80",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {r.unread > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" title={`${r.unread} unread`} aria-hidden />}
            <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">{r.schoolName}</span>
          </span>
          {pkg && (
            <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
              <span className={cx("h-2 w-2 rounded-full", accentOf(pkg.accent).bg)} aria-hidden />
              {pkg.name}
            </span>
          )}
        </span>
        <Assignee name={r.assignedTo?.name ?? null} />
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <span
          className={cx(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
            r.slaBreached ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" : "bg-white text-gray-600 dark:bg-gray-900/60 dark:text-gray-300",
          )}
          title={r.slaBreached ? "Past review time" : `${r.ageDays} days`}
        >
          {r.slaBreached ? <AlertTriangle className="h-3 w-3" aria-hidden /> : <Clock className="h-3 w-3" aria-hidden />}
          {r.ageDays}d{r.slaBreached && <span className="sr-only"> past review time</span>}
        </span>
        <span
          className={cx(
            "ml-auto truncate rounded-full px-2 py-0.5 text-[11px] font-semibold",
            next.tone === "danger" ? "bg-red-600 text-white" : next.tone === "brand" ? "bg-blue-600 text-white" : "text-gray-500 dark:text-gray-400",
          )}
        >
          {next.label}
        </span>
      </div>
    </Link>
  );
};

const Assignee: React.FC<{ name: string | null }> = ({ name }) =>
  name ? (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" title={name}>
      {initials(name)}
      <span className="sr-only">Assigned to {name}</span>
    </span>
  ) : (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-gray-400 dark:bg-gray-900/60 dark:text-gray-500" title="Unassigned">
      <UserRound className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">Unassigned</span>
    </span>
  );

const AppRow: React.FC<{ row: ApplicationListItem; accent: string; pkgName: string | null }> = ({ row: r, accent, pkgName }) => {
  const m = useMotion();
  return (
    <motion.li layout {...m("reveal")} className="py-0.5">
      <Link
        to={`/platform/applications/${r.id}`}
        className={cx("relative flex flex-col gap-2 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:grid md:grid-cols-[1fr_auto_auto_auto_auto] md:items-center md:gap-4", surface.insetHover)}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            {r.unread > 0 && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" title={`${r.unread} unread`}>
                <span className="sr-only">{r.unread} unread</span>
              </span>
            )}
            <span className="truncate font-semibold text-gray-900 dark:text-white">{r.schoolName}</span>
          </span>
          <span className="block truncate text-xs text-gray-600 dark:text-gray-300">
            {[r.ref, r.district, r.applicantName].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <StatusPill status={r.status} />
          {pkgName && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200">
              <span className={cx("h-2 w-2 rounded-full", accent)} aria-hidden />
              {pkgName}
            </span>
          )}
        </span>
        <span className={cx("inline-flex items-center gap-1 text-xs font-semibold tabular-nums", r.slaBreached ? "text-red-700 dark:text-red-300" : "text-gray-600 dark:text-gray-300")}>
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {r.ageDays}d{r.slaBreached && <span className="sr-only"> past review time</span>}
        </span>
        <span className="flex items-center gap-1">
          {r.assignedTo ? (
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
              title={r.assignedTo.name}
            >
              {initials(r.assignedTo.name)}
              <span className="sr-only">Assigned to {r.assignedTo.name}</span>
            </span>
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800/70 dark:text-gray-500" title="Unassigned">
              <UserRound className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Unassigned</span>
            </span>
          )}
        </span>
        <span className="hidden md:block">
          <CountBadge n={r.unread} tone="slate" label="unread" />
          {!r.unread && <FileStack className="h-4 w-4 text-gray-300 dark:text-gray-600" aria-hidden />}
        </span>
      </Link>
    </motion.li>
  );
};

export default ApplicationsPage;
