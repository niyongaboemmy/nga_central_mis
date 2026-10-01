import React from "react";
import { Check, ClipboardList, FileText, MonitorPlay, Target } from "lucide-react";
import type { WeekBundle } from "../../../api/studio";
import { WEEK_STATE_LABEL, WeekFilter, weekSelectable } from "./studioModel";

const STATE_DOT: Record<WeekBundle["readiness"]["state"], string> = {
  EMPTY: "bg-gray-300 dark:bg-white/20",
  TODO: "bg-warning-500",
  DRAFTED: "bg-brand-500",
  LIVE: "bg-success-500",
};

/** Plan · Note · E-learning · Coverage — the four facts a teacher checks for a week (§5.4). */
const Facts: React.FC<{ w: WeekBundle }> = ({ w }) => {
  const cov = w.coverage && w.coverage.targets ? Math.round((w.coverage.covered / w.coverage.targets) * 100) : null;
  const fact = (on: boolean, Icon: React.ElementType, label: string) => (
    <span title={label} aria-label={label} className={`inline-flex items-center ${on ? "text-gray-700 dark:text-gray-200" : "text-gray-300 dark:text-white/20"}`}>
      <Icon className="w-3.5 h-3.5" />
    </span>
  );
  return (
    <span className="flex items-center gap-1.5">
      {fact(w.readiness.has_plan, ClipboardList, w.readiness.has_plan ? "Has a lesson plan" : "No lesson plan")}
      {fact(w.readiness.has_note, FileText, w.readiness.has_note ? "Has lesson notes" : "No lesson notes")}
      {fact(w.readiness.has_items, MonitorPlay, w.readiness.has_items ? "Has e-learning content" : "Nothing on e-learning")}
      {cov !== null && (
        <span title={`${w.coverage!.covered} of ${w.coverage!.targets} criteria covered`} className={`inline-flex items-center gap-0.5 text-[11px] tabular-nums ${cov === 100 ? "text-success-700 dark:text-success-500" : "text-slate-600 dark:text-slate-300"}`}>
          <Target className="w-3 h-3" /> {cov}%
        </span>
      )}
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
  return (
    <div className="flex flex-col h-full min-h-0">
      {!readOnly && (
        <div className="px-3 pt-3 pb-2 border-b border-gray-100 dark:border-white/[0.06]">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-300">{weeks.length} weeks</p>
            <p className="text-xs text-slate-600 dark:text-slate-300 tabular-nums" aria-live="polite">{selected.size} of {selectable} chosen</p>
          </div>
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
      <ul className="flex-1 overflow-y-auto p-1.5 space-y-0.5" aria-label="Weeks of the scheme of work">
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
                <button onClick={() => sid && onFocus(sid)} disabled={!sid} className="min-w-0 flex-1 text-left focus:outline-none focus-visible:shadow-glow rounded-md">
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATE_DOT[w.readiness.state]}`} aria-hidden />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{w.entry.week_number || "Week"}</span>
                    {sid === nowSectionId && <span className="px-1.5 rounded-pill bg-brand-600 text-white text-[10px] font-semibold">Now</span>}
                    {w.entry.start_date && (
                      <span className="text-[11px] text-slate-600 dark:text-slate-300">
                        {new Date(w.entry.start_date + "T00:00:00").toLocaleDateString([], { day: "numeric", month: "short" })}
                      </span>
                    )}
                    <span className="flex-1" />
                    {sid !== null && badge?.(sid)}
                  </span>
                  <span className={`block text-sm truncate ${w.entry.topic ? "text-gray-700 dark:text-gray-200" : "italic text-slate-600 dark:text-slate-300"}`}>
                    {w.entry.topic || WEEK_STATE_LABEL.EMPTY}
                  </span>
                  <span className="mt-1 flex items-center justify-between gap-2">
                    <Facts w={w} />
                    <span className="text-[11px] text-slate-600 dark:text-slate-300">{WEEK_STATE_LABEL[w.readiness.state]}</span>
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
