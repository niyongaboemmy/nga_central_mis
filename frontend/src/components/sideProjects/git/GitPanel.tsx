import React, { useCallback, useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Download,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  Github,
  KeyRound,
  Link2,
  Link2Off,
  RefreshCw,
  Settings2,
  UserCheck,
  Users,
  Wand2,
  Zap,
} from "lucide-react";
import { failure, gitApi, type GitInstallation, type GitProjectPanel, type GitRepo, type GitStatus, type ProjectDetail } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import SelectField from "../../ui/SelectField";
import UserAvatar from "../../ui/UserAvatar";
import { cardCls, ghostBtn, inputCls, primaryBtn, secondaryBtn, Skeleton, Spinner, StatTile, timeAgo } from "../ui";
import { CopyField, prMeta } from "./GitParts";

/**
 * Project → GitHub (GIT_AUTOMATED_REPORTING_ANALYSIS.md §10.1): connect the repository once
 * (the repository owner installs the NGA Projects app on their own account), link your GitHub
 * identity, set the task key and automations, map unclaimed authors, see recent activity.
 */

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; hint: string; icon: React.ElementType; disabled?: boolean }> = ({ on, onChange, label, hint, icon: Icon, disabled }) => (
  <label className={`flex items-start gap-3 rounded-2xl border border-slate-900/[0.06] p-3 dark:border-white/[0.06] ${disabled ? "opacity-60" : "cursor-pointer"}`}>
    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
      <Icon className="h-4 w-4" aria-hidden />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold text-slate-800 dark:text-gray-100">{label}</span>
      <span className="block text-xs text-slate-500 dark:text-gray-400">{hint}</span>
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-blue-600" : "bg-slate-300 dark:bg-gray-600"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  </label>
);

const Step: React.FC<{ n: number; done: boolean; title: string; children: React.ReactNode }> = ({ n, done, title, children }) => (
  <li className="flex gap-3 rounded-2xl border border-slate-900/[0.06] p-3.5 dark:border-white/[0.06]">
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-emerald-500 text-white" : "bg-blue-600 text-white"}`} aria-label={done ? `Step ${n} done` : `Step ${n}`}>
      {done ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : n}
    </span>
    <div className="min-w-0 flex-1 space-y-2">
      <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">{title}</p>
      {children}
    </div>
  </li>
);

