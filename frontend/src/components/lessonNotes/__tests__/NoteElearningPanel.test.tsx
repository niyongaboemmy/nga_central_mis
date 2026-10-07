import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../../contexts/ToastContext";
import { ConfirmProvider } from "../../../contexts/ConfirmContext";
import NoteElearningPanel from "../elearning/NoteElearningPanel";

/** The note's e-learning panel: reach checklist with one-click fixes, week picker, readers, remove. */

const api = {
  noteElearning: vi.fn(),
  setNotePlacement: vi.fn(),
  removeNotePlacement: vi.fn(),
  updateItem: vi.fn(),
  updateSection: vi.fn(),
  updateCourse: vi.fn(),
};
const updateNote = vi.fn();

vi.mock("../../../api/elearning", async (orig) => ({
  ...(await orig<typeof import("../../../api/elearning")>()),
  elearningApi: new Proxy({}, { get: (_t, k: string) => (...a: unknown[]) => (api as any)[k](...a) }),
}));
vi.mock("../../../api/lessonNotes", async (orig) => ({
  ...(await orig<typeof import("../../../api/lessonNotes")>()),
  lessonNotesApi: { update: (...a: unknown[]) => updateNote(...a) },
}));

const week = (id: number, over: Partial<any> = {}) => ({
  section_id: id,
  title: `Week ${id} — Topic ${id}`,
  status: "PUBLISHED",
  unlock_at: null,
  start_date: "2026-10-05",
  end_date: "2026-10-09",
  item_count: 2,
  is_current: false,
  suggested: false,
  reason: null,
  ...over,
});

const blocked = () => ({
  note: { note_id: 10, title: "Flexbox", status: "PUBLISHED" },
  course: { course_id: 7, title: "Web UI", status: "DRAFT" },
  no_course_reason: null,
  placement: {
    item_id: 55,
    is_published: false,
    section_id: 2,
    section_title: "Week 2 — Topic 2",
    section_status: "HIDDEN",
    section_unlock_at: null,
    course_status: "DRAFT",
  },
  sections: [week(1, { is_current: true }), week(2, { status: "HIDDEN" }), week(3, { suggested: true, reason: "Covers 2 of the same curriculum targets" })],
  students: { members: 24, started: 6, completed: 3 },
  reach: {
    state: "BLOCKED",
    opens_at: null,
    blocker: "Hidden in the week",
    steps: [
      { key: "note", ok: true, label: "Note is published" },
      { key: "placed", ok: true, label: "On a course week" },
      { key: "item", ok: false, label: "Hidden in the week", fix: "show_item" },
      { key: "week", ok: false, label: "Week is hidden", fix: "publish_week" },
      { key: "course", ok: false, label: "Course is a draft", fix: "publish_course" },
    ],
  },
});

const renderPanel = (props: Partial<React.ComponentProps<typeof NoteElearningPanel>> = {}) => {
  const onChanged = vi.fn();
  render(
    <MemoryRouter>
      <ToastProvider>
        <ConfirmProvider>
          <NoteElearningPanel noteId={10} onClose={() => {}} onChanged={onChanged} {...props} />
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
  return { onChanged };
};

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  updateNote.mockReset();
  api.noteElearning.mockResolvedValue({ data: { data: blocked() } });
  api.updateItem.mockResolvedValue({});
  api.updateSection.mockResolvedValue({});
  api.updateCourse.mockResolvedValue({});
});

