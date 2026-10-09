import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  UserCog,
  UserCheck,
  UserPlus,
  Search,
  Trash2,
  CopyPlus,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  BookOpen,
} from "lucide-react";
import { teacherSubjectAssignmentsApi } from "../../../api/academics";
import { classGroupsWorkspaceApi } from "../../../api/classGroups";
import {
  searchUsers,
  UserSearchResult,
  assignGradeToUser,
  removeGradeFromUser,
} from "../../../api/users";
import { useToast } from "../../../contexts/ToastContext";
import { useClassGroups } from "../ClassGroupsContext";
import { useClassAcademics } from "../useClassAcademics";
import BulkActionBar from "../BulkActionBar";
import ReadinessRing from "../ReadinessRing";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import ConfirmModal from "../../ui/ConfirmModal";
import {
  Avatar,
  CardShell,
  EmptyState,
  ReadOnlyNotice,
  SkeletonRows,
  fullName,
} from "../shared";
import SelectField from "../../ui/SelectField";

const SEARCH_DEBOUNCE_MS = 350;

interface CoverageRow {
  subject_id: number;
  subject_name: string;
  subject_code: string | null;
  teachers: { user_id: number; name: string }[];
}

/** Lens 2 — is every subject in this class actually taught by someone? */
const TeachersLens: React.FC = () => {
  const { showToast } = useToast();
  const {
    classGroupId,
    academicYearId,
    academicYears,
    selectedClassGroup,
    selectedGrade,
    can,
    invalidate,
  } = useClassGroups();

  const academics = useClassAcademics();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [assignFor, setAssignFor] = useState<number[] | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [classTeacherOpen, setClassTeacherOpen] = useState(false);
  const [removeClassTeacher, setRemoveClassTeacher] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setSelected(new Set());
  }, [classGroupId, academicYearId]);

  const coverage: CoverageRow[] = useMemo(() => {
    const bySubject = new Map<number, CoverageRow>();
    for (const entry of academics.curriculum) {
      bySubject.set(entry.subject_id, {
        subject_id: entry.subject_id,
        subject_name: entry.subject_name,
        subject_code: entry.subject_code,
        teachers: [],
      });
    }
    for (const a of academics.assignments) {
      const row = bySubject.get(a.subject_id);
      // A teacher assigned to a subject that has since left the curriculum is
      // not coverage, so it is deliberately not surfaced as a row here.
      if (row) {
        row.teachers.push({ user_id: a.user_id, name: a.teacher_name });
      }
    }
    return Array.from(bySubject.values()).sort((a, b) =>
      a.subject_name.localeCompare(b.subject_name),
    );
  }, [academics.curriculum, academics.assignments]);

  const staffed = coverage.filter((row) => row.teachers.length > 0).length;
  const unstaffedIds = coverage
    .filter((row) => row.teachers.length === 0)
    .map((row) => row.subject_id);

  const handleUnassign = async (subjectId: number, teacherId: number) => {
    if (!classGroupId || !academicYearId) return;
    setWorking(true);
    try {
      await teacherSubjectAssignmentsApi.remove(
        teacherId,
        subjectId,
        classGroupId,
        academicYearId,
      );
      showToast("Removed the teacher from this subject", "success");
      invalidate(["assignments", "overview"]);
    } catch {
      showToast("Could not remove the assignment", "error");
    } finally {
      setWorking(false);
    }
  };

  const handleRemoveClassTeacher = async () => {
    const current = academics.classTeacher;
    if (!current) return;
    setWorking(true);
    try {
      await removeGradeFromUser(
        current.user_id,
        current.grade_id,
        current.class_group_id,
        current.academic_year_id,
      );
      showToast("Removed the class teacher", "success");
      setRemoveClassTeacher(false);
      invalidate(["assignments", "overview"]);
    } catch {
      showToast("Could not remove the class teacher", "error");
    } finally {
      setWorking(false);
    }
  };

  if (!classGroupId) {
    return (
      <CardShell>
        <EmptyState
          icon={UserCog}
          title="Pick a class group"
          hint="Teaching assignments are per class group — choose one to see who teaches what."
        />
      </CardShell>
    );
  }

  const classTeacher = academics.classTeacher;

  return (
    <div className="space-y-3">
      {!can.manageAcademics && !can.assignClassTeacher && (
        <ReadOnlyNotice what="teaching assignments" />
      )}

      {/* Class teacher */}
      <CardShell className="p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">
              Class teacher
            </p>
            {academics.loading ? (
              <div className="h-4 w-32 rounded bg-gray-200 dark:bg-slate-700 animate-pulse mt-1" />
            ) : classTeacher ? (
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {classTeacher.user_name}
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {classTeacher.email}
                </span>
              </p>
            ) : (
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400 inline-flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                No class teacher for {selectedClassGroup?.name ?? "this class"}
              </p>
            )}
          </div>

          <div className="flex-1" />

          <button
            type="button"
            disabled={!can.assignClassTeacher}
            onClick={() => setClassTeacherOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserCheck className="w-3.5 h-3.5" />
            {classTeacher ? "Replace" : "Assign"}
          </button>
          {classTeacher && (
            <button
              type="button"
              disabled={!can.assignClassTeacher}
              onClick={() => setRemoveClassTeacher(true)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-slate-700/60 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>
          )}
        </div>
      </CardShell>

      {/* Subject coverage */}
      <CardShell className="overflow-hidden">
        <div className="flex items-center gap-2 p-3 border-b border-gray-100 dark:border-slate-700/40 flex-wrap">
          <UserCog className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-bold text-gray-800 dark:text-white">
            Subject teachers
          </h3>
          <ReadinessRing value={staffed} total={coverage.length} size={18} />

          <div className="flex-1" />

          {unstaffedIds.length > 0 && (
            <button
              type="button"
              disabled={!can.manageAcademics}
              onClick={() => setAssignFor(unstaffedIds)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Staff {unstaffedIds.length} gap
              {unstaffedIds.length === 1 ? "" : "s"}
            </button>
          )}

          <button
            type="button"
            disabled={!can.manageAcademics}
            onClick={() => setCopyOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-slate-700/60 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            <CopyPlus className="w-3.5 h-3.5" />
            Copy from year
          </button>
        </div>

        {academics.loading ? (
          <SkeletonRows rows={4} />
        ) : coverage.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No curriculum to staff"
            hint={`${selectedGrade?.name ?? "This grade"} has no subjects yet — add them in the Subjects lens first.`}
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700/40 max-h-[60vh] overflow-y-auto">
            {coverage.map((row, index) => {
              const isSelected = selected.has(row.subject_id);
              const unstaffed = row.teachers.length === 0;
              return (
                <motion.li
                  key={row.subject_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(index * 0.02, 0.2) }}
                  className={`flex items-center gap-2 px-3 py-2.5 transition-colors ${
                    isSelected
                      ? "bg-blue-50/70 dark:bg-blue-500/10"
                      : "hover:bg-gray-50 dark:hover:bg-slate-700/30"
                  }`}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.subject_name}`}
                    checked={isSelected}
                    disabled={!can.manageAcademics}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.subject_id)) next.delete(row.subject_id);
                        else next.add(row.subject_id);
                        return next;
                      })
                    }
                    className="w-4 h-4 rounded accent-blue-600"
                  />

                  <div className="min-w-0 w-40 sm:w-56 shrink-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {row.subject_name}
                    </p>
                    {row.subject_code && (
                      <p className="text-[10px] font-mono text-gray-400">
                        {row.subject_code}
                      </p>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
                    {unstaffed ? (
                      <button
                        type="button"
                        disabled={!can.manageAcademics}
                        onClick={() => setAssignFor([row.subject_id])}
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border border-dashed border-amber-400 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 disabled:opacity-50"
                      >
                        <UserPlus className="w-3 h-3" />
                        Unassigned — add a teacher
                      </button>
                    ) : (
                      row.teachers.map((teacher) => (
                        <span
                          key={teacher.user_id}
                          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 pl-1 pr-1.5 py-0.5 text-xs font-medium"
                        >
                          <Avatar
                            userId={teacher.user_id}
                            first={teacher.name?.split(" ")[0]}
                            last={teacher.name?.split(" ")[1]}
                            size="sm"
                          />
                          <span className="truncate max-w-[140px]">
                            {teacher.name}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove ${teacher.name} from ${row.subject_name}`}
                            disabled={!can.manageAcademics || working}
                            onClick={() =>
                              handleUnassign(row.subject_id, teacher.user_id)
                            }
                            className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-emerald-200 dark:hover:bg-emerald-500/30 disabled:opacity-40"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  {!unstaffed && (
                    <button
                      type="button"
                      aria-label={`Add another teacher to ${row.subject_name}`}
                      disabled={!can.manageAcademics}
                      onClick={() => setAssignFor([row.subject_id])}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 disabled:opacity-30"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </motion.li>
              );
            })}
          </ul>
        )}

        <BulkActionBar
          count={selected.size}
          noun="subject"
          onClear={() => setSelected(new Set())}
          actions={[
            {
              key: "assign",
              label: "Assign a teacher",
              icon: UserPlus,
              variant: "primary",
              disabled: !can.manageAcademics,
              onClick: () => setAssignFor(Array.from(selected)),
            },
          ]}
        />
      </CardShell>

      <AssignTeacherModal
        subjectIds={assignFor}
        subjectNames={coverage
          .filter((row) => assignFor?.includes(row.subject_id))
          .map((row) => row.subject_name)}
        onClose={() => setAssignFor(null)}
        onDone={() => {
          setSelected(new Set());
          invalidate(["assignments", "overview"]);
        }}
      />

      <CopyAssignmentsModal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        years={academicYears.filter(
          (y) => y.academic_year_id !== academicYearId,
        )}
      />

      <AssignClassTeacherModal
        open={classTeacherOpen}
        onClose={() => setClassTeacherOpen(false)}
        current={classTeacher}
        onDone={() => invalidate(["assignments", "overview"])}
      />

      <ConfirmModal
        isOpen={removeClassTeacher}
        onClose={() => setRemoveClassTeacher(false)}
        onConfirm={handleRemoveClassTeacher}
        isLoading={working}
        title="Remove the class teacher?"
        confirmText="Remove"
        message={`${classTeacher?.user_name ?? "This teacher"} will no longer lead ${
          selectedClassGroup?.name ?? "this class group"
        } for the selected year. Their subject teaching assignments are unaffected.`}
      />
    </div>
  );
};

