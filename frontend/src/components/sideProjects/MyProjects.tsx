import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Archive, Kanban, List, Plus, Search, Sparkles, X, Mail } from "lucide-react";
import { failure, sideProjectsApi, type Category, type ProjectCard, type Status } from "../../api/sideProjects";
import { useToast } from "../../contexts/ToastContext";
import { useUser } from "../../contexts/UserContext";
import Board from "./Board";
import CreateWizard from "./CreateWizard";
import ProjectDrawer from "./ProjectDrawer";
import { MoveDialog } from "./MoveDialog";
import { CATEGORY_ICON, DocChips, EmptyArt, HealthDot, ProgressBar, ProgressRing, ReviewBadge, Skeleton, STATUS_META, STATUS_ORDER, StatusPill, primaryBtn, statusColor, timeAgo, useIsDark, cardCls } from "./ui";

type Pending = { id: number; to: Status; from: Status; title: string; hasLink: boolean; hasImage: boolean; resolve: (ok: boolean) => void };

/**
 * /my-projects — the student's board. Drag a card to another column (or use its menu, or the
 * stepper in the drawer). Completing asks for the outcome; reopening a finished project asks
 * why. The server has the last word: a refused move snaps back with its reason.
 */
const MyProjects: React.FC = () => {
  const dark = useIsDark();
  const { showToast } = useToast();
  const { user } = useUser();
  const meId = Number(user?.user?.user_id ?? 0);
  const [params, setParams] = useSearchParams();
  const [cards, setCards] = useState<ProjectCard[] | null>(null);
  const [archived, setArchived] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [view, setView] = useState<"board" | "list">(() => {
    try {
      return (localStorage.getItem("sp.view") as "board" | "list") || "board";
    } catch {
      return "board";
    }
  });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<number | null>(null);
  const [wizard, setWizard] = useState<Status | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveErr, setMoveErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const openId = Number(params.get("project")) || null;
  const [drawerTab, setDrawerTab] = useState<"documents" | undefined>(undefined);
  const cardsRef = useRef<ProjectCard[] | null>(null);
  cardsRef.current = cards;

  const load = useCallback(async () => {
    try {
      setLoadErr(null);
      setCards(await sideProjectsApi.mine(archived));
    } catch (e) {
      setLoadErr(failure(e, "Your projects couldn't load").message);
    }
  }, [archived]);

  useEffect(() => {
    setCards(null);
    load();
  }, [load]);
  useEffect(() => {
    sideProjectsApi.categories().then(setCategories).catch(() => undefined);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("sp.view", view);
    } catch {
      /* private mode */
    }
  }, [view]);

  const open = (id: number | null, tab?: "documents") => {
    setDrawerTab(tab);
    const next = new URLSearchParams(params);
    if (id) next.set("project", String(id));
    else next.delete("project");
    setParams(next, { replace: true });
  };

  const send = async (id: number, to: Status, extra: { outcomeSummary?: string; reason?: string; position?: number }) => {
    const prev = cardsRef.current;
    setCards((cs) => cs?.map((c) => (c.id === id ? { ...c, status: to, progress: to === "COMPLETED" ? 100 : c.progress, reviewState: to === "COMPLETED" ? "AWAITING_VERIFICATION" : c.reviewState } : c)) ?? cs);
    try {
      await sideProjectsApi.transition(id, { to, ...extra });
      if (to === "COMPLETED") showToast("🎉 Completed", "success");
      load();
      return true;
    } catch (e) {
      setCards(prev);
      const f = failure(e);
      if (f.code === "CONCEPT_REQUIRED") open(id, "documents");
      if (!pending) showToast(f.message, "warning");
      throw f;
    }
  };

  /** Board/drawer move. Opens the dialog when words are needed; resolves whether it stuck. */
  const move = useCallback(
    (id: number, to: Status, position = 0): Promise<boolean> => {
      const c = cardsRef.current?.find((x) => x.id === id);
      if (!c) return Promise.resolve(false);
      const needsWords = (to === "COMPLETED" && c.status === "IN_PROGRESS") || c.status === "COMPLETED";
      if (needsWords) {
        return new Promise<boolean>((resolve) => {
          setMoveErr(null);
          setPending({ id, to, from: c.status, title: c.title, hasLink: !!(c.githubUrl || c.accessUrl), hasImage: !!c.coverAssetId, resolve });
        });
      }
      return send(id, to, { position }).catch(() => false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [load],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (cards ?? []).filter((c) => (!cat || c.category?.id === cat) && (!needle || c.title.toLowerCase().includes(needle) || c.techTags.some((t) => t.toLowerCase().includes(needle))));
  }, [cards, q, cat]);

  const counts = useMemo(() => {
    const out: Record<Status, number> = { IDEA: 0, IN_PROGRESS: 0, COMPLETED: 0 };
    (cards ?? []).forEach((c) => c.myRole !== "INVITED" && (out[c.status] += 1));
    return out;
  }, [cards]);
  const total = counts.IDEA + counts.IN_PROGRESS + counts.COMPLETED;
  const invites = (cards ?? []).filter((c) => c.myRole === "INVITED");
  const avg = total ? Math.round((cards ?? []).filter((c) => c.myRole !== "INVITED").reduce((s, c) => s + c.progress, 0) / total) : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      {/* Hero */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 p-5 text-white shadow-float sm:p-6">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <motion.span className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 6 }} />
          <span className="absolute -bottom-20 right-40 h-48 w-48 rounded-full bg-sky-300/20" />
          <Sparkles className="absolute right-6 top-6 h-10 w-10 text-white/20" />
        </div>
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">My projects</h1>
            <p className="mt-1 text-sm text-white/80">Plan, build and ship your ideas.</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {STATUS_ORDER.map((s) => {
                const M = STATUS_META[s];
                return (
                  <span key={s} className="inline-flex items-center gap-2 rounded-full bg-white/15 py-1.5 pl-2 pr-3.5 ring-1 ring-white/20 backdrop-blur" title={M.label}>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                      <M.icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="text-base font-extrabold tabular-nums">{counts[s]}</span>
                    <span className="text-xs font-medium text-white/85">{M.label}</span>
                  </span>
                );
              })}
            </div>
            {total > 0 && (
              <div className="mt-4 flex h-2 max-w-md gap-1 overflow-hidden rounded-full" role="img" aria-label={STATUS_ORDER.map((s) => `${STATUS_META[s].label} ${counts[s]}`).join(", ")}>
                {STATUS_ORDER.map((s) =>
                  counts[s] ? (
                    <motion.span key={s} className="h-full rounded-full" style={{ backgroundColor: s === "IDEA" ? "#fdba74" : s === "IN_PROGRESS" ? "#ffffff" : "#6ee7b7" }} initial={{ flexGrow: 0 }} animate={{ flexGrow: counts[s] }} transition={{ duration: 0.8 }} />
                  ) : null,
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-1">
              <div className="rounded-full bg-white p-1.5 shadow-lg">
                <ProgressRing value={avg} size={72} stroke={7} color="#10b981" label={`Average progress ${avg}%`} />
              </div>
              <span className="text-[11px] font-semibold text-white/85">Avg. progress</span>
            </div>
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} type="button" onClick={() => setWizard("IDEA")} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-blue-700 shadow-lg shadow-blue-900/20 transition hover:bg-blue-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
                <Plus className="h-4 w-4" />
              </span>
              New project
            </motion.button>
          </div>
        </div>
      </motion.section>

      {invites.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {invites.map((c) => (
            <button key={c.id} type="button" onClick={() => open(c.id)} className="inline-flex items-center gap-2 rounded-full border-2 border-dashed border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100">
              <Mail className="h-4 w-4" /> {c.title} <span className="text-xs font-normal">· {c.ownerName}</span>
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search projects" className="w-full rounded-full border border-slate-200 bg-white py-2 pl-10 pr-8 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 dark:border-gray-700/60 dark:bg-gray-800/40 dark:text-white" />
          {q && <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex gap-1 overflow-x-auto" role="radiogroup" aria-label="Category">
          {categories.map((c) => {
            const Icon = CATEGORY_ICON[c.icon] ?? CATEGORY_ICON.sparkles;
            const on = cat === c.id;
            return (
              <button key={c.id} type="button" role="radio" aria-checked={on} title={c.name} aria-label={c.name} onClick={() => setCat(on ? null : c.id)} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${on ? "border-transparent text-white shadow" : "border-slate-200 bg-white hover:border-slate-300 dark:border-gray-700/60 dark:bg-gray-800/40"}`} style={on ? { backgroundColor: c.color } : undefined}>
                <Icon className="h-4 w-4" style={on ? undefined : { color: c.color }} />
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-gray-700/60 dark:bg-gray-800/40">
          <button type="button" aria-pressed={archived} title="Archived" aria-label="Archived" onClick={() => setArchived((a) => !a)} className={`rounded-full p-1.5 ${archived ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900" : "text-slate-500"}`}><Archive className="h-4 w-4" /></button>
          <span className="mx-0.5 h-5 w-px bg-slate-200 dark:bg-slate-600" />
          <button type="button" aria-pressed={view === "board"} title="Board" aria-label="Board" onClick={() => setView("board")} className={`rounded-full p-1.5 ${view === "board" ? "bg-blue-600 text-white" : "text-slate-500"}`}><Kanban className="h-4 w-4" /></button>
          <button type="button" aria-pressed={view === "list"} title="List" aria-label="List" onClick={() => setView("list")} className={`rounded-full p-1.5 ${view === "list" ? "bg-blue-600 text-white" : "text-slate-500"}`}><List className="h-4 w-4" /></button>
        </div>
      </div>

      {loadErr ? (
        <div className={`${cardCls} p-8 text-center`}>
          <p className="text-sm font-medium text-red-600">{loadErr}</p>
          <button type="button" className={`${primaryBtn} mt-3`} onClick={load}>Retry</button>
        </div>
      ) : !cards ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-80" />)}</div>
      ) : cards.length === 0 && !archived ? (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className={`${cardCls} flex flex-col items-center gap-4 p-10 text-center`}>
          <EmptyArt />
          <div className="flex items-center gap-2 text-slate-400" aria-hidden>
            {STATUS_ORDER.map((s, i) => {
              const M = STATUS_META[s];
              return (
                <React.Fragment key={s}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ backgroundColor: statusColor(s, dark) }}><M.icon className="h-5 w-5" /></span>
                  {i < 2 && <span className="h-0.5 w-8 rounded bg-slate-300 dark:bg-slate-600" />}
                </React.Fragment>
              );
            })}
          </div>
          <button type="button" className={primaryBtn} onClick={() => setWizard("IDEA")}><Plus className="h-4 w-4" /> New project</button>
        </motion.div>
      ) : view === "board" && !archived ? (
        <Board cards={shown} onOpen={(id) => open(id)} onMove={move} onReorder={(s, ids) => sideProjectsApi.order(s, ids).catch(() => undefined)} onAdd={(s) => setWizard(s)} />
      ) : (
        <div className={`${cardCls} divide-y divide-slate-100 overflow-hidden dark:divide-gray-700/40`}>
          {shown.length === 0 && <EmptyArt icon={Archive} className="my-8" />}
          {shown.map((c) => (
            <button key={c.id} type="button" onClick={() => open(c.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-gray-700/40">
              <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: statusColor(c.status, dark) }} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-slate-800 dark:text-white">{c.title}</span>
                  <ReviewBadge state={c.reviewState} compact />
                  <HealthDot health={c.health} />
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <ProgressBar value={c.progress} color={statusColor(c.status, dark)} className="max-w-[10rem]" />
                  <span className="text-[11px] font-bold tabular-nums text-slate-500">{c.progress}%</span>
                  <span className="hidden text-[11px] text-slate-400 sm:inline">{timeAgo(c.lastActivityAt)}</span>
                </div>
              </div>
              <div className="hidden sm:block"><DocChips docs={c.docs} pending={c.conceptPending} /></div>
              <StatusPill status={c.status} />
            </button>
          ))}
        </div>
      )}

      <CreateWizard
        open={wizard !== null}
        initialStatus={wizard ?? "IDEA"}
        categories={categories}
        onClose={() => setWizard(null)}
        onCreated={(id) => {
          setWizard(null);
          load();
          open(id);
        }}
      />
      <ProjectDrawer projectId={openId} mode="student" meId={meId} categories={categories} onClose={() => open(null)} onChanged={load} onMove={move} initialTab={drawerTab} />
      <MoveDialog
        open={pending}
        busy={moveBusy}
        error={moveErr}
        onCancel={() => {
          pending?.resolve(false);
          setPending(null);
        }}
        onConfirm={async (payload) => {
          if (!pending) return;
          setMoveBusy(true);
          try {
            await send(pending.id, pending.to, payload);
            pending.resolve(true);
            setPending(null);
          } catch (f: any) {
            setMoveErr(f?.message ?? "Refused");
          } finally {
            setMoveBusy(false);
          }
        }}
      />
    </div>
  );
};

export default MyProjects;
