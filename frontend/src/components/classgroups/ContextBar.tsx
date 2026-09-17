import React from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Layers,
  GraduationCap,
  Users2,
  RefreshCcw,
  ClipboardCheck,
  ChevronRight,
} from "lucide-react";
import { useClassGroups } from "./ClassGroupsContext";

interface SelectorProps {
  icon: React.ElementType;
  label: string;
  value: number | null;
  options: { value: number; label: string }[];
  onChange: (value: number | null) => void;
  placeholder: string;
  disabled?: boolean;
}

/** A compact native select -- the context bar is a persistent chrome strip,
 * not a form, so it stays lighter than the RichSelect used inside modals. */
const Selector: React.FC<SelectorProps> = ({
  icon: Icon,
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled,
}) => (
  <label className="flex items-center gap-2 min-w-0">
    <span className="sr-only">{label}</span>
    <span className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0">
      <Icon className="w-3.5 h-3.5" />
    </span>
    <select
      aria-label={label}
      disabled={disabled}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className="min-w-0 max-w-[190px] truncate bg-transparent text-sm font-medium text-gray-800 dark:text-gray-100 border-0 border-b border-transparent hover:border-gray-300 dark:hover:border-slate-600 focus:border-blue-500 focus:outline-none focus:ring-0 py-1 pr-6 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);

interface ContextBarProps {
  onOpenChecklist: () => void;
  incompleteCount: number;
}

/**
 * The workspace's single source of scope: year, program, grade and class
 * group. Every lens reads its selection from here, so switching lenses never
 * loses context and no lens ever defaults a year of its own.
 */
const ContextBar: React.FC<ContextBarProps> = ({
  onOpenChecklist,
  incompleteCount,
}) => {
  const {
    academicYears,
    programs,
    gradesForProgram,
    classGroupsForGrade,
    academicYearId,
    programId,
    gradeId,
    classGroupId,
    setAcademicYearId,
    setProgramId,
    setGradeId,
    setClassGroupId,
    referenceLoading,
    overviewLoading,
    invalidate,
  } = useClassGroups();

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="sticky top-0 z-20 mb-4 rounded-2xl bg-white/80 dark:bg-slate-800/70 backdrop-blur-md border border-white/60 dark:border-slate-700/40 px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Selector
          icon={CalendarDays}
          label="Academic year"
          value={academicYearId}
          placeholder="Select year"
          disabled={referenceLoading}
          options={academicYears.map((y) => ({
            value: y.academic_year_id,
            label: y.is_current === 1 ? `${y.name} (current)` : y.name,
          }))}
          onChange={setAcademicYearId}
        />

        <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 hidden sm:block" />

        <Selector
          icon={Layers}
          label="Program"
          value={programId}
          placeholder="All programs"
          disabled={referenceLoading}
          options={programs.map((p) => ({
            value: p.program_id,
            label: p.name,
          }))}
          onChange={setProgramId}
        />

        <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 hidden sm:block" />

        <Selector
          icon={GraduationCap}
          label="Grade"
          value={gradeId}
          placeholder="Select grade"
          disabled={referenceLoading}
          options={gradesForProgram.map((g) => ({
            value: g.grade_id,
            label: g.name,
          }))}
          onChange={setGradeId}
        />

        <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-slate-600 hidden sm:block" />

        <Selector
          icon={Users2}
          label="Class group"
          value={classGroupId}
          placeholder={gradeId ? "Select class" : "Pick a grade first"}
          disabled={referenceLoading || !gradeId}
          options={classGroupsForGrade.map((c) => ({
            value: c.class_group_id,
            label: c.name,
          }))}
          onChange={setClassGroupId}
        />

        <div className="flex-1" />

        <button
          type="button"
          onClick={onOpenChecklist}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
        >
          <ClipboardCheck className="w-3.5 h-3.5" />
          Setup checklist
          {incompleteCount > 0 && (
            <span className="ml-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 tabular-nums">
              {incompleteCount}
            </span>
          )}
        </button>

        <button
          type="button"
          aria-label="Refresh workspace data"
          onClick={() =>
            invalidate([
              "structure",
              "overview",
              "roster",
              "curriculum",
              "assignments",
            ])
          }
          className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        >
          <RefreshCcw
            className={`w-3.5 h-3.5 ${
              overviewLoading || referenceLoading ? "animate-spin" : ""
            }`}
          />
        </button>
      </div>
    </motion.div>
  );
};

export default ContextBar;
