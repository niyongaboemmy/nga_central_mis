import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MasteryHeatmap from "../builder/MasteryHeatmap";

const get = vi.fn();
vi.mock("../../../services/api", () => ({ apiService: { get: (...a: any[]) => get(...a) } }));

describe("MasteryHeatmap", () => {
  it("renders criteria columns grouped by element, with glyph + label per cell (never colour alone)", async () => {
    get.mockResolvedValue({
      data: {
        data: {
          criteria_total: 2,
          unaligned_criteria: 1,
          elements: [{ competency_id: 1, element_number: 1, title: "Apply CSS layout", criteria: [{ criteria_id: 11, criteria_number: "1.1", description: "Selectors" }, { criteria_id: 12, criteria_number: "1.2", description: "Box model" }] }],
          columns: [
            { criteria_id: 11, criteria_number: "1.1", description: "Selectors", competency_id: 1, aligned_items: 1, covered_pct: 100, demonstrated_pct: 0 },
            { criteria_id: 12, criteria_number: "1.2", description: "Box model", competency_id: 1, aligned_items: 0, covered_pct: 0, demonstrated_pct: 0 },
          ],
          students: [{ user_id: 5, name: "Aline", states: { 11: "COVERED", 12: "NOT_COVERED" }, covered: 1, demonstrated: 0 }],
        },
      },
    });
    render(<MasteryHeatmap courseId={3} basePath="/elearning/admin/courses" />);
    expect(await screen.findByText(/E1 · Apply CSS layout/)).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/elearning/admin/courses/3/mastery");
    expect(screen.getByLabelText("1.1 Covered")).toBeInTheDocument();
    expect(screen.getByLabelText("1.2 Not yet")).toBeInTheDocument();
    expect(screen.getByText(/1 with no aligned item yet/)).toBeInTheDocument();
  });
});
