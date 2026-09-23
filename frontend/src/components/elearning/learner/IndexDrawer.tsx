import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  Hourglass,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import type { LearnerCourse, LearnerSection } from "../../../api/elearning";
import { copy } from "../copy";
import { CompletionDot, ItemTypeIcon, ProgressRing } from "../ui/primitives";

interface Props {
  course: LearnerCourse;
  activeItemId: number | null;
  activeSectionId: number | null;
  onOpenItem: (itemId: number) => void;
  onOpenSection: (sectionId: number) => void;
  /** Phone: drawer is a sheet; desktop: persistent column. */
  open: boolean;
  onClose: () => void;
  /** Desktop only — the column collapses to a rail so the reader gets the width. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

/**
 * Moodle-4-style course index: weeks with completion dots. The current week is expanded,
 * others collapsed (progressive disclosure); today's section scrolls into view on mount.
 */
const fmtRange = (a: string | null, b: string | null) => {
  if (!a) return "";
  const d = (x: string) =>
    new Date(`${x}T00:00:00`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
  return b && b !== a ? `${d(a)} – ${d(b)}` : d(a);
};

const SectionRow: React.FC<{
  s: LearnerSection;
  isOpen: boolean;
  activeItemId: number | null;
  activeSectionId: number | null;
  toggle: (id: number) => void;
  onOpenItem: (id: number) => void;
  onOpenSection: (id: number) => void;
}> = ({
  s,
  isOpen,
  activeItemId,
  activeSectionId,
  toggle,
  onOpenItem,
  onOpenSection,
}) => {
  const pct = s.required_total
    ? Math.round((s.required_done / s.required_total) * 100)
    : s.state === "completed"
      ? 100
      : 0;
  const done = s.state === "completed";
  const active = activeSectionId === s.section_id;
  const topic = s.title.split(" — ").slice(1).join(" — ") || s.title;
  return (
    <li data-section={s.section_id}>
      <div
        className={`relative flex items-center gap-1 pl-1 pr-2 py-1 rounded-xl min-h-[40px] transition-colors ${
          active
            ? "bg-brand-50 dark:bg-brand-500/[0.12]"
            : "hover:bg-gray-50 dark:hover:bg-white/[0.04]"
        }`}
      >
        {/* The current week gets a rail, not a filled pill that swallows the row */}
        {s.is_current_week && (
          <span
            className="absolute left-0 top-2 bottom-2 w-[3px] rounded-pill bg-brand-500"
            aria-hidden
          />
        )}
        <button
          onClick={() => toggle(s.section_id)}
          aria-expanded={isOpen}
          aria-label={`${isOpen ? "Collapse" : "Expand"} ${s.title}`}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex-shrink-0"
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform ${isOpen ? "" : "-rotate-90"}`}
          />
        </button>
        <button
          onClick={() => onOpenSection(s.section_id)}
          className="min-w-0 flex-1 text-left py-0.5"
        >
          {/* The week number, its dates and its state used to take a line each.
              The topic is what a student is looking for, so it leads; the rest
              is one quiet line under it. */}
          <span className="flex items-baseline gap-1.5">
            <span
              className={`text-[13px] font-semibold truncate ${
                done
                  ? "text-gray-400 dark:text-gray-500"
                  : active || s.is_current_week
                    ? "text-brand-700 dark:text-brand-200"
                    : "text-gray-900 dark:text-white"
              }`}
            >
              {topic}
            </span>
            {s.state === "locked" && (
              <Lock
                className="w-3 h-3 flex-shrink-0 text-gray-400"
                aria-label={copy.course.locked}
              />
            )}
          </span>
          <span className="mt-px flex items-center gap-1.5 text-[11px] text-gray-400">
            <span className="flex-shrink-0">
              {s.week_number || s.title.split(" — ")[0]}
            </span>
            {s.is_current_week && (
              <span className="flex-shrink-0 rounded-pill bg-brand-500 px-1.5 text-[9px] font-bold uppercase tracking-wide text-white">
                Now
              </span>
            )}
            <span className="truncate">
              {fmtRange(s.start_date, s.end_date)}
            </span>
          </span>
        </button>
        {/* One signal per week. A filled ring beside a column of filled item
            dots read as two competing checklists; a done week is a small tick,
            an open one is its count with a hairline meter under the row. */}
        {done ? (
          <Check
            className="w-4 h-4 flex-shrink-0 text-success-500"
            strokeWidth={3}
            aria-label="Week complete"
          />
        ) : s.required_total > 0 ? (
          <span
            className="flex-shrink-0 text-[11px] font-medium tabular-nums text-gray-500 dark:text-gray-400"
            aria-label={`${s.title}: ${s.required_done} of ${s.required_total} done`}
          >
            {s.required_done}/{s.required_total}
          </span>
        ) : (
          <span className="text-[11px] text-gray-400 tabular-nums flex-shrink-0">
            {s.items.length || ""}
          </span>
        )}
        {!done && s.required_total > 0 && pct > 0 && (
          <span
            className="pointer-events-none absolute bottom-0 left-8 right-2 h-px overflow-hidden rounded-pill bg-gray-200 dark:bg-white/[0.08]"
            aria-hidden
          >
            <span
              className="block h-full rounded-pill bg-brand-500"
              style={{ width: `${pct}%` }}
            />
          </span>
        )}
      </div>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden ml-[18px] pl-3 border-l border-gray-200 dark:border-white/[0.08]"
          >
            {s.items.length === 0 && (
              <li className="px-3 py-3 text-xs text-gray-400 flex items-start gap-2">
                <Hourglass className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>{copy.course.emptyStudent}</span>
              </li>
            )}
            {s.items.map((i) =>
              i.item_type === "HEADER" ? (
                <li
                  key={i.item_id}
                  className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-gray-400"
                >
                  {i.title}
                </li>
              ) : (
                <li key={i.item_id}>
                  <button
                    onClick={() => !i.locked && onOpenItem(i.item_id)}
                    disabled={i.locked}
                    aria-current={
                      activeItemId === i.item_id ? "page" : undefined
                    }
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 my-px rounded-lg text-left min-h-[36px] transition-colors ${
                      activeItemId === i.item_id
                        ? "el-chip-brand font-medium"
                        : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
                    } disabled:opacity-50`}
                    style={{ paddingLeft: `${10 + i.indent * 12}px` }}
                  >
                    <CompletionDot
                      state={i.state}
                      locked={i.locked}
                      size={14}
                    />
                    <ItemTypeIcon
                      type={i.item_type}
                      className="w-3.5 h-3.5 text-gray-400 flex-shrink-0"
                    />
                    <span
                      className={`text-[13px] truncate flex-1 ${i.state === "COMPLETED" ? "text-gray-400" : ""}`}
                    >
                      {i.title}
                    </span>
                    {i.estimated_minutes ? (
                      <span className="text-[10px] text-gray-400 tabular-nums flex-shrink-0">
                        {i.estimated_minutes}m
                      </span>
                    ) : null}
                  </button>
                </li>
              ),
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
};

const IndexDrawer: React.FC<Props> = ({
  course,
  activeItemId,
  activeSectionId,
  onOpenItem,
  onOpenSection,
  open,
  onClose,
  collapsed = false,
  onToggleCollapsed,
}) => {
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    const s = new Set<number>();
    const current = course.sections.find((x) => x.is_current_week);
    if (current) s.add(current.section_id);
    if (activeSectionId) s.add(activeSectionId);
    return s;
  });
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeSectionId) setExpanded((e) => new Set(e).add(activeSectionId));
  }, [activeSectionId]);

  useEffect(() => {
    const target =
      activeSectionId ||
      course.sections.find((x) => x.is_current_week)?.section_id;
    if (!target) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-section="${target}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id: number) =>
    setExpanded((e) => {
      const n = new Set(e);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const body = (
    <div ref={listRef} className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-3 border-b border-gray-200/70 dark:border-white/[0.06]">
        <ProgressRing
          value={course.summary.percent}
          size={44}
          stroke={4}
          color={
            course.summary.percent === 100
              ? "#22c55e"
              : course.course.cover_color || course.subject.color || undefined
          }
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {course.subject.name}
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
            {course.summary.required_done}/{course.summary.required_total} done
            {course.summary.criteria_total > 0 && (
              <>
                {" · "}
                <span title="Performance criteria you have covered">
                  {course.summary.criteria_covered}/
                  {course.summary.criteria_total} skills
                </span>
              </>
            )}
          </p>
          {course.teacher.name && (
            <p className="text-[11px] text-gray-400 truncate">
              {course.teacher.name}
            </p>
          )}
        </div>
        {onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            aria-label="Hide the week list"
            title="Hide the week list"
            className="hidden lg:flex w-8 h-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={onClose}
          className="lg:hidden w-10 h-10 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
          aria-label="Close index"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <nav
        aria-label={copy.course.index}
        className="flex-1 overflow-y-auto p-2"
      >
        {course.sections.length === 0 ? (
          <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
            {copy.course.emptyCourse}
          </p>
        ) : (
          <ul className="space-y-1">
            {course.sections.map((s) => (
              <SectionRow
                key={s.section_id}
                s={s}
                isOpen={expanded.has(s.section_id)}
                activeItemId={activeItemId}
                activeSectionId={activeSectionId}
                toggle={toggle}
                onOpenItem={onOpenItem}
                onOpenSection={onOpenSection}
              />
            ))}
          </ul>
        )}
      </nav>
    </div>
  );

  return (
    <>
      {/* Desktop: a persistent column that collapses to a rail. A long note is
          easier to read wide, and the week list is navigation the student only
          needs between items — so it gets out of the way on request and the
          choice is remembered. */}
      <aside
        className={`hidden lg:block flex-shrink-0 sticky top-16 h-[calc(100vh-4rem)] border-r border-gray-200/70 dark:border-gray-800 bg-white/70 dark:bg-black/40 backdrop-blur-sm transition-[width] duration-300 ${
          collapsed ? "w-12 overflow-hidden" : "w-[300px] xl:w-[340px]"
        }`}
      >
        {collapsed ? (
          <div className="flex h-full flex-col items-center gap-3 pt-3">
            <button
              onClick={onToggleCollapsed}
              aria-label="Show the week list"
              title="Show the week list"
              aria-expanded={false}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
            <ProgressRing
              value={course.summary.percent}
              size={30}
              stroke={3}
              color={
                course.summary.percent === 100
                  ? "#22c55e"
                  : course.course.cover_color ||
                    course.subject.color ||
                    undefined
              }
              ariaLabel={`${course.summary.percent}% of this course complete`}
            />
            {/* The label stays readable sideways rather than disappearing. */}
            <span
              className="mt-1 text-[10px] uppercase tracking-wider text-gray-400"
              style={{ writingMode: "vertical-rl" }}
            >
              {copy.course.index}
            </span>
          </div>
        ) : (
          body
        )}
      </aside>
      {/* Phone / tablet: sheet */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="lg:hidden fixed inset-0 z-40 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.aside
              className="lg:hidden fixed top-16 bottom-0 left-0 z-50 w-[85vw] max-w-[360px] bg-white dark:bg-gray-950 shadow-float"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0.4, right: 0 }}
              onDragEnd={(_, info) => info.offset.x < -80 && onClose()}
              role="dialog"
              aria-label={copy.course.index}
            >
              {body}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default IndexDrawer;
