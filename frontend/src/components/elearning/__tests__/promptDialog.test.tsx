import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PromptDialog from "../ui/PromptDialog";
import WeekPeek from "../builder/WeekPeek";
import type { CourseSection } from "../../../api/elearning";

describe("PromptDialog", () => {
  const setup = (validate?: (v: string) => string | null) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <PromptDialog
        request={{ title: "Add a video", detail: "Paste a YouTube link.", placeholder: "https://youtu.be/…", confirmLabel: "Add video", validate }}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    return { onConfirm, onCancel };
  };

  it("is a real modal: labelled, autofocused, Enter confirms, Esc cancels", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = setup();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Add a video");
    const input = screen.getByPlaceholderText("https://youtu.be/…");
    await vi.waitFor(() => expect(input).toHaveFocus());
    await user.type(input, "https://youtu.be/abc{Enter}");
    expect(onConfirm).toHaveBeenCalledWith("https://youtu.be/abc");
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows validation inline instead of accepting a bad value", async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup((v) => (v.startsWith("http") ? null : "Start the address with http:// or https://"));
    await user.type(screen.getByRole("textbox"), "not-a-url");
    await user.click(screen.getByRole("button", { name: "Add video" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Start the address with http");
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("WeekPeek", () => {
  it("previews a week's dates, criteria coverage and items", () => {
    const section = {
      section_id: 2, course_id: 1, scheme_entry_id: 2, competency_id: null, title: "Week 2 — Intro to Web Pages",
      summary: null, position: 1, status: "SCHEDULED", unlock_at: null, requirement_type: "ALL", week_number: "Week 2",
      start_date: "2026-09-14", end_date: "2026-09-18", entry_status: "PLANNED", competency_title: "Design a web page",
      element_number: 1,
      criteria: [
        { criteria_id: 1, criteria_number: "1.1", description: "a", competency_id: 1 },
        { criteria_id: 2, criteria_number: "1.2", description: "b", competency_id: 1 },
      ],
      items: [{ item_id: 9, section_id: 2, item_type: "PAGE", ref_id: null, title: "New page", description: null, external_url: null, position: 0, indent: 0, is_published: 1, is_required: 1, completion_rule: "VIEW", min_score_pct: null, estimated_minutes: null, due_at: null, created_by: 1, created_at: "", updated_at: "", criteria: [{ criteria_id: 1, criteria_number: "1.1", description: "a", competency_id: 1 }], ref: null }],
    } as unknown as CourseSection;
    render(<WeekPeek section={section} anchor={{ top: 100, right: 300, left: 0, bottom: 160, width: 300, height: 60, x: 0, y: 100, toJSON: () => ({}) } as DOMRect} />);
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Week 2");
    expect(tip).toHaveTextContent("14 Sept – 18 Sept");
    expect(tip).toHaveTextContent("Intro to Web Pages");
    expect(tip).toHaveTextContent("Teaches · Element 1");
    expect(tip).toHaveTextContent("1 item");
    expect(tip).toHaveTextContent("New page");
  });

  it("renders nothing without an anchor", () => {
    const { container } = render(<WeekPeek section={null} anchor={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
