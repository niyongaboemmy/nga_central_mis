import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Sparkles, Trash2, X } from "lucide-react";
import { CompletionRule, CourseItem, CurriculumOutcomePick } from "../../../api/elearning";
import { lessonNotesApi } from "../../../api/lessonNotes";
import { apiService } from "../../../services/api";
import { useToast } from "../../../contexts/ToastContext";
import { copy } from "../copy";
import LessonNoteRichEditor from "../../lessonNotes/LessonNoteRichEditor";
import { ItemTypeIcon } from "../ui/primitives";

interface Props {
  item: CourseItem | null;
  courseId: number;
  curriculum: CurriculumOutcomePick[];
  onClose: () => void;
  onSave: (itemId: number, patch: Record<string, unknown>) => Promise<void>;
  onDelete: (itemId: number) => Promise<void>;
  onNotePublished?: () => void;
}

const RULES: CompletionRule[] = ["VIEW", "MARK_DONE", "SUBMIT", "MIN_SCORE"];

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface KcQuestion {
  id?: string;
  type: "MCQ" | "TRUE_FALSE";
  prompt: string;
  options: string[];
  correct_index: number;
  explanation?: string;
}

// Module-level so inputs keep focus across re-renders (an inline component would remount).
const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <span className="block text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">{label}</span>
    {hint && <span className="block text-[11px] text-gray-400 mb-1">{hint}</span>}
    <div className="mt-1">{children}</div>
  </label>
);
const input = "w-full min-h-[44px] px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-brand-500 focus:shadow-glow";

/**
 * Right drawer: completion rule as plain words, required, due date, minutes, criteria chips;
 * type-specific bodies (page editor, video/link URL, knowledge-check questions).
 */
