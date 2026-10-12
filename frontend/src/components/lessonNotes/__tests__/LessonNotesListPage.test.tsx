import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../../contexts/ToastContext";
import { ConfirmProvider } from "../../../contexts/ConfirmContext";
import LessonNotesListPage from "../LessonNotesListPage";

const listMock = vi.fn();
const subjectsMock = vi.fn();
const placeMock = vi.fn();
const panelMock = vi.fn();
const removeMock = vi.fn();
// Props of every LessonNoteFormModal render — the modal itself is covered by its own test.
const modalProps: any[] = [];

vi.mock("../../../api/lessonNotes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/lessonNotes")>();
  return {
    ...actual,
    lessonNotesApi: {
      list: (...args: any[]) => listMock(...args),
      subjects: (...args: any[]) => subjectsMock(...args),
      remove: (...args: any[]) => removeMock(...args),
    },
  };
});

vi.mock("../../../api/elearning", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/elearning")>();
  return {
    ...actual,
    elearningApi: {
      noteElearning: (...args: any[]) => panelMock(...args),
      setNotePlacement: (...args: any[]) => placeMock(...args),
    },
  };
});

vi.mock("../../../hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

// The page scopes subjects to the year the app header is showing.
vi.mock("../../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => ({ selectedYearId: 9 }),
}));

vi.mock("../LessonNoteFormModal", () => ({
  default: (props: any) => {
    modalProps.push(props);
    return null;
  },
}));

const subject = (over: Partial<any> = {}) => ({
  subject_id: 1,
  subject_name: "Web3 Applications",
  subject_code: "SPEWI302",
  is_assigned: true,
  note_count: 2,
  published_count: 1,
  draft_count: 1,
  on_course_count: 1,
  last_updated: "2026-09-21T00:00:00.000Z",
  class_group_names: "L4. Class A",
  ...over,
});

