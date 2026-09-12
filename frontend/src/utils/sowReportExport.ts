import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { TeacherWithSchemes } from "../api/schemeOfWork";

export interface SowReportContext {
  programName: string;
  gradeName: string;
  roleLabel: string;
  yearName: string;
  termName: string;
}

const validationLabel = (status: string | null) => {
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Rejected";
  return "Not Validated";
};

const computeStats = (teachers: TeacherWithSchemes[]) => {
  const totalTeachers = teachers.length;
  const totalSchemes = teachers.reduce((sum, t) => sum + t.total_subjects, 0);
  const submittedSchemes = teachers.reduce(
    (sum, t) => sum + t.submitted_count,
    0,
  );
  let validatedCount = 0;
  teachers.forEach((t) =>
    t.schemes.forEach((s) => {
      if (s.validation_status === "APPROVED" || s.validation_status === "REJECTED")
        validatedCount++;
    }),
  );
  const submissionRate =
    totalSchemes > 0 ? Math.round((submittedSchemes / totalSchemes) * 100) : 0;
  const validationRate =
    submittedSchemes > 0
      ? Math.round((validatedCount / submittedSchemes) * 100)
      : 0;
  const fullySubmitted = teachers.filter(
    (t) => t.overall_status === "submitted",
  ).length;
  const notValidated = totalSchemes - validatedCount;

  return {
    totalTeachers,
    totalSchemes,
    submittedSchemes,
    validatedCount,
    notValidated,
    submissionRate,
    validationRate,
    fullySubmitted,
  };
};

const buildDetailRows = (teachers: TeacherWithSchemes[]) =>
  teachers.flatMap((t) =>
    t.schemes.map((s) => [
      t.full_name,
      t.username,
      s.subject_name + (s.subject_code ? ` (${s.subject_code})` : ""),
      s.class_group_name,
      s.status === "submitted" ? "Submitted" : "Pending",
      validationLabel(s.validation_status),
      String(s.entries_count),
      s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : "—",
    ]),
  );

export function exportSowReportPdf(
  teachers: TeacherWithSchemes[],
  ctx: SowReportContext,
) {
  const stats = computeStats(teachers);
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Teachers' Scheme of Work — Progress Report", 14, 16);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${ctx.programName} • ${ctx.gradeName} • ${ctx.roleLabel} • ${ctx.yearName} / ${ctx.termName}`,
    14,
    23,
  );
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);

  autoTable(doc, {
    startY: 34,
    head: [["Metric", "Value"]],
    body: [
      ["Total Teachers", String(stats.totalTeachers)],
      ["Total Subject Schemes", String(stats.totalSchemes)],
      ["Fully Submitted Teachers", String(stats.fullySubmitted)],
      ["Submitted Schemes", `${stats.submittedSchemes} (${stats.submissionRate}%)`],
      ["Validated Schemes", `${stats.validatedCount} (${stats.validationRate}%)`],
      ["Not Validated Schemes", String(stats.notValidated)],
    ],
    theme: "grid",
    headStyles: { fillColor: [37, 99, 235] },
    styles: { fontSize: 9 },
    tableWidth: 140,
  });

  const afterSummaryY = (doc as any).lastAutoTable.finalY + 10;

  autoTable(doc, {
    startY: afterSummaryY,
    head: [
      [
        "Teacher",
        "Username",
        "Subject",
        "Class",
        "Submission",
        "Validation",
        "Weeks",
        "Submitted On",
      ],
    ],
    body: buildDetailRows(teachers),
    theme: "striped",
    headStyles: { fillColor: [37, 99, 235] },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold" } },
  });

  doc.save(
    `sow-report-${ctx.programName}-${ctx.gradeName}-${ctx.termName}`
      .replace(/\s+/g, "_")
      .toLowerCase() + ".pdf",
  );
}

export function exportSowReportExcel(
  teachers: TeacherWithSchemes[],
  ctx: SowReportContext,
) {
  const stats = computeStats(teachers);
  const wb = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ["Teachers' Scheme of Work — Progress Report"],
    [`${ctx.programName} • ${ctx.gradeName} • ${ctx.roleLabel} • ${ctx.yearName} / ${ctx.termName}`],
    [`Generated: ${new Date().toLocaleString()}`],
    [],
    ["Metric", "Value"],
    ["Total Teachers", stats.totalTeachers],
    ["Total Subject Schemes", stats.totalSchemes],
    ["Fully Submitted Teachers", stats.fullySubmitted],
    ["Submitted Schemes", stats.submittedSchemes],
    ["Submission Rate (%)", stats.submissionRate],
    ["Validated Schemes", stats.validatedCount],
    ["Validation Rate (%)", stats.validationRate],
    ["Not Validated Schemes", stats.notValidated],
  ]);
  summarySheet["!cols"] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  const detailSheet = XLSX.utils.aoa_to_sheet([
    [
      "Teacher",
      "Username",
      "Subject",
      "Class",
      "Submission Status",
      "Validation Status",
      "Weeks Entered",
      "Submitted On",
    ],
    ...buildDetailRows(teachers),
  ]);
  detailSheet["!cols"] = [
    { wch: 22 },
    { wch: 16 },
    { wch: 22 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, detailSheet, "Detail");

  XLSX.writeFile(
    wb,
    `sow-report-${ctx.programName}-${ctx.gradeName}-${ctx.termName}`
      .replace(/\s+/g, "_")
      .toLowerCase() + ".xlsx",
  );
}
