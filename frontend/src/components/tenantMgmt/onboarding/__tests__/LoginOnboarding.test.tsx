import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/** Login.tsx: an applicant's sign-in answers `onboarding.token` -> stored, /onboarding. */
const { login } = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock("../../../../api/auth", () => ({
  login: (...a: unknown[]) => login(...a),
  verifyOTP: vi.fn(),
  googleLogin: vi.fn(),
  authorizeSSO: vi.fn(),
  checkSession: vi.fn().mockRejectedValue(new Error("no session")),
  forgotPassword: vi.fn(),
  verifyResetOTP: vi.fn(),
  resetPassword: vi.fn(),
}));
vi.mock("../../../../contexts/UserContext", () => ({ useUser: () => ({ refreshUser: vi.fn(), user: null }) }));
vi.mock("../../../../hooks/usePermissions", () => ({ usePermissions: () => ({ getUserPermissions: vi.fn(() => []) }) }));
vi.mock("@react-oauth/google", () => ({ GoogleLogin: () => null }));
vi.mock("../../../ui/ThemeToggle", () => ({ default: () => null }));

import Login from "../../../Login";
import { ONBOARDING_TOKEN_KEY } from "../../../../api/tenantMgmt";

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding" element={<div>ONBOARDING PAGE</div>} />
        <Route path="/register-school" element={<div>REGISTER PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );

const signIn = async () => {
  fireEvent.change(await screen.findByPlaceholderText("Enter your username or email"), { target: { value: "head@greenhills.rw" } });
  fireEvent.change(screen.getByPlaceholderText("Enter your password"), { target: { value: "pw" } });
  fireEvent.submit(screen.getByPlaceholderText("Enter your password").closest("form")!);
};

beforeEach(() => {
  login.mockReset();
  localStorage.clear();
});

describe("Login: applicants", () => {
  it("stores the onboarding token and goes to the tracker", async () => {
    login.mockResolvedValueOnce({ onboarding: { token: "onb-xyz" } });
    renderLogin();
    await signIn();
    expect(await screen.findByText("ONBOARDING PAGE")).toBeInTheDocument();
    expect(localStorage.getItem(ONBOARDING_TOKEN_KEY)).toBe("onb-xyz");
  });

  it("also reads a nested data.onboarding", async () => {
    login.mockResolvedValueOnce({ data: { onboarding: { token: "onb-nested" } } });
    renderLogin();
    await signIn();
    await waitFor(() => expect(localStorage.getItem(ONBOARDING_TOKEN_KEY)).toBe("onb-nested"));
  });

  it("has a Register your school button", async () => {
    renderLogin();
    fireEvent.click(await screen.findByRole("button", { name: /Register your school/ }));
    expect(await screen.findByText("REGISTER PAGE")).toBeInTheDocument();
  });
});
