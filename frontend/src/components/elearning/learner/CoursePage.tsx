import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  List,
  Lock,
  Sparkles,
  Target,
  WifiOff,
} from "lucide-react";
import {
  elearningApi,
  LearnerCourse,
  learnerRoutes,
  OpenedItem,
} from "../../../api/elearning";
import { useToast } from "../../../contexts/ToastContext";
import { useMotion } from "../../../design/motion";
import { copy } from "../copy";
import IndexDrawer from "./IndexDrawer";
import ItemView from "./ItemView";
import ReviewSheet from "./ReviewSheet";
import AITutorSheet from "./AITutorSheet";
import { useReportPosition } from "./useReportPosition";
import {
  registerLearnerServiceWorker,
  sendDeparture,
  sendOrQueue,
  useOffline,
} from "./offline";
import DownloadWeek from "./DownloadWeek";
import Mascot from "../ui/Mascot";
import {
  BottomActionBar,
  Celebration,
  CompletionDot,
  EmptyState,
  ItemTypeIcon,
  ProgressBar,
  Skeleton,
  WeekPill,
} from "../ui/primitives";
import { useLearningPrefs } from "./useLearningPrefs";

const HEARTBEAT_MS = 30_000;

/**
 * `/my-learning/courses/:courseId` (week overview) and `/…/items/:itemId` (item view).
 * Two-pane on desktop, index as a sheet on phones; ← Prev · Mark done · Next → in the thumb zone.
 * Keyboard: `[` / `]` prev/next, `d` done, `/` or `i` toggles the index.
 */
