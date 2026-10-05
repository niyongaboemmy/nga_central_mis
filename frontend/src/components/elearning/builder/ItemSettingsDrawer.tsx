import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Eye,
  EyeOff,
  Info,
  Maximize2,
  Minimize2,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { CompletionRule, CourseItem, CurriculumOutcomePick, elearningApi, isTimeout } from "../../../api/elearning";
import { lessonNotesApi } from "../../../api/lessonNotes";
import { apiService } from "../../../services/api";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import { copy } from "../copy";
import { useMotion } from "../../../design/motion";
import BuilderFilePreview from "./BuilderFilePreview";
import { CardRow, ChecklistRow, ClassPulse, FlashcardsEditor, PracticalEditor } from "./InteractiveEditors";
import LessonNoteRichEditor from "../../lessonNotes/LessonNoteRichEditor";
import { ItemTypeIcon } from "../ui/primitives";
import WeekContextPanel, { ItemContext } from "./WeekContextPanel";
import SelectField from "../../ui/SelectField";

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

/** Say which of the three things went wrong — out of time, refused, or not configured. */
const aiError = (e: any, what: string) => {
  if (isTimeout(e)) return `The AI is taking longer than usual to ${what}. Try again in a moment.`;
  return e?.response?.data?.message || `The AI couldn't ${what} just now.`;
};

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
const input = "el-input";

/** The metadata fields a teacher can change here, as one comparable string. Page/quiz bodies
 *  are deliberately left out: their editors emit an onChange on mount, which would report a
 *  drawer as "changed" the moment it opened. */
const metaSignature = (v: {
  title: string;
  description: string;
  rule: CompletionRule;
  minScore: number;
  required: boolean;
  published: boolean;
  minutes: string;
  dueAt: string;
  criteriaIds: number[];
  url: string;
}) => JSON.stringify({ ...v, criteriaIds: [...v.criteriaIds].sort((a, b) => a - b) });

/**
 * Right drawer: completion rule as plain words, required, due date, minutes, criteria chips;
 * type-specific bodies (page editor, video/link URL, knowledge-check questions).
 */
