import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CompletionDot, ProgressRing, WeekPill } from "../ui/primitives";
import IndexDrawer from "../learner/IndexDrawer";
import type { LearnerCourse } from "../../../api/elearning";

// jsdom has no ResizeObserver / scrollIntoView — the components only use them for polish.
(globalThis as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView = vi.fn();

const course: LearnerCourse = {
  course: {
    course_id: 1, scheme_id: 1, subject_id: 1, class_group_id: 1, academic_term_id: 1, owner_user_id: 9,
    title: "Web UI — L5 SOD A — Term 1", description: null, cover_color: "#3b6cff", icon: null, status: "PUBLISHED",
    require_sequential_progress: 0, auto_publish_from_scheme: 1, created_at: "", updated_at: "",
  },
  subject: { subject_id: 1, name: "Web UI", code: "WEBUI", color: "#3b6cff" },
  class_group: { class_group_id: 1, name: "L5 SOD A" },
  term: { academic_term_id: 1, name: "Term 1", start_date: null, end_date: null },
  teacher: { user_id: 9, name: "Mr Niyongabo" },
  summary: {
    percent: 33, required_total: 3, required_done: 1, overdue_count: 0, due_soon: [],
    current_section: { section_id: 2, title: "Week 2 — CSS", state: "started" },
    next_item: null, resume_item: null, sections_completed: 1, sections_total: 2, near_goal: [], criteria_total: 0, criteria_covered: 0,
  },
  sections: [
    {
      section_id: 1, course_id: 1, scheme_entry_id: 11, competency_id: null, title: "Week 1 — HTML", summary: null, position: 0,
      status: "PUBLISHED", unlock_at: null, requirement_type: "ALL", week_number: "Week 1", start_date: "2026-09-07", end_date: "2026-09-11",
      entry_status: "COMPLETED", state: "completed", required_total: 1, required_done: 1, is_current_week: false, lock_reason: null,
      competency_title: null, element_number: null, criteria: [], criteria_progress: [],
      items: [
        { item_id: 101, section_id: 1, item_type: "LESSON_NOTE", ref_id: 5, title: "HTML elements", description: null, external_url: null, position: 0, indent: 0,
          is_published: 1, is_required: 1, completion_rule: "VIEW", min_score_pct: null, estimated_minutes: 8, due_at: null, created_by: 9, created_at: "", updated_at: "",
          criteria: [], ref: { status: "PUBLISHED" }, state: "COMPLETED", completed_at: "2026-09-08", best_score_pct: null, seconds_spent: 300, last_position: null, locked: false },
      ],
    },
    {
      section_id: 2, course_id: 1, scheme_entry_id: 12, competency_id: null, title: "Week 2 — CSS", summary: null, position: 1,
      status: "PUBLISHED", unlock_at: null, requirement_type: "ALL", week_number: "Week 2", start_date: "2026-09-14", end_date: "2026-09-18",
      entry_status: "PLANNED", state: "started", required_total: 2, required_done: 0, is_current_week: true, lock_reason: null,
      competency_title: null, element_number: null, criteria: [], criteria_progress: [],
      items: [
        { item_id: 201, section_id: 2, item_type: "HEADER", ref_id: null, title: "Reading", description: null, external_url: null, position: 0, indent: 0,
          is_published: 1, is_required: 0, completion_rule: "NONE", min_score_pct: null, estimated_minutes: null, due_at: null, created_by: 9, created_at: "", updated_at: "",
          criteria: [], ref: null, state: "NOT_STARTED", completed_at: null, best_score_pct: null, seconds_spent: 0, last_position: null, locked: false },
        { item_id: 202, section_id: 2, item_type: "LESSON_NOTE", ref_id: 6, title: "CSS selectors", description: null, external_url: null, position: 1, indent: 0,
          is_published: 1, is_required: 1, completion_rule: "VIEW", min_score_pct: null, estimated_minutes: 10, due_at: null, created_by: 9, created_at: "", updated_at: "",
          criteria: [], ref: { status: "PUBLISHED" }, state: "IN_PROGRESS", completed_at: null, best_score_pct: null, seconds_spent: 60, last_position: null, locked: false },
        { item_id: 203, section_id: 2, item_type: "SUBJECT_DOCUMENT", ref_id: 7, title: "Cheat sheet.pdf", description: null, external_url: null, position: 2, indent: 0,
          is_published: 1, is_required: 1, completion_rule: "MARK_DONE", min_score_pct: null, estimated_minutes: null, due_at: null, created_by: 9, created_at: "", updated_at: "",
          criteria: [], ref: { mime_type: "application/pdf" }, state: "NOT_STARTED", completed_at: null, best_score_pct: null, seconds_spent: 0, last_position: null, locked: true },
      ],
    },
  ],
};

describe("ProgressRing", () => {
  it("exposes its value to assistive tech and clamps out-of-range input", () => {
    render(<ProgressRing value={140} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveTextContent("100%");
  });
});

describe("CompletionDot / WeekPill", () => {
  it("never relies on colour alone — state is in the label", () => {
    render(
      <>
        <CompletionDot state="COMPLETED" />
        <CompletionDot state="NOT_STARTED" locked />
        <WeekPill weekNumber="Week 4" startDate="2026-09-21" endDate="2026-09-25" current />
      </>,
    );
    expect(screen.getByLabelText("Done")).toBeInTheDocument();
    expect(screen.getByLabelText("Locked")).toBeInTheDocument();
    expect(screen.getByText("(this week)")).toBeInTheDocument();
  });
});

describe("IndexDrawer", () => {
  const setup = () => {
    const onOpenItem = vi.fn();
    const onOpenSection = vi.fn();
    render(
      <MemoryRouter>
        <IndexDrawer course={course} activeItemId={202} activeSectionId={2} onOpenItem={onOpenItem} onOpenSection={onOpenSection} open onClose={() => undefined} />
      </MemoryRouter>,
    );
    return { onOpenItem, onOpenSection };
  };

  it("expands the current week, collapses the rest, and marks the open item as current", () => {
    setup();
    const nav = screen.getAllByRole("navigation", { name: "Course index" })[0];
    expect(within(nav).getByLabelText("Collapse Week 2 — CSS")).toHaveAttribute("aria-expanded", "true");
    expect(within(nav).getByLabelText("Expand Week 1 — HTML")).toHaveAttribute("aria-expanded", "false");
    expect(within(nav).getByRole("button", { name: /CSS selectors/ })).toHaveAttribute("aria-current", "page");
    // Locked items can't be opened.
    expect(within(nav).getByRole("button", { name: /Cheat sheet/ })).toBeDisabled();
  });

  it("is keyboard operable: tab to a week, Enter expands it, Enter on an item opens it", async () => {
    const user = userEvent.setup();
    const { onOpenItem } = setup();
    const nav = screen.getAllByRole("navigation", { name: "Course index" })[0];
    const expand = within(nav).getByLabelText("Expand Week 1 — HTML");
    expand.focus();
    await user.keyboard("{Enter}");
    expect(within(nav).getByLabelText("Collapse Week 1 — HTML")).toBeInTheDocument();
    const item = within(nav).getByRole("button", { name: /HTML elements/ });
    item.focus();
    await user.keyboard("{Enter}");
    expect(onOpenItem).toHaveBeenCalledWith(101);
  });
});
