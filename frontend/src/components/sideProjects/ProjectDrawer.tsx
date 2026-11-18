import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  ArchiveRestore,
  Clock,
  FileStack,
  Images,
  LayoutGrid,
  MessagesSquare,
  MoreVertical,
  Target,
  Trash2,
  Users,
  Wrench,
  X,
  GraduationCap,
  Hash,
  CalendarRange,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  failure,
  fileUrl,
  sideProjectsApi,
  type Category,
  type ProjectDetail,
  type Status,
} from "../../api/sideProjects";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import UserAvatar from "../ui/UserAvatar";
import OverviewPanel from "./panels/OverviewPanel";
import DocumentsPanel from "./panels/DocumentsPanel";
import GalleryPanel from "./panels/GalleryPanel";
import ProgressPanel from "./panels/ProgressPanel";
import {
  FeedbackPanel,
  InviteBanner,
  TeamPanel,
  TimelinePanel,
} from "./panels/ActivityPanels";
import { TYPE_LABEL } from "./fields";
import { MoveDialog } from "./MoveDialog";
import StageTrack from "./StageTrack";
import {
  CATEGORY_ICON,
  HealthDot,
  ProgressRing,
  ReviewBadge,
  Skeleton,
  StatusPill,
  iconBtn,
  pathStage,
  statusColor,
  useIsDark,
} from "./ui";
import KindControl from "./KindControl";
import { useSpMe } from "./useMe";

