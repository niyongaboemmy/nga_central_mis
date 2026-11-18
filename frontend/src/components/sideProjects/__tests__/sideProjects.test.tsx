import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ProjectCard } from "../../../api/sideProjects";

const api = vi.hoisted(() => ({
  mine: vi.fn(),
  categories: vi.fn(),
  transition: vi.fn(),
  order: vi.fn(),
  tags: vi.fn(),
  get: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("../../../api/sideProjects", async (orig) => ({ ...(await orig<object>()), sideProjectsApi: api }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock("../../../contexts/ConfirmContext", () => ({ useConfirm: () => async () => true }));
vi.mock("../../../contexts/UserContext", () => ({ useUser: () => ({ user: { user: { user_id: 5 }, profile: { user_type: "STUDENT" } } }) }));

import MyProjects from "../MyProjects";
import { MoveDialog, checkGithub, normaliseGithub } from "../fields";
import Board from "../Board";

const card = (over: Partial<ProjectCard>): ProjectCard => ({
  id: 1,
  title: "Smart irrigation",
  status: "IDEA",
  boardPosition: 0,
  reviewState: "NONE",
  progress: 0,
  health: "IDLE",
  milestones: { total: 0, done: 0 },
  techTags: ["Arduino"],
  githubUrl: null,
  accessUrl: null,
  coverAssetId: null,
  conceptPending: false,
  docs: { CONCEPT: true, SRS: false, IMPLEMENTATION_PLAN: false },
  mediaCount: 0,
  commentCount: 0,
  memberCount: 0,
  category: null,
  targetDate: null,
  lastActivityAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  completedAt: null,
  verifiedAt: null,
  archivedAt: null,
  myRole: "OWNER",
  ...over,
});

describe("side projects: validation helpers", () => {
  it("accepts only GitHub repository links and normalises them", () => {
    expect(checkGithub("")).toBeNull();
    expect(checkGithub("github.com/nga/irrigation.git")).toBeNull();
    expect(normaliseGithub("github.com/nga/irrigation.git/")).toBe("https://github.com/nga/irrigation");
    expect(checkGithub("https://gitlab.com/nga/x")).toMatch(/github/);
    expect(checkGithub("https://github.com/nga")).toMatch(/github/);
  });
});

describe("side projects: board", () => {
  it("puts cards in their column with counts", () => {
    render(<Board cards={[card({ id: 1 }), card({ id: 2, title: "Robot", status: "IN_PROGRESS" }), card({ id: 3, title: "Game", status: "COMPLETED" })]} onOpen={vi.fn()} />);
    const idea = screen.getByRole("region", { name: "Idea column" });
    expect(within(idea).getByText("Smart irrigation")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "In progress column" })).getByText("Robot")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Completed column" })).getByText("Game")).toBeInTheDocument();
  });

  it("offers a keyboard drag handle and a Move menu on each card", async () => {
    const onMove = vi.fn().mockResolvedValue(true);
    render(<Board cards={[card({ id: 1 })]} onOpen={vi.fn()} onMove={onMove} />);
    expect(screen.getByRole("button", { name: "Drag Smart irrigation" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move Smart irrigation" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /In progress/ }));
    await waitFor(() => expect(onMove).toHaveBeenCalledWith(1, "IN_PROGRESS", 0));
  });

  it("is read-only when not draggable (staff board)", () => {
    render(<Board cards={[card({ id: 1 })]} onOpen={vi.fn()} draggable={false} />);
    expect(screen.queryByRole("button", { name: "Drag Smart irrigation" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move Smart irrigation" })).toBeNull();
  });
});

describe("side projects: move dialog", () => {
  it("keeps Complete disabled until the outcome is long enough", () => {
    const onConfirm = vi.fn();
    render(<MoveDialog open={{ to: "COMPLETED", from: "IN_PROGRESS", title: "X", hasLink: false, hasImage: true }} busy={false} error={null} onCancel={vi.fn()} onConfirm={onConfirm} />);
    const all = screen.getAllByRole("button", { name: /Completed/ });
    const btn = all[all.length - 1];
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "It waters the garden by itself now." } });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledWith({ outcomeSummary: "It waters the garden by itself now." });
  });
});

describe("side projects: My projects page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.categories.mockResolvedValue([]);
    api.tags.mockResolvedValue([]);
  });

  it("shows the empty state with a New project call to action", async () => {
    api.mine.mockResolvedValue([]);
    render(<MemoryRouter><MyProjects /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /New project/ })).toHaveLength(2));
  });

  it("moves a card and snaps it back with the server's reason when refused", async () => {
    api.mine.mockResolvedValue([card({ id: 1 })]);
    api.transition.mockRejectedValue({ response: { data: { code: "CONCEPT_REQUIRED", message: "Add the concept note first", field: "concept" } } });
    render(<MemoryRouter><MyProjects /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Move Smart irrigation" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /In progress/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Add the concept note first", "warning"));
    expect(within(screen.getByRole("region", { name: "Idea column" })).getByText("Smart irrigation")).toBeInTheDocument();
  });
});
