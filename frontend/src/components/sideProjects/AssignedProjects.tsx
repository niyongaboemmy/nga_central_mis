import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, BadgeCheck, FolderKanban, ClipboardCheck, Hourglass, Kanban, LayoutGrid, NotebookPen, PauseCircle, RefreshCw, Search, UserCheck, Users, X } from "lucide-react";
import { failure, sideProjectsApi, type AssignedResult, type Category, type MonitorRow, type Status } from "../../api/sideProjects";
import { useUser } from "../../contexts/UserContext";
import { useToast } from "../../contexts/ToastContext";
import UserAvatar from "../ui/UserAvatar";
import SelectField from "../ui/SelectField";
import Board from "./Board";
import ProjectDrawer from "./ProjectDrawer";
import { StageChip } from "./ProjectCard";
import PageHeader from "./PageHeader";
import { ProjectLogo } from "./Branding";
import {
  EmptyArt, HealthDot, PATH, ReviewBadge, STATUS_META, STATUS_ORDER, Skeleton, cardCls, chipCls, iconBtn, pathStage, primaryBtn, statusColor, timeAgo, useIsDark,
} from "./ui";

type Relation = "all" | "SUPERVISOR" | "MEMBER";
type Quick = "none" | "review" | "overdue" | "quiet" | "paused";
type Sort = "attention" | "stage" | "report" | "progress" | "title";

const DAY = 86_400_000;
const daysSince = (d: string | null | undefined) => (d ? Math.max(0, Math.floor((Date.now() - Date.parse(`${d}T00:00:00Z`)) / DAY)) : null);
const QUIET_DAYS = 14;
const selectCls =
  "min-w-0 max-w-full rounded-full border border-slate-900/[0.07] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 dark:border-white/10 dark:bg-gray-800/40 dark:text-gray-100";

/** The higher, the sooner it needs a look. */
const attention = (r: MonitorRow) => {
  let s = 0;
  if (r.relation === "SUPERVISOR" && r.reviewState === "AWAITING_VERIFICATION") s += 50;
  if (r.health === "OVERDUE") s += 30 + Math.min(20, r.stage?.overrunDays ?? 0);
  if (r.health === "BLOCKED") s += 25;
  if (r.health === "STALE") s += 15;
  const quiet = daysSince(r.lastReport);
  if (["PLANNING", "IN_PROGRESS", "TESTING"].includes(r.status) && (quiet === null || quiet >= QUIET_DAYS)) s += 10;
  if (r.status === "COMPLETED") s -= 40;
  return s;
};

/** Five dots for the path, the current one filled; a paused project keeps its dot, hollow. */
const MiniPath: React.FC<{ status: Status; pausedFrom: Status | null }> = ({ status, pausedFrom }) => {
  const dark = useIsDark();
  const at = PATH.indexOf(pathStage(status, pausedFrom));
  return (
    <div className="flex items-center gap-1" role="img" aria-label={`Stage ${at + 1} of ${PATH.length}: ${STATUS_META[status].label}`}>
      {PATH.map((s, i) => (
        <span
          key={s}
          className={`h-1.5 flex-1 rounded-full ${i > at ? "bg-slate-200 dark:bg-gray-700/60" : ""}`}
          style={i <= at ? { backgroundColor: statusColor(PATH[i], dark), opacity: i === at && status === "ON_HOLD" ? 0.45 : 1 } : undefined}
        />
      ))}
    </div>
  );
};

