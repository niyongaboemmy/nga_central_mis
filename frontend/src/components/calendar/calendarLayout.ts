import {
  countScheduleSlots,
  isTeachingRow,
  type ScheduleRow,
} from "./calendarConstants";

/**
 * One `<td>` the grid will actually render.
 *
 * A course spanning several rows renders a single cell with a rowSpan; the
 * coordinates it swallows produce no cell of their own.
 */
export interface GridCell<S> {
  rowIndex: number;
  dayIndex: number;
  rowSpan: number;
  /**
   * Every course starting on this row, not just the first.
   *
   * A teacher viewing all of their class groups at once can have two lessons
   * claiming the same day and start time — bad data, or two groups taught
   * together. Keeping only the first made the second silently invisible, so
   * "all class groups" quietly rendered as one. They are all kept here and
   * drawn side by side, which also makes the clash visible instead of hiding it.
   */
  slots: S[];
  /** the row's type: "course" | "break" | "lunch" */
  type: string;
}

export interface GridLayout<S> {
  /** rendered cells, keyed `${rowIndex}-${dayIndex}` */
  cells: Map<string, GridCell<S>>;
  /**
   * Every (row, day) coordinate mapped to the key of the cell that covers it.
   * A coordinate hidden under a rowSpan resolves to the cell above it, which
   * is what keyboard navigation needs in order to land somewhere focusable.
   */
  ownerOf: Map<string, string>;
}

export const cellKey = (rowIndex: number, dayIndex: number): string =>
  `${rowIndex}-${dayIndex}`;

/**
 * Resolve the whole week into cells up front, rather than accumulating
 * occupancy in a mutable Set while JSX renders.
 *
 * Rendering and navigation then read the same structure, so a cell can never
 * be focusable but unrendered (or vice versa), and the layout can be unit
 * tested without mounting a table.
 */
export const buildGridLayout = <S extends { start_time: string; end_time: string }>(
  rows: readonly ScheduleRow[],
  dayCount: number,
  findSlots: (dayIndex: number, startTime: string) => S[],
): GridLayout<S> => {
  const cells = new Map<string, GridCell<S>>();
  const ownerOf = new Map<string, string>();

  for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const key = cellKey(rowIndex, dayIndex);
      if (ownerOf.has(key)) continue; // covered by an earlier rowSpan

      const row = rows[rowIndex];
      const cellSlots = isTeachingRow(row) ? findSlots(dayIndex, row.start) : [];

      // Co-starting lessons of different lengths share one cell, so the cell
      // has to be as tall as the longest of them.
      const rowSpan = cellSlots.reduce(
        (max, s) =>
          Math.max(max, countScheduleSlots(s.start_time, s.end_time, rows, rowIndex)),
        1,
      );

      cells.set(key, {
        rowIndex,
        dayIndex,
        rowSpan,
        slots: cellSlots,
        type: row.type,
      });
      for (let r = 0; r < rowSpan; r++) {
        ownerOf.set(cellKey(rowIndex + r, dayIndex), key);
      }
    }
  }

  return { cells, ownerOf };
};