/** A private repository's read-only token: where to make it and which boxes to tick. */
const TokenBox: React.FC<{ fullName: string; value: string; onChange: (v: string) => void; vault: boolean }> = ({ fullName, value, onChange, vault }) => (
  <div className="space-y-2 rounded-2xl bg-blue-50/70 p-3 text-xs text-slate-700 dark:bg-blue-500/10 dark:text-gray-200">
    {!vault && <p role="alert" className="font-semibold text-amber-800 dark:text-amber-200">This server can't keep tokens yet: make the repository public, or ask the administrator.</p>}
    <p className="font-semibold">A private repository needs a read-only token (two minutes, once):</p>
    <ol className="list-decimal space-y-0.5 pl-4">
      <li>
        <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 underline dark:text-blue-300">
          Open GitHub → New fine-grained token
        </a>{" "}
        (the repository's owner, or someone with access).
      </li>
      <li>Repository access: <span className="font-semibold">Only select repositories</span> → {parseName(fullName) || "this repository"}.</li>
      <li>Permissions: <span className="font-semibold">Contents</span> and <span className="font-semibold">Pull requests</span> → Read-only.</li>
      <li>Generate, copy it, paste it here.</li>
    </ol>
    <input type="password" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder="github_pat_…" aria-label="Read-only token" className={`${inputCls} font-mono`} />
    <p className="text-[11px] text-slate-500 dark:text-gray-400">It is stored encrypted and never shown again. The MIS only reads.</p>
  </div>
);
const parseName = (u: string) => /github\.com[/:]([^/\s]+\/[^/\s.]+)/.exec(u)?.[1] ?? (/^[^/\s]+\/[^/\s]+$/.test(u.trim()) ? u.trim() : "");

/** The NGA Projects app path (instant updates), when the server has the app configured. */
const AppConnect: React.FC<{
  p: ProjectDetail;
  busy: string | null;
  go: (name: string, fn: () => Promise<string>) => void;
  run: (name: string, fn: () => Promise<unknown>, ok: string) => Promise<boolean>;
  installs: GitInstallation[] | null;
  install: number | null;
  setInstall: (n: number) => void;
  repos: GitRepo[] | null;
  repoId: number | null;
  setRepoId: (n: number | null) => void;
  prefix: string;
}> = ({ p, busy, go, run, installs, install, setInstall, repos, repoId, setRepoId, prefix }) => (
  <div className="mt-2 space-y-2">
    <button type="button" className={secondaryBtn} disabled={busy !== null} onClick={() => go("install", () => gitApi.installUrl(p.id))}>
      {busy === "install" ? <Spinner className="h-4 w-4" /> : <Github className="h-4 w-4" />} Install on GitHub
    </button>
    {installs && installs.length > 0 && (
      <>
        {installs.length > 1 && (
          <SelectField aria-label="GitHub account" value={install ?? ""} onChange={(e) => setInstall(Number(e.target.value))} className={inputCls}>
            {installs.map((i) => (
              <option key={i.id} value={i.id}>@{i.account}</option>
            ))}
          </SelectField>
        )}
        {repos === null ? (
          <Skeleton className="h-9 w-full rounded-xl" />
        ) : (
          <SelectField aria-label="Repository" value={repoId ?? ""} onChange={(e) => setRepoId(Number(e.target.value) || null)} className={inputCls}>
            <option value="">Choose a repository…</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>{r.full_name}{r.projectId ? " (used by another project)" : ""}</option>
            ))}
          </SelectField>
        )}
        <button type="button" className={primaryBtn} disabled={busy !== null || !repoId || !install} onClick={() => void run("connect", () => gitApi.connect(p.id, { installationId: install!, repoId: repoId!, pathPrefix: prefix.trim() || null }), "Repository connected")}>
          <Link2 className="h-4 w-4" /> Connect with the app
        </button>
      </>
    )}
  </div>
);

