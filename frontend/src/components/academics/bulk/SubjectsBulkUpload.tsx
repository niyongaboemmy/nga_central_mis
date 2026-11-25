import React, { useEffect, useMemo, useState } from "react";
import { GraduationCap } from "lucide-react";
import {
  academicsBulkApi,
  CourseCategory,
  courseCategoriesApi,
  Grade,
  gradesApi,
  Subject,
} from "../../../api/academics";
import { useToast } from "../../../contexts/ToastContext";
import Select from "../../ui/Select";
import BulkUploadModal from "./BulkUploadModal";
import { ColumnSpec, downloadTemplate } from "./sheet";

export const SUBJECT_COLUMNS: ColumnSpec[] = [
  {
    key: "name",
    label: "Subject name",
    required: true,
    aliases: ["subject", "name", "module", "module name", "course"],
    example: "Mathematics",
    hint: "The subject's name.",
  },
  {
    key: "code",
    label: "Code",
    aliases: ["subject code", "module code"],
    example: "MATH101",
    hint: "Optional, unique. A subject with this code (or this name, when there is no code) is linked instead of created again.",
  },
  {
    key: "description",
    label: "Description",
    example: "Algebra and geometry",
    hint: "Optional, up to 255 characters.",
  },
  {
    key: "category",
    label: "Course category",
    aliases: ["category", "course category name"],
    example: "Core",
    hint: "Optional. An existing course category (see the Categories sheet). Case does not matter.",
  },
  {
    key: "max_marks",
    label: "Max marks",
    aliases: ["marks", "max mark", "maximum marks"],
    example: "100",
    hint: "Optional whole number, 0 to 1000.",
  },
  {
    key: "module_weight",
    label: "Module weight",
    aliases: ["weight", "credits x 10"],
    example: "80",
    hint: "Optional, 1 to 1000: learning hours on TVET report cards (credits x 10).",
  },
  {
    key: "rqf_level",
    label: "RQF level",
    aliases: ["rqf"],
    example: "Level 3",
    hint: "Optional text for the Scheme of Work cover page.",
  },
  {
    key: "learning_hours",
    label: "Learning hours",
    aliases: ["hours", "hours per week"],
    example: "5 per week",
    hint: "Optional text for the Scheme of Work cover page.",
  },
  {
    key: "color",
    label: "Colour",
    aliases: ["color", "calendar colour", "calendar color"],
    example: "#3B82F6",
    hint: "Optional hex colour for the calendar. Blank = a distinct colour is picked.",
  },
  {
    key: "grades",
    label: "Also in grades",
    aliases: ["grades", "other grades", "extra grades", "grade names"],
    example: "SPES Year 2",
    hint: "Optional. More grades for this subject, separated by commas. Names are matched ignoring case.",
  },
];

const SubjectsBulkUpload: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
  subjects: Subject[];
}> = ({ isOpen, onClose, onDone, subjects }) => {
  const { showToast } = useToast();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [categories, setCategories] = useState<CourseCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [gradeId, setGradeId] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let live = true;
    setLoading(true);
    Promise.all([gradesApi.getAll(), courseCategoriesApi.getAll()])
      .then(([g, c]) => {
        if (!live) return;
        setGrades(g.data.data ?? []);
        setCategories((c.data as any)?.data ?? []);
      })
      .catch(() => live && showToast("Could not load grades and categories", "error"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [isOpen, showToast]);

  const grade = grades.find((g) => g.grade_id === gradeId);
  const gradeLabel = grade ? `${grade.name}${grade.program_name ? ` (${grade.program_name})` : ""}` : "";
  const inGrade = useMemo(
    () => (gradeId ? subjects.filter((s) => s.grades?.some((g) => g.grade_id === gradeId)).length : 0),
    [subjects, gradeId],
  );

  return (
    <BulkUploadModal
      isOpen={isOpen}
      onClose={() => {
        setGradeId(null);
        onClose();
      }}
      onDone={onDone}
      title="Upload subjects from Excel"
      noun={{ one: "subject", many: "subjects" }}
      sheetName="Subjects"
      columns={SUBJECT_COLUMNS}
      previewColumns={["name", "code", "category", "max_marks", "grades"]}
      ready={!!gradeId}
      notReadyHint="Pick the grade first, then choose the file"
      contextLabel={gradeLabel}
      check={(rows) => academicsBulkApi.subjects(rows, gradeId!, true)}
      commit={(rows) => academicsBulkApi.subjects(rows, gradeId!, false)}
      tips={[
        "Every subject in the file is added to the grade you pick; the \"Also in grades\" column adds more.",
        "Subjects that already exist (same code, or same name) are linked to the grade, not created twice.",
        "Grade, category and subject names are compared in lower case, so capitals and extra spaces don't matter.",
      ]}
      setup={
        <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
              <GraduationCap className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Grade</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">The subjects in the file are taught in this grade</p>
            </div>
          </div>
          {loading ? (
            <div className="h-12 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" aria-label="Loading grades" />
          ) : grades.length === 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">No grades yet. Add grades (or upload them) first.</p>
          ) : (
            <>
              <Select
                aria-label="Grade"
                value={gradeId ?? ""}
                onChange={(e) => setGradeId(e.target.value ? Number(e.target.value) : null)}
                options={[
                  { value: "", label: "Choose a grade…" },
                  ...[...grades]
                    .sort((a, b) => a.level_order - b.level_order)
                    .map((g) => ({ value: g.grade_id, label: `${g.name}${g.program_name ? ` · ${g.program_name}` : ""}` })),
                ]}
              />
              {grade && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {gradeLabel} has {inGrade} subject{inGrade === 1 ? "" : "s"} now.
                </p>
              )}
            </>
          )}
        </div>
      }
      onTemplate={() => {
        const gradeName = grade?.name ?? grades[0]?.name ?? "";
        const otherGrade = grades.find((g) => g.grade_id !== grade?.grade_id)?.name ?? "";
        const cat = categories[0]?.name ?? "";
        downloadTemplate({
          fileName: gradeName ? `subjects-${gradeName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.xlsx` : "subjects-upload-template.xlsx",
          sheetName: "Subjects",
          columns: SUBJECT_COLUMNS,
          examples: [
            ["Mathematics", "MATH101", "Algebra and geometry", cat, "100", "80", "Level 3", "5 per week", "", ""],
            ["English", "ENG101", "", cat, "100", "60", "", "", "#2563EB", otherGrade],
          ],
          reference: [
            {
              title: "Grades",
              header: ["Grade", "Program", "Write it as (if names repeat)"],
              rows: grades.map((g) => [g.name, g.program_name ?? "", `${g.name} (${g.program_name ?? ""})`]),
            },
            { title: "Categories", header: ["Course category"], rows: categories.map((c) => [c.name]) },
            {
              title: "Existing subjects",
              header: ["Subject", "Code", "Grades"],
              rows: subjects.map((s) => [s.name, s.code ?? "", (s.grades ?? []).map((g) => g.grade_name).join(", ")]),
            },
          ],
          notes: [
            `Pick the grade in the upload window${gradeName ? ` (this template was made for ${gradeName})` : ""}.`,
            "Replace the example rows with your subjects. Columns marked * are required.",
            "Names are compared ignoring case and extra spaces.",
          ],
        });
      }}
    />
  );
};

export default SubjectsBulkUpload;
