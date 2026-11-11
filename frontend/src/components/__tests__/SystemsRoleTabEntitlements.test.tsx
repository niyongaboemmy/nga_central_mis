import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AssignModal } from "../Systems";
import { __resetPackageStore } from "../tenantMgmt/account/usePackage";

const tenant = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock("../../api/tenantMgmt", async (orig) => ({ ...(await orig<typeof import("../../api/tenantMgmt")>()), tenantApi: tenant }));
vi.mock("../../api/schools", () => ({ getSchools: vi.fn().mockResolvedValue([{ school_id: 1, name: "Hill" }]) }));
vi.mock("../../api/users", () => ({ getRoles: vi.fn().mockResolvedValue([{ role_id: 3, name: "Teacher" }]) }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("../../contexts/UserContext", () => ({ useUser: () => ({ user: null }) }));

const sys = (client_id: string) => ({ system_id: 2, name: "Task Mentor", client_id, icon_url: "", home_url: "", status: "ACTIVE" as const });
const status = (ent: object) => ({ status: "ACTIVE", graceUntil: null, daysLeft: null, warnings: [], entitlements: { pkg: "starter", limits: {}, features: [], ...ent } });

const openRoleTab = (client_id: string) => {
  render(
    <MemoryRouter>
      <AssignModal isOpen onClose={() => undefined} system={sys(client_id)} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: /to role/i }));
};

beforeEach(() => {
  localStorage.setItem("token", "t");
  tenant.status.mockReset();
});

describe("Systems -> Assign to role, limited to the package", () => {
  it("locks a system whose app is not in the package", () => {
    __resetPackageStore(status({ unrestricted: false, apps: ["app.mis"] }) as any);
    openRoleTab("taskmentor_app");
    expect(screen.getByText(/not in your package/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /grant role access/i })).not.toBeInTheDocument();
  });

  it("lists an entitled system as before", () => {
    __resetPackageStore(status({ unrestricted: false, apps: ["app.mis", "app.taskmentor"] }) as any);
    openRoleTab("taskmentor_app");
    expect(screen.getByRole("button", { name: /grant role access/i })).toBeInTheDocument();
  });

  it("shows everything when the school is unrestricted", () => {
    __resetPackageStore(status({ unrestricted: true, apps: [] }) as any);
    openRoleTab("tupo");
    expect(screen.getByRole("button", { name: /grant role access/i })).toBeInTheDocument();
  });

  it("never gates systems outside the package catalogue", () => {
    __resetPackageStore(status({ unrestricted: false, apps: [] }) as any);
    openRoleTab("some_other_client");
    expect(screen.getByRole("button", { name: /grant role access/i })).toBeInTheDocument();
  });
});
