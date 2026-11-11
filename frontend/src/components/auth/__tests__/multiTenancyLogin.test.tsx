import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Multi-tenancy on the sign-in page (MIS-A16): an account known to several schools
 * gets an accessible "choose your school" dialog and is signed in again with the
 * chosen school; a pending school lands on /onboarding; other refusals say why.
 */
const login = vi.fn();
vi.mock("../../../api/auth", () => ({
  login: (...a: unknown[]) => login(...a),
  verifyOTP: vi.fn(),
  googleLogin: vi.fn(),
  authorizeSSO: vi.fn(),
  checkSession: vi.fn().mockRejectedValue(new Error("no session")),
  forgotPassword: vi.fn(),
  verifyResetOTP: vi.fn(),
  resetPassword: vi.fn(),
}));
vi.mock("../../../contexts/UserContext", () => ({
  useUser: () => ({ refreshUser: vi.fn(), user: null }),
}));
vi.mock("../../../hooks/usePermissions", () => ({
  usePermissions: () => ({ getUserPermissions: vi.fn(() => []) }),
}));
vi.mock("@react-oauth/google", () => ({ GoogleLogin: () => null }));
vi.mock("../../ui/ThemeToggle", () => ({ default: () => null }));

import Login from "../../Login";

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding" element={<div>ONBOARDING PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );

const signIn = async () => {
  fireEvent.change(await screen.findByPlaceholderText("Enter your username or email"), { target: { value: "same@example.com" } });
  fireEvent.change(screen.getByPlaceholderText("Enter your password"), { target: { value: "pw-same" } });
  fireEvent.submit(screen.getByPlaceholderText("Enter your password").closest("form")!);
};

beforeEach(() => {
  login.mockReset();
});

describe("Login: choose your school", () => {
  it("shows a labelled dialog listing the schools and signs in again with the chosen one", async () => {
    login
      .mockResolvedValueOnce({
        choose: [
          { tid: 1, name: "NGA", slug: "nga" },
          { tid: 2, name: "MT Two", slug: "mt-two" },
        ],
        requiresTenant: true,
      })
      .mockResolvedValueOnce({ tempToken: "t", requiresOTP: true });
    renderLogin();
    await signIn();

    const dialog = await screen.findByRole("dialog", { name: "Choose your school" });
    const choice = within(dialog).getByRole("button", { name: "Sign in to MT Two" });
    expect(within(dialog).getByRole("button", { name: "Sign in to NGA" })).toBeInTheDocument();
    fireEvent.click(choice);

    await waitFor(() => expect(login).toHaveBeenCalledTimes(2));
    expect(login.mock.calls[0][0]).toEqual({ username: "same@example.com", password: "pw-same" });
    expect(login.mock.calls[1][0]).toEqual({ username: "same@example.com", password: "pw-same", tenant: "mt-two" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Choose your school" })).not.toBeInTheDocument());
  });

  it("sends a pending school to /onboarding", async () => {
    login.mockRejectedValueOnce({ response: { status: 403, data: { code: "TENANT_PENDING", message: "This school is not active yet." } } });
    renderLogin();
    await signIn();
    expect(await screen.findByText("ONBOARDING PAGE")).toBeInTheDocument();
  });

  it("explains a suspended school", async () => {
    login.mockRejectedValueOnce({ response: { status: 403, data: { code: "TENANT_SUSPENDED", message: "x" } } });
    renderLogin();
    await signIn();
    expect(await screen.findByText(/access is suspended/i)).toBeInTheDocument();
  });
});