type Tab =
  | "overview"
  | "documents"
  | "gallery"
  | "progress"
  | "timeline"
  | "feedback"
  | "team";

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
const ProjectDrawer: React.FC<DrawerProps> = ({
  projectId,
  mode,
  meId,
  categories,
  onClose,
  onChanged,
  onMove,
  initialTab,
}) => {
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
  const me = useSpMe();
  const [thumbBroken, setThumbBroken] = useState(false);
  useEffect(() => setThumbBroken(false), [projectId]);
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
      setP(
        mode === "staff"
          ? await sideProjectsApi.staffGet(projectId)
          : await sideProjectsApi.get(projectId),
      );
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
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" &&
      !document.querySelector(
        '[role="dialog"][aria-modal="true"]:not([data-drawer])',
      ) &&
      onClose();
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

  const invited =
    p &&
    mode === "student" &&
    !p.rights.edit &&
    p.members.some((m) => m.id === meId && m.status === "INVITED");
  const tabs: Array<{
    key: Tab;
    icon: React.ElementType;
    label: string;
    count?: number;
    hide?: boolean;
  }> = p
    ? [
        { key: "overview", icon: LayoutGrid, label: "Overview" },
        {
          key: "documents",
          icon: FileStack,
          label: "Documents",
          count: Object.values(p.documents).filter((d) => d.current).length,
        },
        {
          key: "gallery",
          icon: Images,
          label: "Gallery",
          count: p.media.length,
        },
        {
          key: "progress",
          icon: Target,
          label: "Progress",
          count: p.updates.length,
        },
        {
          key: "feedback",
          icon: MessagesSquare,
          label: "Feedback",
          count: p.comments.length,
        },
        {
          key: "team",
          icon: Users,
          label: "Team",
          count: p.members.length + 1,
          hide: mode === "staff" && p.members.length === 0,
        },
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

  const ownerActions =
    p && (mode === "student" ? p.rights.owner : p.rights.manageAny);
  const doArchive = async () => {
    if (!p) return;
    setMenu(false);
    try {
      if (mode === "staff")
        await sideProjectsApi.adminArchive(p.id, !p.archivedAt);
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
    if (
      !(await confirm({
        title: `Delete “${p.title}”?`,
        tone: "danger",
        confirmText: "Delete",
        message: "Its files go too.",
      }))
    )
      return;
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

  const CatIcon =
    CATEGORY_ICON[p?.category?.icon ?? "sparkles"] ?? CATEGORY_ICON.sparkles;
  const accent =
    p?.category?.color ??
    (p ? statusColor(pathStage(p.status, p.pausedFrom), dark) : "#2a78d6");

  return createPortal(
    <AnimatePresence>
      {projectId && (
        <motion.div
          className="fixed inset-0 z-[60] flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            data-drawer
            aria-label={p?.title ?? "Project"}
            className={`relative flex h-full w-full flex-col overflow-hidden border-l border-slate-200 bg-slate-50 transition-[max-width] duration-300 ease-out dark:border-gray-800 dark:bg-gray-950 ${max ? "max-w-full" : "max-w-3xl"}`}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
          >
            {/* Header: compact identity row, owner line, stage track, then tabs */}
            <div className="relative shrink-0">
              <div className="bg-white px-4 pb-1 pt-4 sm:px-5 dark:bg-gray-900">
                <div className="flex items-start gap-3">
                  {/* Cover thumbnail, or the category glyph on a soft tint */}
                  <span
                    className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl"
                    style={{ backgroundColor: `${accent}1f`, color: accent }}
                  >
                    <CatIcon className="h-6 w-6" aria-hidden />
                    {p?.coverAssetId && !thumbBroken && (
                      <img
                        src={fileUrl(p.coverAssetId, "thumb")}
                        alt=""
                        onError={() => setThumbBroken(true)}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    {p ? (
                      <>
                        <h2
                          className="truncate text-lg font-bold leading-snug tracking-tight text-slate-900 dark:text-white"
                          title={p.title}
                        >
                          {p.title}
                        </h2>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <StatusPill status={p.status} />
                          <KindControl
                            p={p}
                            canChange={
                              !!me?.classify &&
                              (p.rights.edit || p.rights.manageAny)
                            }
                            onChanged={changed}
                          />
                          {p.category && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-gray-700/60 dark:text-gray-200">
                              <CatIcon
                                className="h-3 w-3"
                                style={{ color: p.category.color }}
                                aria-hidden
                              />{" "}
                              {p.category.name}
                            </span>
                          )}
                          <ReviewBadge state={p.reviewState} />
                          {p.archivedAt && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-gray-700/60 dark:text-gray-200">
                              <Archive className="h-3 w-3" aria-hidden />{" "}
                              Archived
                            </span>
                          )}
                          <HealthDot health={p.health} withLabel />
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2 pt-1" aria-busy="true">
                        <Skeleton className="h-5 w-2/3" />
                        <Skeleton className="h-4 w-1/3" />
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {p && (
                      <ProgressRing
                        value={p.progress}
                        size={42}
                        stroke={4}
                        color={statusColor(
                          pathStage(p.status, p.pausedFrom),
                          dark,
                        )}
                        label={`${p.progress}% done`}
                      />
                    )}
                    {ownerActions && (
                      <div className="relative ml-1">
                        <button
                          type="button"
                          aria-label="More"
                          aria-haspopup="menu"
                          aria-expanded={menu}
                          onClick={() => setMenu((m) => !m)}
                          className={iconBtn}
                        >
                          <MoreVertical className="h-[18px] w-[18px]" />
                        </button>
                        {menu && (
                          <div
                            role="menu"
                            className="absolute right-0 top-10 z-10 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 dark:border-gray-700/60 dark:bg-gray-800"
                          >
                            <button
                              role="menuitem"
                              type="button"
                              onClick={doArchive}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-gray-100 dark:hover:bg-gray-700/50"
                            >
                              {p?.archivedAt ? (
                                <ArchiveRestore className="h-4 w-4" />
                              ) : (
                                <Archive className="h-4 w-4" />
                              )}{" "}
                              {p?.archivedAt ? "Restore" : "Archive"}
                            </button>
                            <button
                              role="menuitem"
                              type="button"
                              onClick={doDelete}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                            >
                              <Trash2 className="h-4 w-4" /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      aria-label={max ? "Restore size" : "Maximise"}
                      title={max ? "Restore size" : "Maximise"}
                      aria-pressed={max}
                      onClick={toggleMax}
                      className={`${iconBtn} hidden md:inline-flex`}
                    >
                      {max ? (
                        <Minimize2 className="h-[18px] w-[18px]" />
                      ) : (
                        <Maximize2 className="h-[18px] w-[18px]" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label="Close"
                      onClick={onClose}
                      className={iconBtn}
                    >
                      <X className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                </div>

                {p && (
                  <>
                    {/* Owner and context on one quiet line */}
                    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-gray-400">
                      <UserAvatar
                        name={p.owner.name}
                        src={p.owner.avatar}
                        userId={p.owner.id}
                        size={22}
                        decorative
                      />
                      <span className="font-semibold text-slate-800 dark:text-gray-100">
                        {p.owner.name}
                      </span>
                      <span>{TYPE_LABEL[p.owner.type] ?? "Student"}</span>
                      {p.members.filter((m) => m.status === "ACCEPTED").length >
                        0 && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" aria-hidden /> team of{" "}
                          {p.members.filter((m) => m.status === "ACCEPTED")
                            .length + 1}
                        </span>
                      )}
                      {p.owner.regNumber && (
                        <span
                          className="inline-flex items-center gap-1 font-mono"
                          title="Registration number"
                        >
                          <Hash className="h-3 w-3" aria-hidden />{" "}
                          {p.owner.regNumber}
                        </span>
                      )}
                      {p.class && (
                        <span
                          className="inline-flex items-center gap-1"
                          title="Class"
                        >
                          <GraduationCap className="h-3 w-3" aria-hidden />{" "}
                          {p.class.name}
                        </span>
                      )}
                      {p.academicYear && (
                        <span
                          className="inline-flex items-center gap-1"
                          title="Academic year"
                        >
                          <CalendarRange className="h-3 w-3" aria-hidden />{" "}
                          {p.academicYear.name}
                        </span>
                      )}
                    </div>

                    {/* Stages: one compact segmented track with the days of each */}
                    <div className="mt-3">
                      <StageTrack
                        p={p}
                        canMove={
                          (mode === "student" && p.rights.edit) ||
                          (mode === "staff" && p.rights.manageAny)
                        }
                        onStep={stepTo}
                        compact
                      />
                    </div>
                    {mode === "staff" && p.rights.manageAny && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-gray-400">
                        <Wrench className="h-3 w-3" aria-hidden /> Stage changes
                        made here are logged as corrections.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Tabs: quiet text tabs, a 2px blue underline slides to the active one */}
              {p && (
                <div className="relative bg-white dark:bg-gray-900">
                  <nav
                    className="no-scrollbar flex gap-1 overflow-x-auto border-b border-slate-200 px-3 sm:px-4 dark:border-gray-800"
                    role="tablist"
                    aria-label="Project sections"
                  >
                    {tabs
                      .filter((t) => !t.hide)
                      .map((t) => {
                        const on = tab === t.key;
                        return (
                          <button
                            key={t.key}
                            role="tab"
                            type="button"
                            aria-selected={on}
                            onClick={() => setTab(t.key)}
                            className={`group relative flex shrink-0 items-center gap-1.5 px-1 pb-3 pt-3 text-[13px] transition-colors focus:outline-none ${on ? "font-semibold text-slate-900 dark:text-white" : "font-medium text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white"}`}
                          >
                            <span className="pointer-events-none absolute inset-x-0 inset-y-1.5 rounded-lg transition-colors group-hover:bg-slate-100 group-focus-visible:ring-2 group-focus-visible:ring-blue-500 dark:group-hover:bg-gray-800" aria-hidden />
                            <span className="relative flex items-center gap-1.5 px-2">
                              <t.icon className={`h-4 w-4 ${on ? "text-blue-600 dark:text-blue-400" : ""}`} aria-hidden />
                              {t.label}
                              {t.count !== undefined && t.count > 0 && (
                                <span className={`text-[11px] font-medium tabular-nums text-slate-500 dark:text-gray-400`}>{t.count}</span>
                              )}
                            </span>
                            {on && (
                              <motion.span
                                layoutId="sp-tab-line"
                                className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-blue-600 dark:bg-blue-400"
                                transition={{ type: "spring", stiffness: 420, damping: 36 }}
                                aria-hidden
                              />
                            )}
                          </button>
                        );
                      })}
                  </nav>
                </div>
              )}
            </div>

            <div
              className={`flex-1 overflow-y-auto p-5 ${max ? "lg:px-10" : ""}`}
            >
              {error ? (
                <p className="mt-10 text-center text-sm font-medium text-red-600">
                  {error}
                </p>
              ) : !p ? (
                <div className="space-y-3">
                  <Skeleton className="h-24" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-40" />
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className={`space-y-3 ${max ? "mx-auto max-w-6xl" : ""}`}
                  >
                    {invited && (
                      <InviteBanner
                        p={p}
                        onDone={(ok) =>
                          ok ? changed() : (onChanged(), onClose())
                        }
                      />
                    )}
                    {tab === "overview" && (
                      <OverviewPanel
                        p={p}
                        categories={categories}
                        onSaved={changed}
                        staff={mode === "staff"}
                        wide={max}
                      />
                    )}
                    {tab === "documents" && (
                      <DocumentsPanel p={p} onChanged={changed} />
                    )}
                    {tab === "gallery" && (
                      <GalleryPanel p={p} onChanged={changed} />
                    )}
                    {tab === "progress" && (
                      <ProgressPanel
                        p={p}
                        meId={meId}
                        onChanged={changed}
                        wide={max}
                      />
                    )}
                    {tab === "feedback" && (
                      <FeedbackPanel
                        p={p}
                        staff={mode === "staff"}
                        onChanged={changed}
                      />
                    )}
                    {tab === "team" && (
                      <TeamPanel
                        p={p}
                        meId={meId}
                        onChanged={changed}
                        onLeft={() => (onChanged(), onClose())}
                      />
                    )}
                    {tab === "timeline" && <TimelinePanel p={p} />}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          </motion.aside>
          {p && (
            <MoveDialog
              open={
                correct
                  ? {
                      to: correct,
                      from: p.status,
                      title: p.title,
                      hasLink: !!(p.githubUrl || p.accessUrl),
                      hasImage: p.media.some((m) => m.kind === "image"),
                      correction: true,
                    }
                  : null
              }
              busy={busy}
              error={moveErr}
              onCancel={() => (setCorrect(null), setMoveErr(null))}
              onConfirm={async ({ reason }) => {
                if (!correct) return;
                setBusy(true);
                try {
                  await sideProjectsApi.correctStatus(
                    p.id,
                    correct,
                    reason ?? "",
                  );
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
