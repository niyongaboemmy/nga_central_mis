import { countScheduleSlots, type ScheduleRow } from "./calendarConstants";

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
  /** the course starting on this row, if any */
  slot: S | null;
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
  findSlot: (dayIndex: number, startTime: string) => S | undefined,
): GridLayout<S> => {
  const cells = new Map<string, GridCell<S>>();
  const ownerOf = new Map<string, string>();

  for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const key = cellKey(rowIndex, dayIndex);
      if (ownerOf.has(key)) continue; // covered by an earlier rowSpan

      const row = rows[rowIndex];
      const isBreakOrLunch = row.type === "break" || row.type === "lunch";
      const slot = isBreakOrLunch
        ? undefined
        : findSlot(dayIndex, row.start);

      const rowSpan = slot
        ? countScheduleSlots(slot.start_time, slot.end_time, rows, rowIndex)
        : 1;

      cells.set(key, {
        rowIndex,
        dayIndex,
        rowSpan,
        slot: slot ?? null,
        type: row.type,
      });
      for (let r = 0; r < rowSpan; r++) {
        ownerOf.set(cellKey(rowIndex + r, dayIndex), key);
      }
    }
  }

  return { cells, ownerOf };
};
