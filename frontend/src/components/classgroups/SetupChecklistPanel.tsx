import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  PartyPopper,
  ClipboardCheck,
} from "lucide-react";
import { useClassGroups } from "./ClassGroupsContext";
import { checksFor, failedChecks } from "./readiness";
import ReadinessRing from "./ReadinessRing";
import { EmptyState } from "./shared";

/**
 * The audit that turns five CRUD lenses into a workflow: every way the
 * selected year is still unfinished, grouped by class group, each row a
 * deep link into the lens that fixes it.
 */
const SetupChecklistPanel: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const {
    overview,
    overviewLoading,
    programId,
    programs,
    academicYears,
    academicYearId,
    focusClassGroup,
  } = useClassGroups();

  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [showComplete, setShowComplete] = useState(false);

  // Focus moves into the panel on open and back to the trigger on close, so
  // keyboard users are never dropped at the top of the document.
  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement;
      closeRef.current?.focus();
    } else {
      previouslyFocused.current?.focus?.();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const inScope = useMemo(
    () =>
      overview.filter(
        (row) => programId === null || row.program_id === programId,
      ),
    [overview, programId],
  );

  const incomplete = useMemo(
    () => inScope.filter((row) => failedChecks(row).length > 0),
    [inScope],
  );

  const rows = showComplete ? inScope : incomplete;

  const yearName =
    academicYears.find((y) => y.academic_year_id === academicYearId)?.name ??
    "the selected year";
  const programName =
    programs.find((p) => p.program_id === programId)?.name ?? "all programs";

  const ready = inScope.length - incomplete.length;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90]"
          role="dialog"
          aria-modal="true"
          aria-label="Setup checklist"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.aside
            initial={{ x: 420 }}
            animate={{ x: 0 }}
            exit={{ x: 420 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="absolute inset-y-0 right-0 w-[420px] max-w-[92vw] bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-slate-700/60 flex flex-col"
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-100 dark:border-slate-700/50">
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0">
                  <ClipboardCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">
                    Setup checklist
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {yearName} · {programName}
                  </p>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  aria-label="Close setup checklist"
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 mt-3">
                <ReadinessRing
                  value={ready}
                  total={inScope.length}
                  size={26}
                  label={`${ready}/${inScope.length} classes ready`}
                />
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setShowComplete((v) => !v)}
                  aria-pressed={showComplete}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    showComplete
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300"
                  }`}
                >
                  Show complete
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {overviewLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-24 rounded-2xl bg-gray-100 dark:bg-slate-800/60 animate-pulse"
                    />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <EmptyState
                  icon={PartyPopper}
                  title="Everything is set up"
                  hint={`Every class group in ${programName} is ready for ${yearName}.`}
                />
              ) : (
                rows.map((row) => {
                  const checks = checksFor(row);
                  const passed = checks.filter((c) => c.ok).length;
                  return (
                    <div
                      key={row.class_group_id}
                      className="rounded-2xl border border-gray-100 dark:border-slate-700/50 overflow-hidden"
                    >
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-slate-800/60">
                        <span className="text-sm font-bold text-gray-800 dark:text-white truncate">
                          {row.grade_name} · {row.class_group_name}
                        </span>
                        <div className="flex-1" />
                        <ReadinessRing
                          value={passed}
                          total={checks.length}
                          size={18}
                        />
                      </div>

                      <ul className="divide-y divide-gray-100 dark:divide-slate-700/40">
                        {checks.map((check) => (
                          <li key={check.key}>
                            <button
                              type="button"
                              onClick={() => {
                                focusClassGroup(row, check.lens);
                                onClose();
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors group"
                            >
                              {check.ok ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                              ) : (
                                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`text-xs font-medium truncate ${
                                    check.ok
                                      ? "text-gray-500 dark:text-gray-400"
                                      : "text-gray-800 dark:text-gray-100"
                                  }`}
                                >
                                  {check.label}
                                </p>
                                <p className="text-[11px] text-gray-400 truncate">
                                  {check.detail}
                                </p>
                              </div>
                              <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500 shrink-0" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default SetupChecklistPanel;
