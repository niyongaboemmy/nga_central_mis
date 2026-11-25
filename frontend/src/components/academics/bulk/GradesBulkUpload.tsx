import React from "react";
import { academicsBulkApi, Grade, Program } from "../../../api/academics";
import BulkUploadModal from "./BulkUploadModal";
import { ColumnSpec, downloadTemplate } from "./sheet";

export const GRADE_COLUMNS: ColumnSpec[] = [
  {
    key: "name",
    label: "Grade name",
    required: true,
    aliases: ["grade", "name", "grade names", "class level"],
    example: "SPES Year 1",
    hint: "The grade's name. A grade that already exists in the program is matched ignoring case and kept.",
  },
  {
    key: "program",
    label: "Program",
    required: true,
    aliases: ["program name", "programme", "academic program"],
    example: "SPES",
    hint: "An existing program's name (see the Programs sheet). Case does not matter.",
  },
  {
    key: "level_order",
    label: "Level order",
    aliases: ["level", "order", "sequence"],
    example: "1",
    hint: "Whole number. Promotion moves learners to the next level order. Blank = next free number.",
  },
  {
    key: "rqf_level",
    label: "RQF level",
    aliases: ["rqf"],
    example: "3",
    hint: "Optional, 1 to 8 (\"Level 3\" also works). Printed on TVET report cards.",
  },
];

const GradesBulkUpload: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
  programs: Program[];
  grades: Grade[];
}> = ({ isOpen, onClose, onDone, programs, grades }) => (
  <BulkUploadModal
    isOpen={isOpen}
    onClose={onClose}
    onDone={onDone}
    title="Upload grades from Excel"
    noun={{ one: "grade", many: "grades" }}
    sheetName="Grades"
    columns={GRADE_COLUMNS}
    previewColumns={["name", "program", "level_order", "rqf_level"]}
    check={(rows) => academicsBulkApi.grades(rows, true)}
    commit={(rows) => academicsBulkApi.grades(rows, false)}
    tips={[
      "Names are compared in lower case, so \"SPES Year 1\" and \"spes year 1\" are the same grade.",
      "Grades that already exist are skipped; a new level order or RQF level updates them.",
      "Every row is checked first. Nothing is saved until you press Upload.",
    ]}
    onTemplate={() => {
      const first = programs[0]?.name ?? "SPES";
      const next = Math.max(0, ...grades.map((g) => g.level_order)) + 1;
      downloadTemplate({
        fileName: "grades-upload-template.xlsx",
        sheetName: "Grades",
        columns: GRADE_COLUMNS,
        examples: [
          [`${first} Year 1`, first, String(next), "3"],
          [`${first} Year 2`, first, String(next + 1), "4"],
        ],
        reference: [
          { title: "Programs", header: ["Program"], rows: programs.map((p) => [p.name]) },
          {
            title: "Existing grades",
            header: ["Grade", "Program", "Level order", "RQF level"],
            rows: [...grades]
              .sort((a, b) => a.level_order - b.level_order)
              .map((g) => [g.name, g.program_name ?? "", String(g.level_order), g.rqf_level != null ? String(g.rqf_level) : ""]),
          },
        ],
        notes: [
          "Replace the example rows with your grades. Columns marked * are required.",
          "Names are compared ignoring case and extra spaces.",
        ],
      });
    }}
  />
);

export default GradesBulkUpload;
