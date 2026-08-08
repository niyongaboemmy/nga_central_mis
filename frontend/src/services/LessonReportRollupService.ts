import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { LessonReportsRollup } from "../api/reports";

// Client-side PDF generation for the Subject × Class Group × Date Range
// rollup export (Phase 3). Reuses the jsPDF/jspdf-autotable pattern already
// proven in SchemeReportService.ts — the only working document-generation
// pipeline in this repo — rather than introducing a new server-side
// dependency (docxtemplater, puppeteer, etc.) for a first version.

export interface RollupReportMetadata {
  schoolName: string;
  academicTermName: string;
  generatedBy: string;
}

const STATUS_LABEL: Record<string, string> = {
  DELIVERED: "Delivered",
  PARTIAL: "Partial",
  MISSED: "Missed",
  UNPLANNED: "Unscheduled",
};

export const LessonReportRollupService = {
  buildReport: (rollup: LessonReportsRollup, metadata: RollupReportMetadata) => {
    const doc = new jsPDF("p", "mm", "a4");
    const docWidth = doc.internal.pageSize.getWidth();
    const BLACK: [number, number, number] = [0, 0, 0];
    const GRAY: [number, number, number] = [100, 100, 100];
    const ACCENT: [number, number, number] = [219, 196, 162];

    let isFirstPage = true;

    for (const subject of rollup.subjects) {
      for (const classGroup of subject.class_groups) {
        if (!isFirstPage) doc.addPage();
        isFirstPage = false;

        // ── Header ────────────────────────────────────────────────────────
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(...BLACK);
        doc.text(
          `${subject.subject_code ? `[${subject.subject_code}] ` : ""}${subject.subject_name}`,
          15,
          18,
        );

        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(...GRAY);
        doc.text(classGroup.class_group_name, 15, 25);

        doc.setFontSize(9);
        doc.text(
          `${metadata.academicTermName} · ${rollup.period.start_date} to ${rollup.period.end_date} · ${metadata.schoolName}`,
          15,
          31,
        );

        doc.setDrawColor(...ACCENT);
        doc.setLineWidth(0.5);
        doc.line(15, 34, docWidth - 15, 34);

        // ── Body rows: one per week, weeks separated by a header row ───────
        const body: any[] = [];
        for (const week of classGroup.weeks) {
          body.push([
            { content: `Week ${week.week_number}`, colSpan: 6, styles: { fillColor: ACCENT, fontStyle: "bold", textColor: BLACK } },
          ]);
          for (const entry of week.entries) {
            body.push([
              entry.delivery_date,
              entry.instructor_name,
              entry.topic ?? "—",
              STATUS_LABEL[entry.status] ?? entry.status,
              entry.completion_rate != null ? `${entry.completion_rate}%` : "—",
              entry.reflection_notes ?? "—",
            ]);
          }
        }

        autoTable(doc, {
          startY: 38,
          head: [["Date", "Instructor", "Topic / Activity", "Status", "Completion", "Reflection"]],
          body,
          theme: "grid",
          styles: { fontSize: 8, cellPadding: 2, textColor: BLACK as any },
          headStyles: { fillColor: BLACK as any, textColor: [255, 255, 255] as any },
          columnStyles: {
            0: { cellWidth: 22 },
            1: { cellWidth: 30 },
            2: { cellWidth: 45 },
            3: { cellWidth: 22 },
            4: { cellWidth: 20 },
            5: { cellWidth: "auto" as "auto" },
          },
          margin: { left: 15, right: 15 },
        });

        if (classGroup.weeks.length === 0) {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(10);
          doc.setTextColor(...GRAY);
          doc.text("No lesson reports in this range.", 15, 45);
        }
      }
    }

    if (rollup.subjects.length === 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("No lesson reports found for this selection.", 15, 20);
    }

    return doc;
  },

  generate: (rollup: LessonReportsRollup, metadata: RollupReportMetadata) => {
    const doc = LessonReportRollupService.buildReport(rollup, metadata);
    doc.save(`Lesson_Reports_Rollup_${rollup.period.start_date}_to_${rollup.period.end_date}.pdf`);
  },

  generateBlobUrl: (rollup: LessonReportsRollup, metadata: RollupReportMetadata): string => {
    const doc = LessonReportRollupService.buildReport(rollup, metadata);
    return doc.output("bloburl").toString();
  },

  // Client-side CSV fallback (Phase 4, optional per the implementation plan)
  // — flattens the same rollup JSON the PDF renderer consumes, one row per
  // lesson report entry, no new backend endpoint required.
  generateCsv: (rollup: LessonReportsRollup) => {
    const escape = (value: string) => {
      if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
      return value;
    };

    const header = [
      "Subject",
      "Class Group",
      "Week",
      "Date",
      "Instructor",
      "Topic / Activity",
      "Status",
      "Completion",
      "Reflection",
    ];

    const rows: string[][] = [];
    for (const subject of rollup.subjects) {
      const subjectLabel = subject.subject_code
        ? `[${subject.subject_code}] ${subject.subject_name}`
        : subject.subject_name;
      for (const classGroup of subject.class_groups) {
        for (const week of classGroup.weeks) {
          for (const entry of week.entries) {
            rows.push([
              subjectLabel,
              classGroup.class_group_name,
              `Week ${week.week_number}`,
              entry.delivery_date,
              entry.instructor_name,
              entry.topic ?? "",
              STATUS_LABEL[entry.status] ?? entry.status,
              entry.completion_rate != null ? `${entry.completion_rate}%` : "",
              entry.reflection_notes ?? "",
            ]);
          }
        }
      }
    }

    const csv = [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Lesson_Reports_Rollup_${rollup.period.start_date}_to_${rollup.period.end_date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
