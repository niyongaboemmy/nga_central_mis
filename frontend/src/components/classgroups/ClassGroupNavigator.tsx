import UserAvatar from "../ui/UserAvatar";
import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ChevronDown,
  AlertTriangle,
  Users2,
  UserCheck,
  Layers,
  X,
} from "lucide-react";
import { useClassGroups } from "./ClassGroupsContext";
import ReadinessRing from "./ReadinessRing";
import { checksFor, failedChecks } from "./readiness";
import { EmptyState } from "./shared";
import { ClassGroupOverviewRow } from "../../api/classGroups";

/**
 * The master list of the workspace's list-detail layout: every class group in
 * the selected year, grouped by grade, each showing at a glance how far its
 * setup has got. Selecting one drives every lens on the right.
 */
const ClassGroupNavigator: React.FC<{ onSelect?: () => void }> = ({
  onSelect,
}) => {
  const {
    overview,
    overviewLoading,
    classGroupId,
    programId,
    focusClassGroup,
    activeLens,
  } = useClassGroups();

  const [query, setQuery] = useState("");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [collapsedGrades, setCollapsedGrades] = useState<Set<number>>(
    new Set(),
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return overview.filter((row) => {
      if (programId !== null && row.program_id !== programId) return false;
      if (onlyIncomplete && failedChecks(row).length === 0) return false;
      if (!needle) return true;
      return (
        row.class_group_name.toLowerCase().includes(needle) ||
        row.grade_name.toLowerCase().includes(needle) ||
        row.program_name.toLowerCase().includes(needle)
      );
    });
  }, [overview, programId, onlyIncomplete, query]);

  const groups = useMemo(() => {
    const byGrade = new Map<
      number,
      { grade_name: string; program_name: string; level_order: number; rows: ClassGroupOverviewRow[] }
    >();
    for (const row of rows) {
      if (!byGrade.has(row.grade_id)) {
        byGrade.set(row.grade_id, {
          grade_name: row.grade_name,
          program_name: row.program_name,
          level_order: row.level_order,
          rows: [],
        });
      }
      byGrade.get(row.grade_id)!.rows.push(row);
    }
    return Array.from(byGrade.entries()).sort(
      (a, b) =>
        a[1].program_name.localeCompare(b[1].program_name) ||
        a[1].level_order - b[1].level_order,
    );
  }, [rows]);

  const incompleteTotal = useMemo(
    () =>
      overview.filter(
        (row) =>
          (programId === null || row.program_id === programId) &&
          failedChecks(row).length > 0,
      ).length,
    [overview, programId],
  );

  const toggleGrade = (gradeId: number) =>
    setCollapsedGrades((prev) => {
      const next = new Set(prev);
      if (next.has(gradeId)) next.delete(gradeId);
      else next.add(gradeId);
      return next;
    });

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search + filter */}
      <div className="p-3 space-y-2 border-b border-gray-100 dark:border-slate-700/40">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a class…"
            aria-label="Search class groups"
            className="w-full pl-8 pr-8 py-2 text-sm rounded-xl bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700/50 text-gray-800 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOnlyIncomplete((v) => !v)}
          aria-pressed={onlyIncomplete}
          className={`w-full inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors ${
            onlyIncomplete
              ? "bg-amber-500 text-white"
              : "bg-gray-50 dark:bg-slate-900/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700/60"
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Only incomplete
          <span className="ml-auto tabular-nums opacity-80">
            {incompleteTotal}
          </span>
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-3">
        {overviewLoading ? (
          <div className="space-y-2 p-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-14 rounded-xl bg-gray-100 dark:bg-slate-800/60 animate-pulse"
              />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No class groups"
            hint={
              onlyIncomplete
                ? "Every class group in view is fully set up."
                : "Create grades and class groups in the Grades & Class Groups lens."
            }
          />
        ) : (
          groups.map(([gradeId, group]) => {
            const collapsed = collapsedGrades.has(gradeId);
            return (
              <div key={gradeId}>
                <button
                  type="button"
                  onClick={() => toggleGrade(gradeId)}
                  aria-expanded={!collapsed}
                  className="w-full flex items-center gap-1.5 px-2 py-1 text-left group"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-gray-400 transition-transform ${
                      collapsed ? "-rotate-90" : ""
                    }`}
                  />
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">
                    {group.grade_name}
                  </span>
                  <span className="text-[10px] text-gray-400 truncate hidden xl:inline">
                    · {group.program_name}
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-1 pl-1"
                    >
                      {group.rows.map((row) => {
                        const checks = checksFor(row);
                        const passed = checks.filter((c) => c.ok).length;
                        const selected = row.class_group_id === classGroupId;
                        return (
                          <button
                            key={row.class_group_id}
                            type="button"
                            aria-current={selected ? "true" : undefined}
                            onClick={() => {
                              focusClassGroup(row, activeLens);
                              onSelect?.();
                            }}
                            className={`w-full text-left rounded-xl px-2.5 py-2 transition-colors border ${
                              selected
                                ? "bg-blue-500/10 border-blue-500/40"
                                : "bg-white/50 dark:bg-slate-800/40 border-transparent hover:bg-gray-50 dark:hover:bg-slate-700/40"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-sm font-semibold truncate ${
                                  selected
                                    ? "text-blue-700 dark:text-blue-300"
                                    : "text-gray-800 dark:text-gray-100"
                                }`}
                              >
                                {row.class_group_name}
                              </span>
                              <div className="flex-1" />
                              <ReadinessRing
                                value={passed}
                                total={checks.length}
                                size={18}
                              />
                            </div>

                            <div className="flex items-center gap-2.5 mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <Users2 className="w-3 h-3" />
                                {row.student_count}
                              </span>
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <Layers className="w-3 h-3" />
                                {row.taught_subject_count}/
                                {row.curriculum_subject_count}
                              </span>
                              {row.class_teacher ? (
                                <span
                                  className="inline-flex items-center gap-1 truncate"
                                  title={`Class teacher: ${row.class_teacher.first_name ?? ""} ${row.class_teacher.last_name ?? ""}`}
                                >
                                  <UserAvatar decorative userId={row.class_teacher.user_id} name={`${row.class_teacher.first_name ?? ""} ${row.class_teacher.last_name ?? ""}`.trim() || "?"} size={16} />
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"
                                  title="No class teacher"
                                >
                                  <UserCheck className="w-3 h-3" />
                                  none
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ClassGroupNavigator;