const note = (over: Partial<any> = {}) => ({
  note_id: 10,
  subject_id: 1,
  subject_name: "Web3 Applications",
  class_group_id: 5,
  class_group_name: "L4. Class A",
  scheme_entry_id: null,
  title: "Blockchain basics",
  status: "PUBLISHED" as const,
  source: "MANUAL" as const,
  file_name: null,
  page_count: null,
  criteria_ids: [],
  share_count: 0,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-21T00:00:00.000Z",
  elearning: null,
  course_target: null,
  ...over,
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/lesson-notes"]}>
      <ToastProvider>
        <ConfirmProvider>
          <LessonNotesListPage />
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  );

describe("LessonNotesListPage — subject-first browsing and e-learning linkage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modalProps.length = 0;
    subjectsMock.mockResolvedValue({
      data: {
        data: [subject(), subject({ subject_id: 2, subject_name: "JavaScript", note_count: 1, on_course_count: 0 })],
      },
    });
    listMock.mockResolvedValue({ data: { data: [] } });
  });

  it("shows subjects, not notes, until one is chosen", async () => {
    renderPage();
    await screen.findByText("Web3 Applications");
    expect(screen.getByText("JavaScript")).toBeInTheDocument();
    // No note request should have been made — that's the point of the subject step.
    expect(listMock).not.toHaveBeenCalled();
  });

  it("loads only the chosen subject's notes after selecting it", async () => {
    listMock.mockResolvedValue({ data: { data: [note()] } });
    renderPage();
    await userEvent.click(await screen.findByText("Web3 Applications"));

    await waitFor(() => expect(listMock).toHaveBeenCalledWith({ subject_id: 1 }));
    expect(await screen.findByText("Blockchain basics")).toBeInTheDocument();
  });

  const reach = (state: string, over: Partial<any> = {}) => ({ state, opens_at: null, blocker: null, steps: [], ...over });
  const placed = { item_id: 1, is_published: true, section_id: 2, section_title: "Week 3 — Wallets", section_status: "PUBLISHED", section_unlock_at: null, course_id: 7, course_title: "Web3 Applications", course_status: "PUBLISHED" };
  const panelData = (over: Partial<any> = {}) => ({
    note: { note_id: 10, title: "Blockchain basics", status: "PUBLISHED" },
    course: { course_id: 7, title: "Web3 Applications", status: "PUBLISHED" },
    no_course_reason: null,
    placement: null,
    sections: [
      { section_id: 1, title: "Week 2 — Keys", status: "PUBLISHED", unlock_at: null, start_date: null, end_date: null, item_count: 2, is_current: true, suggested: false, reason: null },
      { section_id: 2, title: "Week 3 — Wallets", status: "PUBLISHED", unlock_at: null, start_date: null, end_date: null, item_count: 1, is_current: false, suggested: true, reason: "The note was written for this week" },
    ],
    students: null,
    reach: { state: "OFF_COURSE", opens_at: null, blocker: "Not on e-learning", steps: [{ key: "note", ok: true, label: "Note is published" }, { key: "placed", ok: false, label: "Not on a course week", fix: "place" }] },
    ...over,
  });

  it("opens the e-learning panel from an unlinked note and places it in the suggested week", async () => {
    listMock.mockResolvedValue({
      data: { data: [note({ course_target: { course_id: 7, title: "Web3 Applications", status: "PUBLISHED" }, reach: reach("OFF_COURSE") })] },
    });
    panelMock.mockResolvedValue({ data: { data: panelData() } });
    placeMock.mockResolvedValue({
      data: {
        message: 'Added to "Week 3 — Wallets"',
        data: panelData({
          placement: placed,
          students: { members: 20, started: 0, completed: 0 },
          reach: { state: "LIVE", opens_at: null, blocker: null, steps: [] },
        }),
      },
    });

    renderPage();
    await userEvent.click(await screen.findByText("Web3 Applications"));
    // Exact name: the note card is itself a button whose name contains the chip's text.
    await userEvent.click(await screen.findByRole("button", { name: "Add to e-learning" }));

    const panel = await screen.findByTestId("note-elearning-panel");
    expect(panelMock).toHaveBeenCalledWith(10);
    expect(await within(panel).findByText(/Suggested — the note was written for this week/)).toBeInTheDocument();
    // Placement is a choice now, not a blind guess: the suggested week is one click away.
    await userEvent.click(within(panel).getByRole("button", { name: /Add to suggested week/ }));
    await waitFor(() => expect(placeMock).toHaveBeenCalledWith(10, 2));

    // The row updates in place from the panel's answer.
    expect(await screen.findByText("Live · Week 3")).toBeInTheDocument();
    expect(within(panel).getByText("0 of 20 finished · 0 started")).toBeInTheDocument();
  });

  it("says whether placed notes actually reach students, and why not", async () => {
    listMock.mockResolvedValue({
      data: {
        data: [
          note({ note_id: 10, title: "Live note", elearning: placed, reach: reach("LIVE") }),
          note({
            note_id: 11,
            title: "Hidden week note",
            elearning: { ...placed, section_status: "HIDDEN" },
            reach: reach("BLOCKED", { blocker: "Week is hidden" }),
          }),
        ],
      },
    });

    renderPage();
    await userEvent.click(await screen.findByText("Web3 Applications"));
    await screen.findByText("Live note");
    expect(screen.getByText("Live · Week 3")).toBeInTheDocument();
    expect(screen.getByText("Week 3 · Week is hidden")).toBeInTheDocument();
    // Placed is not the same as reaching students.
    expect(screen.getByText("1 of 2 reaching students")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1 needs attention/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to e-learning" })).not.toBeInTheDocument();
  });

  it("filters notes by reach: needing attention, not on e-learning", async () => {
    listMock.mockResolvedValue({
      data: {
        data: [
          note({ note_id: 10, title: "Live note", elearning: placed, reach: reach("LIVE") }),
          note({ note_id: 11, title: "Blocked note", elearning: placed, reach: reach("BLOCKED", { blocker: "Course is a draft" }) }),
          note({ note_id: 12, title: "Unlinked note", reach: reach("OFF_COURSE") }),
        ],
      },
    });

    renderPage();
    await userEvent.click(await screen.findByText("Web3 Applications"));
    await screen.findByText("Live note");

    await userEvent.click(screen.getByRole("button", { name: "Needs attention" }));
    expect(screen.queryByText("Live note")).not.toBeInTheDocument();
    expect(screen.getByText("Blocked note")).toBeInTheDocument();
    expect(screen.queryByText("Unlinked note")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Not on e-learning" }));
    expect(screen.getByText("Unlinked note")).toBeInTheDocument();
    expect(screen.queryByText("Blocked note")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reaching students" }));
    expect(screen.getByText("Live note")).toBeInTheDocument();
    expect(screen.queryByText("Unlinked note")).not.toBeInTheDocument();
  });

  it("lists an assigned subject that has no notes yet, as a way in", async () => {
    subjectsMock.mockResolvedValue({
      data: {
        data: [
          subject(),
          subject({
            subject_id: 3,
            subject_name: "Database Systems",
            subject_code: "SPDB201",
            note_count: 0,
            published_count: 0,
            draft_count: 0,
            on_course_count: 0,
            last_updated: null,
          }),
        ],
      },
    });

    renderPage();
    expect(await screen.findByText("Database Systems")).toBeInTheDocument();
    expect(screen.getByText("No notes yet — start one")).toBeInTheDocument();
    // 1 of 2 subjects has notes.
    expect(screen.getByText("1/2 subjects started")).toBeInTheDocument();
  });

  it("filters the subject grid down to the ones not started", async () => {
    subjectsMock.mockResolvedValue({
      data: {
        data: [
          subject(),
          subject({ subject_id: 3, subject_name: "Database Systems", note_count: 0, draft_count: 0, published_count: 0, on_course_count: 0, last_updated: null }),
        ],
      },
    });

    renderPage();
    await screen.findByText("Web3 Applications");

    await userEvent.click(screen.getByRole("button", { name: "Not started" }));
    expect(screen.queryByText("Web3 Applications")).not.toBeInTheDocument();
    expect(screen.getByText("Database Systems")).toBeInTheDocument();
  });

  it("marks a subject the teacher no longer teaches, rather than hiding its notes", async () => {
    subjectsMock.mockResolvedValue({
      data: { data: [subject(), subject({ subject_id: 4, subject_name: "Legacy Subject", is_assigned: false })] },
    });

    renderPage();
    expect(await screen.findByText("Legacy Subject")).toBeInTheDocument();
    expect(screen.getByText("Past subject")).toBeInTheDocument();
  });

  it("opens the edit form for a note from its Edit button, without opening the editor", async () => {
    listMock.mockResolvedValue({ data: { data: [note()] } });
    renderPage();
    await userEvent.click(await screen.findByText("Web3 Applications"));

    await userEvent.click(await screen.findByRole("button", { name: "Edit Blockchain basics" }));
    await waitFor(() =>
      expect(modalProps.some((p) => p.isOpen && p.noteId === 10 && typeof p.onDeleted === "function")).toBe(true),
    );
    // Still on the list: the card's own click (open editor) didn't fire.
    expect(screen.getByRole("button", { name: /all subjects/i })).toBeInTheDocument();
  });

  it("re-reads the list after the edit form saves (the note may have changed subject)", async () => {
    listMock.mockResolvedValue({ data: { data: [note()] } });
    renderPage();
    await userEvent.click(await screen.findByText("Web3 Applications"));
    await userEvent.click(await screen.findByRole("button", { name: "Edit Blockchain basics" }));

    const editProps = modalProps.filter((p) => p.noteId === 10).pop();
    listMock.mockResolvedValue({ data: { data: [] } });
    editProps.onSaved({});
    await waitFor(() => expect(screen.queryByText("Blockchain basics")).not.toBeInTheDocument());
  });

  it("deletes a note after confirming, warning that it leaves the course too", async () => {
    listMock.mockResolvedValue({
      data: {
        data: [
          note({
            elearning: { item_id: 1, is_published: true, section_id: 2, section_title: "Week 3 — Wallets", course_id: 7, course_title: "Web3 Applications", course_status: "PUBLISHED" },
          }),
        ],
      },
    });
    removeMock.mockResolvedValue({ data: { data: { removed_course_items: 1 } } });
    renderPage();
    await userEvent.click(await screen.findByText("Web3 Applications"));

    await userEvent.click(await screen.findByRole("button", { name: "Delete Blockchain basics" }));
    expect(await screen.findByText("Delete lesson note?")).toBeInTheDocument();
    expect(screen.getByText(/removed from the "Web3 Applications" e-learning course/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete note" }));

    await waitFor(() => expect(removeMock).toHaveBeenCalledWith(10));
    await waitFor(() => expect(screen.queryByText("Blockchain basics")).not.toBeInTheDocument());
  });

  it("keeps the note when the delete is cancelled", async () => {
    listMock.mockResolvedValue({ data: { data: [note()] } });
    renderPage();
    await userEvent.click(await screen.findByText("Web3 Applications"));

    await userEvent.click(await screen.findByRole("button", { name: "Delete Blockchain basics" }));
    await userEvent.click(await screen.findByRole("button", { name: /cancel/i }));

    expect(removeMock).not.toHaveBeenCalled();
    expect(screen.getByText("Blockchain basics")).toBeInTheDocument();
  });
});
