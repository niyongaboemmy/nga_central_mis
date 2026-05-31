import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  ChevronDown,
  Pencil,
  Trash2,
  BookOpen,
  Check,
  X,
  Loader2,
} from "lucide-react";
import {
  competenciesApi,
  criteriaApi,
  SubjectCompetency,
  PerformanceCriteria,
} from "../../api/curriculum";
import { useToast } from "../../contexts/ToastContext";
import usePermissions from "../../hooks/usePermissions";
import { Permissions } from "../../constants/permissions";
import CompetencyFormModal from "./CompetencyFormModal";

interface CurriculumTabProps {
  subjectId: number;
}

interface InlineCriteriaForm {
  competencyId: number;
  criteriaId?: number;
  criteria_number: string;
  description: string;
}

const CurriculumTab: React.FC<CurriculumTabProps> = ({ subjectId }) => {
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(Permissions.MANAGE_CURRICULUM);

  const [competencies, setCompetencies] = useState<SubjectCompetency[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCompetency, setEditingCompetency] =
    useState<SubjectCompetency | null>(null);
  const [deletingCompetencyId, setDeletingCompetencyId] = useState<
    number | null
  >(null);
  const [inlineCriteriaForm, setInlineCriteriaForm] =
    useState<InlineCriteriaForm | null>(null);
  const [criteriaFormSaving, setCriteriaFormSaving] = useState(false);
  const [deletingCriteriaId, setDeletingCriteriaId] = useState<number | null>(
    null,
  );

  useEffect(() => {
    loadCompetencies();
  }, [subjectId]);

  const loadCompetencies = async () => {
    try {
      const res = await competenciesApi.getAll(subjectId);
      const data = res.data.data || [];
      setCompetencies(data);
      // Auto-expand all on first load
      setExpandedIds(new Set(data.map((c) => c.competency_id)));
    } catch {
      showToast("Failed to load competencies", "error");
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCompetencySaved = (saved: SubjectCompetency) => {
    setCompetencies((prev) => {
      const idx = prev.findIndex(
        (c) => c.competency_id === saved.competency_id,
      );
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...saved };
        return updated;
      }
      return [...prev, saved];
    });
    setExpandedIds((prev) => new Set(prev).add(saved.competency_id));
  };

  const handleDeleteCompetency = async (competency: SubjectCompetency) => {
    if (!window.confirm(`Delete "${competency.title}" and all its criteria?`))
      return;
    setDeletingCompetencyId(competency.competency_id);
    try {
      await competenciesApi.delete(subjectId, competency.competency_id);
      setCompetencies((prev) =>
        prev.filter((c) => c.competency_id !== competency.competency_id),
      );
      showToast("Competency deleted", "success");
    } catch {
      showToast("Failed to delete competency", "error");
    } finally {
      setDeletingCompetencyId(null);
    }
  };

  const openAddCriteria = (competencyId: number) => {
    setInlineCriteriaForm({
      competencyId,
      criteria_number: "",
      description: "",
    });
  };

  const openEditCriteria = (criteria: PerformanceCriteria) => {
    setInlineCriteriaForm({
      competencyId: criteria.competency_id,
      criteriaId: criteria.criteria_id,
      criteria_number: criteria.criteria_number,
      description: criteria.description,
    });
  };

  const handleCriteriaSubmit = async () => {
    if (!inlineCriteriaForm) return;
    const { competencyId, criteriaId, criteria_number, description } =
      inlineCriteriaForm;

    if (!criteria_number.trim() || !description.trim()) {
      showToast("Both fields are required", "error");
      return;
    }

    setCriteriaFormSaving(true);
    try {
      if (criteriaId) {
        const res = await criteriaApi.update(criteriaId, {
          criteria_number,
          description,
        });
        const updated: PerformanceCriteria = res.data.data;
        setCompetencies((prev) =>
          prev.map((c) =>
            c.competency_id === competencyId
              ? {
                  ...c,
                  criteria: c.criteria.map((cr) =>
                    cr.criteria_id === criteriaId ? updated : cr,
                  ),
                }
              : c,
          ),
        );
        showToast("Criteria updated", "success");
      } else {
        const res = await criteriaApi.create(competencyId, {
          criteria_number,
          description,
        });
        const created: PerformanceCriteria = res.data.data;
        setCompetencies((prev) =>
          prev.map((c) =>
            c.competency_id === competencyId
              ? { ...c, criteria: [...c.criteria, created] }
              : c,
          ),
        );
        showToast("Criteria added", "success");
      }
      setInlineCriteriaForm(null);
    } catch {
      showToast("Failed to save criteria", "error");
    } finally {
      setCriteriaFormSaving(false);
    }
  };

  const handleDeleteCriteria = async (
    competencyId: number,
    criteriaId: number,
  ) => {
    if (!window.confirm("Delete this performance criteria?")) return;
    setDeletingCriteriaId(criteriaId);
    try {
      await criteriaApi.delete(criteriaId);
      setCompetencies((prev) =>
        prev.map((c) =>
          c.competency_id === competencyId
            ? {
                ...c,
                criteria: c.criteria.filter(
                  (cr) => cr.criteria_id !== criteriaId,
                ),
              }
            : c,
        ),
      );
      showToast("Criteria deleted", "success");
    } catch {
      showToast("Failed to delete criteria", "error");
    } finally {
      setDeletingCriteriaId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Elements of Competency
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {competencies.length} element
            {competencies.length !== 1 ? "s" : ""}
            {competencies.reduce((sum, c) => sum + c.criteria.length, 0) > 0 &&
              ` · ${competencies.reduce((sum, c) => sum + c.criteria.length, 0)} performance criteria`}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => {
              setEditingCompetency(null);
              setShowAddModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Element
          </button>
        )}
      </div>

      {/* Empty state */}
      {competencies.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 text-blue-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            No elements yet
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
            {canManage
              ? "Add the first element of competency to describe what students will learn."
              : "No elements of competency have been defined for this subject yet."}
          </p>
          {canManage && (
            <button
              onClick={() => {
                setEditingCompetency(null);
                setShowAddModal(true);
              }}
              className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add First Element
            </button>
          )}
        </div>
      )}

      {/* Competency accordion list */}
      <motion.div
        className="space-y-3"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.05 } },
          hidden: {},
        }}
      >
        {competencies.map((comp) => {
          const isExpanded = expandedIds.has(comp.competency_id);
          const isDeleting = deletingCompetencyId === comp.competency_id;

          return (
            <motion.div
              key={comp.competency_id}
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0 },
              }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700/50 overflow-hidden shadow-sm"
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => toggleExpand(comp.competency_id)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <span className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-xs font-bold">
                    {comp.element_number}
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                    {comp.title}
                  </span>
                  {comp.criteria.length > 0 && (
                    <span className="flex-shrink-0 text-xs bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                      {comp.criteria.length} criteria
                    </span>
                  )}
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="ml-auto flex-shrink-0"
                  >
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </motion.div>
                </button>

                {canManage && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => {
                        setEditingCompetency(comp);
                        setShowAddModal(true);
                      }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteCompetency(comp)}
                      disabled={isDeleting}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      {isDeleting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Expanded body */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    key="body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeInOut" }}
                    style={{ overflow: "hidden" }}
                  >
                    <div className="border-t border-gray-100 dark:border-slate-700/50 px-4 pb-4 pt-3 space-y-3">
                      {/* Description */}
                      {comp.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 pl-10">
                          {comp.description}
                        </p>
                      )}

                      {/* Criteria table */}
                      {comp.criteria.length > 0 && (
                        <div className="border border-gray-200 dark:border-slate-700/50 rounded-xl overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700/50">
                                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 w-24">
                                  Criteria
                                </th>
                                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400">
                                  Performance Criteria
                                </th>
                                {canManage && <th className="w-16" />}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/30">
                              {comp.criteria.map((cr) => {
                                const isEditingThis =
                                  inlineCriteriaForm?.criteriaId ===
                                  cr.criteria_id;
                                const isDeletingThis =
                                  deletingCriteriaId === cr.criteria_id;

                                if (isEditingThis) {
                                  return (
                                    <InlineCriteriaFormRow
                                      key={cr.criteria_id}
                                      form={inlineCriteriaForm!}
                                      onChange={setInlineCriteriaForm}
                                      onSave={handleCriteriaSubmit}
                                      onCancel={() =>
                                        setInlineCriteriaForm(null)
                                      }
                                      saving={criteriaFormSaving}
                                    />
                                  );
                                }

                                return (
                                  <tr
                                    key={cr.criteria_id}
                                    className="group hover:bg-gray-50 dark:hover:bg-slate-800/30 transition-colors"
                                  >
                                    <td className="py-2.5 px-3">
                                      <span className="inline-flex items-center justify-center min-w-[2rem] h-6 px-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-mono font-semibold rounded-md">
                                        {cr.criteria_number}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300 text-sm">
                                      {cr.description}
                                    </td>
                                    {canManage && (
                                      <td className="py-2.5 px-3">
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button
                                            onClick={() =>
                                              openEditCriteria(cr)
                                            }
                                            className="p-1 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                                          >
                                            <Pencil className="w-3 h-3" />
                                          </button>
                                          <button
                                            onClick={() =>
                                              handleDeleteCriteria(
                                                comp.competency_id,
                                                cr.criteria_id,
                                              )
                                            }
                                            disabled={isDeletingThis}
                                            className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                                          >
                                            {isDeletingThis ? (
                                              <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                              <Trash2 className="w-3 h-3" />
                                            )}
                                          </button>
                                        </div>
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}

                              {/* Inline add form at bottom of table */}
                              {inlineCriteriaForm?.competencyId ===
                                comp.competency_id &&
                                !inlineCriteriaForm.criteriaId && (
                                  <InlineCriteriaFormRow
                                    form={inlineCriteriaForm}
                                    onChange={setInlineCriteriaForm}
                                    onSave={handleCriteriaSubmit}
                                    onCancel={() =>
                                      setInlineCriteriaForm(null)
                                    }
                                    saving={criteriaFormSaving}
                                  />
                                )}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Empty criteria: inline form or prompt */}
                      {comp.criteria.length === 0 &&
                        inlineCriteriaForm?.competencyId ===
                          comp.competency_id && (
                          <div className="border border-gray-200 dark:border-slate-700/50 rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                              <tbody>
                                <InlineCriteriaFormRow
                                  form={inlineCriteriaForm}
                                  onChange={setInlineCriteriaForm}
                                  onSave={handleCriteriaSubmit}
                                  onCancel={() => setInlineCriteriaForm(null)}
                                  saving={criteriaFormSaving}
                                />
                              </tbody>
                            </table>
                          </div>
                        )}

                      {/* Add criteria button */}
                      {canManage &&
                        inlineCriteriaForm?.competencyId !==
                          comp.competency_id && (
                          <button
                            onClick={() =>
                              openAddCriteria(comp.competency_id)
                            }
                            className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Performance Criteria
                          </button>
                        )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </motion.div>

      <CompetencyFormModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingCompetency(null);
        }}
        onSaved={handleCompetencySaved}
        subjectId={subjectId}
        editingCompetency={editingCompetency}
      />
    </div>
  );
};

interface InlineCriteriaFormRowProps {
  form: InlineCriteriaForm;
  onChange: (f: InlineCriteriaForm) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

const InlineCriteriaFormRow: React.FC<InlineCriteriaFormRowProps> = ({
  form,
  onChange,
  onSave,
  onCancel,
  saving,
}) => {
  const numberRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    numberRef.current?.focus();
  }, []);

  return (
    <tr className="bg-blue-50/50 dark:bg-blue-900/10">
      <td className="py-2 px-3 align-top w-24">
        <input
          ref={numberRef}
          type="text"
          value={form.criteria_number}
          onChange={(e) => onChange({ ...form, criteria_number: e.target.value })}
          placeholder="1.1"
          maxLength={20}
          className="w-full px-2 py-1.5 text-xs rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
            if (e.key === "Escape") onCancel();
          }}
        />
      </td>
      <td className="py-2 px-3 align-top">
        <textarea
          rows={2}
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          placeholder="Describe the performance criteria..."
          className="w-full px-2 py-1.5 text-xs rounded-lg border border-blue-300 dark:border-blue-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.ctrlKey) onSave();
            if (e.key === "Escape") onCancel();
          }}
        />
      </td>
      <td className="py-2 px-3 align-top">
        <div className="flex flex-col gap-1">
          <button
            onClick={onSave}
            disabled={saving}
            className="p-1 rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
            title="Save (Enter)"
          >
            {saving ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
          </button>
          <button
            onClick={onCancel}
            className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Cancel (Esc)"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </td>
    </tr>
  );
};

export default CurriculumTab;
