import React, { useEffect, useState } from "react";
import { Frown, Meh, Plus, Smile, Trash2, AlertTriangle } from "lucide-react";
import { apiService } from "../../../services/api";
import SelectField from "../../ui/SelectField";

/**
 * Builder editors for flashcards and practical tasks, and the exit-ticket class pulse
 * (LESSON_STUDIO plan §11).
 */

const input = "w-full min-h-[40px] px-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-sm text-gray-900 dark:text-white";

export interface CardRow {
  id: string;
  front: string;
  back: string;
  gloss_rw?: string;
}

export const FlashcardsEditor: React.FC<{ cards: CardRow[]; onChange: (c: CardRow[]) => void }> = ({ cards, onChange }) => (
  <div>
    <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-300 mb-1">Cards ({cards.length}/40)</p>
    <ul className="space-y-2">
      {cards.map((c, i) => (
        <li key={c.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start">
          <input aria-label={`Card ${i + 1} front`} className={input} value={c.front} placeholder="Term or question" onChange={(e) => onChange(cards.map((x, j) => (j === i ? { ...x, front: e.target.value } : x)))} />
          <input aria-label={`Card ${i + 1} back`} className={input} value={c.back} placeholder="Meaning or answer" onChange={(e) => onChange(cards.map((x, j) => (j === i ? { ...x, back: e.target.value } : x)))} />
          <button aria-label={`Remove card ${i + 1}`} onClick={() => onChange(cards.filter((_, j) => j !== i))} className="w-10 h-10 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center text-slate-600 dark:text-slate-300">
            <Trash2 className="w-4 h-4" />
          </button>
        </li>
      ))}
    </ul>
    {cards.length < 40 && (
      <button onClick={() => onChange([...cards, { id: `c${Date.now().toString(36)}`, front: "", back: "" }])} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-200">
        <Plus className="w-3.5 h-3.5" /> Add a card
      </button>
    )}
  </div>
);

export interface ChecklistRow {
  id: string;
  text: string;
  criteria_number?: string | null;
}

export const PracticalEditor: React.FC<{ checklist: ChecklistRow[]; onChange: (c: ChecklistRow[]) => void; criteria: string[] }> = ({ checklist, onChange, criteria }) => (
  <div>
    <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-300 mb-1">Success checklist — you tick it when signing off</p>
    <ul className="space-y-2">
      {checklist.map((c, i) => (
        <li key={c.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
          <input aria-label={`Checklist line ${i + 1}`} className={input} value={c.text} placeholder="Something you can see in the photo" onChange={(e) => onChange(checklist.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
          <SelectField aria-label={`Criterion for line ${i + 1}`} className={`${input} w-24`} value={c.criteria_number || ""} onChange={(e) => onChange(checklist.map((x, j) => (j === i ? { ...x, criteria_number: e.target.value || null } : x)))}>
            <option value="">—</option>
            {criteria.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </SelectField>
          <button aria-label={`Remove line ${i + 1}`} onClick={() => onChange(checklist.filter((_, j) => j !== i))} className="w-10 h-10 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center text-slate-600 dark:text-slate-300">
            <Trash2 className="w-4 h-4" />
          </button>
        </li>
      ))}
    </ul>
    {checklist.length < 15 && (
      <button onClick={() => onChange([...checklist, { id: `k${Date.now().toString(36)}`, text: "" }])} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-200">
        <Plus className="w-3.5 h-3.5" /> Add a line
      </button>
    )}
  </div>
);

/** Exit-ticket results before the next lesson: per question, confidence, confident-but-wrong first. */
export const ClassPulse: React.FC<{ itemId: number }> = ({ itemId }) => {
  const [data, setData] = useState<any>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    apiService.get<any>(`/elearning/items/${itemId}/exit-ticket/pulse`).then((r) => setData(r.data.data), () => setFailed(true));
  }, [itemId]);
  if (failed) return null;
  if (!data) return <div className="h-24 rounded-xl bg-gray-100 dark:bg-white/10 animate-pulse" aria-busy="true" />;
  const wrongSure = data.students.filter((s: any) => s.confident_but_wrong);
  return (
    <section aria-labelledby={`pulse-${itemId}`} className="el-card p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h4 id={`pulse-${itemId}`} className="text-sm font-semibold text-gray-900 dark:text-white">Class pulse</h4>
        <span className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">{data.responded} of {data.class_size} answered</span>
      </div>
      <div className="flex gap-3 text-xs text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1"><Frown className="w-4 h-4" /> {data.confidence.unsure} not sure</span>
        <span className="inline-flex items-center gap-1"><Meh className="w-4 h-4" /> {data.confidence.okay} fairly sure</span>
        <span className="inline-flex items-center gap-1"><Smile className="w-4 h-4" /> {data.confidence.sure} very sure</span>
      </div>
      {data.questions.map((q: any, i: number) => {
        const pct = q.answered ? Math.round((q.right / q.answered) * 100) : 0;
        return (
          <div key={q.id}>
            <p className="text-sm text-gray-900 dark:text-white">{i + 1}. {q.prompt}</p>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden" role="img" aria-label={`${pct}% answered correctly`}>
                <div className={`h-full ${pct >= 70 ? "bg-success-700" : pct >= 40 ? "bg-warning-500" : "bg-danger-500"}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs tabular-nums text-slate-600 dark:text-slate-300 w-10 text-right">{pct}%</span>
            </div>
          </div>
        );
      })}
      {wrongSure.length > 0 && (
        <p className="text-xs rounded-lg px-2 py-1.5 el-chip-warning flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />
          Sure but wrong — start the next lesson here: {wrongSure.map((s: any) => s.name).join(", ")}
        </p>
      )}
    </section>
  );
};
