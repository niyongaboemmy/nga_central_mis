import React from "react";
import { BookOpenCheck, Check, CircleDashed, Target } from "lucide-react";
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
 */
const WeekContextPanel: React.FC<{
  context: ItemContext | null;
  selectedCriteria: number[];
  onToggleCriterion?: (criteriaId: number) => void;
}> = ({ context, selectedCriteria, onToggleCriterion }) => {
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
                  <button
                    type="button"
                    onClick={() => onToggleCriterion?.(c.criteria_id)}
                    aria-pressed={on}
                    disabled={!onToggleCriterion}
                    className={`w-full flex items-start gap-2 text-left p-2 rounded-xl transition-colors ${
                      on ? "el-chip-brand" : "hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-600 dark:text-gray-300"
                    } ${onToggleCriterion ? "" : "cursor-default"}`}
                  >
                    {on ? <Check className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <CircleDashed className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />}
                    <span className="text-[13px] leading-snug">
                      <span className="font-semibold">{c.criteria_number}</span> {c.description}
                    </span>
                  </button>
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
