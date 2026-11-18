import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ProjectCard } from "../../../api/sideProjects";

const api = vi.hoisted(() => ({
  me: vi.fn(),
  assigned: vi.fn(),
  addReport: vi.fn(),
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
import { checkGithub, normaliseGithub } from "../fields";
import { MoveDialog } from "../MoveDialog";
import Board from "../Board";
import { StageChip, moveTargets } from "../ProjectCard";
import PlanEditor, { clampEnds, defaultEnds, endsToDates, rangesOf, spanDays } from "../PlanEditor";
import { buildWeeks, levelOf, scoreOf } from "../panels/ContributionGraph";
import ReportModal from "../panels/ReportModal";

const card = (over: Partial<ProjectCard>): ProjectCard => ({
  id: 1,
  title: "Smart irrigation",
  status: "IDEA",
  boardPosition: 0,
  reviewState: "NONE",
  progress: 0,
  health: "IDLE",
  pausedFrom: null,
  stage: { enteredAt: null, daysIn: 2, plannedEnd: null, plannedDays: 5, daysLeft: 3, overrunDays: 0 },
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
    render(<Board cards={[card({ id: 1 }), card({ id: 2, title: "Robot", status: "IN_PROGRESS" }), card({ id: 4, title: "Drone", status: "TESTING" }), card({ id: 3, title: "Game", status: "COMPLETED" })]} onOpen={vi.fn()} />);
    const idea = screen.getByRole("region", { name: "Idea column" });
    expect(within(idea).getByText("Smart irrigation")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Building column" })).getByText("Robot")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Testing column" })).getByText("Drone")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Planning column" })).toBeInTheDocument();
    // On hold folds into a slim rail while empty
    expect(screen.getByRole("region", { name: "On hold column, empty" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Completed column" })).getByText("Game")).toBeInTheDocument();
  });

  it("offers a keyboard drag handle and a Move menu on each card", async () => {
    const onMove = vi.fn().mockResolvedValue(true);
    render(<Board cards={[card({ id: 1 })]} onOpen={vi.fn()} onMove={onMove} />);
    expect(screen.getByRole("button", { name: "Drag Smart irrigation" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move Smart irrigation" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Building/ }));
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
    api.me.mockResolvedValue({ own: true, view: null, review: false, manageAny: false, supervising: 0, assigned: false });
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
    fireEvent.click(screen.getByRole("menuitem", { name: /Building/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Add the concept note first", "warning"));
    expect(within(screen.getByRole("region", { name: "Idea column" })).getByText("Smart irrigation")).toBeInTheDocument();
  });
});

describe("side projects: stages", () => {
  it("never offers Completed to a paused project, nor pausing a finished one", () => {
    expect(moveTargets("ON_HOLD")).not.toContain("COMPLETED");
    expect(moveTargets("COMPLETED")).not.toContain("ON_HOLD");
    expect(moveTargets("IDEA")).toEqual(["PLANNING", "IN_PROGRESS", "TESTING", "COMPLETED", "ON_HOLD"]);
  });

  it("labels a paused card's menu as resume", () => {
    render(<Board cards={[card({ id: 1, status: "ON_HOLD", pausedFrom: "IN_PROGRESS" })]} onOpen={vi.fn()} onMove={vi.fn().mockResolvedValue(true)} />);
    fireEvent.click(screen.getByRole("button", { name: "Move Smart irrigation" }));
    expect(screen.getByRole("menuitem", { name: "Resume in Building" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Completed/ })).toBeNull();
  });

  it("shows the day in the stage and the overrun", () => {
    const { rerender } = render(<StageChip card={card({ status: "PLANNING" })} />);
    expect(screen.getByText("Day 3")).toBeInTheDocument();
    expect(screen.getByText(/3 days left/)).toBeInTheDocument();
    rerender(<StageChip card={card({ status: "PLANNING", stage: { enteredAt: null, daysIn: 9, plannedEnd: "2026-01-01", plannedDays: 5, daysLeft: -4, overrunDays: 4 } })} />);
    expect(screen.getByText(/4 days over/)).toBeInTheDocument();
  });

  it("asks why before pausing", () => {
    const onConfirm = vi.fn();
    render(<MoveDialog open={{ to: "ON_HOLD", from: "IN_PROGRESS", title: "X", hasLink: false, hasImage: false }} busy={false} error={null} onCancel={vi.fn()} onConfirm={onConfirm} />);
    expect(screen.getByText("Put the project on hold")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Pause" });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Exams week" } });
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledWith({ reason: "Exams week" });
  });

  it("asks for a reason when a card is dragged or moved to On hold", async () => {
    vi.clearAllMocks();
    api.categories.mockResolvedValue([]);
    api.me.mockResolvedValue({ own: true, view: null, review: false, manageAny: false, supervising: 0, assigned: false });
    api.mine.mockResolvedValue([card({ id: 1, status: "IN_PROGRESS" })]);
    render(<MemoryRouter><MyProjects /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Move Smart irrigation" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Put on hold" }));
    expect(await screen.findByText("Put the project on hold")).toBeInTheDocument();
    expect(api.transition).not.toHaveBeenCalled();
  });
});

describe("side projects: stage plan", () => {
  it("splits the window 10/20/50/20 like the server, a day at least per stage", () => {
    expect(spanDays("2026-01-01", "2026-01-30")).toBe(30);
    const ends = defaultEnds(30);
    expect(ends).toEqual([2, 8, 23]);
    expect(rangesOf(ends, 30)).toEqual([[0, 2], [3, 8], [9, 23], [24, 29]]);
    expect(endsToDates("2026-01-01", ends)).toEqual(["2026-01-03", "2026-01-09", "2026-01-24"]);
    expect(defaultEnds(4)).toEqual([0, 1, 2]);
    expect(clampEnds([5, 2, 40], 10)).toEqual([5, 6, 8]);
  });

  it("moves a boundary with the keyboard and pushes the next one along", () => {
    const onChange = vi.fn();
    render(<PlanEditor start="2026-01-01" target="2026-01-10" ends={[0, 1, 2]} onChange={onChange} />);
    const sliders = screen.getAllByRole("slider");
    expect(sliders).toHaveLength(3);
    fireEvent.keyDown(sliders[0], { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith([1, 2, 3]);
  });

  it("explains why the plan can't be drawn yet", () => {
    render(<PlanEditor start="2026-01-01" target="" ends={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/at least 4 days apart/)).toBeInTheDocument();
  });
});

describe("side projects: daily work graph", () => {
  it("scores reports double and buckets into five levels", () => {
    expect(levelOf(scoreOf({ reports: 0, events: 0 }))).toBe(0);
    expect(levelOf(scoreOf({ reports: 0, events: 1 }))).toBe(1);
    expect(levelOf(scoreOf({ reports: 1, events: 0 }))).toBe(2);
    expect(levelOf(scoreOf({ reports: 2, events: 1 }))).toBe(3);
    expect(levelOf(scoreOf({ reports: 3, events: 2 }))).toBe(4);
  });

  it("lays days out in Monday-first weeks up to today", () => {
    const weeks = buildWeeks(
      { since: "2026-11-04", days: 7, activity: [{ date: "2026-11-05", reports: 1, events: 0, hours: 2 }], stats: { activeDays: 1, reports: 1, hours: 2, currentStreak: 0, longestStreak: 1 } },
      new Date("2026-11-10T09:00:00Z"),
    );
    expect(weeks).toHaveLength(2);
    expect(weeks[0][0].date).toBe("2026-11-02"); // Monday
    expect(weeks[0][0].future).toBe(true); // before `since`
    expect(weeks[0][3]).toMatchObject({ date: "2026-11-05", reports: 1, hours: 2, future: false });
    expect(weeks[1][1].date).toBe("2026-11-10");
    expect(weeks[1][2].future).toBe(true);
  });
});

describe("side projects: progress report", () => {
  beforeEach(() => vi.clearAllMocks());
  const detail = { id: 7, title: "Smart irrigation", updates: [], rights: { edit: true } } as any;

  it("checks the report before sending and saves it for today", async () => {
    api.addReport.mockResolvedValue({ id: 1 });
    const onSaved = vi.fn();
    render(<ReportModal p={detail} open report={null} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: /Save report/ }));
    expect(await screen.findByText(/at least 5 characters/)).toBeInTheDocument();
    expect(api.addReport).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/What did you do/), { target: { value: "Wired the sensor" } });
    fireEvent.click(screen.getByRole("radio", { name: "2h" }));
    fireEvent.click(screen.getByRole("button", { name: /Save report/ }));
    await waitFor(() => expect(api.addReport).toHaveBeenCalled());
    const [id, body, files] = api.addReport.mock.calls[0];
    expect(id).toBe(7);
    expect(body).toMatchObject({ did: "Wired the sensor", hours: 2 });
    expect(body.workDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(files).toEqual([]);
    expect(toast).toHaveBeenCalledWith("Report saved", "success");
    expect(onSaved).toHaveBeenCalled();
  });
});
