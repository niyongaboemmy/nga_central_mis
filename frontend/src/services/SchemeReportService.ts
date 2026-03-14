import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SchemeEntry } from "../api/schemeOfWork";

export interface ReportMetadata {
  teacherName: string;
  subjectName: string;
  subjectCode?: string;
  classGroupName: string;
  academicYear: string;
  academicTerm: string;
  sector?: string;
  trade?: string;
  qualificationTitle?: string;
  rqfLevel?: string;
  learningHours?: string;
  numberOfClasses?: string;
  className?: string;
  schoolName?: string;
  moduleCode?: string;
  logo1?: string; // base64 or URL
  logo2?: string; // base64 or URL
}

export const SchemeReportService = {
  buildSOWReport: (entries: SchemeEntry[], metadata: ReportMetadata) => {
    const doc = new jsPDF("l", "mm", "a4");
    const docWidth = doc.internal.pageSize.getWidth();
    const docHeight = doc.internal.pageSize.getHeight();

    // ═══════════════════════════════════════════════════════════════════════════
    // COVER PAGE — Black & white, clean professional cover
    // ═══════════════════════════════════════════════════════════════════════════
    const BLACK: [number, number, number] = [0, 0, 0];
    const GRAY: [number, number, number] = [100, 100, 100];

    // ── Logos ───────────────────────────────────────────────────────────────
    if (metadata.logo1) {
      doc.addImage(metadata.logo1, "PNG", 15, 10, 44, 18);
    }
    if (metadata.logo2) {
      doc.addImage(metadata.logo2, "PNG", docWidth - 50, 10, 30, 18);
    }

    // Thin black rule below logos
    doc.setDrawColor(219, 196, 162);
    doc.setLineWidth(0.3);
    doc.line(15, 32, docWidth - 15, 32);

    // ── Title block (centered, black text) ─────────────────────────────────
    const titleY = docHeight * 0.28;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.setTextColor(...BLACK);
    doc.text("SCHEME OF WORK", docWidth / 2, titleY, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(14);
    doc.setTextColor(...GRAY);
    doc.text(metadata.academicTerm.toUpperCase(), docWidth / 2, titleY + 10, {
      align: "center",
    });

    // Black underline below title
    doc.setDrawColor(219, 196, 162);
    doc.setLineWidth(0.8);
    doc.line(docWidth / 2 - 50, titleY + 14, docWidth / 2 + 50, titleY + 14);

    // Module label below title
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0, 0);
    doc.text(
      `${metadata.moduleCode || metadata.subjectCode || ""} — ${metadata.subjectName}`,
      docWidth / 2,
      titleY + 21,
      { align: "center" },
    );

    // ── Identification table ────────────────────────────────────────────────
    const idTableData = [
      [
        { content: "Sector:", styles: { fontStyle: "bold" as "bold" } },
        metadata.sector || "ICT",
        { content: "Trainer:", styles: { fontStyle: "bold" as "bold" } },
        {
          content: metadata.teacherName,
          styles: { fontStyle: "bold" as "bold" },
        },
      ],
      [
        { content: "Trade:", styles: { fontStyle: "bold" as "bold" } },
        metadata.trade || "Software Programming and Embedded Systems (SPEs)",
        { content: "School Year:", styles: { fontStyle: "bold" as "bold" } },
        metadata.academicYear,
      ],
      [
        {
          content: "Qualification Title:",
          styles: { fontStyle: "bold" as "bold" },
        },
        metadata.qualificationTitle || metadata.trade || "N/A",
        { content: "Term:", styles: { fontStyle: "bold" as "bold" } },
        metadata.academicTerm,
      ],
      [
        { content: "", colSpan: 2 },
        {
          content: "Module details",
          colSpan: 2,
          styles: {
            fontStyle: "bold" as "bold",
            halign: "center" as "center",
            fillColor: [219, 196, 162] as any, // #dbc4a2
            textColor: [0, 0, 0] as any, // black text
          },
        },
      ],
      [
        { content: "RQF Level:", styles: { fontStyle: "bold" as "bold" } },
        metadata.rqfLevel || "Level 3",
        {
          content: "Module code and title:",
          styles: { fontStyle: "bold" as "bold" },
        },
        `${metadata.moduleCode || metadata.subjectCode || ""}, ${metadata.subjectName}`,
      ],
      [
        { content: "Date:", styles: { fontStyle: "bold" as "bold" } },
        new Date().toLocaleDateString("en-GB"),
        { content: "Learning hours:", styles: { fontStyle: "bold" as "bold" } },
        metadata.learningHours || "N/A",
      ],
      [
        { content: "", colSpan: 2 },
        {
          content: "Number of Classes:",
          styles: { fontStyle: "bold" as "bold" },
        },
        metadata.numberOfClasses || "1",
      ],
      [
        { content: "", colSpan: 2 },
        { content: "Class Name:", styles: { fontStyle: "bold" as "bold" } },
        metadata.className || metadata.classGroupName,
      ],
    ];

    autoTable(doc, {
      startY: titleY + 28,
      body: idTableData,
      theme: "plain",
      styles: {
        fontSize: 10,
        cellPadding: 2.2,
        textColor: BLACK as any,
        lineColor: [219, 196, 162] as any,
        lineWidth: 0.15,
      },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 75 },
        2: { cellWidth: 42 },
        3: { cellWidth: "auto" as "auto" },
      },
      margin: { left: 15, right: 15 },
    });

    // ── Module name bar (#dbc4a2) ───────────────────────────────────────────
    const moduleBarY = (doc as any).lastAutoTable.finalY + 2;
    doc.setFillColor(219, 196, 162); // #dbc4a2
    doc.rect(15, moduleBarY, docWidth - 30, 9, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0, 0); // black text
    doc.text(
      `${metadata.moduleCode || metadata.subjectCode || ""}, ${metadata.subjectName}`,
      docWidth / 2,
      moduleBarY + 6,
      { align: "center" },
    );

    // ── Contact info ────────────────────────────────────────────────────────
    const contactY = moduleBarY + 15;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(
      "Website: www.nga.ac.rw  |  Email: codingacademy@nga.ac.rw  |  Phone: +(250) 789 552 671",
      docWidth / 2,
      contactY,
      { align: "center" },
    );
    doc.text(
      "Location: KG 642 St, Kimihurura, Rugando",
      docWidth / 2,
      contactY + 5,
      { align: "center" },
    );

    // ── Thin black bottom border ────────────────────────────────────────────
    doc.setDrawColor(219, 196, 162);
    doc.setLineWidth(1.5);
    doc.line(0, docHeight - 4, docWidth, docHeight - 4);

    // ═══════════════════════════════════════════════════════════════════════════
    // PAGE 2 — Main Scheme Table (teal used only here for table head)
    // ═══════════════════════════════════════════════════════════════════════════
    doc.addPage();
    const tableStartY = 15;

    // --- Main Scheme Table Data Preparation ---
    // Using objects for body to handle rowSpan robustly
    const tableData = entries.map((entry) => ({
      week: `${entry.week_number}\n${new Date(entry.start_date).toLocaleDateString()} - ${new Date(entry.end_date).toLocaleDateString()}`,
      lo: entry.objective || "",
      duration: entry.duration || "",
      ic: entry.topic || "",
      activities: entry.methodology || "",
      resources: entry.resources || "",
      evidence: entry.evaluation || "",
      place: entry.learning_place || "Classroom",
      obs: entry.observation || "",
    }));

    // Pre-calculate Row Spans
    const rowSpans: { [key: string]: number } = {};
    const columnsToSpan = ["week", "lo"];

    columnsToSpan.forEach((colKey) => {
      let startRow = 0;
      while (startRow < tableData.length) {
        let endRow = startRow + 1;
        while (
          endRow < tableData.length &&
          (tableData[endRow] as any)[colKey] ===
            (tableData[startRow] as any)[colKey] &&
          (tableData[startRow] as any)[colKey] !== ""
        ) {
          endRow++;
        }
        const span = endRow - startRow;
        if (span > 1) {
          rowSpans[`${startRow}_${colKey}`] = span;
          for (let i = startRow + 1; i < endRow; i++) {
            rowSpans[`${i}_${colKey}`] = 0; // Mark as covered
          }
        }
        startRow = endRow;
      }
    });

    autoTable(doc, {
      startY: tableStartY,
      head: [
        [
          {
            content: "Weeks",
            rowSpan: 2,
            styles: {
              halign: "center" as "center",
              valign: "middle" as "middle",
            },
          },
          {
            content: "Competence code and name",
            colSpan: 3,
            styles: {
              halign: "center" as "center",
              valign: "middle" as "middle",
            },
          },
          {
            content: "Learning Activities",
            rowSpan: 2,
            styles: {
              halign: "center" as "center",
              valign: "middle" as "middle",
            },
          },
          {
            content: "Resources (Equipment, tools, and materials)",
            rowSpan: 2,
            styles: {
              halign: "center" as "center",
              valign: "middle" as "middle",
            },
          },
          {
            content: "Evidences of formative assessment",
            rowSpan: 2,
            styles: {
              halign: "center" as "center",
              valign: "middle" as "middle",
            },
          },
          {
            content: "Learning Place",
            rowSpan: 2,
            styles: {
              halign: "center" as "center",
              valign: "middle" as "middle",
            },
          },
          {
            content: "Observation",
            rowSpan: 2,
            styles: {
              halign: "center" as "center",
              valign: "middle" as "middle",
            },
          },
        ],
        [
          {
            content: "Learning outcome (LO)",
            styles: {
              halign: "center" as "center",
              valign: "middle" as "middle",
            },
          },
          {
            content: "Duration (Hrs)",
            styles: {
              halign: "center" as "center",
              valign: "middle" as "middle",
            },
          },
          {
            content: "Indicative content (IC)",
            styles: {
              halign: "center" as "center",
              valign: "middle" as "middle",
            },
          },
        ],
      ],
      body: tableData,
      columns: [
        { header: "week", dataKey: "week" },
        { header: "lo", dataKey: "lo" },
        { header: "duration", dataKey: "duration" },
        { header: "ic", dataKey: "ic" },
        { header: "activities", dataKey: "activities" },
        { header: "resources", dataKey: "resources" },
        { header: "evidence", dataKey: "evidence" },
        { header: "place", dataKey: "place" },
        { header: "obs", dataKey: "obs" },
      ],
      theme: "grid",
      styles: {
        fontSize: 8,
        cellPadding: 2,
        textColor: 0,
        lineColor: "#939393",
        lineWidth: 0.1,
        font: "helvetica",
      },
      headStyles: {
        fillColor: [219, 196, 162] as any, // #dbc4a2 tan/beige
        textColor: [0, 0, 0] as any,
        fontStyle: "bold" as "bold",
      },
      columnStyles: {
        0: { cellWidth: 22 }, // Weeks
        1: { cellWidth: 35 }, // LO
        2: { cellWidth: 15 }, // Duration
        3: { cellWidth: 40 }, // IC
        4: { cellWidth: 35 }, // Activities
        5: { cellWidth: 35 }, // Resources
        6: { cellWidth: 35 }, // Evidence
        7: { cellWidth: 20 }, // Place
        8: { cellWidth: 25 }, // Observation
      },
      margin: { left: 15, right: 15 },
      pageBreak: "auto",
      didParseCell: (data) => {
        if (data.section === "body") {
          const colKey = data.column.dataKey as string;
          if (colKey === "week" || colKey === "lo") {
            const span = rowSpans[`${data.row.index}_${colKey}`];
            if (span !== undefined) {
              if (span === 0) {
                data.cell.text = [""];
              } else {
                data.cell.rowSpan = span;
              }
            }
          }
        }
      },
    });

    // --- Signatures section ---
    let finalSigY = (doc as any).lastAutoTable.finalY + 15;

    if (finalSigY + 45 > docHeight) {
      doc.addPage();
      finalSigY = 25; // Reset to top of new page
    }

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Prepared by:", 15, finalSigY);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Trainer's name and Signature: ${metadata.teacherName}`,
      15,
      finalSigY + 5,
    );

    doc.setFont("helvetica", "bold");
    doc.text("Approved and Signed by,", 15, finalSigY + 20);
    doc.setFont("helvetica", "normal");
    doc.text("Josephine Nyiranzeyimana", 15, finalSigY + 25);
    doc.text("Program Coordinator", 15, finalSigY + 30);

    return doc;
  },

  generateSOWReport: (entries: SchemeEntry[], metadata: ReportMetadata) => {
    const doc = SchemeReportService.buildSOWReport(entries, metadata);
    doc.save(
      `SOW_${metadata.academicTerm.replace(/\s+/g, "_")}_${metadata.subjectName.replace(/\s+/g, "_")}.pdf`,
    );
  },

  generateSOWReportBlobUrl: (entries: SchemeEntry[], metadata: ReportMetadata): string => {
    const doc = SchemeReportService.buildSOWReport(entries, metadata);
    return doc.output("bloburl").toString();
  },
};
