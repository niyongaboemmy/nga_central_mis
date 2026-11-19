import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { GitProjectPanel, PlanData, ProjectDetail, ReportDraft, Task } from "../../../api/sideProjects";

const git = vi.hoisted(() => ({
  status: vi.fn(),
  project: vi.fn(),
  installations: vi.fn(),
  repos: vi.fn(),
  connect: vi.fn(),
  settings: vi.fn(),
  connectUrl: vi.fn(),
  installUrl: vi.fn(),
  taskDev: vi.fn(),
  draft: vi.fn(),
  editDraft: vi.fn(),
  submitDraft: vi.fn(),
  dismissDraft: vi.fn(),
  polishDraft: vi.fn(),
  mapAuthor: vi.fn(),
  setPrefs: vi.fn(),
  disconnect: vi.fn(),
  unlink: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("../../../api/sideProjects", async (orig) => ({ ...(await orig<object>()), gitApi: git }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock("../../../contexts/ConfirmContext", () => ({ useConfirm: () => async () => true }));

import { CopyField, PrChip, SourceBadge, TaskDevSection } from "../git/GitParts";
import DraftCard from "../git/DraftCard";
import GitPanel from "../git/GitPanel";

const project = { id: 9, title: "Farm Orders Portal", kind: "DELIVERY_STUDIO", rights: { edit: true, owner: true, review: false, manageAny: false, supervisor: false, manage: true } } as unknown as ProjectDetail;
const plan: PlanData = {
  items: [],
  tasks: [{ id: 27, projectId: 9, planItemId: 11, title: "Build the shop order form", status: "IN_PROGRESS", assigneeId: 2, priority: "HIGH" } as unknown as Task, { id: 28, projectId: 9, planItemId: 11, title: "Daily list", status: "TODO", assigneeId: 2, priority: "LOW" } as unknown as Task],
};
const draft = (over: Partial<ReportDraft> = {}): ReportDraft => ({
  id: 5,
  projectId: 9,
  userId: 2,
  from: new Date().toISOString(),
  to: new Date().toISOString(),
  did: "Build the shop order form: Add product list; Quantity validation.",
  nextSteps: "PR #12 is waiting for review.",
  blockers: "",
  lines: [
    { key: "27", taskId: 27, itemId: 11, title: "Build the shop order form", taskStatus: "IN_REVIEW", suggestedTaskId: null, commits: [{ sha: "a1".padEnd(40, "0"), title: "Add product list", url: null, at: new Date().toISOString() }], prs: [{ number: 12, title: "Order form", state: "OPEN", url: "https://github.com/x/pull/12" }], hours: 1.5, hoursSource: "GIT_ESTIMATE", include: true },
    { key: "u:feat/misc", taskId: null, itemId: null, title: "Branch feat/misc", taskStatus: null, suggestedTaskId: 27, commits: [{ sha: "b2".padEnd(40, "0"), title: "Tidy", url: null, at: new Date().toISOString() }], prs: [], hours: 0.5, hoursSource: "GIT_ESTIMATE", include: true },
  ],
  hours: 2,
  commitCount: 2,
  edited: false,
  aiPolished: false,
  status: "OPEN",
  notifiedAt: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("git parts", () => {
  it("PR chips say where a pull request stands", () => {
    const { rerender } = render(<PrChip pr={{ number: 12, state: "OPEN", draft: false, reviewState: null, url: "" }} />);
    expect(screen.getByTitle("Pull request #12: In review")).toBeTruthy();
    rerender(<PrChip pr={{ number: 12, state: "OPEN", draft: false, reviewState: "CHANGES_REQUESTED", url: "" }} />);
    expect(screen.getByText(/Changes requested/)).toBeTruthy();
    rerender(<PrChip pr={{ number: 12, state: "MERGED", draft: false, reviewState: null, url: "" }} compact />);
    expect(screen.getByTitle("Pull request #12: Merged")).toBeTruthy();
  });
  it("source badge only for Git reports", () => {
    const { rerender, container } = render(<SourceBadge source="MANUAL" />);
    expect(container.textContent).toBe("");
    rerender(<SourceBadge source="GIT_AUTO" />);
    expect(screen.getByText(/From GitHub · auto/)).toBeTruthy();
  });
  it("copies a branch name and confirms with a toast", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyField value="feat/FOP-27-order-form" label="Branch name" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy branch name" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("feat/FOP-27-order-form"));
    expect(toast).toHaveBeenCalledWith("Branch name copied", "success");
  });
  it("task Development: skeleton, then the key, branch and pull request", async () => {
    git.taskDev.mockResolvedValue({ key: "FOP-27", branchName: "feat/FOP-27-build-the-shop-order-form", command: "git switch -c feat/FOP-27-build-the-shop-order-form", connected: true, branches: [], prs: [{ number: 12, title: "Order form", url: "https://x", state: "OPEN", draft: false, reviewState: null, openedAt: "", mergedAt: null }], commits: [] });
    render(<TaskDevSection projectId={9} taskId={27} />);
    expect(screen.getByLabelText("Loading development links")).toBeTruthy();
    expect((await screen.findAllByText("FOP-27")).length).toBeGreaterThan(0);
    expect(screen.getByText("feat/FOP-27-build-the-shop-order-form")).toBeTruthy();
    expect(screen.getByText(/#12 Order form/)).toBeTruthy();
  });
});

describe("draft card", () => {
  it("shows the draft, lets you change hours and submits", async () => {
    git.draft.mockResolvedValue({ draft: draft(), canPolish: false });
    git.editDraft.mockImplementation(async (_id: number, body: any) => draft({ lines: draft().lines.map((l) => (body.lines?.[0]?.key === l.key ? { ...l, hours: body.lines[0].hours ?? l.hours, hoursSource: "TYPED" } : l)) }));
    git.submitDraft.mockResolvedValue({ reportId: 77 });
    const onSubmitted = vi.fn();
    render(<DraftCard p={project} plan={plan} meId={2} onSubmitted={onSubmitted} />);
    expect(screen.getByLabelText("Loading your GitHub draft")).toBeTruthy();
    expect(await screen.findByText("Your report is ready")).toBeTruthy();
    expect(screen.getByText(/2 commits/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Word it with AI/ })).toBeNull(); // AI not allowed
    expect(screen.getByText(/1 line needs a task/)).toBeTruthy();
    // Untick the unlinked line.
    fireEvent.click(screen.getByLabelText("Include Branch feat/misc"));
    await waitFor(() => expect(git.editDraft).toHaveBeenCalledWith(5, { lines: [{ key: "u:feat/misc", include: false }] }));
    fireEvent.click(screen.getByRole("button", { name: /Submit report/ }));
    await waitFor(() => expect(git.submitDraft).toHaveBeenCalled());
    expect(onSubmitted).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("Report submitted from your GitHub work", "success");
  });
  it("offers AI wording only when allowed, and nothing when there is no draft", async () => {
    git.draft.mockResolvedValue({ draft: draft(), canPolish: true });
    git.polishDraft.mockResolvedValue(draft({ did: "I built the order form.", aiPolished: true }));
    render(<DraftCard p={project} plan={plan} meId={2} onSubmitted={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: /Word it with AI/ }));
    await waitFor(() => expect(screen.getByDisplayValue("I built the order form.")).toBeTruthy());
    git.draft.mockResolvedValue({ draft: null, canPolish: false });
    const { container } = render(<DraftCard p={{ ...project, id: 10 } as ProjectDetail} plan={plan} meId={2} onSubmitted={() => undefined} />);
    await waitFor(() => expect(git.draft).toHaveBeenCalledWith(10));
    await waitFor(() => expect(container.textContent).toBe(""));
  });
});

const panel = (over: Partial<GitProjectPanel> = {}): GitProjectPanel => ({
  enabled: true,
  canManage: true,
  canEdit: true,
  taskKey: "FOP",
  link: null,
  settings: { automations: true, autoSubmitDays: 2, ignoredPaths: [], aiPolish: true, checks: false },
  team: [{ id: 1, name: "Patrick Mugabo", login: null, avatarUrl: null }],
  unclaimed: [],
  prs: [],
  commits: [],
  stats: { commits: 0, tasks: 0, last: null },
  ...over,
});

describe("GitHub tab", () => {
  it("not connected: the two steps, then connect a repository", async () => {
    git.project.mockResolvedValue(panel());
    git.status.mockResolvedValue({ enabled: true, identity: null, prefs: { aiPolish: true } });
    git.installations.mockResolvedValue([{ id: 900, account: "aimee", type: "User", suspended: false }]);
    git.repos.mockResolvedValue([{ id: 7, full_name: "aimee/farm-orders", html_url: "", default_branch: "main", private: true, projectId: null }]);
    git.connect.mockResolvedValue({});
    render(<GitPanel p={project} meId={1} />);
    expect(screen.getByLabelText("Loading the GitHub connection")).toBeTruthy();
    expect(await screen.findByText("Install NGA Projects on your GitHub account")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Connect GitHub/ })).toBeTruthy();
    const connect = await screen.findByRole("button", { name: /Connect repository/ });
    await waitFor(() => expect((connect as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(connect);
    await waitFor(() => expect(git.connect).toHaveBeenCalledWith(9, { installationId: 900, repoId: 7, pathPrefix: null }));
    expect(toast).toHaveBeenCalledWith("Repository connected", "success");
  });
  it("connected: stats, automations and unclaimed authors", async () => {
    git.project.mockResolvedValue(
      panel({
        link: { fullName: "aimee/farm-orders", htmlUrl: "https://github.com/aimee/farm-orders", defaultBranch: "main", pathPrefix: null, installationId: 900, settings: { automations: true, autoSubmitDays: 2, ignoredPaths: [], aiPolish: true, checks: false }, lastEventAt: new Date().toISOString() },
        unclaimed: [{ login: "stranger", email: "s@x.test", name: "Stranger", commits: 3, last: "" }],
        stats: { commits: 14, tasks: 4, last: null },
      }),
    );
    git.status.mockResolvedValue({ enabled: true, identity: { login: "patrick", name: null, avatarUrl: null }, prefs: { aiPolish: true } });
    git.settings.mockResolvedValue({});
    render(<GitPanel p={project} meId={1} />);
    expect(await screen.findByText("aimee/farm-orders")).toBeTruthy();
    expect(screen.getByText("Commits linked")).toBeTruthy();
    expect(screen.getByText(/Your GitHub: @patrick/)).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Move tasks from GitHub" }));
    await waitFor(() => expect(git.settings).toHaveBeenCalledWith(9, { automations: false }));
    expect(screen.getByText("Commits from people we couldn't match")).toBeTruthy();
  });
});
