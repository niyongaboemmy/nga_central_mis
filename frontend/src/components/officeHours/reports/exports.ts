/**
 * Report exports (plan §14.4), all in the browser like the reporting module:
 * CSV, Excel (xlsx) and PDF (jspdf + autotable). Libraries load on demand so
 * the office-hours pages stay light.
 */
export interface ExportTable {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: Array<Array<string | number | null>>;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "office-hours";

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const cell = (v: string | number | null) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (t: ExportTable) => [t.columns.map(cell).join(","), ...t.rows.map((r) => r.map(cell).join(","))].join("\n");

export const exportCsv = (t: ExportTable) => download(new Blob([`﻿${toCsv(t)}`], { type: "text/csv;charset=utf-8" }), `${slug(t.title)}.csv`);

export const exportXlsx = async (tables: ExportTable[], fileTitle: string) => {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const t of tables) {
    const ws = XLSX.utils.aoa_to_sheet([[t.title], t.subtitle ? [t.subtitle] : [], [], t.columns, ...t.rows]);
    XLSX.utils.book_append_sheet(wb, ws, t.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet");
  }
  XLSX.writeFile(wb, `${slug(fileTitle)}.xlsx`);
};

export const exportPdf = async (tables: ExportTable[], fileTitle: string, scopeLine: string) => {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  let y = 40;
  doc.setFontSize(16);
  doc.text("NGA · Office hours", 40, y);
  doc.setFontSize(10);
  doc.text(`${fileTitle} · ${scopeLine} · generated ${new Date().toLocaleString("en-GB")}`, 40, (y += 16));
  for (const t of tables) {
    y += 24;
    doc.setFontSize(12);
    doc.text(t.title, 40, y);
    if (t.subtitle) {
      doc.setFontSize(9);
      doc.text(t.subtitle, 40, (y += 13));
    }
    autoTable(doc, {
      startY: y + 8,
      head: [t.columns],
      body: t.rows.map((r) => r.map((v) => (v === null || v === undefined ? "" : String(v)))),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [29, 78, 216] },
      margin: { left: 40, right: 40 },
    });
    y = (doc as any).lastAutoTable.finalY;
    if (y > 480) {
      doc.addPage();
      y = 20;
    }
  }
  doc.save(`${slug(fileTitle)}.pdf`);
};

export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Math.round(n * 10) / 10}%`);
