import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SharedLessonNotesPage from "../SharedLessonNotesPage";

const sharedWithMe = vi.fn();

vi.mock("../../../api/lessonNotes", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../api/lessonNotes")>();
  return {
    ...actual,
    lessonNotesApi: { sharedWithMe: () => sharedWithMe() },
  };
});

vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const note = (over: Partial<any> = {}): any => ({
  note_id: 1,
  title: "Mastering PHP Fundamentals",
  subject_name: "Develop Web Application Using PHP",
  teacher_name: "Niyitegeka Faustin",
  updated_at: new Date().toISOString(),
  source: "MANUAL",
  page_count: null,
  excerpt: "Introduction to PHP",
  word_count: 800,
  reading_minutes: 8,
  placement: null,
  ...over,
});

const placed = (over: Partial<any> = {}) =>
  note({
    note_id: 2,
    title: "Data Types and Type Conversion",
    placement: {
      course_id: 4,
      item_id: 11,
      section_id: 5,
      section_title: "Week 3 — Data Types",
    },
    ...over,
  });

const renderLibrary = () =>
  render(
    <MemoryRouter initialEntries={["/shared-lesson-notes"]}>
      <Routes>
        <Route path="/shared-lesson-notes" element={<SharedLessonNotesPage />} />
        <Route path="/shared-lesson-notes/:id" element={<p>standalone reader</p>} />
        <Route
          path="/my-learning/courses/:courseId/items/:itemId"
          element={<p>course item</p>}
        />
      </Routes>
    </MemoryRouter>,
  );

describe("My Library — routing a student to where the reading counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharedWithMe.mockResolvedValue({ data: { data: [] } });
  });

  it("opens a placed note inside its course, not the standalone reader", async () => {
    sharedWithMe.mockResolvedValue({ data: { data: [placed()] } });
    renderLibrary();

    await userEvent.click(
      await screen.findByText("Data Types and Type Conversion"),
    );
    expect(screen.getByText("course item")).toBeInTheDocument();
  });

  it("says where the note lives before the click", async () => {
    sharedWithMe.mockResolvedValue({ data: { data: [placed()] } });
    renderLibrary();
    expect(
      await screen.findByText(/Week 3 · counts towards your progress/),
    ).toBeInTheDocument();
    expect(screen.getByText("Open in e-learning")).toBeInTheDocument();
  });

  it("still allows reading it outside the course", async () => {
    // The standalone reader earns nothing, so it is secondary — but a student
    // who just wants to re-read must not be forced through the course.
    sharedWithMe.mockResolvedValue({ data: { data: [placed()] } });
    renderLibrary();

    await userEvent.click(await screen.findByText("Just read the note"));
    expect(screen.getByText("standalone reader")).toBeInTheDocument();
  });

  it("falls back to the reader for a note that is on no course", async () => {
    sharedWithMe.mockResolvedValue({ data: { data: [note()] } });
    renderLibrary();

    await userEvent.click(await screen.findByText("Mastering PHP Fundamentals"));
    expect(screen.getByText("standalone reader")).toBeInTheDocument();
    // Nothing promises course progress for a note that has no course.
    expect(screen.queryByText("Open in e-learning")).not.toBeInTheDocument();
    expect(screen.queryByText("Just read the note")).not.toBeInTheDocument();
  });

  // Levi's library is one flat, sorted grid rather than sections per subject
  // (sections left holes beside short groups). What it keeps: every note names
  // its subject, and the subject chips narrow the list to one subject.
  it("names each note's subject and filters by it", async () => {
    sharedWithMe.mockResolvedValue({
      data: {
        data: [
          note({ note_id: 1, subject_name: "PHP" }),
          placed({ note_id: 2, subject_name: "JavaScript" }),
        ],
      },
    });
    renderLibrary();
    await screen.findByText("Mastering PHP Fundamentals");
    expect(screen.getAllByText("PHP").length).toBeGreaterThan(0);
    expect(screen.getAllByText("JavaScript").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: /^PHP\s*1$/ }));
    expect(screen.getByText("Mastering PHP Fundamentals")).toBeInTheDocument();
    expect(screen.queryByText("Data Types and Type Conversion")).not.toBeInTheDocument();
  });
});
