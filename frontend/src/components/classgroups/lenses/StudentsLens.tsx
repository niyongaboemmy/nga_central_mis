import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Users2,
  UserPlus,
  UserMinus,
  Search,
  ArrowRightLeft,
  Loader2,
  CheckCircle2,
  Inbox,
  Download,
} from "lucide-react";
import * as XLSX from "xlsx";
import { studentClassGroupApi } from "../../../api/academics";
import {
  classGroupsWorkspaceApi,
  UnassignedStudent,
} from "../../../api/classGroups";
import { searchUsers, UserSearchResult } from "../../../api/users";
import { useToast } from "../../../contexts/ToastContext";
import { useClassGroups } from "../ClassGroupsContext";
import { useClassRoster } from "../useClassRoster";
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
  StatTile,
  fullName,
} from "../shared";

const SEARCH_DEBOUNCE_MS = 350;

/** Lens 1 — who is in this class, and is anyone missing? */
const StudentsLens: React.FC = () => {
  const { showToast } = useToast();
  const {
    classGroupId,
    academicYearId,
    selectedClassGroup,
    selectedOverview,
    classGroups,
    grades,
    can,
    invalidate,
  } = useClassGroups();

  const roster = useClassRoster();

  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [addOpen, setAddOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [working, setWorking] = useState(false);

  // Reset the selection whenever the roster's scope changes — a stale
  // selection would otherwise apply an action to students not on screen.
  useEffect(() => {
    setSelected(new Set());
  }, [classGroupId, academicYearId]);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return roster.students;
    return roster.students.filter((s) =>
      [s.first_name, s.last_name, s.username, s.email, s.registration_number]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle)),
    );
  }, [roster.students, filter]);

  const visibleIds = useMemo(() => visible.map((s) => s.user_id), [visible]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected =
    !allVisibleSelected && visibleIds.some((id) => selected.has(id));

  const toggleOne = (userId: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  // Select-all only ever touches what the filter leaves on screen.
  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });

  const afterRosterWrite = useCallback(() => {
    setSelected(new Set());
    invalidate(["roster", "overview"]);
  }, [invalidate]);

  const handleRemove = async () => {
    if (!classGroupId || !academicYearId) return;
    setWorking(true);
    try {
      const ids = Array.from(selected);
      await Promise.all(
        ids.map((userId) =>
          studentClassGroupApi.remove(userId, classGroupId, academicYearId),
        ),
      );
      showToast(
        `Removed ${ids.length} student${ids.length === 1 ? "" : "s"} from ${
          selectedClassGroup?.name ?? "the class"
        }`,
        "success",
      );
      setRemoveOpen(false);
      afterRosterWrite();
    } catch {
      showToast("Could not remove the selected students", "error");
    } finally {
      setWorking(false);
    }
  };

  const handleMove = async (targetClassGroupId: number) => {
    if (!academicYearId) return;
    setWorking(true);
    try {
      const ids = Array.from(selected);
      const res = await studentClassGroupApi.bulkAssign({
        user_ids: ids,
        class_group_id: targetClassGroupId,
        academic_year_id: academicYearId,
      });
      const data = res.data.data;
      showToast(
        `Moved ${data.assigned + data.reactivated} student(s); ${
          data.subjects_enrolled
        } subject enrollment(s) created`,
        "success",
      );
      setMoveOpen(false);
      afterRosterWrite();
    } catch {
      showToast("Could not move the selected students", "error");
    } finally {
      setWorking(false);
    }
  };

  const handleExport = () => {
    const rows = visible.map((s) => ({
      "Reg. No.": s.registration_number ?? "",
      "First name": s.first_name ?? "",
      "Last name": s.last_name ?? "",
      Username: s.username,
      Email: s.email,
      Gender: s.gender ?? "",
      ...(roster.hasCoverage
        ? { "Subjects enrolled": `${s.enrolled_count}/${s.total_subjects}` }
        : {}),
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Roster");
    XLSX.writeFile(
      book,
      `${selectedClassGroup?.name ?? "class"}-roster.xlsx`.replace(/\s+/g, "-"),
    );
  };

  if (!classGroupId) {
    return (
      <CardShell>
        <EmptyState
          icon={Users2}
          title="Pick a class group"
          hint="Choose one from the class list or the context bar above to see its roster."
        />
      </CardShell>
    );
  }

  return (
    <div className="space-y-3">
      {/* Class summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatTile
          icon={Users2}
          label="Students"
          value={roster.students.length}
          accent="bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300"
          loading={roster.loading}
        />
        <StatTile
          icon={CheckCircle2}
          label="Fully enrolled"
          value={selectedOverview?.fully_enrolled_student_count ?? 0}
          accent="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300"
          loading={roster.loading}
        />
        <StatTile
          icon={ArrowRightLeft}
          label="Curriculum size"
          value={selectedOverview?.curriculum_subject_count ?? 0}
          accent="bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300"
          loading={roster.loading}
        />
        <StatTile
          icon={Inbox}
          label="Class group"
          value={selectedClassGroup?.name ?? "—"}
          accent="bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300"
        />
      </div>

      {!can.assignClassGroups && (
        <ReadOnlyNotice what="this class group's roster" />
      )}

      <CardShell className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-100 dark:border-slate-700/40">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter this roster…"
              aria-label="Filter roster"
              className="w-full pl-8 pr-3 py-2 text-sm rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 text-gray-800 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={visible.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-slate-700/60 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            disabled={!can.assignClassGroups}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add students
          </button>
        </div>

        {/* Roster */}
        {roster.loading ? (
          <SkeletonRows />
        ) : roster.error ? (
          <EmptyState
            icon={Users2}
            title="Roster unavailable"
            hint={roster.error}
            action={
              <Button size="sm" variant="secondary" onClick={roster.reload}>
                Try again
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Users2}
            title={filter ? "No matching students" : "No students in this class"}
            hint={
              filter
                ? "Clear the filter to see the whole roster."
                : "Add students to this class group for the selected academic year."
            }
            action={
              !filter && can.assignClassGroups ? (
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  Add students
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50/90 dark:bg-slate-900/80 backdrop-blur-sm">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all students in view"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someVisibleSelected;
                      }}
                      onChange={toggleAllVisible}
                      className="w-4 h-4 rounded accent-blue-600"
                    />
                  </th>
                  <th className="px-3 py-2 font-semibold">Student</th>
                  <th className="px-3 py-2 font-semibold hidden md:table-cell">
                    Email
                  </th>
                  <th className="px-3 py-2 font-semibold hidden sm:table-cell">
                    Gender
                  </th>
                  {roster.hasCoverage && (
                    <th className="px-3 py-2 font-semibold">Subjects</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((student, index) => {
                  const isSelected = selected.has(student.user_id);
                  return (
                    <motion.tr
                      key={student.user_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(index * 0.01, 0.2) }}
                      onClick={() => can.assignClassGroups && toggleOne(student.user_id)}
                      className={`border-t border-gray-100 dark:border-slate-700/40 transition-colors ${
                        isSelected
                          ? "bg-blue-50/70 dark:bg-blue-500/10"
                          : "hover:bg-gray-50 dark:hover:bg-slate-700/30"
                      } ${can.assignClassGroups ? "cursor-pointer" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Select ${fullName(student.first_name, student.last_name) || student.username}`}
                          checked={isSelected}
                          disabled={!can.assignClassGroups}
                          onChange={() => toggleOne(student.user_id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded accent-blue-600"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar
                            userId={student.user_id}
                            first={student.first_name}
                            last={student.last_name}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">
                              {fullName(student.first_name, student.last_name) ||
                                student.username}
                            </p>
                            {student.registration_number && (
                              <p className="text-xs text-gray-400 truncate">
                                {student.registration_number}
                              </p>
                            )}
                            <p className="text-xs text-gray-400 truncate md:hidden">
                              {student.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400 hidden md:table-cell truncate">
                        {student.email}
                      </td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                        {student.gender ?? "—"}
                      </td>
                      {roster.hasCoverage && (
                        <td className="px-3 py-2">
                          <ReadinessRing
                            value={student.enrolled_count ?? 0}
                            total={student.total_subjects ?? 0}
                            size={18}
                          />
                        </td>
                      )}
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <BulkActionBar
          count={selected.size}
          noun="student"
          onClear={() => setSelected(new Set())}
          actions={[
            {
              key: "move",
              label: "Move to class",
              icon: ArrowRightLeft,
              variant: "primary",
              disabled: !can.assignClassGroups,
              onClick: () => setMoveOpen(true),
            },
            {
              key: "remove",
              label: "Remove from class",
              icon: UserMinus,
              variant: "danger",
              disabled: !can.assignClassGroups,
              onClick: () => setRemoveOpen(true),
            },
          ]}
        />
      </CardShell>

      <AddStudentsModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onDone={afterRosterWrite}
      />

      <MoveStudentsModal
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        count={selected.size}
        working={working}
        options={classGroups
          .filter((c) => c.class_group_id !== classGroupId)
          .map((c) => {
            const grade = grades.find((g) => g.grade_id === c.grade_id);
            return {
              id: c.class_group_id,
              label: grade ? `${grade.name} · ${c.name}` : c.name,
            };
          })
          .sort((a, b) => a.label.localeCompare(b.label))}
        onConfirm={handleMove}
      />

      <ConfirmModal
        isOpen={removeOpen}
        onClose={() => setRemoveOpen(false)}
        onConfirm={handleRemove}
        isLoading={working}
        title="Remove students from this class?"
        confirmText="Remove"
        message={`${selected.size} student${
          selected.size === 1 ? "" : "s"
        } will leave ${selectedClassGroup?.name ?? "this class group"} for the selected academic year. Their subject enrollments are kept as history.`}
      />
    </div>
  );
};

/* ── Add students ──────────────────────────────────────────────────────── */

const AddStudentsModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}> = ({ open, onClose, onDone }) => {
  const { showToast } = useToast();
  const { classGroupId, academicYearId, selectedClassGroup } = useClassGroups();

  const [tab, setTab] = useState<"unassigned" | "search">("unassigned");
  const [unassigned, setUnassigned] = useState<UnassignedStudent[]>([]);
  const [unassignedTotal, setUnassignedTotal] = useState(0);
  const [loadingUnassigned, setLoadingUnassigned] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setPicked(new Set());
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // The unassigned tray is the default because it is the pool an admin
  // actually draws from; free-text search is the escape hatch for a student
  // who already sits in another class.
  useEffect(() => {
    if (!open || tab !== "unassigned" || !academicYearId) return;
    let cancelled = false;
    (async () => {
      setLoadingUnassigned(true);
      try {
        const res = await classGroupsWorkspaceApi.unassignedStudents({
          academic_year_id: academicYearId,
          search: debounced || undefined,
          limit: 100,
        });
        if (cancelled) return;
        setUnassigned(res.data.data.students ?? []);
        setUnassignedTotal(res.data.data.total ?? 0);
      } catch {
        if (!cancelled) setUnassigned([]);
      } finally {
        if (!cancelled) setLoadingUnassigned(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tab, academicYearId, debounced]);

  useEffect(() => {
    if (!open || tab !== "search" || debounced.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setSearching(true);
      try {
        const found = await searchUsers(debounced.trim());
        if (!cancelled) {
          setResults(found.filter((u) => u.user_type === "STUDENT"));
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
  }, [open, tab, debounced]);

  const rows =
    tab === "unassigned"
      ? unassigned.map((s) => ({
          user_id: s.user_id,
          first_name: s.first_name,
          last_name: s.last_name,
          email: s.email,
          username: s.username,
          registration_number: s.registration_number ?? null,
        }))
      : results.map((s) => ({
          user_id: s.user_id,
          first_name: s.first_name ?? null,
          last_name: s.last_name ?? null,
          email: s.email,
          username: s.username,
          registration_number: s.registration_number ?? null,
        }));

  const handleSave = async () => {
    if (!classGroupId || picked.size === 0) return;
    setSaving(true);
    try {
      const res = await studentClassGroupApi.bulkAssign({
        user_ids: Array.from(picked),
        class_group_id: classGroupId,
        academic_year_id: academicYearId ?? undefined,
      });
      const data = res.data.data;
      showToast(
        `Added ${data.assigned + data.reactivated} student(s) to ${
          selectedClassGroup?.name ?? "the class"
        }; ${data.subjects_enrolled} curriculum enrollment(s) created`,
        "success",
      );
      onClose();
      onDone();
    } catch {
      showToast("Could not add the selected students", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      size="xl"
      title={`Add students to ${selectedClassGroup?.name ?? "class"}`}
      contentClassName="p-4"
    >
      <div className="space-y-3">
        <div className="flex gap-1 bg-gray-100 dark:bg-slate-800 rounded-full p-1 w-fit">
          {(
            [
              ["unassigned", `Unassigned (${unassignedTotal})`],
              ["search", "Search everyone"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                tab === id
                  ? "bg-blue-500 text-white"
                  : "text-gray-600 dark:text-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              tab === "unassigned"
                ? "Filter unassigned students…"
                : "Search by name, username or email…"
            }
            aria-label="Search students"
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>

        <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-gray-100 dark:border-slate-700/40 divide-y divide-gray-100 dark:divide-slate-700/40">
          {(tab === "unassigned" ? loadingUnassigned : searching) ? (
            <div className="flex items-center justify-center py-8 text-gray-400 text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={
                tab === "unassigned"
                  ? "No unassigned students"
                  : "No students match that search"
              }
              hint={
                tab === "unassigned"
                  ? "Every student already sits in a class group for this year."
                  : "Try a different name, username or email."
              }
            />
          ) : (
            rows.map((row) => {
              const isPicked = picked.has(row.user_id);
              return (
                <label
                  key={row.user_id}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                    isPicked
                      ? "bg-blue-50 dark:bg-blue-500/10"
                      : "hover:bg-gray-50 dark:hover:bg-slate-700/30"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isPicked}
                    onChange={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.user_id)) next.delete(row.user_id);
                        else next.add(row.user_id);
                        return next;
                      })
                    }
                    className="w-4 h-4 rounded accent-blue-600"
                  />
                  <Avatar userId={row.user_id} first={row.first_name} last={row.last_name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {fullName(row.first_name, row.last_name) || row.username}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {row.registration_number
                        ? `${row.registration_number} · ${row.email}`
                        : row.email}
                    </p>
                  </div>
                </label>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <span className="text-xs text-gray-500 mr-auto tabular-nums">
            {picked.size} selected
          </span>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={picked.size === 0 || saving}
            isLoading={saving}
          >
            Add {picked.size > 0 ? picked.size : ""} to class
          </Button>
        </div>
      </div>
    </Modal>
  );
};

/* ── Move students ─────────────────────────────────────────────────────── */

const MoveStudentsModal: React.FC<{
  open: boolean;
  onClose: () => void;
  count: number;
  working: boolean;
  options: { id: number; label: string }[];
  onConfirm: (classGroupId: number) => void;
}> = ({ open, onClose, count, working, options, onConfirm }) => {
  const [target, setTarget] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setTarget(null);
      setQuery("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? options.filter((o) => o.label.toLowerCase().includes(needle))
      : options;
  }, [options, query]);

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`Move ${count} student${count === 1 ? "" : "s"}`}
      contentClassName="p-4"
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Students keep their previous class as history, and are auto-enrolled
          in the destination grade's curriculum.
        </p>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a class group…"
          aria-label="Find destination class group"
          className="w-full px-3 py-2 text-sm rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />

        <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-100 dark:border-slate-700/40 divide-y divide-gray-100 dark:divide-slate-700/40">
          {filtered.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setTarget(option.id)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                target === option.id
                  ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 font-medium"
                  : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700/30"
              }`}
            >
              {option.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-gray-400">
              No class groups match.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={working}>
            Cancel
          </Button>
          <Button
            onClick={() => target && onConfirm(target)}
            disabled={!target || working}
            isLoading={working}
          >
            Move students
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default StudentsLens;
