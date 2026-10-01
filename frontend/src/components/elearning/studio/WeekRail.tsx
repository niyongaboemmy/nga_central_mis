import React from "react";
import { Check, Target } from "lucide-react";
import type { WeekBundle } from "../../../api/studio";
import { termReadiness, WEEK_STATE_LABEL, WeekFilter, weekIsDone, weekSelectable } from "./studioModel";

const STATE_DOT: Record<WeekBundle["readiness"]["state"], string> = {
  EMPTY: "bg-gray-300 dark:bg-white/20",
  TODO: "bg-warning-500",
  DRAFTED: "bg-brand-500",
  LIVE: "bg-success-500",
};
// The status reads as words; the dot only repeats it. Live is the one state worth colouring.
const STATE_TEXT: Record<WeekBundle["readiness"]["state"], string> = {
  EMPTY: "text-slate-600 dark:text-slate-300",
  TODO: "text-slate-700 dark:text-slate-200",
  DRAFTED: "text-slate-700 dark:text-slate-200",
  LIVE: "text-success-700 dark:text-success-500",
};

/** Tertiary facts. Only criteria coverage shows on the row; plan / notes / e-learning go in the
 *  row's tooltip and screen-reader text, so the status line never has to give way to icons. */
const factsText = (w: WeekBundle) =>
  [w.readiness.has_plan ? "Has a lesson plan" : "No lesson plan", w.readiness.has_note ? "has lesson notes" : "no lesson notes", w.readiness.has_items ? "has e-learning content" : "nothing on e-learning"].join(", ");

const Coverage: React.FC<{ w: WeekBundle }> = ({ w }) => {
  if (!w.coverage || !w.coverage.targets) return null;
  const full = w.coverage.covered === w.coverage.targets;
  const label = `${w.coverage.covered} of ${w.coverage.targets} criteria covered`;
  return (
    <span title={label} aria-label={label} className={`inline-flex items-center gap-0.5 text-[11px] tabular-nums ${full ? "text-success-700 dark:text-success-500" : "text-slate-600 dark:text-slate-300"}`}>
      <Target className="w-3 h-3" aria-hidden /> {w.coverage.covered}/{w.coverage.targets}
    </span>
  );
};

