import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ModuleSchoolsPanel from "../platform/ModuleSchoolsPanel";
import type { ModuleSchools } from "../../../api/tenantMgmt";

const api = vi.hoisted(() => ({ moduleSchools: vi.fn(), setModuleSchools: vi.fn() }));
const confirm = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());
vi.mock("../../../api/tenantMgmt", async (orig) => ({ ...(await orig<typeof import("../../../api/tenantMgmt")>()), platformApi: api }));
vi.mock("../../../contexts/ConfirmContext", () => ({ useConfirm: () => confirm }));
vi.mock("../platform/platformShared", async (orig) => {
  const real = await orig<typeof import("../platform/platformShared")>();
  return {
    ...real,
    act: async (fn: () => Promise<unknown>, ok?: string) => {
      try {
        const out = await fn();
        if (ok) toast(ok, "success");
        return out;
      } catch {
        toast("failed", "error");
        return undefined;
      }
    },
  };
});

const school = (tid: number, name: string, over: Partial<ModuleSchools["schools"][number]> = {}) => ({
  tid,
  name,
  slug: name.toLowerCase(),
  isPrimary: tid === 1,
  lifecycle: "ACTIVE",
  pkg: "gold",
  status: "DISABLED" as const,
  source: "NONE" as const,
  inPackage: false,
  needsPackage: false,
  ...over,
});
const data = (schools: ModuleSchools["schools"]): ModuleSchools => ({
  module: { systemId: 7, name: "Assets", clientId: "assets", key: null, entitlementKey: "module.7", moduleStatus: "ACTIVE" },
  schools,
});

beforeEach(() => {
  api.moduleSchools.mockReset();
  api.setModuleSchools.mockReset();
  confirm.mockReset();
  toast.mockReset();
});

describe("a module's schools", () => {
  it("lists every school with its state, including the ones never given the module", async () => {
    api.moduleSchools.mockResolvedValue(data([school(1, "Hill", { status: "ACTIVE", source: "OVERRIDE" }), school(2, "Lake"), school(3, "Park", { status: "ACTIVE", source: "PACKAGE", inPackage: true })]));
    render(<ModuleSchoolsPanel systemId={7} moduleName="Assets" />);
    expect(await screen.findByText("Lake")).toBeInTheDocument();
    expect(screen.getByText(/2 of 3 schools can open Assets/)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Assets for Hill" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Assets for Lake" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Not assigned")).toBeInTheDocument();
    expect(screen.getByText("Set by hand")).toBeInTheDocument();
    expect(screen.getByText("Package")).toBeInTheDocument();
  });

  it("switches one school on and says so", async () => {
    api.moduleSchools.mockResolvedValue(data([school(2, "Lake")]));
    api.setModuleSchools.mockResolvedValue(data([school(2, "Lake", { status: "ACTIVE", source: "OVERRIDE" })]));
    render(<ModuleSchoolsPanel systemId={7} moduleName="Assets" />);
    fireEvent.click(await screen.findByRole("switch", { name: "Assets for Lake" }));
    await waitFor(() => expect(api.setModuleSchools).toHaveBeenCalledWith(7, [2], "ACTIVE"));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Assets for Lake" })).toHaveAttribute("aria-checked", "true"));
    expect(toast).toHaveBeenCalledWith("Assets is on for Lake", "success");
  });

  it("turns it on for every school only after a confirmation", async () => {
    api.moduleSchools.mockResolvedValue(data([school(1, "Hill"), school(2, "Lake")]));
    api.setModuleSchools.mockResolvedValue(data([school(1, "Hill", { status: "ACTIVE", source: "OVERRIDE" }), school(2, "Lake", { status: "ACTIVE", source: "OVERRIDE" })]));
    render(<ModuleSchoolsPanel systemId={7} moduleName="Assets" />);
    const all = await screen.findByRole("button", { name: "Turn on for all schools" });

    confirm.mockResolvedValueOnce(false);
    fireEvent.click(all);
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(api.setModuleSchools).not.toHaveBeenCalled();

    confirm.mockResolvedValueOnce(true);
    fireEvent.click(all);
    await waitFor(() => expect(api.setModuleSchools).toHaveBeenCalledWith(7, "all", "ACTIVE"));
    expect(await screen.findByRole("button", { name: "Turn off for all schools" })).toBeInTheDocument();
  });

  it("says when a built-in app is not in a school's package", async () => {
    api.moduleSchools.mockResolvedValue(data([school(2, "Lake", { status: "ACTIVE", source: "OVERRIDE", needsPackage: true })]));
    render(<ModuleSchoolsPanel systemId={7} moduleName="Task Mentor" />);
    expect(await screen.findByText("Not in package")).toBeInTheDocument();
    expect(screen.getByText(/0 of 1 schools can open Task Mentor/)).toBeInTheDocument();
  });

  it("offers a retry when the list cannot be loaded", async () => {
    api.moduleSchools.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(data([school(2, "Lake")]));
    render(<ModuleSchoolsPanel systemId={7} moduleName="Assets" />);
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByText("Lake")).toBeInTheDocument();
  });
});
