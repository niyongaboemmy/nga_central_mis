import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as XLSX from "xlsx";
import BulkUploadModal from "../BulkUploadModal";
import { GRADE_COLUMNS } from "../GradesBulkUpload";
import type { BulkImportSummary, BulkSheetRow } from "../../../../api/academics";

const toast = vi.fn();
vi.mock("../../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: toast }) }));

const xlsxFile = (aoa: unknown[][]) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Grades");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const file = new File([buf], "grades.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  // jsdom's File has no arrayBuffer(); the dialog reads the file with it.
  Object.defineProperty(file, "arrayBuffer", { value: () => Promise.resolve(buf) });
  return file;
};

/** A fake server: a row is a problem while its program is not "SPES" (any case). */
const verdict = (rows: BulkSheetRow[], dryRun: boolean): BulkImportSummary => {
  const out = rows.map((r) =>
    r.program.toLowerCase() === "spes"
      ? { line: r.line, label: r.name, action: "create" as const, errors: [], warnings: [], changes: ["New grade"] }
      : { line: r.line, label: r.name, action: "error" as const, errors: [`No program called "${r.program}"`], warnings: [], changes: [] },
  );
  const n = (a: string) => out.filter((r) => r.action === a).length;
  return { dryRun, total: out.length, create: n("create"), update: 0, assign: 0, skip: 0, error: n("error"), rows: out };
};

const setup = () => {
  const check = vi.fn(async (rows: BulkSheetRow[]) => verdict(rows, true));
  const commit = vi.fn(async (rows: BulkSheetRow[]) => verdict(rows, false));
  const onDone = vi.fn();
  render(
    <BulkUploadModal
      isOpen
      onClose={vi.fn()}
      onDone={onDone}
      title="Upload grades from Excel"
      noun={{ one: "grade", many: "grades" }}
      sheetName="Grades"
      columns={GRADE_COLUMNS}
      previewColumns={["name", "program"]}
      onTemplate={vi.fn()}
      check={check}
      commit={commit}
      tips={["tip"]}
    />,
  );
  return { check, commit, onDone };
};

describe("BulkUploadModal", () => {
  it("checks the file, lets a problem row be fixed, re-checks and uploads", async () => {
    const user = userEvent.setup();
    const { check, commit, onDone } = setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, xlsxFile([["Grade name", "Program"], ["Year 1", "spes"], ["Year 2", "SPESS"]]));

    await screen.findByText(/No program called "SPESS"/);
    expect(check).toHaveBeenCalledTimes(1);
    expect(check.mock.calls[0][0]).toEqual([
      { line: 2, name: "Year 1", program: "spes" },
      { line: 3, name: "Year 2", program: "SPESS" },
    ]);
    expect(screen.getByRole("button", { name: /Upload 1 grade$/ })).toBeEnabled();

    // Fix the typo inline: upload is blocked until the rows are checked again.
    await user.click(screen.getByRole("button", { name: "Edit row 3" }));
    const programInput = screen.getByPlaceholderText("SPES");
    await user.clear(programInput);
    await user.type(programInput, "Spes");
    expect(screen.getByRole("button", { name: /Upload 1 grade$/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Check again/ }));

    const upload = await screen.findByRole("button", { name: /Upload 2 grades/ });
    await user.click(upload);

    await screen.findByText("Upload complete");
    expect(commit).toHaveBeenCalledWith([
      { line: 2, name: "Year 1", program: "spes" },
      { line: 3, name: "Year 2", program: "Spes" },
    ]);
    expect(onDone).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("2 grades uploaded", "success");
  });

  it("refuses a file without the required columns and never calls the server", async () => {
    const user = userEvent.setup();
    const { check } = setup();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, xlsxFile([["Grade name", "Level order"], ["Year 1", "1"]]));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/no "Program" column/));
    expect(check).not.toHaveBeenCalled();
  });
});
