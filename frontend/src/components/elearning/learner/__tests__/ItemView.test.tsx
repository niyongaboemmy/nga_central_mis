import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ItemView from "../ItemView";
import type { OpenedItem } from "../../../../api/elearning";

// jsdom implements neither of these; the reader only uses them for polish (the
// scroll-linked progress bar and the reveal of the end-of-lesson card).
(globalThis as any).IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
};

// The note reader is a whole page of its own; these tests are about the shared chrome.
vi.mock("../../../lessonNotes/SharedLessonNoteViewPage", () => ({ default: () => null }));
vi.mock("../KnowledgeCheckCard", () => ({ default: () => null }));

const item = (over: Partial<any> = {}) => ({
  item_id: 11,
  section_id: 5,
  item_type: "PAGE",
  ref_id: null,
  title: "Data Types and Type Conversion",
  description: null,
  external_url: null,
  position: 0,
  indent: 0,
  is_published: 1,
  is_required: 1,
  completion_rule: "VIEW",
  min_score_pct: null,
  estimated_minutes: 12,
  due_at: null,
  created_by: 9,
  created_at: "",
  updated_at: "",
  criteria: [{ criteria_id: 1, criteria_number: "1.1", description: "Name the 8 data types" }],
  ref: null,
  state: "IN_PROGRESS",
  completed_at: null,
  best_score_pct: null,
  seconds_spent: 0,
  last_position: null,
  locked: false,
  ...over,
});

const opened = (over: Partial<any> = {}): OpenedItem =>
  ({
    item: item(over.item as any),
    just_completed: false,
    content: { content_html: "<h2>2.1 Dynamically typed</h2><p>Body</p>" },
    section: { section_id: 5, title: "Week 3 — Data Types and Type Conversion", state: "started" },
    course: { course_id: 4, title: "JS", subject_name: "JS", cover_color: null, icon: null },
    prev: null,
    next: null,
    locked: false,
    ...over,
  }) as any;

describe("ItemView — the lesson reader", () => {
  it("tells the reader where they are in the week", async () => {
    render(<ItemView opened={opened()} onBack={vi.fn()} step={{ index: 2, total: 5 }} />);

    expect(screen.getByText("Step 2 of 5")).toBeInTheDocument();
    // The week is a back link above the type line ("← Week 3 — …").
    expect(screen.getByRole("button", { name: /Week 3 — Data Types and Type Conversion/ })).toBeInTheDocument();
  });

  it("shows how long the step takes and what it teaches", () => {
    render(<ItemView opened={opened()} onBack={vi.fn()} />);

    expect(screen.getByText("12 min read")).toBeInTheDocument();
    expect(screen.getByText("What this teaches you")).toBeInTheDocument();
    expect(screen.getByText(/Name the 8 data types/)).toBeInTheDocument();
  });

  it("offers the next step at the bottom instead of ending in nothing", async () => {
    const onNext = vi.fn();
    render(
      <ItemView
        opened={opened({
          next: { item_id: 12, title: "javascript.info/", item_type: "LINK", locked: false, section_id: 5 },
        })}
        onBack={vi.fn()}
        onNext={onNext}
      />,
    );

    expect(screen.getByText("End of this step")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /javascript\.info/ }));
    expect(onNext).toHaveBeenCalled();
  });

  it("sends the reader back to the week when it was the last step", async () => {
    const onBack = vi.fn();
    render(<ItemView opened={opened()} onBack={onBack} />);

    expect(screen.getByText("That was the last step of this week")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /See the week/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it("names the destination of an external link rather than showing a bare button", () => {
    render(
      <ItemView
        opened={opened({
          item: item({ item_type: "LINK", title: "javascript.info/", estimated_minutes: null, completion_rule: "MARK_DONE" }),
          content: { external_url: "https://javascript.info/types" },
        })}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("javascript.info")).toBeInTheDocument();
    expect(screen.getByText(/opens javascript\.info in a new tab/i)).toBeInTheDocument();
    expect(screen.getByText(/mark it done when you've read it/i)).toBeInTheDocument();
  });

  it("opens an immersive reader that covers the app, and leaves it on Esc", async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    (document.documentElement as any).requestFullscreen = requestFullscreen;

    render(<ItemView opened={opened()} onBack={vi.fn()} step={{ index: 1, total: 3 }} />);

    await userEvent.click(screen.getByRole("button", { name: /Focus mode/i }));

    const shell = screen.getByRole("region", { name: /Focus mode/i });
    expect(shell).toBeInTheDocument();
    expect(shell.className).toMatch(/fixed inset-0/);
    // Real fullscreen is requested where the browser allows it.
    expect(requestFullscreen).toHaveBeenCalled();
    // The reader still says where the student is.
    expect(screen.getByText("1 of 3 in this week")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: /Focus mode/i })).not.toBeInTheDocument();
  });

  it("still works when the browser refuses fullscreen", async () => {
    (document.documentElement as any).requestFullscreen = vi
      .fn()
      .mockRejectedValue(new Error("denied"));

    render(<ItemView opened={opened()} onBack={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Focus mode/i }));

    // The overlay alone is already the focused view — a refusal must not undo it.
    expect(screen.getByRole("region", { name: /Focus mode/i })).toBeInTheDocument();
  });

  it("lets the reader resize the text, and remembers it", async () => {
    localStorage.clear();
    const { unmount } = render(<ItemView opened={opened()} onBack={vi.fn()} />);

    // The reader opens at 100% (16px body) — readable by default, and not the floor.
    expect(screen.getByText("100%")).toBeInTheDocument();

    const bigger = screen.getByRole("button", { name: /Larger text/i });
    await userEvent.click(bigger);
    await userEvent.click(bigger);
    expect(screen.getByText("120%")).toBeInTheDocument();

    // Preference is per-device and shared with the lesson-note reader.
    unmount();
    render(<ItemView opened={opened()} onBack={vi.fn()} />);
    expect(screen.getByText("120%")).toBeInTheDocument();
  });

  it("will not shrink the text past the floor", async () => {
    localStorage.clear();
    render(<ItemView opened={opened()} onBack={vi.fn()} />);
    const smaller = screen.getByRole("button", { name: /Smaller text/i });
    for (let i = 0; i < 10; i += 1) {
      if (!(smaller as HTMLButtonElement).disabled) await userEvent.click(smaller);
    }
    // The floor sits below the 80% default, so A− still has somewhere to go.
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(smaller).toBeDisabled();
  });

  it("offers a reading background, and applies it to the step", async () => {
    localStorage.clear();
    const { container } = render(<ItemView opened={opened()} onBack={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /Reading settings/i }));
    await userEvent.click(screen.getByRole("button", { name: /Sepia/i }));

    expect(container.querySelector(".el-step--sepia")).toBeTruthy();
  });

  it("keeps the AI tutor reachable inside focus mode", async () => {
    localStorage.clear();
    (document.documentElement as any).requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const onAskAI = vi.fn();
    render(<ItemView opened={opened()} onBack={vi.fn()} onAskAI={onAskAI} />);

    await userEvent.click(screen.getByRole("button", { name: /Focus mode/i }));
    // The overlay covers the page-level tutor button, so the overlay carries its own.
    await userEvent.click(screen.getByRole("button", { name: /Ask the AI tutor/i }));
    expect(onAskAI).toHaveBeenCalled();
  });

  it("marks a finished step as done in the header", () => {
    render(<ItemView opened={opened({ item: item({ state: "COMPLETED" }) })} onBack={vi.fn()} />);
    expect(screen.getByText("Done")).toBeInTheDocument();
  });
});
