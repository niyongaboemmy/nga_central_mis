import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MentoringSessionModal from "../MentoringSessionModal";
import type { AssignedStudent, MentorshipSessionRecord } from "../../../api/mentorship";

const student: AssignedStudent = {
  user_id: 42,
  first_name: "Ada",
  last_name: "Lovelace",
  class_group_name: "Year 2A",
  last_session_date: null,
  days_since_last_session: null,
  wellbeing_status: null,
  follow_up_required: false,
  dishonesty_flagged: false,
  stress_flag: false,
  overdue: true,
};

const existingSession: MentorshipSessionRecord = {
  mentorship_id: 7,
  session_date: "2026-01-15",
  topic: "Existing topic",
  subject_id: null,
  previous_session_id: null,
  duration_minutes: 30,
  assignment_completion: "GOOD",
  assignment_notes: null,
  punctuality_attendance: null,
  discipline_notes: null,
  discipline_progress: null,
  academic_planning: null,
  academic_personal_notes: null,
  dishonesty_flagged: false,
  stress_flag: false,
  next_steps: null,
  action_items: null,
  challenges_identified: null,
  guidance_notes: null,
  wellbeing_status: "GOOD",
  wellbeing_score: 4,
  wellbeing_notes: null,
  follow_up_required: false,
  is_completed: false,
  session_status: "OPEN",
  notes: null,
  created_at: "2026-01-15",
};

const getMenteeIntelligenceMock = vi.fn(() =>
  Promise.resolve({
    data: { data: { recent_scores: [], open_challenges: [], flag_history: { dishonesty_count: 0, stress_count: 0 }, instructor_subjects: [] } },
  }),
);
const submitSessionMock = vi.fn((_payload: any) => Promise.resolve({ data: { data: { mentorship_id: 99 } } }));
const updateSessionMock = vi.fn((_id: number, _payload: any) => Promise.resolve({ data: { data: { mentorship_id: 7 } } }));

vi.mock("../../../api/mentorship", async () => {
  const actual = await vi.importActual<any>("../../../api/mentorship");
  return {
    ...actual,
    mentorshipApi: {
      ...actual.mentorshipApi,
      getMenteeIntelligence: () => getMenteeIntelligenceMock(),
      submitSession: (payload: any) => submitSessionMock(payload),
      updateSession: (id: number, payload: any) => updateSessionMock(id, payload),
    },
  };
});

vi.mock("../SessionPrintPreview", () => ({
  default: () => <div data-testid="print-preview">Print Preview</div>,
}));

vi.mock("../../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => ({ selectedYearId: 1, selectedTermId: 1 }),
}));

const showToastMock = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

const goToLastStep = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: /^Next$/i }));
  await user.click(screen.getByRole("button", { name: /^Next$/i }));
  await user.click(screen.getByRole("button", { name: /^Next$/i }));
};

describe("MentoringSessionModal — multi-step wizard", () => {
  beforeEach(() => {
    localStorage.clear();
    getMenteeIntelligenceMock.mockClear();
    submitSessionMock.mockClear();
    updateSessionMock.mockClear();
    showToastMock.mockClear();
  });

  it("create mode: shows step 1 first, blocks advancing without duration", async () => {
    const user = userEvent.setup();
    render(
      <MentoringSessionModal
        student={student}
        lastSession={null}
        sessionHistory={[]}
        onClose={() => {}}
        onSubmitted={() => {}}
      />,
    );

    expect(screen.getByText("Log Mentoring Session")).toBeInTheDocument();
    expect(screen.getByText(/Session Date/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Next$/i }));
    expect(showToastMock).toHaveBeenCalledWith("Duration is required", "error");
    // Still on step 1 — the date/topic fields are still visible
    expect(screen.getByText(/Session Topic/i)).toBeInTheDocument();
  });

  it("create mode: advances through all 4 steps and submits with student_id", async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    render(
      <MentoringSessionModal
        student={student}
        lastSession={null}
        sessionHistory={[]}
        onClose={() => {}}
        onSubmitted={onSubmitted}
      />,
    );

    await user.type(screen.getByPlaceholderText("30"), "30");
    await goToLastStep(user);

    expect(screen.getByText(/Review before submitting/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Log Session/i }));

    await waitFor(() =>
      expect(submitSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ student_id: 42, duration_minutes: 30 }),
      ),
    );
    expect(onSubmitted).toHaveBeenCalled();
    expect(await screen.findByTestId("print-preview")).toBeInTheDocument();
  });

  it("step indicator lets the user jump back to an already-visited step", async () => {
    const user = userEvent.setup();
    render(
      <MentoringSessionModal
        student={student}
        lastSession={null}
        sessionHistory={[]}
        onClose={() => {}}
        onSubmitted={() => {}}
      />,
    );

    await user.type(screen.getByPlaceholderText("30"), "30");
    await user.click(screen.getByRole("button", { name: /^Next$/i })); // -> step 2

    expect(screen.getByText(/Productivity & Well-being/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Session Info/i }));
    expect(screen.getByText(/Session Topic/i)).toBeInTheDocument();
  });

  it("edit mode: prefills fields, shows 'Edit' title, and calls updateSession without student_id", async () => {
    const user = userEvent.setup();
    render(
      <MentoringSessionModal
        student={student}
        lastSession={null}
        sessionHistory={[]}
        editSession={existingSession}
        onClose={() => {}}
        onSubmitted={() => {}}
      />,
    );

    expect(screen.getByText("Edit Mentoring Session")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Existing topic")).toBeInTheDocument();
    expect(screen.getByDisplayValue("30")).toBeInTheDocument();

    await goToLastStep(user);
    await user.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() => expect(updateSessionMock).toHaveBeenCalledWith(7, expect.any(Object)));
    const payload = updateSessionMock.mock.calls[0]![1];
    expect((payload as any).student_id).toBeUndefined();
    expect((payload as any).topic).toBe("Existing topic");
  });
});
