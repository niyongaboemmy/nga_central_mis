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
  CalendarRange,
  ListChecks,
  ArrowLeft,
  ChevronRight,
  Briefcase,
  UserCheck,
  Github,
} from "lucide-react";
import {
  failure,
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
import { InviteBanner, TimelinePanel } from "./panels/ActivityPanels";
import FeedbackPanel from "./panels/FeedbackPanel";
import { TYPE_LABEL } from "./fields";
import { MoveDialog } from "./MoveDialog";
import StageTrack, { StageList } from "./StageTrack";
import WorkPanel from "./work/WorkPanel";
import TeamPanel from "./work/TeamPanel";
import { CustomerChip } from "./customers/CustomerParts";
import { AddCoverButton, CoverBand, EditableLogo } from "./Branding";
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
import GitPanel from "./git/GitPanel";
import { useSpMe } from "./useMe";

type Tab =
  | "overview"
  | "plan"
  | "documents"
  | "gallery"
  | "progress"
  | "timeline"
  | "feedback"
  | "team" | "github";

export interface DrawerProps {
  projectId: number | null;
  mode: "student" | "staff";
  meId: number;
  categories: Category[];
  onClose: () => void;
  onChanged: () => void;
  /** Student: move through the lifecycle (the parent handles dialogs and refusals). */
  onMove?: (id: number, to: Status) => Promise<boolean>;
  initialTab?: Tab | string;
}

/**
 * One project, everything about it, in a full-screen workspace shared by students and staff:
 * a top bar, a sidebar (identity, stages, details, sections) and the section in a wide column.
 * On small screens the sidebar folds into a header with tabs.
 */
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
  const [tab, setTab] = useState<Tab>((initialTab as Tab) ?? "overview");
  // Plan-linked reporting: other sections ask to switch (e.g. Plan -> a feature's reports).
  const [focusItem, setFocusItem] = useState<number | null>(null);
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ tab: Tab; item?: number | null }>).detail;
      if (!d?.tab) return;
      setFocusItem(d.item ?? null);
      setTab(d.tab);
      document.getElementById("sp-workspace-main")?.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("sp:open", onOpen);
    return () => window.removeEventListener("sp:open", onOpen);
  }, []);
  const [menu, setMenu] = useState(false);
  const [correct, setCorrect] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [moveErr, setMoveErr] = useState<string | null>(null);
  const me = useSpMe();
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
    setTab((initialTab as Tab) ?? "overview");
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
        { key: "plan", icon: ListChecks, label: "Plan", count: p.tasks?.open || undefined },
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
        { key: "github", icon: Github, label: "GitHub", hide: mode === "staff" && !p.rights.edit },
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

  const SECTION_HINT: Record<Tab, string> = {
    overview: "What it is, the problem it solves, who it's for, its timeline and daily work",
    plan: "Phases, features and the tasks inside them",
    documents: "Concept note, SRS and implementation plan",
    gallery: "Screenshots, designs and files",
    progress: "Reports of the work done",
    feedback: "Comments and reviews",
    team: "Who works on it, their roles and their work",
    timeline: "Everything that happened",
    github: "The repository, task keys and automations that write your reports",
  };
  const visibleTabs = tabs.filter((t) => !t.hide);
  const current = visibleTabs.find((t) => t.key === tab) ?? visibleTabs[0];
  const canMove = !!p && ((mode === "student" && p.rights.edit) || (mode === "staff" && p.rights.manageAny));
  const team = p ? p.members.filter((m) => m.status === "ACCEPTED") : [];
  const fmtD = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "–");

  const chips = p && (
    <div className="flex flex-wrap items-center gap-1.5">
      <KindControl p={p} canChange={!!me?.classify && (p.rights.edit || p.rights.manageAny)} onChanged={changed} />
      {p.category && (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-gray-800 dark:text-gray-200">
          <CatIcon className="h-3 w-3" style={{ color: p.category.color }} aria-hidden /> {p.category.name}
        </span>
      )}
      {p.customerDetail && (
        <CustomerChip c={p.customerDetail} />
      )}
      <ReviewBadge state={p.reviewState} />
      {p.archivedAt && (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-gray-800 dark:text-gray-200">
          <Archive className="h-3 w-3" aria-hidden /> Archived
        </span>
      )}
      <HealthDot health={p.health} withLabel />
    </div>
  );

  const moreMenu = ownerActions && (
    <div className="relative">
      <button type="button" aria-label="More" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className={iconBtn}>
        <MoreVertical className="h-[18px] w-[18px]" />
      </button>
      {menu && (
        <div role="menu" className="absolute right-0 top-10 z-30 w-48 overflow-hidden rounded-2xl border border-slate-900/[0.07] bg-white p-1.5 dark:border-white/10 dark:bg-gray-900">
          <button role="menuitem" type="button" onClick={doArchive} className="flex w-full items-center gap-2 rounded-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-gray-100 dark:hover:bg-gray-800">
            {p?.archivedAt ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />} {p?.archivedAt ? "Restore" : "Archive"}
          </button>
          <button role="menuitem" type="button" onClick={doDelete} className="flex w-full items-center gap-2 rounded-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      )}
    </div>
  );

  return createPortal(
    <AnimatePresence>
      {projectId && (
        <motion.div
          role="dialog"
          aria-modal="true"
          data-drawer
          aria-label={p?.title ?? "Project"}
          className="fixed inset-0 z-[60] flex flex-col bg-slate-50 dark:bg-gray-950"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          {/* Top bar: back, where you are, the essentials */}
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-900/[0.07] bg-white px-2 sm:gap-3 sm:px-4 dark:border-white/[0.06] dark:bg-gray-900">
            <button type="button" aria-label="Back to the projects" onClick={onClose} className={iconBtn}>
              <ArrowLeft className="h-[18px] w-[18px]" />
            </button>
            <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
              <button type="button" onClick={onClose} className="hidden shrink-0 font-medium text-slate-500 hover:text-slate-900 sm:inline dark:text-gray-400 dark:hover:text-white">
                Projects
              </button>
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-300 sm:inline dark:text-gray-600" aria-hidden />
              {p ? <span className="truncate font-semibold text-slate-900 dark:text-white">{p.title}</span> : <Skeleton className="h-4 w-40" />}
              {p && current && (
                <>
                  <ChevronRight className="hidden h-4 w-4 shrink-0 text-slate-300 md:inline dark:text-gray-600" aria-hidden />
                  <span className="hidden shrink-0 text-slate-500 md:inline dark:text-gray-400">{current.label}</span>
                </>
              )}
            </nav>
            {p && (
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="hidden sm:inline-flex">
                  <StatusPill status={p.status} />
                </span>
                <ProgressRing value={p.progress} size={34} stroke={3.5} color={statusColor(pathStage(p.status, p.pausedFrom), dark)} label={`${p.progress}% done`} />
                {moreMenu}
              </div>
            )}
            <button type="button" aria-label="Close" onClick={onClose} className={iconBtn}>
              <X className="h-[18px] w-[18px]" />
            </button>
          </header>

          <div className="flex min-h-0 flex-1">
            {/* Sidebar (large screens): identity, stages, facts, sections */}
            {/* A block, not a flex column: in a scrolling flex column the cover band would shrink to
                nothing on long sidebars and the overlapping logo would slide under the top bar. */}
            <aside className="hidden w-[19rem] shrink-0 overflow-y-auto border-r border-slate-900/[0.07] bg-white lg:block dark:border-white/[0.06] dark:bg-gray-900" aria-label="Project">
              {!p ? (
                <div className="space-y-3 p-5" aria-busy="true">
                  <Skeleton className="h-14 w-14 !rounded-2xl" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-40" />
                  <Skeleton className="h-32" />
                </div>
              ) : (
                <>
                  <CoverBand projectId={p.id} coverAssetId={p.coverAssetId} canEdit={p.rights.edit} onChanged={changed} />
                  <div className={`px-5 ${p.coverAssetId ? "pt-0" : "pt-5"}`}>
                    <EditableLogo projectId={p.id} logoAssetId={p.logoAssetId ?? null} category={p.category} accent={accent} canEdit={p.rights.edit} onChanged={changed} size={56} className={p.coverAssetId ? "-mt-8" : ""} />
                    <h2 className="mt-3 text-lg font-bold leading-snug tracking-tight text-slate-900 dark:text-white">{p.title}</h2>
                    <div className="mt-2">{chips}</div>
                    {p.rights.edit && !p.coverAssetId && (
                      <div className="mt-2">
                        <AddCoverButton projectId={p.id} onChanged={changed} />
                      </div>
                    )}
                  </div>

                  <nav className="mt-4 px-3" aria-label="Project sections">
                    <ul className="space-y-0.5">
                      {visibleTabs.map((t) => {
                        const on = tab === t.key;
                        return (
                          <li key={t.key}>
                            <button
                              type="button"
                              aria-current={on ? "page" : undefined}
                              onClick={() => (setFocusItem(null), setTab(t.key))}
                              className={`flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-left text-[13px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                on ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" : "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
                              }`}
                            >
                              <t.icon className="h-4 w-4 shrink-0" aria-hidden />
                              <span className="flex-1">{t.label}</span>
                              {t.count !== undefined && t.count > 0 && <span className={`text-[11px] tabular-nums ${on ? "text-blue-700 dark:text-blue-300" : "text-slate-500 dark:text-gray-400"}`}>{t.count}</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </nav>
                  <section className="mt-5 border-t border-slate-900/[0.05] px-3 pt-4 dark:border-white/[0.06]" aria-label="Stages">
                    <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">Stages</p>
                    <StageList p={p} canMove={canMove} onStep={stepTo} />
                    {mode === "staff" && p.rights.manageAny && (
                      <p className="mt-1.5 flex items-center gap-1.5 px-2.5 text-[11px] text-slate-500 dark:text-gray-400">
                        <Wrench className="h-3 w-3" aria-hidden /> Stage changes here are logged as corrections.
                      </p>
                    )}
                  </section>

                  <section className="mb-6 mt-5 border-t border-slate-900/[0.05] px-5 pt-4 dark:border-white/[0.06]" aria-label="Details">
                    <p className="pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">Details</p>
                    <div className="space-y-3 text-[13px]">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar name={p.owner.name} src={p.owner.avatar} userId={p.owner.id} size={28} decorative />
                        <div className="min-w-0">
                          <p className="sr-only">Owner</p>
                          <p className="truncate font-semibold text-slate-800 dark:text-gray-100">{p.owner.name}</p>
                          <p className="truncate text-[11px] text-slate-500 dark:text-gray-400">
                            {TYPE_LABEL[p.owner.type] ?? "Student"}
                            {p.owner.regNumber ? ` · ${p.owner.regNumber}` : ""}
                          </p>
                        </div>
                      </div>
                      {team.length > 0 && (
                        <button type="button" onClick={() => setTab("team")} className="flex w-full items-center gap-2.5 text-left">
                          <span className="flex -space-x-2">
                            {team.slice(0, 4).map((m) => (
                              <UserAvatar key={m.id} name={m.name} userId={m.id} size={24} decorative ring />
                            ))}
                          </span>
                          <span className="text-slate-600 hover:text-slate-900 dark:text-gray-300 dark:hover:text-white">Team of {team.length + 1}</span>
                        </button>
                      )}
                      {[
                        [Briefcase, "For", p.customerDetail?.name ?? "Own initiative"],
                        [UserCheck, "Supervisor", p.supervisor?.name ?? "Not assigned"],
                        [GraduationCap, "Class", p.class ? `${p.class.name}${p.academicYear ? ` · ${p.academicYear.name}` : ""}` : p.academicYear?.name ?? "–"],
                        [CalendarRange, "Dates", `${fmtD(p.startDate)} → ${fmtD(p.targetDate)}`],
                      ].map(([Icon, label, value]) => (
                        <div key={label as string} className="flex items-start gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 dark:bg-gray-800 dark:text-gray-400">
                            {React.createElement(Icon as React.ElementType, { className: "h-3.5 w-3.5", "aria-hidden": true })}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11px] text-slate-500 dark:text-gray-400">{label as string}</p>
                            <p className="truncate font-medium text-slate-800 dark:text-gray-100">{value as string}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                </>
              )}
            </aside>

            {/* Main */}
            <main className="min-w-0 flex-1 overflow-y-auto" id="sp-workspace-main">
              {/* Small screens: identity, stages and tabs on top */}
              {p && (
                <div className="bg-white lg:hidden dark:bg-gray-900">
                  <CoverBand projectId={p.id} coverAssetId={p.coverAssetId} canEdit={p.rights.edit} onChanged={changed} />
                  <div className={`px-4 pb-3 ${p.coverAssetId ? "pt-0" : "pt-4"}`}>
                    <div className="flex items-start gap-3">
                      <EditableLogo projectId={p.id} logoAssetId={p.logoAssetId ?? null} category={p.category} accent={accent} canEdit={p.rights.edit} onChanged={changed} size={48} className={p.coverAssetId ? "-mt-8" : ""} />
                      <div className="min-w-0 flex-1 pt-1">
                        <p className="truncate text-base font-bold text-slate-900 dark:text-white">{p.title}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-gray-400">{p.owner.name}</p>
                      </div>
                    </div>
                    <div className="mt-2">{chips}</div>
                    <div className="mt-3">
                      <StageTrack p={p} canMove={canMove} onStep={stepTo} compact />
                    </div>
                  </div>
                  <nav className="no-scrollbar sticky top-0 z-20 flex gap-1 overflow-x-auto border-b border-slate-900/[0.07] bg-white px-3 dark:border-white/[0.06] dark:bg-gray-900" role="tablist" aria-label="Project sections">
                    {visibleTabs.map((t) => {
                      const on = tab === t.key;
                      return (
                        <button key={t.key} role="tab" type="button" aria-selected={on} onClick={() => (setFocusItem(null), setTab(t.key))} className={`relative flex shrink-0 items-center gap-1.5 px-2.5 py-3 text-[13px] ${on ? "font-semibold text-slate-900 dark:text-white" : "font-medium text-slate-600 dark:text-gray-300"}`}>
                          <t.icon className={`h-4 w-4 ${on ? "text-blue-600 dark:text-blue-400" : ""}`} aria-hidden />
                          {t.label}
                          {t.count !== undefined && t.count > 0 && <span className="text-[11px] tabular-nums text-slate-500 dark:text-gray-400">{t.count}</span>}
                          {on && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" aria-hidden />}
                        </button>
                      );
                    })}
                  </nav>
                </div>
              )}

              <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
                {p && current && (
                  <div className="mb-5 hidden items-end justify-between gap-3 lg:flex">
                    <div>
                      <h3 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                        <current.icon className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden /> {current.label}
                      </h3>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-gray-400">{SECTION_HINT[current.key]}</p>
                    </div>
                  </div>
                )}
                {error ? (
                  <p className="mt-10 text-center text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
                ) : !p ? (
                  <div className="space-y-3" aria-busy="true">
                    <Skeleton className="h-24" />
                    <Skeleton className="h-16" />
                    <Skeleton className="h-40" />
                  </div>
                ) : (
                  <AnimatePresence mode="wait">
                    <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-3">
                      {invited && <InviteBanner p={p} onDone={(ok) => (ok ? changed() : (onChanged(), onClose()))} />}
                      {tab === "overview" && <OverviewPanel p={p} categories={categories} onSaved={changed} staff={mode === "staff"} wide />}
                      {tab === "plan" && <WorkPanel p={p} meId={meId} onChanged={changed} wide />}
                      {tab === "documents" && <DocumentsPanel p={p} onChanged={changed} />}
                      {tab === "gallery" && <GalleryPanel p={p} onChanged={changed} />}
                      {tab === "progress" && <ProgressPanel p={p} meId={meId} onChanged={changed} wide focusItem={focusItem} />}
                      {tab === "feedback" && <FeedbackPanel p={p} meId={meId} staff={mode === "staff"} onChanged={changed} />}
                      {tab === "team" && <TeamPanel p={p} meId={meId} onChanged={changed} onLeft={() => (onChanged(), onClose())} />}
                      {tab === "timeline" && <TimelinePanel p={p} />}
                      {tab === "github" && <GitPanel p={p} meId={meId} />}
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
            </main>
          </div>
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
