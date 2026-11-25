import React from "react";
import { academicsBulkApi, ClassGroup, Grade } from "../../../api/academics";
import BulkUploadModal from "./BulkUploadModal";
import { ColumnSpec, downloadTemplate } from "./sheet";

export const CLASS_GROUP_COLUMNS: ColumnSpec[] = [
  {
    key: "name",
    label: "Class name",
    required: true,
    aliases: ["class", "class group", "class group name", "name", "section", "stream"],
    example: "Class A",
    hint: "The class's name inside its grade. One already in that grade (case ignored) is skipped.",
  },
  {
    key: "grade",
    label: "Grade",
    required: true,
    aliases: ["grade name", "level", "year"],
    example: "SPES Year 1",
    hint: 'An existing grade (see the Grades sheet). Case and extra spaces don\'t matter. If two programs share a grade name, write "Year 1 (SPES)".',
  },
];

const ClassGroupsBulkUpload: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
  grades: Grade[];
  classGroups: ClassGroup[];
}> = ({ isOpen, onClose, onDone, grades, classGroups }) => (
  <BulkUploadModal
    isOpen={isOpen}
    onClose={onClose}
    onDone={onDone}
    title="Upload class groups from Excel"
    noun={{ one: "class group", many: "class groups" }}
    sheetName="Class groups"
    columns={CLASS_GROUP_COLUMNS}
    previewColumns={["name", "grade"]}
    ready={grades.length > 0}
    notReadyHint="Add grades first: every class belongs to a grade"
    check={(rows) => academicsBulkApi.classGroups(rows, true)}
    commit={(rows) => academicsBulkApi.classGroups(rows, false)}
    tips={[
      'Grade names are compared in lower case, so "SPES Year 1", "spes year 1" and "Spes  Year 1" all match.',
      "Classes that already exist in their grade are skipped, never created twice.",
      "Every row is checked first. Nothing is saved until you press Upload.",
    ]}
    onTemplate={() => {
      const sorted = [...grades].sort((a, b) => a.level_order - b.level_order);
      const g1 = sorted[0]?.name ?? "SPES Year 1";
      const g2 = sorted[1]?.name ?? g1;
      downloadTemplate({
        fileName: "class-groups-upload-template.xlsx",
        sheetName: "Class groups",
        columns: CLASS_GROUP_COLUMNS,
        examples: [
          ["Class A", g1],
          ["Class B", g1],
          ["Class A", g2],
        ],
        reference: [
          {
            title: "Grades",
            header: ["Grade", "Program", "Write it as (if names repeat)"],
            rows: sorted.map((g) => [g.name, g.program_name ?? "", `${g.name} (${g.program_name ?? ""})`]),
          },
          {
            title: "Existing class groups",
            header: ["Class", "Grade", "Program"],
            rows: classGroups.map((c) => [c.name, c.grade_name ?? "", c.program_name ?? ""]),
          },
        ],
        notes: [
          "Replace the example rows with your classes. Both columns are required.",
          "Grade names are compared ignoring case and extra spaces.",
        ],
      });
    }}
  />
);

export default ClassGroupsBulkUpload;
