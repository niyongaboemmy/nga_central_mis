import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { PlanData, ProjectDetail, Task } from "../../../api/sideProjects";

const api = vi.hoisted(() => ({
  plan: vi.fn(),
  planTemplates: vi.fn(),
  generatePlan: vi.fn(),
  createTask: vi.fn(),
  moveTask: vi.fn(),
  delivery: vi.fn(),
  myTasks: vi.fn(),
  setTeamMode: vi.fn(),
  customers: vi.fn(),
  createCustomer: vi.fn(),
  customerLogoUrl: vi.fn(() => "about:blank"),
  me: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("../../../api/sideProjects", async (orig) => ({ ...(await orig<object>()), sideProjectsApi: api }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock("../../../contexts/ConfirmContext", () => ({ useConfirm: () => async () => true }));

import WorkPanel from "../work/WorkPanel";
import { TaskModal, planOptions } from "../work/TaskModals";
import TeamPanel from "../work/TeamPanel";
import MyTasks from "../work/MyTasks";
import { CustomerField, CustomerModal } from "../customers/CustomerParts";

const project = (over: Partial<ProjectDetail> = {}): ProjectDetail =>
  ({
    id: 9,
    title: "Smart irrigation",
    status: "IN_PROGRESS",
    kind: "STUDENT",
    owner: { id: 1, name: "Aline Uwase", regNumber: "R1", type: "STUDENT", avatar: null },
    members: [{ id: 2, status: "ACCEPTED", name: "Eric Mugisha", regNumber: "R2", type: "STUDENT", roleKey: "DEVELOPER", roleTitle: "Frontend developer", responsibilities: "Sign-in screens", isManager: false }],
    teamMode: "TEAM",
    customerMode: "OWN",
    customerDetail: null,
    rights: { edit: true, owner: true, review: false, manageAny: false, supervisor: false, manage: true },
    lastActivityAt: new Date().toISOString(),
    ...over,
  }) as unknown as ProjectDetail;

const plan: PlanData = {
  items: [
    { id: 10, parentId: null, kind: "PHASE", title: "Build", description: null, status: "IN_PROGRESS", statusMode: "AUTO", priority: "MEDIUM", stage: "IN_PROGRESS", ownerId: 1, ownerName: "Aline", startDate: "2026-11-01", dueDate: "2026-12-01", estimateHours: null, sort: 1, doneAt: null, statusChangedAt: null },
    { id: 11, parentId: 10, kind: "FEATURE", title: "Sign-in", description: null, status: "IN_PROGRESS", statusMode: "AUTO", priority: "HIGH", stage: "IN_PROGRESS", ownerId: 2, ownerName: "Eric", startDate: null, dueDate: "2026-11-20", estimateHours: null, sort: 1, doneAt: null, statusChangedAt: null },
    { id: 12, parentId: 10, kind: "FEATURE", title: "Dashboard", description: null, status: "DONE", statusMode: "AUTO", priority: "MEDIUM", stage: "IN_PROGRESS", ownerId: null, ownerName: null, startDate: null, dueDate: null, estimateHours: null, sort: 2, doneAt: null, statusChangedAt: null },
  ],
  tasks: [
    { id: 100, projectId: 9, planItemId: 11, title: "Build the form", description: null, status: "IN_PROGRESS", priority: "HIGH", assigneeId: 2, assigneeName: "Eric Mugisha", dueDate: null, estimateHours: 3, blockedReason: null, sort: 1, startedAt: null, completedAt: null, statusChangedAt: null, createdAt: new Date().toISOString(), createdBy: 2, spentHours: 1, overdue: false },
  ] as Task[],
};

describe("plan & tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try {
      localStorage.clear();
    } catch {
      /* jsdom */
    }
  });

  it("guides an empty plan: managers generate from a template, others are told who plans", async () => {
    api.plan.mockResolvedValue({ items: [], tasks: [] });
    const { unmount } = render(<WorkPanel p={project()} meId={1} onChanged={vi.fn()} />);
    expect(await screen.findByText("No implementation plan yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate from a template/ })).toBeInTheDocument();
    unmount();
    render(<WorkPanel p={project({ rights: { edit: true, owner: false, review: false, manageAny: false, supervisor: false, manage: false } })} meId={2} onChanged={vi.fn()} />);
    expect(await screen.findByText(/owner or a team manager sets up the plan/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate from a template/ })).toBeNull();
  });

  it("shows phases, features with rolled-up status, and the feature progress", async () => {
    api.plan.mockResolvedValue(plan);
    render(<WorkPanel p={project()} meId={1} onChanged={vi.fn()} />);
    expect(await screen.findByText("1 of 2 features done")).toBeInTheDocument();
    const phase = screen.getByRole("region", { name: "Build" });
    expect(within(phase).getByText("Sign-in")).toBeInTheDocument();
    expect(within(phase).getByText("Dashboard")).toBeInTheDocument();
    expect(within(phase).getByText(/1\/2 features/)).toBeInTheDocument();
  });

  it("lists tasks on the board by state; switching views keeps the data", async () => {
    api.plan.mockResolvedValue(plan);
    render(<WorkPanel p={project()} meId={1} onChanged={vi.fn()} />);
    await screen.findByText("1 of 2 features done");
    fireEvent.click(screen.getByRole("tab", { name: /Tasks/ }));
    const col = screen.getByRole("region", { name: "In progress column" });
    expect(within(col).getByText("Build the form")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Done column" })).toBeInTheDocument();
  });

  it("plan-item options group features under their phase", () => {
    expect(planOptions(plan)).toEqual([
      { id: 10, label: "Build (whole phase)", group: "Build" },
      { id: 11, label: "Sign-in", group: "Build" },
      { id: 12, label: "Dashboard", group: "Build" },
    ]);
  });

  it("a teammate's new task is theirs; the title and plan item are required", async () => {
    api.createTask.mockResolvedValue({ id: 101 });
    const onSaved = vi.fn();
    const p = project({ rights: { edit: true, owner: false, review: false, manageAny: false, supervisor: false, manage: false } });
    render(<TaskModal p={p} data={plan} team={[{ id: 1, name: "Aline Uwase" }, { id: 2, name: "Eric Mugisha" }]} meId={2} open defaultItem={11} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: /Add task/ }));
    expect(await screen.findByText("At least 3 characters")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Task/), { target: { value: "Style the form" } });
    fireEvent.click(screen.getByRole("button", { name: /Add task/ }));
    await waitFor(() => expect(api.createTask).toHaveBeenCalled());
    expect(api.createTask.mock.calls[0][1]).toMatchObject({ title: "Style the form", planItemId: 11, assigneeId: 2, priority: "MEDIUM" });
    expect(toast).toHaveBeenCalledWith("Task added", "success");
  });
});