export const WeekRail: React.FC<{
  weeks: WeekBundle[];
  selected: Set<number>;
  nowSectionId: number | null;
  focused: number | null;
  onToggle: (sectionId: number) => void;
  onFocus: (sectionId: number) => void;
  onFilter: (f: WeekFilter) => void;
  filter: WeekFilter;
  /** Read-only rail (generate/review steps): no checkboxes. */
  readOnly?: boolean;
  badge?: (sectionId: number) => React.ReactNode;
}> = ({ weeks, selected, nowSectionId, focused, onToggle, onFocus, onFilter, filter, readOnly, badge }) => {
  const selectable = weeks.filter(weekSelectable).length;
  const term = termReadiness(weeks);
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 pt-3 pb-2 border-b border-gray-100 dark:border-white/[0.06]">
        {/* Term readiness: the one number that says how far the term's preparation has got. */}
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Term readiness</p>
          <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{term.pct}%</p>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden" role="progressbar" aria-valuenow={term.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Term readiness">
          <div className="h-full rounded-full bg-success-500 transition-[width] duration-500" style={{ width: `${term.pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          {term.live} of {term.plannable} weeks live{term.ready ? ` · ${term.ready} ready, not live` : ""}
        </p>
        {!readOnly && (
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 tabular-nums" aria-live="polite" title={`${weeks.length - selectable} week(s) have no topic in the scheme of work yet, so they can't be drafted`}>
            {weeks.length} weeks · {selectable} can be drafted · <strong className="font-semibold text-gray-900 dark:text-white">{selected.size} selected</strong>
          </p>
        )}
      {!readOnly && (
        <div>
          <div className="mt-2 el-segment flex text-xs" role="radiogroup" aria-label="Which weeks">
            {([
              ["gaps", "With gaps"],
              ["all", "All"],
              ["from_now", "From now"],
            ] as [WeekFilter, string][]).map(([f, label]) => (
              <button
                key={f}
                role="radio"
                aria-checked={filter === f}
                onClick={() => onFilter(f)}
                className={`flex-1 min-h-[36px] px-2 rounded-lg font-medium ${filter === f ? "el-segment-on" : "text-slate-600 dark:text-slate-300"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      </div>
      {/* relative: the rows' sr-only text is absolutely positioned — without a positioned
          ancestor inside this scroller it escaped the clipping and made the whole page scroll. */}
      <ul className="relative flex-1 overflow-y-auto p-1.5 space-y-0.5" aria-label="Weeks of the scheme of work">
        {weeks.map((w) => {
          const sid = w.section?.section_id ?? null;
          const can = weekSelectable(w);
          const isSel = sid !== null && selected.has(sid);
          const isFocus = sid !== null && sid === focused;
          return (
            <li key={w.entry.entry_id}>
              <div
                className={`group flex items-start gap-2 px-2 py-2 rounded-xl transition-colors ${isFocus ? "bg-brand-50 dark:bg-brand-500/10" : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"} ${!can ? "opacity-60" : ""}`}
              >
                {!readOnly && (
                  <button
                    role="checkbox"
                    aria-checked={isSel}
                    aria-label={`${isSel ? "Remove" : "Add"} ${w.entry.week_number || "week"}`}
                    disabled={!can}
                    onClick={() => sid && onToggle(sid)}
                    className={`mt-0.5 w-6 h-6 flex-shrink-0 rounded-md border-2 flex items-center justify-center transition-colors focus:outline-none focus-visible:shadow-glow ${isSel ? "bg-brand-600 border-brand-600 text-white" : "border-gray-300 dark:border-white/20"} disabled:cursor-not-allowed`}
                  >
                    {isSel && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                  </button>
                )}
                <button onClick={() => sid && onFocus(sid)} disabled={!sid} aria-current={isFocus ? "true" : undefined} title={w.entry.topic ? factsText(w) : undefined} className="min-w-0 flex-1 text-left focus:outline-none focus-visible:shadow-glow rounded-md">
                  {/* Primary: which week and what it's about */}
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{w.entry.week_number || "Week"}</span>
                    {sid === nowSectionId && <span className="px-1.5 rounded-pill bg-brand-600 text-white text-[10px] font-semibold">This week</span>}
                    {!readOnly && isSel && weekIsDone(w) && (
                      <span className="px-1.5 rounded-pill el-chip-warning text-[10px] font-semibold" title="Already done: the AI drafts an updated version that replaces the current one when you approve it">
                        Update
                      </span>
                    )}
                    <span className="flex-1" />
                    {sid !== null && badge?.(sid)}
                  </span>
                  <span className={`block text-sm leading-snug line-clamp-2 ${w.entry.topic ? "text-gray-800 dark:text-gray-100" : "italic text-slate-600 dark:text-slate-300"}`} title={w.entry.topic || undefined}>
                    {w.entry.topic || WEEK_STATE_LABEL.EMPTY}
                  </span>
                  {/* Secondary: when, and where it stands (in words). Tertiary: the facts. */}
                  <span className="mt-1 flex items-center gap-2">
                    <span className={`min-w-0 inline-flex items-center gap-1.5 text-xs whitespace-nowrap overflow-hidden ${STATE_TEXT[w.readiness.state]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATE_DOT[w.readiness.state]}`} aria-hidden />
                      {w.entry.start_date && (
                        <>
                          {new Date(w.entry.start_date + "T00:00:00").toLocaleDateString([], { day: "numeric", month: "short" })}
                          <span aria-hidden>·</span>
                        </>
                      )}
                      {w.entry.topic ? WEEK_STATE_LABEL[w.readiness.state] : "Add a topic in the scheme"}
                    </span>
                    <span className="flex-1" />
                    {w.entry.topic && <span className="flex-shrink-0"><Coverage w={w} /></span>}
                    {w.entry.topic && <span className="sr-only">{factsText(w)}</span>}
                  </span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default WeekRail;
