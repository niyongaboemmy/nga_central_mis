import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import AccessStudio from "../AccessStudio";
import { ConfirmProvider } from "../../../contexts/ConfirmContext";
import { __resetAccessStore } from "../../../hooks/useAccess";

const api = vi.hoisted(() => ({
  me: vi.fn(),
  structure: vi.fn(),
  grants: vi.fn(),
  roles: vi.fn(),
  catalog: vi.fn(),
  rules: vi.fn(),
  departments: vi.fn(),
  updateRole: vi.fn(),
  createGrant: vi.fn(),
  audit: vi.fn(),
  shadowDiffs: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());

vi.mock("../../../api/access", async (orig) => ({
  ...(await orig<typeof import("../../../api/access")>()),
  accessApi: api,
}));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock("../../../api/users", () => ({
  searchUsers: vi.fn().mockResolvedValue([{ user_id: 7, username: "jdoe", email: "j@x", status: "ACTIVE", first_name: "Jane", last_name: "Doe", user_type: "TEACHER" }]),
}));

const snapshot = (caps: string[]) => ({
  v: 1,
  app: "mis",
  core: "1.0.0",
  user: { id: 1, persona: "ADMIN", school_id: 1 },
  year: 5,
  caps: Object.fromEntries(caps.map((c) => [c, [{ depth: null, scope: { all: true }, via: [1] }]])),
  grants: {},
  home: null,
  systems: [],
  generated_at: "",
});

const ROLE = {
  role_id: 20,
  name: "Academic Insights Viewer",
  description: "Aggregates only",
  status: "ACTIVE",
  preset_key: "academic_insights_viewer",
  category: "Leadership",
  allowed_scope_types: ["SCHOOL", "PROGRAM"],
  max_holders: null,
  platform_only: 0,
  is_preset: 1,
  version: 1,
  holders: 2,
  capabilities: [{ name: "VIEW_RESULTS", app: "mis", kind: "READ", depth: "summary", deprecated: false }],
};

beforeEach(() => {
  __resetAccessStore();
  localStorage.setItem("token", "t");
  Object.values(api).forEach((f) => f.mockReset());
  toast.mockReset();
  api.structure.mockResolvedValue({ nodes: { programs: [{ id: 2, name: "Primary" }], grades: [], classGroups: [], departments: [], subjects: [] }, positions: [] });
  api.grants.mockResolvedValue([]);
  api.roles.mockResolvedValue([ROLE]);
  api.catalog.mockResolvedValue({
    apps: [],
    capabilities: [
      { name: "VIEW_RESULTS", app: "mis", key: "VIEW_RESULTS", label: "View results", domain: "ASSESSMENT", kind: "READ", depths: ["summary", "detail"], restricted: false, scopeable: true, deprecated: false },
      { name: "ENTER_MARKS", app: "mis", key: "ENTER_MARKS", label: "Enter marks", domain: "ASSESSMENT", kind: "WRITE", depths: [], restricted: false, scopeable: true, deprecated: false },
    ],
  });
  api.rules.mockResolvedValue([]);
  api.departments.mockResolvedValue([]);
  api.audit.mockResolvedValue([]);
  api.shadowDiffs.mockResolvedValue([]);
});

describe("Access Studio", () => {
  it("fails closed without v2 access", async () => {
    api.me.mockResolvedValue(snapshot([]));
    render(<ConfirmProvider><AccessStudio /></ConfirmProvider>);
    expect(await screen.findByText(/do not have access to Access Studio/)).toBeInTheDocument();
  });

  it("shows only the structure to a viewer of the leadership structure", async () => {
    api.me.mockResolvedValue(snapshot(["VIEW_LEADERSHIP_STRUCTURE"]));
    render(<ConfirmProvider><AccessStudio /></ConfirmProvider>);
    await screen.findByText("Leadership & Access");
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Structure"]);
    expect(api.roles).not.toHaveBeenCalled();
    expect(await screen.findByText("Primary")).toBeInTheDocument();
  });

  it("edits a role's read depth and sends the full capability set", async () => {
    api.me.mockResolvedValue(snapshot(["ACCESS_STUDIO_VIEW", "ACCESS_ROLES_MANAGE"]));
    api.updateRole.mockResolvedValue(undefined);
    render(<ConfirmProvider><AccessStudio /></ConfirmProvider>);
    fireEvent.click(await screen.findByRole("tab", { name: "Roles" }));
    fireEvent.click(await screen.findByText("Academic Insights Viewer"));

    const depth = await screen.findByLabelText("Depth for VIEW_RESULTS", { selector: "select" });
    expect((depth as HTMLSelectElement).value).toBe("summary");
    fireEvent.change(depth, { target: { value: "detail" } });
    fireEvent.click(screen.getByLabelText("Allow ENTER_MARKS"));
    fireEvent.click(screen.getByText("Save role"));

    await waitFor(() => expect(api.updateRole).toHaveBeenCalled());
    const [roleId, body] = api.updateRole.mock.calls[0];
    expect(roleId).toBe(20);
    expect(body.capabilities).toEqual([
      { name: "VIEW_RESULTS", depth: "detail" },
      { name: "ENTER_MARKS", depth: null },
    ]);
    expect(body.allowed_scope_types).toEqual(["SCHOOL", "PROGRAM"]);
  });

  it("shows the server's delegation refusal when assigning a position", async () => {
    api.me.mockResolvedValue(snapshot(["ACCESS_STUDIO_VIEW", "ACCESS_GRANTS_MANAGE"]));
    api.createGrant.mockRejectedValue({ response: { data: { message: "You do not hold VIEW_RESULTS (detail) at this node yourself" } } });
    render(<ConfirmProvider><AccessStudio /></ConfirmProvider>);
    fireEvent.click(await screen.findByRole("tab", { name: "Positions" }));
    fireEvent.click(await screen.findByText("Assign a position"));

    fireEvent.change(screen.getByPlaceholderText(/Search people/), { target: { value: "jane" } });
    fireEvent.click(await screen.findByText("Jane Doe"));
    fireEvent.change(screen.getByDisplayValue("Choose a role"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/do not hold VIEW_RESULTS/)).toBeInTheDocument();
    expect(api.createGrant).toHaveBeenCalledWith(expect.objectContaining({ user_id: 7, role_id: 20, scope_type: "SCHOOL" }));
  });

  it("asks before discarding unsaved role edits, and keeps editing when told to", async () => {
    api.me.mockResolvedValue(snapshot(["ACCESS_STUDIO_VIEW", "ACCESS_ROLES_MANAGE"]));
    render(<ConfirmProvider><AccessStudio /></ConfirmProvider>);
    fireEvent.click(await screen.findByRole("tab", { name: "Roles" }));
    fireEvent.click(await screen.findByText("Academic Insights Viewer"));
    expect(screen.getByText("Save role")).toBeDisabled();
    fireEvent.change(await screen.findByLabelText("Depth for VIEW_RESULTS", { selector: "select" }), { target: { value: "detail" } });
    expect(screen.getByText("Save role")).toBeEnabled();
    fireEvent.click(screen.getByText("Cancel"));
    expect(await screen.findByText("Discard your changes?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Keep editing"));
    await waitFor(() => expect(screen.queryByText("Discard your changes?")).not.toBeInTheDocument());
    expect(screen.getByText("Role: Academic Insights Viewer")).toBeInTheDocument();
  });
});

