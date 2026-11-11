import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * /onboarding (plan §6.2): sign-in without a token, OnboardingPending for a
 * school session, and the action cards each nextActions set asks for.
 */
const { pub, app } = vi.hoisted(() => ({
  pub: { login: vi.fn(), packages: vi.fn(), adminDivisions: vi.fn(), slugAvailable: vi.fn(), similarSchools: vi.fn() },
  app: {
    me: vi.fn(),
    messages: vi.fn(),
    sendMessage: vi.fn(),
    submit: vi.fn(),
    updateApplication: vi.fn(),
    uploadDocument: vi.fn(),
    submitPayment: vi.fn(),
    invoicePdfUrl: vi.fn(() => "/pdf"),
    withdraw: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
  },
}));
vi.mock("../../../../api/tenantMgmt", async (orig) => {
  const actual: any = await orig();
  return { ...actual, publicApi: pub, applicantApi: app };
});
vi.mock("../../../ui/ThemeToggle", () => ({ default: () => null }));
// shared components owned by package G: stub them to their props
vi.mock("../../shared/InvoiceCard", () => ({
  default: (p: any) => (
    <div data-testid="invoice-card">
      {p.invoice.number}
      {p.onPay && (
        <button type="button" onClick={p.onPay}>
          Pay
        </button>
      )}
    </div>
  ),
}));
vi.mock("../../shared/PaymentProofForm", () => ({
  default: (p: any) => (
    <button type="button" data-testid="proof-form" onClick={() => p.onSubmit({ method: "MOMO", reference: "R1", amount: 1000, paidAt: "2026-11-10" })}>
      Send proof
    </button>
  ),
}));

import OnboardingTracker from "../OnboardingTracker";
import { ONBOARDING_TOKEN_KEY } from "../../../../api/tenantMgmt";

const application = (over: Record<string, unknown> = {}) => ({
  id: 7,
  ref: "APP-2026-0001",
  status: "UNDER_REVIEW",
  step: "review",
  schoolName: "Green Hills Academy",
  schoolType: "secondary",
  country: "Rwanda",
  province: "Kigali",
  district: "Gasabo",
  sector: null,
  address: null,
  schoolPhone: null,
  schoolEmail: null,
  website: null,
  estStudents: 300,
  estStaff: 30,
  desiredSlug: "green-hills",
  requestedPackage: "starter",
  billingCycle: "TERM",
  requestedApps: [],
  notes: null,
  approvedPackage: null,
  submittedAt: "2026-11-01T08:00:00Z",
  decidedAt: null,
  decisionReason: null,
  expiresAt: null,
  tenantId: null,
  createdAt: "2026-11-01T08:00:00Z",
  updatedAt: null,
  ...over,
});

const me = (over: Record<string, unknown> = {}) => ({
  account: { id: 1, email: "head@greenhills.rw", fullName: "Jane Head", phone: null, emailVerified: true, status: "ACTIVE" },
  application: application(),
  timeline: [],
  documents: [],
  requiredDocuments: [],
  invoice: null,
  paymentInstructions: [],
  provisioning: null,
  unreadMessages: 0,
  nextActions: ["WAIT"],
  school: null,
  ...over,
});

const invoice = {
  id: 3,
  number: "INV-2026-0003",
  kind: "NEW",
  applicationId: 7,
  tenantId: null,
  packageCode: "starter",
  billingCycle: "TERM",
  periodStart: null,
  periodEnd: null,
  amount: 150000,
  currency: "RWF",
  status: "ISSUED",
  issuedAt: "2026-11-05T08:00:00Z",
  dueAt: "2026-11-19T08:00:00Z",
  paidAt: null,
  lines: [],
  notes: null,
  pdfUrl: null,
  payments: [],
};

const renderTracker = () =>
  render(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingTracker />} />
        <Route path="/register-school" element={<div>REGISTER</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  Object.values(pub).forEach((f) => f.mockReset());
  Object.values(app).forEach((f) => (f as any).mockReset());
  pub.packages.mockResolvedValue([]);
  pub.adminDivisions.mockResolvedValue({});
  app.messages.mockResolvedValue([]);
  app.logout.mockResolvedValue({ ok: true });
});

const signedIn = (data: ReturnType<typeof me>) => {
  localStorage.setItem(ONBOARDING_TOKEN_KEY, "onb");
  app.me.mockResolvedValue(data);
};

