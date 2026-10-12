import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MenteeProfilePage } from "../MyMenteesPages";

const getMenteeMock = vi.fn();
vi.mock("../../../api/mentorship", async () => {
  const actual = await vi.importActual<any>("../../../api/mentorship");
  return { ...actual, mentorshipApi: { ...actual.mentorshipApi, getMentee: (id: number) => getMenteeMock(id) } };
});
vi.mock("../StudentSupportProfile", () => ({
  default: ({ student }: { student: { first_name: string } }) => <p>Profile of {student.first_name}</p>,
}));
vi.mock("../MentorCheckInInbox", () => ({ default: () => <p>Inbox</p> }));

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/my-mentees/:studentId" element={<MenteeProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );

describe("MenteeProfilePage (/my-mentees/:studentId)", () => {
  beforeEach(() => {
    getMenteeMock.mockReset();
  });

  it("opens a mentee straight from a link", async () => {
    getMenteeMock.mockResolvedValue({ data: { data: { user_id: 7, first_name: "Eric" } } });
    renderAt("/my-mentees/7");
    expect(await screen.findByText("Profile of Eric")).toBeInTheDocument();
    expect(getMenteeMock).toHaveBeenCalledWith(7);
  });

  it("explains a student who is not (or no longer) the mentor's mentee", async () => {
    getMenteeMock.mockImplementation(() => Promise.reject(Object.assign(new Error("Not found"), { response: { status: 404 } })));
    renderAt("/my-mentees/8");
    expect(await screen.findByText("This student is not one of your mentees")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to my mentees" })).toHaveAttribute("href", "/my-mentees");
  });

  it("does not call the API for a malformed id", async () => {
    renderAt("/my-mentees/abc");
    expect(await screen.findByText("This student is not one of your mentees")).toBeInTheDocument();
    expect(getMenteeMock).not.toHaveBeenCalled();
  });
});
