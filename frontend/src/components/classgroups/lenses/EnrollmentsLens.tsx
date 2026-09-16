import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "framer-motion";
import {
  ClipboardList,
  Check,
  Search,
  Save,
  Undo2,
  ArrowUpRight,
  UserCog,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import {
  studentEnrollmentApi,
} from "../../../api/academics";
import { classGroupsWorkspaceApi } from "../../../api/classGroups";
import { useToast } from "../../../contexts/ToastContext";
import { useClassGroups } from "../ClassGroupsContext";
import { useClassRoster } from "../useClassRoster";
import { useClassAcademics } from "../useClassAcademics";
import { useVirtualRows } from "../useVirtualRows";
import BulkActionBar from "../BulkActionBar";
import ReadinessRing from "../ReadinessRing";
import PromoteStudentsModal from "../../academics/PromoteStudentsModal";
import {
  CardShell,
  EmptyState,
  ReadOnlyNotice,
  SkeletonRows,
  fullName,
} from "../shared";

const ROW_HEIGHT = 40;

const cellKey = (userId: number, subjectId: number) => `${userId}:${subjectId}`;

/**
 * Arrow-key movement across the matrix. Cells carry their coordinates as data
 * attributes and focus is moved by lookup rather than by held refs, so
 * virtualised rows scrolling in and out never leave a stale ref behind.
 */
const focusCell = (
  grid: HTMLElement | null,
  row: number,
  col: number,
): HTMLButtonElement | null => {
  const target = grid?.querySelector<HTMLButtonElement>(
    `[data-cell-row="${row}"][data-cell-col="${col}"]`,
  );
  target?.focus();
  return target ?? null;
};

/**
 * Lens 5 — who studies what, and what is still incomplete?
 *
 * The matrix edits a staged diff rather than writing per click: a cell flips
 * the instant you click it (so it feels direct), but nothing reaches the
 * server until Apply, which commits the whole diff in at most two requests —
 * one bulk enroll, one bulk unenroll. Painting a column of forty students is
 * then two requests and one undoable decision, not eighty writes.
 */
const EnrollmentsLens: React.FC = () => {
  const { showToast } = useToast();
  const {
    classGroupId,
    academicYearId,
    academicYears,
    classGroups,
    selectedClassGroup,
    can,
    invalidate,
  } = useClassGroups();

  const roster = useClassRoster();
  const academics = useClassAcademics();

  const [filter, setFilter] = useState("");
  /** cellKey -> desired enrolled state, only where it differs from the server. */
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());
  const [saving, setSaving] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLTableElement>(null);
  const paintingRef = useRef<{ active: boolean; value: boolean } | null>(null);

  useEffect(() => {
    setPending(new Map());
  }, [classGroupId, academicYearId]);

  // Painting continues while the pointer is held even outside the grid, so the
  // release has to be caught on the window.
  useEffect(() => {
    const stop = () => {
      paintingRef.current = null;
    };
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const serverEnrolled = useMemo(() => {
    const set = new Set<string>();
    for (const student of roster.students) {
      for (const subjectId of student.enrolled_subject_ids ?? []) {
        set.add(cellKey(student.user_id, subjectId));
      }
    }
    return set;
  }, [roster.students]);

  const isEnrolled = useCallback(
    (userId: number, subjectId: number) => {
      const key = cellKey(userId, subjectId);
      const staged = pending.get(key);
      return staged ?? serverEnrolled.has(key);
    },
    [pending, serverEnrolled],
  );

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return roster.students;
    return roster.students.filter((s) =>
      [s.first_name, s.last_name, s.username, s.email, s.registration_number]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [roster.students, filter]);

  const window_ = useVirtualRows(scrollRef, visible.length, ROW_HEIGHT);
  const windowed = visible.slice(window_.start, window_.end);

  /** Stage a target state, dropping the entry when it matches the server. */
  const stage = useCallback(
    (pairs: { userId: number; subjectId: number }[], value: boolean) => {
      if (!can.manageEnrollments || pairs.length === 0) return;
      setPending((prev) => {
        const next = new Map(prev);
        for (const { userId, subjectId } of pairs) {
          const key = cellKey(userId, subjectId);
          if (serverEnrolled.has(key) === value) next.delete(key);
          else next.set(key, value);
        }
        return next;
      });
    },
    [can.manageEnrollments, serverEnrolled],
  );

  const toggleCell = useCallback(
    (userId: number, subjectId: number) =>
      stage([{ userId, subjectId }], !isEnrolled(userId, subjectId)),
    [stage, isEnrolled],
  );

  const handleCellKeyDown = useCallback(
    (
      e: React.KeyboardEvent,
      row: number,
      col: number,
      userId: number,
      subjectId: number,
    ) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggleCell(userId, subjectId);
        return;
      }

      const deltas: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      const delta = deltas[e.key];
      if (!delta) return;

      e.preventDefault();
      const nextRow = Math.min(
        Math.max(0, row + delta[0]),
        Math.max(0, visible.length - 1),
      );
      const nextCol = Math.min(
        Math.max(0, col + delta[1]),
        Math.max(0, roster.subjects.length - 1),
      );
      if (nextRow === row && nextCol === col) return;

      // Shift extends the gesture: the cell moved into takes the value of the
      // cell moved from, the way a spreadsheet paints a range.
      if (e.shiftKey) {
        const target = visible[nextRow];
        const targetSubject = roster.subjects[nextCol];
        if (target && targetSubject) {
          stage(
            [
              {
                userId: target.user_id,
                subjectId: targetSubject.subject_id,
              },
            ],
            isEnrolled(userId, subjectId),
          );
        }
      }

      focusCell(gridRef.current, nextRow, nextCol);
    },
    [visible, roster.subjects, toggleCell, stage, isEnrolled],
  );

  /** A column header toggles only the students the filter left on screen. */
  const toggleColumn = useCallback(
    (subjectId: number) => {
      const allOn = visible.every((s) => isEnrolled(s.user_id, subjectId));
      stage(
        visible.map((s) => ({ userId: s.user_id, subjectId })),
        !allOn,
      );
    },
    [visible, isEnrolled, stage],
  );

  const toggleRow = useCallback(
    (userId: number) => {
      const subjectIds = roster.subjects.map((s) => s.subject_id);
      const allOn = subjectIds.every((subjectId) => isEnrolled(userId, subjectId));
      stage(
        subjectIds.map((subjectId) => ({ userId, subjectId })),
        !allOn,
      );
    },
    [roster.subjects, isEnrolled, stage],
  );

  const fillGaps = useCallback(() => {
    const pairs: { userId: number; subjectId: number }[] = [];
    for (const student of visible) {
      for (const subject of roster.subjects) {
        if (!isEnrolled(student.user_id, subject.subject_id)) {
          pairs.push({ userId: student.user_id, subjectId: subject.subject_id });
        }
      }
    }
    stage(pairs, true);
  }, [visible, roster.subjects, isEnrolled, stage]);

  const diff = useMemo(() => {
    const toEnroll: { userId: number; subjectId: number }[] = [];
    const toUnenroll: { userId: number; subjectId: number }[] = [];
    pending.forEach((value, key) => {
      const [userId, subjectId] = key.split(":").map(Number);
      (value ? toEnroll : toUnenroll).push({ userId, subjectId });
    });
    return { toEnroll, toUnenroll };
  }, [pending]);

  const apply = async () => {
    if (!academicYearId || pending.size === 0) return;
    setSaving(true);
    try {
      // Two requests at most: the diff is grouped by direction, and each
      // direction is sent as one bulk call over the union of its ids. The
      // server skips pairs that already match, so the cross-product a union
      // implies is harmless.
      if (diff.toEnroll.length > 0) {
        await studentEnrollmentApi.bulkEnroll({
          user_ids: Array.from(new Set(diff.toEnroll.map((p) => p.userId))),
          subject_ids: Array.from(new Set(diff.toEnroll.map((p) => p.subjectId))),
          academic_year_id: academicYearId,
        });
      }
      if (diff.toUnenroll.length > 0) {
        await classGroupsWorkspaceApi.bulkUnenrollStudents({
          user_ids: Array.from(new Set(diff.toUnenroll.map((p) => p.userId))),
          subject_ids: Array.from(
            new Set(diff.toUnenroll.map((p) => p.subjectId)),
          ),
          academic_year_id: academicYearId,
        });
      }
      showToast(
        `Saved ${diff.toEnroll.length} enrollment(s) and ${diff.toUnenroll.length} removal(s)`,
        "success",
      );
      setPending(new Map());
      invalidate(["roster", "overview"]);
    } catch {
      showToast("Could not save the enrollment changes", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!classGroupId) {
    return (
      <CardShell>
        <EmptyState
          icon={ClipboardList}
          title="Pick a class group"
          hint="The enrollment matrix shows one class group's students against its grade's curriculum."
        />
      </CardShell>
    );
  }

  if (!roster.hasCoverage && !roster.loading) {
    return (
      <CardShell>
        <EmptyState
          icon={ClipboardList}
          title="Enrollment data unavailable"
          hint="Viewing the enrollment matrix needs the MANAGE_STUDENT_ENROLLMENTS permission."
        />
      </CardShell>
    );
  }

  const fullyEnrolled = visible.filter((s) =>
    roster.subjects.every((subject) => isEnrolled(s.user_id, subject.subject_id)),
  ).length;

  return (
    <div className="space-y-3">
      {!can.manageEnrollments && <ReadOnlyNotice what="enrollments" />}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-3 items-start">
        {/* Matrix */}
        <CardShell className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-100 dark:border-slate-700/40">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter students…"
                aria-label="Filter matrix students"
                className="w-full pl-8 pr-3 py-2 text-sm rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>

            <ReadinessRing
              value={fullyEnrolled}
              total={visible.length}
              size={18}
              label={`${fullyEnrolled}/${visible.length} complete`}
            />

            <button
              type="button"
              disabled={!can.manageEnrollments || roster.subjects.length === 0}
              onClick={fillGaps}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Fill every gap
            </button>
          </div>

          {roster.loading ? (
            <SkeletonRows rows={5} />
          ) : roster.students.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No students to enroll"
              hint="Add students to this class group in the Students lens first."
            />
          ) : roster.subjects.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No curriculum to enroll into"
              hint="Add subjects to this grade's curriculum in the Subjects lens first."
            />
          ) : (
            <div
              ref={scrollRef}
              className="overflow-auto max-h-[62vh]"
              onPointerLeave={() => {
                paintingRef.current = null;
              }}
            >
              <table
                ref={gridRef}
                className="border-separate border-spacing-0 text-sm"
              >
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="sticky left-0 top-0 z-30 bg-gray-50 dark:bg-slate-900 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold px-3 py-2 min-w-[190px] border-b border-r border-gray-200 dark:border-slate-700/60"
                    >
                      Student
                    </th>
                    {roster.subjects.map((subject) => {
                      const allOn =
                        visible.length > 0 &&
                        visible.every((s) =>
                          isEnrolled(s.user_id, subject.subject_id),
                        );
                      return (
                        <th
                          key={subject.subject_id}
                          scope="col"
                          className="sticky top-0 z-20 bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700/60 px-1 py-2 align-bottom"
                        >
                          <button
                            type="button"
                            disabled={!can.manageEnrollments}
                            onClick={() => toggleColumn(subject.subject_id)}
                            title={`${allOn ? "Unenroll" : "Enroll"} every student in view from ${subject.name}`}
                            className={`w-full min-w-[72px] max-w-[110px] px-1.5 py-1 rounded-lg text-[11px] font-semibold leading-tight transition-colors ${
                              allOn
                                ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                                : "text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700"
                            } disabled:cursor-not-allowed`}
                          >
                            <span className="block truncate">{subject.name}</span>
                            {subject.code && (
                              <span className="block truncate font-mono text-[9px] text-gray-400">
                                {subject.code}
                              </span>
                            )}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {window_.padTop > 0 && (
                    <tr aria-hidden="true">
                      <td
                        colSpan={roster.subjects.length + 1}
                        style={{ height: window_.padTop }}
                      />
                    </tr>
                  )}

                  {windowed.map((student, rowIndex) => {
                    const rowComplete = roster.subjects.every((subject) =>
                      isEnrolled(student.user_id, subject.subject_id),
                    );
                    return (
                      <tr key={student.user_id} style={{ height: ROW_HEIGHT }}>
                        <th
                          scope="row"
                          className="sticky left-0 z-10 bg-white dark:bg-slate-800 border-b border-r border-gray-100 dark:border-slate-700/40 px-3 py-1 text-left font-normal"
                        >
                          <button
                            type="button"
                            disabled={!can.manageEnrollments}
                            onClick={() => toggleRow(student.user_id)}
                            title={`${rowComplete ? "Unenroll" : "Enroll"} ${
                              fullName(student.first_name, student.last_name) ||
                              student.username
                            } from every subject`}
                            className="w-full text-left group disabled:cursor-not-allowed"
                          >
                            <span className="block text-sm font-medium text-gray-900 dark:text-white truncate max-w-[170px] group-hover:text-blue-600 dark:group-hover:text-blue-400">
                              {fullName(student.first_name, student.last_name) ||
                                student.username}
                            </span>
                            {student.registration_number && (
                              <span className="block text-xs text-gray-400 truncate max-w-[170px]">
                                {student.registration_number}
                              </span>
                            )}
                          </button>
                        </th>

                        {roster.subjects.map((subject, colIndex) => {
                          const enrolled = isEnrolled(
                            student.user_id,
                            subject.subject_id,
                          );
                          const key = cellKey(student.user_id, subject.subject_id);
                          const isPending = pending.has(key);
                          return (
                            <td
                              key={subject.subject_id}
                              className="border-b border-gray-100 dark:border-slate-700/40 p-0 text-center"
                            >
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={enrolled}
                                aria-label={`${
                                  fullName(student.first_name, student.last_name) ||
                                  student.username
                                } — ${subject.name}`}
                                disabled={!can.manageEnrollments}
                                onPointerDown={() => {
                                  if (!can.manageEnrollments) return;
                                  const nextValue = !enrolled;
                                  paintingRef.current = {
                                    active: true,
                                    value: nextValue,
                                  };
                                  stage(
                                    [
                                      {
                                        userId: student.user_id,
                                        subjectId: subject.subject_id,
                                      },
                                    ],
                                    nextValue,
                                  );
                                }}
                                onPointerEnter={() => {
                                  // Drag-painting: keep applying the value the
                                  // gesture started with, so a drag never
                                  // flip-flops cells it passes over twice.
                                  const paint = paintingRef.current;
                                  if (!paint?.active) return;
                                  stage(
                                    [
                                      {
                                        userId: student.user_id,
                                        subjectId: subject.subject_id,
                                      },
                                    ],
                                    paint.value,
                                  );
                                }}
                                data-cell-row={window_.start + rowIndex}
                                data-cell-col={colIndex}
                                onKeyDown={(e) =>
                                  handleCellKeyDown(
                                    e,
                                    window_.start + rowIndex,
                                    colIndex,
                                    student.user_id,
                                    subject.subject_id,
                                  )
                                }
                                className={`w-full h-9 min-w-[72px] flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:cursor-not-allowed ${
                                  enrolled
                                    ? "bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20"
                                    : "hover:bg-gray-100 dark:hover:bg-slate-700/50"
                                } ${
                                  isPending
                                    ? "ring-2 ring-inset ring-amber-400/70"
                                    : ""
                                }`}
                              >
                                <span
                                  className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                                    enrolled
                                      ? "bg-emerald-500 border-emerald-500 text-white"
                                      : "border-gray-300 dark:border-slate-600"
                                  }`}
                                >
                                  {enrolled && <Check className="w-3.5 h-3.5" />}
                                </span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {window_.padBottom > 0 && (
                    <tr aria-hidden="true">
                      <td
                        colSpan={roster.subjects.length + 1}
                        style={{ height: window_.padBottom }}
                      />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <BulkActionBar
            count={pending.size}
            noun="change"
            onClear={() => setPending(new Map())}
            detail={
              <span className="tabular-nums">
                +{diff.toEnroll.length} enroll · −{diff.toUnenroll.length}{" "}
                remove
              </span>
            }
            actions={[
              {
                key: "apply",
                label: "Apply changes",
                icon: Save,
                variant: "primary",
                loading: saving,
                disabled: !can.manageEnrollments,
                onClick: apply,
              },
              {
                key: "discard",
                label: "Discard",
                icon: Undo2,
                onClick: () => setPending(new Map()),
              },
            ]}
          />
        </CardShell>

        {/* Assignments rail */}
        <div className="space-y-3">
          <CardShell className="p-3" delay={0.05}>
            <div className="flex items-center gap-2 mb-2">
              <UserCog className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-bold text-gray-800 dark:text-white">
                Assignments
              </h3>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-gray-50 dark:bg-slate-900/40 px-2.5 py-2 mb-2">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              <span className="text-xs text-gray-600 dark:text-gray-300 truncate">
                {academics.classTeacher?.user_name ?? "No class teacher"}
              </span>
            </div>

            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {academics.curriculum.map((entry) => {
                const teachers = academics.assignments.filter(
                  (a) => a.subject_id === entry.subject_id,
                );
                return (
                  <li
                    key={entry.subject_id}
                    className="flex items-start gap-2 text-xs px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/30"
                  >
                    <span className="flex-1 min-w-0 text-gray-700 dark:text-gray-200 truncate">
                      {entry.subject_name}
                    </span>
                    {teachers.length > 0 ? (
                      <span className="text-gray-500 dark:text-gray-400 truncate max-w-[110px]">
                        {teachers.map((t) => t.teacher_name).join(", ")}
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-1 shrink-0">
                        <AlertTriangle className="w-3 h-3" />
                        none
                      </span>
                    )}
                  </li>
                );
              })}
              {academics.curriculum.length === 0 && (
                <li className="text-xs text-gray-400 px-2 py-3">
                  No subjects in this grade's curriculum.
                </li>
              )}
            </ul>

            <p className="text-[11px] text-gray-400 mt-2 pt-2 border-t border-gray-100 dark:border-slate-700/40">
              Manage these in the Teachers lens.
            </p>
          </CardShell>

          <CardShell className="p-3" delay={0.1}>
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpRight className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-bold text-gray-800 dark:text-white">
                Year rollover
              </h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Move every grade's students into the next grade for a new year,
              with a preview you can override before it runs.
            </p>
            <button
              type="button"
              disabled={!can.assignClassGroups}
              onClick={() => setPromoteOpen(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              Promote students
            </button>
          </CardShell>
        </div>
      </div>

      <PromoteStudentsModal
        isOpen={promoteOpen}
        onClose={() => setPromoteOpen(false)}
        academicYears={academicYears}
        classGroups={classGroups}
        onPromoted={() => invalidate(["roster", "overview"])}
      />

      {/* Motion-free announcement of unsaved work for assistive tech. */}
      {pending.size > 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="sr-only"
          aria-live="polite"
        >
          {pending.size} unsaved enrollment change
          {pending.size === 1 ? "" : "s"} for {selectedClassGroup?.name}
        </motion.p>
      )}
    </div>
  );
};

export default EnrollmentsLens;
