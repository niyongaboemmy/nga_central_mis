import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  GraduationCap,
  Loader2,
} from "lucide-react";
import {
  AcademicYear,
  ClassGroup,
  PromotionGradePlan,
  PromotionResult,
  promotionApi,
} from "../../api/academics";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import RichSelect from "../ui/RichSelect";
import { useToast } from "../../contexts/ToastContext";
import SelectField from "../ui/SelectField";

interface PromoteStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  academicYears: AcademicYear[];
  classGroups: ClassGroup[];
  onPromoted: () => void;
}

const statusMeta: Record<
  PromotionGradePlan["status"],
  { label: string; className: string }
> = {
  ready: {
    label: "Ready",
    className:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  no_next_grade: {
    label: "No next grade",
    className:
      "bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400",
  },
  no_class_group: {
    label: "Target class group missing",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  ambiguous: {
    label: "Multiple class groups -- pick one",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
};

const PromoteStudentsModal: React.FC<PromoteStudentsModalProps> = ({
  isOpen,
  onClose,
  academicYears,
  classGroups,
  onPromoted,
}) => {
  const { showToast } = useToast();
  const [sourceYearId, setSourceYearId] = useState<number>(0);
  const [targetYearId, setTargetYearId] = useState<number>(0);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [plan, setPlan] = useState<PromotionGradePlan[] | null>(null);
  const [overrides, setOverrides] = useState<Record<number, number>>({});
  const [excludedGradeIds, setExcludedGradeIds] = useState<Set<number>>(
    new Set(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PromotionResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setSourceYearId(0);
      setTargetYearId(0);
      setPlan(null);
      setOverrides({});
      setExcludedGradeIds(new Set());
      setResult(null);
      setError("");
      return;
    }
    const current = academicYears.find((y) => y.is_current === 1);
    const sorted = [...academicYears].sort(
      (a, b) => b.academic_year_id - a.academic_year_id,
    );
    if (current) {
      setTargetYearId(current.academic_year_id);
      const prev = sorted.find(
        (y) => y.academic_year_id !== current.academic_year_id,
      );
      setSourceYearId(prev?.academic_year_id || 0);
    } else if (sorted.length >= 2) {
      setTargetYearId(sorted[0].academic_year_id);
      setSourceYearId(sorted[1].academic_year_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!sourceYearId || !targetYearId || sourceYearId === targetYearId) {
      setPlan(null);
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    setError("");
    setResult(null);
    promotionApi
      .getPreview(sourceYearId, targetYearId)
      .then((res) => {
        if (!cancelled) {
          setPlan(res.data.data);
          setOverrides({});
          setExcludedGradeIds(new Set());
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err?.response?.data?.message || "Failed to load promotion preview",
          );
          setPlan(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceYearId, targetYearId]);

  const targetYearClassGroups = classGroups;

  const isGradeIncluded = (p: PromotionGradePlan) =>
    !excludedGradeIds.has(p.source_grade_id) &&
    (p.target_class_group_id || overrides[p.source_grade_id]);

  const readyOrOverriddenCount = useMemo(() => {
    if (!plan) return 0;
    return plan.filter(isGradeIncluded).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, overrides, excludedGradeIds]);

  const totalStudentsAffected = useMemo(() => {
    if (!plan) return 0;
    return plan
      .filter(isGradeIncluded)
      .reduce((sum, p) => sum + p.student_count, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, overrides, excludedGradeIds]);

  const toggleExcluded = (gradeId: number) => {
    setExcludedGradeIds((prev) => {
      const next = new Set(prev);
      if (next.has(gradeId)) next.delete(gradeId);
      else next.add(gradeId);
      return next;
    });
  };

  const handlePromote = async () => {
    if (!plan || readyOrOverriddenCount === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const overridesPayload: Record<string, number> = {};
      Object.entries(overrides).forEach(([gradeId, classGroupId]) => {
        overridesPayload[gradeId] = classGroupId;
      });
      const res = await promotionApi.execute({
        source_academic_year_id: sourceYearId,
        target_academic_year_id: targetYearId,
        grade_overrides: overridesPayload,
        excluded_grade_ids: Array.from(excludedGradeIds),
      });
      setResult(res.data.data);
      onPromoted();
      showToast(
        `Promoted ${res.data.data.totalPromoted} student(s) successfully`,
        "success",
      );
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Failed to promote students";
      setError(message);
      showToast(message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Promote Students by Grade"
      size="2xl"
    >
      <div className="space-y-6">
        <div className="flex items-center gap-4 pb-5 border-b border-gray-100 dark:border-gray-700/40">
          <div className="w-14 h-14 flex-shrink-0 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <GraduationCap className="w-7 h-7 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Roll every grade forward at once
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Every active student moves from their current grade into the
              next grade's class group -- e.g. Grade 1 students all move into
              Grade 2. Students keep last year's class group as history.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <RichSelect
            label="Promote from"
            required
            value={sourceYearId || null}
            onChange={(val) => setSourceYearId((val as number) || 0)}
            placeholder="Select source academic year..."
            options={academicYears.map((year) => ({
              value: year.academic_year_id,
              label: year.name,
              badge: year.is_current === 1 ? "Current" : undefined,
            }))}
          />
          <RichSelect
            label="Promote to"
            required
            value={targetYearId || null}
            onChange={(val) => setTargetYearId((val as number) || 0)}
            placeholder="Select target academic year..."
            options={academicYears.map((year) => ({
              value: year.academic_year_id,
              label: year.name,
              badge: year.is_current === 1 ? "Current" : undefined,
            }))}
          />
        </div>

        {loadingPreview && (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-500 dark:text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            Building promotion preview...
          </div>
        )}

        {error && !loadingPreview && (
          <p className="text-sm text-red-600 dark:text-red-400 font-medium bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 rounded-xl p-3">
            {error}
          </p>
        )}

        {!loadingPreview &&
          !error &&
          sourceYearId &&
          targetYearId &&
          sourceYearId === targetYearId && (
            <p className="text-sm text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 rounded-xl p-3">
              Source and target academic years must be different.
            </p>
          )}

        <AnimatePresence>
          {!loadingPreview && plan && plan.length > 0 && !result && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {plan.map((gradePlan) => {
                  const meta = statusMeta[gradePlan.status];
                  const overrideValue = overrides[gradePlan.source_grade_id];
                  const needsOverride =
                    gradePlan.status === "ambiguous" ||
                    gradePlan.status === "no_class_group" ||
                    gradePlan.status === "no_next_grade";
                  const hasResolvableTarget = !!(
                    gradePlan.target_class_group_id || overrideValue
                  );
                  const isExcluded = excludedGradeIds.has(
                    gradePlan.source_grade_id,
                  );
                  const overrideClassGroup = overrideValue
                    ? targetYearClassGroups.find(
                        (cg) => cg.class_group_id === overrideValue,
                      )
                    : undefined;
                  return (
                    <div
                      key={gradePlan.source_grade_id}
                      className={`p-3.5 rounded-2xl border transition-opacity ${
                        isExcluded
                          ? "border-gray-200 dark:border-gray-700/40 bg-gray-50 dark:bg-gray-800/20 opacity-60"
                          : "border-gray-200 dark:border-gray-700/40 bg-white dark:bg-gray-800/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={hasResolvableTarget && !isExcluded}
                            disabled={!hasResolvableTarget}
                            onChange={() =>
                              toggleExcluded(gradePlan.source_grade_id)
                            }
                            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-400 disabled:opacity-40 flex-shrink-0"
                            title={
                              hasResolvableTarget
                                ? "Include this grade in the promotion"
                                : "No resolvable target yet"
                            }
                          />
                          <span className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                            {gradePlan.source_grade_name}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                            {gradePlan.student_count} student
                            {gradePlan.student_count === 1 ? "" : "s"}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          {gradePlan.target_grade_name ? (
                            <span className="font-medium text-gray-700 dark:text-gray-300 text-sm truncate">
                              {gradePlan.target_grade_name}
                              {gradePlan.target_class_group_name &&
                                ` (${gradePlan.target_class_group_name})`}
                            </span>
                          ) : overrideClassGroup ? (
                            <span className="font-medium text-gray-700 dark:text-gray-300 text-sm truncate">
                              {overrideClassGroup.name}
                              {overrideClassGroup.grade_name &&
                                ` (${overrideClassGroup.grade_name})`}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400 dark:text-gray-500 italic">
                              graduates / no next grade
                            </span>
                          )}
                        </div>
                        <span
                          className={`flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                      </div>

                      {needsOverride && targetYearId ? (
                        <div className="mt-2.5">
                          {gradePlan.status === "no_next_grade" && (
                            <p className="mb-1.5 text-xs text-gray-500 dark:text-gray-400">
                              No grade with a higher level order was found for
                              this grade. If that's wrong (e.g. the target
                              grade's level order needs fixing in Grade
                              Management), you can still pick a target class
                              group manually below.
                            </p>
                          )}
                          <SelectField
                            value={overrideValue || 0}
                            onChange={(e) =>
                              setOverrides((prev) => ({
                                ...prev,
                                [gradePlan.source_grade_id]:
                                  parseInt(e.target.value) || 0,
                              }))
                            }
                            className="w-full px-3 py-2 text-sm border rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
                          >
                            <option value={0}>
                              Manually pick a target class group...
                            </option>
                            {targetYearClassGroups.map((cg) => (
                              <option
                                key={cg.class_group_id}
                                value={cg.class_group_id}
                              >
                                {cg.name}
                                {cg.grade_name ? ` (${cg.grade_name})` : ""}
                              </option>
                            ))}
                          </SelectField>
                        </div>
                      ) : gradePlan.status === "no_class_group" ? (
                        <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                          Create a "{gradePlan.target_grade_name}" class group
                          in the target year, or pick one manually above.
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-1">
                <span>
                  {readyOrOverriddenCount} of {plan.length} grade
                  {plan.length === 1 ? "" : "s"} will be promoted (
                  {totalStudentsAffected} student
                  {totalStudentsAffected === 1 ? "" : "s"})
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!loadingPreview &&
          plan &&
          plan.length === 0 &&
          sourceYearId &&
          targetYearId && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              No active students found in the selected source year.
            </p>
          )}

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-100 dark:border-emerald-800/30">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <p className="text-sm text-emerald-800 dark:text-emerald-300">
                  <span className="font-semibold">
                    {result.totalPromoted} student(s)
                  </span>{" "}
                  promoted across{" "}
                  <span className="font-semibold">
                    {result.promotedGrades.length} grade
                    {result.promotedGrades.length === 1 ? "" : "s"}
                  </span>
                  {result.totalSkippedExisting > 0 &&
                    ` (${result.totalSkippedExisting} already in their target class group)`}
                  .
                </p>
              </div>
              {result.skippedGrades.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      {result.skippedGrades.length} grade
                      {result.skippedGrades.length === 1 ? "" : "s"} skipped
                    </p>
                  </div>
                  <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-400">
                    {result.skippedGrades.map((g) => (
                      <li key={g.source_grade_name}>
                        <span className="font-semibold">
                          {g.source_grade_name}
                        </span>{" "}
                        ({g.student_count} student
                        {g.student_count === 1 ? "" : "s"}) -- {g.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <Button variant="secondary" onClick={onClose}>
          {result ? "Close" : "Cancel"}
        </Button>
        {!result && (
          <Button
            onClick={handlePromote}
            disabled={
              submitting ||
              loadingPreview ||
              !plan ||
              readyOrOverriddenCount === 0
            }
            isLoading={submitting}
          >
            {submitting
              ? "Promoting..."
              : `Promote ${totalStudentsAffected || ""} Student${
                  totalStudentsAffected === 1 ? "" : "s"
                }`}
          </Button>
        )}
      </div>
    </Modal>
  );
};

export default PromoteStudentsModal;