const CoursePage: React.FC = () => {
  const { courseId, itemId } = useParams<{
    courseId: string;
    itemId?: string;
  }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const m = useMotion();
  const { prefs } = useLearningPrefs();

  const [course, setCourse] = useState<LearnerCourse | null>(null);
  const [opened, setOpened] = useState<OpenedItem | null>(null);
  const [loadingItem, setLoadingItem] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  // Desktop: the week column can be folded away so a long note gets the width.
  // Remembered per device — it describes this screen, not the account.
  const [indexCollapsed, setIndexCollapsed] = useState(() => {
    try {
      return localStorage.getItem("elearning.index.collapsed") === "1";
    } catch {
      return false;
    }
  });
  const toggleIndexCollapsed = () =>
    setIndexCollapsed((v) => {
      try {
        localStorage.setItem("elearning.index.collapsed", v ? "0" : "1");
      } catch {
        /* a blocked localStorage must never break navigation */
      }
      return !v;
    });
  const [celebrate, setCelebrate] = useState<{
    title: string;
    body: string;
    nextSectionId?: number | null;
  } | null>(null);
  const [toastLine, setToastLine] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const { online, queued } = useOffline();

  useEffect(() => {
    registerLearnerServiceWorker();
  }, []);

  const cid = Number(courseId);
  const iid = itemId ? Number(itemId) : null;
  const sectionParam = search.get("section")
    ? Number(search.get("section"))
    : null;

  const loadCourse = useCallback(async () => {
    try {
      const r = await elearningApi.myCourse(cid);
      setCourse(r.data.data);
    } catch {
      setNotFound(true);
    }
  }, [cid]);

  useEffect(() => {
    loadCourse();
    // Same reason as the home screen: returning to the tab re-reads progress.
    const onVisible = () =>
      document.visibilityState === "visible" && loadCourse();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadCourse]);

  // Open an item whenever the route's itemId changes.
  useEffect(() => {
    if (!iid) {
      setOpened(null);
      return;
    }
    let cancelled = false;
    setLoadingItem(true);
    elearningApi
      .openItem(iid)
      .then((r) => {
        if (cancelled) return;
        setOpened(r.data.data);
        // A VIEW item completes on open — refresh the index dots quietly.
        if (r.data.data.just_completed) loadCourse();
      })
      .catch(() => {
        if (!cancelled) showToast("That item isn't available", "error");
      })
      .finally(() => !cancelled && setLoadingItem(false));
    window.scrollTo({ top: 0 });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iid]);

  // Live scroll position, so a teacher monitoring the class sees where in the
  // page this student actually is. Separate from the heartbeat on purpose: it
  // fires far more often and writes nothing to the database.
  useReportPosition(cid, opened && !opened.locked ? opened.item.item_id : null);

  // Heartbeat while an item is open (fire-and-forget, one call per 30 s), plus an explicit
  // departure so the teacher's "learning right now" empties the moment a student leaves
  // rather than up to a stale window later. The two cover different exits: the heartbeat
  // stops on its own, the beacon fires on the ones the student takes deliberately.
  const seconds = useRef(0);
  useEffect(() => {
    if (!opened || opened.locked) return;
    const itemId = opened.item.item_id;
    seconds.current = 0;
    const tick = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      seconds.current += HEARTBEAT_MS / 1000;
      sendOrQueue(`/elearning/my/items/${itemId}/heartbeat`, {
        seconds: HEARTBEAT_MS / 1000,
        position: { scrollY: window.scrollY },
      }).catch(() => undefined);
    }, HEARTBEAT_MS);

    const depart = () => sendDeparture(`/elearning/my/items/${itemId}/leave`);
    // Hiding the tab is a real departure here: a LINK item is *read* by leaving the tab,
    // which is exactly the case that showed a student as present after they'd gone.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") depart();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", depart);

    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", depart);
      // Navigating to another item, back to the week, or out of the course entirely.
      depart();
    };
  }, [opened]);

  const goItem = useCallback(
    (id: number) => navigate(learnerRoutes.item(cid, id)),
    [navigate, cid],
  );
  const goSection = useCallback(
    (sid: number) => {
      setIndexOpen(false);
      navigate(learnerRoutes.course(cid, sid));
    },
    [navigate, cid],
  );

  const markDone = useCallback(async () => {
    if (!opened || marking) return;
    setMarking(true);
    // Optimistic: flip the dot now, roll back on failure.
    const before = opened;
    setOpened({ ...opened, item: { ...opened.item, state: "COMPLETED" } });
    try {
      if (!online) {
        // Queued for replay when the connection returns; the optimistic tick stays.
        await sendOrQueue(`/elearning/my/items/${opened.item.item_id}/done`);
        setToastLine(copy.errors.offline);
        setTimeout(() => setToastLine(null), 3000);
        return;
      }
      const r = await elearningApi.markDone(opened.item.item_id);
      const d = r.data.data;
      await loadCourse();
      if (d.section_just_completed && prefs.celebrations_enabled) {
        const week = d.section.title.split(" — ")[0];
        const crit = d.section.criteria.map((c) => c.criteria_number);
        const nextSection = course?.sections.find(
          (s) =>
            s.position >
              (course.sections.find(
                (x) => x.section_id === d.section.section_id,
              )?.position ?? -1) && s.state !== "locked",
        );
        setCelebrate({
          title: copy.course.weekComplete(week, crit),
          body: "",
          nextSectionId: nextSection?.section_id ?? null,
        });
      } else if (d.just_completed) {
        setToastLine(
          opened.next
            ? copy.course.doneWithNext(opened.next.title)
            : copy.course.doneLast,
        );
        setTimeout(() => setToastLine(null), 3000);
      }
    } catch (e: any) {
      setOpened(before);
      showToast(e?.response?.data?.message || copy.errors.save, "error");
    } finally {
      setMarking(false);
    }
  }, [
    opened,
    marking,
    loadCourse,
    prefs.celebrations_enabled,
    course,
    showToast,
    online,
  ]);

  // Keyboard ergonomics (desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "]" && opened?.next && !opened.next.locked)
        goItem(opened.next.item_id);
      else if (e.key === "[" && opened?.prev) goItem(opened.prev.item_id);
      else if (
        e.key === "d" &&
        opened &&
        opened.item.completion_rule === "MARK_DONE" &&
        opened.item.state !== "COMPLETED"
      )
        markDone();
      else if (e.key === "i") setIndexOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opened, goItem, markDone]);

  if (notFound) {
    return (
      <EmptyState
        pose="thinking"
        title="This course isn't available to you."
        action={{
          label: copy.course.backHome,
          onClick: () => navigate(learnerRoutes.home),
        }}
      />
    );
  }
  if (!course) {
    return (
      <div className="flex gap-4">
        <Skeleton className="hidden lg:block w-[320px] h-[70vh]" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  const activeSection = opened
    ? opened.section.section_id
    : sectionParam ||
      course.sections.find((s) => s.is_current_week)?.section_id ||
      course.sections[0]?.section_id ||
      null;
  const overviewSection =
    course.sections.find((s) => s.section_id === activeSection) || null;
  const canMarkDone =
    opened && !opened.locked && opened.item.completion_rule === "MARK_DONE";
  const isDone = opened?.item.state === "COMPLETED";

  return (
    <div className="-mx-4 md:-mx-6 flex min-h-[calc(100vh-4rem)]">
      <IndexDrawer
        course={course}
        activeItemId={iid}
        activeSectionId={activeSection}
        onOpenItem={(id) => {
          setIndexOpen(false);
          goItem(id);
        }}
        onOpenSection={goSection}
        open={indexOpen}
        onClose={() => setIndexOpen(false)}
        collapsed={indexCollapsed}
        onToggleCollapsed={toggleIndexCollapsed}
      />

      {/* The reader used to start flush against the app bar, so the title had
          no air above it. */}
      <main className="min-w-0 flex-1 pt-4 md:pt-6">
        {(!online || queued > 0) && (
          <div
            className="mx-4 mt-5 flex items-center gap-2 px-3 py-2 rounded-xl el-chip-warning text-xs"
            role="status"
          >
            <WifiOff className="w-4 h-4" />{" "}
            {!online
              ? copy.errors.offline
              : `Back online — syncing ${queued} saved action${queued === 1 ? "" : "s"}…`}
          </div>
        )}
        {/* Slim top bar (phone: index toggle; everyone: back to home) */}
        {!opened && (
          <div className="flex items-center gap-2 px-4 pt-5">
            <button
              onClick={() => navigate(learnerRoutes.home)}
              className="inline-flex items-center gap-1 min-h-[40px] px-2 rounded-lg text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
            >
              <ArrowLeft className="w-4 h-4" />{" "}
              <span className="hidden sm:inline">{copy.home.title}</span>
            </button>
            <button
              onClick={() => setIndexOpen(true)}
              className="lg:hidden inline-flex items-center gap-1 min-h-[40px] px-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
              aria-label={copy.course.index}
            >
              <List className="w-4 h-4" /> {copy.course.index}
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {opened ? (
            <motion.div key={opened.item.item_id} {...m("reveal")}>
              {loadingItem && (
                <div className="h-0.5 bg-brand-500 animate-pulse" />
              )}
              <ItemView
                opened={opened}
                onBack={() =>
                  navigate(learnerRoutes.course(cid, opened.section.section_id))
                }
                onNext={
                  opened.next && !opened.next.locked
                    ? () => goItem(opened.next!.item_id)
                    : undefined
                }
                step={(() => {
                  // "Step 2 of 5" — headers aren't steps, so they don't count.
                  const steps = (
                    course?.sections.find(
                      (s) => s.section_id === opened.section.section_id,
                    )?.items || []
                  ).filter((i) => i.item_type !== "HEADER");
                  const index = steps.findIndex(
                    (i) => i.item_id === opened.item.item_id,
                  );
                  return index >= 0
                    ? { index: index + 1, total: steps.length }
                    : undefined;
                })()}
                onAskAI={() => setTutorOpen(true)}
                onChecked={(r) => {
                  loadCourse();
                  if (r.just_completed) setToastLine(copy.course.doneLast);
                }}
              />
            </motion.div>
          ) : loadingItem ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-64" />
            </div>
          ) : overviewSection ? (
            <motion.section
              key={overviewSection.section_id}
              {...m("reveal")}
              className="mx-auto max-w-3xl px-4 sm:px-6 py-6 pb-28"
            >
              <WeekPill
                weekNumber={
                  overviewSection.week_number ||
                  overviewSection.title.split(" — ")[0]
                }
                startDate={overviewSection.start_date}
                endDate={overviewSection.end_date}
                current={overviewSection.is_current_week}
              />
              <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white leading-tight">
                {overviewSection.title.split(" — ").slice(1).join(" — ") ||
                  overviewSection.title}
              </h1>
              {overviewSection.summary && (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">
                  {overviewSection.summary}
                </p>
              )}
              <DownloadWeek sectionId={overviewSection.section_id} />
              <div className="mt-4 flex items-end gap-3">
                <div className="flex-1">
                  <ProgressBar
                    value={
                      overviewSection.required_total
                        ? (overviewSection.required_done /
                            overviewSection.required_total) *
                          100
                        : overviewSection.state === "completed"
                          ? 100
                          : 0
                    }
                    color={
                      course.course.cover_color ||
                      course.subject.color ||
                      undefined
                    }
                  />
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                    {overviewSection.required_done ===
                      overviewSection.required_total &&
                    overviewSection.required_total > 0
                      ? "Week complete"
                      : `${overviewSection.required_done} of ${overviewSection.required_total} done`}
                  </p>
                </div>
                {overviewSection.state !== "locked" &&
                  overviewSection.items.some(
                    (i) =>
                      ["LESSON_NOTE", "PAGE"].includes(i.item_type) &&
                      !i.locked,
                  ) && (
                    <button
                      onClick={() => setReviewing(true)}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill el-chip text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-white/[0.10]"
                    >
                      <Layers className="w-4 h-4" /> Review
                    </button>
                  )}
              </div>
              {/* What this week is for — one line, expandable. Progressive disclosure over a panel. */}
              {overviewSection.criteria_progress.length > 0 &&
                (() => {
                  const done = overviewSection.criteria_progress.filter(
                    (c) => c.state === "COMPLETED",
                  ).length;
                  const total = overviewSection.criteria_progress.length;
                  return (
                    <details className="mt-4 group">
                      <summary className="flex items-center gap-2 cursor-pointer list-none min-h-[44px] text-sm text-gray-600 dark:text-gray-300">
                        <Target className="w-4 h-4 text-brand-500 flex-shrink-0" />
                        <span className="flex-1">
                          {done === total
                            ? "You can do everything this week asks"
                            : `What you'll be able to do · ${done} of ${total}`}
                        </span>
                        <ChevronDown className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" />
                      </summary>
                      <ul className="mt-2 space-y-1.5 pl-6">
                        {overviewSection.criteria_progress.map((c) => (
                          <li
                            key={c.criteria_id}
                            className="flex items-start gap-2 text-sm"
                          >
                            <CompletionDot
                              state={c.state}
                              size={16}
                              className="mt-0.5"
                            />
                            <span
                              className={
                                c.state === "COMPLETED"
                                  ? "text-gray-400 line-through decoration-gray-300"
                                  : "text-gray-700 dark:text-gray-200"
                              }
                            >
                              {c.description}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  );
                })()}

              {overviewSection.state === "locked" ? (
                <div className="mt-6 flex items-center gap-3 p-4 rounded-2xl el-subtle">
                  <Lock className="w-5 h-5 text-gray-400" />
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {copy.course.lockedBody(overviewSection.lock_reason)}
                  </p>
                </div>
              ) : overviewSection.items.length === 0 ? (
                <div className="mt-6">
                  <EmptyState pose="sleepy" title={copy.course.emptyStudent} />
                </div>
              ) : (
                <ol className="mt-6 relative" aria-label="Learning journey">
                  {/* The journey line — items are steps, in the order the teacher set */}
                  <span
                    className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-gray-200 dark:bg-white/[0.08]"
                    aria-hidden
                  />
                  {overviewSection.items.map((i, idx) =>
                    i.item_type === "HEADER" ? (
                      <li
                        key={i.item_id}
                        className="relative pl-12 pt-4 pb-1 text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                      >
                        {i.title}
                      </li>
                    ) : (
                      <li key={i.item_id} className="relative py-1">
                        <span
                          className={`absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ring-4 ring-gray-50 dark:ring-gray-950 ${i.state === "COMPLETED" ? "bg-success-500 text-white" : i.state === "IN_PROGRESS" ? "bg-brand-500 text-white" : "bg-white dark:bg-gray-900 border-2 border-gray-300 dark:border-white/20 text-gray-500"}`}
                          aria-hidden
                        >
                          {i.state === "COMPLETED"
                            ? "✓"
                            : overviewSection.items
                                .slice(0, idx)
                                .filter((x) => x.item_type !== "HEADER")
                                .length + 1}
                        </span>
                        <motion.button
                          {...m("tap")}
                          disabled={i.locked}
                          onClick={() => goItem(i.item_id)}
                          className={`ml-12 w-[calc(100%-3rem)] flex items-center gap-3 p-3 el-card el-card-hover text-left min-h-[56px] disabled:opacity-60 focus:outline-none focus-visible:shadow-glow ${i.state === "IN_PROGRESS" ? "border-brand-300 dark:border-brand-700" : "border-gray-200 dark:border-white/[0.07] hover:border-brand-200 dark:hover:border-brand-700"}`}
                          style={{
                            marginLeft: `calc(3rem + ${i.indent * 16}px)`,
                          }}
                        >
                          <CompletionDot
                            state={i.state}
                            locked={i.locked}
                            size={20}
                            className="sr-only"
                          />
                          <span className="w-9 h-9 rounded-xl el-subtle flex items-center justify-center text-gray-500 dark:text-gray-300 flex-shrink-0">
                            <ItemTypeIcon
                              type={i.item_type}
                              className="w-4 h-4"
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                              {i.title}
                            </span>
                            <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                              {copy.builder.itemTypes[i.item_type]}
                              {i.estimated_minutes
                                ? ` · ${copy.course.minutes(i.estimated_minutes)}`
                                : ""}
                              {i.due_at
                                ? ` · due ${new Date(i.due_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                                : ""}
                              {!i.is_required ? " · optional" : ""}
                            </span>
                          </span>
                          {i.criteria.length > 0 && (
                            <span className="hidden sm:flex flex-wrap gap-1 max-w-[140px] justify-end">
                              {i.criteria.slice(0, 3).map((c) => (
                                <span
                                  key={c.criteria_id}
                                  title={c.description}
                                  className="text-[10px] px-1.5 py-0.5 rounded-pill el-chip-brand"
                                >
                                  {c.criteria_number}
                                </span>
                              ))}
                            </span>
                          )}
                          <ChevronRight className="w-4 h-4 text-gray-300" />
                        </motion.button>
                      </li>
                    ),
                  )}
                </ol>
              )}
            </motion.section>
          ) : (
            <EmptyState pose="sleepy" title={copy.course.emptyCourse} />
          )}
        </AnimatePresence>
      </main>

      {/* Bottom action bar — only while an item is open */}
      {opened && !opened.locked && (
        <BottomActionBar>
          <button
            onClick={() => setIndexOpen(true)}
            className="lg:hidden w-11 h-11 flex items-center justify-center rounded-pill text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
            aria-label={copy.course.index}
          >
            <List className="w-5 h-5" />
          </button>
          <button
            onClick={() => opened.prev && goItem(opened.prev.item_id)}
            disabled={!opened.prev}
            className="w-11 h-11 flex items-center justify-center rounded-pill text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-30"
            aria-label={copy.course.prev}
            title={`${copy.course.prev} ([)`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          {canMarkDone ? (
            <motion.button
              {...m("tap")}
              onClick={markDone}
              disabled={isDone || marking}
              className={`min-h-[44px] px-5 rounded-pill text-sm font-semibold inline-flex items-center gap-1.5 focus:outline-none focus-visible:shadow-glow ${
                isDone
                  ? "el-chip-success"
                  : "bg-brand-500 hover:bg-brand-600 text-white shadow-soft"
              }`}
              title="Mark as done (d)"
            >
              <Check className="w-4 h-4" />{" "}
              {isDone ? copy.course.done : copy.course.markDone}
            </motion.button>
          ) : (
            <span
              className={`min-h-[44px] px-4 inline-flex items-center gap-1.5 text-sm font-medium ${isDone ? "text-success-700 dark:text-success-500" : "text-gray-500 dark:text-gray-400"}`}
            >
              {isDone ? (
                <>
                  <Check className="w-4 h-4" /> {copy.course.done}
                </>
              ) : (
                <CompletionDot state={opened.item.state} size={14} />
              )}
            </span>
          )}
          <button
            onClick={() =>
              opened.next && !opened.next.locked && goItem(opened.next.item_id)
            }
            disabled={!opened.next || opened.next.locked}
            className="w-11 h-11 flex items-center justify-center rounded-pill text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-30"
            aria-label={copy.course.next}
            title={`${copy.course.next} (])`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </BottomActionBar>
      )}

      {/* AI tutor — one floating entry point, never blocks content */}
      {!tutorOpen && (
        <button
          onClick={() => setTutorOpen(true)}
          className="fixed z-30 right-4 bottom-20 lg:bottom-6 w-12 h-12 rounded-pill bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-float flex items-center justify-center focus:outline-none focus-visible:shadow-glow"
          aria-label="Ask the AI tutor"
          title="Ask the AI tutor"
        >
          <Sparkles className="w-5 h-5" />
        </button>
      )}
      <AITutorSheet
        courseId={cid}
        sectionId={activeSection}
        open={tutorOpen}
        onClose={() => setTutorOpen(false)}
      />

      {/* Quiet done line */}
      <AnimatePresence>
        {toastLine && (
          <motion.div
            {...m("reveal")}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-pill bg-gray-900 text-white text-sm shadow-float"
            role="status"
          >
            {toastLine}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reviewing && overviewSection && (
          <ReviewSheet
            section={overviewSection}
            onClose={() => setReviewing(false)}
          />
        )}
      </AnimatePresence>

      {/* Week complete celebration */}
      <Celebration show={!!celebrate} />
      <AnimatePresence>
        {celebrate && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCelebrate(null)}
          >
            <motion.div
              initial={{ y: 24, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Week complete"
              className="w-full max-w-sm rounded-3xl el-float p-6 text-center"
            >
              <Mascot pose="cheering" size={80} />
              <p className="mt-3 text-base font-semibold text-gray-900 dark:text-white">
                {celebrate.title}
              </p>
              <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
                {celebrate.nextSectionId && (
                  <button
                    onClick={() => {
                      setCelebrate(null);
                      goSection(celebrate.nextSectionId!);
                    }}
                    className="min-h-[44px] px-5 rounded-pill bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-soft"
                  >
                    {copy.course.nextWeek}
                  </button>
                )}
                <button
                  onClick={() => {
                    setCelebrate(null);
                    navigate(learnerRoutes.home);
                  }}
                  className="min-h-[44px] px-5 rounded-pill el-chip text-sm font-medium text-gray-700 dark:text-gray-200"
                >
                  {copy.course.backHome}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CoursePage;
