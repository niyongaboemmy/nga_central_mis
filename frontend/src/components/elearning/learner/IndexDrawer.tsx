import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Hourglass, Lock, X } from "lucide-react";
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
}

/**
 * Moodle-4-style course index: weeks with completion dots. The current week is expanded,
 * others collapsed (progressive disclosure); today's section scrolls into view on mount.
 */
const fmtRange = (a: string | null, b: string | null) => {
  if (!a) return "";
  const d = (x: string) => new Date(`${x}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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
}> = ({ s, isOpen, activeItemId, activeSectionId, toggle, onOpenItem, onOpenSection }) => {
  const pct = s.required_total ? Math.round((s.required_done / s.required_total) * 100) : s.state === "completed" ? 100 : 0;
  const done = s.state === "completed";
  const active = activeSectionId === s.section_id;
  const topic = s.title.split(" — ").slice(1).join(" — ") || s.title;
  return (
    <li data-section={s.section_id}>
      <div
        className={`relative flex items-center gap-1 pl-1 pr-2 py-1.5 rounded-xl min-h-[52px] transition-colors ${
          active ? "bg-brand-50 dark:bg-brand-500/[0.12]" : "hover:bg-gray-50 dark:hover:bg-white/[0.04]"
        }`}
      >
        {/* The current week gets a rail, not a filled pill that swallows the row */}
        {s.is_current_week && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-pill bg-brand-500" aria-hidden />}
        <button
          onClick={() => toggle(s.section_id)}
          aria-expanded={isOpen}
          aria-label={`${isOpen ? "Collapse" : "Expand"} ${s.title}`}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex-shrink-0"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
        </button>
        <button onClick={() => onOpenSection(s.section_id)} className="min-w-0 flex-1 text-left py-0.5">
          <span className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[13px] font-semibold ${active || s.is_current_week ? "text-brand-700 dark:text-brand-200" : "text-gray-900 dark:text-white"}`}>
              {s.week_number || s.title.split(" — ")[0]}
            </span>
            {s.is_current_week && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-pill bg-brand-500 text-white">Now</span>}
            {s.state === "locked" && <Lock className="w-3 h-3 text-gray-400" aria-label={copy.course.locked} />}
            <span className="text-[11px] text-gray-400 truncate">{fmtRange(s.start_date, s.end_date)}</span>
          </span>
          <span className="block text-[13px] text-gray-600 dark:text-gray-300 truncate mt-0.5">{topic}</span>
        </button>
        {/* Progress, not an ambiguous empty circle: a tick when the week is done, else x/y */}
        {done ? (
          <span className="w-7 h-7 rounded-full bg-success-500 text-white flex items-center justify-center flex-shrink-0" aria-label="Week complete">
            <Check className="w-4 h-4" strokeWidth={3} />
          </span>
        ) : s.required_total > 0 ? (
          <ProgressRing
            value={pct}
            size={30}
            stroke={3}
            label={<span className="text-[9px] font-semibold">{s.required_done}/{s.required_total}</span>}
            ariaLabel={`${s.title}: ${s.required_done} of ${s.required_total} done`}
          />
        ) : (
          <span className="text-[11px] text-gray-400 tabular-nums flex-shrink-0">{s.items.length || ""}</span>
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
                <li key={i.item_id} className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-gray-400">
                  {i.title}
                </li>
              ) : (
                <li key={i.item_id}>
                  <button
                    onClick={() => !i.locked && onOpenItem(i.item_id)}
                    disabled={i.locked}
                    aria-current={activeItemId === i.item_id ? "page" : undefined}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 my-0.5 rounded-lg text-left min-h-[44px] transition-colors ${
                      activeItemId === i.item_id
                        ? "el-chip-brand font-medium"
                        : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
                    } disabled:opacity-50`}
                    style={{ paddingLeft: `${10 + i.indent * 12}px` }}
                  >
                    <CompletionDot state={i.state} locked={i.locked} size={16} />
                    <ItemTypeIcon type={i.item_type} className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className={`text-[13px] truncate flex-1 ${i.state === "COMPLETED" ? "text-gray-400" : ""}`}>{i.title}</span>
                    {i.estimated_minutes ? <span className="text-[10px] text-gray-400 tabular-nums flex-shrink-0">{i.estimated_minutes}m</span> : null}
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

const IndexDrawer: React.FC<Props> = ({ course, activeItemId, activeSectionId, onOpenItem, onOpenSection, open, onClose }) => {
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
    const target = activeSectionId || course.sections.find((x) => x.is_current_week)?.section_id;
    if (!target) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-section="${target}"]`);
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
          color={course.summary.percent === 100 ? "#22c55e" : course.course.cover_color || course.subject.color || undefined}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{course.subject.name}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
            {course.summary.required_done}/{course.summary.required_total} done
            {course.summary.criteria_total > 0 && (
              <>
                {" · "}
                <span title="Performance criteria you have covered">
                  {course.summary.criteria_covered}/{course.summary.criteria_total} skills
                </span>
              </>
            )}
          </p>
          {course.teacher.name && <p className="text-[11px] text-gray-400 truncate">{course.teacher.name}</p>}
        </div>
        <button onClick={onClose} className="lg:hidden w-10 h-10 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]" aria-label="Close index">
          <X className="w-4 h-4" />
        </button>
      </div>
      <nav aria-label={copy.course.index} className="flex-1 overflow-y-auto p-2">
        {course.sections.length === 0 ? (
          <p className="p-4 text-sm text-gray-500 dark:text-gray-400">{copy.course.emptyCourse}</p>
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
      {/* Desktop: persistent column */}
      <aside className="hidden lg:block w-[300px] xl:w-[340px] flex-shrink-0 sticky top-16 h-[calc(100vh-4rem)] border-r border-gray-200/70 dark:border-gray-800 bg-white/70 dark:bg-black/40 backdrop-blur-sm">
        {body}
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
