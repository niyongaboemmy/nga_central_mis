import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MentorCheckInInbox from "../MentorCheckInInbox";
import type { MenteeCheckInRecord } from "../../../api/mentorship";

const sampleCheckIn: MenteeCheckInRecord = {
  checkin_id: 1,
  student_id: 10,
  student_name: "Ada Lovelace",
  mentor_id: 5,
  academic_year_id: 1,
  submitted_at: "2026-02-01",
  category: "CONCERN",
  title: "Falling behind",
  message: "I'm falling behind on my project.",
  linked_session_id: null,
  status: "NEW",
  validation_status: "PENDING",
  mentor_response: null,
  responded_at: null,
};

const getCheckInInboxMock = vi.fn((_status?: string) =>
  Promise.resolve({ data: { data: [sampleCheckIn] } }),
);
const updateCheckInMock = vi.fn((_id: number, _payload: any) =>
  Promise.resolve({ data: { data: { checkin_id: 1 } } }),
);

vi.mock("../../../api/mentorship", async () => {
  const actual = await vi.importActual<any>("../../../api/mentorship");
  return {
    ...actual,
    mentorshipApi: {
      ...actual.mentorshipApi,
      getCheckInInbox: (status?: string) => getCheckInInboxMock(status),
      updateCheckIn: (id: number, payload: any) => updateCheckInMock(id, payload),
    },
  };
});

const showToastMock = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

describe("MentorCheckInInbox", () => {
  beforeEach(() => {
    getCheckInInboxMock.mockClear();
    updateCheckInMock.mockClear();
    showToastMock.mockClear();
  });

  it("shows the empty state when there are no check-ins", async () => {
    getCheckInInboxMock.mockResolvedValueOnce({ data: { data: [] } } as any);
    render(<MentorCheckInInbox />);
    await waitFor(() =>
      expect(screen.getByText(/No check-ins from your mentees yet/i)).toBeInTheDocument(),
    );
  });

  it("lists a check-in with its title and PENDING badge, and reports the unread (NEW) count", async () => {
    const onUnreadCountChange = vi.fn();
    render(<MentorCheckInInbox onUnreadCountChange={onUnreadCountChange} />);

    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());
    expect(screen.getByText("Falling behind")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(onUnreadCountChange).toHaveBeenCalledWith(1);
  });

  it("approves a report without requiring a comment", async () => {
    const user = userEvent.setup();
    render(<MentorCheckInInbox />);

    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());
    await user.click(screen.getByText("Ada Lovelace"));

    await user.click(screen.getByRole("button", { name: /^Approve$/i }));

    await waitFor(() =>
      expect(updateCheckInMock).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ validation_status: "APPROVED" }),
      ),
    );
    expect(showToastMock).toHaveBeenCalledWith("Report approved", "success");
  });

  it("requires a comment before confirming a rejection", async () => {
    const user = userEvent.setup();
    render(<MentorCheckInInbox />);

    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());
    await user.click(screen.getByText("Ada Lovelace"));

    // First click switches into "confirm reject" mode without submitting
    await user.click(screen.getByRole("button", { name: /^Reject$/i }));
    expect(updateCheckInMock).not.toHaveBeenCalled();

    // Second click (now "Confirm Reject") with an empty comment is rejected client-side
    await user.click(screen.getByRole("button", { name: /Confirm Reject/i }));
    expect(updateCheckInMock).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith(
      "A comment is required when rejecting a report",
      "error",
    );

    // Filling the comment lets the rejection go through
    await user.type(
      screen.getByPlaceholderText(/Explain why this report is being rejected/i),
      "Please add more detail.",
    );
    await user.click(screen.getByRole("button", { name: /Confirm Reject/i }));

    await waitFor(() =>
      expect(updateCheckInMock).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ validation_status: "REJECTED", mentor_response: "Please add more detail." }),
      ),
    );
  });
});
