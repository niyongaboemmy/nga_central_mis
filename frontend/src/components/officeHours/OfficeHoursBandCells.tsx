import React from "react";
import { Plus, Users } from "lucide-react";
import type { BandEntry } from "../../api/officeHours";

/**
 * The 16:20 office-hours band of a weekly timetable (plan §8).
 *
 * With nothing for the viewer it renders exactly the band the grids always
 * drew: one labelled cell across the week. Once the viewer has office hours
 * (a teacher hosting, a student attending, or a class-group summary) it draws
 * one cell per weekday so each day shows its own entries. Lessons are never
 * placed in this row; calendarLayout still skips it.
 */
export interface OfficeHoursBandCellsProps {
  label: string;
  entries?: BandEntry[];
  /** Number of day columns the grid draws (Mon-Fri = 5). */
  dayCount: number;
  dense?: boolean;
  todayIndex?: number;
  onEntryClick?: (entry: BandEntry) => void;
  /** Teachers: offer "+ Office hours" on a free weekday (display index 0 = Monday). */
  onAdd?: (backendDay: number) => void;
}

const bandClass = "bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400/70";

const entryText = (e: BandEntry) => {
  if (e.role === "summary") return { main: e.title, sub: e.teacher_name };
  if (e.role === "hosting") {
    return { main: e.title, sub: [`${e.count} student${e.count === 1 ? "" : "s"}`, e.location].filter(Boolean).join(" · ") };
  }
  return { main: e.title, sub: [e.teacher_name, e.location].filter(Boolean).join(" · ") };
};

const OfficeHoursBandCells: React.FC<OfficeHoursBandCellsProps> = ({ label, entries, dayCount, dense, todayIndex = -1, onEntryClick, onAdd }) => {
  const text = dense ? "text-[10px]" : "text-[11px]";
  if ((!entries || entries.length === 0) && !onAdd) {
    return (
      <td colSpan={dayCount} className={`border-l border-gray-100 dark:border-gray-700/20 text-center ${text} font-bold uppercase tracking-wider ${bandClass}`}>
        {label}
      </td>
    );
  }
  return (
    <>
      {Array.from({ length: dayCount }, (_, idx) => {
        const backendDay = idx + 1;
        const mine = (entries ?? []).filter((e) => e.day_of_week === backendDay);
        return (
          <td
            key={idx}
            data-testid={`office-band-day-${backendDay}`}
            className={`border-l border-gray-100 p-1 align-top dark:border-gray-700/20 ${bandClass} ${idx === todayIndex ? "ring-1 ring-inset ring-rose-300/60" : ""}`}
          >
            {mine.length === 0 ? (
              onAdd ? (
                <button
                  type="button"
                  onClick={() => onAdd(backendDay)}
                  className={`flex w-full items-center justify-center gap-1 rounded-lg px-1 py-1 ${text} font-semibold text-slate-500 opacity-70 transition hover:bg-white hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:bg-slate-700`}
                  aria-label={`Add office hours on ${["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][backendDay]}`}
                >
                  <Plus className="h-3 w-3" aria-hidden /> {dense ? "" : "Office hours"}
                </button>
              ) : (
                <span className={`block text-center ${text} font-bold uppercase tracking-wider opacity-60`}>{label}</span>
              )
            ) : (
              <div className="space-y-1">
                {mine.map((e, i) => {
                  const t = entryText(e);
                  const style = e.color ? { borderLeftColor: e.color } : undefined;
                  const body = (
                    <>
                      <span className={`block truncate ${text} font-semibold text-slate-800 dark:text-slate-100`}>
                        {e.role === "summary" && <Users className="mr-1 inline h-3 w-3" aria-hidden />}
                        {t.main}
                      </span>
                      {t.sub && !dense && <span className="block truncate text-[10px] text-slate-600 dark:text-slate-300">{t.sub}</span>}
                    </>
                  );
                  const cls = `block w-full rounded-lg border-l-4 border-blue-400 bg-white px-2 py-1 text-left shadow-sm dark:bg-slate-800`;
                  return onEntryClick ? (
                    <button
                      key={`${e.schedule_id ?? "s"}-${i}`}
                      type="button"
                      onClick={() => onEntryClick(e)}
                      className={`${cls} transition hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
                      style={style}
                      title={[t.main, t.sub].filter(Boolean).join(" — ")}
                    >
                      {body}
                    </button>
                  ) : (
                    <div key={`${e.schedule_id ?? "s"}-${i}`} className={cls} style={style} title={[t.main, t.sub].filter(Boolean).join(" — ")}>
                      {body}
                    </div>
                  );
                })}
              </div>
            )}
          </td>
        );
      })}
    </>
  );
};

export default OfficeHoursBandCells;
