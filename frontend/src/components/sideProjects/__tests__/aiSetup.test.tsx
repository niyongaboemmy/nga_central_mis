import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { AiDraftResult } from "../../../api/sideProjects";

const ai = vi.hoisted(() => ({
  providers: vi.fn(),
  start: vi.fn(),
  addFile: vi.fn(),
  removeFile: vi.fn(),
  draft: vi.fn(),
  refine: vi.fn(),
  applyPlan: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("../../../api/sideProjects", async (orig) => ({ ...(await orig<object>()), aiSetupApi: ai }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: toast }) }));

import AiSetup, { slotsFor } from "../ai/AiSetup";

const result = (over: Partial<AiDraftResult["draft"]> = {}): AiDraftResult => ({
  draft: {
    title: "Farm Orders Portal",
    abstract: "A web portal where shops order fresh produce from Kigali Green Farms and follow deliveries.",
    problemStatement: "Shops order by phone, so orders get lost and the farm can't plan picking.",
    description: "",
    concept: { users: "Shops and the farm", solution: "A responsive web app with an order form and a daily list.", impact: "No lost orders." },
    techTags: ["React"],
    categoryId: null,
    category: "",
    kind: "DELIVERY_STUDIO",
    customerName: "Kigali Green Farms",
    githubUrl: "",
    accessUrl: "",
    startDate: "2026-12-01",
    targetDate: "2027-02-28",
    stageEnds: null,
    startIn: "PLANNING",
    documents: [{ fileId: "f1", name: "proposal.pdf", slot: "CONCEPT", why: "The proposal" }],
    phases: [{ title: "Build", description: "", stage: "IN_PROGRESS", features: [{ title: "Order form", description: "", priority: "HIGH", estimateHours: 8, tasks: [{ title: "Build the order form", priority: "HIGH", estimateHours: 8 }] }] }],
    questions: ["Do shops pay online?"],
    assumptions: [],
    summary: "An ordering portal for shops.",
    ...over,
  },
  issues: [],
  reply: "Here is your project.",
  turns: [{ role: "ai", text: "Here is your project.", at: new Date().toISOString() }],
  provider: { name: "glm", label: "GLM", model: "glm-4.5-flash" },
});

beforeEach(() => {
  Object.values(ai).forEach((f) => f.mockReset());
  toast.mockReset();
  ai.start.mockResolvedValue({ id: "s1", maxFiles: 12 });
  ai.providers.mockResolvedValue({ auto: true, list: [{ name: "glm", label: "GLM", ready: true }, { name: "groq", label: "Groq", ready: false }] });
  ai.addFile.mockResolvedValue({ id: "f1", name: "proposal.pdf", size: 2048, kind: "pdf", pages: 3, chars: 5400, status: "READ", note: null });
  ai.draft.mockResolvedValue(result());
});

/** SelectField labels its trigger and its native select alike: the select holds the value. */
const slot = (name: string) => screen.getAllByLabelText(`Where ${name} goes`).find((e) => e.tagName === "SELECT") as HTMLSelectElement;
const dropFile = (name = "proposal.pdf") => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["%PDF-1.4 proposal"], name, { type: "application/pdf" })] } });
};

describe("slot rules", () => {
  it("only offers the document slots a file can take", () => {
    expect(slotsFor("image")).toEqual(["GALLERY", "SKIP"]);
    expect(slotsFor("sheet")).toEqual(["IMPLEMENTATION_PLAN", "GALLERY", "SKIP"]);
    expect(slotsFor("slides")).not.toContain("SRS");
    expect(slotsFor("pdf")).toContain("SRS");
  });
});

