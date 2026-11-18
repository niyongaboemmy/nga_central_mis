import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Archive, ArchiveRestore, BadgeCheck, CheckCircle2, FilePlus2, Images, MessageSquareWarning, PlusCircle, Send, ShieldCheck, Target, UserCheck, UserMinus, UserPlus, Users, Wrench, X, Bell, ArrowRightLeft, Trash2, Mail, Check, GanttChartSquare,
} from "lucide-react";
import { failure, sideProjectsApi, type ProjectDetail, type Status } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import UserAvatar from "../../ui/UserAvatar";
import { CharMeter, PersonPicker, TYPE_LABEL } from "../fields";
import { DOC_META, FieldError, inputCls, inputErrCls, primaryBtn, secondaryBtn, Spinner, STATUS_META, statusColor, timeAgo, useIsDark, cardCls } from "../ui";

const EVENT_ICON: Record<string, { icon: React.ElementType; color: string }> = {
  CREATED: { icon: PlusCircle, color: "#3b6cff" },
  CREATED_FOR: { icon: PlusCircle, color: "#3b6cff" },
  STATUS: { icon: ArrowRightLeft, color: "#2a78d6" },
  CORRECTION: { icon: Wrench, color: "#ec835a" },
  DOC: { icon: FilePlus2, color: "#1baf7a" },
  MEDIA: { icon: Images, color: "#2563eb" },
  MEDIA_REMOVED: { icon: Trash2, color: "#94a3b8" },
  MILESTONE: { icon: Target, color: "#0ca30c" },
  REVIEW: { icon: ShieldCheck, color: "#2563eb" },
  SUPERVISOR: { icon: UserCheck, color: "#2563eb" },
  PLAN: { icon: GanttChartSquare, color: "#2a78d6" },
  ARCHIVE: { icon: Archive, color: "#94a3b8" },
  RESTORE: { icon: ArchiveRestore, color: "#3b6cff" },
  MEMBER_INVITED: { icon: Mail, color: "#3b6cff" },
  MEMBER_JOINED: { icon: UserPlus, color: "#1baf7a" },
  MEMBER_LEFT: { icon: UserMinus, color: "#94a3b8" },
  MEMBER_REMOVED: { icon: UserMinus, color: "#94a3b8" },
  MEMBER_DECLINED: { icon: X, color: "#94a3b8" },
  NUDGE_STALE: { icon: Bell, color: "#fab219" },
  NUDGE_CONCEPT: { icon: Bell, color: "#d03b3b" },
  NUDGE_STAGE: { icon: Bell, color: "#d03b3b" },
};

const shortDate = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

const describe = (e: ProjectDetail["events"][number]) => {
  switch (e.type) {
    case "STATUS":
    case "CORRECTION":
      return `${STATUS_META[(e.fromValue as Status) ?? "IDEA"]?.label ?? e.fromValue} → ${STATUS_META[(e.toValue as Status) ?? "IDEA"]?.label ?? e.toValue}`;
    case "DOC":
      return `${DOC_META[e.fromValue as keyof typeof DOC_META]?.label ?? e.fromValue} v${e.toValue}`;
    case "MEDIA":
      return `+${e.toValue}`;
    case "REVIEW":
      return e.toValue === "VERIFIED" ? "Verified" : e.toValue === "CHANGES_REQUESTED" ? "Changes requested" : "Answered";
    case "MILESTONE":
      return e.note ?? "";
    case "PLAN": {
      const [a, b] = String(e.toValue ?? "").split("..");
      return a && b ? `Plan ${shortDate(a)} – ${shortDate(b)}` : "Plan updated";
    }
    case "NUDGE_STAGE":
      return e.toValue ? `${STATUS_META[e.toValue as Status]?.label ?? e.toValue} past its plan` : "Stage past its plan";
    default:
      return "";
  }
};