const GitPanel: React.FC<{ p: ProjectDetail; meId: number }> = ({ p, meId }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [panel, setPanel] = useState<GitProjectPanel | null>(null);
  const [me, setMe] = useState<GitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [installs, setInstalls] = useState<GitInstallation[] | null>(null);
  const [install, setInstall] = useState<number | null>(null);
  const [repos, setRepos] = useState<GitRepo[] | null>(null);
  const [repoId, setRepoId] = useState<number | null>(null);
  const [prefix, setPrefix] = useState("");
  const [key, setKey] = useState("");
  const [ignored, setIgnored] = useState("");
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [url, setUrl] = useState("");
  const [urlErr, setUrlErr] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [needToken, setNeedToken] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [login, setLogin] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [x, s] = await Promise.all([gitApi.project(p.id), gitApi.status()]);
      setPanel(x);
      setMe(s);
      setKey(x.taskKey ?? "");
      setUrl((u) => u || x.suggestedUrl || "");
      setIgnored((x.link?.settings.ignoredPaths ?? []).join("\n"));
      if (!x.link && x.canManage && x.appEnabled) {
        const list = await gitApi.installations().catch(() => []);
        setInstalls(list);
        const fromUrl = Number(new URLSearchParams(window.location.search).get("installation"));
        setInstall(list.find((i) => i.id === fromUrl)?.id ?? list[0]?.id ?? null);
      }
    } catch (e) {
      setError(failure(e, "Couldn't load the GitHub connection").message);
    }
  }, [p.id]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!install) return setRepos(null);
    let live = true;
    setRepos(null);
    gitApi
      .repos(install)
      .then((r) => live && (setRepos(r), setRepoId(r.find((x) => !x.projectId)?.id ?? null)))
      .catch((e) => live && (setRepos([]), showToast(failure(e, "Couldn't list the repositories").message, "error")));
    return () => {
      live = false;
    };
  }, [install, showToast]);

  const run = async (name: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(name);
    try {
      await fn();
      showToast(ok, "success");
      await load();
      return true;
    } catch (e) {
      showToast(failure(e).message, "error");
      return false;
    } finally {
      setBusy(null);
    }
  };
  const go = async (name: string, fn: () => Promise<string>) => {
    setBusy(name);
    try {
      window.location.assign(await fn());
    } catch (e) {
      showToast(failure(e).message, "error");
      setBusy(null);
    }
  };

  const connectLink = async () => {
    setBusy("link");
    setUrlErr(null);
    try {
      const r = await gitApi.connectLink(p.id, { url: url.trim(), token: token.trim() || undefined, pathPrefix: prefix.trim() || null });
      setNeedToken(false);
      setToken("");
      showToast(r.sync?.error ? `Connected ${r.fullName}. ${r.sync.error}` : `Connected ${r.fullName}${r.sync?.commits ? `: ${r.sync.commits} commits read` : ""}`, r.sync?.error ? "warning" : "success");
      await load();
    } catch (e) {
      const f = failure(e, "Couldn't connect the repository");
      if (f.code === "TOKEN_NEEDED") setNeedToken(true);
      setUrlErr(f.message);
      showToast(f.message, f.code === "TOKEN_NEEDED" ? "info" : "error");
    } finally {
      setBusy(null);
    }
  };

  if (error)
    return (
      <div className={`${cardCls} flex items-center justify-between gap-3 p-4`}>
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        <button type="button" className={secondaryBtn} onClick={load}>
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      </div>
    );
  if (!panel || !me)
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading the GitHub connection">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );

  const s = panel.link?.settings ?? panel.settings;
  const saveSetting = (patch: Record<string, unknown>, ok = "Saved") => run("settings", () => gitApi.settings(p.id, patch), ok);
  const exampleKey = panel.taskKey ?? "KEY";
  const openPrs = panel.prs.filter((x) => x.state === "OPEN").length;

  const step1 = !!panel.link;
  const step2 = !!me.identity;
  const step3 = panel.stats.tasks > 0;
  const isLink = panel.link?.mode === "LINK";
  const mine = panel.unclaimed;

  return (
    <div className="space-y-5">
      {/* Three steps to reports written from GitHub */}
      <section className={`${cardCls} p-4 sm:p-5`} aria-label="Get your reports from GitHub">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
            <Github className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-slate-900 dark:text-white">Reports written from your GitHub work</p>
            <p className="text-xs text-slate-500 dark:text-gray-400">Three steps, once. Then branches move your tasks and your report fills itself.</p>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold tabular-nums text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{[step1, step2, step3].filter(Boolean).length}/3 done</span>
        </div>

        <ol className="mt-4 space-y-3">
          <Step n={1} done={step1} title={step1 ? "Repository connected" : "Connect the repository"}>
            {panel.link ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600 dark:text-gray-300">
                <a href={panel.link.htmlUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-slate-900 hover:text-blue-700 dark:text-white dark:hover:text-blue-300">
                  {panel.link.fullName} <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
                {isLink ? (
                  <span>{panel.link.syncedAt ? `synced ${timeAgo(panel.link.syncedAt)}` : "first sync pending"} · every 10 minutes{panel.link.tokenHint ? ` · token …${panel.link.tokenHint}` : ""}</span>
                ) : (
                  <span>live updates · {panel.link.lastEventAt ? `last activity ${timeAgo(panel.link.lastEventAt)}` : "waiting for the first push"}</span>
                )}
                {isLink && panel.canEdit && (
                  <button type="button" className={`${ghostBtn} !py-1`} disabled={busy !== null} onClick={() => run("sync", async () => {
                    const r = await gitApi.sync(p.id);
                    if (r.commits || r.prs) showToast(`Synced: ${r.commits ?? 0} new commits, ${r.prs ?? 0} pull request updates`, "success");
                  }, "Up to date")}>
                    {busy === "sync" ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />} Sync now
                  </button>
                )}
                {panel.canManage && (
                  <button
                    type="button"
                    className={`${ghostBtn} !py-1`}
                    disabled={busy !== null}
                    onClick={async () => {
                      if (await confirm({ title: "Disconnect the repository?", message: "New GitHub activity stops linking to this project. Reports already written stay.", confirmText: "Disconnect", tone: "danger" }))
                        void run("unlink", () => gitApi.unlink(p.id), "Repository disconnected");
                    }}
                  >
                    <Link2Off className="h-3.5 w-3.5" /> Disconnect
                  </button>
                )}
                {panel.link.syncError && (
                  <p role="alert" className="basis-full rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                    {panel.link.syncError}
                    {panel.canManage && /token/i.test(panel.link.syncError) && (
                      <button type="button" className="ml-2 font-semibold underline" onClick={() => setShowToken(true)}>
                        Add a token
                      </button>
                    )}
                  </p>
                )}
                {panel.canManage && showToken && isLink && (
                  <div className="basis-full">
                    <TokenBox fullName={panel.link.fullName} value={token} onChange={setToken} vault={panel.vault !== false} />
                    <button type="button" className={`${primaryBtn} mt-2`} disabled={busy !== null || !token.trim()} onClick={() => run("token", () => gitApi.connectLink(p.id, { url: panel.link!.htmlUrl, token: token.trim(), pathPrefix: panel.link!.pathPrefix }), "Token saved").then(() => (setShowToken(false), setToken("")))}>
                      <KeyRound className="h-4 w-4" /> Save token
                    </button>
                  </div>
                )}
              </div>
            ) : panel.canManage ? (
              <div className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input value={url} onChange={(e) => (setUrl(e.target.value), setUrlErr(null))} placeholder="https://github.com/you/project" aria-label="Repository address" className={`${inputCls} flex-1 ${urlErr ? "!border-red-400" : ""}`} />
                  <button type="button" className={primaryBtn} disabled={busy !== null || !url.trim() || (needToken && !token.trim())} onClick={connectLink}>
                    {busy === "link" ? <Spinner className="h-4 w-4" /> : <Link2 className="h-4 w-4" />} Connect
                  </button>
                </div>
                {urlErr && <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{urlErr}</p>}
                <p className="text-[11px] text-slate-500 dark:text-gray-400">Paste the repository's address. Public repositories connect at once; a private one asks for a read-only token.</p>
                {needToken && <TokenBox fullName={url} value={token} onChange={setToken} vault={panel.vault !== false} />}
                <details className="text-xs text-slate-600 dark:text-gray-300">
                  <summary className="cursor-pointer font-semibold text-slate-700 dark:text-gray-200">More options</summary>
                  <div className="mt-2 space-y-2">
                    <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="Folder, only if several projects share the repository" aria-label="Folder in the repository" className={inputCls} />
                    {panel.appEnabled && (
                      <div className="rounded-xl border border-slate-900/[0.06] p-3 dark:border-white/[0.06]">
                        <p className="font-semibold text-slate-800 dark:text-gray-100">Instant updates with the NGA Projects app</p>
                        <p className="mt-0.5 text-slate-500 dark:text-gray-400">Instead of syncing every 10 minutes. The repository's owner installs it on their GitHub account.</p>
                        <AppConnect p={p} busy={busy} go={go} run={run} installs={installs} install={install} setInstall={setInstall} repos={repos} repoId={repoId} setRepoId={setRepoId} prefix={prefix} />
                      </div>
                    )}
                  </div>
                </details>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-gray-400">The project lead connects it: they paste the repository's address here. You can do step 2 already.</p>
            )}
          </Step>

          <Step n={2} done={step2} title={step2 ? `You are @${me.identity!.login} on GitHub` : "Tell us who you are on GitHub"}>
            {me.identity ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-gray-300">
                {me.identity.avatarUrl ? <img src={me.identity.avatarUrl} alt="" className="h-6 w-6 rounded-full" /> : <UserAvatar name={me.identity.login} size={24} decorative />}
                <span>Your commits and pull requests are matched to you.</span>
                <button type="button" className={`${ghostBtn} !py-1`} disabled={busy !== null} onClick={() => run("disconnect", () => gitApi.disconnect(), "GitHub account unlinked")}>
                  Change
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <form
                  className="flex flex-col gap-2 sm:flex-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (login.trim()) void run("login", async () => {
                      const r = await gitApi.claimLogin(login.trim());
                      setLogin("");
                      return r;
                    }, "GitHub username saved");
                  }}
                >
                  <span className="relative flex-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">@</span>
                    <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="your-github-username" aria-label="Your GitHub username" className={`${inputCls} pl-7`} />
                  </span>
                  <button type="submit" className={primaryBtn} disabled={busy !== null || !login.trim()}>
                    {busy === "login" ? <Spinner className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />} Save
                  </button>
                  {me.oauth && (
                    <button type="button" className={secondaryBtn} disabled={busy !== null} onClick={() => go("oauth", () => gitApi.connectUrl(`/my-projects?project=${p.id}&tab=github`))}>
                      <Github className="h-4 w-4" /> Sign in with GitHub
                    </button>
                  )}
                </form>
                <p className="text-[11px] text-slate-500 dark:text-gray-400">Commits made with your MIS email are matched without this.</p>
                {mine.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-slate-700 dark:text-gray-200">Is one of these you?</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {mine.slice(0, 6).map((u) => (
                        <li key={`${u.login}|${u.email}`}>
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => run(`me:${u.login}|${u.email}`, () => gitApi.claimAuthor(p.id, { login: u.login, email: u.email }), "Those commits are yours now")}
                            className="inline-flex items-center gap-1.5 rounded-full border border-slate-900/[0.07] bg-white px-2.5 py-1 text-xs text-slate-700 transition hover:border-blue-300 hover:text-blue-700 dark:border-white/10 dark:bg-gray-900 dark:text-gray-200"
                          >
                            <span className="font-semibold">{u.login ? `@${u.login}` : u.name || u.email}</span>
                            <span className="text-slate-500 dark:text-gray-400">{u.commits} {u.commits === 1 ? "commit" : "commits"}</span>
                            <span className="font-semibold text-blue-700 dark:text-blue-300">That's me</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Step>

          <Step n={3} done={step3} title="Work on a task">
            <div className="space-y-2 text-xs text-slate-600 dark:text-gray-300">
              <p>
                Open a task and copy its branch name. Anything with <span className="font-mono font-semibold">{exampleKey}-27</span> in the branch, commit or pull request title links to task 27. Forgot the key? Pick the task once in your report draft; later commits on that branch follow.
              </p>
              <CopyField value={`git switch -c feat/${exampleKey}-27-build-the-order-form`} label="Example" />
              <p className="text-slate-500 dark:text-gray-400">
                Your report then fills itself: <span className="font-semibold text-slate-700 dark:text-gray-200">Progress → From GitHub</span>, or <span className="font-semibold text-slate-700 dark:text-gray-200">Import from GitHub</span> in a new report.
              </p>
            </div>
          </Step>
        </ol>
      </section>

      {panel.link && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile icon={GitCommitHorizontal} value={panel.stats.commits} label="Commits linked" />
          <StatTile icon={GitBranch} value={panel.stats.tasks} label="Tasks with commits" />
          <StatTile icon={Github} value={openPrs} label="Open pull requests" tone={openPrs ? "warn" : "blue"} />
        </div>
      )}

      {me.identity && (
        <Toggle
          on={me.prefs.aiPolish}
          onChange={(v) => run("prefs", () => gitApi.setPrefs({ aiPolish: v }), v ? "AI wording on" : "AI wording off")}
          icon={Wand2}
          label="Word my drafts with AI"
          hint="Only commit titles and task names are sent, never code. Your school's AI policy applies."
          disabled={busy !== null}
        />
      )}

      <details className={`${cardCls} p-4`}>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-800 dark:text-gray-100">
          <KeyRound className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden /> Task key and commit commands
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            {panel.canManage ? (
              <div className="flex items-center gap-2">
                <input value={key} onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5))} aria-label="Task key" className={`${inputCls} w-28 font-mono text-base font-bold tracking-wider`} />
                <button type="button" className={secondaryBtn} disabled={busy !== null || key === panel.taskKey || key.length < 2} onClick={() => saveSetting({ taskKey: key }, "Task key saved")}>
                  Save key
                </button>
              </div>
            ) : (
              <p className="font-mono text-lg font-bold tracking-wider text-slate-900 dark:text-white">{panel.taskKey ?? "—"}</p>
            )}
            <p className="text-xs text-slate-500 dark:text-gray-400">2 to 5 letters. Every task's key is this plus its number.</p>
          </div>
          <div className="space-y-2 text-xs text-slate-600 dark:text-gray-300">
            <ul className="space-y-1">
              <li><code className="font-mono font-semibold">#time 1h30m</code> hours spent on that task</li>
              <li><code className="font-mono font-semibold">#blocked waiting for the API key</code> marks it Blocked</li>
              <li><code className="font-mono font-semibold">#review</code> / <code className="font-mono font-semibold">#done</code> moves it without a pull request</li>
            </ul>
            <a href="/templates/projects/git-hooks/prepare-commit-msg" download className={`${ghostBtn} !px-0`}>
              <Download className="h-4 w-4" /> Commit hook: adds the task key from your branch name
            </a>
          </div>
        </div>
      </details>

      {/* Settings */}
      {panel.link && panel.canManage && (
        <section className={`${cardCls} space-y-3 p-4`} aria-label="Automation settings">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-gray-100">
            <Settings2 className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden /> Automations
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            <Toggle on={s.automations} onChange={(v) => saveSetting({ automations: v })} icon={Zap} label="Move tasks from GitHub" hint="Branch → In progress, pull request → In review, merged → Done. Only as far as the developer could move it by hand." disabled={busy !== null} />
            <Toggle on={s.aiPolish} onChange={(v) => saveSetting({ aiPolish: v })} icon={Wand2} label="Offer AI wording of drafts" hint="Each person can still turn it off for themselves." disabled={busy !== null} />
            <Toggle on={s.checks} onChange={(v) => saveSetting({ checks: v })} icon={Bot} label="Check on pull requests" hint='Shows "Linked to KEY-12" on GitHub. Needs the app&apos;s Checks permission.' disabled={busy !== null} />
            <label className="flex items-start gap-3 rounded-2xl border border-slate-900/[0.06] p-3 dark:border-white/[0.06]">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                <RefreshCw className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-800 dark:text-gray-100">Submit drafts automatically</span>
                <span className="block text-xs text-slate-500 dark:text-gray-400">After the Friday reminder, if nobody reviewed it. Badged "From GitHub · auto".</span>
              </span>
              <SelectField
                aria-label="Submit drafts automatically"
                value={s.autoSubmitDays === null ? "" : String(s.autoSubmitDays)}
                onChange={(e) => saveSetting({ autoSubmitDays: e.target.value ? Number(e.target.value) : null })}
                className="w-32 rounded-full border border-slate-900/[0.07] bg-white px-2.5 py-1 text-xs font-semibold dark:border-white/10 dark:bg-gray-900"
              >
                <option value="">Never</option>
                {[1, 2, 3, 5, 7].map((n) => (
                  <option key={n} value={n}>
                    After {n} {n === 1 ? "day" : "days"}
                  </option>
                ))}
              </SelectField>
            </label>
          </div>
          <div>
            <p className="mb-1 text-xs font-bold text-slate-700 dark:text-gray-200">Paths that don't count as work</p>
            <textarea value={ignored} onChange={(e) => setIgnored(e.target.value)} rows={2} placeholder={"docs/generated/\nassets/vendor/"} className={`${inputCls} font-mono text-xs`} aria-label="Ignored paths" />
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <p className="text-[11px] text-slate-500 dark:text-gray-400">Lockfiles, dist/, build/ and vendor/ are already ignored. One path per line.</p>
              <button type="button" className={secondaryBtn} disabled={busy !== null || ignored === (panel.link.settings.ignoredPaths ?? []).join("\n")} onClick={() => saveSetting({ ignoredPaths: ignored.split("\n") as any }, "Paths saved")}>
                Save paths
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Team linking + unclaimed */}
      {panel.link && (
        <section className={`${cardCls} p-4`} aria-label="Team on GitHub">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-gray-100">
            <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden /> Team on GitHub
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {panel.team.map((t) => (
              <li key={t.id} className="flex items-center gap-2.5 rounded-xl border border-slate-900/[0.05] px-3 py-2 dark:border-white/[0.06]">
                <UserAvatar name={t.name} userId={t.id} size={28} decorative />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800 dark:text-gray-100">
                  {t.name}
                  {t.id === meId ? " (you)" : ""}
                </span>
                {t.login ? (
                  <span className="truncate font-mono text-xs text-blue-700 dark:text-blue-300">@{t.login}</span>
                ) : (
                  <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">not linked</span>
                )}
              </li>
            ))}
          </ul>
          {panel.canManage && panel.unclaimed.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold text-slate-700 dark:text-gray-200">Commits from people we couldn't match</p>
              <ul className="space-y-2">
                {panel.unclaimed.map((u) => {
                  const k = `${u.login ?? ""}|${u.email ?? ""}`;
                  return (
                    <li key={k} className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50/70 px-3 py-2 dark:bg-amber-500/10">
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="font-semibold text-slate-800 dark:text-gray-100">{u.name || u.login || u.email}</span>{" "}
                        <span className="text-xs text-slate-500 dark:text-gray-400">
                          {u.login ? `@${u.login}` : u.email} · {u.commits} {u.commits === 1 ? "commit" : "commits"}
                        </span>
                      </span>
                      <SelectField aria-label={`Who is ${u.name || u.login || u.email}`} value={assign[k] ?? ""} onChange={(e) => setAssign((a) => ({ ...a, [k]: e.target.value }))} className="w-44 rounded-full border border-slate-900/[0.07] bg-white px-2.5 py-1 text-xs dark:border-white/10 dark:bg-gray-900">
                        <option value="">Teammate…</option>
                        {panel.team.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </SelectField>
                      <button type="button" className={secondaryBtn} disabled={busy !== null || !assign[k]} onClick={() => run(`map:${k}`, () => gitApi.mapAuthor(p.id, { login: u.login, email: u.email, userId: Number(assign[k]) }), "Commits assigned")}>
                        Assign
                      </button>
                      <button type="button" className={ghostBtn} disabled={busy !== null} onClick={() => run(`ign:${k}`, () => gitApi.mapAuthor(p.id, { login: u.login, email: u.email, ignore: true }), "Author ignored")}>
                        Ignore
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Activity */}
      {panel.link && (panel.prs.length > 0 || panel.commits.length > 0) && (
        <section className="grid gap-4 lg:grid-cols-2" aria-label="Recent activity">
          <div className={`${cardCls} p-4`}>
            <p className="mb-2 text-sm font-bold text-slate-800 dark:text-gray-100">Pull requests</p>
            {panel.prs.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-gray-400">No pull requests yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {panel.prs.map((pr) => {
                  const m = prMeta(pr);
                  return (
                    <li key={pr.number} className="flex items-center gap-2 text-xs">
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${m.cls}`}>
                        <m.icon className="h-3 w-3" aria-hidden /> {m.label}
                      </span>
                      <a href={pr.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-semibold text-slate-800 hover:text-blue-700 dark:text-gray-100 dark:hover:text-blue-300">
                        #{pr.number} {pr.title}
                      </a>
                      <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className={`${cardCls} p-4`}>
            <p className="mb-2 text-sm font-bold text-slate-800 dark:text-gray-100">Latest commits</p>
            <ul className="space-y-1.5">
              {panel.commits.map((c) => (
                <li key={c.sha} className="flex items-center gap-2 text-xs text-slate-600 dark:text-gray-300">
                  <span className="shrink-0 font-mono text-[10px] text-slate-400">{c.sha.slice(0, 7)}</span>
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="shrink-0 text-[11px] text-slate-500 dark:text-gray-400">
                    {c.author ?? "unknown"} · {timeAgo(c.at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
};

export default GitPanel;
