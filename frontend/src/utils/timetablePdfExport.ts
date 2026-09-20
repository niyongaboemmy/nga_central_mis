import jsPDF from "jspdf";
import type { CalendarSlot, CalendarActivity } from "../api/calendar";
import {
  DAYS,
  DAYS_FULL,
  buildScheduleRows,
  displayDayToBackend,
  isTeachingRow,
  type ScheduleRow,
} from "../components/calendar/calendarConstants";
import { buildGridLayout, cellKey } from "../components/calendar/calendarLayout";
import { getSlotColor, hexToRgb, tintColor, readableTextColor } from "../components/calendar/slotColor";

export interface TimetablePdfContext {
  classGroupName: string;
  yearName?: string;
  termName?: string;
}

/** Mirrors CalendarGrid's activityToEntry — maps a recurring activity onto the
 *  same shape a lesson slot has, so it lays out on the same grid. */
type GridEntry = CalendarSlot & { __activity?: boolean };

const activityToEntry = (a: CalendarActivity): GridEntry => ({
  slot_id: -Math.abs(a.activity_id),
  academic_term_id: a.academic_term_id,
  class_group_id: a.class_group_id,
  subject_id: 0,
  user_id: 0,
  day_of_week: Number(a.day_of_week ?? 0),
  start_time: a.start_time,
  end_time: a.end_time,
  location: a.location,
  color: a.color || "#10B981",
  notes: a.description,
  subject_name: a.activity_name,
  class_group_name: a.activity_type,
  __activity: true,
});

const rowWeight = (row: ScheduleRow): number => {
  if (row.type === "course") return 2;
  if (row.type === "lunch") return 1.3;
  return 0.8;
};