describe("NoteElearningPanel", () => {
  it("shows why the note isn't reaching students, step by step, with readers", async () => {
    renderPanel();
    const hero = await screen.findByTestId("reach-hero");
    expect(hero).toHaveTextContent("Not reaching students yet");
    expect(hero).toHaveTextContent("Week 2 — Topic 2");
    expect(within(hero).getByRole("button", { name: /Show to students/ })).toBeInTheDocument();
    expect(within(hero).getByRole("button", { name: /Publish week/ })).toBeInTheDocument();
    expect(within(hero).getByRole("button", { name: /Publish course/ })).toBeInTheDocument();
    expect(screen.getByTestId("note-readers")).toHaveTextContent("3 of 24 finished · 6 started");
    // where it is, and the suggested alternative
    expect(screen.getByRole("radio", { name: /Week 2 — Topic 2/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/Suggested — covers 2 of the same curriculum targets/)).toBeInTheDocument();
    expect(screen.getByText(/This week/)).toBeInTheDocument();
  });

  it("each fix calls the right endpoint and re-reads the state", async () => {
    const { onChanged } = renderPanel();
    await screen.findByTestId("reach-hero");

    await userEvent.click(screen.getByRole("button", { name: /Show to students/ }));
    await waitFor(() => expect(api.updateItem).toHaveBeenCalledWith(55, { is_published: true }));
    await waitFor(() => expect(api.noteElearning).toHaveBeenCalledTimes(2));
    expect(onChanged).toHaveBeenCalled();

    // publishing a week notifies students, so it asks first
    await userEvent.click(screen.getByRole("button", { name: /Publish week/ }));
    expect(await screen.findByText("Publish Week 2?")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Publish week" }).pop()!);
    await waitFor(() => expect(api.updateSection).toHaveBeenCalledWith(2, { status: "PUBLISHED" }));

    await userEvent.click(screen.getByRole("button", { name: /Publish course/ }));
    await userEvent.click((await screen.findAllByRole("button", { name: "Publish course" })).pop()!);
    await waitFor(() => expect(api.updateCourse).toHaveBeenCalledWith(7, { status: "PUBLISHED" }));
  });

  it("moves the note by picking another week", async () => {
    api.setNotePlacement.mockResolvedValue({ message: 'Moved to "Week 3 — Topic 3"', data: { data: { ...blocked(), placement: { ...blocked().placement, section_id: 3, section_title: "Week 3 — Topic 3" } } } });
    renderPanel();
    await userEvent.click(await screen.findByRole("radio", { name: /Week 3 — Topic 3/ }));
    await waitFor(() => expect(api.setNotePlacement).toHaveBeenCalledWith(10, 3));
    await waitFor(() => expect(screen.getByRole("radio", { name: /Week 3 — Topic 3/ })).toHaveAttribute("aria-checked", "true"));
  });

  it("removes the note from the course after confirming", async () => {
    api.removeNotePlacement.mockResolvedValue({ data: { data: { ...blocked(), placement: null, students: null, reach: { state: "OFF_COURSE", opens_at: null, blocker: null, steps: [] } } } });
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: /Remove from course/ }));
    expect(await screen.findByText("Take this note off the course?")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Remove from course" }).pop()!);
    await waitFor(() => expect(api.removeNotePlacement).toHaveBeenCalledWith(10));
    expect(await screen.findByText("Not on e-learning")).toBeInTheDocument();
  });

  it("lets the editor publish the note through its own save", async () => {
    const draft = blocked();
    draft.note.status = "DRAFT";
    draft.reach.steps[0] = { key: "note", ok: false, label: "Note is a draft", fix: "publish_note" } as any;
    api.noteElearning.mockResolvedValue({ data: { data: draft } });
    const onPublishNote = vi.fn().mockResolvedValue(undefined);
    renderPanel({ onPublishNote });
    await userEvent.click(await screen.findByRole("button", { name: /Publish note/ }));
    await waitFor(() => expect(onPublishNote).toHaveBeenCalled());
    expect(updateNote).not.toHaveBeenCalled();
  });

  it("explains when there is no course yet", async () => {
    api.noteElearning.mockResolvedValue({
      data: {
        data: {
          ...blocked(),
          course: null,
          placement: null,
          sections: [],
          students: null,
          no_course_reason: "There is no e-learning course for this subject and class yet.",
          reach: { state: "OFF_COURSE", opens_at: null, blocker: "Not on e-learning", steps: [] },
        },
      },
    });
    renderPanel();
    expect(await screen.findByText("There is no e-learning course for this subject and class yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Set up the course/ })).toHaveAttribute("href", "/elearning/courses");
  });
});
