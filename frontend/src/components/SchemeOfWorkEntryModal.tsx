import React, { useState, useEffect } from "react";
import Modal from "./ui/Modal";
import {
  SchemeEntry,
  LinkedCriteria,
  schemeOfWorkApi,
  DEFAULT_ENTRY_PROMPT_TEMPLATE,
} from "../api/schemeOfWork";
import { competenciesApi } from "../api/curriculum";
import { useToast } from "../contexts/ToastContext";
import {
  BookOpen,
  Target,
  Sword,
  Wrench,
  BarChart,
  Calendar,
  Hash,
  MapPin,
  Clock,
  StickyNote,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  ListChecks,
} from "lucide-react";

interface SchemeOfWorkEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<SchemeEntry> & { criteria_ids?: number[] }) => Promise<void>;
  initialData?: SchemeEntry | null;
  title: string;
  /** When true, week number/dates are auto-calculated server-side (inserting mid-timeline) and hidden from the form. */
  isInsertMode?: boolean;
  subjectId?: number;
  subjectName?: string;
}

const emptyForm: Partial<SchemeEntry> = {
  week_number: "",
  start_date: "",
  end_date: "",
  topic: "",
  sub_topic: "",
  objective: "",
  methodology: "",
  resources: "",
  evaluation: "",
  duration: "",
  learning_place: "",
  observation: "",
};

