import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const get = vi.fn();
const put = vi.fn();
vi.mock("../../../services/api", () => ({ default: { get: (...a: any[]) => get(...a), put: (...a: any[]) => put(...a), post: vi.fn(), delete: vi.fn() } }));
let mockUser: any;
vi.mock("../../../contexts/UserContext", () => ({ useUser: () => ({ user: mockUser }) }));
const showToast = vi.fn();
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast }) }));
vi.mock("@react-oauth/google", () => ({ GoogleLogin: () => <div data-testid="google-btn" /> }));

import AttendanceGmailNotice from "../AttendanceGmailNotice";
import AttendanceGoogleCard from "../AttendanceGoogleCard";

const staff = (email: string, type = "TEACHER") => ({ user: { user_id: 41, email }, profile: { user_type: type } });
const unlinked = { data: { data: { linked: false, google_email: null, verified: false } } };

describe("Home notice: add the Gmail you check in with", () => {
  beforeEach(() => {
    localStorage.clear();
    get.mockReset();
    put.mockReset();
    showToast.mockReset();
  });

  it("shows for staff with a non-Gmail address and saves a typed Gmail", async () => {
    mockUser = staff("teacher@school.rw");
    get.mockResolvedValue(unlinked);
    put.mockResolvedValue({ data: { data: { linked: true, google_email: "teacher.phone@gmail.com", verified: false } } });
    render(<MemoryRouter><AttendanceGmailNotice /></MemoryRouter>);
    expect(await screen.findByText("Add the Gmail you check in with")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Other options/ }).getAttribute("href")).toBe("/profile#staff-attendance");
    fireEvent.change(screen.getByPlaceholderText("name@gmail.com"), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Enter a valid e-mail/)).toBeTruthy();
    expect(put).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("name@gmail.com"), { target: { value: " Teacher.Phone@Gmail.com " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/users/me/attendance-google", { email: "teacher.phone@gmail.com" }));
    await waitFor(() => expect(screen.queryByTestId("attendance-gmail-notice")).toBeNull());
  });

  it("stays hidden for Gmail users, students, linked accounts and after Not now", async () => {
    mockUser = staff("teacher@gmail.com");
    get.mockResolvedValue(unlinked);
    const a = render(<MemoryRouter><AttendanceGmailNotice /></MemoryRouter>);
    expect(get).not.toHaveBeenCalled();
    a.unmount();

    mockUser = staff("kid@school.rw", "STUDENT");
    const b = render(<MemoryRouter><AttendanceGmailNotice /></MemoryRouter>);
    expect(get).not.toHaveBeenCalled();
    b.unmount();

    mockUser = staff("teacher@school.rw");
    get.mockResolvedValue({ data: { data: { linked: true, google_email: "x@gmail.com", verified: true } } });
    const c = render(<MemoryRouter><AttendanceGmailNotice /></MemoryRouter>);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByTestId("attendance-gmail-notice")).toBeNull();
    c.unmount();

    get.mockResolvedValue(unlinked);
    const d = render(<MemoryRouter><AttendanceGmailNotice /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByTestId("attendance-gmail-notice")).toBeNull();
    d.unmount();
    get.mockClear();
    render(<MemoryRouter><AttendanceGmailNotice /></MemoryRouter>);
    expect(get).not.toHaveBeenCalled();
  });
});

describe("Profile card: Staff attendance", () => {
  beforeEach(() => {
    get.mockReset();
    put.mockReset();
  });

  it("lets a person type the Gmail (or use Google) and shows it waiting for the first check-in sign-in", async () => {
    get.mockResolvedValue(unlinked);
    put.mockResolvedValue({ data: { data: { linked: true, google_email: "me@gmail.com", verified: false } } });
    render(<AttendanceGoogleCard email="me@school.rw" />);
    expect(await screen.findByText(/is not a Gmail/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("name@gmail.com"), { target: { value: "me@gmail.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("me@gmail.com")).toBeTruthy();
    expect(screen.getByText(/Sign in with it once/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Change/ })).toBeTruthy();
  });
});
