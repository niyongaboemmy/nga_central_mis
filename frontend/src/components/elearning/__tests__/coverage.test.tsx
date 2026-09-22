import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CoveragePanel from "../builder/CoveragePanel";

const get = vi.fn();
vi.mock("../../../services/api", () => ({ apiService: { get: (...a: any[]) => get(...a) } }));

describe("CoveragePanel", () => {
  it("shows planned → content → live per element and jumps to the week that plans a criterion", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({
      data: {
        data: {
          course_id: 3, targets_total: 3, targets_covered: 2, coverage_pct: 67, curriculum_total: 3, curriculum_covered: 2, curriculum_pct: 67, weeks_without_check: 1,
          sections: [
            { section_id: 10, title: "Week 1 — HTML", status: "PUBLISHED", element_number: 1, competency_title: "Structure", targets: [{ criteria_id: 1, criteria_number: "1.1", description: "a", competency_id: 1 }, { criteria_id: 2, criteria_number: "1.2", description: "b", competency_id: 1 }], covered: [], gaps: [], extra: [], has_check: false, items: 2 },
            { section_id: 11, title: "Week 2 — CSS", status: "SCHEDULED", element_number: 2, competency_title: "Style", targets: [{ criteria_id: 3, criteria_number: "2.1", description: "c", competency_id: 2 }], covered: [], gaps: [{ criteria_id: 3, criteria_number: "2.1", description: "c", competency_id: 2 }], extra: [], has_check: false, items: 0 },
          ],
          elements: [
            { competency_id: 1, element_number: 1, title: "Structure", total: 2, planned: 2, covered: 2, live: 2, criteria: [{ criteria_id: 1, criteria_number: "1.1", description: "a", planned: true, covered: true, live: true }, { criteria_id: 2, criteria_number: "1.2", description: "b", planned: true, covered: true, live: true }] },
            { competency_id: 2, element_number: 2, title: "Style", total: 1, planned: 1, covered: 0, live: 0, criteria: [{ criteria_id: 3, criteria_number: "2.1", description: "c", planned: true, covered: false, live: false }] },
          ],
        },
      },
    });
    const jump = vi.fn();
    render(<CoveragePanel courseId={3} onJumpToWeek={jump} />);
    expect((await screen.findAllByText("67%")).length).toBe(2); // planned-target % and whole-curriculum %
    expect(screen.getByText(/Element 2 · Style/)).toBeInTheDocument();
    expect(screen.getByLabelText("Element 2: 0 of 1 criteria covered")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2.1" }));
    expect(jump).toHaveBeenCalledWith(11);
    expect(get).toHaveBeenCalledWith("/elearning/courses/3/coverage");
  });
});
