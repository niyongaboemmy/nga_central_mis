import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { checkFile, headerKey, parseSheet } from "../sheet";
import { GRADE_COLUMNS } from "../GradesBulkUpload";
import { SUBJECT_COLUMNS } from "../SubjectsBulkUpload";

const book = (sheets: Record<string, unknown[][]>): ArrayBuffer => {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
};

describe("headerKey", () => {
  it("ignores case, stars, brackets and punctuation", () => {
    expect(headerKey("Grade Name *")).toBe("grade name");
    expect(headerKey("GRADE_NAME (required)")).toBe("grade name");
    expect(headerKey("  grade   name ")).toBe("grade name");
  });
});

describe("parseSheet", () => {
  it("maps template and look-alike headers, keeps Excel row numbers, skips blank rows", () => {
    const data = book({
      Guide: [["ignore me"]],
      grades: [
        ["Upload of grades"],
        ["GRADE NAME *", "programme", "Level", "Notes"],
        ["SPES Year 1", "spes", 1, "x"],
        ["", "", "", ""],
        ["SPES Year 2", "SPES", "", ""],
        ["", "", "", ""],
      ],
    });
    const out = parseSheet(data, GRADE_COLUMNS, "Grades");
    expect(out.sheetName).toBe("grades");
    expect(out.ignoredHeaders).toEqual(["Notes"]);
    expect(out.missingRequired).toEqual([]);
    expect(out.blankRows).toBe(1);
    expect(out.rows).toEqual([
      { line: 3, name: "SPES Year 1", program: "spes", level_order: "1" },
      { line: 5, name: "SPES Year 2", program: "SPES", level_order: "" },
    ]);
  });

  it("reports a missing required column", () => {
    const out = parseSheet(book({ Subjects: [["Code", "Subject"], ["M1", "Maths"]] }), SUBJECT_COLUMNS, "Subjects");
    expect(out.missingRequired).toEqual([]);
    expect(out.rows[0]).toMatchObject({ code: "M1", name: "Maths" });

    const grades = parseSheet(book({ Grades: [["Grade name", "Level order"], ["Y1", "1"]] }), GRADE_COLUMNS, "Grades");
    expect(grades.missingRequired).toEqual(["Program"]);
  });

  it("explains a sheet without a header row", () => {
    expect(() => parseSheet(book({ Sheet1: [["a", "b"], [1, 2]] }), GRADE_COLUMNS, "Grades")).toThrow(/No header row/);
  });
});

describe("checkFile", () => {
  it("accepts Excel/CSV only, not empty, up to 5 MB", () => {
    const f = (name: string, size: number) => ({ name, size }) as File;
    expect(checkFile(f("grades.xlsx", 10))).toBeNull();
    expect(checkFile(f("grades.CSV", 10))).toBeNull();
    expect(checkFile(f("grades.pdf", 10))).toMatch(/not an Excel file/);
    expect(checkFile(f("grades.xlsx", 0))).toMatch(/empty/);
    expect(checkFile(f("grades.xlsx", 6 * 1024 * 1024))).toMatch(/5 MB/);
  });
});

describe("class groups sheet", () => {
  it("maps class / grade headers people write", async () => {
    const { CLASS_GROUP_COLUMNS } = await import("../ClassGroupsBulkUpload");
    const out = parseSheet(
      book({ "Class groups": [["Class group *", "GRADE NAME"], ["Class A", "spes year 1"], ["Class B", "SPES Year 1"]] }),
      CLASS_GROUP_COLUMNS,
      "Class groups",
    );
    expect(out.missingRequired).toEqual([]);
    expect(out.rows).toEqual([
      { line: 2, name: "Class A", grade: "spes year 1" },
      { line: 3, name: "Class B", grade: "SPES Year 1" },
    ]);
  });
});
