import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Schools from "../Schools";
import TenantLogo from "../brand/TenantLogo";

const api = vi.hoisted(() => ({
  getSchools: vi.fn(),
  createSchool: vi.fn(),
  updateSchool: vi.fn(),
  deleteSchool: vi.fn(),
  uploadSchoolLogo: vi.fn(),
  removeSchoolLogo: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
const confirmFn = vi.hoisted(() => vi.fn());
vi.mock("../../api/schools", async (orig) => ({ ...(await orig<typeof import("../../api/schools")>()), ...api }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock("../../contexts/ConfirmContext", () => ({ useConfirm: () => confirmFn }));
vi.mock("../../hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: (p: string) => p === "MANAGE_SCHOOLS" }) }));
vi.mock("../../hooks/useAccess", () => ({ useAccess: () => ({ can: () => false, loading: false }) }));
vi.mock("../tenantMgmt/account/usePackage", () => ({ useTenantStatus: () => ({ data: null }), isSystemEntitled: () => true }));

const nga = {
  school_id: 1,
  name: "New Generation Coding Academy",
  school_code: "120823",
  address: "Kimihurura",
  contact_email: "office@school.test",
  contact_phone: "+250 788 000 000",
  logo: "schools/1/logo-primary-1.png",
  status: "ACTIVE" as const,
  logo_version: 99,
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <Schools />
    </MemoryRouter>,
  );

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  toast.mockReset();
  confirmFn.mockReset().mockResolvedValue(true);
  api.getSchools.mockResolvedValue([nga]);
});

describe("Tenants & Schools", () => {
  it("shows the logo with its version, marks the record in use, and filters", async () => {
    renderPage();
    const card = (await screen.findByText(nga.name)).closest("div.flex.flex-col") as HTMLElement;
    const img = within(card).getByRole("img", { name: nga.name }) as HTMLImageElement;
    expect(img.src).toContain("/schools/1/logo/primary?v=99");
    expect(within(card).getByText("In use")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /inactive/i }));
    expect(screen.getByText("No schools match")).toBeInTheDocument();
  });

  it("validates inline and never sends logo paths on save", async () => {
    api.updateSchool.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: `Edit ${nga.name}` }));
    const email = screen.getByLabelText(/contact email/i);
    fireEvent.change(email, { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByText("Doesn't look like an email address")).toBeInTheDocument();
    expect(api.updateSchool).not.toHaveBeenCalled();

    fireEvent.change(email, { target: { value: "head@school.test" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(api.updateSchool).toHaveBeenCalled());
    const payload = api.updateSchool.mock.calls[0][1];
    expect(payload.contact_email).toBe("head@school.test");
    expect(payload).not.toHaveProperty("logo");
    expect(payload).not.toHaveProperty("partner_logo");
    expect(toast).toHaveBeenCalledWith("School saved", "success");
  });

  it("won't deactivate the only active record", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: `Deactivate ${nga.name}` }));
    expect(api.deleteSchool).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/only active school/i), "error");
  });

  it("offers a retry when the list can't load", async () => {
    api.getSchools.mockRejectedValueOnce({ response: { data: { message: "Server down" } } }).mockResolvedValueOnce([nga]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByText(nga.name)).toBeInTheDocument();
  });
});

describe("TenantLogo", () => {
  it("falls back to initials, or NGA's shield, when the image fails", () => {
    const { rerender } = render(<TenantLogo src="https://x.test/broken.png" name="Hill Top School" isPrimary={false} />);
    fireEvent.error(screen.getByRole("img", { name: "Hill Top School" }));
    expect(screen.getByRole("img", { name: "Hill Top School" }).textContent).toBe("HT");
    rerender(<TenantLogo src="https://x.test/broken2.png" name="NGA" isPrimary />);
    fireEvent.error(screen.getByRole("img", { name: "NGA" }));
    expect((screen.getByRole("img", { name: "NGA" }) as HTMLImageElement).src).toMatch(/logo/);
  });
});
