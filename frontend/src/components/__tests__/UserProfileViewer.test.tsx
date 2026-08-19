import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const getScopedUserDetailMock = vi.fn();
vi.mock("../../api/users", () => ({
  getScopedUserDetail: (...args: any[]) => getScopedUserDetailMock(...args),
}));

const showToastMock = vi.fn();
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

import UserProfileViewer from "../UserProfileViewer";

const SUMMARY: any = {
  user_id: 42,
  username: "jdoe",
  email: "jdoe@example.com",
  phone_number: "0788000000",
  status: "ACTIVE",
  first_name: "Jane",
  last_name: "Doe",
  user_type: "STUDENT",
  roles: [{ role_id: 3, name: "STUDENT" }],
  grades: [],
  class_groups: [],
};

const DETAIL = {
  user: { ...SUMMARY, user_id: 42 },
  profile: {
    first_name: "Jane",
    last_name: "Doe",
    gender: "FEMALE",
    user_type: "STUDENT",
  },
  roles: [
    {
      role_id: 3,
      name: "STUDENT",
      permissions: [{ perm_id: 1, name: "VIEW_RESULTS" }],
    },
  ],
  permissions: ["VIEW_RESULTS"],
  assignedGrades: [],
  classGroups: [
    {
      class_group_id: 7,
      name: "Grade 5 A",
      grade_id: 15,
      grade_name: "Grade 5",
      program_name: "Primary Program",
    },
  ],
  assignedPrograms: [],
  subjectsTaught: [],
  subjectsEnrolled: [
    {
      subject_id: 1,
      name: "Mathematics",
      code: "MATH101",
      class_groups: [{ class_group_id: 7, name: "Grade 5 · Grade 5 A" }],
    },
  ],
};

describe("UserProfileViewer", () => {
  beforeEach(() => {
    getScopedUserDetailMock.mockReset();
    getScopedUserDetailMock.mockResolvedValue(DETAIL);
    showToastMock.mockReset();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <UserProfileViewer isOpen={false} onClose={() => {}} summary={SUMMARY} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(getScopedUserDetailMock).not.toHaveBeenCalled();
  });

  it("shows identity from the row immediately, then the loaded detail", async () => {
    render(
      <UserProfileViewer isOpen onClose={() => {}} summary={SUMMARY} />,
    );

    expect(screen.getByText("Jane Doe")).toBeTruthy();
    expect(screen.getByText("@jdoe")).toBeTruthy();

    await waitFor(() =>
      expect(screen.getByText("Grade 5 A")).toBeTruthy(),
    );
    expect(screen.getByText("jdoe@example.com")).toBeTruthy();

    // Subjects is collapsed by default -- placement and contact matter more
    // when you are looking someone up from a class list.
    fireEvent.click(
      screen.getByRole("button", { name: /^Subjects/ }),
    );
    expect(screen.getByText(/MATH101/)).toBeTruthy();
  });

  it("names the class group each subject is taken with", async () => {
    // A subject name alone does not say which section the person takes it in;
    // for a teacher of the same subject in two sections it is the only thing
    // telling the rows apart.
    render(<UserProfileViewer isOpen onClose={() => {}} summary={SUMMARY} />);
    await waitFor(() => expect(screen.getByText("Grade 5 A")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /^Subjects/ }));
    expect(screen.getByText("Mathematics")).toBeTruthy();
    expect(screen.getByText("Grade 5 · Grade 5 A")).toBeTruthy();
    // Teaching vs enrolment stays labelled rather than merged.
    expect(screen.getByText("Enrolled")).toBeTruthy();
  });

  it("offers no way to modify the user", async () => {
    render(<UserProfileViewer isOpen onClose={() => {}} summary={SUMMARY} />);
    await waitFor(() => expect(screen.getByText("Grade 5 A")).toBeTruthy());

    // Every control on the panel is navigational: close, copy, or a section
    // toggle. Anything matching an edit affordance would be a regression --
    // this component exists precisely so a class teacher cannot mutate a
    // profile they can only look at.
    const forbidden =
      /^(edit|save|delete|remove|assign|disable|enable|add|update)\b/i;
    for (const button of screen.getAllByRole("button")) {
      const label =
        button.getAttribute("aria-label") ?? button.textContent ?? "";
      expect(label.trim()).not.toMatch(forbidden);
    }
  });

  it("explains a 403 instead of showing an empty profile", async () => {
    getScopedUserDetailMock.mockRejectedValue({ response: { status: 403 } });
    render(<UserProfileViewer isOpen onClose={() => {}} summary={SUMMARY} />);

    await waitFor(() =>
      expect(
        screen.getByText(/outside your assigned grades/i),
      ).toBeTruthy(),
    );
  });

  it("passes the academic year through to the detail request", async () => {
    render(
      <UserProfileViewer
        isOpen
        onClose={() => {}}
        summary={SUMMARY}
        academicYearId={4}
      />,
    );
    await waitFor(() =>
      expect(getScopedUserDetailMock).toHaveBeenCalledWith(42, 4),
    );
  });
});
