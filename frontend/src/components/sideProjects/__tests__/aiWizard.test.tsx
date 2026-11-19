import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { AiDraftResult } from "../../../api/sideProjects";

const sp = vi.hoisted(() => ({
  me: vi.fn(),
  create: vi.fn(),
  uploadDocument: vi.fn(),
  uploadMedia: vi.fn(),
  setBranding: vi.fn(),
  customers: vi.fn(),
  supervisors: vi.fn(),
  tags: vi.fn(),
}));
const ai = vi.hoisted(() => ({ providers: vi.fn(), start: vi.fn(), addFile: vi.fn(), removeFile: vi.fn(), draft: vi.fn(), refine: vi.fn(), applyPlan: vi.fn() }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("../../../api/sideProjects", async (orig) => ({ ...(await orig<object>()), sideProjectsApi: sp, aiSetupApi: ai }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock("../../../contexts/ConfirmContext", () => ({ useConfirm: () => async () => true }));

import CreateWizard from "../CreateWizard";
import { resetSpMe } from "../useMe";

const phases = [{ title: "Build", description: "", stage: "IN_PROGRESS" as const, features: [{ title: "Order form", description: "", priority: "HIGH" as const, estimateHours: 8, tasks: [{ title: "Build the order form", priority: "HIGH" as const, estimateHours: 8 }] }] }];
const result: AiDraftResult = {
  draft: {
    title: "Farm Orders Portal",
    abstract: "A web portal where shops order fresh produce from Kigali Green Farms and follow deliveries.",
    problemStatement: "Shops order by phone, so orders get lost and the farm can't plan picking.",
    description: "Phase one: ordering.",
    concept: { users: "Shops and the farm", solution: "A responsive web app with an order form and a daily list.", impact: "No lost orders." },
    techTags: ["React", "MySQL"],
    categoryId: 3,
    category: "Web",
    kind: "DELIVERY_STUDIO",
    customerName: "Kigali Green Farms",
    githubUrl: "https://github.com/patrick/farm-orders",
    accessUrl: "",
    startDate: "2026-12-01",
    targetDate: "2027-02-28",
    stageEnds: { IDEA: "2026-12-07", PLANNING: "2026-12-20", IN_PROGRESS: "2027-02-10" },
    startIn: "PLANNING",
    documents: [
      { fileId: "f1", name: "proposal.pdf", slot: "CONCEPT", why: "" },
      { fileId: "f2", name: "srs.md", slot: "SRS", why: "" },
    ],
    phases,
    questions: [],
    assumptions: [],
    summary: "An ordering portal.",
  },
  issues: [],
  reply: "Here is your project.",
  turns: [{ role: "ai", text: "Here is your project.", at: "" }],
  provider: { name: "glm", label: "GLM", model: null },
};

const categories = [{ id: 3, slug: "web", name: "Web", icon: "globe", color: "#2563eb" }] as any;

beforeEach(() => {
  resetSpMe();
  [...Object.values(sp), ...Object.values(ai)].forEach((f) => f.mockReset());
  toast.mockReset();
  sp.create.mockResolvedValue({ id: 77 });
  sp.uploadDocument.mockResolvedValue({ version: 1 });
  sp.customers.mockResolvedValue([{ id: 12, name: "Kigali Green Farms", logoAssetId: null }]);
  sp.supervisors.mockResolvedValue([]);
  sp.tags.mockResolvedValue([]);
  ai.start.mockResolvedValue({ id: "s1", maxFiles: 12 });
  ai.providers.mockResolvedValue({ auto: true, list: [{ name: "glm", label: "GLM", ready: true }] });
  ai.addFile
    .mockResolvedValueOnce({ id: "f1", name: "proposal.pdf", size: 9, kind: "pdf", pages: 2, chars: 3000, status: "READ", note: null })
    .mockResolvedValueOnce({ id: "f2", name: "srs.md", size: 9, kind: "markdown", pages: null, chars: 2000, status: "READ", note: null });
  ai.draft.mockResolvedValue(result);
  ai.applyPlan.mockResolvedValue({ phases: 1, items: 2, tasks: 1 });
});

const drop = (files: File[]) => fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files } });

describe("CreateWizard with AI", () => {
  it("staff choose AI, and one click creates the project with its files, customer and plan", async () => {
    sp.me.mockResolvedValue({ own: true, view: null, review: false, manageAny: false, supervising: 0, assigned: true, classify: true, aiSetup: true });
    const onCreated = vi.fn();
    render(<CreateWizard open categories={categories} onClose={vi.fn()} onCreated={onCreated} />);
    fireEvent.click(await screen.findByRole("button", { name: /Set up with AI/ }));
    await screen.findByText(/Drop the project's documents here/);
    drop([new File(["%PDF proposal"], "proposal.pdf", { type: "application/pdf" }), new File(["# SRS"], "srs.md", { type: "text/markdown" })]);
    await waitFor(() => expect(screen.getAllByText(/characters read/)).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: /Let AI set it up/ }));
    await screen.findByText("Filled in for you");
    fireEvent.click(screen.getByRole("button", { name: /Create project/ }));

    await waitFor(() => expect(ai.applyPlan).toHaveBeenCalledWith(77, phases));
    const [fields, concept] = sp.create.mock.calls[0];
    expect(fields).toMatchObject({
      title: "Farm Orders Portal",
      description: "Phase one: ordering.",
      categoryId: 3,
      techTags: ["React", "MySQL"],
      githubUrl: "https://github.com/patrick/farm-orders",
      startDate: "2026-12-01",
      targetDate: "2027-02-28",
      stagePlan: ["2026-12-07", "2026-12-20", "2027-02-10"],
      status: "PLANNING",
      kind: "DELIVERY_STUDIO",
      customerMode: "CUSTOMER",
      customerId: 12,
    });
    expect(fields.conceptWritten).toBeUndefined();
    expect((concept as File).name).toBe("proposal.pdf");
    expect(sp.uploadDocument).toHaveBeenCalledWith(77, "SRS", expect.objectContaining({ name: "srs.md" }), expect.any(Function));
    await screen.findByText(/AI plan added: 2 plan items and 1 tasks/);
    expect(toast).toHaveBeenCalledWith("Project created", "success");
  });

  it("'Review each step' fills the steps and keeps a way back to the AI", async () => {
    sp.me.mockResolvedValue({ own: true, view: null, review: false, manageAny: false, supervising: 0, assigned: true, aiSetup: true });
    render(<CreateWizard open categories={categories} onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Set up with AI/ }));
    await screen.findByText(/Drop the project's documents here/);
    drop([new File(["%PDF proposal"], "proposal.pdf", { type: "application/pdf" })]);
    await screen.findByText(/characters read/);
    fireEvent.click(screen.getByRole("button", { name: /Let AI set it up/ }));
    await screen.findByText("Filled in for you");
    fireEvent.click(screen.getByRole("button", { name: /Review each step/ }));
    expect(await screen.findByDisplayValue("Farm Orders Portal")).toBeInTheDocument();
    expect(screen.getByText(/Filled in by AI/)).toBeInTheDocument();
    expect(sp.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Back to AI/ }));
    expect(await screen.findByText("Filled in for you")).toBeVisible();
  });

  it("students never see the AI option", async () => {
    sp.me.mockResolvedValue({ own: true, view: null, review: false, manageAny: false, supervising: 0, assigned: false, aiSetup: false });
    render(<CreateWizard open categories={categories} onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(await screen.findByText(/This will be a/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Set up with AI/ })).toBeNull();
    expect(screen.getByLabelText("Project title")).toBeInTheDocument();
    expect(ai.start).not.toHaveBeenCalled();
  });
});