const ItemSettingsDrawer: React.FC<Props> = ({ item, curriculum, onClose, onSave, onDelete, onNotePublished }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const m = useMotion();
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
  const [cards, setCards] = useState<CardRow[]>([]);
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);
  const [generatingKc, setGeneratingKc] = useState(false);
  const [context, setContext] = useState<ItemContext | null>(null);
  const [wide, setWide] = useState(true);
  const [briefOpen, setBriefOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [writingPage, setWritingPage] = useState(false);
  const [pageKey, setPageKey] = useState(0);
  // Everything below "Basics" is optional and already has a sensible default, so a first-time
  // teacher shouldn't have to read past it. It opens by itself when the item already carries a
  // non-default setting, so existing configuration is never hidden from the person who set it.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // The values as loaded, so the drawer can tell "changed" from "opened and read".
  const [baseline, setBaseline] = useState<string>("");

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
    setCards(item.content_json?.cards || []);
    setChecklist(item.content_json?.checklist || []);
    setAiInstruction("");
    setContext(null);
    const nonDefault =
      (item.completion_rule !== "VIEW" && item.completion_rule !== "NONE") ||
      !item.is_required ||
      !!item.estimated_minutes ||
      !!item.due_at ||
      item.criteria.length > 0;
    setAdvancedOpen(nonDefault);
    setBaseline(
      metaSignature({
        title: item.title,
        description: item.description || "",
        rule: item.completion_rule === "NONE" ? "VIEW" : item.completion_rule,
        minScore: item.min_score_pct ?? 70,
        required: !!item.is_required,
        published: !!item.is_published,
        minutes: item.estimated_minutes ? String(item.estimated_minutes) : "",
        dueAt: toLocalInput(item.due_at),
        criteriaIds: item.criteria.map((c) => c.criteria_id),
        url: item.content_json?.url || item.external_url || "",
      }),
    );
    apiService
      .get(`/elearning/items/${item.item_id}/context`)
      .then((r) => setContext(r.data.data))
      .catch(() => setContext(null));
  }, [item]);

  const criteriaById = useMemo(() => {
    const map = new Map<number, { number: string; description: string; element: number }>();
    curriculum.forEach((o) => o.criteria.forEach((c) => map.set(c.criteria_id, { number: c.criteria_number, description: c.description, element: o.element_number })));
    return map;
  }, [curriculum]);

  const current = metaSignature({ title, description, rule, minScore, required, published, minutes, dueAt, criteriaIds, url });
  // A body editor (page, quick check) has no reliable dirty signal, so those types always
  // allow a save rather than blocking one the teacher expects to work.
  const hasBody = !!item && ["PAGE", "KNOWLEDGE_CHECK", "EXIT_TICKET", "FLASHCARDS", "PRACTICAL_TASK"].includes(item.item_type);
  const isQuestionItem = !!item && (item.item_type === "KNOWLEDGE_CHECK" || item.item_type === "EXIT_TICKET");
  const qMax = item?.item_type === "EXIT_TICKET" ? 3 : 10;
  const isDirty = !!baseline && (current !== baseline || hasBody);

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
      if (item.item_type === "EXIT_TICKET") patch.content_json = { questions, ask_confidence: true };
      if (item.item_type === "FLASHCARDS") patch.content_json = { cards: cards.filter((c) => c.front.trim() && c.back.trim()) };
      if (item.item_type === "PRACTICAL_TASK") patch.content_json = { ...(item.content_json || {}), checklist: checklist.filter((c) => c.text.trim()) };
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
      const r = await elearningApi.suggestCriteria(item.item_id, { title, description, content_html: pageHtml || undefined });
      const ids: number[] = r.data.data?.criteria_ids || [];
      if (ids.length === 0) showToast("No matching criteria found — try adding a short description first", "info");
      setCriteriaIds((c) => [...new Set([...c, ...ids])]);
    } catch (e: any) {
      showToast(aiError(e, "match the criteria"), "error");
    } finally {
      setSuggesting(false);
    }
  };

  const generateQuestions = async () => {
    setGeneratingKc(true);
    try {
      const r = await elearningApi.generateCheck(item.item_id, { title, description, count: 5 });
      const qs: KcQuestion[] = r.data.data?.questions || [];
      if (qs.length === 0) showToast("The AI couldn't write questions from this — add a description or a source note", "info");
      setQuestions((q) => [...q, ...qs].slice(0, qMax));
    } catch (e: any) {
      showToast(aiError(e, "write those questions"), "error");
    } finally {
      setGeneratingKc(false);
    }
  };

  /** Writes (or extends) the page from the week's topic, objective and criteria. */
  const writePage = async () => {
    if (!item) return;
    setWritingPage(true);
    try {
      const r = await elearningApi.generatePage(item.item_id, {
        instruction: aiInstruction || undefined,
        content_html: pageHtml || undefined,
      });
      const d = r.data.data;
      setPageHtml(d.content_html);
      setPageJson(null); // the editor re-seeds from HTML
      setPageKey((k) => k + 1);
      if (d.title && (!title || title === "New page")) setTitle(d.title);
      // Tick the criteria the draft says it teaches, so alignment follows the content.
      if (context && d.covered_criteria?.length) {
        const matched = context.criteria.filter((c) => d.covered_criteria.includes(c.criteria_number)).map((c) => c.criteria_id);
        if (matched.length) setCriteriaIds((ids) => [...new Set([...ids, ...matched])]);
      }
      setAiInstruction("");
      showToast("Draft written — edit anything before saving", "success");
    } catch (e: any) {
      showToast(aiError(e, "write that page"), "error");
    } finally {
      setWritingPage(false);
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

  const typeLabel = copy.builder.itemTypes[item.item_type];

  /** Closing with unsaved edits used to discard them without a word. */
  const requestClose = async () => {
    if (!isDirty) return onClose();
    const ok = await confirm({
      title: "Discard your changes?",
      message: `"${title || typeLabel}" has edits that haven't been saved.`,
      confirmText: "Discard",
      cancelText: "Keep editing",
      tone: "warning",
    });
    if (ok) onClose();
  };

  const requestDelete = async () => {
    const ok = await confirm({
      title: `Remove "${title || typeLabel}"?`,
      message: (
        <>
          This takes the {typeLabel.toLowerCase()} off{" "}
          <strong>{context?.week_number || "this week"}</strong>. Students lose access to it and
          any progress recorded against it.
        </>
      ),
      details: isNote
        ? ["The lesson note itself is kept — only its place on the course is removed."]
        : ["The content is deleted with the item.", "This cannot be undone."],
      confirmText: "Remove from the week",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await onDelete(item.item_id);
      showToast(`"${title || typeLabel}" removed from ${context?.week_number || "the week"}`, "success");
      onClose();
    } catch (e: any) {
      showToast(e?.response?.data?.message || "Couldn't remove this item", "error");
    }
  };

  /** What the collapsed "More settings" block currently holds, in plain words. */
  const advancedSummary = [
    copy.builder.completionRules[rule],
    required ? "required" : "optional",
    minutes ? `${minutes} min` : null,
    dueAt ? "has a due date" : null,
    !isNote && criteriaIds.length ? `${criteriaIds.length} criteria` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-stretch justify-end"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={requestClose}
      >
        <motion.aside
          initial={{ y: 24, opacity: 0, scale: 0.99 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 36 }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") requestClose();
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
              e.preventDefault();
              save();
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`${typeLabel} — ${item.title}`}
          className={`el-float flex flex-col overflow-hidden ${
            wide ? "w-full h-full rounded-none" : "w-full sm:w-[560px] h-full rounded-none sm:rounded-l-3xl"
          }`}
        >
          {/* Title bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-white/[0.06] flex-shrink-0">
            <span className="w-9 h-9 rounded-xl el-chip flex items-center justify-center flex-shrink-0">
              <ItemTypeIcon type={item.item_type} className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{title || typeLabel}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <span className="truncate">
                  {typeLabel}
                  {context?.week_number ? ` · ${context.week_number}` : ""}
                </span>
                {isDirty && !hasBody && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-400/15 flex-shrink-0">
                    Unsaved
                  </span>
                )}
              </p>
            </div>
            {context && (
              <button
                onClick={() => setBriefOpen((o) => !o)}
                aria-pressed={briefOpen}
                className="lg:hidden w-10 h-10 flex items-center justify-center rounded-xl el-chip"
                aria-label="What this week teaches"
              >
                <Info className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => setWide((w) => !w)} className="hidden sm:flex w-10 h-10 items-center justify-center rounded-xl el-chip" aria-label={wide ? "Shrink" : "Full screen"}>
              {wide ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button onClick={requestClose} className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 min-h-0 flex">
          {/* The brief: what the scheme says this week must teach */}
          {context !== null && wide && (
            <aside className="hidden lg:block w-[320px] flex-shrink-0 border-r border-gray-100 dark:border-white/[0.06] overflow-y-auto p-4 el-subtle">
              <WeekContextPanel
                context={context}
                selectedCriteria={criteriaIds}
                onToggleCriterion={isNote ? undefined : (id) => setCriteriaIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))}
                lockedReason={isNote ? copy.builder.criteriaLockedOnNote : undefined}
                onOpenSource={isNote && item.ref_id ? () => window.open(`/lesson-notes/${item.ref_id}`, "_blank", "noopener") : undefined}
                openSourceLabel="Open the note to set them"
              />
            </aside>
          )}

          {/* Phone/tablet: the same brief as a sheet */}
          <AnimatePresence>
            {briefOpen && context && (
              <motion.div {...m("reveal")} className="lg:hidden absolute inset-x-0 top-[57px] bottom-0 z-10 el-float p-4 overflow-y-auto">
                <div className="flex items-center justify-end">
                  <button onClick={() => setBriefOpen(false)} className="min-h-[36px] px-3 rounded-pill el-chip text-xs font-semibold">Close</button>
                </div>
                <div className="mt-2">
                  <WeekContextPanel
                    context={context}
                    selectedCriteria={criteriaIds}
                    onToggleCriterion={isNote ? undefined : (id) => setCriteriaIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))}
                    lockedReason={isNote ? copy.builder.criteriaLockedOnNote : undefined}
                    onOpenSource={isNote && item.ref_id ? () => window.open(`/lesson-notes/${item.ref_id}`, "_blank", "noopener") : undefined}
                    openSourceLabel="Open the note to set them"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 min-w-0 overflow-y-auto p-4 md:p-5 space-y-5 max-w-3xl mx-auto w-full">
            <Field label="Title">
              <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>

            {/* The one setting with a visible consequence, said in a sentence rather than
                left as an unlabelled checkbox among five others. */}
            <button
              type="button"
              onClick={() => setPublished((p) => !p)}
              aria-pressed={published}
              className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${
                published
                  ? "border-success-500/40 bg-success-100/60 dark:bg-success-500/10"
                  : "border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.03]"
              }`}
            >
              <span
                className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  published
                    ? "bg-success-500/15 text-success-700 dark:text-success-500"
                    : "bg-gray-200 dark:bg-white/[0.08] text-gray-500 dark:text-gray-400"
                }`}
              >
                {published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900 dark:text-white">
                  {published ? "Students can see this" : "Hidden from students"}
                </span>
                <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                  {published
                    ? "It appears in the week as soon as the week is published."
                    : "Only you can see it while you finish it off."}
                </span>
              </span>
              <span
                className={`w-11 h-6 rounded-full flex-shrink-0 relative transition-colors ${
                  published ? "bg-success-500" : "bg-gray-300 dark:bg-white/20"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                    published ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </span>
            </button>

            {isNote && item.ref?.status === "DRAFT" && (
              <div className="flex items-center gap-3 p-3 rounded-xl el-chip-warning text-sm">
                <span className="flex-1">{copy.builder.noteDraftHint}</span>
                <button onClick={publishNote} className="min-h-[36px] px-3 rounded-pill bg-warning-500 text-white text-xs font-semibold">{copy.builder.publishNote}</button>
              </div>
            )}

            {(item.item_type === "FILE" || item.item_type === "SUBJECT_DOCUMENT") && <BuilderFilePreview itemId={item.item_id} />}

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
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 flex-1">Page content</span>
                </div>
                {/* Write with AI, grounded in this week's topic, objective and criteria */}
                <div className="mb-2 flex flex-col sm:flex-row gap-2 p-2 rounded-2xl el-subtle">
                  <input
                    value={aiInstruction}
                    onChange={(e) => setAiInstruction(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); writePage(); } }}
                    placeholder={pageHtml ? "Tell the AI what to change or add…" : "Optional: anything specific to cover?"}
                    className="el-input flex-1 !min-h-[40px] !bg-transparent dark:!bg-transparent !border-transparent"
                    aria-label="Instruction for the AI"
                  />
                  <motion.button
                    {...m("tap")}
                    type="button"
                    onClick={writePage}
                    disabled={writingPage}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-pill bg-gradient-to-r from-violet-600 to-brand-600 text-white text-xs font-semibold shadow-soft disabled:opacity-60 flex-shrink-0"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    {writingPage ? "Writing…" : pageHtml ? "Improve with AI" : "Write it with AI"}
                  </motion.button>
                </div>
                <div className={`rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden ${wide ? "min-h-[520px]" : "min-h-[320px]"}`}>
                  <LessonNoteRichEditor
                    key={pageKey}
                    initialContent={pageJson ?? (pageHtml || item.content_json) ?? null}
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

            {item.item_type === "EXIT_TICKET" && <ClassPulse itemId={item.item_id} />}
            {item.item_type === "FLASHCARDS" && <FlashcardsEditor cards={cards} onChange={setCards} />}
            {item.item_type === "PRACTICAL_TASK" && (
              <PracticalEditor checklist={checklist} onChange={setChecklist} criteria={(item.criteria || []).map((c) => c.criteria_number)} />
            )}
            {isQuestionItem && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Questions ({questions.length}/{qMax})</span>
                  <button onClick={generateQuestions} disabled={generatingKc} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-200 disabled:opacity-50">
                    <Sparkles className="w-3.5 h-3.5" /> {generatingKc ? "Writing…" : "Write 5 with AI"}
                  </button>
                </div>
                <ul className="space-y-3">
                  {questions.map((q, qi) => (
                    <li key={qi} className="rounded-xl border border-gray-200 dark:border-white/10 p-3 space-y-2">
                      <div className="flex gap-2">
                        <input className={input} placeholder={`Question ${qi + 1}`} value={q.prompt} onChange={(e) => setQuestions((qs) => qs.map((x, i) => (i === qi ? { ...x, prompt: e.target.value } : x)))} />
                        <button onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qi))} className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-danger-500" aria-label="Remove question"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <SelectField
                          value={q.type}
                          onChange={(e) => {
                            const type = e.target.value as KcQuestion["type"];
                            setQuestions((qs) => qs.map((x, i) => (i === qi ? { ...x, type, options: type === "TRUE_FALSE" ? ["True", "False"] : x.options.length >= 2 ? x.options : ["", ""], correct_index: 0 } : x)));
                          }}
                          className="min-h-[36px] px-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.05] text-gray-800 dark:text-gray-100"
                        >
                          <option value="MCQ">Multiple choice</option>
                          <option value="TRUE_FALSE">True / false</option>
                        </SelectField>
                        <span className="text-gray-400">tap the circle to mark the right answer</span>
                      </div>
                      <ul className="space-y-1.5">
                        {q.options.map((opt, oi) => (
                          <li key={oi} className="flex items-center gap-2">
                            <button
                              onClick={() => setQuestions((qs) => qs.map((x, i) => (i === qi ? { ...x, correct_index: oi } : x)))}
                              aria-label={`Mark option ${oi + 1} correct`}
                              className={`w-6 h-6 rounded-full border-2 flex-shrink-0 ${q.correct_index === oi ? "border-success-500 bg-success-500" : "border-gray-300 dark:border-white/20"}`}
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
                {questions.length < qMax && (
                  <button onClick={() => setQuestions((qs) => [...qs, { type: "MCQ", prompt: "", options: ["", ""], correct_index: 0 }])} className="mt-2 inline-flex items-center gap-1 min-h-[40px] px-3 rounded-pill el-chip text-sm text-gray-700 dark:text-gray-200">
                    <Plus className="w-4 h-4" /> Add question
                  </button>
                )}
              </div>
            )}

            {!isHeader && (
              <div className="rounded-2xl border border-gray-200 dark:border-white/10 overflow-hidden">
                {/* Every setting below has a working default. Collapsed, a first-time teacher
                    sees Title → visibility → content and nothing else to decide. */}
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((o) => !o)}
                  aria-expanded={advancedOpen}
                  className="w-full flex items-center gap-2 px-3.5 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 transition-colors"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">
                      More settings
                    </span>
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      {advancedSummary}
                    </span>
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {advancedOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-3.5 pb-4 pt-1 space-y-4 border-t border-gray-100 dark:border-white/[0.06]">
                <div>
                  <span className="block text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-1">Counts as done when the student…</span>
                  <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Completion rule">
                    {RULES.map((r) => (
                      <button
                        key={r}
                        role="radio"
                        aria-checked={rule === r}
                        onClick={() => setRule(r)}
                        className={`min-h-[44px] px-3 rounded-xl text-sm border text-left ${rule === r ? "border-brand-500 el-chip-brand" : "border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200"}`}
                      >
                        {copy.builder.completionRules[r]}
                        {r === "MIN_SCORE" && rule === "MIN_SCORE" && (
                          <span className="inline-flex items-center gap-1 ml-1">
                            <input type="number" min={1} max={100} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} onClick={(e) => e.stopPropagation()} className="w-14 px-1 rounded-md border border-brand-200 bg-white dark:bg-white/[0.05] text-center" aria-label="Minimum score percent" />%
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  {["SUBMIT", "MIN_SCORE"].includes(rule) && !["KNOWLEDGE_CHECK", "TASKMENTOR_QUIZ", "TASKMENTOR_ASSIGNMENT"].includes(item.item_type) && (
                    <p className="mt-1 text-[11px] text-warning-700 dark:text-warning-500">Only a quick check or a Task Mentor result can satisfy this rule.</p>
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

                <label className="flex items-start justify-between gap-3 min-h-[44px] cursor-pointer">
                  <span className="min-w-0">
                    <span className="block text-sm text-gray-800 dark:text-gray-100">Required to finish the week</span>
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                      Untick for extra reading a student can skip.
                    </span>
                  </span>
                  <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="w-5 h-5 accent-brand-500 flex-shrink-0 mt-0.5" />
                </label>

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
                                className={`text-[11px] px-2 py-1 rounded-pill border min-h-[28px] ${on ? "bg-brand-500 border-brand-500 text-white" : "border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300"}`}
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
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          </div>

          <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 dark:border-white/[0.06] flex-shrink-0">
            <button
              onClick={requestDelete}
              className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-pill text-sm text-danger-700 dark:text-danger-500 hover:bg-danger-100 dark:hover:bg-danger-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500/50 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Remove
            </button>
            <span className="flex-1" />
            {isDirty && !hasBody && (
              <span className="hidden sm:inline text-[11px] text-gray-400 mr-1">Unsaved changes</span>
            )}
            <button onClick={requestClose} className="min-h-[44px] px-4 rounded-pill text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/50 transition-colors">Cancel</button>
            <button
              onClick={save}
              disabled={saving || !isDirty}
              title={isDirty ? "Save (⌘S)" : "Nothing has changed yet"}
              className="min-h-[44px] px-5 rounded-pill bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 transition-all disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
};

export default ItemSettingsDrawer;
