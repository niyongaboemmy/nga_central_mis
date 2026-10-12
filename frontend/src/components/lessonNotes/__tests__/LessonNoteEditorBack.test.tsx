import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ToastProvider } from "../../../contexts/ToastContext";
import { ConfirmProvider } from "../../../contexts/ConfirmContext";
import LessonNoteEditorPage from "../LessonNoteEditorPage";

/** The editor's back button returns to the subject's notes, not the subject picker. */

const getNote = vi.fn();
const noteElearning = vi.fn();
let canBuild = false;

vi.mock("../../../api/lessonNotes", async (orig) => ({
  ...(await orig<typeof import("../../../api/lessonNotes")>()),
  lessonNotesApi: { get: (...a: unknown[]) => getNote(...a) },
}));
vi.mock("../../../api/elearning", async (orig) => ({
  ...(await orig<typeof import("../../../api/elearning")>()),
  elearningApi: { noteElearning: (...a: unknown[]) => noteElearning(...a) },
}));
vi.mock("../../../hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: () => canBuild }),
}));
vi.mock("../../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => ({ selectedYearId: 9 }),
}));
// The details form is covered by its own test.
vi.mock("../LessonNoteFormModal", () => ({ default: () => null }));
vi.mock("../LessonNoteRichEditor", () => ({ default: () => <div data-testid="rich-editor" /> }));

const detail = {
  note_id: 10,
  user_id: 1,
  subject_id: 4,
  subject_name: "Development of Web User Interface",
  class_group_id: 5,
  class_group_name: "L3. Class A",
  scheme_entry_id: null,
  title: "Intro to HTML",
  content_json: null,
  content_html: "<p>Hello</p>",
  status: "PUBLISHED",
  source: "MANUAL",
  file_name: null,
  page_count: null,
  share_count: 1,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  scheme_context: null,
  curriculum_context: null,
  elearning: null,
};

const Where = () => {
  const loc = useLocation();
  return <p data-testid="where">{`${loc.pathname}${loc.search}`}</p>;
};

const renderAt = (entry: any) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <ToastProvider>
        <ConfirmProvider>
          <Routes>
            <Route path="/lesson-notes/:id" element={<LessonNoteEditorPage />} />
            <Route path="/lesson-notes" element={<Where />} />
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  getNote.mockReset();
  noteElearning.mockReset();
  canBuild = false;
  getNote.mockResolvedValue({ data: { data: detail } });
});

describe("LessonNoteEditorPage — back", () => {
  it("returns to the exact list it was opened from (subject + filters)", async () => {
    renderAt({ pathname: "/lesson-notes/10", state: { backTo: "/lesson-notes?subject=4&reach=ATTENTION" } });
    await userEvent.click(await screen.findByRole("button", { name: "Back to Development of Web User Interface notes" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/lesson-notes?subject=4&reach=ATTENTION");
  });

  it("opened directly, it still returns to that subject's notes — not the subject picker", async () => {
    renderAt("/lesson-notes/10");
    const back = await screen.findByRole("button", { name: "Back to Development of Web User Interface notes" });
    expect(back).toHaveTextContent("Development of Web User Interface");
    await userEvent.click(back);
    expect(screen.getByTestId("where")).toHaveTextContent("/lesson-notes?subject=4");
  });

  it("shows the e-learning chip to course builders", async () => {
    canBuild = true;
    noteElearning.mockResolvedValue({
      data: {
        data: {
          note: { note_id: 10, title: "Intro to HTML", status: "PUBLISHED" },
          course: { course_id: 7, title: "Web UI", status: "PUBLISHED" },
          no_course_reason: null,
          placement: { item_id: 1, is_published: true, section_id: 2, section_title: "Week 2 — HTML", section_status: "PUBLISHED", section_unlock_at: null, course_status: "PUBLISHED" },
          sections: [],
          students: { members: 10, started: 2, completed: 1 },
          reach: { state: "LIVE", opens_at: null, blocker: null, steps: [] },
        },
      },
    });
    renderAt("/lesson-notes/10");
    expect(await screen.findByText("Live · Week 2")).toBeInTheDocument();
    expect(noteElearning).toHaveBeenCalledWith(10);
  });
});
