import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
} from "docx";
import { LessonPlan } from "../api/lessonPlan";

const ACCENT: [number, number, number] = [37, 99, 235]; // blue-600
const TAN: [number, number, number] = [219, 196, 162]; // matches SchemeReportService branding
const BLACK: [number, number, number] = [0, 0, 0];
const GRAY: [number, number, number] = [110, 110, 110];

const ACCENT_HEX = "2563EB";
const TAN_HEX = "DBC4A2";
const LIGHT_HEX = "F3F4F6";

const getTotalDuration = (plan: LessonPlan): number => {
  if (plan.total_duration_minutes) return plan.total_duration_minutes;
  const outcomesDuration =
    plan.outcomes?.reduce((sum, o) => sum + (o.duration_minutes || 0), 0) || 0;
  const sectionsDuration =
    plan.sections?.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) || 0;
  return outcomesDuration + sectionsDuration;
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return "Not specified";
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

const fileBaseName = (plan: LessonPlan) =>
  `LessonPlan_${(plan.module_name || plan.session_code || "Untitled").replace(/\s+/g, "_")}_Week${plan.week || ""}`;

// ─────────────────────────────────────────────────────────────────────────
// PDF
// ─────────────────────────────────────────────────────────────────────────

const buildPDF = (plan: LessonPlan): jsPDF => {
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

  let y = 0;

  // ── Header band ──────────────────────────────────────────────────────
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, pageWidth, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(
    `LESSON PLAN  •  WEEK ${plan.week || "N/A"}  •  ${getTotalDuration(plan)} MINS`,
    margin,
    12,
  );
  doc.setFontSize(18);
  doc.text(plan.module_name || plan.session_code || "Lesson Plan", margin, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(formatDate(plan.lesson_date), margin, 28);

  y = 40;

  // ── Overview grid ────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    body: [
      [
        { content: "Instructor", styles: { fontStyle: "bold" as const } },
        plan.instructor_name || "Not specified",
        { content: "Class", styles: { fontStyle: "bold" as const } },
        `${plan.class_name || "N/A"} (${plan.number_of_trainees || 0} trainees)`,
      ],
      [
        { content: "Session Code", styles: { fontStyle: "bold" as const } },
        plan.session_code || "N/A",
        { content: "Time", styles: { fontStyle: "bold" as const } },
        plan.start_time && plan.end_time
          ? `${plan.start_time} - ${plan.end_time}`
          : "Not specified",
      ],
      [
        { content: "Sector / Trade", styles: { fontStyle: "bold" as const } },
        [plan.sector, plan.trade].filter(Boolean).join(" / ") || "N/A",
        { content: "Level / Module", styles: { fontStyle: "bold" as const } },
        [plan.level, plan.module_code].filter(Boolean).join(" / ") || "N/A",
      ],
      [
        { content: "Term", styles: { fontStyle: "bold" as const } },
        plan.term || "N/A",
        { content: "School Year", styles: { fontStyle: "bold" as const } },
        plan.school_year || "N/A",
      ],
    ],
    theme: "plain",
    styles: {
      fontSize: 9,
      cellPadding: 2,
      textColor: BLACK as any,
      lineColor: TAN as any,
      lineWidth: 0.15,
    },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 62 },
      2: { cellWidth: 32 },
      3: { cellWidth: "auto" as const },
    },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // ── Big Question ─────────────────────────────────────────────────────
  if (plan.big_question) {
    doc.setFillColor(240, 245, 255);
    const lines = doc.splitTextToSize(
      `"${plan.big_question}"`,
      pageWidth - margin * 2 - 10,
    );
    const boxHeight = 12 + lines.length * 5;
    doc.rect(margin, y, pageWidth - margin * 2, boxHeight, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...ACCENT);
    doc.text("BIG QUESTION / GOAL", margin + 5, y + 6);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10.5);
    doc.setTextColor(30, 41, 59);
    doc.text(lines, margin + 5, y + 12);
    y += boxHeight + 8;
  }

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 20) {
      doc.addPage();
      y = 20;
    }
  };

  const sectionTitle = (title: string) => {
    ensureSpace(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BLACK);
    doc.text(title.toUpperCase(), margin, y);
    doc.setDrawColor(...TAN);
    doc.setLineWidth(0.6);
    doc.line(margin, y + 1.5, pageWidth - margin, y + 1.5);
    y += 7;
  };

  // ── Learning Outcomes ────────────────────────────────────────────────
  if (plan.outcomes && plan.outcomes.length > 0) {
    sectionTitle("Learning Outcomes");
    autoTable(doc, {
      startY: y,
      head: [["#", "Outcome", "Duration", "Resources"]],
      body: plan.outcomes.map((o, i) => [
        `${i + 1}\n(${o.code || ""})`,
        `${o.title}\n${o.description || ""}`,
        o.duration_minutes ? `${o.duration_minutes} min` : "",
        (o.resources || []).map((r) => r.resource_name).join(", "),
      ]),
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: [180, 180, 180] as any, lineWidth: 0.1 },
      headStyles: { fillColor: TAN as any, textColor: BLACK as any, fontStyle: "bold" as const },
      columnStyles: { 0: { cellWidth: 18 }, 2: { cellWidth: 22 }, 3: { cellWidth: 45 } },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    const activityRows: any[] = [];
    plan.outcomes.forEach((o) => {
      (o.activities || []).forEach((a) => {
        activityRows.push([o.code || "", a.trainer_activities || "", a.learner_activities || ""]);
      });
    });
    if (activityRows.length > 0) {
      ensureSpace(20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...GRAY);
      doc.text("Outcome Activities (Trainer / Learner)", margin, y);
      y += 3;
      autoTable(doc, {
        startY: y,
        head: [["LO", "Trainer Activities", "Learner Activities"]],
        body: activityRows,
        theme: "grid",
        styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: [180, 180, 180] as any, lineWidth: 0.1 },
        headStyles: { fillColor: [235, 235, 235] as any, textColor: BLACK as any, fontStyle: "bold" as const },
        columnStyles: { 0: { cellWidth: 15 } },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  // ── Lesson Flow ───────────────────────────────────────────────────────
  if (plan.sections && plan.sections.length > 0) {
    sectionTitle("Lesson Flow");
    autoTable(doc, {
      startY: y,
      head: [["Section", "Duration", "Trainer Activities", "Learner Activities", "Resources"]],
      body: plan.sections.map((s) => [
        s.section_type,
        s.duration_minutes ? `${s.duration_minutes} min` : "",
        s.trainer_activities || "",
        s.learner_activities || "",
        s.resources || "",
      ]),
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: [180, 180, 180] as any, lineWidth: 0.1 },
      headStyles: { fillColor: TAN as any, textColor: BLACK as any, fontStyle: "bold" as const },
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 18 } },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Indicative Content ───────────────────────────────────────────────
  if (plan.indicativeContent && plan.indicativeContent.length > 0) {
    sectionTitle("Indicative Content");
    autoTable(doc, {
      startY: y,
      head: [["Category", "Content"]],
      body: plan.indicativeContent.map((ic) => [ic.category || "", ic.content || ""]),
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: [180, 180, 180] as any, lineWidth: 0.1 },
      headStyles: { fillColor: TAN as any, textColor: BLACK as any, fontStyle: "bold" as const },
      columnStyles: { 0: { cellWidth: 40 } },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Assignments ───────────────────────────────────────────────────────
  if (plan.assignments && plan.assignments.length > 0) {
    sectionTitle("Assignments / Homework");
    ensureSpace(10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...BLACK);
    plan.assignments.forEach((a, i) => {
      const lines = doc.splitTextToSize(`${i + 1}. ${a.description}`, pageWidth - margin * 2);
      ensureSpace(lines.length * 5 + 2);
      doc.text(lines, margin, y);
      y += lines.length * 5 + 2;
    });
    y += 4;
  }

  // ── Evaluation ────────────────────────────────────────────────────────
  if (plan.evaluation) {
    sectionTitle("Evaluation");
    ensureSpace(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text("Teacher Notes", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...BLACK);
    const notesLines = doc.splitTextToSize(
      plan.evaluation.teacher_notes || "Not specified",
      pageWidth - margin * 2,
    );
    ensureSpace(notesLines.length * 5);
    doc.text(notesLines, margin, y);
    y += notesLines.length * 5 + 5;

    if (plan.evaluation.references) {
      ensureSpace(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...GRAY);
      doc.text("References", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...BLACK);
      const refLines = doc.splitTextToSize(plan.evaluation.references, pageWidth - margin * 2);
      doc.text(refLines, margin, y);
      y += refLines.length * 5 + 5;
    }

    ensureSpace(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    doc.text(`Prepared by: ${plan.evaluation.prepared_by || plan.instructor_name || "N/A"}`, margin, y);
    doc.text(`Verified by: ${plan.evaluation.verified_by || "N/A"}`, pageWidth - margin, y, { align: "right" });
    y += 8;
  }

  // ── Footer page numbers ──────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: "right" });
    doc.text("NGA Central MIS — Lesson Plan", margin, pageHeight - 8);
  }

  return doc;
};

const downloadPDF = (plan: LessonPlan) => {
  const doc = buildPDF(plan);
  doc.save(`${fileBaseName(plan)}.pdf`);
};

// ─────────────────────────────────────────────────────────────────────────
// DOCX
// ─────────────────────────────────────────────────────────────────────────

const heading = (text: string) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: TAN_HEX } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, color: "111827" })],
  });

