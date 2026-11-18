import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, ArchiveRestore, Clock, FileStack, Images, LayoutGrid, MessagesSquare, MoreVertical, Target, Trash2, Users, Wrench, X, GraduationCap, Hash, CalendarRange, Maximize2, Minimize2 } from "lucide-react";
import { failure, fileUrl, sideProjectsApi, type Category, type ProjectDetail, type Status } from "../../api/sideProjects";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import UserAvatar from "../ui/UserAvatar";
import OverviewPanel from "./panels/OverviewPanel";
import DocumentsPanel from "./panels/DocumentsPanel";
import GalleryPanel from "./panels/GalleryPanel";
import ProgressPanel from "./panels/ProgressPanel";
import { FeedbackPanel, InviteBanner, TeamPanel, TimelinePanel } from "./panels/ActivityPanels";
import { TYPE_LABEL } from "./fields";
import { MoveDialog } from "./MoveDialog";
import StageTrack from "./StageTrack";
import { GlassRing, CATEGORY_ICON, HealthDot, ReviewBadge, Skeleton, STATUS_META, pathStage, statusColor, useIsDark } from "./ui";

type Tab = "overview" | "documents" | "gallery" | "progress" | "timeline" | "feedback" | "team";

export interface DrawerProps {
  projectId: number | null;
  mode: "student" | "staff";
  meId: number;
  categories: Category[];
  onClose: () => void;
  onChanged: () => void;
  /** Student: move through the lifecycle (the parent handles dialogs and refusals). */
  onMove?: (id: number, to: Status) => Promise<boolean>;
  initialTab?: Tab;
}

