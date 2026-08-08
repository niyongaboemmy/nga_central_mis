import { describe, it, expect } from "vitest";
import { LessonReportRollupService } from "../LessonReportRollupService";
import { LessonReportsRollup } from "../../api/reports";

const rollup: LessonReportsRollup = {
  period: { start_date: "2026-01-01", end_date: "2026-01-31", academic_term_id: 1 },
  subjects: [
    {
      subject_id: 1,
      subject_name: "Mathematics",
      subject_code: "MATH",
      class_groups: [
        {
          class_group_id: 10,
          class_group_name: "Year One A",
          weeks: [
            {
              week_number: 1,
              entries: [
                {
                  lesson_report_id: 1,
                  delivery_date: "2026-01-05",
                  status: "DELIVERED",
                  schedule_flag: "ON_TIME",
                  attendance_count: 25,
                  completion_rate: 90,
                  reflection_notes: "Went well",
                  instructor_name: "Jane Doe",
                  topic: "Algebra basics",
                },
              ],
            },
          ],
        },
        {
          class_group_id: 11,
          class_group_name: "Year One B",
          weeks: [],
        },
      ],
    },
    {
      subject_id: 2,
      subject_name: "English",
      subject_code: "ENG",
      class_groups: [
        {
          class_group_id: 10,
          class_group_name: "Year One A",
          weeks: [
            { week_number: 1, entries: [] },
          ],
        },
      ],
    },
  ],
};

describe("LessonReportRollupService — Subject x Class Group x Week PDF generation", () => {
  it("builds a PDF document with one page per subject/class-group pair", () => {
    const doc = LessonReportRollupService.buildReport(rollup, {
      schoolName: "NGA Coding Academy",
      academicTermName: "Term 2",
      generatedBy: "Test",
    });

    // 3 (subject, class_group) pairs => 3 pages
    expect(doc.getNumberOfPages()).toBe(3);
  });

  it("produces a valid, non-empty PDF blob", () => {
    const doc = LessonReportRollupService.buildReport(rollup, {
      schoolName: "NGA Coding Academy",
      academicTermName: "Term 2",
      generatedBy: "Test",
    });
    const blob = doc.output("blob");
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe("application/pdf");
  });

  it("handles an empty rollup (no subjects) without throwing", () => {
    const empty: LessonReportsRollup = {
      period: { start_date: "2026-01-01", end_date: "2026-01-31", academic_term_id: 1 },
      subjects: [],
    };
    expect(() =>
      LessonReportRollupService.buildReport(empty, {
        schoolName: "NGA Coding Academy",
        academicTermName: "Term 2",
        generatedBy: "Test",
      }),
    ).not.toThrow();
  });
});
