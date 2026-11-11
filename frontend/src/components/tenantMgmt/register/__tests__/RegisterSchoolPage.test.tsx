import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * /register-school happy path (plan §6.1): school (live slug check) -> package
 * (best fit) -> administrator (OTP stores the onboarding token, draft created)
 * -> review & submit (reference shown).
 */
const { pub, app } = vi.hoisted(() => ({
  pub: {
  packages: vi.fn(),
  adminDivisions: vi.fn(),
  captchaConfig: vi.fn(),
  similarSchools: vi.fn(),
  slugAvailable: vi.fn(),
  startAccount: vi.fn(),
  resendCode: vi.fn(),
  verifyAccount: vi.fn(),
  },
  app: {
  me: vi.fn(),
  createApplication: vi.fn(),
  updateApplication: vi.fn(),
  uploadDocument: vi.fn(),
  submit: vi.fn(),
  },
}));
vi.mock("../../../../api/tenantMgmt", async (orig) => {
  const actual: any = await orig();
  return { ...actual, publicApi: pub, applicantApi: app };
});
vi.mock("../../../ui/ThemeToggle", () => ({ default: () => null }));

import RegisterSchoolPage from "../RegisterSchoolPage";
import { ONBOARDING_TOKEN_KEY } from "../../../../api/tenantMgmt";

const pkg = (code: string, tier: number, students: number) => ({
  code,
  name: code[0].toUpperCase() + code.slice(1),
  tier,
  tagline: null,
  description: null,
  accent: "sky",
  isPublic: true,
  isActive: true,
  priceTerm: null,
  priceYear: null,
  currency: "RWF",
  entitlements: [{ key: "limit.students", kind: "LIMIT", value: students, label: "Students" }],
});

