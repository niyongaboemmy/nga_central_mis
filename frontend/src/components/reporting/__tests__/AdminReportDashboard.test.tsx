import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminReportDashboard from "../AdminReportDashboard";

const adminStats = {
  total_lesson_reports: 10,
  total_mentorship_sessions: 3,
  curriculum_coverage_pct: 75,
  total_sow_entries: 20,
  delivered_entries: 15,
  status_breakdown: [{ status: "DELIVERED" as const, total: 8 }],
  schedule_breakdown: [{ schedule_flag: "ON_TIME" as const, total: 10 }],
  trend_data: [{ date: "2026-03-01", total: 5 }],
};

describe("AdminReportDashboard — Top Support Requests / Top Challenges (Phase 4)", () => {
  it("does not render the ranking widgets when no summary data is provided", () => {
    render(
      <AdminReportDashboard reports={[]} loading={false} adminStats={adminStats} />,
    );
    expect(screen.queryByText("Top Support Requests")).not.toBeInTheDocument();
    expect(screen.queryByText("Top Challenges")).not.toBeInTheDocument();
  });

  it("renders both ranked lists, ordered as given (backend already sorts descending)", () => {
    render(
      <AdminReportDashboard
        reports={[]}
        loading={false}
        adminStats={adminStats}
        supportRequestSummary={[
          { category_id: 2, label: "Technical / IT Support", total: 5 },
          { category_id: 3, label: "Infrastructure / Facilities", total: 2 },
        ]}
        challengeSummary={[
          { category_id: 10, label: "Electricity / Power", total: 6 },
        ]}
      />,
    );

    expect(screen.getByText("Top Support Requests")).toBeInTheDocument();
    expect(screen.getByText("Technical / IT Support")).toBeInTheDocument();
    expect(screen.getByText("Infrastructure / Facilities")).toBeInTheDocument();

    expect(screen.getByText("Top Challenges")).toBeInTheDocument();
    expect(screen.getByText("Electricity / Power")).toBeInTheDocument();
  });
});
