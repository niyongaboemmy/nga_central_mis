import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
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
// One of the five categories the inbox used to show as a blank badge.
const academicCheckIn: MenteeCheckInRecord = {
  ...sampleCheckIn,
  checkin_id: 2,
  student_id: 11,
  student_name: "Ben Kamali",
  category: "ACADEMIC",
  title: "Maths homework",
  status: "ACKNOWLEDGED",
};

const getCheckInInboxMock = vi.fn((_status?: string) => Promise.resolve({ data: { data: [sampleCheckIn, academicCheckIn] } }));
const updateCheckInMock = vi.fn((_id: number, _payload: any) => Promise.resolve({ data: { data: { checkin_id: 1 } } }));

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
vi.mock("../../../hooks/useMentorshipRole", () => ({ refreshMentorshipRole: vi.fn() }));

const showToastMock = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: showToastMock }) }));

const renderInbox = (props: { onUnreadCountChange?: (n: number) => void } = {}, url = "/my-mentees/inbox") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <MentorCheckInInbox {...props} />
    </MemoryRouter>,
  );

const openAda = async (user: ReturnType<typeof userEvent.setup>) => {
  await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());
  await user.click(screen.getByText("Falling behind"));
  return screen.findByRole("dialog");
};

describe("MentorCheckInInbox", () => {
  beforeEach(() => {
    getCheckInInboxMock.mockClear();
    updateCheckInMock.mockClear();
    showToastMock.mockClear();
  });

  it("shows the empty state when there are no check-ins", async () => {
    getCheckInInboxMock.mockResolvedValueOnce({ data: { data: [] } } as any);
    renderInbox();
    expect(await screen.findByText("No check-ins yet")).toBeInTheDocument();
  });

  it("labels every category and reports the unread count", async () => {
    const onUnreadCountChange = vi.fn();
    renderInbox({ onUnreadCountChange });
    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeInTheDocument());
    expect(screen.getByText("Concern")).toBeInTheDocument();
    expect(screen.getByText("Academic")).toBeInTheDocument();
    expect(screen.getByText("1 unread")).toBeInTheDocument();
    expect(onUnreadCountChange).toHaveBeenLastCalledWith(1);
  });

  it("filters to unread check-ins", async () => {
    const user = userEvent.setup();
    renderInbox();
    await waitFor(() => expect(screen.getByText("Ben Kamali")).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: /Unread/ }));
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByText("Ben Kamali")).not.toBeInTheDocument();
  });

  it("marks an unread check-in seen as soon as it is opened", async () => {
    const user = userEvent.setup();
    renderInbox();
    await openAda(user);
    await waitFor(() => expect(updateCheckInMock).toHaveBeenCalledWith(1, { status: "ACKNOWLEDGED" }));
  });

  it("sends a reply and says the student was notified", async () => {
    const user = userEvent.setup();
    renderInbox();
    const dialog = await openAda(user);
    const send = within(dialog).getByRole("button", { name: /Send reply/i });
    expect(send).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Reply to Ada/i), "Let's meet on Thursday.");
    await user.click(send);
    await waitFor(() => expect(updateCheckInMock).toHaveBeenCalledWith(1, { mentor_response: "Let's meet on Thursday." }));
    expect(showToastMock).toHaveBeenCalledWith("Reply sent — Ada has been notified", "success");
  });

  it("approves a report without requiring a comment", async () => {
    const user = userEvent.setup();
    renderInbox();
    const dialog = await openAda(user);
    await user.click(within(dialog).getByRole("button", { name: /^Approve$/i }));
    await waitFor(() =>
      expect(updateCheckInMock).toHaveBeenCalledWith(1, expect.objectContaining({ validation_status: "APPROVED" })),
    );
    expect(showToastMock).toHaveBeenCalledWith("Approved — Ada has been notified", "success");
  });

  it("requires a reason before sending a report back", async () => {
    const user = userEvent.setup();
    renderInbox();
    const dialog = await openAda(user);
    updateCheckInMock.mockClear(); // ignore the "seen" mark

    await user.click(within(dialog).getByRole("button", { name: /Reject/i }));
    const sendBack = within(dialog).getByRole("button", { name: /Send back/i });
    expect(sendBack).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/Why are you sending this back/i), "Please add more detail.");
    await user.click(sendBack);
    await waitFor(() =>
      expect(updateCheckInMock).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ validation_status: "REJECTED", mentor_response: "Please add more detail." }),
      ),
    );
  });

  it("opens the check-in named in the link (?checkin=)", async () => {
    renderInbox({}, "/my-mentees/inbox?checkin=2");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Maths homework")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /Open Ben's page/i })).toHaveAttribute("href", "/my-mentees/11");
  });
});
