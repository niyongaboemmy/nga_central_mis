import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../../contexts/ToastContext";
import LessonNotesListPage from "../LessonNotesListPage";

const listMock = vi.fn();
const subjectsMock = vi.fn();
const placeMock = vi.fn();

vi.mock("../../../api/lessonNotes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/lessonNotes")>();
  return {
    ...actual,
    lessonNotesApi: {
      list: (...args: any[]) => listMock(...args),
      subjects: (...args: any[]) => subjectsMock(...args),
      remove: vi.fn(),
    },
  };
});

vi.mock("../../../api/elearning", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/elearning")>();
  return {
    ...actual,
    elearningApi: { placeNoteOnCourse: (...args: any[]) => placeMock(...args) },
  };
});

vi.mock("../../../hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

vi.mock("../NewLessonNoteModal", () => ({ default: () => null }));

const subject = (over: Partial<any> = {}) => ({
  subject_id: 1,
  subject_name: "Web3 Applications",
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
        <LessonNotesListPage />
      </ToastProvider>
    </MemoryRouter>,
  );

describe("LessonNotesListPage — subject-first browsing and e-learning linkage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subjectsMock.mockResolvedValue({ data: { data: [subject(), subject({ subject_id: 2, subject_name: "JavaScript", note_count: 1, on_course_count: 0 })] } });
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

  it("marks an unlinked note and places it on the course in one click", async () => {
    listMock.mockResolvedValue({
      data: { data: [note({ course_target: { course_id: 7, title: "Web3 Applications", status: "DRAFT" } })] },
    });
    placeMock.mockResolvedValue({
      data: { data: { item_id: 1, section_id: 2, section_title: "Week 3 — Wallets", course_id: 7, already_placed: false } },
    });

    renderPage();
    await userEvent.click(await screen.findByText("Web3 Applications"));

    // Exact name: the note card is itself a button, and its accessible name contains
    // the chip's text.
    const addBtn = await screen.findByRole("button", { name: "Add to e-learning" });
    await userEvent.click(addBtn);

    await waitFor(() => expect(placeMock).toHaveBeenCalledWith(10));
    // The list is re-read from the server, which decides the section.
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
  });

  it("shows where a linked note lives on the course", async () => {
    listMock.mockResolvedValue({
      data: {
        data: [
          note({
            elearning: {
              item_id: 1,
              is_published: true,
              section_id: 2,
              section_title: "Week 3 — Wallets",
              course_id: 7,
              course_title: "Web3 Applications",
              course_status: "PUBLISHED",
            },
          }),
        ],
      },
    });

    renderPage();
    await userEvent.click(await screen.findByText("Web3 Applications"));

    expect(await screen.findByText("Week 3 — Wallets")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add to e-learning" })).not.toBeInTheDocument();
  });

  it("filters the subject's notes down to the ones not yet on e-learning", async () => {
    listMock.mockResolvedValue({
      data: {
        data: [
          note({ note_id: 10, title: "Linked note", elearning: { item_id: 1, is_published: true, section_id: 2, section_title: "Week 1", course_id: 7, course_title: "C", course_status: "DRAFT" } }),
          note({ note_id: 11, title: "Unlinked note" }),
        ],
      },
    });

    renderPage();
    await userEvent.click(await screen.findByText("Web3 Applications"));
    await screen.findByText("Linked note");

    await userEvent.click(screen.getByRole("button", { name: "Not linked" }));
    expect(screen.queryByText("Linked note")).not.toBeInTheDocument();
    expect(screen.getByText("Unlinked note")).toBeInTheDocument();
  });
});
