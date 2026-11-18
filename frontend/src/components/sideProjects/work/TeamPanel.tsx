import React, { useEffect, useState } from "react";
import { Check, Clock3, Mail, NotebookPen, Pencil, ShieldCheck, Undo2, UserMinus, UserPlus, Users, UserRound, X, Plus } from "lucide-react";
import { failure, sideProjectsApi, type MemberReport, type ProjectDetail, type RoleKey, type TeamMode } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import UserAvatar from "../../ui/UserAvatar";
import { PersonPicker, TYPE_LABEL } from "../fields";
import { Field, FormModal, TextArea } from "../form";
import { Skeleton, Spinner, cardCls, inputCls, primaryBtn, secondaryBtn } from "../ui";
import { POSITION_SUGGESTIONS, ROLE_KEYS, ROLE_META, fmtDay, roleKeyFor } from "./meta";

type Member = ProjectDetail["members"][number];

/** Who the position editor is for: a teammate (invited or accepted) or the owner. */
type PositionTarget = { id: number; name: string; owner: boolean; roleKey: RoleKey; roleTitle: string | null; responsibilities: string | null; isManager: boolean };

const PositionChips: React.FC<{ value: string; onPick: (v: string) => void }> = ({ value, onPick }) => (
  <div className="mt-2 flex flex-wrap gap-1.5">
    {POSITION_SUGGESTIONS.map((s) => {
      const on = value.trim().toLowerCase() === s.toLowerCase();
      return (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          aria-pressed={on}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${on ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/10"}`}
        >
          {s}
        </button>
      );
    })}
  </div>
);

/** Position (custom title), role family, responsibilities and, for teammates, the right to assign. */
const RoleModal: React.FC<{ p: ProjectDetail; target: PositionTarget | null; canGrant: boolean; onClose: () => void; onSaved: () => void }> = ({ p, target, canGrant, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [f, setF] = useState({ roleKey: "DEVELOPER" as RoleKey, roleTitle: "", responsibilities: "", isManager: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (target) setF({ roleKey: target.roleKey ?? "DEVELOPER", roleTitle: target.roleTitle ?? "", responsibilities: target.responsibilities ?? "", isManager: !!target.isManager });
    setError(null);
  }, [target]);
  const pickTitle = (t: string) => setF((x) => ({ ...x, roleTitle: t, roleKey: target?.owner ? x.roleKey : roleKeyFor(t, x.roleKey) }));
  const save = async () => {
    if (!target) return;
    if (f.roleTitle.trim().length > 60) return setError("At most 60 characters");
    setBusy(true);
    try {
      await sideProjectsApi.updateMember(
        p.id,
        target.id,
        target.owner
          ? { roleTitle: f.roleTitle.trim(), responsibilities: f.responsibilities.trim() }
          : { roleKey: f.roleKey, roleTitle: f.roleTitle.trim(), responsibilities: f.responsibilities.trim(), ...(canGrant ? { isManager: f.isManager } : {}) },
      );
      showToast(`${target.name.split(" ")[0]}'s position saved`, "success");
      onClose();
      onSaved();
    } catch (e) {
      const x = failure(e, "The position wasn't saved");
      setError(x.message);
      showToast(x.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <FormModal
      open={!!target}
      onClose={onClose}
      busy={busy}
      size="lg"
      icon={UserRound}
      title="Position on this project"
      subtitle={target?.name}
      footer={
        <>
          <button type="button" className={secondaryBtn} onClick={onClose} disabled={busy}>
            <Undo2 className="h-4 w-4" /> Cancel
          </button>
          <button type="button" className={primaryBtn} onClick={save} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Save
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Position" htmlFor="rm-title" counter={{ value: f.roleTitle, min: 0, max: 60 }} error={error} hint={target?.owner ? "Shown as Team lead when empty." : "Pick one or type your own, e.g. Hardware lead."}>
          <input id="rm-title" data-autofocus value={f.roleTitle} maxLength={60} onChange={(e) => pickTitle(e.target.value)} className={inputCls} placeholder={target?.owner ? "Project manager" : "Frontend developer"} />
          <PositionChips value={f.roleTitle} onPick={pickTitle} />
        </Field>
        {!target?.owner && (
          <Field label="Role family" hint="Groups people in insights; follows the position, change it if needed.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Role family">
              {ROLE_KEYS.map((k) => {
                const R = ROLE_META[k];
                const on = f.roleKey === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setF((x) => ({ ...x, roleKey: k }))}
                    className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-xs font-semibold transition ${on ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-gray-800/60 dark:text-gray-200 dark:hover:bg-gray-800"}`}
                  >
                    <R.icon className="h-4 w-4 shrink-0" aria-hidden /> {R.label}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
        <Field label="Responsibilities" htmlFor="rm-resp" optional counter={{ value: f.responsibilities, min: 0, max: 1000 }}>
          <TextArea id="rm-resp" rows={3} value={f.responsibilities} onChange={(e) => setF((x) => ({ ...x, responsibilities: e.target.value }))} placeholder="What they own: the sign-in flow, the database, user testing…" />
        </Field>
        {!target?.owner && canGrant && (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-gray-800/60">
            <input type="checkbox" checked={f.isManager} onChange={(e) => setF((x) => ({ ...x, isManager: e.target.checked }))} className="mt-0.5 h-4 w-4 rounded accent-blue-600" />
            <span>
              <span className="block text-sm font-semibold text-slate-800 dark:text-gray-100">Can plan and assign tasks</span>
              <span className="block text-xs text-slate-500 dark:text-gray-400">Edits the implementation plan, changes positions, assigns tasks to anyone and moves any task.</span>
            </span>
          </label>
        )}
      </div>
    </FormModal>
  );
};

/** The position under a name: the owner or a manager clicks to rename it in place (Enter saves). */
const InlinePosition: React.FC<{ p: ProjectDetail; target: PositionTarget; label: string; editable: boolean; onSaved: () => void }> = ({ p, target, label, editable, onSaved }) => {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(target.roleTitle ?? "");
  const [busy, setBusy] = useState(false);
  const listId = `pos-${target.id}`;
  const save = async () => {
    const t = v.trim().replace(/\s+/g, " ");
    if (t === (target.roleTitle ?? "")) return setEditing(false);
    if (t.length > 60) return showToast("A position has at most 60 characters", "error");
    setBusy(true);
    try {
      await sideProjectsApi.updateMember(p.id, target.id, target.owner ? { roleTitle: t } : { roleTitle: t, roleKey: roleKeyFor(t, target.roleKey) });
      showToast("Position updated", "success");
      setEditing(false);
      onSaved();
    } catch (e) {
      showToast(failure(e, "The position wasn't saved").message, "error");
    } finally {
      setBusy(false);
    }
  };
  if (editing)
    return (
      <span className="mt-1 flex items-center gap-1.5">
        <input
          autoFocus
          list={listId}
          value={v}
          maxLength={60}
          disabled={busy}
          aria-label={`Position of ${target.name}`}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.preventDefault(), save());
            if (e.key === "Escape") (e.stopPropagation(), setV(target.roleTitle ?? ""), setEditing(false));
          }}
          placeholder="e.g. Backend developer"
          className={`${inputCls} !min-h-[32px] !rounded-lg !px-2.5 !py-1 !text-[13px]`}
        />
        <datalist id={listId}>
          {POSITION_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button type="button" aria-label="Save position" onClick={save} disabled={busy} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
          {busy ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button type="button" aria-label="Cancel" onClick={() => (setV(target.roleTitle ?? ""), setEditing(false))} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-gray-800">
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  if (!editable) return <span className="mt-0.5 block truncate text-[13px] font-medium text-slate-600 dark:text-gray-300">{label}</span>;
  return (
    <button
      type="button"
      onClick={() => (setV(target.roleTitle ?? ""), setEditing(true))}
      title="Change the position"
      className="group/pos mt-0.5 inline-flex max-w-full items-center gap-1.5 rounded-md text-left text-[13px] font-medium text-slate-600 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-300 dark:hover:text-blue-300"
    >
      <span className="truncate">{target.roleTitle ? label : <span className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-300"><Plus className="h-3 w-3" aria-hidden />Add a position</span>}</span>
      <Pencil className="h-3 w-3 shrink-0 opacity-0 transition group-hover/pos:opacity-100 group-focus-visible/pos:opacity-100" aria-hidden />
    </button>
  );
};

const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: "bad" }> = ({ label, value, tone }) => (
  <div className="min-w-0 text-center">
    <p className={`text-sm font-bold tabular-nums ${tone === "bad" ? "text-red-700 dark:text-red-300" : "text-slate-900 dark:text-white"}`}>{value}</p>
    <p className="truncate text-[10px] font-medium text-slate-500 dark:text-gray-400">{label}</p>
  </div>
);

/**
 * The team: personal or team mode, each teammate's role, responsibilities and rights, and their
 * report (tasks, hours, on-time rate, progress reports).
 */
const TeamPanel: React.FC<{ p: ProjectDetail; meId: number; onChanged: () => void; onLeft: () => void }> = ({ p, meId, onChanged, onLeft }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [pick, setPick] = useState<{ id: number; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [role, setRole] = useState<PositionTarget | null>(null);
  const [invitePos, setInvitePos] = useState("");
  const [reports, setReports] = useState<MemberReport[] | null>(null);
  const isOwner = p.rights.owner || p.rights.manageAny;
  // Positions: the owner or a team manager; the right to assign stays with the owner.
  const canPosition = !!p.rights.manage;
  const ownerTarget: PositionTarget = { id: p.owner.id, name: p.owner.name, owner: true, roleKey: "LEAD", roleTitle: p.owner.roleTitle ?? null, responsibilities: p.owner.responsibilities ?? null, isManager: true };
  const targetOf = (m: Member): PositionTarget => ({ id: m.id, name: m.name, owner: false, roleKey: m.roleKey, roleTitle: m.roleTitle, responsibilities: m.responsibilities, isManager: m.isManager });
  const mode: TeamMode = p.teamMode ?? (p.members.length ? "TEAM" : "PERSONAL");

  useEffect(() => {
    let live = true;
    sideProjectsApi
      .delivery(p.id)
      .then((d) => live && setReports(d.members))
      .catch(() => live && setReports([]));
    return () => {
      live = false;
    };
  }, [p.id, p.members.length, p.lastActivityAt]);
  const reportOf = (id: number) => reports?.find((r) => r.id === id);

  const switchMode = async (m: TeamMode) => {
    if (m === mode) return;
    setBusy("mode");
    try {
      await sideProjectsApi.setTeamMode(p.id, m);
      showToast(m === "TEAM" ? "Now a team project. Invite your teammates" : "Now a personal project", "success");
      onChanged();
    } catch (e) {
      showToast(failure(e, "The mode wasn't changed").message, "error");
    } finally {
      setBusy(null);
    }
  };
  const invite = async () => {
    if (!pick) return setErr("Choose a person");
    setBusy("invite");
    setErr(null);
    try {
      const t = invitePos.trim();
      await sideProjectsApi.invite(p.id, { userId: pick.id, ...(t ? { roleTitle: t, roleKey: roleKeyFor(t, "DEVELOPER") } : {}) });
      setPick(null);
      setInvitePos("");
      showToast("Invitation sent", "success");
      onChanged();
    } catch (e) {
      setErr(failure(e).message);
      showToast(failure(e, "The invitation wasn't sent").message, "error");
    } finally {
      setBusy(null);
    }
  };
  const remove = async (m: Member) => {
    const self = m.id === meId;
    if (!(await confirm({ title: self ? "Leave this team?" : `Remove ${m.name}?`, tone: "danger", confirmText: self ? "Leave" : "Remove", message: "Their tasks stay; reassign them from the plan." }))) return;
    setBusy(`rm${m.id}`);
    try {
      await sideProjectsApi.removeMember(p.id, m.id);
      showToast(self ? "You left the team" : `${m.name} removed`, "success");
      if (self) onLeft();
      else onChanged();
    } catch (e) {
      showToast(failure(e, "That didn't work").message, "error");
    } finally {
      setBusy(null);
    }
  };

  // A render function, not a component: a component defined here would remount on every render
  // and drop the inline editor's state.
  const card = (c: { id: number; name: string; avatar?: string | null; sub: string; roleKey: RoleKey; roleTitle: string | null; responsibilities: string | null; manager: boolean; owner?: boolean; invited?: boolean; member?: Member }) => {
    const R = ROLE_META[c.roleKey] ?? ROLE_META.OTHER;
    const r = reportOf(c.id);
    const target = c.owner ? ownerTarget : targetOf(c.member!);
    const label = c.roleTitle || R.label;
    return (
      <li key={c.id} className={`${cardCls} p-4 ${c.invited ? "border-dashed" : ""}`}>
        <div className="flex items-start gap-3">
          <UserAvatar name={c.name} userId={c.id} src={c.avatar ?? undefined} size={40} decorative />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
              {c.name}
              {c.id === meId && <span className="ml-1 text-xs font-medium text-slate-500 dark:text-gray-400">(you)</span>}
            </p>
            <InlinePosition key={`${c.id}:${c.roleTitle ?? ""}`} p={p} target={target} label={label} editable={canPosition} onSaved={onChanged} />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-gray-800 dark:text-gray-200" title="Role family">
                <R.icon className="h-3 w-3" aria-hidden /> {R.label}
              </span>
              {c.owner && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">Owner</span>}
              {!c.owner && c.manager && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                  <ShieldCheck className="h-3 w-3" aria-hidden /> Can assign
                </span>
              )}
              {c.invited && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                  <Mail className="h-3 w-3" aria-hidden /> Invited
                </span>
              )}
              <span className="text-[11px] text-slate-500 dark:text-gray-400">{c.sub}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center">
            {canPosition && (
              <button type="button" aria-label={`Edit ${c.name}'s position and responsibilities`} title="Position & responsibilities" onClick={() => setRole(target)} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {c.member && (isOwner || c.id === meId) && (
              <button type="button" aria-label={c.id === meId ? "Leave the team" : `Remove ${c.name}`} onClick={() => remove(c.member!)} disabled={busy !== null} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-500/10 dark:hover:text-red-400">
                {busy === `rm${c.id}` ? <Spinner className="h-4 w-4" /> : <UserMinus className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
        {c.responsibilities && <p className="mt-3 line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-gray-300">{c.responsibilities}</p>}
        {!c.invited && (
          <div className="mt-3 rounded-2xl bg-slate-50 px-2 py-2.5 dark:bg-gray-800/60">
            {!reports ? (
              <Skeleton className="h-8" />
            ) : r ? (
              <>
                <div className="grid grid-cols-5 gap-1">
                  <Stat label="Open" value={r.todo + r.inProgress + r.inReview + r.blocked} />
                  <Stat label="Done" value={r.done} />
                  <Stat label="Overdue" value={r.overdue} tone={r.overdue ? "bad" : undefined} />
                  <Stat label="Hours" value={r.hoursLogged} />
                  <Stat label="On time" value={r.onTimeRate === null ? "–" : `${r.onTimeRate}%`} />
                </div>
                <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1">
                    <NotebookPen className="h-3 w-3" aria-hidden /> {r.reports} report{r.reports === 1 ? "" : "s"}
                    {r.lastReport ? ` · last ${fmtDay(r.lastReport)}` : ""}
                  </span>
                  {r.avgCycleDays !== null && (
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3 w-3" aria-hidden /> {r.avgCycleDays}d per task
                    </span>
                  )}
                </p>
              </>
            ) : (
              <p className="text-center text-[11px] text-slate-500 dark:text-gray-400">No tasks yet</p>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <section className={`${cardCls} flex flex-wrap items-center justify-between gap-3 p-4`}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
            {mode === "TEAM" ? <Users className="h-5 w-5" aria-hidden /> : <UserRound className="h-5 w-5" aria-hidden />}
          </span>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{mode === "TEAM" ? "Team project" : "Personal project"}</p>
            <p className="text-xs text-slate-500 dark:text-gray-400">{mode === "TEAM" ? `${p.members.filter((m) => m.status === "ACCEPTED").length + 1} people · roles and tasks shared` : "Only you work on it"}</p>
          </div>
        </div>
        {isOwner && (
          <div className="inline-flex rounded-full bg-slate-100 p-1 dark:bg-gray-800" role="radiogroup" aria-label="Project mode">
            {(["PERSONAL", "TEAM"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                disabled={busy !== null || (m === "PERSONAL" && p.members.length > 0)}
                title={m === "PERSONAL" && p.members.length > 0 ? "Remove the teammates first" : undefined}
                onClick={() => switchMode(m)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${mode === m ? "bg-white text-slate-900 dark:bg-gray-950 dark:text-white" : "text-slate-600 hover:text-slate-900 dark:text-gray-300 dark:hover:text-white"}`}
              >
                {busy === "mode" && mode !== m ? <Spinner className="h-3.5 w-3.5" /> : m === "TEAM" ? <Users className="h-3.5 w-3.5" aria-hidden /> : <UserRound className="h-3.5 w-3.5" aria-hidden />}
                {m === "TEAM" ? "Team" : "Personal"}
              </button>
            ))}
          </div>
        )}
      </section>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {card({ id: p.owner.id, name: p.owner.name, avatar: p.owner.avatar, sub: p.owner.regNumber ?? TYPE_LABEL[p.owner.type] ?? "", roleKey: "LEAD", roleTitle: p.owner.roleTitle ?? null, responsibilities: p.owner.responsibilities ?? null, manager: true, owner: true })}
        {p.members.map((m) =>
          card({ id: m.id, name: m.name, sub: m.regNumber ?? TYPE_LABEL[m.type] ?? "", roleKey: m.roleKey, roleTitle: m.roleTitle, responsibilities: m.responsibilities, manager: m.isManager, invited: m.status === "INVITED", member: m }),
        )}
      </ul>

      {isOwner && mode === "TEAM" && (
        <section className={`${cardCls} p-4`} aria-label="Invite a teammate">
          <p className="mb-2 text-sm font-bold text-slate-900 dark:text-white">Invite a teammate</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-[3]">
              <PersonPicker value={pick} onChange={setPick} search={sideProjectsApi.people} placeholder="Name, email or registration number" error={err} />
            </div>
            <div className="min-w-0 flex-[2]">
              <label htmlFor="invite-pos" className="sr-only">Position on this project</label>
              <input id="invite-pos" list="invite-pos-list" value={invitePos} maxLength={60} onChange={(e) => setInvitePos(e.target.value)} placeholder="Position, e.g. Backend developer" className={inputCls} />
              <datalist id="invite-pos-list">
                {POSITION_SUGGESTIONS.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </div>
            <button type="button" className={primaryBtn} onClick={invite} disabled={busy !== null || !pick}>
              {busy === "invite" ? <Spinner className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />} Invite
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500 dark:text-gray-400">Give them a position now or later; you can change it any time, also before they accept.</p>
        </section>
      )}

      <RoleModal p={p} target={role} canGrant={isOwner} onClose={() => setRole(null)} onSaved={onChanged} />
    </div>
  );
};

export default TeamPanel;
