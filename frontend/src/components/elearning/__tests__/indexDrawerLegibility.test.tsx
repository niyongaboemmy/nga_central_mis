import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import IndexDrawer from "../learner/IndexDrawer";

// jsdom has no layout, so it has no scrollIntoView; the drawer scrolls the
// current week into view on mount.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// Two regressions this file exists to prevent:
//
//  1. Completion was signalled by fading the label to gray-400. That is 2.5:1
//     on white — under AA — and once a student finished a course *every* row
//     was faded, so the whole index became unreadable.
//  2. The selected item and the active week were both brand-tinted, so the one
//     row the reader was actually on did not stand out from its own section.

const item = (over: Partial<any> = {}): any => ({
  item_id: 1,
  title: "Lesson Introduction",
  item_type: "LESSON_NOTE",
  state: "COMPLETED",
  locked: false,
  indent: 0,
  estimated_minutes: 10,
  ...over,
});

const section = (over: Partial<any> = {}): any => ({
  section_id: 5,
  title: "Week 3 — Data Types and Type Conversion",
  week_number: "Week 3",
  start_date: "2026-09-21",
  end_date: "2026-09-25",
  state: "completed",
  is_current_week: true,
  required_done: 3,
  required_total: 3,
  items: [item(), item({ item_id: 2, title: "Data Types" })],
  ...over,
});

const course = (over: Partial<any> = {}): any => ({
  course: { course_id: 4, cover_color: "#a3c93a" },
  subject: { name: "Web Application Development", color: null },
  teacher: { name: "Niyongabo Emmanuel" },
  summary: {
    percent: 100,
    required_done: 5,
    required_total: 5,
    criteria_covered: 2,
    criteria_total: 2,
  },
  sections: [section()],
  ...over,
});

const renderDrawer = (props: Partial<any> = {}) =>
  render(
    <IndexDrawer
      course={course()}
      activeItemId={1}
      activeSectionId={5}
      onOpenItem={vi.fn()}
      onOpenSection={vi.fn()}
      open
      onClose={vi.fn()}
      {...props}
    />,
  );

/** The rendered element carrying an item's label, whichever wrapper it is in. */
const itemButton = (title: string) =>
  screen.getAllByText(title)[0].closest("button")!;

describe("IndexDrawer legibility", () => {
  it("does not fade a finished item's label", () => {
    renderDrawer({ activeItemId: 2 });
    // gray-400 was the class that made a completed course unreadable.
    expect(itemButton("Lesson Introduction").className).not.toMatch(
      /text-gray-400(?!\s*dark)/,
    );
  });

  it("keeps a finished week's title at full contrast", () => {
    renderDrawer();
    const topic = screen.getAllByText("Data Types and Type Conversion")[0];
    expect(topic.className).not.toContain("text-gray-400");
    expect(topic.className).not.toContain("text-gray-500");
  });

  it("pairs every muted class with a dark-mode counterpart", () => {
    // gray-400 is legible on the dark surface and not on the light one, so it
    // may only ever appear as `dark:text-gray-400`.
    const { container } = renderDrawer();
    const offenders = Array.from(container.querySelectorAll("*")).filter(
      (el) =>
        /(^|\s)text-gray-400(\s|$)/.test((el as HTMLElement).className || ""),
    );
    expect(offenders).toHaveLength(0);
  });

  it("marks the open item as the current page", () => {
    renderDrawer({ activeItemId: 2 });
    expect(itemButton("Data Types")).toHaveAttribute("aria-current", "page");
    expect(itemButton("Lesson Introduction")).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("gives the open item a filled row the other rows do not have", () => {
    renderDrawer({ activeItemId: 2 });
    expect(itemButton("Data Types").className).toContain("bg-brand-500");
    expect(itemButton("Lesson Introduction").className).not.toContain(
      "bg-brand-500",
    );
  });
});