const cell = (text: string, opts: { bold?: boolean; shade?: string; width?: number } = {}) =>
  new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shade
      ? { type: ShadingType.CLEAR, color: "auto", fill: opts.shade }
      : undefined,
    children: [
      new Paragraph({
        children: [new TextRun({ text: text || "", bold: !!opts.bold })],
      }),
    ],
  });

const infoRow = (label: string, value: string, label2: string, value2: string) =>
  new TableRow({
    children: [
      cell(label, { bold: true, shade: LIGHT_HEX, width: 20 }),
      cell(value, { width: 30 }),
      cell(label2, { bold: true, shade: LIGHT_HEX, width: 20 }),
      cell(value2, { width: 30 }),
    ],
  });

const buildDocx = async (plan: LessonPlan): Promise<Blob> => {
  const children: any[] = [];

  children.push(
    new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: `LESSON PLAN • WEEK ${plan.week || "N/A"} • ${getTotalDuration(plan)} MINS`,
          bold: true,
          color: ACCENT_HEX,
          size: 18,
        }),
      ],
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: plan.module_name || plan.session_code || "Lesson Plan",
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 250 },
      children: [new TextRun({ text: formatDate(plan.lesson_date), italics: true, color: "6B7280" })],
    }),
  );

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        infoRow(
          "Instructor",
          plan.instructor_name || "Not specified",
          "Class",
          `${plan.class_name || "N/A"} (${plan.number_of_trainees || 0} trainees)`,
        ),
        infoRow(
          "Session Code",
          plan.session_code || "N/A",
          "Time",
          plan.start_time && plan.end_time ? `${plan.start_time} - ${plan.end_time}` : "Not specified",
        ),
        infoRow(
          "Sector / Trade",
          [plan.sector, plan.trade].filter(Boolean).join(" / ") || "N/A",
          "Level / Module",
          [plan.level, plan.module_code].filter(Boolean).join(" / ") || "N/A",
        ),
        infoRow("Term", plan.term || "N/A", "School Year", plan.school_year || "N/A"),
      ],
    }),
  );

  if (plan.big_question) {
    children.push(
      new Paragraph({ spacing: { before: 300 }, children: [new TextRun({ text: "BIG QUESTION / GOAL", bold: true, color: ACCENT_HEX, size: 18 })] }),
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: `"${plan.big_question}"`, italics: true })],
      }),
    );
  }

  if (plan.outcomes && plan.outcomes.length > 0) {
    children.push(heading("Learning Outcomes"));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              cell("#", { bold: true, shade: TAN_HEX, width: 8 }),
              cell("Outcome", { bold: true, shade: TAN_HEX, width: 52 }),
              cell("Duration", { bold: true, shade: TAN_HEX, width: 15 }),
              cell("Resources", { bold: true, shade: TAN_HEX, width: 25 }),
            ],
          }),
          ...plan.outcomes.map(
            (o, i) =>
              new TableRow({
                children: [
                  cell(`${i + 1} (${o.code || ""})`),
                  cell(`${o.title}\n${o.description || ""}`),
                  cell(o.duration_minutes ? `${o.duration_minutes} min` : ""),
                  cell((o.resources || []).map((r) => r.resource_name).join(", ")),
                ],
              }),
          ),
        ],
      }),
    );

    const activityRows: TableRow[] = [];
    plan.outcomes.forEach((o) => {
      (o.activities || []).forEach((a) => {
        activityRows.push(
          new TableRow({
            children: [
              cell(o.code || ""),
              cell(a.trainer_activities || ""),
              cell(a.learner_activities || ""),
            ],
          }),
        );
      });
    });
    if (activityRows.length > 0) {
      children.push(
        new Paragraph({ spacing: { before: 200, after: 100 }, children: [new TextRun({ text: "Outcome Activities (Trainer / Learner)", bold: true, size: 18 })] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                cell("LO", { bold: true, shade: LIGHT_HEX, width: 10 }),
                cell("Trainer Activities", { bold: true, shade: LIGHT_HEX, width: 45 }),
                cell("Learner Activities", { bold: true, shade: LIGHT_HEX, width: 45 }),
              ],
            }),
            ...activityRows,
          ],
        }),
      );
    }
  }

  if (plan.sections && plan.sections.length > 0) {
    children.push(heading("Lesson Flow"));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              cell("Section", { bold: true, shade: TAN_HEX, width: 15 }),
              cell("Duration", { bold: true, shade: TAN_HEX, width: 10 }),
              cell("Trainer Activities", { bold: true, shade: TAN_HEX, width: 25 }),
              cell("Learner Activities", { bold: true, shade: TAN_HEX, width: 25 }),
              cell("Resources", { bold: true, shade: TAN_HEX, width: 25 }),
            ],
          }),
          ...plan.sections.map(
            (s) =>
              new TableRow({
                children: [
                  cell(s.section_type),
                  cell(s.duration_minutes ? `${s.duration_minutes} min` : ""),
                  cell(s.trainer_activities || ""),
                  cell(s.learner_activities || ""),
                  cell(s.resources || ""),
                ],
              }),
          ),
        ],
      }),
    );
  }

  if (plan.indicativeContent && plan.indicativeContent.length > 0) {
    children.push(heading("Indicative Content"));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              cell("Category", { bold: true, shade: TAN_HEX, width: 30 }),
              cell("Content", { bold: true, shade: TAN_HEX, width: 70 }),
            ],
          }),
          ...plan.indicativeContent.map(
            (ic) =>
              new TableRow({
                children: [cell(ic.category || ""), cell(ic.content || "")],
              }),
          ),
        ],
      }),
    );
  }

  if (plan.assignments && plan.assignments.length > 0) {
    children.push(heading("Assignments / Homework"));
    plan.assignments.forEach((a, i) => {
      children.push(
        new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: `${i + 1}. ${a.description}` })] }),
      );
    });
  }

  if (plan.evaluation) {
    children.push(heading("Evaluation"));
    children.push(
      new Paragraph({ children: [new TextRun({ text: "Teacher Notes", bold: true, color: "6B7280" })] }),
      new Paragraph({
        spacing: { after: 150 },
        children: [new TextRun({ text: plan.evaluation.teacher_notes || "Not specified" })],
      }),
    );
    if (plan.evaluation.references) {
      children.push(
        new Paragraph({ children: [new TextRun({ text: "References", bold: true, color: "6B7280" })] }),
        new Paragraph({ spacing: { after: 150 }, children: [new TextRun({ text: plan.evaluation.references })] }),
      );
    }
    children.push(
      new Paragraph({
        spacing: { before: 150 },
        children: [
          new TextRun({ text: `Prepared by: ${plan.evaluation.prepared_by || plan.instructor_name || "N/A"}`, bold: true }),
          new TextRun({ text: `      Verified by: ${plan.evaluation.verified_by || "N/A"}`, bold: true }),
        ],
      }),
    );
  }

  const document = new Document({
    sections: [{ properties: {}, children }],
  });

  return Packer.toBlob(document);
};

const downloadDocx = async (plan: LessonPlan) => {
  const blob = await buildDocx(plan);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileBaseName(plan)}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const LessonPlanDocumentService = {
  downloadPDF,
  downloadDocx,
};