export function exportTimetablePdf(
  slots: CalendarSlot[],
  activities: CalendarActivity[],
  ctx: TimetablePdfContext,
) {
  const entries: GridEntry[] = [
    ...slots,
    ...(activities ?? [])
      .filter(
        (a) =>
          a.start_time &&
          a.end_time &&
          a.day_of_week !== null &&
          a.day_of_week !== undefined,
      )
      .map(activityToEntry),
  ];

  const scheduleRows = buildScheduleRows(entries);
  const layout = buildGridLayout<GridEntry>(scheduleRows, DAYS.length, (dayIdx, start) =>
    entries.filter(
      (s) => Number(s.day_of_week) === displayDayToBackend(dayIdx) && s.start_time === start,
    ),
  );

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 8;
  const gridLeft = margin;
  const gridWidth = pageWidth - margin * 2;
  const timeColWidth = 24;
  const dayColWidth = (gridWidth - timeColWidth) / DAYS.length;

  // ── Header block ──────────────────────────────────────────────────────
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(ctx.classGroupName || "Class Timetable", gridLeft, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const subtitleParts = [ctx.yearName, ctx.termName].filter(Boolean);
  doc.text(subtitleParts.join(" • ") || "Weekly Timetable", gridLeft, 18.5);
  doc.setFontSize(8.5);
  doc.text(`Generated ${new Date().toLocaleString()}`, pageWidth - margin, 18.5, {
    align: "right",
  });

  const headerRowHeight = 8;
  const legendHeight = 12;
  const gridTop = 28;
  const availableHeight = pageHeight - gridTop - legendHeight - margin - headerRowHeight;

  const totalWeight = scheduleRows.reduce((sum, r) => sum + rowWeight(r), 0);
  const rowHeights = scheduleRows.map(
    (r) => (rowWeight(r) / totalWeight) * availableHeight,
  );
  const rowY: number[] = [];
  let cursorY = gridTop + headerRowHeight;
  for (let i = 0; i < scheduleRows.length; i++) {
    rowY.push(cursorY);
    cursorY += rowHeights[i];
  }

  // ── Day header row ────────────────────────────────────────────────────
  doc.setFillColor(219, 234, 254);
  doc.rect(gridLeft, gridTop, timeColWidth, headerRowHeight, "F");
  doc.setDrawColor(255, 255, 255);
  doc.setTextColor(29, 78, 216);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Time", gridLeft + timeColWidth / 2, gridTop + headerRowHeight / 2 + 1.2, {
    align: "center",
  });
  DAYS_FULL.forEach((day, idx) => {
    const x = gridLeft + timeColWidth + idx * dayColWidth;
    doc.setFillColor(219, 234, 254);
    doc.rect(x, gridTop, dayColWidth, headerRowHeight, "F");
    doc.setTextColor(29, 78, 216);
    doc.text(day, x + dayColWidth / 2, gridTop + headerRowHeight / 2 + 1.2, {
      align: "center",
    });
  });

  // ── Body rows ─────────────────────────────────────────────────────────
  scheduleRows.forEach((row, rowIdx) => {
    const y = rowY[rowIdx];
    const h = rowHeights[rowIdx];
    const teaching = isTeachingRow(row);

    // Time cell
    doc.setFillColor(teaching ? 249 : 243, teaching ? 250 : 244, teaching ? 251 : 246);
    doc.rect(gridLeft, y, timeColWidth, h, "F");
    doc.setDrawColor(226, 232, 240);
    doc.rect(gridLeft, y, timeColWidth, h, "S");
    doc.setTextColor(55, 65, 81);

    if (teaching) {
      // Course rows are always tall enough for three stacked lines.
      if (row.label) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(37, 99, 235);
        doc.text(row.label, gridLeft + timeColWidth / 2, y + 3.2, { align: "center" });
        doc.setTextColor(55, 65, 81);
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.text(`${row.start}`, gridLeft + timeColWidth / 2, y + h / 2 + (row.label ? 1.5 : 1), {
        align: "center",
      });
      doc.text(`${row.end}`, gridLeft + timeColWidth / 2, y + h - 1.2, { align: "center" });
    } else {
      // Break/lunch/office bands are often too short for stacked lines — one
      // centred "start-end" line avoids it colliding with the band's own label.
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.5);
      doc.text(`${row.start}-${row.end}`, gridLeft + timeColWidth / 2, y + h / 2 + 1, {
        align: "center",
      });
    }

    if (!teaching) {
      // Full-width band (break / lunch / office hours)
      const x = gridLeft + timeColWidth;
      const w = dayColWidth * DAYS.length;
      const isLunch = row.type === "lunch";
      const [r, g, b] = isLunch ? [255, 251, 235] : [243, 244, 246];
      doc.setFillColor(r, g, b);
      doc.rect(x, y, w, h, "F");
      doc.setDrawColor(226, 232, 240);
      doc.rect(x, y, w, h, "S");
      doc.setTextColor(isLunch ? 180 : 107, isLunch ? 120 : 114, isLunch ? 30 : 128);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text(row.label.toUpperCase(), x + w / 2, y + h / 2 + 1, { align: "center" });
      return;
    }

    // Teaching row — one cell per day, unless swallowed by a rowSpan above
    for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
      const key = cellKey(rowIdx, dayIdx);
      const owner = layout.ownerOf.get(key);
      if (owner !== key) continue; // covered by an earlier rowSpan

      const cell = layout.cells.get(key)!;
      const x = gridLeft + timeColWidth + dayIdx * dayColWidth;
      const cellHeight = rowHeights
        .slice(rowIdx, rowIdx + cell.rowSpan)
        .reduce((s, v) => s + v, 0);

      if (cell.slots.length === 0) {
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(255, 255, 255);
        doc.rect(x, y, dayColWidth, cellHeight, "FD");
        continue;
      }

      const slotWidth = dayColWidth / cell.slots.length;
      cell.slots.forEach((course, i) => {
        const cx = x + i * slotWidth;
        const color = getSlotColor(course);
        const bg = tintColor(color, 0.82);
        const [r, g, b] = hexToRgb(bg);
        doc.setFillColor(r, g, b);
        doc.rect(cx + 0.3, y + 0.3, slotWidth - 0.6, cellHeight - 0.6, "F");
        const [ar, ag, ab] = hexToRgb(color);
        doc.setDrawColor(ar, ag, ab);
        doc.setLineWidth(0.5);
        doc.line(cx + 0.3, y + 0.3, cx + 0.3, y + cellHeight - 0.3);
        doc.setLineWidth(0.2);

        const textColor = readableTextColor(bg);
        const [tr, tg, tb] = hexToRgb(textColor);
        const padX = cx + 1.6;
        const maxW = slotWidth - 2.4;

        doc.setTextColor(tr, tg, tb);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.6);
        const nameLines = doc.splitTextToSize(course.subject_name || "Lesson", maxW);
        doc.text(nameLines.slice(0, 2), padX, y + 3.2);

        let ty = y + 3.2 + Math.min(nameLines.length, 2) * 2.6;
        if (course.class_group_name && cellHeight > 8) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(5.8);
          const metaLines = doc.splitTextToSize(course.class_group_name, maxW);
          doc.text(metaLines.slice(0, 1), padX, ty);
          ty += 2.4;
        }
        if (cellHeight > 7) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(5.6);
          doc.text(`${course.start_time}-${course.end_time}`, padX, y + cellHeight - 1.2);
        }
      });
    }
  });

  // Outer border for the whole grid
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.rect(gridLeft, gridTop, gridWidth, cursorY - gridTop, "S");

  // ── Legend ────────────────────────────────────────────────────────────
  const legendY = cursorY + 5;
  const seen = new Map<string, string>();
  for (const e of entries) {
    const name = e.subject_name;
    if (!name || seen.has(name)) continue;
    seen.set(name, getSlotColor(e));
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  let lx = gridLeft;
  let ly = legendY;
  seen.forEach((color, name) => {
    const label = name.length > 22 ? `${name.slice(0, 21)}…` : name;
    const w = doc.getTextWidth(label) + 8;
    if (lx + w > pageWidth - margin) {
      lx = gridLeft;
      ly += 4.5;
    }
    const [r, g, b] = hexToRgb(color);
    doc.setFillColor(r, g, b);
    doc.roundedRect(lx, ly - 2.6, 2.6, 2.6, 0.5, 0.5, "F");
    doc.setTextColor(75, 85, 99);
    doc.text(label, lx + 4, ly);
    lx += w + 3;
  });

  const fileBase = `timetable-${ctx.classGroupName}-${ctx.termName || ""}`
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "")
    .toLowerCase();
  doc.save(`${fileBase || "timetable"}.pdf`);
}
