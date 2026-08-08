import { describe, it, expect } from "vitest";
import { MentorshipReportService } from "../MentorshipReportService";
import { ConsolidatedReport } from "../../api/mentorship";

const report: ConsolidatedReport = {
  mentor_name: "UWITONZE Jean Bosco",
  academic_year_id: 1,
  mentees: [
    {
      student_id: 1,
      name: "IGIHOZO Belise",
      date_of_birth: "2008-03-15",
      scores: [{ subject_name: "Mathematics", score: 62, max_score: 100, assessment_type: "EXAM" }],
      sessions: [
        {
          mentorship_id: 1,
          session_date: "2026-01-21",
          topic: "Contact and updates about the first term",
          next_steps: "Get ready for CATs",
          guidance_notes: null,
          notes: "No remarks",
          follow_up_required: false,
          dishonesty_flagged: false,
          stress_flag: false,
        },
      ],
      comments: [
        { checkin_id: 1, category: "APPRECIATION", message: "Thank you for your guidance.", submitted_at: "2026-02-01" },
      ],
      recommend_follow_up: false,
    },
    {
      student_id: 2,
      name: "RUTAGANIRA Yanis",
      date_of_birth: null,
      scores: [],
      sessions: [],
      comments: [],
      recommend_follow_up: true,
    },
  ],
};

const metadata = {
  schoolName: "Rwanda Coding Academy",
  academicYearName: "2025-2026",
  generatedBy: "Test Mentor",
};

describe("MentorshipReportService — periodic consolidated PDF generation", () => {
  it("builds a cover page, one page per mentee, and a closing page", () => {
    const doc = MentorshipReportService.buildReport(report, metadata);
    // 1 cover page + 2 mentees + 1 closing page = 4 pages
    expect(doc.getNumberOfPages()).toBe(4);
  });

  it("produces a valid, non-empty PDF blob", () => {
    const doc = MentorshipReportService.buildReport(report, metadata);
    const blob = doc.output("blob");
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe("application/pdf");
  });

  it("handles a mentor with zero assigned mentees without throwing", () => {
    const empty: ConsolidatedReport = { mentor_name: "Empty Mentor", academic_year_id: 1, mentees: [] };
    const doc = MentorshipReportService.buildReport(empty, metadata);
    // Cover page + closing page, no mentee pages
    expect(doc.getNumberOfPages()).toBe(2);
  });

  it("handles a mentee with no sessions/comments/scores without throwing", () => {
    const sparse: ConsolidatedReport = {
      mentor_name: "Mentor",
      academic_year_id: 1,
      mentees: [
        { student_id: 9, name: "New Mentee", date_of_birth: null, scores: [], sessions: [], comments: [], recommend_follow_up: false },
      ],
    };
    expect(() => MentorshipReportService.buildReport(sparse, metadata)).not.toThrow();
  });
});