const SchemeOfWorkEntryModal: React.FC<SchemeOfWorkEntryModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  title,
  isInsertMode,
  subjectId,
  subjectName,
}) => {
  const { showToast } = useToast();
  const [formData, setFormData] = useState<Partial<SchemeEntry>>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(DEFAULT_ENTRY_PROMPT_TEMPLATE);
  const [isGenerating, setIsGenerating] = useState(false);

  // Curriculum Performance Criteria this entry addresses — AI-suggested, manually correctable.
  // See CURRICULUM_SCHEME_OF_WORK_RELATIONSHIP_ANALYSIS.md §4.
  const [showCriteriaPanel, setShowCriteriaPanel] = useState(false);
  const [availableCriteria, setAvailableCriteria] = useState<LinkedCriteria[]>([]);
  const [selectedCriteriaIds, setSelectedCriteriaIds] = useState<Set<number>>(new Set());
  const [isSuggestingCriteria, setIsSuggestingCriteria] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        week_number: initialData.week_number,
        start_date: initialData.start_date
          ? initialData.start_date.split("T")[0]
          : "",
        end_date: initialData.end_date
          ? initialData.end_date.split("T")[0]
          : "",
        topic: initialData.topic,
        sub_topic: initialData.sub_topic || "",
        objective: initialData.objective,
        methodology: initialData.methodology,
        resources: initialData.resources,
        evaluation: initialData.evaluation,
        duration: initialData.duration || "",
        learning_place: initialData.learning_place || "",
        observation: initialData.observation || "",
      });
      setSelectedCriteriaIds(
        new Set((initialData.criteria || []).map((c) => c.criteria_id)),
      );
    } else {
      setFormData(emptyForm);
      setSelectedCriteriaIds(new Set());
    }
    setShowAIPanel(false);
    setAiPrompt(DEFAULT_ENTRY_PROMPT_TEMPLATE);
    setShowCriteriaPanel(false);
  }, [initialData, isOpen]);

  useEffect(() => {
    if (!isOpen || !subjectId) {
      setAvailableCriteria([]);
      return;
    }
    let cancelled = false;
    competenciesApi
      .getAll(subjectId)
      .then((resp) => {
        if (cancelled) return;
        const criteria: LinkedCriteria[] = (resp.data.data || []).flatMap((el) =>
          el.criteria.map((c) => ({
            criteria_id: c.criteria_id,
            criteria_number: c.criteria_number,
            description: c.description,
          })),
        );
        setAvailableCriteria(criteria);
      })
      .catch(() => {
        /* non-fatal: criteria linking simply won't be available for this entry */
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, subjectId]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const resp = await schemeOfWorkApi.suggestEntryContent({
        subject_name: subjectName,
        week_label: formData.week_number || undefined,
        prompt: aiPrompt,
      });
      const suggestion = resp.data.data;
      setFormData((prev) => ({
        ...prev,
        topic: suggestion.topic,
        sub_topic: suggestion.sub_topic ?? prev.sub_topic,
        objective: suggestion.objective,
        methodology: suggestion.methodology,
        resources: suggestion.resources,
        evaluation: suggestion.evaluation,
        duration: suggestion.duration ?? prev.duration,
        learning_place: suggestion.learning_place ?? prev.learning_place,
        observation: suggestion.observation ?? prev.observation,
      }));
      showToast("AI suggestion applied — review before saving", "success");
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Could not generate content",
        "error",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSuggestCriteria = async () => {
    if (!subjectId) return;
    setIsSuggestingCriteria(true);
    setShowCriteriaPanel(true);
    try {
      const resp = await schemeOfWorkApi.suggestEntryCriteria({
        subject_id: subjectId,
        topic: formData.topic,
        sub_topic: formData.sub_topic,
        objective: formData.objective,
        methodology: formData.methodology,
      });
      const suggested = resp.data.data.criteria;
      if (suggested.length === 0) {
        showToast("No matching performance criteria found — you can still select manually", "info");
      } else {
        setSelectedCriteriaIds(new Set(suggested.map((c) => c.criteria_id)));
        showToast(
          `Suggested ${suggested.length} matching performance criteria — review below`,
          "success",
        );
      }
    } catch (error: any) {
      showToast(
        error.response?.data?.message || "Could not suggest criteria",
        "error",
      );
    } finally {
      setIsSuggestingCriteria(false);
    }
  };

  const toggleCriteria = (criteriaId: number) => {
    setSelectedCriteriaIds((prev) => {
      const next = new Set(prev);
      if (next.has(criteriaId)) next.delete(criteriaId);
      else next.add(criteriaId);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave({
        ...formData,
        ...(subjectId ? { criteria_ids: Array.from(selectedCriteriaIds) } : {}),
      });
      onClose();
    } catch (error) {
      console.error("Failed to save entry:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* AI Assist Section */}
        <div className="rounded-3xl border border-violet-100 dark:border-violet-900/40 bg-violet-50/50 dark:bg-violet-900/10 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAIPanel((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-violet-700 dark:text-violet-300">
              <Sparkles className="w-4 h-4" />
              Generate with AI
            </span>
            {showAIPanel ? (
              <ChevronUp className="w-4 h-4 text-violet-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-violet-500" />
            )}
          </button>
          {showAIPanel && (
            <div className="px-5 pb-5 space-y-3">
              <p className="text-xs text-violet-600/80 dark:text-violet-400/80">
                Describe what this week should cover — edit the template below, then generate. You can review and
                tweak everything before saving.
              </p>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 text-sm bg-white dark:bg-gray-900 border border-violet-200 dark:border-violet-800/50 rounded-2xl text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all resize-none"
              />
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || !aiPrompt.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-full transition-all shadow-sm active:scale-95 disabled:opacity-50"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {isGenerating ? "Generating..." : "Generate Content"}
              </button>
            </div>
          )}
        </div>

        {/* Curriculum Performance Criteria Section — AI-suggested, manually correctable */}
        {subjectId != null && availableCriteria.length > 0 && (
          <div className="rounded-3xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-900/10 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCriteriaPanel((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-bold text-blue-700 dark:text-blue-300">
                <ListChecks className="w-4 h-4" />
                Performance Criteria Covered
                {selectedCriteriaIds.size > 0 && (
                  <span className="text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                    {selectedCriteriaIds.size} selected
                  </span>
                )}
              </span>
              {showCriteriaPanel ? (
                <ChevronUp className="w-4 h-4 text-blue-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-blue-500" />
              )}
            </button>
            {showCriteriaPanel && (
              <div className="px-5 pb-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-blue-600/80 dark:text-blue-400/80">
                    Optional — which Curriculum Performance Criteria does this week address?
                  </p>
                  <button
                    type="button"
                    onClick={handleSuggestCriteria}
                    disabled={isSuggestingCriteria}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-all shadow-sm active:scale-95 disabled:opacity-50"
                  >
                    {isSuggestingCriteria ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {isSuggestingCriteria ? "Matching..." : "Suggest with AI"}
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {availableCriteria.map((c) => (
                    <label
                      key={c.criteria_id}
                      className={`flex items-start gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                        selectedCriteriaIds.has(c.criteria_id)
                          ? "bg-white dark:bg-gray-900/50 border border-blue-200 dark:border-blue-800/50"
                          : "hover:bg-white/60 dark:hover:bg-gray-900/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCriteriaIds.has(c.criteria_id)}
                        onChange={() => toggleCriteria(c.criteria_id)}
                        className="mt-0.5 accent-blue-600 flex-shrink-0"
                      />
                      <span className="text-xs">
                        <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 mr-1.5">
                          {c.criteria_number}
                        </span>
                        <span className="text-gray-600 dark:text-gray-300">{c.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Header Metadata Section */}
        {isInsertMode ? (
          <div className="px-4 py-3 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 text-xs font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
            <Calendar className="w-4 h-4 flex-shrink-0" />
            The week number and dates will be calculated automatically, and every following week will shift to make
            room for this one.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">
                <Hash className="w-3 h-3" />
                Week Number
              </label>
              <input
                name="week_number"
                value={formData.week_number}
                onChange={handleChange}
                placeholder="e.g. Week 1"
                required
                className="w-full h-11 px-4 text-sm bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-full text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400"
              />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">
                <Calendar className="w-3 h-3" />
                Start Date
              </label>
              <input
                name="start_date"
                type="date"
                value={formData.start_date}
                onChange={handleChange}
                required
                className="w-full h-11 px-4 text-sm bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-full text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">
                <Calendar className="w-3 h-3" />
                End Date
              </label>
              <input
                name="end_date"
                type="date"
                value={formData.end_date}
                onChange={handleChange}
                required
                className="w-full h-11 px-4 text-sm bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-full text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
            </div>
          </div>
        )}

        {/* Content Section */}
        <div className="space-y-5">
          <div className="bg-gray-50/50 dark:bg-gray-900/20 p-5 rounded-3xl border border-gray-100 dark:border-gray-800/50 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest ml-1">
                  <BookOpen className="w-4 h-4" />
                  Topic & Indicative Content
                </label>
                <textarea
                  name="topic"
                  value={formData.topic}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-5 py-3 text-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400 resize-none"
                  placeholder="What will be covered this week?"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[11px] font-bold text-blue-500 dark:text-blue-300 uppercase tracking-widest ml-1">
                  <BookOpen className="w-4 h-4" />
                  Sub-topic
                </label>
                <textarea
                  name="sub_topic"
                  value={formData.sub_topic}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-5 py-3 text-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400 resize-none"
                  placeholder="A narrower focus within the topic (optional)"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[11px] font-bold text-green-600 dark:text-green-400 uppercase tracking-widest ml-1">
                <Target className="w-4 h-4" />
                Learning Outcomes / Objectives
              </label>
              <textarea
                name="objective"
                value={formData.objective}
                onChange={handleChange}
                rows={2}
                className="w-full px-5 py-3 text-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all placeholder:text-gray-400 resize-none"
                placeholder="What should students be able to do?"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest ml-1">
                  <Sword className="w-4 h-4" />
                  Methodology / Activities
                </label>
                <textarea
                  name="methodology"
                  value={formData.methodology}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-5 py-3 text-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all placeholder:text-gray-400 resize-none"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[11px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest ml-1">
                  <Wrench className="w-4 h-4" />
                  Resources
                </label>
                <textarea
                  name="resources"
                  value={formData.resources}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-5 py-3 text-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all placeholder:text-gray-400 resize-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest ml-1">
                <BarChart className="w-4 h-4" />
                Evaluation / Assessment
              </label>
              <textarea
                name="evaluation"
                value={formData.evaluation}
                onChange={handleChange}
                rows={2}
                className="w-full px-5 py-3 text-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all placeholder:text-gray-400 resize-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest ml-1">
                  <Clock className="w-4 h-4" />
                  Duration
                </label>
                <input
                  name="duration"
                  value={formData.duration}
                  onChange={handleChange}
                  placeholder="e.g. 5 hours"
                  className="w-full h-11 px-4 text-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-full text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-400/20 outline-none transition-all placeholder:text-gray-400"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest ml-1">
                  <MapPin className="w-4 h-4" />
                  Learning Place
                </label>
                <input
                  name="learning_place"
                  value={formData.learning_place}
                  onChange={handleChange}
                  placeholder="e.g. Computer Lab"
                  className="w-full h-11 px-4 text-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-full text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-400/20 outline-none transition-all placeholder:text-gray-400"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest ml-1">
                  <StickyNote className="w-4 h-4" />
                  Observation
                </label>
                <input
                  name="observation"
                  value={formData.observation}
                  onChange={handleChange}
                  placeholder="Notes (optional)"
                  className="w-full h-11 px-4 text-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-full text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-400/20 outline-none transition-all placeholder:text-gray-400"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t border-gray-50 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-8 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-all shadow-lg shadow-blue-500/25 active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving && (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            )}
            {isSaving
              ? "Saving..."
              : initialData
                ? "Update Week"
                : isInsertMode
                  ? "Insert Week"
                  : "Save Week Entry"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default SchemeOfWorkEntryModal;
