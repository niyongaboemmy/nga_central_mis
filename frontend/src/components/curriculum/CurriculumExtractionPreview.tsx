import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
import {
  curriculumImportApi,
  ExtractedElement,
  ImportedElementDraft,
  ImportedCriteriaDraft,
} from "../../api/curriculum";
import { useToast } from "../../contexts/ToastContext";

interface CurriculumExtractionPreviewProps {
  subjectId: number;
  initialElements: ExtractedElement[];
  sourceFilename?: string;
  jobId?: string;
  /** Called after a successful save, with the number of elements created. */
  onSaved: (count: number) => void;
  onCancel: () => void;
  cancelLabel?: string;
}

/**
 * Editable review table for AI-extracted curriculum (Elements of Competency + Performance
 * Criteria) — select/deselect/edit anything before it's written to the database. Shared by the
 * standalone "Import from Curriculum" modal and the Scheme-of-Work AI-generation wizard's
 * curriculum step, so both flows present and save the exact same reviewable structure. See
 * CURRICULUM_SCHEME_OF_WORK_INTEGRATION_IMPLEMENTATION_PLAN.md §6.2.
 */
const CurriculumExtractionPreview: React.FC<CurriculumExtractionPreviewProps> = ({
  subjectId,
  initialElements,
  sourceFilename,
  jobId,
  onSaved,
  onCancel,
  cancelLabel = "Start over",
}) => {
  const { showToast } = useToast();
  const [elements, setElements] = useState<ImportedElementDraft[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const drafted: ImportedElementDraft[] = initialElements.map((el) => ({
      ...el,
      _selected: true,
      criteria: el.criteria.map((c) => ({ ...c, _selected: true })),
    }));
    setElements(drafted);
    setExpandedIdx(new Set(drafted.map((_, i) => i)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialElements]);

  const toggleElementSelected = (idx: number) => {
    setElements((prev) =>
      prev.map((el, i) => (i === idx ? { ...el, _selected: !el._selected } : el)),
    );
  };

  const toggleCriteriaSelected = (elIdx: number, cIdx: number) => {
    setElements((prev) =>
      prev.map((el, i) =>
        i === elIdx
          ? {
              ...el,
              criteria: el.criteria.map((c, j) =>
                j === cIdx ? { ...c, _selected: !c._selected } : c,
              ),
            }
          : el,
      ),
    );
  };

  const updateElementField = (
    idx: number,
    field: keyof ImportedElementDraft,
    value: any,
  ) => {
    setElements((prev) =>
      prev.map((el, i) => (i === idx ? { ...el, [field]: value } : el)),
    );
  };

  const updateCriteriaField = (
    elIdx: number,
    cIdx: number,
    field: keyof ImportedCriteriaDraft,
    value: any,
  ) => {
    setElements((prev) =>
      prev.map((el, i) =>
        i === elIdx
          ? {
              ...el,
              criteria: el.criteria.map((c, j) =>
                j === cIdx ? { ...c, [field]: value } : c,
              ),
            }
          : el,
      ),
    );
  };

  const removeCriteria = (elIdx: number, cIdx: number) => {
    setElements((prev) =>
      prev.map((el, i) =>
        i === elIdx
          ? { ...el, criteria: el.criteria.filter((_, j) => j !== cIdx) }
          : el,
      ),
    );
  };

  const toggleExpand = (idx: number) => {
    setExpandedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectedCount = elements.filter((e) => e._selected).length;

  const handleConfirm = async () => {
    const toSave = elements
      .filter((e) => e._selected)
      .map((e, i) => ({
        element_number: i + 1,
        title: e.title.trim(),
        description: e.description.trim(),
        learning_hours: e.learning_hours,
        indicative_content: e.indicative_content.trim(),
        criteria: e.criteria
          .filter((c) => c._selected)
          .map((c) => ({
            criteria_number: c.criteria_number.trim(),
            description: c.description.trim(),
          })),
      }));

    if (toSave.length === 0) {
      showToast("Select at least one element to import", "error");
      return;
    }
    const missingCriteria = toSave.find((e) => e.criteria.length === 0);
    if (missingCriteria) {
      showToast(
        `"${missingCriteria.title}" needs at least one selected performance criteria`,
        "error",
      );
      return;
    }

    setIsSaving(true);
    try {
      const res = await curriculumImportApi.confirm(subjectId, {
        elements: toSave,
        jobId,
        source_filename: sourceFilename,
      });
      showToast(
        `Imported ${res.data.data.count} element${res.data.data.count !== 1 ? "s" : ""} of competency`,
        "success",
      );
      onSaved(res.data.data.count);
    } catch (err: any) {
      showToast(
        err?.response?.data?.message || "Failed to save imported curriculum",
        "error",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Review extracted curriculum
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {selectedCount} of {elements.length} element
            {elements.length !== 1 ? "s" : ""} selected · edit anything before
            saving
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full">
          <AlertTriangle className="w-3.5 h-3.5" />
          Nothing is saved yet
        </div>
      </div>

      <div className="space-y-3 max-h-[52vh] overflow-y-auto pr-1">
        {elements.map((el, idx) => {
          const isExpanded = expandedIdx.has(idx);
          return (
            <div
              key={idx}
              className={`rounded-2xl border overflow-hidden transition-colors ${
                el._selected
                  ? "border-violet-200 dark:border-violet-800/50 bg-white dark:bg-gray-800/30"
                  : "border-gray-200 dark:border-gray-700/30 bg-gray-50 dark:bg-gray-900/20 opacity-60"
              }`}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={el._selected}
                  onChange={() => toggleElementSelected(idx)}
                  className="accent-violet-600 w-4 h-4 flex-shrink-0"
                />
                <button
                  onClick={() => toggleExpand(idx)}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                >
                  <span className="flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400 text-xs font-bold">
                    {idx + 1}
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                    {el.title || "(untitled element)"}
                  </span>
                  {el.learning_hours != null && (
                    <span className="flex-shrink-0 flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                      <Clock className="w-3 h-3" />
                      {el.learning_hours}h
                    </span>
                  )}
                  <span className="flex-shrink-0 text-xs bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                    {el.criteria.filter((c) => c._selected).length}/
                    {el.criteria.length} criteria
                  </span>
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="ml-auto flex-shrink-0"
                  >
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </motion.div>
                </button>
              </div>

              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: "hidden" }}
                  >
                    <div className="border-t border-gray-100 dark:border-gray-700/20 px-4 pb-4 pt-3 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Title
                          </label>
                          <input
                            type="text"
                            value={el.title}
                            onChange={(e) =>
                              updateElementField(idx, "title", e.target.value)
                            }
                            className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Learning hours
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={el.learning_hours ?? ""}
                            onChange={(e) =>
                              updateElementField(
                                idx,
                                "learning_hours",
                                e.target.value === ""
                                  ? null
                                  : parseInt(e.target.value, 10),
                              )
                            }
                            className="w-24 px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Description
                        </label>
                        <textarea
                          rows={2}
                          value={el.description}
                          onChange={(e) =>
                            updateElementField(idx, "description", e.target.value)
                          }
                          className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          Indicative content
                          <span className="text-gray-400 font-normal ml-1">
                            (one line per topic)
                          </span>
                        </label>
                        <textarea
                          rows={4}
                          value={el.indicative_content}
                          onChange={(e) =>
                            updateElementField(
                              idx,
                              "indicative_content",
                              e.target.value,
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono text-xs resize-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                          Performance criteria
                        </label>
                        <div className="space-y-1.5">
                          {el.criteria.map((c, cIdx) => (
                            <div
                              key={cIdx}
                              className={`flex items-start gap-2 rounded-lg p-2 ${
                                c._selected
                                  ? "bg-gray-50 dark:bg-gray-900/30"
                                  : "bg-gray-50/50 dark:bg-gray-900/10 opacity-50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={c._selected}
                                onChange={() =>
                                  toggleCriteriaSelected(idx, cIdx)
                                }
                                className="accent-violet-600 w-3.5 h-3.5 mt-1.5 flex-shrink-0"
                              />
                              <input
                                type="text"
                                value={c.criteria_number}
                                onChange={(e) =>
                                  updateCriteriaField(
                                    idx,
                                    cIdx,
                                    "criteria_number",
                                    e.target.value,
                                  )
                                }
                                className="w-16 flex-shrink-0 px-2 py-1 text-xs font-mono rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                              />
                              <textarea
                                rows={1}
                                value={c.description}
                                onChange={(e) =>
                                  updateCriteriaField(
                                    idx,
                                    cIdx,
                                    "description",
                                    e.target.value,
                                  )
                                }
                                className="flex-1 px-2 py-1 text-xs rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
                              />
                              <button
                                onClick={() => removeCriteria(idx, cIdx)}
                                className="p-1 rounded-full text-gray-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end gap-3 pt-1 border-t border-gray-100 dark:border-gray-700/30">
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="mt-4 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800/60 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          onClick={handleConfirm}
          disabled={isSaving || selectedCount === 0}
          className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-full transition-colors shadow-sm"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          {isSaving
            ? "Saving..."
            : `Save ${selectedCount} Element${selectedCount !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
};

export default CurriculumExtractionPreview;
