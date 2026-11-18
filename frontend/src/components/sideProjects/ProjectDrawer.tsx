import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, ArchiveRestore, Clock, FileStack, Images, LayoutGrid, MessagesSquare, MoreVertical, Target, Trash2, Users, Wrench, X, GraduationCap, Hash, CalendarRange, Briefcase } from "lucide-react";
import { failure, fileUrl, sideProjectsApi, type Category, type ProjectDetail, type Status } from "../../api/sideProjects";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import UserAvatar from "../ui/UserAvatar";
import OverviewPanel from "./panels/OverviewPanel";
import DocumentsPanel from "./panels/DocumentsPanel";
import GalleryPanel from "./panels/GalleryPanel";
import ProgressPanel from "./panels/ProgressPanel";
import { FeedbackPanel, InviteBanner, TeamPanel, TimelinePanel } from "./panels/ActivityPanels";
import { MoveDialog, TYPE_LABEL } from "./fields";
import { STATUS_SOLID, CATEGORY_ICON, HealthDot, ProgressRing, ReviewBadge, Skeleton, STATUS_META, STATUS_ORDER, statusColor, useIsDark } from "./ui";

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
  const accent = p?.category?.color ?? (p ? statusColor(p.status, dark) : "#3b6cff");

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
            className="relative flex h-full w-full max-w-3xl flex-col overflow-hidden bg-slate-50 shadow-2xl dark:bg-slate-900"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
          >
            {/* Hero */}
            <div className="relative shrink-0">
              <div className="relative h-36 overflow-hidden" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}99)` }}>
                {p?.coverAssetId && <img src={fileUrl(p.coverAssetId, "thumb")} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                {!p?.coverAssetId && <CatIcon className="absolute -right-6 -top-6 h-40 w-40 text-white/15" aria-hidden />}
                <div className="absolute right-3 top-3 flex gap-1">
                  {ownerActions && (
                    <div className="relative">
                      <button type="button" aria-label="More" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="rounded-full bg-black/25 p-2 text-white backdrop-blur hover:bg-black/40">
                        <MoreVertical className="h-5 w-5" />
                      </button>
                      {menu && (
                        <div role="menu" className="absolute right-0 top-11 z-10 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-float dark:border-slate-600 dark:bg-slate-800">
                          <button role="menuitem" type="button" onClick={doArchive} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-700">
                            {p?.archivedAt ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />} {p?.archivedAt ? "Restore" : "Archive"}
                          </button>
                          <button role="menuitem" type="button" onClick={doDelete} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10">
                            <Trash2 className="h-4 w-4" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <button type="button" aria-label="Close" onClick={onClose} className="rounded-full bg-black/25 p-2 text-white backdrop-blur hover:bg-black/40">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="absolute bottom-3 left-4 right-24 text-white">
                  {p ? (
                    <>
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <ReviewBadge state={p.reviewState} />
                        {p.archivedAt && <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold"><Archive className="mr-1 inline h-3 w-3" />Archived</span>}
                      </div>
                      <h2 className="line-clamp-2 text-xl font-extrabold leading-tight drop-shadow">{p.title}</h2>
                    </>
                  ) : (
                    <Skeleton className="h-7 w-2/3 !bg-white/30" />
                  )}
                </div>
                {p && (
                  <div className="absolute bottom-3 right-4">
                    <div className="rounded-full bg-white/95 p-1 shadow-lg dark:bg-slate-900/90">
                      <ProgressRing value={p.progress} size={56} stroke={5} color={statusColor(p.status, dark)} />
                    </div>
                  </div>
                )}
              </div>

              {p && (
                <div className="space-y-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                  {/* Student identity strip */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <span className="flex items-center gap-2 font-semibold text-slate-800 dark:text-white">
                      <UserAvatar name={p.owner.name} src={p.owner.avatar} userId={p.owner.id} size={26} decorative /> {p.owner.name}
                    </span>
                    {p.owner.type !== "STUDENT" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
                        <Briefcase className="h-3 w-3" aria-hidden /> {TYPE_LABEL[p.owner.type] ?? p.owner.type}
                      </span>
                    )}
                    {p.owner.regNumber && <span className="flex items-center gap-1 font-mono"><Hash className="h-3.5 w-3.5" aria-hidden />{p.owner.regNumber}</span>}
                    {p.class && <span className="flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" aria-hidden />{p.class.name}{p.class.grade ? ` · ${p.class.grade}` : ""}</span>}
                    {p.academicYear && <span className="flex items-center gap-1"><CalendarRange className="h-3.5 w-3.5" aria-hidden />{p.academicYear.name}</span>}
                    <HealthDot health={p.health} withLabel />
                  </div>
                  {/* Status stepper — clickable for the team (and the lead's correction) */}
                  <ol className="flex items-center gap-1" aria-label="Status">
                    {STATUS_ORDER.map((s, i) => {
                      const M = STATUS_META[s];
                      const reached = STATUS_ORDER.indexOf(p.status) >= i;
                      const clickable = (mode === "student" && p.rights.edit) || (mode === "staff" && p.rights.manageAny);
                      return (
                        <li key={s} className="flex flex-1 items-center gap-1">
                          <button
                            type="button"
                            disabled={!clickable || s === p.status}
                            onClick={() => stepTo(s)}
                            aria-current={s === p.status ? "step" : undefined}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-bold transition ${s === p.status ? "text-white shadow-sm" : reached ? `${M.soft} ${M.text} ring-1 ${M.ring}` : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"} ${clickable && s !== p.status ? "hover:scale-[1.03] hover:ring-2 hover:ring-brand-500/40" : ""}`}
                            style={s === p.status ? { backgroundColor: STATUS_SOLID[s] } : undefined}
                          >
                            <M.icon className="h-3.5 w-3.5" aria-hidden /> {M.label}
                          </button>
                          {i < 2 && <span className={`h-0.5 w-3 rounded ${STATUS_ORDER.indexOf(p.status) > i ? "bg-slate-400" : "bg-slate-200 dark:bg-slate-700"}`} aria-hidden />}
                        </li>
                      );
                    })}
                    {mode === "staff" && p.rights.manageAny && <li className="list-none"><Wrench className="ml-1 h-4 w-4 text-slate-400" aria-label="Status corrections are logged" /></li>}
                  </ol>
                </div>
              )}

              {/* Tabs */}
              {p && (
                <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-slate-800" role="tablist" aria-label="Project sections">
                  {tabs.filter((t) => !t.hide).map((t) => (
                    <button
                      key={t.key}
                      role="tab"
                      type="button"
                      aria-selected={tab === t.key}
                      onClick={() => setTab(t.key)}
                      className={`relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition ${tab === t.key ? "text-brand-700 dark:text-brand-200" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"}`}
                    >
                      <t.icon className="h-4 w-4" aria-hidden />
                      <span className="hidden sm:inline">{t.label}</span>
                      {t.count !== undefined && t.count > 0 && <span className="rounded-full bg-slate-100 px-1.5 text-[10px] tabular-nums dark:bg-slate-700">{t.count}</span>}
                      {tab === t.key && <motion.span layoutId="sp-tab" className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-brand-600" />}
                    </button>
                  ))}
                </nav>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
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
                  <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-3">
                    {invited && <InviteBanner p={p} onDone={(ok) => (ok ? changed() : (onChanged(), onClose()))} />}
                    {tab === "overview" && <OverviewPanel p={p} categories={categories} onSaved={changed} staff={mode === "staff"} />}
                    {tab === "documents" && <DocumentsPanel p={p} onChanged={changed} />}
                    {tab === "gallery" && <GalleryPanel p={p} onChanged={changed} />}
                    {tab === "progress" && <ProgressPanel p={p} onChanged={changed} />}
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
