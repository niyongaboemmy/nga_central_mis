import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../../contexts/ToastContext";
import { ConfirmProvider } from "../../../contexts/ConfirmContext";
import LessonNoteFormModal from "../LessonNoteFormModal";

const getMock = vi.fn();
const listMock = vi.fn();
const updateMock = vi.fn();
const replacePdfMock = vi.fn();
const removeMock = vi.fn();
const createMock = vi.fn();
const assignedMock = vi.fn();
const competenciesMock = vi.fn();

vi.mock("../../../api/lessonNotes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/lessonNotes")>();
  return {
    ...actual,
    lessonNotesApi: {
      get: (...a: any[]) => getMock(...a),
      list: (...a: any[]) => listMock(...a),
      update: (...a: any[]) => updateMock(...a),
      replacePdf: (...a: any[]) => replacePdfMock(...a),
      remove: (...a: any[]) => removeMock(...a),
      create: (...a: any[]) => createMock(...a),
    },
  };
});

vi.mock("../../../api/academics", () => ({
  myAssignedSubjectsApi: { getAll: (...a: any[]) => assignedMock(...a) },
}));

vi.mock("../../../api/curriculum", () => ({
  competenciesApi: { getAll: (...a: any[]) => competenciesMock(...a) },
}));

vi.mock("../../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => ({ selectedTermId: 3 }),
}));

const grade = (class_group_id: number, class_group_name: string) => ({
  grade_id: 1,
  grade_name: "L3",
  program_id: 1,
  program_name: "SWD",
  class_group_id,
  class_group_name,
  academic_year_id: 1,
  academic_year_name: "2026-2027",
  assigned_at: "2026-09-01",
  validation_status: "APPROVED",
  validation_comment: null,
  scheme_id: null,
});

const SUBJECTS = [
  { subject_id: 1, subject_name: "Development of Web User Interface", subject_code: "SPEWI302", grades: [grade(5, "Class A"), grade(6, "Class B")] },
  { subject_id: 2, subject_name: "Graphic User Interface Design", subject_code: "SPEGI302", grades: [grade(5, "Class A")] },
];

const crit = (criteria_id: number, competency_id: number, n: string) => ({
  criteria_id,
  competency_id,
  criteria_number: n,
  description: `Criterion ${n}`,
  sort_order: Number(n.split(".")[1]),
  created_at: "",
  updated_at: "",
});

const outcome = (competency_id: number, subject_id: number, element_number: number, criteria: any[]) => ({
  competency_id,
  subject_id,
  user_id: 1,
  element_number,
  learning_hours: 10,
  title: `Outcome ${element_number}`,
  description: null,
  indicative_content: null,
  sort_order: element_number,
  created_at: "",
  updated_at: "",
  criteria,
});

const CURRICULUM: Record<number, any[]> = {
  1: [outcome(11, 1, 1, [crit(101, 11, "1.1"), crit(102, 11, "1.2")]), outcome(12, 1, 2, [crit(103, 12, "2.1")])],
  2: [outcome(21, 2, 1, [crit(201, 21, "1.1")])],
};

const detail = (over: Partial<any> = {}) => ({
  note_id: 10,
  user_id: 1,
  subject_id: 1,
  subject_name: "Development of Web User Interface",
  class_group_id: 5,
  class_group_name: "Class A",
  scheme_entry_id: null,
  academic_term_id: 3,
  title: "HTML elements",
  content_json: null,
  content_html: "<p>body</p>",
  status: "DRAFT",
  source: "MANUAL",
  file_path: null,
  file_name: null,
  file_size: null,
  page_count: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-21T00:00:00.000Z",
  share_count: 0,
  scheme_context: null,
  curriculum_context: { outcomes: [], criteria_ids: [101, 102] },
  elearning: null,
  ...over,
});

const renderModal = (props: Partial<React.ComponentProps<typeof LessonNoteFormModal>> = {}) => {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const onDeleted = vi.fn();
  render(
    <MemoryRouter initialEntries={["/lesson-notes?subject=1"]}>
      <ToastProvider>
        <ConfirmProvider>
          <LessonNoteFormModal isOpen noteId={10} onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} {...props} />
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
  return { onClose, onSaved, onDeleted };
};

const outcomeBox = (n: number) =>
  screen.findByRole("checkbox", { name: `Select all criteria of Learning Outcome ${n}` });

