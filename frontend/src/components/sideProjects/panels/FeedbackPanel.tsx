import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BadgeCheck, CornerDownLeft, MessageSquareWarning, MessagesSquare, SendHorizontal, Trash2 } from "lucide-react";
import { failure, sideProjectsApi, type ProjectDetail } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import UserAvatar from "../../ui/UserAvatar";
import { TYPE_LABEL } from "../fields";
import { ReviewBadge, Spinner, cardCls } from "../ui";

type Comment = ProjectDetail["comments"][number];
type Mode = "COMMENT" | "CHANGES_REQUESTED" | "VERIFIED";

const DAY = 86_400_000;
const dayKey = (iso: string) => new Date(iso).toDateString();
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
};
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

const QUICK_STAFF = ["Great progress, keep going.", "Please add screenshots of the working version.", "Add tests before the next milestone.", "Let's discuss this in class."];
const QUICK_TEAM = ["Thank you!", "Done, please check again.", "Could you explain a little more?"];

/**
 * Feedback as a conversation: my messages on the right, others on the left, grouped by day and
 * by author; review decisions (changes requested, verified) stand out as cards. Reviewers pick
 * what they are sending (comment / request changes / verify) above the composer.
 */
const FeedbackPanel: React.FC<{ p: ProjectDetail; meId: number; staff: boolean; onChanged: () => void }> = ({ p, meId, staff, onChanged }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("COMMENT");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const canReview = staff && p.rights.review;
  const canVerify = canReview && p.status === "COMPLETED" && p.reviewState !== "VERIFIED";
  const canWrite = canReview || p.rights.edit || staff;

  const comments = useMemo(() => [...p.comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [p.comments]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [comments.length]);
  useEffect(() => {
    // Grow the composer with its text (up to ~8 lines).
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const participants = useMemo(() => {
    const m = new Map<number, { id: number; name: string }>();
    comments.forEach((c) => m.set(c.authorId, { id: c.authorId, name: c.author }));
    return [...m.values()];
  }, [comments]);

  const send = async () => {
    setErr(null);
    const body = text.trim();
    if (mode === "CHANGES_REQUESTED" && body.length < 10) return setErr("Say what should change (10+ characters)");
    if (mode === "COMMENT" && body.length < 2) return setErr("Write a message");
    setBusy(true);
    try {
      if (canReview) await sideProjectsApi.review(p.id, mode, body || undefined);
      else await sideProjectsApi.comment(p.id, body);
      setText("");
      setMode("COMMENT");
      showToast(mode === "VERIFIED" ? "Project verified" : mode === "CHANGES_REQUESTED" ? "Changes requested" : "Message sent", "success");
      onChanged();
    } catch (e) {
      const f = failure(e, "The message wasn't sent");
      setErr(f.message);
      showToast(f.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (c: Comment) => {
    if (!(await confirm({ title: "Delete this message?", tone: "danger", confirmText: "Delete" }))) return;
    setRemoving(c.id);
    try {
      await sideProjectsApi.removeComment(p.id, c.id);
      showToast("Message deleted", "success");
      onChanged();
    } catch (e) {
      showToast(failure(e, "The message wasn't deleted").message, "error");
    } finally {
      setRemoving(null);
    }
  };

  const quick = canReview ? QUICK_STAFF : QUICK_TEAM;
  const modes: Array<{ key: Mode; label: string; icon: React.ElementType; show: boolean }> = [
    { key: "COMMENT", label: "Comment", icon: MessagesSquare, show: true },
    { key: "CHANGES_REQUESTED", label: "Request changes", icon: MessageSquareWarning, show: canReview },
    { key: "VERIFIED", label: "Verify completion", icon: BadgeCheck, show: canVerify },
  ];

  return (
    <section className={`${cardCls} flex flex-col overflow-hidden`} aria-label="Feedback">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-900/[0.05] px-4 py-3 sm:px-5 dark:border-white/[0.06]">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
            <MessagesSquare className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Conversation</p>
            <p className="text-xs text-slate-500 dark:text-gray-400">
              {comments.length} message{comments.length === 1 ? "" : "s"}
              {p.supervisor ? ` · supervised by ${p.supervisor.name}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ReviewBadge state={p.reviewState} />
          {participants.length > 0 && (
            <span className="flex -space-x-2" role="img" aria-label={`${participants.length} people in the conversation`}>
              {participants.slice(0, 5).map((u) => (
                <UserAvatar key={u.id} name={u.name} userId={u.id} size={26} decorative ring />
              ))}
            </span>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="max-h-[60vh] min-h-[14rem] overflow-y-auto px-3 py-4 sm:px-5" role="log" aria-live="polite" aria-label="Messages">
        {comments.length === 0 ? (
          <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-400">
              <MessagesSquare className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-slate-700 dark:text-gray-200">No feedback yet</p>
            <p className="max-w-xs text-xs text-slate-500 dark:text-gray-400">{canReview ? "Leave a comment, ask for changes or verify the result." : "Your supervisor's comments and reviews will appear here."}</p>
          </div>
        ) : (
          <ol className="space-y-1">
            {comments.map((c, i) => {
              const prev = comments[i - 1];
              const newDay = !prev || dayKey(prev.createdAt) !== dayKey(c.createdAt);
              const grouped = !newDay && prev && prev.authorId === c.authorId && prev.kind === "COMMENT" && c.kind === "COMMENT" && Date.parse(c.createdAt) - Date.parse(prev.createdAt) < 10 * 60_000;
              const mine = c.authorId === meId;
              const role = TYPE_LABEL[c.authorType] ?? c.authorType;
              return (
                <React.Fragment key={c.id}>
                  {newDay && (
                    <li className="flex justify-center py-2" aria-hidden>
                      <span className="rounded-full bg-slate-100 px-3 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-gray-800 dark:text-gray-300">{dayLabel(c.createdAt)}</span>
                    </li>
                  )}
                  {c.kind !== "COMMENT" ? (
                    <motion.li initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="py-2">
                      <div className={`mx-auto max-w-xl rounded-2xl px-4 py-3 ${c.kind === "VERIFIED" ? "bg-green-50 dark:bg-green-500/10" : "bg-amber-50 dark:bg-amber-500/10"}`}>
                        <p className={`flex items-center gap-2 text-sm font-bold ${c.kind === "VERIFIED" ? "text-green-800 dark:text-green-200" : "text-amber-900 dark:text-amber-100"}`}>
                          {c.kind === "VERIFIED" ? <BadgeCheck className="h-4 w-4" aria-hidden /> : <MessageSquareWarning className="h-4 w-4" aria-hidden />}
                          {c.kind === "VERIFIED" ? "Completion verified" : "Changes requested"}
                          <span className="ml-auto text-[11px] font-medium opacity-80">{time(c.createdAt)}</span>
                        </p>
                        {c.body && <p className={`mt-1.5 whitespace-pre-line text-sm leading-relaxed ${c.kind === "VERIFIED" ? "text-green-900 dark:text-green-100" : "text-amber-900 dark:text-amber-100"}`}>{c.body}</p>}
                        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-gray-300">
                          <UserAvatar name={c.author} userId={c.authorId} size={16} decorative /> {c.author} · {role}
                        </p>
                      </div>
                    </motion.li>
                  ) : (
                    <motion.li initial={{ opacity: 0, y: 6 }} animate={{ opacity: removing === c.id ? 0.5 : 1, y: 0 }} className={`group flex items-end gap-2 ${mine ? "flex-row-reverse" : ""} ${grouped ? "pt-0.5" : "pt-3"}`}>
                      <span className="w-8 shrink-0">{!grouped && <UserAvatar name={c.author} userId={c.authorId} size={32} decorative />}</span>
                      <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
                        {!grouped && (
                          <p className={`mb-1 flex items-center gap-1.5 px-1 text-[11px] ${mine ? "flex-row-reverse" : ""}`}>
                            <span className="font-semibold text-slate-700 dark:text-gray-200">{mine ? "You" : c.author}</span>
                            <span className="rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-semibold text-slate-600 dark:bg-gray-800 dark:text-gray-300">{role}</span>
                          </p>
                        )}
                        <div className={`flex items-end gap-1.5 ${mine ? "flex-row-reverse" : ""}`}>
                          <div className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${mine ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md bg-slate-100 text-slate-800 dark:bg-gray-800 dark:text-gray-100"}`}>
                            <p className="whitespace-pre-line break-words">{c.body}</p>
                          </div>
                          <span className="flex shrink-0 items-center gap-1 pb-1">
                            <span className="text-[10px] tabular-nums text-slate-500 dark:text-gray-400" title={new Date(c.createdAt).toLocaleString()}>
                              {time(c.createdAt)}
                            </span>
                            {mine && (
                              <button type="button" aria-label="Delete message" onClick={() => remove(c)} disabled={removing !== null} className="rounded-full p-1 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:text-gray-500 dark:hover:bg-red-500/10 dark:hover:text-red-400">
                                {removing === c.id ? <Spinner className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
                              </button>
                            )}
                          </span>
                        </div>
                      </div>
                    </motion.li>
                  )}
                </React.Fragment>
              );
            })}
          </ol>
        )}
        <div ref={end} />
      </div>

      {/* Composer */}
      {canWrite && (
        <div className="border-t border-slate-900/[0.05] bg-slate-50/60 p-3 sm:p-4 dark:border-white/[0.06] dark:bg-gray-900/40">
          {modes.filter((m) => m.show).length > 1 && (
            <div className="mb-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="What you are sending">
              {modes
                .filter((m) => m.show)
                .map((m) => {
                  const on = mode === m.key;
                  const tone = m.key === "CHANGES_REQUESTED" ? "bg-amber-500 text-white" : m.key === "VERIFIED" ? "bg-green-600 text-white" : "bg-blue-600 text-white";
                  return (
                    <button key={m.key} type="button" role="radio" aria-checked={on} onClick={() => (setMode(m.key), setErr(null), area.current?.focus())} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${on ? tone : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"}`}>
                      <m.icon className="h-3.5 w-3.5" aria-hidden /> {m.label}
                    </button>
                  );
                })}
            </div>
          )}
          <AnimatePresence initial={false}>
            {!text && mode === "COMMENT" && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-2 flex flex-wrap gap-1.5 overflow-hidden">
                {quick.map((qr) => (
                  <button key={qr} type="button" onClick={() => (setText(qr), area.current?.focus())} className="rounded-full border border-slate-900/[0.07] bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-white/10 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-blue-500/50 dark:hover:text-blue-300">
                    {qr}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          <div className={`flex items-end gap-2 rounded-2xl border bg-white p-1.5 pl-3.5 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/15 dark:bg-gray-900 ${err ? "border-red-400" : "border-slate-900/[0.07] dark:border-white/10"}`}>
            <textarea
              ref={area}
              rows={1}
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (!busy) send();
                }
              }}
              aria-label="Message"
              placeholder={mode === "CHANGES_REQUESTED" ? "What should change?" : mode === "VERIFIED" ? "Add a note (optional)" : "Write a message…"}
              className="max-h-[200px] min-h-[36px] flex-1 resize-none bg-transparent py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
            <button
              type="button"
              onClick={send}
              disabled={busy || (mode !== "VERIFIED" && !text.trim())}
              aria-label={mode === "VERIFIED" ? "Verify completion" : mode === "CHANGES_REQUESTED" ? "Request changes" : "Send"}
              className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40 ${mode === "CHANGES_REQUESTED" ? "bg-amber-500 hover:bg-amber-600" : mode === "VERIFIED" ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}`}
            >
              {busy ? <Spinner className="h-4 w-4" /> : mode === "VERIFIED" ? <BadgeCheck className="h-4 w-4" /> : mode === "CHANGES_REQUESTED" ? <MessageSquareWarning className="h-4 w-4" /> : <SendHorizontal className="h-4 w-4" />}
              <span className="hidden sm:inline">{mode === "VERIFIED" ? "Verify" : mode === "CHANGES_REQUESTED" ? "Request" : "Send"}</span>
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-slate-500 dark:text-gray-400">
            {err ? (
              <span role="alert" className="font-medium text-red-600 dark:text-red-400">
                {err}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <CornerDownLeft className="h-3 w-3" aria-hidden /> Enter to send · Shift + Enter for a new line
              </span>
            )}
            {text.length > 1500 && <span className="tabular-nums">{2000 - text.length} left</span>}
          </div>
        </div>
      )}
    </section>
  );
};

export default FeedbackPanel;
