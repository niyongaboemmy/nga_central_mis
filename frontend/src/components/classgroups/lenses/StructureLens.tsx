import React, { useEffect, useMemo, useState } from "react";
import {
  Layers,
  GraduationCap,
  Plus,
  Pencil,
  Trash2,
  Users2,
  AlertTriangle,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import {
  gradesApi,
  classGroupsApi,
  Grade,
  ClassGroup,
  ClassGroupDependencyReport,
} from "../../../api/academics";
import { useToast } from "../../../contexts/ToastContext";
import { useClassGroups } from "../ClassGroupsContext";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import { CardShell, EmptyState, ReadOnlyNotice } from "../shared";
import ReadinessRing from "../ReadinessRing";
import { checksFor } from "../readiness";

/** Lens 4 — is the structure right? Grades and the class groups under them. */
const StructureLens: React.FC = () => {
  const { showToast } = useToast();
  const {
    programs,
    programId,
    gradeId,
    classGroupId,
    setGradeId,
    setClassGroupId,
    gradesForProgram,
    classGroupsForGrade,
    selectedGrade,
    overview,
    can,
    invalidate,
  } = useClassGroups();

  const [gradeModal, setGradeModal] = useState<{
    open: boolean;
    grade: Grade | null;
  }>({ open: false, grade: null });
  const [classGroupModal, setClassGroupModal] = useState<{
    open: boolean;
    classGroup: ClassGroup | null;
  }>({ open: false, classGroup: null });
  const [deleteTarget, setDeleteTarget] = useState<ClassGroup | null>(null);
  const [deleteGradeTarget, setDeleteGradeTarget] = useState<Grade | null>(null);

  const overviewByClassGroup = useMemo(
    () => new Map(overview.map((row) => [row.class_group_id, row])),
    [overview],
  );

  const classGroupCountByGrade = useMemo(() => {
    const counts = new Map<number, number>();
    for (const row of overview) {
      counts.set(row.grade_id, (counts.get(row.grade_id) ?? 0) + 1);
    }
    return counts;
  }, [overview]);

  const handleDeleteGrade = async (grade: Grade) => {
    try {
      await gradesApi.delete(grade.grade_id);
      showToast(`Deleted grade ${grade.name}`, "success");
      if (gradeId === grade.grade_id) setGradeId(null);
      invalidate(["structure", "overview"]);
    } catch {
      showToast(
        "Could not delete this grade — it still has class groups or academic records.",
        "error",
      );
    } finally {
      setDeleteGradeTarget(null);
    }
  };

  return (
    <div className="space-y-3">
      {!can.manageAcademics && (
        <ReadOnlyNotice what="grades and class groups" />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Grades */}
        <CardShell className="overflow-hidden">
          <div className="flex items-center gap-2 p-3 border-b border-gray-100 dark:border-slate-700/40">
            <GraduationCap className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-bold text-gray-800 dark:text-white">
              Grades
            </h3>
            <span className="text-xs text-gray-400 tabular-nums">
              {gradesForProgram.length}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              disabled={!can.manageAcademics}
              onClick={() => setGradeModal({ open: true, grade: null })}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              Grade
            </button>
          </div>

          {gradesForProgram.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="No grades"
              hint={
                programId
                  ? "This program has no grades yet."
                  : "Create a grade to start building the structure."
              }
            />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700/40 max-h-[60vh] overflow-y-auto">
              {gradesForProgram.map((grade) => {
                const selected = grade.grade_id === gradeId;
                const program = programs.find(
                  (p) => p.program_id === grade.program_id,
                );
                return (
                  <li key={grade.grade_id}>
                    <div
                      className={`flex items-center gap-2 px-3 py-2.5 transition-colors ${
                        selected
                          ? "bg-blue-50/70 dark:bg-blue-500/10"
                          : "hover:bg-gray-50 dark:hover:bg-slate-700/30"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setGradeId(grade.grade_id)}
                        className="flex-1 text-left min-w-0"
                      >
                        <p
                          className={`text-sm font-semibold truncate ${
                            selected
                              ? "text-blue-700 dark:text-blue-300"
                              : "text-gray-900 dark:text-white"
                          }`}
                        >
                          {grade.name}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {program?.name ?? grade.program_name ?? "—"} · level{" "}
                          {grade.level_order} ·{" "}
                          {classGroupCountByGrade.get(grade.grade_id) ?? 0} class
                          group(s)
                        </p>
                      </button>

                      <button
                        type="button"
                        aria-label={`Edit ${grade.name}`}
                        disabled={!can.manageAcademics}
                        onClick={() => setGradeModal({ open: true, grade })}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 disabled:opacity-30"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${grade.name}`}
                        disabled={!can.manageAcademics}
                        onClick={() => setDeleteGradeTarget(grade)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardShell>

        {/* Class groups */}
        <CardShell className="overflow-hidden">
          <div className="flex items-center gap-2 p-3 border-b border-gray-100 dark:border-slate-700/40">
            <Layers className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-bold text-gray-800 dark:text-white truncate">
              Class groups
              {selectedGrade && (
                <span className="font-normal text-gray-400">
                  {" "}
                  · {selectedGrade.name}
                </span>
              )}
            </h3>
            <div className="flex-1" />
            <button
              type="button"
              disabled={!can.manageAcademics || !gradeId}
              onClick={() =>
                setClassGroupModal({ open: true, classGroup: null })
              }
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              Class group
            </button>
          </div>

          {!gradeId ? (
            <EmptyState
              icon={Layers}
              title="Pick a grade"
              hint="Class groups belong to a grade — select one on the left."
            />
          ) : classGroupsForGrade.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No class groups"
              hint={`${selectedGrade?.name ?? "This grade"} has no class groups yet.`}
              action={
                can.manageAcademics ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      setClassGroupModal({ open: true, classGroup: null })
                    }
                  >
                    Create one
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700/40 max-h-[60vh] overflow-y-auto">
              {classGroupsForGrade.map((cg) => {
                const selected = cg.class_group_id === classGroupId;
                const row = overviewByClassGroup.get(cg.class_group_id);
                const checks = row ? checksFor(row) : [];
                return (
                  <li key={cg.class_group_id}>
                    <div
                      className={`flex items-center gap-2 px-3 py-2.5 transition-colors ${
                        selected
                          ? "bg-blue-50/70 dark:bg-blue-500/10"
                          : "hover:bg-gray-50 dark:hover:bg-slate-700/30"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setClassGroupId(cg.class_group_id)}
                        className="flex-1 text-left min-w-0"
                      >
                        <p
                          className={`text-sm font-semibold truncate ${
                            selected
                              ? "text-blue-700 dark:text-blue-300"
                              : "text-gray-900 dark:text-white"
                          }`}
                        >
                          {cg.name}
                        </p>
                        <p className="text-xs text-gray-400 inline-flex items-center gap-1">
                          <Users2 className="w-3 h-3" />
                          {row?.student_count ?? 0} student(s)
                        </p>
                      </button>

                      {row && (
                        <ReadinessRing
                          value={checks.filter((c) => c.ok).length}
                          total={checks.length}
                          size={18}
                        />
                      )}

                      <button
                        type="button"
                        aria-label={`Edit ${cg.name}`}
                        disabled={!can.manageAcademics}
                        onClick={() =>
                          setClassGroupModal({ open: true, classGroup: cg })
                        }
                        className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 disabled:opacity-30"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${cg.name}`}
                        disabled={!can.manageAcademics}
                        onClick={() => setDeleteTarget(cg)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardShell>
      </div>

      <GradeModal
        state={gradeModal}
        onClose={() => setGradeModal({ open: false, grade: null })}
      />
      <ClassGroupModal
        state={classGroupModal}
        onClose={() => setClassGroupModal({ open: false, classGroup: null })}
      />
      <DeleteClassGroupModal
        classGroup={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />

      <Modal
        isOpen={deleteGradeTarget !== null}
        onClose={() => setDeleteGradeTarget(null)}
        title={`Delete grade ${deleteGradeTarget?.name ?? ""}?`}
        contentClassName="p-4"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            A grade can only be deleted once its class groups and curriculum
            have been removed. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setDeleteGradeTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                deleteGradeTarget && handleDeleteGrade(deleteGradeTarget)
              }
            >
              Delete grade
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

/* ── Grade create/edit ─────────────────────────────────────────────────── */

const GradeModal: React.FC<{
  state: { open: boolean; grade: Grade | null };
  onClose: () => void;
}> = ({ state, onClose }) => {
  const { showToast } = useToast();
  const { programs, programId, invalidate } = useClassGroups();

  const [name, setName] = useState("");
  const [levelOrder, setLevelOrder] = useState(1);
  const [program, setProgram] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state.open) return;
    setName(state.grade?.name ?? "");
    setLevelOrder(state.grade?.level_order ?? 1);
    setProgram(state.grade?.program_id ?? programId ?? null);
  }, [state, programId]);

  const submit = async () => {
    if (!name.trim() || !program) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        level_order: Number(levelOrder),
        program_id: program,
      };
      if (state.grade) {
        await gradesApi.update(state.grade.grade_id, payload);
        showToast(`Updated grade ${payload.name}`, "success");
      } else {
        await gradesApi.create(payload as any);
        showToast(`Created grade ${payload.name}`, "success");
      }
      onClose();
      invalidate(["structure", "overview"]);
    } catch {
      showToast("Could not save the grade", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={state.open}
      onClose={onClose}
      title={state.grade ? "Edit grade" : "New grade"}
      contentClassName="p-4"
    >
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Name
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Senior 1"
            className="mt-1 w-full px-3 py-2 text-sm rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Program
          </span>
          <select
            value={program ?? ""}
            onChange={(e) =>
              setProgram(e.target.value ? Number(e.target.value) : null)
            }
            className="mt-1 w-full px-3 py-2 text-sm rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            <option value="">Select a program</option>
            {programs.map((p) => (
              <option key={p.program_id} value={p.program_id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Level order
          </span>
          <input
            type="number"
            min={1}
            value={levelOrder}
            onChange={(e) => setLevelOrder(Number(e.target.value))}
            className="mt-1 w-full px-3 py-2 text-sm rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <span className="text-[11px] text-gray-400">
            Orders grades within their program, and drives year-end promotion.
          </span>
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!name.trim() || !program || saving}
            isLoading={saving}
          >
            {state.grade ? "Save changes" : "Create grade"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

/* ── Class group create/edit ───────────────────────────────────────────── */

const ClassGroupModal: React.FC<{
  state: { open: boolean; classGroup: ClassGroup | null };
  onClose: () => void;
}> = ({ state, onClose }) => {
  const { showToast } = useToast();
  const { gradeId, selectedGrade, invalidate } = useClassGroups();

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (state.open) setName(state.classGroup?.name ?? "");
  }, [state]);

  const submit = async () => {
    const targetGrade = state.classGroup?.grade_id ?? gradeId;
    if (!name.trim() || !targetGrade) return;
    setSaving(true);
    try {
      if (state.classGroup) {
        await classGroupsApi.update(state.classGroup.class_group_id, {
          name: name.trim(),
          grade_id: targetGrade,
        });
        showToast(`Renamed class group to ${name.trim()}`, "success");
      } else {
        await classGroupsApi.create({
          name: name.trim(),
          grade_id: targetGrade,
        } as any);
        showToast(`Created class group ${name.trim()}`, "success");
      }
      onClose();
      invalidate(["structure", "overview"]);
    } catch {
      showToast("Could not save the class group", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={state.open}
      onClose={onClose}
      title={state.classGroup ? "Edit class group" : "New class group"}
      contentClassName="p-4"
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          In {selectedGrade?.name ?? "the selected grade"}. A class group is a
          permanent label reused every year — its cohort changes, its name does
          not.
        </p>
        <label className="block">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Name
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. S1A"
            className="mt-1 w-full px-3 py-2 text-sm rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!name.trim() || saving}
            isLoading={saving}
          >
            {state.classGroup ? "Save changes" : "Create class group"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

/* ── Dependency-aware delete ───────────────────────────────────────────── */

const DeleteClassGroupModal: React.FC<{
  classGroup: ClassGroup | null;
  onClose: () => void;
}> = ({ classGroup, onClose }) => {
  const { showToast } = useToast();
  const { classGroupId, setClassGroupId, invalidate } = useClassGroups();

  const [report, setReport] = useState<ClassGroupDependencyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!classGroup) {
      setReport(null);
      setAcknowledged(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await classGroupsApi.dependencies(classGroup.class_group_id);
        if (!cancelled) setReport(res.data.data);
      } catch {
        if (!cancelled) setReport(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classGroup]);

  const confirm = async () => {
    if (!classGroup) return;
    setDeleting(true);
    try {
      // The backend refuses an unconfirmed delete that touches anything, and
      // the modal above has just shown the admin exactly what that is.
      await classGroupsApi.delete(classGroup.class_group_id, true);
      showToast(`Deleted class group ${classGroup.name}`, "success");
      if (classGroupId === classGroup.class_group_id) setClassGroupId(null);
      onClose();
      invalidate(["structure", "overview"]);
    } catch {
      showToast("Could not delete this class group", "error");
    } finally {
      setDeleting(false);
    }
  };

  const deletes = report?.deletes ?? [];
  const unlinks = report?.unlinks ?? [];
  const needsAck = deletes.length > 0 || unlinks.length > 0;

  return (
    <Modal
      isOpen={classGroup !== null}
      onClose={onClose}
      title={`Delete class group ${classGroup?.name ?? ""}?`}
      contentClassName="p-4"
    >
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking what this would affect…
          </div>
        ) : (
          <>
            {deletes.length > 0 && (
              <div className="rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3 space-y-2">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" />
                  This will also permanently delete
                </p>
                <ul className="text-xs text-red-700 dark:text-red-300 space-y-1">
                  {deletes.map((dep) => (
                    <li key={dep.key} className="flex justify-between gap-3">
                      <span>{dep.label}</span>
                      <span className="tabular-nums font-semibold">
                        {dep.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {unlinks.length > 0 && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3 space-y-2">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  These are kept, but lose their class group link
                </p>
                <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
                  {unlinks.map((dep) => (
                    <li key={dep.key} className="flex justify-between gap-3">
                      <span>{dep.label}</span>
                      <span className="tabular-nums font-semibold">
                        {dep.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {needsAck ? (
              <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5 w-3.5 h-3.5 rounded accent-red-600"
                />
                I understand this cannot be undone.
              </label>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Nothing else points at this class group. It can be deleted
                safely.
              </p>
            )}
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={confirm}
            disabled={loading || (needsAck && !acknowledged) || deleting}
            isLoading={deleting}
          >
            Delete class group
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default StructureLens;