describe("AiSetup", () => {
  it("shows a skeleton, then reads each document with its own status", async () => {
    render(<AiSetup onApply={vi.fn()} onManual={vi.fn()} />);
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
    await screen.findByText(/Drop the project's documents here/);
    expect(screen.getByRole("radio", { name: /Auto/ })).toHaveAttribute("aria-checked", "true");
    // The run button waits for something to read.
    expect(screen.getByRole("button", { name: /Let AI set it up/ })).toBeDisabled();
    dropFile();
    await screen.findByText(/3 pages · 5.4k characters read/);
    expect(toast).toHaveBeenCalledWith("Read proposal.pdf", "success");
    expect(screen.getByRole("button", { name: /Let AI set it up/ })).toBeEnabled();
  });

  it("sends the extra prompt and the chosen AI, then shows the review", async () => {
    render(<AiSetup onApply={vi.fn()} onManual={vi.fn()} canClassify />);
    await screen.findByText(/Drop the project's documents here/);
    dropFile();
    await screen.findByText(/characters read/);
    fireEvent.click(screen.getByRole("button", { name: /\+ Plan it for 3 months/ }));
    fireEvent.click(screen.getByRole("radio", { name: /GLM/ }));
    fireEvent.click(screen.getByRole("button", { name: /Let AI set it up/ }));
    await screen.findByText("Filled in for you");
    expect(ai.draft).toHaveBeenCalledWith("s1", { prompt: "Plan it for 3 months, starting next Monday", provider: "glm" });
    expect(screen.getByText(/Answered by GLM/)).toBeInTheDocument();
    expect(screen.getByText("1 phases · 1 features · 1 tasks")).toBeInTheDocument();
    expect(screen.getByText("NGA Delivery Studio")).toBeInTheDocument();
    expect(slot("proposal.pdf")).toHaveValue("CONCEPT");
  });

  it("talks to the AI with the owner's own plan edits, and applies the result", async () => {
    const onApply = vi.fn();
    ai.refine.mockResolvedValue({ ...result({ targetDate: "2027-01-31" }), reply: "Two months now.", turns: [{ role: "ai", text: "Here is your project.", at: "" }, { role: "user", text: "Make it 2 months", at: "" }, { role: "ai", text: "Two months now.", at: "" }] });
    render(<AiSetup onApply={onApply} onManual={vi.fn()} />);
    await screen.findByText(/Drop the project's documents here/);
    dropFile();
    await screen.findByText(/characters read/);
    fireEvent.click(screen.getByRole("button", { name: /Let AI set it up/ }));
    await screen.findByText("Filled in for you");
    fireEvent.change(screen.getByLabelText("Phase title"), { target: { value: "Build v1" } });
    fireEvent.change(screen.getByLabelText("Ask the AI for a change"), { target: { value: "Make it 2 months" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Two months now.");
    expect(ai.refine).toHaveBeenCalledWith("s1", expect.objectContaining({ message: "Make it 2 months", provider: "auto", phases: [expect.objectContaining({ title: "Build v1" })] }));
    fireEvent.click(screen.getByRole("button", { name: /Create project/ }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const [applied, then] = onApply.mock.calls[0];
    expect(then).toBe("create");
    expect(applied.files.f1.name).toBe("proposal.pdf");
    expect(applied.slots).toEqual({ f1: "CONCEPT" });
    expect(applied.provider).toBe("GLM");
  });

  it("keeps the owner's file choices and moves the old holder of a slot to the gallery", async () => {
    ai.addFile.mockResolvedValueOnce({ id: "f1", name: "proposal.pdf", size: 1, kind: "pdf", pages: 1, chars: 900, status: "READ", note: null });
    ai.addFile.mockResolvedValueOnce({ id: "f2", name: "brief.pdf", size: 1, kind: "pdf", pages: 1, chars: 900, status: "READ", note: null });
    ai.draft.mockResolvedValue(result({ documents: [{ fileId: "f1", name: "proposal.pdf", slot: "CONCEPT", why: "" }, { fileId: "f2", name: "brief.pdf", slot: "GALLERY", why: "" }] }));
    render(<AiSetup onApply={vi.fn()} onManual={vi.fn()} />);
    await screen.findByText(/Drop the project's documents here/);
    dropFile("proposal.pdf");
    dropFile("brief.pdf");
    await waitFor(() => expect(screen.getAllByText(/characters read/)).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: /Let AI set it up/ }));
    await screen.findByText("Filled in for you");
    fireEvent.change(slot("brief.pdf"), { target: { value: "CONCEPT" } });
    expect(slot("proposal.pdf")).toHaveValue("GALLERY");
  });

  it("says why when the AI fails and lets the owner fill it in", async () => {
    const onManual = vi.fn();
    ai.draft.mockRejectedValue({ response: { data: { message: "Today's free AI quota is used up. Please try again later." } } });
    render(<AiSetup onApply={vi.fn()} onManual={onManual} />);
    await screen.findByText(/Drop the project's documents here/);
    fireEvent.change(screen.getByLabelText(/Extra prompt/), { target: { value: "A portal for shops to order produce from the farm." } });
    fireEvent.click(screen.getByRole("button", { name: /Let AI set it up/ }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/quota is used up/)).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/quota/), "error");
    fireEvent.click(screen.getByRole("button", { name: /Fill it in myself/ }));
    expect(onManual).toHaveBeenCalled();
  });

  it("tells the owner when the school has no AI set up", async () => {
    ai.providers.mockResolvedValue({ auto: false, list: [] });
    render(<AiSetup onApply={vi.fn()} onManual={vi.fn()} />);
    await screen.findByText(/No AI is set up for the school yet/);
    expect(screen.getByRole("button", { name: /Let AI set it up/ })).toBeDisabled();
  });
});
