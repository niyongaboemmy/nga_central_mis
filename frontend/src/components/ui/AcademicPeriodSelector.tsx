import React from "react";
import { CalendarDays, AlertTriangle } from "lucide-react";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";

interface AcademicPeriodSelectorProps {
  compact?: boolean;
}

const AcademicPeriodSelector: React.FC<AcademicPeriodSelectorProps> = ({
  compact = false,
}) => {
  const {
    years,
    terms,
    selectedYearId,
    selectedTermId,
    setSelectedYearId,
    setSelectedTermId,
    loading,
  } = useAcademicPeriod();

  if (loading) return null;

  const noYears = years.length === 0;

  // No academic year exists at all — nothing to pick from, so surface that clearly instead of
  // silently rendering nothing (the previous behavior left users with zero indication of why
  // year/term-scoped data wasn't loading).
  if (noYears) {
    return (
      <div
        className={`flex items-center gap-1.5 rounded-full bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-800/50 px-2.5 py-1 ${
          compact ? "w-full justify-center" : ""
        }`}
        title="No academic year has been configured yet"
      >
        <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
        <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300 truncate">
          No academic year configured
        </span>
      </div>
    );
  }

  const noTermsForYear = selectedYearId != null && terms.length === 0;
  const yearMissing = selectedYearId == null;
  const termMissing = selectedTermId == null;

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full bg-surface-light dark:bg-surface-dark/50 border border-border-light/50 dark:border-gray-700/40 pl-2.5 pr-1 py-1 ${
        compact ? "w-full justify-between" : ""
      } ${yearMissing || termMissing || noTermsForYear ? "ring-1 ring-yellow-400 dark:ring-yellow-700" : ""}`}
      title="Selected academic year and term"
    >
      {yearMissing || termMissing || noTermsForYear ? (
        <AlertTriangle className="w-4 h-4 text-yellow-500 dark:text-yellow-400 shrink-0" />
      ) : (
        <CalendarDays className="w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark/70 shrink-0" />
      )}
      <select
        aria-label="Academic Year"
        value={selectedYearId ?? ""}
        onChange={(e) => setSelectedYearId(Number(e.target.value))}
        disabled={loading}
        className="bg-transparent text-sm font-medium text-text-primary-light dark:text-text-primary-dark focus:outline-none disabled:opacity-50 max-w-[7rem] cursor-pointer"
      >
        {yearMissing && <option value="">Select year</option>}
        {years.map((y) => (
          <option key={y.academic_year_id} value={y.academic_year_id}>
            {y.name}
          </option>
        ))}
      </select>
      <span className="text-text-secondary-light dark:text-text-secondary-dark/70" aria-hidden="true">
        /
      </span>
      {noTermsForYear ? (
        <span className="text-sm font-medium text-yellow-600 dark:text-yellow-400 px-1 whitespace-nowrap">
          No term available
        </span>
      ) : (
        <select
          aria-label="Academic Term"
          value={selectedTermId ?? ""}
          onChange={(e) => setSelectedTermId(Number(e.target.value))}
          disabled={loading || terms.length === 0}
          className="bg-transparent text-sm font-medium text-text-primary-light dark:text-text-primary-dark focus:outline-none disabled:opacity-50 max-w-[7rem] cursor-pointer"
        >
          {termMissing && <option value="">Select term</option>}
          {terms.map((t) => (
            <option key={t.academic_term_id} value={t.academic_term_id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
};

export default AcademicPeriodSelector;