describe("LessonNoteFormModal — edit mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assignedMock.mockResolvedValue({ data: { data: SUBJECTS } });
    competenciesMock.mockImplementation((subjectId: number) => Promise.resolve({ data: { data: CURRICULUM[subjectId] || [] } }));
    listMock.mockResolvedValue({
      data: {
        data: [
          // This note's own coverage must not be flagged as "has a note".
          { note_id: 10, criteria_ids: [101, 102] },
          { note_id: 99, criteria_ids: [103] },
        ],
      },
    });
    getMock.mockResolvedValue({ data: { data: detail() } });
    updateMock.mockResolvedValue({ data: {} });
  });

  it("opens with the same fields as create, pre-filled from the note", async () => {
    renderModal();
    expect(await screen.findByText("Edit Lesson Note")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Subject", { selector: "select" })).toHaveValue("1"));
    expect(screen.getByLabelText("Class", { selector: "select" })).toHaveValue("5");
    expect(screen.getByLabelText("Title")).toHaveValue("HTML elements");
    // Saved coverage is restored: the whole of LO 1, none of LO 2.
    expect(await outcomeBox(1)).toHaveAttribute("aria-checked", "true");
    expect(await outcomeBox(2)).toHaveAttribute("aria-checked", "false");
    // Create-only choices are replaced by the note's content summary.
    expect(screen.queryByText("How do you want to create it?")).not.toBeInTheDocument();
    expect(screen.getByText("Written in the editor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();
  });

  it("sends only what changed", async () => {
    const user = userEvent.setup();
    const { onSaved, onClose } = renderModal();
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("HTML elements"));
    await outcomeBox(2);

    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "HTML & CSS");
    await user.selectOptions(screen.getByLabelText("Class", { selector: "select" }), "6");
    await user.click(await outcomeBox(2));

    getMock.mockResolvedValue({ data: { data: detail({ title: "HTML & CSS", class_group_id: 6 }) } });
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    const [id, patch] = updateMock.mock.calls[0];
    expect(id).toBe(10);
    expect(patch).toEqual({ title: "HTML & CSS", class_group_id: 6, criteria_ids: expect.any(Array) });
    expect([...patch.criteria_ids].sort()).toEqual([101, 102, 103]);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ title: "HTML & CSS" })));
    expect(onClose).toHaveBeenCalled();
  });

  it("moving to another subject clears coverage and validates against the new curriculum", async () => {
    const user = userEvent.setup();
    renderModal();
    await waitFor(() => expect(screen.getByLabelText("Subject", { selector: "select" })).toHaveValue("1"));
    await outcomeBox(1);

    await user.selectOptions(screen.getByLabelText("Subject", { selector: "select" }), "2");
    await waitFor(() => expect(competenciesMock).toHaveBeenLastCalledWith(2));
    expect(await outcomeBox(1)).toHaveAttribute("aria-checked", "false");
    await user.selectOptions(screen.getByLabelText("Class", { selector: "select" }), "5");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(updateMock.mock.calls[0][1]).toEqual({ subject_id: 2, criteria_ids: [] });
  });

  it("keeps the note's own subject and class listed when the teacher no longer has them", async () => {
    getMock.mockResolvedValue({
      data: { data: detail({ subject_id: 77, subject_name: "Old subject", class_group_id: 88, class_group_name: "Old class", curriculum_context: null }) },
    });
    renderModal();
    await waitFor(() => expect(screen.getByLabelText("Subject", { selector: "select" })).toHaveValue("77"));
    expect(within(screen.getByLabelText("Subject", { selector: "select" })).getByRole("option", { name: "Old subject", hidden: true })).toBeInTheDocument();
    expect(screen.getByLabelText("Class", { selector: "select" })).toHaveValue("88");
    expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();
  });

  it("locks subject and class while the note is on an e-learning course", async () => {
    getMock.mockResolvedValue({
      data: {
        data: detail({
          elearning: { item_id: 1, is_published: true, section_id: 2, section_title: "Week 3", course_id: 4, course_title: "Web UI", course_status: "PUBLISHED" },
        }),
      },
    });
    renderModal();
    await waitFor(() => expect(screen.getByLabelText("Subject", { selector: "select" })).toHaveValue("1"));
    expect(screen.getByLabelText("Subject", { selector: "select" })).toBeDisabled();
    expect(screen.getByLabelText("Class", { selector: "select" })).toBeDisabled();
    expect(screen.getByText(/Remove it from that course to move it/)).toBeInTheDocument();
    // Title and coverage stay editable.
    expect(screen.getByLabelText("Title")).toBeEnabled();
  });

  it("replaces a PDF note's file on save", async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue({
      data: { data: detail({ source: "PDF_UPLOAD", file_path: "x.pdf", file_name: "old.pdf", file_size: 2048, page_count: 4 }) },
    });
    replacePdfMock.mockResolvedValue({ data: { data: { page_count: 6, is_textless: false } } });
    renderModal();
    expect(await screen.findByText("old.pdf")).toBeInTheDocument();

    const file = new File(["%PDF-1.4"], "new.pdf", { type: "application/pdf" });
    await user.upload(screen.getByTestId("replace-pdf-input"), file);
    expect(screen.getByText("new.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(replacePdfMock).toHaveBeenCalledWith(10, file, expect.any(Function)));
    // Nothing else changed, so no PATCH.
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("shows the server's refusal and stays open", async () => {
    const user = userEvent.setup();
    updateMock.mockRejectedValue({ response: { data: { message: "Remove it from that course before moving it" } } });
    const { onClose } = renderModal();
    await waitFor(() => expect(screen.getByLabelText("Class", { selector: "select" })).toHaveValue("5"));
    await user.selectOptions(screen.getByLabelText("Class", { selector: "select" }), "6");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByText("Remove it from that course before moving it")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("deletes the note after confirmation", async () => {
    const user = userEvent.setup();
    removeMock.mockResolvedValue({ data: { data: { removed_course_items: 0 } } });
    const { onDeleted, onClose } = renderModal();
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("HTML elements"));

    await user.click(screen.getByRole("button", { name: /delete note/i }));
    expect(await screen.findByText("Delete lesson note?")).toBeInTheDocument();
    const confirmButtons = screen.getAllByRole("button", { name: /delete note/i });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(removeMock).toHaveBeenCalledWith(10));
    expect(onClose).toHaveBeenCalled();
    expect(onDeleted).toHaveBeenCalled();
  });

  it("create mode is unchanged: no delete, the three creation choices", async () => {
    renderModal({ noteId: undefined, onDeleted: undefined });
    expect(await screen.findByText("New Lesson Note")).toBeInTheDocument();
    expect(screen.getByText("How do you want to create it?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete note/i })).not.toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalled();
  });
});