const AssignedCard: React.FC<{ r: MonitorRow; onOpen: () => void }> = ({ r, onOpen }) => {
  const dark = useIsDark();
  const stage = pathStage(r.status, r.pausedFrom);
  const S = STATUS_META[r.status];
  const quiet = daysSince(r.lastReport);
  const working = ["PLANNING", "IN_PROGRESS", "TESTING"].includes(r.status);
  const quietWarn = working && (quiet === null || quiet >= QUIET_DAYS);
  return (
    <motion.button
      layout
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${cardCls} group flex w-full flex-col gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 dark:hover:border-blue-500/40`}
      aria-label={`Open ${r.title}`}
    >
      <div className="flex items-start gap-3">
        <ProjectLogo logoAssetId={r.logoAssetId} category={r.category} accent={r.category?.color ?? statusColor(stage, dark)} size={44} rounded="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-900 group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">{r.title}</h3>
            <HealthDot health={r.health} />
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            <UserAvatar name={r.student.name} src={r.student.avatar} userId={r.student.id} size={18} decorative />
            <span className="truncate text-xs text-slate-600 dark:text-gray-300">{r.student.name}</span>
            {r.class && <span className="shrink-0 truncate text-[11px] text-slate-500 dark:text-gray-400">· {r.class.name}</span>}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
          <span className={`inline-flex items-center gap-1 ${S.text}`}>
            <S.icon className="h-3.5 w-3.5" aria-hidden /> {S.label}
          </span>
          <span className="tabular-nums text-slate-600 dark:text-gray-300">{r.progress}%</span>
        </div>
        <MiniPath status={r.status} pausedFrom={r.pausedFrom} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            r.relation === "SUPERVISOR" ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" : "bg-slate-100 text-slate-700 dark:bg-gray-700/60 dark:text-gray-200"
          }`}
        >
          {r.relation === "SUPERVISOR" ? <UserCheck className="h-3 w-3" aria-hidden /> : <Users className="h-3 w-3" aria-hidden />}
          {r.relation === "SUPERVISOR" ? "You supervise" : "You're on the team"}
        </span>
        <StageChip card={r} />
        {r.plan && r.plan.total > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-700 dark:bg-gray-800 dark:text-gray-200" title="Plan features done">
            Plan {r.plan.done}/{r.plan.total}
          </span>
        )}
        {r.tasks && r.tasks.open > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-700 dark:bg-gray-800 dark:text-gray-200" title="Open tasks">
            {r.tasks.open} open task{r.tasks.open === 1 ? "" : "s"}
          </span>
        )}
        <ReviewBadge state={r.reviewState} />
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-[11px] dark:bg-gray-800/40">
        <span className={`inline-flex items-center gap-1 font-semibold ${quietWarn ? "text-amber-700 dark:text-amber-300" : "text-slate-500 dark:text-gray-400"}`}>
          <NotebookPen className="h-3.5 w-3.5" aria-hidden />
          {r.lastReport ? (quiet === 0 ? "Reported today" : `Reported ${quiet}d ago`) : "No report yet"}
        </span>
        <span className="text-slate-500 dark:text-gray-400">{timeAgo(r.lastActivityAt)}</span>
      </div>
    </motion.button>
  );
};

/**
 * /assigned-projects: every project the signed-in staff member supervises or helps build, with
 * what needs attention first. Supervised projects open in the review drawer; team projects open
 * on My projects, where the team works on them.
 */