describe("team", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows roles, responsibilities and each teammate's report; personal mode is locked while there are teammates", async () => {
    api.delivery.mockResolvedValue({ members: [{ id: 2, name: "Eric Mugisha", owner: false, roleKey: "DEVELOPER", roleTitle: "Frontend developer", responsibilities: null, isManager: false, assigned: 3, inProgress: 1, inReview: 0, blocked: 0, todo: 1, done: 1, overdue: 1, avgCycleDays: 2, onTimeRate: 50, openEstimateHours: 4, hoursLogged: 6, reports: 3, lastReport: "2026-11-17" }] });
    render(<TeamPanel p={project()} meId={1} onChanged={vi.fn()} onLeft={vi.fn()} />);
    expect(screen.getByText("Frontend developer")).toBeInTheDocument();
    expect(screen.getByText("Sign-in screens")).toBeInTheDocument();
    expect(await screen.findByText(/3 reports/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Personal/ })).toBeDisabled();
  });
});

describe("my tasks", () => {
  it("groups my tasks by due date with overdue first", async () => {
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    api.myTasks.mockResolvedValue([
      { ...plan.tasks[0], id: 1, title: "Late thing", dueDate: day(-2), overdue: true, projectTitle: "P", planItemTitle: "F" },
      { ...plan.tasks[0], id: 2, title: "Someday", dueDate: null, projectTitle: "P", planItemTitle: "F" },
    ]);
    render(<MyTasks onOpenProject={vi.fn()} />);
    const overdue = await screen.findByRole("region", { name: "Overdue" });
    expect(within(overdue).getByText("Late thing")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "No due date" })).getByText("Someday")).toBeInTheDocument();
  });
});

describe("customers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("picks own initiative or a customer from the shared list", async () => {
    api.customers.mockResolvedValue([{ id: 5, name: "Kigali Green Farms", kind: "COMPANY", logoAssetId: null, projects: 2 }]);
    const onChange = vi.fn();
    const { rerender } = render(<CustomerField mode="OWN" customer={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /For a customer/ }));
    expect(onChange).toHaveBeenCalledWith("CUSTOMER", undefined);
    rerender(<CustomerField mode="CUSTOMER" customer={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Choose a customer/ }));
    fireEvent.click(await screen.findByRole("option", { name: /Kigali Green Farms/ }));
    expect(onChange).toHaveBeenLastCalledWith("CUSTOMER", expect.objectContaining({ id: 5 }));
  });

  it("registers a customer after checking the fields", async () => {
    api.createCustomer.mockResolvedValue({ id: 7, name: "Nyamata School", kind: "SCHOOL", logoAssetId: null });
    const onSaved = vi.fn();
    render(<CustomerModal open onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Nyamata School" } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: /Register/ }));
    expect(await screen.findByText("Use a valid email address")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "office@nyamata.rw" } });
    fireEvent.click(screen.getByRole("radio", { name: /School/ }));
    fireEvent.click(screen.getByRole("button", { name: /Register/ }));
    await waitFor(() => expect(api.createCustomer).toHaveBeenCalled());
    expect(api.createCustomer.mock.calls[0][0]).toMatchObject({ name: "Nyamata School", kind: "SCHOOL", email: "office@nyamata.rw" });
    expect(onSaved).toHaveBeenCalled();
  });
});
