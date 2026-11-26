import React from "react";
import { AlertTriangle, Check } from "lucide-react";
import type { OtherSchoolMatch } from "../../api/users";

const BY_LABEL: Record<string, string> = { email: "same e-mail", username: "same username", name: "same name" };

/**
 * Rows of a bulk upload that are already people of another school. Each one is
 * skipped unless ticked: a person who really works in both schools is added on
 * purpose, never by accident (2026-11-25 wrong-school staff file).
 */
const OtherSchoolReview: React.FC<{
  matches: OtherSchoolMatch[];
  addRows: Set<number>;
  onToggle: (row: number) => void;
}> = ({ matches, addRows, onToggle }) => (
  <section
    aria-label="People already in another school"
    className="rounded-2xl border border-amber-300/70 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/5"
  >
    <header className="flex items-start gap-3 px-4 pt-4 pb-3">
      <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/15">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          {matches.length} {matches.length === 1 ? "person is" : "people are"} already in another school
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Nothing was created yet. They are skipped unless you tick them. Tick only someone who also works or studies here.
        </p>
      </div>
    </header>
    <ul className="max-h-64 overflow-y-auto divide-y divide-amber-200/70 dark:divide-amber-500/15 border-t border-amber-200/70 dark:border-amber-500/15">
      {matches.map((m) => {
        const on = addRows.has(m.row);
        return (
          <li key={m.row}>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-amber-100/50 dark:hover:bg-amber-500/10">
              <input type="checkbox" className="peer sr-only" checked={on} onChange={() => onToggle(m.row)} aria-label={`Add ${m.name} anyway`} />
              <span
                aria-hidden
                className={`flex h-5 w-5 flex-none items-center justify-center rounded-md border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 ${
                  on ? "border-blue-600 bg-blue-600" : "border-gray-300 bg-white dark:border-slate-600 dark:bg-slate-900"
                }`}
              >
                {on && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{m.name}</span>
                <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                  Row {m.row}
                  {m.email ? ` · ${m.email}` : ""}
                </span>
              </span>
              <span className="flex flex-none flex-col items-end gap-0.5 text-right">
                {m.schools.map((s) => (
                  <span key={s.tid} className="text-xs text-gray-700 dark:text-gray-300">
                    <span className="font-medium">{s.school}</span>
                    <span className="text-gray-500 dark:text-gray-400"> · {s.by.map((b) => BY_LABEL[b] ?? b).join(", ")}</span>
                  </span>
                ))}
                <span className={`text-[11px] font-medium ${on ? "text-blue-600 dark:text-blue-400" : "text-amber-700 dark:text-amber-400"}`}>
                  {on ? "Will be added" : "Skipped"}
                </span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  </section>
);

export default OtherSchoolReview;