/** One project, everything about it, in a side sheet shared by students and staff. */
const ProjectDrawer: React.FC<DrawerProps> = ({ projectId, mode, meId, categories, onClose, onChanged, onMove, initialTab }) => {
  const dark = useIsDark();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [p, setP] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab ?? "overview");
  const [menu, setMenu] = useState(false);
  const [correct, setCorrect] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [moveErr, setMoveErr] = useState<string | null>(null);
  // Maximised: the sheet takes the whole screen (remembered on this device).
  const [max, setMax] = useState(() => {
    try {
      return localStorage.getItem("sp.drawer.max") === "1";
    } catch {
      return false;
    }
  });
  const toggleMax = () =>
    setMax((m) => {
      try {
        localStorage.setItem("sp.drawer.max", m ? "0" : "1");
      } catch {
        /* private mode */
      }
      return !m;
    });

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      setError(null);
      setP(mode === "staff" ? await sideProjectsApi.staffGet(projectId) : await sideProjectsApi.get(projectId));
    } catch (e) {
      setError(failure(e, "This project can't be opened").message);
    }
  }, [projectId, mode]);

  useEffect(() => {
    setP(null);
    setTab(initialTab ?? "overview");
    setMenu(false);
    load();
  }, [projectId, load, initialTab]);

  useEffect(() => {
    if (!projectId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector('[role="dialog"][aria-modal="true"]:not([data-drawer])') && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [projectId, onClose]);

  const changed = useCallback(() => {
    load();
    onChanged();
  }, [load, onChanged]);

  const invited = p && mode === "student" && !p.rights.edit && p.members.some((m) => m.id === meId && m.status === "INVITED");
  const tabs: Array<{ key: Tab; icon: React.ElementType; label: string; count?: number; hide?: boolean }> = p
    ? [
        { key: "overview", icon: LayoutGrid, label: "Overview" },
        { key: "documents", icon: FileStack, label: "Documents", count: Object.values(p.documents).filter((d) => d.current).length },
        { key: "gallery", icon: Images, label: "Gallery", count: p.media.length },
        { key: "progress", icon: Target, label: "Progress", count: p.updates.length },
        { key: "feedback", icon: MessagesSquare, label: "Feedback", count: p.comments.length },
        { key: "team", icon: Users, label: "Team", count: p.members.length + 1, hide: mode === "staff" && p.members.length === 0 },
        { key: "timeline", icon: Clock, label: "Timeline" },
      ]
    : [];

  const stepTo = async (to: Status) => {
    if (!p || to === p.status) return;
    if (mode === "student" && p.rights.edit && onMove) {
      const ok = await onMove(p.id, to);
      if (ok) changed();
    } else if (mode === "staff" && p.rights.manageAny) setCorrect(to);
  };

  const ownerActions = p && (mode === "student" ? p.rights.owner : p.rights.manageAny);
  const doArchive = async () => {
    if (!p) return;
    setMenu(false);
    try {
      if (mode === "staff") await sideProjectsApi.adminArchive(p.id, !p.archivedAt);
      else if (p.archivedAt) await sideProjectsApi.restore(p.id);
      else await sideProjectsApi.archive(p.id);
      showToast(p.archivedAt ? "Restored" : "Archived", "success");
      changed();
    } catch (e) {
      showToast(failure(e).message, "error");
    }
  };
  const doDelete = async () => {
    if (!p) return;
    setMenu(false);
    if (!(await confirm({ title: `Delete “${p.title}”?`, tone: "danger", confirmText: "Delete", message: "Its files go too." }))) return;
    try {
      if (mode === "staff") await sideProjectsApi.adminDelete(p.id);
      else await sideProjectsApi.remove(p.id);
      showToast("Deleted", "success");
      onChanged();
      onClose();
    } catch (e) {
      showToast(failure(e).message, "error");
    }
  };

  const CatIcon = CATEGORY_ICON[p?.category?.icon ?? "sparkles"] ?? CATEGORY_ICON.sparkles;
  const accent = p?.category?.color ?? (p ? statusColor(pathStage(p.status, p.pausedFrom), dark) : "#2a78d6");

  return createPortal(
    <AnimatePresence>
      {projectId && (
        <motion.div className="fixed inset-0 z-[60] flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
          <motion.aside
            role="dialog"
            aria-modal="true"
            data-drawer
            aria-label={p?.title ?? "Project"}
            className={`relative flex h-full w-full flex-col overflow-hidden border-l border-slate-200 bg-slate-50 transition-[max-width] duration-300 ease-out dark:border-gray-700/50 dark:bg-gray-900 ${max ? "max-w-full" : "max-w-3xl"}`}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
          >
            {/* Header: cover, identity, status, tabs */}
            <div className="relative shrink-0">
              <div className="relative h-44 overflow-hidden" style={{ background: `linear-gradient(135deg, ${accent} 0%, ${accent}cc 45%, #0f172a 130%)` }}>
                {p?.coverAssetId && <img src={fileUrl(p.coverAssetId, "thumb")} alt="" className="absolute inset-0 h-full w-full scale-105 object-cover opacity-30 blur-sm" />}
                <div className="absolute inset-0 bg-gradient-to-b from-slate-900/30 via-slate-900/35 to-slate-900/80" aria-hidden />
                <motion.span className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-white/10" animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 7 }} aria-hidden />
                <span className="absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-white/5" aria-hidden />

                {/* Top bar */}
                <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-4">
                  {p?.category ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white ring-1 ring-inset ring-white/25 backdrop-blur-md">
                      <CatIcon className="h-3.5 w-3.5" aria-hidden /> {p.category.name}
                    </span>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-1.5">
                    {ownerActions && (
                      <div className="relative">
                        <button type="button" aria-label="More" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-inset ring-white/25 backdrop-blur-md transition hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
                          <MoreVertical className="h-[18px] w-[18px]" />
                        </button>
                        {menu && (
                          <div role="menu" className="absolute right-0 top-11 z-10 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 dark:border-gray-700/60 dark:bg-gray-800">
                            <button role="menuitem" type="button" onClick={doArchive} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-gray-100 dark:hover:bg-gray-700/50">
                              {p?.archivedAt ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />} {p?.archivedAt ? "Restore" : "Archive"}
                            </button>
                            <button role="menuitem" type="button" onClick={doDelete} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10">
                              <Trash2 className="h-4 w-4" /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <button type="button" aria-label={max ? "Restore size" : "Maximise"} title={max ? "Restore size" : "Maximise"} aria-pressed={max} onClick={toggleMax} className="hidden h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-inset ring-white/25 backdrop-blur-md transition hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white md:flex">
                      {max ? <Minimize2 className="h-[18px] w-[18px]" /> : <Maximize2 className="h-[18px] w-[18px]" />}
                    </button>
                    <button type="button" aria-label="Close" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-inset ring-white/25 backdrop-blur-md transition hover:rotate-90 hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
                      <X className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                </div>

                {/* Title + glass progress */}
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5">
                  <div className="min-w-0 flex-1 text-white">
                    {p ? (
                      <>
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ring-white/25 backdrop-blur-md">
                            {React.createElement(STATUS_META[p.status].icon, { className: "h-3 w-3", "aria-hidden": true })} {STATUS_META[p.status].label}
                          </span>
                          <ReviewBadge state={p.reviewState} />
                          {p.archivedAt && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ring-white/25">
                              <Archive className="h-3 w-3" aria-hidden /> Archived
                            </span>
                          )}
                        </div>
                        <h2 className="line-clamp-2 text-2xl font-extrabold leading-tight tracking-tight ">{p.title}</h2>
                      </>
                    ) : (
                      <Skeleton className="h-8 w-2/3 !bg-white/25" />
                    )}
                  </div>
                  {p && <GlassRing value={p.progress} caption={p.status === "COMPLETED" ? "done" : "progress"} accent={p.status === "COMPLETED" ? "#6ee7b7" : "#93c5fd"} />}
                </div>
              </div>

              {p && (
                <div className="space-y-4 border-b border-slate-200/80 bg-white/70 px-5 py-4 backdrop-blur dark:border-gray-700/40 dark:bg-gray-900/60">
                  {/* Owner + meta */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar name={p.owner.name} src={p.owner.avatar} userId={p.owner.id} size={40} decorative />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{p.owner.name}</p>
                        <p className="text-xs text-slate-500 dark:text-gray-400">{TYPE_LABEL[p.owner.type] ?? "Student"}{p.members.filter((m) => m.status === "ACCEPTED").length ? ` · team of ${p.members.filter((m) => m.status === "ACCEPTED").length + 1}` : ""}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.owner.regNumber && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-700 dark:bg-gray-800 dark:text-gray-200" title="Registration number">
                          <Hash className="h-3 w-3 text-slate-400" aria-hidden /> {p.owner.regNumber}
                        </span>
                      )}
                      {p.class && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:bg-gray-800 dark:text-gray-200" title="Class">
                          <GraduationCap className="h-3 w-3 text-slate-400" aria-hidden /> {p.class.name}
                          {p.class.grade ? <span className="font-normal text-slate-600 dark:text-gray-300">· {p.class.grade}</span> : null}
                        </span>
                      )}
                      {p.academicYear && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:bg-gray-800 dark:text-gray-200" title="Academic year">
                          <CalendarRange className="h-3 w-3 text-slate-400" aria-hidden /> {p.academicYear.name}
                        </span>
                      )}
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 dark:bg-gray-800">
                        <HealthDot health={p.health} withLabel />
                      </span>
                    </div>
                  </div>

                  {/* Stages: one segmented track with the days of each */}
                  <StageTrack p={p} canMove={(mode === "student" && p.rights.edit) || (mode === "staff" && p.rights.manageAny)} onStep={stepTo} />
                  {mode === "staff" && p.rights.manageAny && (
                    <p className="-mt-2 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-gray-400">
                      <Wrench className="h-3 w-3" aria-hidden /> Status changes made here are logged as corrections.
                    </p>
                  )}
                </div>
              )}

              {/* Tabs: pills, scroll with fading edges */}
              {p && (
                <div className="relative border-b border-slate-200/80 bg-white/70 backdrop-blur dark:border-gray-700/40 dark:bg-gray-900/60">
                  <nav className="no-scrollbar flex gap-1 overflow-x-auto px-4 py-2.5 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-24px),transparent)]" role="tablist" aria-label="Project sections">
                    {tabs.filter((t) => !t.hide).map((t) => {
                      const on = tab === t.key;
                      return (
                        <button
                          key={t.key}
                          role="tab"
                          type="button"
                          aria-selected={on}
                          onClick={() => setTab(t.key)}
                          className={`relative flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${on ? "text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"}`}
                        >
                          {on && <motion.span layoutId="sp-tab" className="absolute inset-0 rounded-full bg-blue-600 " transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                          <t.icon className="relative h-4 w-4" aria-hidden />
                          <span className="relative">{t.label}</span>
                          {t.count !== undefined && t.count > 0 && (
                            <span className={`relative min-w-[18px] rounded-full px-1.5 text-center text-[10px] tabular-nums ${on ? "bg-blue-800 text-white" : "bg-slate-200/80 text-slate-600 dark:bg-gray-700 dark:text-gray-300"}`}>{t.count}</span>
                          )}
                        </button>
                      );
                    })}
                  </nav>
                </div>
              )}
            </div>

            <div className={`flex-1 overflow-y-auto p-5 ${max ? "lg:px-10" : ""}`}>
              {error ? (
                <p className="mt-10 text-center text-sm font-medium text-red-600">{error}</p>
              ) : !p ? (
                <div className="space-y-3">
                  <Skeleton className="h-24" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-40" />
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className={`space-y-3 ${max ? "mx-auto max-w-6xl" : ""}`}>
                    {invited && <InviteBanner p={p} onDone={(ok) => (ok ? changed() : (onChanged(), onClose()))} />}
                    {tab === "overview" && <OverviewPanel p={p} categories={categories} onSaved={changed} staff={mode === "staff"} wide={max} />}
                    {tab === "documents" && <DocumentsPanel p={p} onChanged={changed} />}
                    {tab === "gallery" && <GalleryPanel p={p} onChanged={changed} />}
                    {tab === "progress" && <ProgressPanel p={p} meId={meId} onChanged={changed} wide={max} />}
                    {tab === "feedback" && <FeedbackPanel p={p} staff={mode === "staff"} onChanged={changed} />}
                    {tab === "team" && <TeamPanel p={p} meId={meId} onChanged={changed} onLeft={() => (onChanged(), onClose())} />}
                    {tab === "timeline" && <TimelinePanel p={p} />}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          </motion.aside>
          {p && (
            <MoveDialog
              open={correct ? { to: correct, from: p.status, title: p.title, hasLink: !!(p.githubUrl || p.accessUrl), hasImage: p.media.some((m) => m.kind === "image"), correction: true } : null}
              busy={busy}
              error={moveErr}
              onCancel={() => (setCorrect(null), setMoveErr(null))}
              onConfirm={async ({ reason }) => {
                if (!correct) return;
                setBusy(true);
                try {
                  await sideProjectsApi.correctStatus(p.id, correct, reason ?? "");
                  showToast("Status corrected", "success");
                  setCorrect(null);
                  changed();
                } catch (e) {
                  setMoveErr(failure(e).message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default ProjectDrawer;
