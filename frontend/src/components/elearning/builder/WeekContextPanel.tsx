import React from "react";
import { BookOpenCheck, Check, CircleDashed, ExternalLink, Lock, Target } from "lucide-react";
import { ItemTypeIcon } from "../ui/primitives";
import type { CourseItemType } from "../../../api/elearning";

export interface ItemContext {
  section_title: string | null;
  summary: string | null;
  week_number: string | null;
  topic: string | null;
  sub_topic: string | null;
  objective: string | null;
  element_number: number | null;
  competency_title: string | null;
  indicative_content: string | null;
  criteria: { criteria_id: number; criteria_number: string; description: string }[];
  siblings: { item_id: number; title: string; item_type: CourseItemType }[];
  subject_id: number;
}

/**
 * What the scheme of work says this week is for, shown next to the editor so the teacher
 * writes against the curriculum instead of from memory. Criteria the item already claims are
 * ticked, and tapping one toggles it — the alignment picker and the brief are the same thing.
 *
 * Some items can't own their criteria: a lesson note's alignment lives on the note (the API
 * refuses to set it on the course item). Those used to render as silently dead buttons, which
 * reads as a broken list — pass `lockedReason` and the panel says so, and offers the way in.
 */
const WeekContextPanel: React.FC<{
  context: ItemContext | null;
  selectedCriteria: number[];
  onToggleCriterion?: (criteriaId: number) => void;
  lockedReason?: string;
  onOpenSource?: () => void;
  openSourceLabel?: string;
}> = ({ context, selectedCriteria, onToggleCriterion, lockedReason, onOpenSource, openSourceLabel }) => {
  if (!context) return null;
  const Block: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
      <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">{label}</p>
      <div className="mt-1 text-[13px] text-gray-700 dark:text-gray-200 leading-relaxed">{children}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] uppercase tracking-wider font-semibold text-brand-600 dark:text-brand-200 flex items-center gap-1.5">
          <BookOpenCheck className="w-3.5 h-3.5" /> {context.week_number || "This week"}
          {context.element_number ? ` · Element ${context.element_number}` : ""}
        </p>
        <h3 className="mt-1 text-base font-semibold text-gray-900 dark:text-white leading-snug">
          {context.topic || context.section_title || "Untitled week"}
        </h3>
        {context.sub_topic && <p className="text-[13px] text-gray-500 dark:text-gray-400">{context.sub_topic}</p>}
      </div>

      {context.objective && <Block label="Objective">{context.objective}</Block>}
      {context.competency_title && <Block label="Learning outcome">{context.competency_title}</Block>}

      <div>
        <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5" /> This item should teach
        </p>
        {context.criteria.length > 0 && (
          lockedReason ? (
            <div className="mt-1.5 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-400/25">
              <p className="flex items-start gap-1.5 text-[12px] text-amber-800 dark:text-amber-200 leading-snug">
                <Lock className="w-3.5 h-3.5 mt-px flex-shrink-0" />
                {lockedReason}
              </p>
              {onOpenSource && (
                <button
                  type="button"
                  onClick={onOpenSource}
                  className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold text-amber-900 dark:text-amber-100 bg-amber-100 dark:bg-amber-400/20 hover:bg-amber-200 dark:hover:bg-amber-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 transition-colors"
                >
                  {openSourceLabel || "Open the source"}
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : (
            onToggleCriterion && (
              <p className="mt-1 text-[11px] text-gray-400">Tap one to tick what this item teaches.</p>
            )
          )
        )}
        {context.criteria.length === 0 ? (
          <p className="mt-1 text-[13px] text-gray-400">
            No performance criteria are linked to this week in the scheme of work. Link some there, and the AI can write straight from them.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {context.criteria.map((c) => {
              const on = selectedCriteria.includes(c.criteria_id);
              return (
                <li key={c.criteria_id}>
                  {onToggleCriterion ? (
                    <button
                      type="button"
                      onClick={() => onToggleCriterion(c.criteria_id)}
                      aria-pressed={on}
                      className={`w-full flex items-start gap-2 text-left p-2 rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${
                        on
                          ? "el-chip-brand border-brand-500/40"
                          : "border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {on ? <Check className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <CircleDashed className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />}
                      <span className="text-[13px] leading-snug">
                        <span className="font-semibold">{c.criteria_number}</span> {c.description}
                      </span>
                    </button>
                  ) : (
                    // Read-only: a dead button looks like a bug, a plain row reads as information.
                    <div
                      className={`w-full flex items-start gap-2 p-2 rounded-xl ${
                        on ? "el-chip-brand" : "text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {on ? <Check className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <CircleDashed className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />}
                      <span className="text-[13px] leading-snug">
                        <span className="font-semibold">{c.criteria_number}</span> {c.description}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {context.indicative_content && (
        <details className="group">
          <summary className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 cursor-pointer list-none min-h-[32px] flex items-center">
            Indicative content
          </summary>
          <p className="mt-1 text-[13px] text-gray-600 dark:text-gray-300 whitespace-pre-line leading-relaxed">{context.indicative_content}</p>
        </details>
      )}

      {context.siblings.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Already in this week</p>
          <ul className="mt-1.5 space-y-1">
            {context.siblings.map((s) => (
              <li key={s.item_id} className="flex items-center gap-2 text-[13px] text-gray-600 dark:text-gray-300">
                <ItemTypeIcon type={s.item_type} className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="truncate">{s.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default WeekContextPanel;