const ItemSettingsDrawer: React.FC<Props> = ({ item, curriculum, onClose, onSave, onDelete, onNotePublished }) => {
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rule, setRule] = useState<CompletionRule>("VIEW");
  const [minScore, setMinScore] = useState<number>(70);
  const [required, setRequired] = useState(true);
  const [published, setPublished] = useState(true);
  const [minutes, setMinutes] = useState<string>("");
  const [dueAt, setDueAt] = useState<string>("");
  const [criteriaIds, setCriteriaIds] = useState<number[]>([]);
  const [url, setUrl] = useState("");
  const [pageJson, setPageJson] = useState<any>(null);
  const [pageHtml, setPageHtml] = useState<string>("");
  const [questions, setQuestions] = useState<KcQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [generatingKc, setGeneratingKc] = useState(false);

  useEffect(() => {
    if (!item) return;
    setTitle(item.title);
    setDescription(item.description || "");
    setRule(item.completion_rule === "NONE" ? "VIEW" : item.completion_rule);
    setMinScore(item.min_score_pct ?? 70);
    setRequired(!!item.is_required);
    setPublished(!!item.is_published);
    setMinutes(item.estimated_minutes ? String(item.estimated_minutes) : "");
    setDueAt(toLocalInput(item.due_at));
    setCriteriaIds(item.criteria.map((c) => c.criteria_id));
    setUrl(item.content_json?.url || item.external_url || "");
    setPageJson(item.content_json ?? null);
    setPageHtml("");
    setQuestions(item.content_json?.questions || []);
  }, [item]);

  const criteriaById = useMemo(() => {
    const map = new Map<number, { number: string; description: string; element: number }>();
    curriculum.forEach((o) => o.criteria.forEach((c) => map.set(c.criteria_id, { number: c.criteria_number, description: c.description, element: o.element_number })));
    return map;
  }, [curriculum]);

  if (!item) return null;
  const isHeader = item.item_type === "HEADER";
  const isNote = item.item_type === "LESSON_NOTE";

  const save = async () => {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        title,
        description: description || null,
        is_published: published,
      };
      if (!isHeader) {
        patch.completion_rule = rule;
        patch.min_score_pct = rule === "MIN_SCORE" ? minScore : null;
        patch.is_required = required;
        patch.estimated_minutes = minutes === "" ? null : Number(minutes);
        patch.due_at = dueAt ? new Date(dueAt).toISOString() : null;
      }
      if (!isNote) patch.criteria_ids = criteriaIds;
      if (["LINK", "VIDEO", "TASKMENTOR_QUIZ", "TASKMENTOR_ASSIGNMENT", "DISCUSSION"].includes(item.item_type)) patch.url = url;
      if (item.item_type === "PAGE") {
        if (pageJson) patch.content_json = pageJson;
        if (pageHtml) patch.content_html = pageHtml;
      }
      if (item.item_type === "KNOWLEDGE_CHECK") patch.content_json = { questions };
      await onSave(item.item_id, patch);
      onClose();
    } catch (e: any) {
      showToast(e?.response?.data?.message || copy.errors.save, "error");
    } finally {
      setSaving(false);
    }
  };

  const suggestCriteria = async () => {
    setSuggesting(true);
    try {
      const r = await apiService.post(`/elearning/items/${item.item_id}/suggest-criteria`, {
        title,
        description,
        content_html: pageHtml || undefined,
      });
      const ids: number[] = r.data.data?.criteria_ids || [];
      if (ids.length === 0) showToast("No matching criteria found — try adding a short description first", "info");
      setCriteriaIds((c) => [...new Set([...c, ...ids])]);
    } catch (e: any) {
      showToast(e?.response?.data?.message || "AI suggestion isn't available right now", "error");
    } finally {
      setSuggesting(false);
    }
  };

  const generateQuestions = async () => {
    setGeneratingKc(true);
    try {
      const r = await apiService.post(`/elearning/items/${item.item_id}/generate-check`, { title, description, count: 5 });
      const qs: KcQuestion[] = r.data.data?.questions || [];
      if (qs.length === 0) showToast("The AI couldn't write questions from this — add a description or a source note", "info");
      setQuestions((q) => [...q, ...qs].slice(0, 10));
    } catch (e: any) {
      showToast(e?.response?.data?.message || "AI generation isn't available right now", "error");
    } finally {
      setGeneratingKc(false);
    }
  };

  const publishNote = async () => {
    if (!item.ref_id) return;
    try {
      await lessonNotesApi.update(item.ref_id, { status: "PUBLISHED" });
      showToast("Note published", "success");
      onNotePublished?.();
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Couldn't publish the note — open it and add content first", "error");
    }
  };

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-40 bg-black/30 lg:bg-transparent lg:pointer-events-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.aside
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 36 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label={`Settings for ${item.title}`}
          className={`pointer-events-auto fixed top-16 right-0 bottom-0 bg-white dark:bg-gray-900 shadow-float border-l border-gray-200 dark:border-gray-800 flex flex-col ${item.item_type === "PAGE" ? "w-full lg:w-[720px]" : "w-full sm:w-[440px]"}`}
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <ItemTypeIcon type={item.item_type} className="w-4 h-4 text-gray-500" />
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex-1 truncate">{copy.builder.itemTypes[item.item_type]}</p>
            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            <Field label="Title">
              <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>

            {isNote && item.ref?.status === "DRAFT" && (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-warning-100 text-warning-700 text-sm">
                <span className="flex-1">{copy.builder.noteDraftHint}</span>
                <button onClick={publishNote} className="min-h-[36px] px-3 rounded-pill bg-warning-500 text-white text-xs font-semibold">{copy.builder.publishNote}</button>
              </div>
            )}

            {["LINK", "VIDEO", "TASKMENTOR_QUIZ", "TASKMENTOR_ASSIGNMENT", "DISCUSSION"].includes(item.item_type) && (
              <Field label={item.item_type === "VIDEO" ? "YouTube / Vimeo link" : "Link"}>
                <input className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" />
              </Field>
            )}

            {!isHeader && (
              <Field label="Description" hint="Shown to students above the content.">
                <textarea className={`${input} py-2 min-h-[72px]`} value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
            )}

            {item.item_type === "PAGE" && (
              <div>
                <span className="block text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-1">Page content</span>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden min-h-[320px]">
                  <LessonNoteRichEditor
                    initialContent={item.content_json ?? null}
                    editable
                    onChange={(json, html) => {
                      setPageJson(json);
                      setPageHtml(html);
                    }}
                    onUploadImage={(file) =>
                      new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(String(reader.result));
                        reader.onerror = () => reject(new Error("Couldn't read that image"));
                        reader.readAsDataURL(file);
                      })
                    }
                    onRequestAIEdit={() => Promise.reject(new Error("AI editing is available in Lesson Notes"))}
                    onAIEditAccepted={() => undefined}
                  />
                </div>
              </div>
            )}

            {item.item_type === "KNOWLEDGE_CHECK" && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Questions ({questions.length}/10)</span>
                  <button onClick={generateQuestions} disabled={generatingKc} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-200 disabled:opacity-50">
                    <Sparkles className="w-3.5 h-3.5" /> {generatingKc ? "Writing…" : "Write 5 with AI"}
                  </button>
                </div>
                <ul className="space-y-3">
                  {questions.map((q, qi) => (
                    <li key={qi} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                      <div className="flex gap-2">
                        <input className={input} placeholder={`Question ${qi + 1}`} value={q.prompt} onChange={(e) => setQuestions((qs) => qs.map((x, i) => (i === qi ? { ...x, prompt: e.target.value } : x)))} />
                        <button onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qi))} className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-danger-500" aria-label="Remove question"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <select
                          value={q.type}
                          onChange={(e) => {
                            const type = e.target.value as KcQuestion["type"];
                            setQuestions((qs) => qs.map((x, i) => (i === qi ? { ...x, type, options: type === "TRUE_FALSE" ? ["True", "False"] : x.options.length >= 2 ? x.options : ["", ""], correct_index: 0 } : x)));
                          }}
                          className="min-h-[36px] px-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
                        >
                          <option value="MCQ">Multiple choice</option>
                          <option value="TRUE_FALSE">True / false</option>
                        </select>
                        <span className="text-gray-400">tap the circle to mark the right answer</span>
                      </div>
                      <ul className="space-y-1.5">
                        {q.options.map((opt, oi) => (
                          <li key={oi} className="flex items-center gap-2">
                            <button
                              onClick={() => setQuestions((qs) => qs.map((x, i) => (i === qi ? { ...x, correct_index: oi } : x)))}
                              aria-label={`Mark option ${oi + 1} correct`}
                              className={`w-6 h-6 rounded-full border-2 flex-shrink-0 ${q.correct_index === oi ? "border-success-500 bg-success-500" : "border-gray-300 dark:border-gray-600"}`}
                            />
                            <input
                              className={`${input} min-h-[36px]`}
                              value={opt}
                              disabled={q.type === "TRUE_FALSE"}
                              onChange={(e) => setQuestions((qs) => qs.map((x, i) => (i === qi ? { ...x, options: x.options.map((o, j) => (j === oi ? e.target.value : o)) } : x)))}
                            />
                            {q.type === "MCQ" && q.options.length > 2 && (
                              <button onClick={() => setQuestions((qs) => qs.map((x, i) => (i === qi ? { ...x, options: x.options.filter((_, j) => j !== oi), correct_index: Math.min(x.correct_index, x.options.length - 2) } : x)))} className="text-gray-400 hover:text-danger-500" aria-label="Remove option"><X className="w-3.5 h-3.5" /></button>
                            )}
                          </li>
                        ))}
                      </ul>
                      {q.type === "MCQ" && q.options.length < 6 && (
                        <button onClick={() => setQuestions((qs) => qs.map((x, i) => (i === qi ? { ...x, options: [...x.options, ""] } : x)))} className="text-xs text-brand-600 dark:text-brand-200 inline-flex items-center gap-1"><Plus className="w-3 h-3" /> option</button>
                      )}
                      <input className={`${input} min-h-[36px]`} placeholder="Explanation shown after answering (optional)" value={q.explanation || ""} onChange={(e) => setQuestions((qs) => qs.map((x, i) => (i === qi ? { ...x, explanation: e.target.value } : x)))} />
                    </li>
                  ))}
                </ul>
                {questions.length < 10 && (
                  <button onClick={() => setQuestions((qs) => [...qs, { type: "MCQ", prompt: "", options: ["", ""], correct_index: 0 }])} className="mt-2 inline-flex items-center gap-1 min-h-[40px] px-3 rounded-pill bg-gray-100 dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200">
                    <Plus className="w-4 h-4" /> Add question
                  </button>
                )}
              </div>
            )}

            {!isHeader && (
              <>
                <div>
                  <span className="block text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-1">Counts as done when the student…</span>
                  <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Completion rule">
                    {RULES.map((r) => (
                      <button
                        key={r}
                        role="radio"
                        aria-checked={rule === r}
                        onClick={() => setRule(r)}
                        className={`min-h-[44px] px-3 rounded-xl text-sm border text-left ${rule === r ? "border-brand-500 bg-brand-50 dark:bg-brand-700/20 text-brand-700 dark:text-brand-200" : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200"}`}
                      >
                        {copy.builder.completionRules[r]}
                        {r === "MIN_SCORE" && rule === "MIN_SCORE" && (
                          <span className="inline-flex items-center gap-1 ml-1">
                            <input type="number" min={1} max={100} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} onClick={(e) => e.stopPropagation()} className="w-14 px-1 rounded-md border border-brand-200 bg-white dark:bg-gray-800 text-center" aria-label="Minimum score percent" />%
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  {["SUBMIT", "MIN_SCORE"].includes(rule) && !["KNOWLEDGE_CHECK", "TASKMENTOR_QUIZ", "TASKMENTOR_ASSIGNMENT"].includes(item.item_type) && (
                    <p className="mt-1 text-[11px] text-warning-700">Only a quick check or a Task Mentor result can satisfy this rule.</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Minutes">
                    <input className={input} type="number" min={0} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="e.g. 10" />
                  </Field>
                  <Field label="Due">
                    <input className={input} type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
                  </Field>
                </div>

                <label className="flex items-center justify-between min-h-[44px]">
                  <span className="text-sm text-gray-800 dark:text-gray-100">Required to finish the week</span>
                  <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="w-5 h-5 accent-brand-500" />
                </label>
              </>
            )}

            <label className="flex items-center justify-between min-h-[44px]">
              <span className="text-sm text-gray-800 dark:text-gray-100">Visible to students</span>
              <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="w-5 h-5 accent-brand-500" />
            </label>

            {!isHeader && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Performance criteria</span>
                  {!isNote && (
                    <button onClick={suggestCriteria} disabled={suggesting} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-200 disabled:opacity-50">
                      <Sparkles className="w-3.5 h-3.5" /> {suggesting ? "Thinking…" : "Suggest with AI"}
                    </button>
                  )}
                </div>
                {isNote ? (
                  <p className="text-[11px] text-gray-400">Set on the note itself — {item.criteria.length ? item.criteria.map((c) => c.criteria_number).join(", ") : "none yet"}.</p>
                ) : curriculum.length === 0 ? (
                  <p className="text-[11px] text-gray-400">This subject has no curriculum yet.</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {curriculum.map((o) => (
                      <div key={o.competency_id}>
                        <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Element {o.element_number} · {o.title}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {o.criteria.map((c) => {
                            const on = criteriaIds.includes(c.criteria_id);
                            return (
                              <button
                                key={c.criteria_id}
                                title={c.description}
                                aria-pressed={on}
                                onClick={() => setCriteriaIds((ids) => (on ? ids.filter((x) => x !== c.criteria_id) : [...ids, c.criteria_id]))}
                                className={`text-[11px] px-2 py-1 rounded-pill border min-h-[28px] ${on ? "bg-brand-500 border-brand-500 text-white" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"}`}
                              >
                                {c.criteria_number}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {criteriaIds.length > 0 && !isNote && (
                  <p className="mt-1 text-[11px] text-gray-500">{criteriaIds.map((id) => criteriaById.get(id)?.number).filter(Boolean).join(", ")}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <button onClick={() => onDelete(item.item_id).then(onClose)} className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-pill text-sm text-danger-700 hover:bg-danger-100">
              <Trash2 className="w-4 h-4" /> Remove
            </button>
            <span className="flex-1" />
            <button onClick={onClose} className="min-h-[44px] px-4 rounded-pill text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
            <button onClick={save} disabled={saving} className="min-h-[44px] px-5 rounded-pill bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-soft disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
};

export default ItemSettingsDrawer;
