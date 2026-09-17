import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Search,
  Plus,
  Minus,
  UserCog,
  Users2,
  AlertTriangle,
  Loader2,
  GraduationCap,
} from "lucide-react";
import { gradeSubjectsApi } from "../../../api/academics";
import { useToast } from "../../../contexts/ToastContext";
import { useClassGroups } from "../ClassGroupsContext";
import { useClassAcademics } from "../useClassAcademics";
import { useClassRoster } from "../useClassRoster";
import BulkActionBar from "../BulkActionBar";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import { CardShell, EmptyState, ReadOnlyNotice, SkeletonRows } from "../shared";

/** Lens 3 — what is this class supposed to study? */
const SubjectsLens: React.FC = () => {
  const { showToast } = useToast();
  const {
    gradeId,
    selectedGrade,
    subjects,
    can,
    invalidate,
  } = useClassGroups();

  const academics = useClassAcademics();
  const roster = useClassRoster();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [working, setWorking] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{
    subject_id: number;
    name: string;
    enrolled: number;
  } | null>(null);

  useEffect(() => {
    setSelected(new Set());
  }, [gradeId]);

  const curriculumIds = useMemo(
    () => new Set(academics.curriculum.map((c) => c.subject_id)),
    [academics.curriculum],
  );

  /** subject_id -> number of this class group's students enrolled in it. */
  const enrolledCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const student of roster.students) {
      for (const subjectId of student.enrolled_subject_ids ?? []) {
        counts.set(subjectId, (counts.get(subjectId) ?? 0) + 1);
      }
    }
    return counts;
  }, [roster.students]);

  const teacherCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const a of academics.assignments) {
      counts.set(a.subject_id, (counts.get(a.subject_id) ?? 0) + 1);
    }
    return counts;
  }, [academics.assignments]);

  const available = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return subjects
      .filter((s) => !curriculumIds.has(s.subject_id))
      .filter(
        (s) =>
          !needle ||
          s.name.toLowerCase().includes(needle) ||
          (s.code ?? "").toLowerCase().includes(needle),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [subjects, curriculumIds, query]);

  const inCurriculum = useMemo(
    () =>
      academics.curriculum
        .slice()
        .sort((a, b) => a.subject_name.localeCompare(b.subject_name)),
    [academics.curriculum],
  );

  const addSubjects = async (subjectIds: number[]) => {
    if (!gradeId || subjectIds.length === 0) return;
    setWorking(true);
    try {
      // gradeSubjectsApi has no batch endpoint; these are independent rows so
      // firing them together is safe and keeps the round trip to one wait.
      await Promise.all(
        subjectIds.map((subject_id) =>
          gradeSubjectsApi.assign({ grade_id: gradeId, subject_id }),
        ),
      );
      showToast(
        `Added ${subjectIds.length} subject${
          subjectIds.length === 1 ? "" : "s"
        } to ${selectedGrade?.name ?? "the grade"}'s curriculum`,
        "success",
      );
      setSelected(new Set());
      invalidate(["curriculum", "overview"]);
    } catch {
      showToast("Could not update the curriculum", "error");
    } finally {
      setWorking(false);
    }
  };

  const removeSubject = async (subjectId: number) => {
    if (!gradeId) return;
    setWorking(true);
    try {
      await gradeSubjectsApi.remove(gradeId, subjectId);
      showToast("Removed the subject from this grade's curriculum", "success");
      setRemoveTarget(null);
      invalidate(["curriculum", "overview"]);
    } catch {
      showToast("Could not remove the subject", "error");
    } finally {
      setWorking(false);
    }
  };

  if (!gradeId) {
    return (
      <CardShell>
        <EmptyState
          icon={BookOpen}
          title="Pick a grade"
          hint="A curriculum belongs to a grade. Choose one in the context bar or the class list."
        />
      </CardShell>
    );
  }

  return (
    <div className="space-y-3">
      {!can.manageAcademics && <ReadOnlyNotice what="this curriculum" />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        {/* In the curriculum */}
        <CardShell className="overflow-hidden">
          <div className="flex items-center gap-2 p-3 border-b border-gray-100 dark:border-slate-700/40">
            <GraduationCap className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-bold text-gray-800 dark:text-white truncate">
              {selectedGrade?.name ?? "Grade"} curriculum
            </h3>
            <span className="text-xs text-gray-400 tabular-nums">
              {inCurriculum.length}
            </span>
          </div>

          {academics.loading ? (
            <SkeletonRows rows={4} />
          ) : inCurriculum.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No subjects yet"
              hint="Add subjects from the list on the right — students assigned to this grade are auto-enrolled in whatever is here."
            />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700/40 max-h-[60vh] overflow-y-auto">
              {inCurriculum.map((entry, index) => {
                const teachers = teacherCounts.get(entry.subject_id) ?? 0;
                const enrolled = enrolledCounts.get(entry.subject_id) ?? 0;
                return (
                  <motion.li
                    key={entry.subject_id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index * 0.02, 0.2) }}
                    className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-700/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {entry.subject_name}
                        {entry.subject_code && (
                          <span className="ml-1.5 text-[10px] font-mono text-gray-400">
                            {entry.subject_code}
                          </span>
                        )}
                      </p>
                      <div className="flex items-center gap-2.5 mt-0.5 text-[11px]">
                        <span
                          className={`inline-flex items-center gap-1 ${
                            teachers > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          <UserCog className="w-3 h-3" />
                          {teachers > 0
                            ? `${teachers} teacher${teachers === 1 ? "" : "s"}`
                            : "unassigned"}
                        </span>
                        {roster.hasCoverage && (
                          <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400 tabular-nums">
                            <Users2 className="w-3 h-3" />
                            {enrolled}/{roster.students.length} enrolled
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      aria-label={`Remove ${entry.subject_name} from curriculum`}
                      disabled={!can.manageAcademics || working}
                      onClick={() =>
                        setRemoveTarget({
                          subject_id: entry.subject_id,
                          name: entry.subject_name,
                          enrolled,
                        })
                      }
                      className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-30"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </CardShell>

        {/* Available */}
        <CardShell className="overflow-hidden">
          <div className="flex items-center gap-2 p-3 border-b border-gray-100 dark:border-slate-700/40">
            <BookOpen className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-bold text-gray-800 dark:text-white">
              Available subjects
            </h3>
            <span className="text-xs text-gray-400 tabular-nums">
              {available.length}
            </span>
          </div>

          <div className="p-3 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a subject…"
                aria-label="Search available subjects"
                className="w-full pl-8 pr-3 py-2 text-sm rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
          </div>

          {available.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title={query ? "No matching subjects" : "Everything is in use"}
              hint={
                query
                  ? "Try a different name or code."
                  : "Every active subject is already part of this grade's curriculum."
              }
            />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700/40 max-h-[52vh] overflow-y-auto">
              {available.map((subject) => {
                const isSelected = selected.has(subject.subject_id);
                return (
                  <li
                    key={subject.subject_id}
                    className={`flex items-center gap-2 px-3 py-2.5 transition-colors ${
                      isSelected
                        ? "bg-blue-50/70 dark:bg-blue-500/10"
                        : "hover:bg-gray-50 dark:hover:bg-slate-700/30"
                    }`}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select ${subject.name}`}
                      checked={isSelected}
                      disabled={!can.manageAcademics}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(subject.subject_id))
                            next.delete(subject.subject_id);
                          else next.add(subject.subject_id);
                          return next;
                        })
                      }
                      className="w-4 h-4 rounded accent-blue-600"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {subject.name}
                      </p>
                      {subject.code && (
                        <p className="text-[10px] font-mono text-gray-400">
                          {subject.code}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`Add ${subject.name} to curriculum`}
                      disabled={!can.manageAcademics || working}
                      onClick={() => addSubjects([subject.subject_id])}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 disabled:opacity-30"
                    >
                      {working ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                    </button>
                  </li>
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
                key: "add",
                label: "Add to curriculum",
                icon: Plus,
                variant: "primary",
                loading: working,
                disabled: !can.manageAcademics,
                onClick: () => addSubjects(Array.from(selected)),
              },
            ]}
          />
        </CardShell>
      </div>

      <Modal
        isOpen={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        title={`Remove ${removeTarget?.name ?? "subject"} from the curriculum?`}
        contentClassName="p-4"
      >
        <div className="space-y-4">
          {removeTarget && removeTarget.enrolled > 0 ? (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                {removeTarget.enrolled} student
                {removeTarget.enrolled === 1 ? " is" : "s are"} enrolled in it
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-1">
                Their existing enrollments are kept, but new students in this
                grade will no longer be enrolled automatically.
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              No student in this class group is enrolled in it.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={working}
              onClick={() =>
                removeTarget && removeSubject(removeTarget.subject_id)
              }
            >
              Remove subject
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SubjectsLens;
