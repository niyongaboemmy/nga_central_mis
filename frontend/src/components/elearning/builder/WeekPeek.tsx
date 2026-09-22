import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Check, CircleDashed, Eye, EyeOff, Clock } from "lucide-react";
import type { CourseSection } from "../../../api/elearning";
import { ItemTypeIcon } from "../ui/primitives";
import { useMotion } from "../../../design/motion";

/**
 * Hover (or focus) a week and see what's actually in it without leaving the week you're
 * editing — dates, what it teaches, and the items in order. Pointer-only: it never appears
 * on touch, where a tap already opens the week, and it follows the row vertically so it
 * always stays on screen.
 */
const WeekPeek: React.FC<{ section: CourseSection | null; anchor: DOMRect | null }> = ({ section, anchor }) => {
  const m = useMotion();
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!section || !anchor) return null;

  const PANEL_W = 300;
  const estimated = 120 + Math.min(section.items.length, 5) * 30 + (section.criteria.length ? 40 : 0);
  // Prefer the right of the row; flip to the left when there's no room (narrow laptops).
  const left = anchor.right + 12 + PANEL_W > viewport.w ? Math.max(12, anchor.left - PANEL_W - 12) : anchor.right + 12;
  const top = Math.min(Math.max(12, anchor.top - 8), Math.max(12, viewport.h - estimated - 12));

  const fmt = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");
  const topic = section.title.split(" — ").slice(1).join(" — ");
  const covered = new Set(section.items.flatMap((i) => i.criteria.map((c) => c.criteria_id)));
  const state =
    section.status === "PUBLISHED"
      ? { Icon: Eye, label: "Live for students", cls: "text-success-600" }
      : section.status === "HIDDEN"
        ? { Icon: EyeOff, label: "Skipped", cls: "text-gray-400" }
        : { Icon: Clock, label: "Not live yet", cls: "text-gray-400" };

  return (
    <AnimatePresence>
      <motion.aside
        key={section.section_id}
        {...m("fade")}
        style={{ left, top, width: PANEL_W }}
        className="hidden md:block fixed z-50 rounded-2xl el-float p-3.5 pointer-events-none"
        role="tooltip"
      >
        <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5" />
          {section.week_number}
          {section.start_date && <span className="font-normal normal-case tracking-normal text-gray-400">· {fmt(section.start_date)} – {fmt(section.end_date)}</span>}
        </p>
        <p className={`mt-1 text-sm font-semibold leading-snug ${topic ? "text-gray-900 dark:text-white" : "text-gray-400 italic"}`}>
          {topic || "No topic in the scheme yet"}
        </p>
        <p className={`mt-1 text-[11px] flex items-center gap-1.5 ${state.cls}`}>
          <state.Icon className="w-3.5 h-3.5" /> {state.label}
        </p>

        {section.criteria.length > 0 && (
          <>
            <p className="mt-3 text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
              Teaches{section.element_number ? ` · Element ${section.element_number}` : ""}
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {section.criteria.map((c) => (
                <li
                  key={c.criteria_id}
                  className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-pill font-medium ${
                    covered.has(c.criteria_id) ? "bg-success-100/70 dark:bg-success-700/15 text-success-700" : "bg-warning-100/70 dark:bg-warning-700/15 text-warning-700"
                  }`}
                >
                  {covered.has(c.criteria_id) ? <Check className="w-2.5 h-2.5" /> : <CircleDashed className="w-2.5 h-2.5" />}
                  {c.criteria_number}
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-3 text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
          {section.items.length ? `${section.items.length} item${section.items.length === 1 ? "" : "s"}` : "Nothing in this week yet"}
        </p>
        {section.items.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {section.items.slice(0, 5).map((i) => (
              <li key={i.item_id} className="flex items-center gap-2 text-[12px] text-gray-700 dark:text-gray-200">
                <ItemTypeIcon type={i.item_type} className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="truncate">{i.title}</span>
              </li>
            ))}
            {section.items.length > 5 && <li className="text-[11px] text-gray-400 pl-5.5">+ {section.items.length - 5} more</li>}
          </ul>
        )}
      </motion.aside>
    </AnimatePresence>
  );
};

export default WeekPeek;
