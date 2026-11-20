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
  connectLink: vi.fn(),
  sync: vi.fn(),
  claimLogin: vi.fn(),
  claimAuthor: vi.fn(),
  setTeammateLogin: vi.fn(),
  clearTeammateLogin: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("../../../api/sideProjects", async (orig) => ({ ...(await orig<object>()), gitApi: git }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: toast }) }));
vi.mock("../../../contexts/ConfirmContext", () => ({ useConfirm: () => async () => true }));

import { CopyField, PrChip, SourceBadge, TaskDevSection } from "../git/GitParts";
import DraftCard from "../git/DraftCard";
import GitPanel from "../git/GitPanel";
import GitTeam from "../git/GitTeam";

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
  it("offers the suggested task in one tap and says the branch will follow", async () => {
    git.draft.mockResolvedValue({ draft: draft(), canPolish: false });
    git.editDraft.mockResolvedValue(draft({ lines: [{ ...draft().lines[0] }, { ...draft().lines[1], taskId: 27, itemId: 11, title: "Build the shop order form" }] }));
    render(<DraftCard p={project} plan={plan} meId={2} onSubmitted={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: /Build the shop order form\?/ }));
    await waitFor(() => expect(git.editDraft).toHaveBeenCalledWith(5, { lines: [{ key: "u:feat/misc", taskId: 27 }] }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Linked to Build the shop order form. Later commits on this branch follow", "success"));
  });
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
  it("not connected: paste the address, a private repository asks for a token, then connects", async () => {
    git.project.mockResolvedValue(panel({ suggestedUrl: "https://github.com/aimee/farm-orders", appEnabled: false, vault: true }));
    git.status.mockResolvedValue({ enabled: true, oauth: false, identity: null, prefs: { aiPolish: true } });
    git.connectLink
      .mockRejectedValueOnce({ response: { data: { code: "TOKEN_NEEDED", field: "token", message: "This repository is private. Add a read-only token to connect it" } } })
      .mockResolvedValueOnce({ fullName: "aimee/farm-orders", private: true, sync: { commits: 12 } });
    render(<GitPanel p={project} meId={1} />);
    expect(screen.getByLabelText("Loading the GitHub connection")).toBeTruthy();
    // The project's own GitHub link is already filled in.
    expect(await screen.findByDisplayValue("https://github.com/aimee/farm-orders")).toBeTruthy();
    expect(screen.getByText("0/3 done")).toBeTruthy();
    // No app on this server: no install button, no GitHub sign-in.
    expect(screen.queryByRole("button", { name: /Install on GitHub/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Sign in with GitHub/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Connect$/ }));
    const tokenBox = await screen.findByLabelText("Read-only token");
    expect(screen.getByText(/Open GitHub → New fine-grained token/)).toBeTruthy();
    fireEvent.change(tokenBox, { target: { value: "github_pat_11ABCDEFG0123456789_abcdefghij" } });
    fireEvent.click(screen.getByRole("button", { name: /^Connect$/ }));
    await waitFor(() => expect(git.connectLink).toHaveBeenLastCalledWith(9, { url: "https://github.com/aimee/farm-orders", token: "github_pat_11ABCDEFG0123456789_abcdefghij", pathPrefix: null }));
    expect(toast).toHaveBeenCalledWith("Connected aimee/farm-orders: 12 commits read", "success");
  });
  it("a teammate types their GitHub username or says That's me", async () => {
    git.project.mockResolvedValue(
      panel({
        canManage: false,
        link: { fullName: "aimee/farm-orders", htmlUrl: "https://github.com/aimee/farm-orders", defaultBranch: "main", pathPrefix: null, installationId: null, settings: { automations: true, autoSubmitDays: 2, ignoredPaths: [], aiPolish: true, checks: false }, lastEventAt: null, mode: "LINK", syncedAt: new Date().toISOString(), syncError: null },
        unclaimed: [{ login: null, email: "aimee@laptop.local", name: "Aimée", commits: 3, last: "" }],
      }),
    );
    git.status.mockResolvedValue({ enabled: true, oauth: false, identity: null, prefs: { aiPolish: true } });
    git.claimLogin.mockResolvedValue({ login: "aimee-uwera", name: null, avatarUrl: null });
    git.claimAuthor.mockResolvedValue({});
    git.sync.mockResolvedValue({ ok: true, commits: 2, prs: 0 });
    render(<GitPanel p={project} meId={1} />);
    expect(await screen.findByText(/synced/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Your GitHub username"), { target: { value: "@aimee-uwera" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() => expect(git.claimLogin).toHaveBeenCalledWith("@aimee-uwera"));
    expect(toast).toHaveBeenCalledWith("GitHub username saved", "success");
    fireEvent.click(screen.getByRole("button", { name: /That's me/ }));
    await waitFor(() => expect(git.claimAuthor).toHaveBeenCalledWith(9, { login: null, email: "aimee@laptop.local" }));
    fireEvent.click(screen.getByRole("button", { name: /Sync now/ }));
    await waitFor(() => expect(git.sync).toHaveBeenCalledWith(9));
    expect(toast).toHaveBeenCalledWith("Synced: 2 new commits, 0 pull request updates", "success");
  });
  it("an ecosystem: several repositories, disconnect one, add another, sync all", async () => {
    const settings = { automations: true, autoSubmitDays: 2, ignoredPaths: [], aiPolish: true, checks: false };
    const link = (linkId: number, name: string, commits: number) => ({ linkId, fullName: `niyongaboemmy/${name}`, htmlUrl: `https://github.com/niyongaboemmy/${name}`, defaultBranch: "main", pathPrefix: null, installationId: null, mode: "LINK" as const, tokenHint: null, syncedAt: new Date().toISOString(), syncError: null, lastEventAt: null, commits });
    git.project.mockResolvedValue(
      panel({
        link: { fullName: "niyongaboemmy/nga_central_mis", htmlUrl: "https://github.com/niyongaboemmy/nga_central_mis", defaultBranch: "main", pathPrefix: null, installationId: null, settings, lastEventAt: null, mode: "LINK" },
        links: [link(1, "nga_central_mis", 40), link(2, "nga-task-mentor", 12)],
      }),
    );
    git.status.mockResolvedValue({ enabled: true, oauth: false, identity: null, prefs: { aiPolish: true } });
    git.unlink.mockResolvedValue({});
    git.connectLink.mockResolvedValue({ fullName: "niyongaboemmy/nga-tmcode", private: false, sync: { commits: 3 } });
    git.sync.mockResolvedValue({ ok: true, commits: 5, prs: 1, repos: 2, errors: [] });
    render(<GitPanel p={project} meId={1} />);
    expect(await screen.findByText("2 repositories connected")).toBeTruthy();
    expect(screen.getByText("40 commits")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect niyongaboemmy/nga-task-mentor" }));
    await waitFor(() => expect(git.unlink).toHaveBeenCalledWith(9, 2));
    fireEvent.click(screen.getByRole("button", { name: /Add another repository/ }));
    fireEvent.change(screen.getByLabelText("Repository address"), { target: { value: "https://github.com/niyongaboemmy/nga-tmcode" } });
    fireEvent.click(screen.getByRole("button", { name: /^Connect$/ }));
    await waitFor(() => expect(git.connectLink).toHaveBeenCalledWith(9, { url: "https://github.com/niyongaboemmy/nga-tmcode", token: undefined, pathPrefix: null }));
    fireEvent.click(await screen.findByRole("button", { name: /Sync all/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Synced 2 repositories: 5 new commits, 1 pull request updates", "success"));
  });
  it("with the app configured, it is offered as the instant option", async () => {
    git.project.mockResolvedValue(panel({ appEnabled: true }));
    git.status.mockResolvedValue({ enabled: true, oauth: true, identity: null, prefs: { aiPolish: true } });
    git.installations.mockResolvedValue([{ id: 900, account: "aimee", type: "User", suspended: false }]);
    git.repos.mockResolvedValue([{ id: 7, full_name: "aimee/farm-orders", html_url: "", default_branch: "main", private: true, projectId: null }]);
    git.connect.mockResolvedValue({});
    render(<GitPanel p={project} meId={1} />);
    expect(await screen.findByRole("button", { name: /Sign in with GitHub/ })).toBeTruthy();
    fireEvent.click(screen.getByText("More options"));
    const connect = await screen.findByRole("button", { name: /Connect with the app/ });
    await waitFor(() => expect((connect as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(connect);
    await waitFor(() => expect(git.connect).toHaveBeenCalledWith(9, { installationId: 900, repoId: 7, pathPrefix: null }));
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
    expect(screen.getByText("3/3 done")).toBeTruthy();
    expect(screen.getByText("Commits linked")).toBeTruthy();
    expect(screen.getByText(/You are @patrick on GitHub/)).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Move tasks from GitHub" }));
    await waitFor(() => expect(git.settings).toHaveBeenCalledWith(9, { automations: false }));
    expect(screen.getByText("Commits from people we couldn't match")).toBeTruthy();
  });
});

describe("Team on GitHub", () => {
  const base = (over: Partial<GitProjectPanel> = {}) =>
    ({
      canManage: true,
      unclaimed: [{ login: "niyongaboemmy", email: null, name: "Niyongabo Emmanuel", commits: 17, last: "" }],
      team: [
        { id: 1, name: "Aimee Uwera", role: "OWNER", login: "aimee-uwera", avatarUrl: null, source: "OAUTH", verified: true, commits: 12, lastCommit: null, suggestion: null },
        { id: 2, name: "Niyongabo Emmanuel", role: "MEMBER", login: null, avatarUrl: null, source: null, verified: null, commits: 0, suggestion: { login: "niyongaboemmy", email: null, name: "Niyongabo Emmanuel", commits: 17 } },
        { id: 3, name: "Jean Karenzi", role: "MEMBER", login: null, avatarUrl: null, source: null, verified: null, commits: 0, suggestion: null },
      ],
      ...over,
    }) as unknown as GitProjectPanel;

  it("shows progress, links a suggestion in one tap, and types a member's username", async () => {
    const changed = vi.fn().mockResolvedValue(undefined);
    git.setTeammateLogin.mockResolvedValue({ login: "niyongaboemmy", avatarUrl: null, verified: true, projects: 1 });
    render(<GitTeam projectId={9} panel={base()} meId={1} onChanged={changed} />);
    expect(screen.getByText("1/3 linked")).toBeTruthy();
    expect(screen.getByText(/Looks like/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Link @niyongaboemmy to Niyongabo Emmanuel" }));
    await waitFor(() => expect(git.setTeammateLogin).toHaveBeenCalledWith(9, 2, "niyongaboemmy"));
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/GitHub is @niyongaboemmy/), "success");
    expect(changed).toHaveBeenCalled();

    git.setTeammateLogin.mockResolvedValue({ login: "jkarenzi", avatarUrl: null, verified: false, projects: 0 });
    const input = screen.getByLabelText("GitHub username of Jean Karenzi");
    fireEvent.change(input, { target: { value: "bad name!" } });
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByText(/Use a GitHub username/)).toBeTruthy();
    fireEvent.change(input, { target: { value: "https://github.com/jkarenzi" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(git.setTeammateLogin).toHaveBeenCalledWith(9, 3, "jkarenzi"));
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/couldn't confirm/), "info");
  });

  it("an account someone connected themself can't be changed by the lead; unmatched authors can be assigned", async () => {
    git.mapAuthor.mockResolvedValue({});
    render(<GitTeam projectId={9} panel={base()} meId={2} onChanged={vi.fn().mockResolvedValue(undefined)} />);
    expect(screen.queryByRole("button", { name: "Change Aimee Uwera's GitHub username" })).toBeNull();
    expect(screen.getByText("Connected by them")).toBeTruthy();
    fireEvent.change(screen.getAllByLabelText("Who is Niyongabo Emmanuel").find((e) => e.tagName === "SELECT")!, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Assign/ }));
    await waitFor(() => expect(git.mapAuthor).toHaveBeenCalledWith(9, { login: "niyongaboemmy", email: null, userId: 2 }));
  });

  it("a member sees no other member's form and no unmatched list", () => {
    render(<GitTeam projectId={9} panel={base({ canManage: false })} meId={2} onChanged={vi.fn()} />);
    expect(screen.queryByLabelText("GitHub username of Jean Karenzi")).toBeNull();
    expect(screen.getByLabelText("GitHub username of Niyongabo Emmanuel")).toBeTruthy();
    expect(screen.queryByText(/couldn't match/)).toBeNull();
  });
});
