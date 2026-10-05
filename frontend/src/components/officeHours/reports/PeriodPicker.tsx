import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PeriodKind, ReportQuery } from "../../../api/officeHours";
import { inputCls } from "../ohUi";

/**
 * Day / Week / Month / Term / Year / Custom (plan §14.1) with ← → to step.
 * The server resolves the actual dates (Kigali, Mon–Fri weeks, academic
 * terms and years), so this only moves an anchor date.
 */
const KINDS: Array<[PeriodKind, string]> = [
  ["day", "Day"],
  ["week", "Week"],
  ["month", "Month"],
  ["term", "Term"],
  ["year", "Year"],
  ["custom", "Custom"],
];

const shift = (ymd: string, kind: PeriodKind, dir: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (kind === "day") {
    date.setUTCDate(date.getUTCDate() + dir);
    while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + dir);
  } else if (kind === "week") date.setUTCDate(date.getUTCDate() + 7 * dir);
  else if (kind === "month") date.setUTCMonth(date.getUTCMonth() + dir, 1);
  else if (kind === "term") date.setUTCMonth(date.getUTCMonth() + 4 * dir);
  else if (kind === "year") date.setUTCFullYear(date.getUTCFullYear() + dir);
  return date.toISOString().slice(0, 10);
};

export const PeriodPicker: React.FC<{ value: ReportQuery; onChange: (q: ReportQuery) => void; label?: string }> = ({ value, onChange, label }) => {
  const anchor = value.anchor ?? new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-full bg-slate-100 p-1 dark:bg-gray-800/40" role="radiogroup" aria-label="Report period">
        {KINDS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={value.period === k}
            onClick={() => onChange({ ...value, period: k, from: k === "custom" ? value.from ?? anchor : undefined, to: k === "custom" ? value.to ?? anchor : undefined })}
            className={`rounded-full px-3 py-1 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              value.period === k ? "bg-white text-slate-900 shadow-sm dark:bg-gray-800/30 dark:text-gray-50" : "text-slate-700 hover:text-slate-900 dark:text-gray-300 dark:hover:text-white"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      {value.period === "custom" ? (
        <div className="flex items-center gap-2">
          <input aria-label="From" type="date" className={`${inputCls} w-auto`} value={value.from ?? ""} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <span className="text-slate-600 dark:text-gray-300">–</span>
          <input aria-label="To" type="date" className={`${inputCls} w-auto`} value={value.to ?? ""} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous period" onClick={() => onChange({ ...value, anchor: shift(anchor, value.period, -1) })} className="rounded-full p-1.5 text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-200 dark:hover:bg-gray-800/40">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <span className="min-w-[9rem] text-center text-sm font-semibold text-slate-900 dark:text-gray-100" aria-live="polite">{label ?? anchor}</span>
          <button type="button" aria-label="Next period" onClick={() => onChange({ ...value, anchor: shift(anchor, value.period, 1) })} className="rounded-full p-1.5 text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-200 dark:hover:bg-gray-800/40">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <input aria-label="Jump to date" type="date" className={`${inputCls} w-auto`} value={anchor} onChange={(e) => e.target.value && onChange({ ...value, anchor: e.target.value })} />
        </div>
      )}
    </div>
  );
};

export default PeriodPicker;
