import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Filter, Github, Globe, Kanban, LayoutDashboard, List, RefreshCw, Search, Upload, UserCheck, X, ShieldAlert, GraduationCap, Briefcase,
} from "lucide-react";
import { failure, sideProjectsApi, type Category, type FilterOptions, type Me, type MonitorRow, type Summary } from "../../../api/sideProjects";
import { useUser } from "../../../contexts/UserContext";
import UserAvatar from "../../ui/UserAvatar";
import SelectField from "../../ui/SelectField";
import { TYPE_LABEL } from "../fields";
import Board from "../Board";
import ProjectDrawer from "../ProjectDrawer";
import Dashboard, { type DrillFilter } from "./Dashboard";
import ImportDialog from "./ImportDialog";
import { chipCls, STATUS_SOLID, DocChips, EmptyArt, HEALTH_META, HealthDot, ProgressBar, ReviewBadge, Skeleton, STATUS_META, STATUS_ORDER, StatusPill, cardCls, secondaryBtn, statusColor, timeAgo, useIsDark, REVIEW_META } from "../ui";

type Tab = "dashboard" | "list" | "board" | "supervising";
const FILTER_KEYS = ["yearId", "yearMode", "ownerType", "classId", "status", "review", "categoryId", "health", "hasGithub", "hasAccess", "missing", "q"] as const;

const selectCls = "min-w-0 max-w-full rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 dark:border-gray-700/60 dark:bg-gray-800/40 dark:text-gray-100";

/**
 * /projects-monitor — every student's side projects in the viewer's scope: an interactive
 * dashboard (tiles and charts drill into the list), the list, a school-wide board and the
 * shared drawer with review. Filters live in the URL so a view can be shared.
 */
