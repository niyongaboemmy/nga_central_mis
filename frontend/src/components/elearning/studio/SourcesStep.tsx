import React, { useEffect, useState } from "react";
import { BookMarked, ClipboardList, FileText, History, Library, Loader2, Target } from "lucide-react";
import type { Blueprint, ContextPackInfo, WeekBundle } from "../../../api/studio";
import { studioApi } from "../../../api/studio";
import ReferenceFiles from "./ReferenceFiles";

const KIND_ICON: Record<string, React.ElementType> = {
  SCHEME_ENTRY: Target,
  LESSON_PLAN: ClipboardList,
  LESSON_NOTE: FileText,
  SUBJECT_DOCUMENT: Library,
  COURSE_FILE: BookMarked,
  PREVIOUS_WEEKS: History,
};

const SOURCES: { key: keyof Blueprint["sources"]; label: string; hint: string; icon: React.ElementType; count: (w: WeekBundle[]) => number }[] = [
  { key: "lesson_plans", label: "Lesson plans", hint: "Your plans for each week — the AI follows their order and activities.", icon: ClipboardList, count: (w) => w.reduce((n, x) => n + x.lesson_plans.length, 0) },
  { key: "my_notes", label: "My lesson notes", hint: "Notes you wrote for these criteria (unapproved AI drafts are never used).", icon: FileText, count: (w) => w.reduce((n, x) => n + x.notes.filter((t) => t.source !== "AI_GENERATED" || t.status === "PUBLISHED").length, 0) },
  { key: "subject_materials", label: "Subject materials", hint: "Documents attached to the Learning Outcome, once their text has been read.", icon: Library, count: (w) => w.reduce((n, x) => n + x.materials.length, 0) },
  { key: "previous_weeks", label: "Earlier weeks", hint: "Titles of what students already learned, so weeks build on each other.", icon: History, count: () => 0 },
];

/**
 * Step 2 (§9.2): which material grounds the AI, and — for the week in focus — exactly what it
 * will read and how much. The scheme of work (topic, outcome, criteria) is always included: it
 * is the contract every week is checked against.
 */
export const SourcesStep: React.FC<{
  weeks: WeekBundle[];
  selectedWeeks: WeekBundle[];
  sources: Blueprint["sources"];
  onChange: (s: Blueprint["sources"]) => void;
  focusSectionId: number | null;
  reuseNotes: boolean;
  onReuseNotes: (v: boolean) => void;
  courseId: number;
  assetIds: number[];
  onAssetIds: (ids: number[]) => void;
}> = ({ selectedWeeks, sources, onChange, focusSectionId, reuseNotes, onReuseNotes, courseId, assetIds, onAssetIds }) => {
  const [pack, setPack] = useState<ContextPackInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const focus = selectedWeeks.find((w) => w.section?.section_id === focusSectionId) ?? selectedWeeks[0];
  const sid = focus?.section?.section_id ?? null;

  useEffect(() => {
    if (!sid) return;
    let off = false;
    setLoading(true);
    studioApi
      .contextPack(sid, sources, assetIds)
      .then((r) => !off && setPack(r.data.data))
      .catch(() => !off && setPack(null))
      .finally(() => !off && setLoading(false));
    return () => {
      off = true;
    };
  }, [sid, sources, assetIds]);

  const budget = 12000;
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="space-y-2">
        <div className="el-card p-3 flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center flex-shrink-0"><Target className="w-4 h-4" /></span>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Scheme of work & curriculum</p>
            <p className="text-xs text-slate-600 dark:text-slate-300">Always used: each week's topic, Learning Outcome and performance criteria.</p>
          </div>
        </div>
        {SOURCES.map((s) => {
          const n = s.count(selectedWeeks);
          const on = sources[s.key];
          return (
            <label key={s.key} className={`el-card p-3 flex items-start gap-3 cursor-pointer ${on ? "border-brand-200 dark:border-brand-500/40" : ""}`}>
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${on ? "bg-brand-600 text-white" : "el-subtle text-gray-500"}`}><s.icon className="w-4 h-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{s.label}</span>
                {n > 0 && <span className="ml-2 px-1.5 rounded-pill el-chip text-[11px] tabular-nums">{n}</span>}
                <span className="block text-xs text-slate-600 dark:text-slate-300">{s.hint}</span>
              </span>
              <input type="checkbox" className="mt-1 w-5 h-5 accent-brand-500" checked={on} onChange={(e) => onChange({ ...sources, [s.key]: e.target.checked })} />
            </label>
          );
        })}
        <ReferenceFiles courseId={courseId} assetIds={assetIds} onChange={onAssetIds} />
        <label className="el-card p-3 flex items-start gap-3 cursor-pointer">
          <span className="min-w-0 flex-1">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Use my notes first</span>
            <span className="block text-xs text-slate-600 dark:text-slate-300">
              When one of your notes already covers a week, it is placed on the week and no new lesson is written. Saves free AI quota.
            </span>
          </span>
          <input type="checkbox" className="mt-1 w-5 h-5 accent-brand-500" checked={reuseNotes} onChange={(e) => onReuseNotes(e.target.checked)} />
        </label>
      </div>

      <div className="el-card p-4 h-fit lg:sticky lg:top-0">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-300">What the AI will read</p>
        <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white truncate">
          {focus ? `${focus.entry.week_number || "Week"} — ${focus.entry.topic || "no topic"}` : "Choose a week"}
        </p>
        {loading && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Gathering sources…</p>
        )}
        {!loading && pack && (
          <>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>{pack.sources.length} source{pack.sources.length === 1 ? "" : "s"}</span>
                <span className="tabular-nums">{Math.min(100, Math.round((pack.approx_tokens / budget) * 100))}% of the AI's reading space</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={pack.approx_tokens} aria-label="How much of the AI's reading budget is used">
                <div className="h-full bg-brand-500 rounded-full transition-[width]" style={{ width: `${Math.min(100, (pack.approx_tokens / budget) * 100)}%` }} />
              </div>
            </div>
            <ul className="mt-3 space-y-1.5">
              {pack.sources.map((s) => {
                const Icon = KIND_ICON[s.kind] ?? FileText;
                return (
                  <li key={s.ref} className="flex items-center gap-2 text-sm">
                    <span className="w-7 text-[11px] font-semibold text-brand-600 dark:text-brand-200 tabular-nums">{s.ref}</span>
                    <Icon className="w-4 h-4 text-slate-600 dark:text-slate-300 flex-shrink-0" />
                    <span className="flex-1 truncate text-gray-800 dark:text-gray-100">{s.title}</span>
                    {s.truncated && <span className="text-[10px] px-1.5 rounded-pill el-chip-warning" title="Only the most relevant parts are used">trimmed</span>}
                  </li>
                );
              })}
            </ul>
            {pack.criteria.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {pack.criteria.map((c) => (
                  <span key={c.criteria_id} title={c.description} className="px-2 py-0.5 rounded-pill el-chip-brand text-[11px] font-semibold">{c.criteria_number}</span>
                ))}
              </div>
            )}
            {pack.sources.length === 1 && (
              <p className="mt-3 text-xs text-warning-700 dark:text-warning-500">
                Only the scheme of work is available for this week. A lesson plan or a note makes the result much closer to how you teach.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SourcesStep;
