import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SubscriptionPage from "../SubscriptionPage";
import { makeAccount, makeInvoice, iso } from "./fixtures";

const api = vi.hoisted(() => ({
  account: vi.fn(),
  invoices: vi.fn(),
  changeRequest: vi.fn(),
  submitPayment: vi.fn(),
  status: vi.fn(),
  invoicePdfUrl: (id: number) => `/tenant/invoices/${id}/pdf`,
}));
vi.mock("../../../../api/tenantMgmt", async (orig) => ({ ...(await orig<typeof import("../../../../api/tenantMgmt")>()), tenantApi: api }));
vi.mock("../../../../hooks/useAccess", () => ({ useAccess: () => ({ loading: false, can: () => true }) }));

const renderPage = () =>
  render(
    <MemoryRouter>
      <SubscriptionPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  Object.values(api).forEach((f) => typeof f === "function" && "mockReset" in f && (f as any).mockReset());
  api.account.mockResolvedValue(makeAccount());
  api.invoices.mockResolvedValue([makeInvoice({ id: 9, number: "INV-9", status: "PAID" })]);
  api.status.mockResolvedValue({ status: "ACTIVE", graceUntil: null, daysLeft: null, warnings: [], entitlements: makeAccount().entitlements });
});

describe("SubscriptionPage", () => {
  it("shows a ring for every usage meter and the invoice history", async () => {
    renderPage();
    const meters = await screen.findByTestId("meters");
    expect(within(meters).getByText("Students: 120 of 800")).toBeInTheDocument();
    expect(within(meters).getByText("Code runs today: 10 of unlimited")).toBeInTheDocument();
    expect(within(meters).getAllByTitle(/./)).toHaveLength(6);
    expect(screen.getByText("INV-9")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /support access/i })).toHaveAttribute("href", "/settings/support");
  });

  it("upgrade: animated diff, NOW by default, then the new invoice opens for payment", async () => {
    const invoice = makeInvoice({ id: 77, number: "INV-77", packageCode: "premium" });
    api.changeRequest.mockResolvedValue({ invoice, effective: "NOW" });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /change plan/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Premium/ }));
    const diff = screen.getByTestId("plan-diff");
    expect(within(diff).getByTestId("gain-feature.safeguarding")).toBeInTheDocument();
    expect(within(diff).getByTestId("gain-app.taskmentor")).toBeInTheDocument();
    expect(within(diff).queryByTestId(/^lose-/)).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /now/i })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: /^request$/i }));
    await waitFor(() => expect(api.changeRequest).toHaveBeenCalledWith({ packageCode: "premium", billingCycle: "TERM", effective: "NOW" }));
    expect(await screen.findByText("Pay INV-77")).toBeInTheDocument();
  });

  it("downgrade: lost icons, forced to the next period", async () => {
    api.changeRequest.mockResolvedValue({ invoice: makeInvoice({ id: 78 }), effective: "NEXT_PERIOD" });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /change plan/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Starter/ }));
    expect(screen.getByTestId("lose-feature.office_hours")).toBeInTheDocument();
    expect(screen.getByTestId("lose-app.tendo")).toBeInTheDocument();
    expect(screen.getByTestId("effective-next")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^request$/i }));
    await waitFor(() => expect(api.changeRequest).toHaveBeenCalledWith({ packageCode: "starter", billingCycle: "TERM", effective: "NEXT_PERIOD" }));
  });

  it("GRACE: a prominent card with Pay opening the open invoice", async () => {
    const open = makeInvoice({ id: 50, number: "INV-50", kind: "RENEWAL", dueAt: iso(-2), status: "OVERDUE" });
    api.account.mockResolvedValue(makeAccount({ tenant: { ...makeAccount().tenant, status: "GRACE", graceUntil: iso(6) }, openInvoices: [open] }));
    api.submitPayment.mockResolvedValue({});
    renderPage();
    expect(await screen.findByText("Subscription expired")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /6 days of grace left/i })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /^pay$/i })[0]);
    expect(await screen.findByText("Pay INV-50")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reference"), { target: { value: "MM-1" } });
    fireEvent.click(screen.getByRole("button", { name: /send proof/i }));
    await waitFor(() =>
      expect(api.submitPayment).toHaveBeenCalledWith(50, expect.objectContaining({ method: "MOMO", reference: "MM-1", amount: 250000 }), undefined),
    );
  });
});
