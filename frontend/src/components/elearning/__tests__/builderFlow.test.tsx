import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NextStepBar from "../builder/NextStepBar";
import WeekList from "../builder/WeekList";
import type { CourseSection } from "../../../api/elearning";

const week = (over: Partial<CourseSection>): CourseSection => ({
  section_id: 1, course_id: 1, scheme_entry_id: 1, competency_id: null, title: "Week 1 — HTML", summary: null,
  position: 0, status: "SCHEDULED", unlock_at: null, requirement_type: "ALL", week_number: "Week 1",
  start_date: "2026-09-07", end_date: "2026-09-11", entry_status: "PLANNED", competency_title: null,
  element_number: null, criteria: [], items: [], ...over,
});

describe("NextStepBar", () => {
  it("shows one instruction with one primary action", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<NextStepBar step={{ id: "a", title: "Put something in Week 3", detail: "Add a lesson note.", action: { label: "Build it for me", onClick } }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Put something in Week 3");
    // Exactly one call to action, so there is never a choice about what to do next.
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]);
    expect(onClick).toHaveBeenCalled();
  });

  it("goes quiet when nothing is left to do", () => {
    render(<NextStepBar step={{ id: "b", title: "Everything is ready", tone: "done" }} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("Everything is ready");
  });
});

describe("WeekList", () => {
  it("marks today's week, flags gaps, and reports state without colour alone", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const sections = [
      week({ section_id: 1, week_number: "Week 1", status: "PUBLISHED", title: "Week 1 — HTML" }),
      week({ section_id: 2, week_number: "Week 2", title: "Week 2 — CSS", start_date: "2026-09-14", end_date: "2026-09-18",
        criteria: [{ criteria_id: 9, criteria_number: "2.1", description: "Selectors", competency_id: 1 }] }),
      week({ section_id: 3, week_number: "Week 3", status: "HIDDEN", title: "Week 3" }),
    ];
    render(<WeekList sections={sections} selected={2} onSelect={onSelect} todayIso="2026-09-16" />);
    expect(screen.getByLabelText("Live for students")).toBeInTheDocument();
    expect(screen.getByLabelText("Skipped")).toBeInTheDocument();
    expect(screen.getByText("Now")).toBeInTheDocument();
    // Week 3 has no topic in the scheme — the row says so instead of repeating the week name.
    expect(screen.getByText("No topic yet")).toBeInTheDocument();
    // Week 2's single criterion has no item behind it.
    expect(screen.getByTitle("1 planned criterion with no content yet")).toBeInTheDocument();
    await user.click(screen.getByText("Week 1"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
