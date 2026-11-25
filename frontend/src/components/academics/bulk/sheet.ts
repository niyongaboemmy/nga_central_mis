import * as XLSX from "xlsx";
import type { BulkRowResult, BulkSheetRow } from "../../../api/academics";

/** One column of an upload sheet. `aliases` are other headers people write for it. */
export interface ColumnSpec {
  key: string;
  label: string;
  required?: boolean;
  aliases?: string[];
  example: string;
  hint: string;
}

export const MAX_ROWS = 1000;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv"];

/**
 * A header or name as a comparison key: lower case, no "*", no "(…)", punctuation
 * and repeated spaces collapsed. "Grade Name *", "grade_name" and "GRADE NAME (required)"
 * all become "grade name".
 */
export const headerKey = (v: unknown): string =>
  String(v ?? "")
    .normalize("NFKC")
    .replace(/\(.*?\)/g, " ")
    .replace(/[*_\-./]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export interface ParsedSheet {
  sheetName: string;
  rows: BulkSheetRow[];
  /** Headers in the file that match no column (ignored). */
  ignoredHeaders: string[];
  /** Required columns the file does not have. */
  missingRequired: string[];
  /** Blank rows skipped between data rows. */
  blankRows: number;
}

/** A friendly reason a file can't be used before reading it, or null. */
export function checkFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext)))
    return `"${file.name}" is not an Excel file. Upload a .xlsx, .xls or .csv file.`;
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_FILE_BYTES) return `"${file.name}" is larger than 5 MB.`;
  return null;
}

/**
 * Read the rows of an upload sheet. The sheet named `preferredSheet` is used when
 * present, otherwise the first one. The header row is the first row (within the top
 * 10) that names a required column; `line` is the row number shown in Excel.
 */
export function parseSheet(data: ArrayBuffer, columns: ColumnSpec[], preferredSheet: string): ParsedSheet {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(data, { type: "array" });
  } catch {
    throw new Error("This file can't be read. Save it as .xlsx and try again.");
  }
  const sheetName =
    wb.SheetNames.find((n) => headerKey(n) === headerKey(preferredSheet)) ?? wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!ws) throw new Error("The file has no sheets.");

  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: false, blankrows: true });
  // The grid starts at the sheet's first used row, which isn't always row 1.
  const firstRow = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]).s.r + 1 : 1;

  const lookup = new Map<string, string>();
  for (const c of columns) {
    lookup.set(headerKey(c.label), c.key);
    lookup.set(headerKey(c.key), c.key);
    (c.aliases ?? []).forEach((a) => lookup.set(headerKey(a), c.key));
  }
  const required = columns.filter((c) => c.required);

  const headerIndex = grid
    .slice(0, 10)
    .findIndex((row) => row.some((h) => required.some((c) => lookup.get(headerKey(h)) === c.key)));
  if (headerIndex < 0)
    throw new Error(
      `No header row found in sheet "${sheetName}". The first row should name the columns, e.g. ${columns
        .slice(0, 3)
        .map((c) => `"${c.label}"`)
        .join(", ")}. Download the template to start from the right layout.`,
    );

  const header = grid[headerIndex].map((h) => String(h ?? "").trim());
  const keys = header.map((h) => lookup.get(headerKey(h)) ?? null);
  const ignoredHeaders = header.filter((h, i) => h && !keys[i]);
  const present = new Set(keys.filter(Boolean));
  const missingRequired = required.filter((c) => !present.has(c.key)).map((c) => c.label);

  const rows: BulkSheetRow[] = [];
  let blankRows = 0;
  grid.slice(headerIndex + 1).forEach((cells, i) => {
    const row = { line: firstRow + headerIndex + i + 1 } as BulkSheetRow;
    let filled = false;
    keys.forEach((k, ci) => {
      if (!k) return;
      const v = String(cells[ci] ?? "").trim();
      if (v) filled = true;
      // Two headers for one column (e.g. "Name" and "Grade name"): keep the first filled one.
      if (!row[k]) row[k] = v;
    });
    if (filled) rows.push(row);
    else blankRows++;
  });
  // Blank rows after the last data row are not "skipped", they're just the end of the sheet.
  const lastIndex = rows.length ? rows[rows.length - 1].line - firstRow : headerIndex;
  blankRows = Math.max(0, blankRows - (grid.length - 1 - lastIndex));

  if (rows.length > MAX_ROWS)
    throw new Error(`The sheet has ${rows.length} rows. Upload at most ${MAX_ROWS} rows at a time.`);
  return { sheetName, rows, ignoredHeaders, missingRequired, blankRows };
}

/** Write a template: an upload sheet with example rows, a guide, and reference lists. */
export function downloadTemplate(opts: {
  fileName: string;
  sheetName: string;
  columns: ColumnSpec[];
  examples: string[][];
  reference: { title: string; header: string[]; rows: string[][] }[];
  notes: string[];
}) {
  const wb = XLSX.utils.book_new();
  const header = opts.columns.map((c) => (c.required ? `${c.label} *` : c.label));
  const ws = XLSX.utils.aoa_to_sheet([header, ...opts.examples]);
  ws["!cols"] = opts.columns.map((c) => ({ wch: Math.max(14, c.label.length + 4, c.example.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, opts.sheetName);

  const guide = XLSX.utils.aoa_to_sheet([
    ["Column", "Required", "What to write", "Example"],
    ...opts.columns.map((c) => [c.label, c.required ? "Yes" : "No", c.hint, c.example]),
    [],
    ...opts.notes.map((n) => [n]),
  ]);
  guide["!cols"] = [{ wch: 18 }, { wch: 10 }, { wch: 70 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, guide, "Guide");

  for (const ref of opts.reference) {
    const rs = XLSX.utils.aoa_to_sheet([ref.header, ...(ref.rows.length ? ref.rows : [["(none yet)"]])]);
    rs["!cols"] = ref.header.map(() => ({ wch: 28 }));
    XLSX.utils.book_append_sheet(wb, rs, ref.title.slice(0, 31));
  }
  XLSX.writeFile(wb, opts.fileName);
}

/** Save the rows that were not uploaded, with the reason, to fix and upload again. */
export function downloadProblems(opts: {
  fileName: string;
  sheetName: string;
  columns: ColumnSpec[];
  rows: BulkSheetRow[];
  results: BulkRowResult[];
}) {
  const byLine = new Map(opts.results.map((r) => [r.line, r]));
  const bad = opts.rows.filter((r) => byLine.get(r.line)?.action === "error");
  const aoa = [
    [...opts.columns.map((c) => c.label), "Problem (ignored when you upload again)"],
    ...bad.map((r) => [...opts.columns.map((c) => r[c.key] ?? ""), byLine.get(r.line)!.errors.join("; ")]),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), opts.sheetName);
  XLSX.writeFile(wb, opts.fileName);
}