describe("OnboardingTracker", () => {
  it("without a token or session shows the applicant sign-in", async () => {
    pub.login.mockResolvedValue({ token: "fresh", me: me() });
    app.me.mockResolvedValue(me());
    renderTracker();
    expect(screen.getByRole("heading", { name: "My application" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Register your school/ })).toHaveAttribute("href", "/register-school");
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "head@greenhills.rw" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: /Sign in/ }));
    await waitFor(() => expect(localStorage.getItem(ONBOARDING_TOKEN_KEY)).toBe("fresh"));
    expect(await screen.findByRole("heading", { name: "Green Hills Academy" })).toBeInTheDocument();
  });

  it("with a school session but no onboarding token shows the pending page", () => {
    localStorage.setItem("token", "session");
    renderTracker();
    expect(screen.getByText("Your school's application is under review")).toBeInTheDocument();
  });

  it("WAIT: the hero, stepper and the waiting card", async () => {
    signedIn(me());
    renderTracker();
    expect(await screen.findByRole("heading", { name: "Green Hills Academy" })).toBeInTheDocument();
    expect(screen.getByText("APP-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("Reviewing your school")).toBeInTheDocument();
  });

  it("PAY_INVOICE: invoice card, then the proof form submits the payment", async () => {
    signedIn(me({ application: application({ status: "APPROVED_AWAITING_PAYMENT", step: "payment" }), invoice, nextActions: ["PAY_INVOICE"] }));
    app.submitPayment.mockResolvedValue({ id: 1 });
    renderTracker();
    expect(await screen.findByText("Invoice ready")).toBeInTheDocument();
    expect(screen.getByTestId("invoice-card")).toHaveTextContent("INV-2026-0003");
    fireEvent.click(screen.getByRole("button", { name: "Pay" }));
    fireEvent.click(await screen.findByTestId("proof-form"));
    await waitFor(() => expect(app.submitPayment).toHaveBeenCalledWith(3, { method: "MOMO", reference: "R1", amount: 1000, paidAt: "2026-11-10" }, undefined));
  });

  it("FIX_CHANGES: shows the reviewer's note and resubmits", async () => {
    signedIn(
      me({
        application: application({ status: "CHANGES_REQUESTED" }),
        timeline: [{ id: 1, at: "2026-11-03T08:00:00Z", from: "UNDER_REVIEW", to: "CHANGES_REQUESTED", kind: "STATUS", actor: "PLATFORM", message: "Please add the sector." }],
        nextActions: ["FIX_CHANGES"],
      }),
    );
    app.submit.mockResolvedValue(application({ status: "SUBMITTED" }));
    renderTracker();
    expect(await screen.findByRole("heading", { name: "Changes requested" })).toBeInTheDocument();
    expect(screen.getAllByText("Please add the sector.").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Edit details/ }));
    expect(screen.getByLabelText("School name")).toHaveValue("Green Hills Academy");
    fireEvent.click(screen.getByRole("button", { name: /Resubmit/ }));
    await waitFor(() => expect(app.updateApplication).toHaveBeenCalledWith(7, expect.objectContaining({ schoolName: "Green Hills Academy" })));
    await waitFor(() => expect(app.submit).toHaveBeenCalledWith(7, { acceptTerms: true }));
  });

  it("PROVISIONING: live step list", async () => {
    signedIn(
      me({
        application: application({ status: "PROVISIONING", step: "setup" }),
        nextActions: ["WAIT"],
        provisioning: {
          id: 1,
          status: "RUNNING",
          attempt: 1,
          startedAt: null,
          finishedAt: null,
          steps: [
            { key: "db", label: "Creating your MIS", status: "DONE", startedAt: null, finishedAt: null },
            { key: "admin", label: "Creating your account", status: "RUNNING", startedAt: null, finishedAt: null },
            { key: "apps", label: "Connecting apps", status: "PENDING", startedAt: null, finishedAt: null },
          ],
        },
      }),
    );
    renderTracker();
    expect(await screen.findByRole("list", { name: "Setup steps" })).toBeInTheDocument();
    expect(screen.getByText("Creating your MIS")).toBeInTheDocument();
    expect(screen.getByText("(done)")).toBeInTheDocument();
    expect(screen.getByText("(in progress)")).toBeInTheDocument();
    expect(screen.getByText("33%")).toBeInTheDocument();
  });

  it("GO_TO_SCHOOL: big button drops the onboarding token", async () => {
    signedIn(
      me({
        application: application({ status: "ACTIVE", step: "live" }),
        nextActions: ["GO_TO_SCHOOL"],
        school: { tid: 5, slug: "green-hills", name: "Green Hills Academy", loginUrl: "https://green-hills.amashuri.com/login" },
      }),
    );
    renderTracker();
    expect(await screen.findByText("Your school is live")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Go to your school/ }));
    expect(localStorage.getItem(ONBOARDING_TOKEN_KEY)).toBeNull();
  });

  it("an expired token (401) falls back to sign-in", async () => {
    localStorage.setItem(ONBOARDING_TOKEN_KEY, "old");
    app.me.mockRejectedValue({ response: { status: 401, data: { code: "ONBOARDING_AUTH" } } });
    renderTracker();
    expect(await screen.findByText("Session ended")).toBeInTheDocument();
    expect(localStorage.getItem(ONBOARDING_TOKEN_KEY)).toBeNull();
  });

  it("REJECTED: the reason, no action cards", async () => {
    signedIn(me({ application: application({ status: "REJECTED", decisionReason: "Duplicate of an existing school." }), nextActions: [] }));
    renderTracker();
    expect(await screen.findByText("Not approved")).toBeInTheDocument();
    expect(screen.getByText("Duplicate of an existing school.")).toBeInTheDocument();
    expect(screen.queryByText("Invoice ready")).not.toBeInTheDocument();
  });
});
