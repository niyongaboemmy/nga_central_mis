import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MyMentor from "../MyMentor";

let mentorPayload: any = null;
vi.mock("../../../api/mentorship", async () => {
  const actual = await vi.importActual<any>("../../../api/mentorship");
  return {
    ...actual,
    mentorshipApi: {
      ...actual.mentorshipApi,
      getMyCheckIns: () => Promise.resolve({ data: { data: [] } }),
      getMyMentor: () => Promise.resolve({ data: { data: mentorPayload } }),
    },
  };
});
vi.mock("../../../api/academics", () => ({
  studentEnrollmentApi: { getEnrolledSubjects: () => Promise.resolve({ data: { data: [] } }) },
}));
vi.mock("../../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => ({
    years: [{ academic_year_id: 1, name: "2026 - 2027", is_current: 1 }],
    selectedYearId: 1,
    selectedYear: { academic_year_id: 1, name: "2026 - 2027" },
  }),
}));
vi.mock("../../../contexts/UserContext", () => ({
  useUser: () => ({ user: { user: { user_id: 99 } } }),
}));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

describe("MyMentor — mentor card (student)", () => {
  beforeEach(() => {
    mentorPayload = null;
  });

  it("shows who the mentor is, how to reach them and when they last met", async () => {
    mentorPayload = {
      mentor_id: 5,
      mentor_name: "Assadou Nzigamasabo",
      mentor_email: "assadou@nga.ac.rw",
      mentor_phone: "+250780000000",
      mentor_role: "STAFF",
      teaches_you: ["Mathematics"],
      assigned_at: "2026-10-07",
      session_count: 3,
      last_session_date: "2026-10-01",
    };
    render(<MemoryRouter><MyMentor /></MemoryRouter>);
    const card = await screen.findByRole("region", { name: "Your mentor" });
    expect(card).toHaveTextContent("Assadou Nzigamasabo");
    expect(card).toHaveTextContent("Your mentor · 2026 - 2027");
    expect(card).toHaveTextContent("Staff");
    expect(card).toHaveTextContent("Teaches you Mathematics");
    expect(screen.getByRole("link", { name: /assadou@nga.ac.rw/ })).toHaveAttribute("href", "mailto:assadou@nga.ac.rw");
    expect(screen.getByRole("link", { name: /\+250780000000/ })).toHaveAttribute("href", "tel:+250780000000");
    expect(screen.getByText("Sessions held").previousSibling).toHaveTextContent("3");
    expect(screen.getByText("Last met")).toBeInTheDocument();
  });

  it("says clearly when no mentor is assigned for the year", async () => {
    render(<MemoryRouter><MyMentor /></MemoryRouter>);
    expect(await screen.findByText("No mentor assigned yet")).toBeInTheDocument();
    expect(screen.getByText(/for 2026 - 2027/)).toBeInTheDocument();
  });

  it("hands the student off to a Tupo chat with their mentor and lets them copy contacts", async () => {
    mentorPayload = {
      mentor_id: 5,
      mentor_name: "Assadou Nzigamasabo",
      mentor_first_name: "Assadou",
      mentor_email: "assadou@nga.ac.rw",
      mentor_phone: "+250780000000",
      mentor_role: "TEACHER",
      academic_year_name: "2026 - 2027",
      teaches_you: [],
      assigned_at: "2026-10-07",
      avatar: null,
      cover: null,
    };
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<MemoryRouter><MyMentor /></MemoryRouter>);
    const message = await screen.findByRole("link", { name: /Message on Tupo/ });
    expect(message.getAttribute("href")).toMatch(/\/app\/mentorship\?message=1$/);
    expect(message).toHaveAttribute("target", "_blank");
    expect(message.getAttribute("rel")).toContain("noopener");
    expect(screen.getByRole("link", { name: /Assadou's full profile/ }).getAttribute("href")).toMatch(/\/app\/mentorship$/);
    expect(screen.getByRole("link", { name: "Email Assadou Nzigamasabo" })).toHaveAttribute("href", "mailto:assadou@nga.ac.rw");
    expect(screen.getByRole("link", { name: "Call Assadou Nzigamasabo" })).toHaveAttribute("href", "tel:+250780000000");

    fireEvent.click(screen.getByRole("button", { name: "Copy phone" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("+250780000000"));
  });
});