export const TimelinePanel: React.FC<{ p: ProjectDetail }> = ({ p }) => {
  const dark = useIsDark();
  return (
    <ol className="relative space-y-1 pl-2">
      {p.events.map((e, i) => {
        const m = EVENT_ICON[e.type] ?? { icon: CheckCircle2, color: "#94a3b8" };
        const color = e.type === "STATUS" && e.toValue ? statusColor(e.toValue as Status, dark) : m.color;
        return (
          <motion.li key={e.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 15) * 0.02 }} className="relative flex gap-3 pb-3">
            {i < p.events.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5 bg-slate-200 dark:bg-gray-700/50" aria-hidden />}
            <span className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white " style={{ backgroundColor: color }}>
              <m.icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">
                {describe(e) || e.type.replace(/_/g, " ").toLowerCase()}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-gray-400">{e.actor || "System"} · {timeAgo(e.createdAt)}</p>
              {e.note && e.type !== "MILESTONE" && e.type !== "DOC" && <p className="mt-1 rounded-lg bg-slate-50 px-2 py-1 text-xs italic text-slate-600 dark:bg-gray-700/40 dark:text-gray-300">{e.note}</p>}
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
};

/** Feedback thread. Reviewers (staff mode) get the review actions; the team replies. */
export const FeedbackPanel: React.FC<{ p: ProjectDetail; staff: boolean; onChanged: () => void }> = ({ p, staff, onChanged }) => {
  const { showToast } = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const canReview = staff && p.rights.review;
  const send = async (kind: "COMMENT" | "CHANGES_REQUESTED" | "VERIFIED") => {
    setErr(null);
    if (kind === "CHANGES_REQUESTED" && text.trim().length < 10) return setErr("Say what should change (10+ characters)");
    if (kind === "COMMENT" && text.trim().length < 2) return setErr("Write a comment");
    setBusy(kind);
    try {
      if (canReview) await sideProjectsApi.review(p.id, kind, text.trim() || undefined);
      else await sideProjectsApi.comment(p.id, text.trim());
      setText("");
      showToast(kind === "VERIFIED" ? "Verified" : kind === "CHANGES_REQUESTED" ? "Changes requested" : "Sent", "success");
      onChanged();
    } catch (e) {
      setErr(failure(e).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {p.comments.map((c) => {
          const mine = c.authorType === "STUDENT";
          return (
            <motion.li key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              <UserAvatar name={c.author} userId={c.authorId} size={30} decorative />
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${c.kind === "CHANGES_REQUESTED" ? "bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30" : c.kind === "VERIFIED" ? "bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/30" : mine ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-gray-700/50"}`}>
                <p className={`mb-0.5 flex items-center gap-1 text-[11px] font-semibold ${mine && c.kind === "COMMENT" ? "text-white/80" : "text-slate-600 dark:text-gray-300"}`}>
                  {c.kind === "CHANGES_REQUESTED" && <MessageSquareWarning className="h-3.5 w-3.5 text-amber-600" />}
                  {c.kind === "VERIFIED" && <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />}
                  {c.author} · {timeAgo(c.createdAt)}
                </p>
                <p className={`whitespace-pre-line text-sm ${mine && c.kind === "COMMENT" ? "text-white" : "text-slate-800 dark:text-gray-100"}`}>{c.body}</p>
              </div>
            </motion.li>
          );
        })}
      </ul>
      <div className={`${cardCls} p-3`}>
        <div className="flex items-center justify-end"><CharMeter value={text} min={canReview ? 2 : 2} max={2000} /></div>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="Feedback" className={`${inputCls} ${err ? inputErrCls : ""}`} />
        <FieldError message={err} />
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          {canReview && (
            <>
              <button type="button" className={`${secondaryBtn} !border-amber-300 !text-amber-800 dark:!border-amber-500/50 dark:!text-amber-200`} disabled={!!busy} onClick={() => send("CHANGES_REQUESTED")}>
                {busy === "CHANGES_REQUESTED" ? <Spinner className="h-4 w-4" /> : <MessageSquareWarning className="h-4 w-4" />} Request changes
              </button>
              {p.status === "COMPLETED" && p.reviewState !== "VERIFIED" && (
                <button type="button" className={`${primaryBtn} !bg-emerald-600 hover:!bg-emerald-700`} disabled={!!busy} onClick={() => send("VERIFIED")}>
                  {busy === "VERIFIED" ? <Spinner className="h-4 w-4" /> : <BadgeCheck className="h-4 w-4" />} Verify
                </button>
              )}
            </>
          )}
          <button type="button" className={primaryBtn} disabled={!!busy} onClick={() => send("COMMENT")}>
            {busy === "COMMENT" ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />} Send
          </button>
        </div>
      </div>
    </div>
  );
};

export const TeamPanel: React.FC<{ p: ProjectDetail; meId: number; onChanged: () => void; onLeft: () => void }> = ({ p, meId, onChanged, onLeft }) => {
  const { showToast } = useToast();
  const [pick, setPick] = useState<{ id: number; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invite = async () => {
    if (!pick) return setErr("Choose a person");
    setBusy(true);
    setErr(null);
    try {
      await sideProjectsApi.invite(p.id, { userId: pick.id });
      setPick(null);
      showToast("Invitation sent", "success");
      onChanged();
    } catch (e) {
      setErr(failure(e).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <ul className="grid gap-2 sm:grid-cols-2">
        <li className={`${cardCls} flex items-center gap-3 p-3`}>
          <UserAvatar name={p.owner.name} userId={p.owner.id} src={p.owner.avatar} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-800 dark:text-white">{p.owner.name}</p>
            <p className="font-mono text-[11px] text-slate-500 dark:text-gray-400">{p.owner.regNumber ?? TYPE_LABEL[p.owner.type] ?? ""}</p>
          </div>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-500/20 dark:text-amber-100">Owner</span>
        </li>
        {p.members.map((m) => (
          <li key={m.id} className={`${cardCls} flex items-center gap-3 p-3 ${m.status === "INVITED" ? "border-dashed opacity-75" : ""}`}>
            <UserAvatar name={m.name} userId={m.id} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-800 dark:text-white">{m.name}</p>
              <p className="font-mono text-[11px] text-slate-500 dark:text-gray-400">{m.regNumber ?? TYPE_LABEL[m.type] ?? ""}</p>
            </div>
            {m.status === "INVITED" ? <Mail className="h-4 w-4 text-blue-500" aria-label="Invited" /> : <Users className="h-4 w-4 text-emerald-500" aria-label="Member" />}
            {(p.rights.owner || m.id === meId) && (
              <button type="button" aria-label={m.id === meId ? "Leave the team" : `Remove ${m.name}`} className="rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10" onClick={async () => {
                await sideProjectsApi.removeMember(p.id, m.id).catch((e) => showToast(failure(e).message, "error"));
                if (m.id === meId) onLeft();
                else onChanged();
              }}>
                <UserMinus className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {p.rights.owner && (
        <div className={`${cardCls} flex flex-col gap-2 p-3 sm:flex-row sm:items-start`}>
          <div className="flex-1"><PersonPicker value={pick} onChange={setPick} search={sideProjectsApi.people} placeholder="Name, email or registration number" error={err} /></div>
          <button type="button" className={primaryBtn} onClick={invite} disabled={busy || !pick}>{busy ? <Spinner className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />} Invite</button>
        </div>
      )}
    </div>
  );
};

export const InviteBanner: React.FC<{ p: ProjectDetail; onDone: (accepted: boolean) => void }> = ({ p, onDone }) => {
  const [busy, setBusy] = useState<boolean | null>(null);
  const respond = async (accept: boolean) => {
    setBusy(accept);
    try {
      await sideProjectsApi.respondInvite(p.id, accept);
      onDone(accept);
    } finally {
      setBusy(null);
    }
  };
  return (
    <motion.div initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-blue-700 to-blue-600 p-3 text-white ">
      <UserAvatar name={p.owner.name} userId={p.owner.id} size={36} ring />
      <Mail className="h-5 w-5" aria-hidden />
      <span className="flex-1 text-sm font-semibold">{p.owner.name}</span>
      <button type="button" aria-label="Decline the invitation" className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25" onClick={() => respond(false)} disabled={busy !== null}>{busy === false ? <Spinner className="h-4 w-4" /> : <X className="h-4 w-4" />}</button>
      <button type="button" className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-blue-700 hover:bg-blue-50" onClick={() => respond(true)} disabled={busy !== null}>{busy === true ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Join</button>
    </motion.div>
  );
};