const ProjectsMonitor: React.FC = () => {
  const dark = useIsDark();
  const { user } = useUser();
  const meId = Number(user?.user?.user_id ?? 0);
  const [params, setParams] = useSearchParams();
  const [me, setMe] = useState<Me | null>(null);
  const [opts, setOpts] = useState<FilterOptions | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<{ total: number; rows: MonitorRow[] } | null>(null);
  const [board, setBoard] = useState<MonitorRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  const tab = (params.get("tab") as Tab) || "dashboard";
  const page = Number(params.get("page") || 1);
  const sort = params.get("sort") || "activity";
  const dir = params.get("dir") || "desc";
  const openId = Number(params.get("project")) || null;
  const filters = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ""]).filter(([, v]) => v)), [params]);
  const filterCount = Object.keys(filters).filter((k) => k !== "yearMode" && k !== "yearId").length;

  const patch = useCallback(
    (next: Record<string, string | number | null | undefined>, opts2: { resetPage?: boolean } = { resetPage: true }) => {
      const p = new URLSearchParams(params);
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === undefined || v === "") p.delete(k);
        else p.set(k, String(v));
      }
      if (opts2.resetPage) p.delete("page");
      setParams(p, { replace: true });
    },
    [params, setParams],
  );

  useEffect(() => {
    sideProjectsApi.me().then(setMe).catch(() => setMe({ own: false, view: null, review: false, manageAny: false, supervising: 0 }));
    sideProjectsApi.options().then(setOpts).catch(() => undefined);
    sideProjectsApi.categories().then(setCategories).catch(() => undefined);
  }, []);

  // Default year: the current one.
  useEffect(() => {
    if (opts && !params.get("yearId") && !params.get("allYears")) {
      const cur = opts.years.find((y) => y.isCurrent);
      if (cur) patch({ yearId: cur.id }, { resetPage: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts]);

  const detail = me?.view === "detail";
  const effectiveTab: Tab = !me ? tab : !me.view && me.supervising ? "supervising" : !detail && tab !== "dashboard" && tab !== "supervising" ? "dashboard" : tab;
  const scopeParam = effectiveTab === "supervising" ? { scope: "supervising" } : {};

  const load = useCallback(async () => {
    if (!me || (!me.view && !me.supervising)) return;
    setLoading(true);
    setErr(null);
    try {
      const q = { ...filters, ...scopeParam };
      if (effectiveTab === "dashboard") setSummary(await sideProjectsApi.summary(q));
      else if (effectiveTab === "list" || effectiveTab === "supervising") setRows(await sideProjectsApi.list({ ...q, page, sort, dir, pageSize: 25 }));
      else if (effectiveTab === "board") setBoard(await sideProjectsApi.board(q));
      setRefreshedAt(new Date());
    } catch (e) {
      setErr(failure(e).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, effectiveTab, JSON.stringify(filters), page, sort, dir]);

  useEffect(() => {
    load();
  }, [load]);
  // Live enough: refresh when the tab regains focus, and every minute while visible.
  useEffect(() => {
    const onFocus = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onFocus);
    const t = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => (document.removeEventListener("visibilitychange", onFocus), clearInterval(t));
  }, [load]);

  const openProject = (id: number | null) => patch({ project: id }, { resetPage: false });
  const drill = (f: DrillFilter) => {
    const clear = Object.fromEntries(FILTER_KEYS.filter((k) => k !== "yearId" && k !== "yearMode" && k !== "q").map((k) => [k, null]));
    patch({ ...clear, ...f, tab: "list" });
  };

  const classesByProgram = useMemo(() => {
    const m = new Map<string, FilterOptions["classes"]>();
    for (const c of opts?.classes ?? []) m.set(c.program, [...(m.get(c.program) ?? []), c]);
    return [...m.entries()];
  }, [opts]);

  if (me && !me.view && !me.supervising) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <EmptyArt icon={ShieldAlert} />
        <p className="mt-4 text-sm text-slate-600 dark:text-gray-300">You don't have access to students' projects.</p>
      </div>
    );
  }

  const tabs: Array<{ key: Tab; icon: React.ElementType; label: string; show: boolean }> = [
    { key: "dashboard", icon: LayoutDashboard, label: "Dashboard", show: !!me?.view },
    { key: "list", icon: List, label: "Projects", show: detail },
    { key: "board", icon: Kanban, label: "Board", show: detail },
    { key: "supervising", icon: UserCheck, label: `Supervising${me?.supervising ? ` · ${me.supervising}` : ""}`, show: !!me?.supervising },
  ];

  const SortHead: React.FC<{ k: string; children: React.ReactNode; className?: string }> = ({ k, children, className = "" }) => (
    <th className={`px-3 py-2 ${className}`}>
      <button type="button" onClick={() => patch({ sort: k, dir: sort === k && dir === "desc" ? "asc" : "desc" }, { resetPage: true })} className="inline-flex items-center gap-1 font-semibold hover:text-slate-800 dark:hover:text-white">
        {children}
        {sort === k && (dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </th>
  );

  return (
    <div className="mx-auto max-w-[96rem] space-y-4 px-4 py-6">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-900 to-blue-700 p-5 text-white shadow-float">
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/5" aria-hidden />
        <div className="absolute -bottom-16 right-32 h-40 w-40 rounded-full bg-blue-500/20" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">All projects</h1>
            <p className="mt-1 flex items-center gap-2 text-xs text-white/70">
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400" aria-hidden />}
              {refreshedAt ? `Updated ${timeAgo(refreshedAt.toISOString())}` : "Loading"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {detail && (
              <>
                <a href={sideProjectsApi.exportUrl({ ...filters }, "xlsx")} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-sm font-semibold backdrop-blur hover:bg-white/20"><FileSpreadsheet className="h-4 w-4" /> Excel</a>
                <a href={sideProjectsApi.exportUrl({ ...filters }, "csv")} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-sm font-semibold backdrop-blur hover:bg-white/20"><Download className="h-4 w-4" /> CSV</a>
              </>
            )}
            {me?.manageAny && <button type="button" onClick={() => setImportOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-sm font-bold text-blue-700 shadow hover:bg-blue-50"><Upload className="h-4 w-4" /> Import</button>}
            <button type="button" onClick={load} aria-label="Refresh" className="rounded-full bg-white/10 p-2 hover:bg-white/20"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
          </div>
        </div>
        <nav className="relative mt-4 flex gap-1" role="tablist">
          {tabs.filter((t) => t.show).map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={effectiveTab === t.key} onClick={() => patch({ tab: t.key })} className={`relative inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition ${effectiveTab === t.key ? "text-blue-700" : "text-white/80 hover:bg-white/10"}`}>
              {effectiveTab === t.key && <motion.span layoutId="spm-tab" className="absolute inset-0 rounded-full bg-white shadow" />}
              <t.icon className="relative h-4 w-4" aria-hidden /> <span className="relative">{t.label}</span>
            </button>
          ))}
        </nav>
      </motion.header>

      {/* Filters: search and quick chips first, then the dropdowns that refine. */}
      <div className={`${cardCls} space-y-3 p-3 sm:p-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input defaultValue={params.get("q") ?? ""} onKeyDown={(e) => e.key === "Enter" && patch({ q: (e.target as HTMLInputElement).value.trim() || null })} onBlur={(e) => e.target.value.trim() !== (params.get("q") ?? "") && patch({ q: e.target.value.trim() || null })} placeholder="Search owner, reg. number, title, tech" aria-label="Search" className="h-10 w-full rounded-full border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/15 dark:border-gray-700/60 dark:bg-gray-800/40 dark:text-white" />
          </div>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Owner">
            {([
              ["STUDENT", GraduationCap, "Students"],
              ["STAFF", Briefcase, "Staff & others"],
            ] as const).map(([k, Icon, label]) => {
              const on = params.get("ownerType") === k;
              return (
                <button key={k} type="button" role="radio" aria-checked={on} title={label} onClick={() => patch({ ownerType: on ? null : k })} className={chipCls(on)}>
                  <Icon className="h-3.5 w-3.5" /> <span className="hidden md:inline">{label}</span>
                </button>
              );
            })}
          </div>
          <span className="hidden h-6 w-px bg-slate-200 sm:block dark:bg-gray-700" aria-hidden />
          <div className="flex gap-1.5" role="radiogroup" aria-label="Status">
            {STATUS_ORDER.map((s) => {
              const M = STATUS_META[s];
              const on = params.get("status") === s;
              return (
                <button key={s} type="button" role="radio" aria-checked={on} title={M.label} onClick={() => patch({ status: on ? null : s })} className={chipCls(on)} style={on ? { backgroundColor: STATUS_SOLID[s], borderColor: STATUS_SOLID[s] } : undefined}>
                  <M.icon className="h-3.5 w-3.5" style={on ? undefined : { color: statusColor(s, dark) }} /> <span className="hidden md:inline">{M.label}</span>
                </button>
              );
            })}
          </div>
          <span className="hidden h-6 w-px bg-slate-200 sm:block dark:bg-gray-700" aria-hidden />
          {([
            ["hasGithub", Github, "Has GitHub"],
            ["hasAccess", Globe, "Has a live link"],
          ] as const).map(([k, Icon, label]) => {
            const on = params.get(k) === "1";
            return (
              <button key={k} type="button" aria-pressed={on} title={label} aria-label={label} onClick={() => patch({ [k]: on ? null : "1" })} className={`${chipCls(on)} !px-2`}>
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
          {filterCount > 0 && (
            <motion.button initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} type="button" onClick={() => patch(Object.fromEntries(FILTER_KEYS.filter((k) => k !== "yearId").map((k) => [k, null])))} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-200">
              <X className="h-3.5 w-3.5" /> Clear
              <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] text-white">{filterCount}</span>
            </motion.button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-gray-700/40">
          <span className="inline-flex items-center gap-1.5 pr-1 text-xs font-semibold text-slate-500 dark:text-gray-400">
            <Filter className="h-3.5 w-3.5" aria-hidden /> Refine
          </span>
        <SelectField aria-label="Academic year" className={selectCls} value={params.get("yearId") ?? "all"} onChange={(e) => patch({ yearId: e.target.value === "all" ? null : e.target.value, allYears: e.target.value === "all" ? "1" : null })}>
          <option value="all">All years</option>
          {opts?.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </SelectField>
        <SelectField aria-label="Class" className={selectCls} value={params.get("classId") ?? "all"} onChange={(e) => patch({ classId: e.target.value === "all" ? null : e.target.value })}>
          <option value="all">All classes</option>
          {classesByProgram.map(([prog, cls]) => (
            <optgroup key={prog} label={prog}>{cls.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.grade}</option>)}</optgroup>
          ))}
        </SelectField>
        <SelectField aria-label="Health" className={selectCls} value={params.get("health") ?? "all"} onChange={(e) => patch({ health: e.target.value === "all" ? null : e.target.value })}>
          <option value="all">Any health</option>
          {(["ON_TRACK", "STALE", "OVERDUE", "BLOCKED"] as const).map((h) => <option key={h} value={h}>{HEALTH_META[h].label}</option>)}
        </SelectField>
        <SelectField aria-label="Review" className={selectCls} value={params.get("review") ?? "all"} onChange={(e) => patch({ review: e.target.value === "all" ? null : e.target.value })}>
          <option value="all">Any review</option>
          {(["CHANGES_REQUESTED", "AWAITING_VERIFICATION", "VERIFIED"] as const).map((r) => <option key={r} value={r}>{REVIEW_META[r]!.label}</option>)}
        </SelectField>
        <SelectField aria-label="Category" className={selectCls} value={params.get("categoryId") ?? "all"} onChange={(e) => patch({ categoryId: e.target.value === "all" ? null : e.target.value })}>
          <option value="all">Any category</option>
          {opts?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectField>
        <SelectField aria-label="Missing document" className={selectCls} value={params.get("missing") ?? "all"} onChange={(e) => patch({ missing: e.target.value === "all" ? null : e.target.value })}>
          <option value="all">Any documents</option>
          <option value="CONCEPT">Concept needed</option>
          <option value="SRS">No SRS</option>
          <option value="IMPLEMENTATION_PLAN">No plan</option>
        </SelectField>
        </div>
      </div>

      {err && <div className={`${cardCls} p-4 text-sm font-medium text-red-600`}>{err}</div>}

      {effectiveTab === "dashboard" && (summary ? <Dashboard s={summary} onDrill={drill} onOpen={openProject} /> : <div className="grid grid-cols-2 gap-3 md:grid-cols-6">{Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-28" />)}<Skeleton className="col-span-full h-64" /></div>)}

      {(effectiveTab === "list" || effectiveTab === "supervising") && (
        <div className={`${cardCls} overflow-hidden`}>
          {!rows ? (
            <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : rows.rows.length === 0 ? (
            <div className="py-12"><EmptyArt icon={Search} /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[60rem] text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-gray-800/60 dark:text-gray-400">
                    <tr>
                      <SortHead k="student">Owner</SortHead>
                      <SortHead k="class">Class</SortHead>
                      <SortHead k="title">Project</SortHead>
                      <SortHead k="status">Status</SortHead>
                      <SortHead k="progress">Progress</SortHead>
                      <th className="px-3 py-2">Docs</th>
                      <th className="px-3 py-2">Links</th>
                      <SortHead k="activity">Activity</SortHead>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-gray-700/40">
                    {rows.rows.map((r, i) => (
                      <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.012 }} onClick={() => openProject(r.id)} onKeyDown={(e) => e.key === "Enter" && openProject(r.id)} tabIndex={0} className="cursor-pointer transition hover:bg-blue-50/50 focus:bg-blue-50/60 focus:outline-none dark:hover:bg-gray-700/40">
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <UserAvatar name={r.student.name} src={r.student.avatar} userId={r.student.id} size={32} decorative />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-800 dark:text-white">{r.student.name}</p>
                              <p className="font-mono text-[11px] text-slate-500 dark:text-gray-400">{r.student.regNumber ?? TYPE_LABEL[r.student.type] ?? "—"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-gray-300">{r.class ? <><p className="font-semibold">{r.class.name}</p><p className="text-[11px] text-slate-600 dark:text-gray-300">{r.year?.name}</p></> : "—"}</td>
                        <td className="max-w-[18rem] px-3 py-2.5">
                          <p className="truncate font-semibold text-slate-800 dark:text-white">{r.title}</p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            {r.category && <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-gray-300"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.category.color }} aria-hidden />{r.category.name}</span>}
                            <ReviewBadge state={r.reviewState} compact />
                          </div>
                        </td>
                        <td className="px-3 py-2.5"><StatusPill status={r.status} /></td>
                        <td className="px-3 py-2.5">
                          <div className="flex w-28 items-center gap-2">
                            <ProgressBar value={r.progress} color={statusColor(r.status, dark)} />
                            <span className="text-[11px] font-bold tabular-nums text-slate-600 dark:text-gray-300">{r.progress}%</span>
                          </div>
                          <HealthDot health={r.health} withLabel />
                        </td>
                        <td className="px-3 py-2.5"><DocChips docs={r.docs} pending={r.conceptPending} /></td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {r.githubUrl && <a href={r.githubUrl} target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="rounded-full p-1 text-slate-600 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-700/50"><Github className="h-4 w-4" /></a>}
                            {r.accessUrl && <a href={r.accessUrl} target="_blank" rel="noopener noreferrer" aria-label="Live link" className="rounded-full p-1 text-slate-600 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-700/50"><Globe className="h-4 w-4" /></a>}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500 dark:text-gray-400">{timeAgo(r.lastActivityAt)}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-600 dark:border-gray-700/40 dark:text-gray-300">
                <span className="tabular-nums">{(page - 1) * 25 + 1}–{Math.min(page * 25, rows.total)} / {rows.total}</span>
                <div className="flex gap-1">
                  <button type="button" className={`${secondaryBtn} !px-2 !py-1`} disabled={page <= 1} onClick={() => patch({ page: page - 1 }, { resetPage: false })} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
                  <button type="button" className={`${secondaryBtn} !px-2 !py-1`} disabled={page * 25 >= rows.total} onClick={() => patch({ page: page + 1 }, { resetPage: false })} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {effectiveTab === "board" &&
        (board ? (
          <Board cards={board} onOpen={openProject} draggable={false} showStudent />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-96" />)}</div>
        ))}

      <ProjectDrawer projectId={openId} mode="staff" meId={meId} categories={categories} onClose={() => openProject(null)} onChanged={load} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onDone={load} />
    </div>
  );
};

export default ProjectsMonitor;
