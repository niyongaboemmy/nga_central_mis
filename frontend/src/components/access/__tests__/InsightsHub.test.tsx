import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InsightsHub from "../InsightsHub";
import { __resetAccessStore } from "../../../hooks/useAccess";

const api = vi.hoisted(() => ({ me: vi.fn(), insightWidgets: vi.fn(), insight: vi.fn() }));
vi.mock("../../../api/access", async (orig) => ({
  ...(await orig<typeof import("../../../api/access")>()),
  accessApi: api,
}));
vi.mock("../../../contexts/ThemeContext", () => ({ useTheme: () => ({ theme: "light" }) }));

const snap = {
  v: 1, app: "mis", core: "1.0.0", user: { id: 1, persona: "ADMIN", school_id: 1 }, year: 5,
  caps: { VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST: [{ depth: "summary", scope: { all: true }, via: [9] }] },
  grants: { "9": { role: "Academic Insights Viewer", role_id: 20, title: null, scope_type: "SCHOOL", scope_id: null, scope_id2: null, valid_until: null } },
  home: "insights:SCHOOL", systems: [], generated_at: "",
};
const result = (node: string, groupBy: string, rows: any[]) => ({
  metric: "curriculum.sow_validation", label: "Schemes of work validated", unit: "%", node, groupBy,
  depth: "summary", min_cohort: 5, rows, total: { value: 50, n: 8, suppressed: false },
});

beforeEach(() => {
  __resetAccessStore();
  localStorage.setItem("token", "t");
  Object.values(api).forEach((f) => f.mockReset());
  api.me.mockResolvedValue(snap);
  api.insightWidgets.mockResolvedValue([{ app: "mis", app_label: "Central MIS", metric: "curriculum.sow_validation", label: "Schemes of work validated", source: "mis" },
    { app: "da", app_label: "Discipline & Attendance", metric: "attendance.rate", label: "Attendance rate", source: "app" }]);
});

describe("Insights hub", () => {
  it("shows summaries, hides small groups, and drills from programme to grade", async () => {
    api.insight.mockImplementation((_m: string, node: string) =>
      Promise.resolve(
        node === "SCHOOL"
          ? result("SCHOOL", "PROGRAM", [
              { key: 2, label: "Primary", value: 66.7, n: 6, suppressed: false },
              { key: 3, label: "IGCSE", value: null, n: 2, suppressed: true },
            ])
          : result(node, "GRADE", [{ key: 11, label: "Grade 4", value: 70, n: 10, suppressed: false }]),
      ),
    );
    render(<InsightsHub />);
    expect(await screen.findByText("66.7%")).toBeInTheDocument();
    expect(screen.getByText("<5")).toBeInTheDocument();
    expect(screen.getByText("More views you will get from the other apps")).toBeInTheDocument();
    expect(screen.getByText("Attendance rate")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Primary"));
    await waitFor(() => expect(api.insight).toHaveBeenLastCalledWith("curriculum.sow_validation", "PROGRAM:2"));
    expect(await screen.findByText("Grade 4")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Whole school");
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("Primary");
  });

  it("says so when there is nothing to show", async () => {
    api.insightWidgets.mockResolvedValue([]);
    render(<InsightsHub />);
    expect(await screen.findByText(/No insights for you at this level/)).toBeInTheDocument();
  });
});