const baseMe = {
  account: { id: 1, email: "head@greenhills.rw", fullName: "Jane Head", phone: null, emailVerified: true, status: "ACTIVE" },
  application: null,
  timeline: [],
  documents: [],
  requiredDocuments: ["REGISTRATION_CERT"],
  invoice: null,
  paymentInstructions: [],
  provisioning: null,
  unreadMessages: 0,
  nextActions: [],
  school: null,
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Object.values(pub).forEach((f) => f.mockReset());
  Object.values(app).forEach((f) => f.mockReset());
  pub.packages.mockResolvedValue([pkg("starter", 1, 500), pkg("gold", 2, 2000)]);
  pub.adminDivisions.mockResolvedValue({ Kigali: { Gasabo: ["Remera", "Kacyiru"] } });
  pub.captchaConfig.mockResolvedValue({ provider: null, siteKey: null });
  pub.similarSchools.mockResolvedValue([]);
  pub.slugAvailable.mockImplementation(async (slug: string) => ({ slug, available: true, suggestion: null }));
  pub.startAccount.mockResolvedValue({ accountId: 1, otpSentTo: "h***@greenhills.rw", expiresInSec: 600 });
  pub.verifyAccount.mockResolvedValue({ token: "onb-token-123", me: baseMe });
  app.createApplication.mockResolvedValue({ id: 7, status: "DRAFT" });
  app.updateApplication.mockResolvedValue({ id: 7, status: "DRAFT" });
  app.me.mockResolvedValue({ ...baseMe, application: { id: 7, status: "DRAFT" } });
  app.submit.mockResolvedValue({ id: 7, ref: "APP-2026-0001", status: "SUBMITTED" });
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/register-school"]}>
      <Routes>
        <Route path="/register-school" element={<RegisterSchoolPage />} />
        <Route path="/onboarding" element={<div>TRACKER</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe("RegisterSchoolPage", () => {
  it("walks all four steps and submits", async () => {
    renderPage();

    // (1) School
    fireEvent.change(screen.getByLabelText("School name"), { target: { value: "Green Hills Academy" } });
    expect(screen.getByLabelText("Short name")).toHaveValue("green-hills-academy");
    fireEvent.click(screen.getByRole("radio", { name: "Secondary" }));
    await waitFor(() => expect(screen.getByLabelText("Province", { selector: "select" }).tagName).toBe("SELECT"));
    fireEvent.change(screen.getByLabelText("Province", { selector: "select" }), { target: { value: "Kigali" } });
    fireEvent.change(screen.getByLabelText("District", { selector: "select" }), { target: { value: "Gasabo" } });
    await waitFor(() => expect(pub.slugAvailable).toHaveBeenCalledWith("green-hills-academy"), { timeout: 2000 });
    expect(await screen.findByText("Available")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));

    // (2) Package: best fit for 300 students is Starter, pre-selected
    expect(await screen.findByRole("heading", { name: /Package/ })).toBeInTheDocument();
    expect(await screen.findByText("★ Best fit")).toBeInTheDocument();
    expect(screen.getByText("No payment now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Starter/, pressed: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));

    // (3) Administrator + OTP
    expect(await screen.findByRole("heading", { name: /Administrator/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Jane Head" } });
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "head@greenhills.rw" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Str0ngPass!" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    await waitFor(() => expect(pub.startAccount).toHaveBeenCalledWith(expect.objectContaining({ email: "head@greenhills.rw", fullName: "Jane Head", password: "Str0ngPass!" })));
    expect(await screen.findByText("h***@greenhills.rw")).toBeInTheDocument();
    "123456".split("").forEach((d, i) => fireEvent.change(screen.getByLabelText(`Verification code digit ${i + 1}`), { target: { value: d } }));

    await waitFor(() => expect(pub.verifyAccount).toHaveBeenCalledWith({ email: "head@greenhills.rw", code: "123456" }));
    await waitFor(() => expect(localStorage.getItem(ONBOARDING_TOKEN_KEY)).toBe("onb-token-123"));
    await waitFor(() => expect(app.createApplication).toHaveBeenCalled());
    expect(app.createApplication.mock.calls[0][0]).toEqual(
      expect.objectContaining({ schoolName: "Green Hills Academy", schoolType: "secondary", province: "Kigali", district: "Gasabo", desiredSlug: "green-hills-academy", requestedPackage: "starter", billingCycle: "TERM" }),
    );

    // (4) Review & submit
    const review = await screen.findByRole("heading", { name: /Review/ });
    expect(review).toBeInTheDocument();
    expect(screen.getByText("Green Hills Academy")).toBeInTheDocument();
    expect(await screen.findByText("Registration certificate")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Submit/ }));
    expect(await screen.findByText("Accept to continue")).toBeInTheDocument();
    expect(app.submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /^Submit/ }));
    await waitFor(() => expect(app.submit).toHaveBeenCalledWith(7, { acceptTerms: true, captchaToken: undefined }));
    expect(await screen.findByText("APP-2026-0001")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Track progress/ })).toHaveAttribute("href", "/onboarding");
    expect(sessionStorage.getItem("nga.register.wizard")).toBeNull();
  }, 20000);

  it("shows field errors and stays on step 1", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    expect(await screen.findByText("Name required")).toBeInTheDocument();
    expect(screen.getByText("Pick a type")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /School/ })).toBeInTheDocument();
  });

  it("offers the suggestion when the short name is taken", async () => {
    pub.slugAvailable.mockResolvedValue({ slug: "nga", available: false, suggestion: "nga-2" });
    renderPage();
    fireEvent.change(screen.getByLabelText("School name"), { target: { value: "NGA" } });
    const chip = await screen.findByRole("button", { name: /nga-2/ }, { timeout: 2000 });
    fireEvent.click(chip);
    expect(screen.getByLabelText("Short name")).toHaveValue("nga-2");
  });

  it("keeps the values across a reload (sessionStorage)", async () => {
    const first = renderPage();
    fireEvent.change(screen.getByLabelText("School name"), { target: { value: "Lake View School" } });
    first.unmount();
    renderPage();
    expect(screen.getByLabelText("School name")).toHaveValue("Lake View School");
  });

  it("a 409 on the draft links to the open application", async () => {
    sessionStorage.setItem(
      "nga.register.wizard",
      JSON.stringify({ step: 2, school: { schoolName: "X School", schoolType: "primary", province: "Kigali", district: "Gasabo", desiredSlug: "x-school" }, requestedPackage: "starter", admin: { fullName: "Jane Head", email: "head@greenhills.rw", phone: "" } }),
    );
    app.createApplication.mockRejectedValue({ response: { status: 409, data: { code: "APPLICATION_OPEN", message: "You already have an open application." } } });
    renderPage();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Str0ngPass!" } });
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
    await screen.findByText("h***@greenhills.rw");
    "123456".split("").forEach((d, i) => fireEvent.change(screen.getByLabelText(`Verification code digit ${i + 1}`), { target: { value: d } }));
    const link = await screen.findByRole("link", { name: /Open my application/ });
    expect(link).toHaveAttribute("href", "/onboarding");
    expect(within(document.body).getByText("You already have an open application.")).toBeInTheDocument();
  });
});