const AssignedProjects: React.FC = () => {
  const { user } = useUser();
  const { showToast } = useToast();
  const meId = Number(user?.user?.user_id ?? 0);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<AssignedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [relation, setRelation] = useState<Relation>("all");
  const [quick, setQuick] = useState<Quick>("none");
  const [stage, setStage] = useState<Status | "all">("all");
  const [sort, setSort] = useState<Sort>("attention");
  const [view, setView] = useState<"cards" | "board">(() => {
    try {
      return (localStorage.getItem("sp.assigned.view") as "cards" | "board") || "cards";
    } catch {
      return "cards";
    }
  });
  const openId = Number(params.get("project")) || null;

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      setError(null);
      setData(await sideProjectsApi.assigned());
      if (manual) showToast("Up to date", "success");
    } catch (e) {
      const f = failure(e, "Your assigned projects couldn't load");
      setError(f.message);
      if (manual) showToast(f.message, "error");
    } finally {
      setRefreshing(false);
    }
  }, [showToast]);
  useEffect(() => {
    load();
    sideProjectsApi.categories().then(setCategories).catch(() => undefined);
  }, [load]);
  useEffect(() => {
    try {
      localStorage.setItem("sp.assigned.view", view);
    } catch {
      /* private mode */
    }
  }, [view]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  /** Supervised: the review drawer here. Team projects: My projects, where the team edits. */
  const open = useCallback(
    (id: number | null) => {
      const r = id ? byId.get(id) : null;
      if (r && r.relation === "MEMBER") {
        navigate(`/my-projects?project=${r.id}`);
        return;
      }
      const next = new URLSearchParams(params);
      if (id) next.set("project", String(id));
      else next.delete("project");
      setParams(next, { replace: true });
    },
    [byId, navigate, params, setParams],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (relation !== "all" && r.relation !== relation) return false;
      if (stage !== "all" && r.status !== stage) return false;
      if (quick === "review" && !(r.relation === "SUPERVISOR" && r.reviewState === "AWAITING_VERIFICATION")) return false;
      if (quick === "overdue" && r.health !== "OVERDUE") return false;
      if (quick === "paused" && r.status !== "ON_HOLD") return false;
      if (quick === "quiet") {
        const d = daysSince(r.lastReport);
        if (!["PLANNING", "IN_PROGRESS", "TESTING"].includes(r.status) || (d !== null && d < QUIET_DAYS)) return false;
      }
      if (needle && !(r.title.toLowerCase().includes(needle) || r.student.name?.toLowerCase().includes(needle) || (r.student.regNumber ?? "").toLowerCase().includes(needle) || r.techTags.some((t) => t.toLowerCase().includes(needle)))) return false;
      return true;
    });
    const cmp: Record<Sort, (a: MonitorRow, b: MonitorRow) => number> = {
      attention: (a, b) => attention(b) - attention(a) || Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt),
      stage: (a, b) => (b.stage?.overrunDays ?? 0) - (a.stage?.overrunDays ?? 0) || (b.stage?.daysIn ?? -1) - (a.stage?.daysIn ?? -1),
      report: (a, b) => (daysSince(b.lastReport) ?? 9999) - (daysSince(a.lastReport) ?? 9999),
      progress: (a, b) => a.progress - b.progress,
      title: (a, b) => a.title.localeCompare(b.title),
    };
    return [...list].sort(cmp[sort]);
  }, [rows, relation, stage, quick, q, sort]);

  const quietCount = rows.filter((r) => {
    const d = daysSince(r.lastReport);
    return ["PLANNING", "IN_PROGRESS", "TESTING"].includes(r.status) && (d === null || d >= QUIET_DAYS);
  }).length;
  const c = data?.counts;
  const tiles: Array<{ key: Quick; label: string; value: number | undefined; icon: React.ElementType }> = [
    { key: "review", label: "Awaiting your review", value: c?.awaitingReview, icon: Hourglass },
    { key: "overdue", label: "Overdue", value: c?.overdue, icon: AlertTriangle },
    { key: "quiet", label: `No report in ${QUIET_DAYS}d`, value: data ? quietCount : undefined, icon: NotebookPen },
    { key: "paused", label: "On hold", value: c?.paused, icon: PauseCircle },
  ];
  const filtered = relation !== "all" || stage !== "all" || quick !== "none" || q.trim() !== "";

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <PageHeader
        icon={ClipboardCheck}
        title="Assigned projects"
        subtitle="Projects you supervise or help build."
        actions={
          <button type="button" onClick={() => load(true)} disabled={refreshing} aria-label="Refresh" title="Refresh" className={iconBtn}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        }
        stats={[
          { label: "In all", value: c?.total, icon: FolderKanban },
          { label: "Supervising", value: c?.supervising, icon: UserCheck },
          { label: "On the team", value: c?.member, icon: Users },
          { label: "Completed", value: c?.completed, icon: BadgeCheck },
        ]}
      />

      {/* What needs a look: each tile filters the list */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="radiogroup" aria-label="Needs attention">
        {tiles.map((t) => {
          const on = quick === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setQuick(on ? "none" : t.key)}
              className={`flex items-center gap-3 rounded-full border p-4 text-left transition focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 ${
                on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-900/[0.07] bg-white hover:border-blue-300 dark:border-white/[0.06] dark:bg-gray-900/60 dark:hover:border-blue-500/40"
              }`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${on ? "bg-white/20" : "bg-slate-100 text-slate-600 dark:bg-gray-700/60 dark:text-gray-300"}`}>
                <t.icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0">
                {t.value === undefined ? <Skeleton className="h-6 w-8" /> : <span className={`block text-2xl font-extrabold tabular-nums ${on ? "" : "text-slate-900 dark:text-white"}`}>{t.value}</span>}
                <span className={`block truncate text-xs font-medium ${on ? "text-white" : "text-slate-500 dark:text-gray-400"}`}>{t.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects, people" aria-label="Search" className="w-full rounded-full border border-slate-900/[0.07] bg-white py-2 pl-10 pr-8 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 dark:border-white/10 dark:bg-gray-800/40 dark:text-white" />
          {q && (
            <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Your role">
          {(
            [
              ["all", "All"],
              ["SUPERVISOR", "Supervising"],
              ["MEMBER", "On the team"],
            ] as Array<[Relation, string]>
          ).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={relation === k} onClick={() => setRelation(k)} className={chipCls(relation === k)}>
              {label}
            </button>
          ))}
        </div>
        <SelectField aria-label="Stage" className={selectCls} value={stage} onChange={(e) => setStage(e.target.value as Status | "all")}>
          <option value="all">Every stage</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </SelectField>
        <SelectField aria-label="Sort" className={selectCls} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="attention">Needs attention first</option>
          <option value="stage">Longest in stage</option>
          <option value="report">Longest without a report</option>
          <option value="progress">Least progress</option>
          <option value="title">Title</option>
        </SelectField>
        <div className="ml-auto flex items-center gap-1 rounded-full border border-slate-900/[0.07] bg-white p-1 dark:border-white/10 dark:bg-gray-800/40">
          <button type="button" aria-pressed={view === "cards"} title="Cards" aria-label="Cards" onClick={() => setView("cards")} className={`rounded-full p-1.5 ${view === "cards" ? "bg-blue-600 text-white" : "text-slate-500"}`}>
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button type="button" aria-pressed={view === "board"} title="Board" aria-label="Board" onClick={() => setView("board")} className={`rounded-full p-1.5 ${view === "board" ? "bg-blue-600 text-white" : "text-slate-500"}`}>
            <Kanban className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && !data ? (
        <div className={`${cardCls} p-8 text-center`}>
          <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
          <button type="button" className={`${primaryBtn} mt-3`} onClick={() => load()}>
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      ) : !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading assigned projects">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className={`${cardCls} flex flex-col items-center gap-3 p-10 text-center`}>
          <EmptyArt icon={ClipboardCheck} />
          <p className="text-sm font-semibold text-slate-700 dark:text-gray-200">Nothing assigned to you yet</p>
          <p className="max-w-sm text-xs text-slate-500 dark:text-gray-400">Projects appear here when someone names you their supervisor or adds you to their team.</p>
        </div>
      ) : shown.length === 0 ? (
        <div className={`${cardCls} flex flex-col items-center gap-3 p-8 text-center`}>
          <p className="text-sm text-slate-600 dark:text-gray-300">Nothing matches these filters.</p>
          {filtered && (
            <button type="button" className={chipCls(false)} onClick={() => (setRelation("all"), setStage("all"), setQuick("none"), setQ(""))}>
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          )}
        </div>
      ) : view === "board" ? (
        <Board cards={shown} onOpen={(id) => open(id)} draggable={false} showStudent />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((r) => (
            <AssignedCard key={r.id} r={r} onOpen={() => open(r.id)} />
          ))}
        </div>
      )}

      <ProjectDrawer projectId={openId} mode="staff" meId={meId} categories={categories} onClose={() => open(null)} onChanged={() => load()} />
    </div>
  );
};

export default AssignedProjects;