/* ── Teacher picker ────────────────────────────────────────────────────── */

const useTeacherSearch = (open: boolean) => {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open || debounced.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setSearching(true);
      try {
        const found = await searchUsers(debounced.trim());
        // Students are never teaching staff; everyone else might be.
        if (!cancelled) {
          setResults(found.filter((u) => u.user_type !== "STUDENT"));
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, debounced]);

  return { query, setQuery, results, searching };
};

const TeacherPicker: React.FC<{
  open: boolean;
  selectedId: number | null;
  onSelect: (teacher: UserSearchResult) => void;
}> = ({ open, selectedId, onSelect }) => {
  const { query, setQuery, results, searching } = useTeacherSearch(open);

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search staff by name, username or email…"
          aria-label="Search teachers"
          className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
      </div>

      <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-100 dark:border-slate-700/40 divide-y divide-gray-100 dark:divide-slate-700/40">
        {searching ? (
          <div className="flex items-center justify-center py-8 text-gray-400 text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Searching…
          </div>
        ) : results.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-gray-400">
            {query.trim().length < 2
              ? "Type at least two characters to search."
              : "No staff match that search."}
          </p>
        ) : (
          results.map((teacher) => (
            <button
              key={teacher.user_id}
              type="button"
              onClick={() => onSelect(teacher)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                selectedId === teacher.user_id
                  ? "bg-blue-50 dark:bg-blue-500/10"
                  : "hover:bg-gray-50 dark:hover:bg-slate-700/30"
              }`}
            >
              <Avatar
                userId={teacher.user_id}
                first={teacher.first_name}
                last={teacher.last_name}
                size="sm"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {fullName(teacher.first_name, teacher.last_name) ||
                    teacher.username}
                </p>
                <p className="text-xs text-gray-400 truncate">{teacher.email}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </>
  );
};

const AssignTeacherModal: React.FC<{
  subjectIds: number[] | null;
  subjectNames: string[];
  onClose: () => void;
  onDone: () => void;
}> = ({ subjectIds, subjectNames, onClose, onDone }) => {
  const { showToast } = useToast();
  const { classGroupId, academicYearId } = useClassGroups();
  const [picked, setPicked] = useState<UserSearchResult | null>(null);
  const [saving, setSaving] = useState(false);

  const open = subjectIds !== null && subjectIds.length > 0;

  useEffect(() => {
    if (!open) setPicked(null);
  }, [open]);

  const submit = async () => {
    if (!picked || !subjectIds || !classGroupId) return;
    setSaving(true);
    try {
      const res = await classGroupsWorkspaceApi.bulkAssignTeacherSubjects({
        user_id: picked.user_id,
        subject_ids: subjectIds,
        class_group_id: classGroupId,
        academic_year_id: academicYearId ?? undefined,
      });
      const data = res.data.data;
      showToast(
        `Assigned ${data.assigned} subject${data.assigned === 1 ? "" : "s"}${
          data.skipped > 0 ? ` (${data.skipped} already assigned)` : ""
        }`,
        "success",
      );
      onClose();
      onDone();
    } catch {
      showToast("Could not assign the teacher", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`Assign a teacher to ${subjectIds?.length ?? 0} subject${
        (subjectIds?.length ?? 0) === 1 ? "" : "s"
      }`}
      contentClassName="p-4"
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {subjectNames.slice(0, 6).join(", ")}
          {subjectNames.length > 6 && ` +${subjectNames.length - 6} more`}
        </p>

        <TeacherPicker open={open} selectedId={picked?.user_id ?? null} onSelect={setPicked} />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!picked || saving} isLoading={saving}>
            Assign teacher
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const AssignClassTeacherModal: React.FC<{
  open: boolean;
  onClose: () => void;
  current: { user_id: number } | null;
  onDone: () => void;
}> = ({ open, onClose, current, onDone }) => {
  const { showToast } = useToast();
  const { gradeId, classGroupId, academicYearId, selectedClassGroup } =
    useClassGroups();
  const [picked, setPicked] = useState<UserSearchResult | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) setPicked(null);
  }, [open]);

  const submit = async () => {
    if (!picked || !gradeId || !classGroupId || !academicYearId) return;
    setSaving(true);
    try {
      // A class group leads to one class teacher, so replacing means clearing
      // the incumbent first — the assignment key includes the user id, so an
      // add alone would leave two.
      if (current && current.user_id !== picked.user_id) {
        await removeGradeFromUser(
          current.user_id,
          gradeId,
          classGroupId,
          academicYearId,
        );
      }
      await assignGradeToUser(
        picked.user_id,
        gradeId,
        classGroupId,
        academicYearId,
      );
      showToast(
        `${fullName(picked.first_name, picked.last_name) || picked.username} now leads ${
          selectedClassGroup?.name ?? "this class"
        }`,
        "success",
      );
      onClose();
      onDone();
    } catch {
      showToast("Could not assign the class teacher", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`${current ? "Replace" : "Assign"} class teacher`}
      contentClassName="p-4"
    >
      <div className="space-y-3">
        <TeacherPicker open={open} selectedId={picked?.user_id ?? null} onSelect={setPicked} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!picked || saving} isLoading={saving}>
            {current ? "Replace class teacher" : "Assign class teacher"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const CopyAssignmentsModal: React.FC<{
  open: boolean;
  onClose: () => void;
  years: { academic_year_id: number; name: string }[];
}> = ({ open, onClose, years }) => {
  const { showToast } = useToast();
  const { academicYearId, invalidate } = useClassGroups();
  const [source, setSource] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open) setSource(null);
  }, [open]);

  const run = async () => {
    if (!source || !academicYearId) return;
    setRunning(true);
    try {
      const res = await teacherSubjectAssignmentsApi.copy({
        source_academic_year_id: source,
        target_academic_year_id: academicYearId,
      });
      const data = res.data.data;
      showToast(
        `Copied ${data.copied} assignment(s); ${data.skipped} already existed`,
        "success",
      );
      onClose();
      invalidate(["assignments", "overview"]);
    } catch {
      showToast("Could not copy the assignments", "error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Copy teaching assignments from another year"
      contentClassName="p-4"
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Every teacher-subject-class assignment from the chosen year is
          recreated in the selected year. Assignments that already exist are
          skipped, so this is safe to re-run.
        </p>
        <label className="block">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Copy from
          </span>
          <SelectField
            value={source ?? ""}
            aria-label="Source academic year"
            onChange={(e) =>
              setSource(e.target.value ? Number(e.target.value) : null)
            }
            className="mt-1 w-full px-3 py-2 text-sm rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            <option value="">Select a year</option>
            {years.map((y) => (
              <option key={y.academic_year_id} value={y.academic_year_id}>
                {y.name}
              </option>
            ))}
          </SelectField>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button onClick={run} disabled={!source || running} isLoading={running}>
            Copy assignments
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default TeachersLens;
