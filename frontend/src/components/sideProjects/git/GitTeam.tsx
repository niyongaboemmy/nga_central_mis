import React, { useState } from "react";
import { AtSign, Check, ExternalLink, Loader2, Pencil, Sparkles, UserCheck, Users, X, EyeOff, GitCommit } from "lucide-react";
import { failure, gitApi, type GitProjectPanel, type GitTeammate } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import SelectField from "../../ui/SelectField";
import UserAvatar from "../../ui/UserAvatar";
import { cardCls, ghostBtn, inputCls, primaryBtn, secondaryBtn, timeAgo } from "../ui";

/**
 * Team on GitHub: every teammate's GitHub username, so their commits are matched to
 * their tasks and their report drafts are written for them. The project lead sets
 * anyone's username; each person can set their own. An account someone connected
 * themself (Connect GitHub) stays theirs. Authors still unmatched are listed below with
 * "Assign" or "Ignore" for the lead (each person says "That's me" in step 2).
 */
const LOGIN_RE = /^@?[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const cleanLogin = (v: string) => v.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/[/?#].*$/, "").replace(/^@/, "");

const SOURCE_LABEL: Record<string, string> = {
  OAUTH: "Connected by them",
  CLAIM: "Added by them",
  LEAD: "Added by the project lead",
};

const ghAvatar = (login: string) => `https://github.com/${encodeURIComponent(login)}.png?size=80`;

const GitTeam: React.FC<{ projectId: number; panel: GitProjectPanel; meId: number; onChanged: () => Promise<void> }> = ({ projectId, panel, meId, onChanged }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [assign, setAssign] = useState<Record<string, string>>({});

  const linked = panel.team.filter((t) => t.login).length;
  const total = panel.team.length;
  const pct = total ? Math.round((linked / total) * 100) : 0;
  const canChange = (t: GitTeammate) => t.id === meId || (panel.canManage && t.source !== "OAUTH");

  const act = async (name: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(name);
    try {
      await fn();
      showToast(ok, "success");
      await onChanged();
      return true;
    } catch (e) {
      const f = failure(e);
      showToast(f.message, "error");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const startEdit = (t: GitTeammate) => {
    setEditing(t.id);
    setDraft(t.login ?? "");
    setFieldError(null);
  };

  const save = async (t: GitTeammate, raw = draft) => {
    const login = cleanLogin(raw);
    if (!LOGIN_RE.test(login)) {
      setFieldError("Use a GitHub username such as aimee-uwera");
      return;
    }
    setBusy(`link:${t.id}`);
    try {
      const out = await gitApi.setTeammateLogin(projectId, t.id, login);
      const whose = t.id === meId ? "Your" : `${t.name.split(" ")[0]}'s`;
      showToast(
        out.projects
          ? `${whose} GitHub is @${out.login}. Their earlier commits are matched now.`
          : `${whose} GitHub is @${out.login}. New commits will be matched.`,
        "success",
      );
      if (out.verified === false) showToast("GitHub couldn't confirm it right now; it was found in this project's commits.", "info");
      setEditing(null);
      await onChanged();
    } catch (e) {
      const f = failure(e);
      setFieldError(f.message);
      showToast(f.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const unlink = async (t: GitTeammate) => {
    const ok = await confirm({
      title: `Unlink @${t.login}?`,
      message: "Commits matched only through this username go back to unmatched, and the report draft is redone.",
      confirmText: "Unlink",
      tone: "warning",
    });
    if (!ok) return;
    await act(`unlink:${t.id}`, () => gitApi.clearTeammateLogin(projectId, t.id), `@${t.login} unlinked`);
  };

  const linkSuggestion = (t: GitTeammate) => {
    const s = t.suggestion!;
    if (s.login) return save(t, s.login);
    // An email-only author: map it to them (the lead) or claim it (themself).
    return act(
      `sugg:${t.id}`,
      () => (t.id === meId && !panel.canManage ? gitApi.claimAuthor(projectId, { email: s.email }) : gitApi.mapAuthor(projectId, { email: s.email, userId: t.id })),
      `${s.commits} ${s.commits === 1 ? "commit" : "commits"} matched to ${t.name}`,
    );
  };

  const ignoreAuthor = async (u: GitProjectPanel["unclaimed"][number]) => {
    const who = u.name || (u.login ? `@${u.login}` : u.email);
    const ok = await confirm({
      title: `Ignore ${who}?`,
      message: "Their commits stop counting towards anyone's report (a bot, or someone outside the team).",
      confirmText: "Ignore",
      tone: "warning",
    });
    if (!ok) return;
    const k = `${u.login ?? ""}|${u.email ?? ""}`;
    await act(`ign:${k}`, () => gitApi.mapAuthor(projectId, { login: u.login, email: u.email, ignore: true }), `${who} ignored`);
  };

  return (
    <section className={`${cardCls} p-4 sm:p-5`} aria-label="Team on GitHub">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-gray-100">
            <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden /> Team on GitHub
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">
            Link each teammate's GitHub username: their commits are matched to tasks and their reports drafted for them.
          </p>
        </div>
        <div className="w-40 shrink-0" aria-label={`${linked} of ${total} teammates linked`}>
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-bold text-slate-800 dark:text-gray-100">
              {linked}/{total} linked
            </span>
            <span className="text-slate-500 dark:text-gray-400">{pct}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <ul className="grid gap-3 md:grid-cols-2">
        {panel.team.map((t) => {
          const isEditing = editing === t.id;
          const allowed = canChange(t);
          const linking = busy === `link:${t.id}` || busy === `sugg:${t.id}`;
          return (
            <li key={t.id} className="rounded-2xl border border-slate-900/[0.06] p-3 transition-colors hover:border-blue-200 dark:border-white/[0.07] dark:hover:border-blue-500/30">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <UserAvatar name={t.name} userId={t.id} size={40} decorative />
                  {t.login && (
                    <img
                      src={t.avatarUrl || ghAvatar(t.login)}
                      alt=""
                      aria-hidden="true"
                      className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-white bg-white object-cover dark:border-gray-900"
                      onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-800 dark:text-gray-100">
                    <span className="truncate">{t.name}</span>
                    {t.id === meId && <span className="shrink-0 text-xs font-normal text-slate-500">(you)</span>}
                    {t.role === "OWNER" && (
                      <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">Lead</span>
                    )}
                  </p>
                  {t.login ? (
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <a
                        href={`https://github.com/${encodeURIComponent(t.login)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 font-mono font-semibold text-blue-700 hover:underline dark:text-blue-300"
                      >
                        @{t.login} <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                      <span className="text-slate-500 dark:text-gray-400">
                        <GitCommit className="mr-0.5 inline h-3 w-3" aria-hidden />
                        {t.commits ?? 0} {t.commits === 1 ? "commit" : "commits"}
                        {t.lastCommit ? ` · ${timeAgo(t.lastCommit)}` : ""}
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Not linked: commits can't be matched yet</p>
                  )}
                </div>
                {t.login && allowed && !isEditing && (
                  <div className="flex shrink-0 gap-0.5">
                    <button type="button" className={ghostBtn} onClick={() => startEdit(t)} aria-label={`Change ${t.name}'s GitHub username`} title="Change">
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={ghostBtn}
                      disabled={busy !== null}
                      onClick={() => unlink(t)}
                      aria-label={`Unlink ${t.name}'s GitHub username`}
                      title="Unlink"
                    >
                      {busy === `unlink:${t.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
                    </button>
                  </div>
                )}
              </div>

              {t.login && !isEditing && (
                <p className="mt-2 text-[11px] text-slate-500 dark:text-gray-400">
                  {SOURCE_LABEL[t.source ?? "OAUTH"] ?? ""}
                  {t.verified === false && <span className="ml-1 font-semibold text-amber-700 dark:text-amber-300">· not confirmed by GitHub yet</span>}
                </p>
              )}

              {!t.login && t.suggestion && allowed && !isEditing && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-blue-50/70 px-3 py-2 dark:bg-blue-500/10">
                  <Sparkles className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" aria-hidden />
                  <span className="min-w-0 flex-1 text-xs text-slate-700 dark:text-gray-200">
                    Looks like <span className="font-semibold">{t.suggestion.login ? `@${t.suggestion.login}` : t.suggestion.email}</span>
                    {" · "}
                    {t.suggestion.commits} {t.suggestion.commits === 1 ? "commit" : "commits"}
                  </span>
                  <button
                    type="button"
                    className={primaryBtn}
                    disabled={busy !== null}
                    onClick={() => linkSuggestion(t)}
                    aria-label={`Link ${t.suggestion.login ? `@${t.suggestion.login}` : t.suggestion.email} to ${t.name}`}
                  >
                    {linking ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />} Link
                  </button>
                </div>
              )}

              {((!t.login && allowed) || isEditing) && (
                <form
                  className="mt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save(t, isEditing ? draft : draft);
                  }}
                >
                  <div className="flex gap-2">
                    <label className="relative min-w-0 flex-1">
                      <span className="sr-only">GitHub username of {t.name}</span>
                      <AtSign className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
                      <input
                        value={editing === t.id ? draft : ""}
                        onFocus={() => editing !== t.id && startEdit(t)}
                        onChange={(e) => {
                          if (editing !== t.id) startEdit(t);
                          setDraft(e.target.value);
                          setFieldError(null);
                        }}
                        placeholder="github-username"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        aria-invalid={editing === t.id && !!fieldError}
                        className={`${inputCls} pl-8 font-mono text-xs`}
                      />
                    </label>
                    <button type="submit" className={secondaryBtn} disabled={busy !== null || editing !== t.id || !draft.trim()}>
                      {busy === `link:${t.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                      {t.login ? "Save" : "Link"}
                    </button>
                    {isEditing && t.login && (
                      <button type="button" className={ghostBtn} onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    )}
                  </div>
                  {editing === t.id && fieldError && (
                    <p role="alert" className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                      {fieldError}
                    </p>
                  )}
                </form>
              )}
            </li>
          );
        })}
      </ul>

      {panel.unclaimed.length > 0 && panel.canManage && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-700 dark:text-gray-200">Commits from people we couldn't match</p>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
              {panel.unclaimed.reduce((s, u) => s + u.commits, 0)} commits
            </span>
          </div>
          <ul className="space-y-2">
            {panel.unclaimed.map((u) => {
              const k = `${u.login ?? ""}|${u.email ?? ""}`;
              const who = u.name || (u.login ? `@${u.login}` : u.email) || "Unknown";
              return (
                <li key={k} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-900/[0.06] px-3 py-2.5 dark:border-white/[0.07]">
                  <UserAvatar name={who} src={u.login ? ghAvatar(u.login) : null} size={32} decorative />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-gray-100">{who}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-gray-400">
                      {u.login ? `@${u.login}` : u.email} · {u.commits} {u.commits === 1 ? "commit" : "commits"}
                      {u.last ? ` · ${timeAgo(u.last)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <SelectField
                      aria-label={`Who is ${who}`}
                      value={assign[k] ?? ""}
                      onChange={(e) => setAssign((a) => ({ ...a, [k]: e.target.value }))}
                      className="w-44 rounded-full border border-slate-900/[0.07] bg-white px-2.5 py-1 text-xs dark:border-white/10 dark:bg-gray-900"
                    >
                      <option value="">Assign to…</option>
                      {panel.team.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </SelectField>
                    <button
                      type="button"
                      className={secondaryBtn}
                      disabled={busy !== null || !assign[k]}
                      onClick={() =>
                        act(
                          `map:${k}`,
                          () => gitApi.mapAuthor(projectId, { login: u.login, email: u.email, userId: Number(assign[k]) }),
                          `${u.commits} ${u.commits === 1 ? "commit" : "commits"} assigned to ${panel.team.find((t) => t.id === Number(assign[k]))?.name ?? "them"}`,
                        )
                      }
                    >
                      {busy === `map:${k}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <UserCheck className="h-3.5 w-3.5" aria-hidden />} Assign
                    </button>
                    <button type="button" className={ghostBtn} disabled={busy !== null} onClick={() => ignoreAuthor(u)} aria-label={`Ignore ${who}`}>
                      <EyeOff className="h-3.5 w-3.5" aria-hidden /> Ignore
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
};

export default GitTeam;
