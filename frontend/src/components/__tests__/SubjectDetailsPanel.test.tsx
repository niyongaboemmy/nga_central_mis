import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const getScopedSubjectDetailMock = vi.fn();
vi.mock("../../api/users", () => ({
  getScopedSubjectDetail: (...args: any[]) =>
    getScopedSubjectDetailMock(...args),
}));

const showToastMock = vi.fn();
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

import SubjectDetailsPanel from "../SubjectDetailsPanel";

const SUMMARY: any = {
  subject_id: 7,
  code: "GENAP402",
  name: "Applied Physics II",
  description: "Second-year applied physics",
  status: "ACTIVE",
  color: "#3B82F6",
  teachers: [{ user_id: 1, username: "jdn", first_name: "Jean", last_name: "De Dieu" }],
  grades: [{ grade_id: 25, name: "Year 1" }],
  class_groups: [{ class_group_id: 9, name: "Year 1" }],
};

const DETAIL = {
  subject: {
    subject_id: 7,
    code: "GENAP402",
    name: "Applied Physics II",
    description: "Second-year applied physics",
    status: "ACTIVE",
    color: "#3B82F6",
    category_name: "Sciences",
  },
  classGroups: [
    { class_group_id: 9, name: "Year 1", grade_id: 25, grade_name: "Year 1" },
  ],
  teachers: [
    {
      user_id: 1,
      username: "jdn",
      first_name: "Jean",
      last_name: "De Dieu",
      email: "jdn@example.com",
      phone_number: "0788000001",
      class_groups: [{ class_group_id: 9, name: "Year 1" }],
    },
  ],
  students: [
    {
      user_id: 50,
      username: "amina",
      email: "amina@example.com",
      first_name: "Amina",
      last_name: "K",
      full_name: "Amina K",
      status: "ACTIVE",
      class_group_id: 9,
      class_group_name: "Year 1",
    },
    {
      user_id: 51,
      username: "bosco",
      email: "bosco@example.com",
      first_name: "Bosco",
      last_name: "M",
      full_name: "Bosco M",
      status: "ACTIVE",
      class_group_id: 9,
      class_group_name: "Year 1",
    },
  ],
  schedule: [
    {
      slot_id: 3,
      day_of_week: 1,
      start_time: "09:00",
      end_time: "09:50",
      location: "Lab 2",
      class_group_id: 9,
      class_group_name: "Year 1",
      teacher_name: "Jean De Dieu",
    },
  ],
  schemes: [
    {
      scheme_id: 11,
      class_group_id: 9,
      class_group_name: "Year 1",
      validation_status: "APPROVED",
      term_name: "Term 1",
      teacher_name: "Jean De Dieu",
    },
  ],
};

describe("SubjectDetailsPanel", () => {
  beforeEach(() => {
    getScopedSubjectDetailMock.mockReset();
    getScopedSubjectDetailMock.mockResolvedValue(DETAIL);
    showToastMock.mockReset();
  });

  it("renders nothing and fetches nothing while closed", () => {
    const { container } = render(
      <SubjectDetailsPanel
        isOpen={false}
        onClose={() => {}}
        summary={SUMMARY}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(getScopedSubjectDetailMock).not.toHaveBeenCalled();
  });

  it("shows the card's identity immediately, then the loaded overview", async () => {
    render(
      <SubjectDetailsPanel isOpen onClose={() => {}} summary={SUMMARY} />,
    );

    expect(screen.getByText("Applied Physics II")).toBeTruthy();
    expect(screen.getByText("GENAP402")).toBeTruthy();

    await waitFor(() => expect(screen.getByText("Sciences")).toBeTruthy());
    // Scheme-of-work status is the thing a class teacher opens a subject for.
    expect(screen.getByText("Approved")).toBeTruthy();
  });

  // Panels cross-fade on tab change, so the incoming one arrives a tick later
  // than the click -- hence findBy rather than getBy here.
  it("switches to teachers, students and schedule", async () => {
    render(<SubjectDetailsPanel isOpen onClose={() => {}} summary={SUMMARY} />);
    await screen.findByText("Sciences");

    fireEvent.click(screen.getByRole("tab", { name: "Teachers" }));
    expect(await screen.findByText("jdn@example.com")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Students" }));
    expect(await screen.findByText("Amina K")).toBeTruthy();
    expect(screen.getByText("Bosco M")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Schedule" }));
    expect(await screen.findByText("Monday")).toBeTruthy();
    expect(screen.getByText("09:00–09:50")).toBeTruthy();
    expect(screen.getByText(/Lab 2/)).toBeTruthy();
  });

  it("moves between tabs with the arrow keys", async () => {
    render(<SubjectDetailsPanel isOpen onClose={() => {}} summary={SUMMARY} />);
    await screen.findByText("Sciences");

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(await screen.findByText("jdn@example.com")).toBeTruthy();

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });
    expect(await screen.findByText("Runs in")).toBeTruthy();
  });

  it("jumps to a tab from its stat tile", async () => {
    // Reading "2 students" and then having to hunt for the tab is a wasted
    // click, so the tiles navigate.
    render(<SubjectDetailsPanel isOpen onClose={() => {}} summary={SUMMARY} />);
    await screen.findByText("Sciences");

    fireEvent.click(screen.getByRole("button", { name: "2 Students" }));
    expect(await screen.findByText("Amina K")).toBeTruthy();
  });

  it("filters the student list client-side", async () => {
    render(<SubjectDetailsPanel isOpen onClose={() => {}} summary={SUMMARY} />);
    await screen.findByText("Sciences");

    fireEvent.click(screen.getByRole("tab", { name: "Students" }));
    fireEvent.change(await screen.findByPlaceholderText("Filter students..."), {
      target: { value: "amina" },
    });

    expect(screen.getByText("Amina K")).toBeTruthy();
    expect(screen.queryByText("Bosco M")).toBeNull();
  });

  it("explains a 403 rather than rendering an empty panel", async () => {
    getScopedSubjectDetailMock.mockRejectedValue({ response: { status: 403 } });
    render(<SubjectDetailsPanel isOpen onClose={() => {}} summary={SUMMARY} />);

    await waitFor(() =>
      expect(
        screen.getByText(/outside your assigned grades/i),
      ).toBeTruthy(),
    );
  });

  it("passes the caller's grade scope through to the request", async () => {
    render(
      <SubjectDetailsPanel
        isOpen
        onClose={() => {}}
        summary={SUMMARY}
        gradeIds={[25]}
        academicYearId={4}
      />,
    );
    await waitFor(() =>
      expect(getScopedSubjectDetailMock).toHaveBeenCalledWith(7, {
        gradeIds: [25],
        academicYearId: 4,
      }),
    );
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<SubjectDetailsPanel isOpen onClose={onClose} summary={SUMMARY} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
