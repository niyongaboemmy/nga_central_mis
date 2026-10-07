import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleSlash,
  ExternalLink,
  GraduationCap,
  Loader2,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { builderRoutes, elearningApi, type NoteElearning, type NoteElearningWeek } from "../../../api/elearning";
import { lessonNotesApi, type NoteReachFix } from "../../../api/lessonNotes";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import { formatOpensAt, shortWeek } from "./NoteReachChip";

interface Props {
  noteId: number | null;
  onClose: () => void;
  /** Called after any change, with the fresh state, so the page can update its row/badge. */
  onChanged?: (data: NoteElearning) => void;
  /** The editor publishes through its own save (so unsaved edits go with it). */
  onPublishNote?: () => Promise<void>;
}

const errMessage = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

const fmtRange = (w: NoteElearningWeek) => {
  if (!w.start_date) return null;
  const f = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return w.end_date && w.end_date !== w.start_date ? `${f(w.start_date)} – ${f(w.end_date)}` : f(w.start_date);
};

const WeekStatus: React.FC<{ w: NoteElearningWeek }> = ({ w }) => {
  const opensLater = w.status === "SCHEDULED" && w.unlock_at && new Date(w.unlock_at) > new Date();
  if (w.status === "PUBLISHED" || (w.status === "SCHEDULED" && !opensLater)) {
    return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">Open</span>;
  }
  if (opensLater) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300">
        <CalendarClock className="w-2.5 h-2.5" /> {formatOpensAt(w.unlock_at!)}
      </span>
    );
  }
  return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400">Hidden</span>;
};

const HERO = {
  LIVE: {
    tone: "from-emerald-500/15 to-emerald-500/5 border-emerald-200 dark:border-emerald-400/25",
    icon: <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />,
    title: "Students can read this note",
  },
  SCHEDULED: {
    tone: "from-blue-500/15 to-blue-500/5 border-blue-200 dark:border-blue-400/25",
    icon: <CalendarClock className="w-6 h-6 text-blue-600 dark:text-blue-400" />,
    title: "Scheduled",
  },
  BLOCKED: {
    tone: "from-amber-500/15 to-amber-500/5 border-amber-200 dark:border-amber-400/25",
    icon: <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />,
    title: "Not reaching students yet",
  },
  OFF_COURSE: {
    tone: "from-slate-500/10 to-slate-500/5 border-gray-200 dark:border-white/10",
    icon: <GraduationCap className="w-6 h-6 text-gray-500" />,
    title: "Not on e-learning",
  },
} as const;

const FIX_LABEL: Record<NoteReachFix, string> = {
  publish_note: "Publish note",
  place: "Add to suggested week",
  show_item: "Show to students",
  publish_week: "Publish week",
  publish_course: "Publish course",
};

/**
 * A note's e-learning, from the note's side: is it reaching students (and if not, the
 * one-click fix for each thing in the way), which week it's in (with the best week
 * suggested), how many students have read it, and move / remove.
 */
const NoteElearningPanel: React.FC<Props> = ({ noteId, onClose, onChanged, onPublishNote }) => {
  const { showToast } = useToast();
  const askConfirm = useConfirm();
  const [data, setData] = useState<NoteElearning | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const weeksRef = useRef<HTMLDivElement>(null);
  const open = noteId !== null;

  const apply = useCallback(
    (next: NoteElearning) => {
      setData(next);
      onChanged?.(next);
    },
    [onChanged],
  );

  const reload = useCallback(async () => {
    if (noteId === null) return;
    const res = await elearningApi.noteElearning(noteId);
    apply(res.data.data);
  }, [noteId, apply]);

  useEffect(() => {
    if (noteId === null) {
      setData(null);
      return;
    }
    setLoading(true);
    setFailed("");
    elearningApi
      .noteElearning(noteId)
      .then((res) => setData(res.data.data))
      .catch((e) => setFailed(errMessage(e, "Couldn't load this note's e-learning")))
      .finally(() => setLoading(false));
  }, [noteId]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => closeRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const placeIn = (w: NoteElearningWeek) =>
    run(`week-${w.section_id}`, async () => {
      if (!data || noteId === null) return;
      if (data.placement?.section_id === w.section_id) return;
      try {
        const res = await elearningApi.setNotePlacement(noteId, w.section_id);
        apply(res.data.data);
        showToast(res.data.message || `Placed in ${shortWeek(w.title)}`, "success");
      } catch (e) {
        showToast(errMessage(e, "Couldn't place the note"), "error");
      }
    });

  const fix = (f: NoteReachFix) =>
    run(f, async () => {
      if (!data || noteId === null) return;
      try {
        if (f === "publish_note") {
          if (onPublishNote) await onPublishNote();
          else await lessonNotesApi.update(noteId, { status: "PUBLISHED" });
        } else if (f === "place") {
          const suggested = data.sections.find((s) => s.suggested);
          if (!suggested) {
            weeksRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
          }
          const res = await elearningApi.setNotePlacement(noteId, suggested.section_id);
          apply(res.data.data);
          showToast(res.data.message || "Placed", "success");
          return;
        } else if (f === "show_item" && data.placement) {
          await elearningApi.updateItem(data.placement.item_id, { is_published: true });
        } else if (f === "publish_week" && data.placement) {
          const ok = await askConfirm({
            title: `Publish ${shortWeek(data.placement.section_title)}?`,
            message: "Everything visible in this week opens to the class, and students are notified.",
            confirmText: "Publish week",
          });
          if (!ok) return;
          await elearningApi.updateSection(data.placement.section_id, { status: "PUBLISHED" });
        } else if (f === "publish_course" && data.course) {
          const ok = await askConfirm({
            title: "Publish the course?",
            message: `Students in this class can open "${data.course.title}" and every week that is already open.`,
            confirmText: "Publish course",
          });
          if (!ok) return;
          await elearningApi.updateCourse(data.course.course_id, { status: "PUBLISHED" });
        }
        await reload();
      } catch (e) {
        // The editor already explained an empty-note publish.
        if (e instanceof Error && e.message === "empty") return;
        showToast(errMessage(e, "That didn't work — try again"), "error");
      }
    });

  const remove = () =>
    run("remove", async () => {
      if (!data?.placement || noteId === null) return;
      const ok = await askConfirm({
        title: "Take this note off the course?",
        message: `It leaves ${shortWeek(data.placement.section_title)} and students' progress on it is cleared. The note itself is kept.`,
        confirmText: "Remove from course",
        tone: "danger",
      });
      if (!ok) return;
      try {
        const res = await elearningApi.removeNotePlacement(noteId);
        apply(res.data.data);
        showToast("Removed from the course", "success");
      } catch (e) {
        showToast(errMessage(e, "Couldn't remove it"), "error");
      }
    });

  const hero = data ? HERO[data.reach.state] : null;
  const students = data?.students;
  const pct = students && students.members > 0 ? Math.round((students.completed / students.members) * 100) : 0;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex justify-end" role="presentation">
          <motion.div
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Note on e-learning"
            data-testid="note-elearning-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            className="relative h-full w-full sm:max-w-md bg-white dark:bg-gray-950 border-l border-gray-200 dark:border-white/10 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-gray-100 dark:border-white/10">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-400/10 text-blue-600 dark:text-blue-300 flex items-center justify-center flex-shrink-0">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">On e-learning</p>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100 leading-snug line-clamp-2">
                  {data?.note.title || "…"}
                </h2>
                {data?.course && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                    {data.course.title}
                    {data.course.status !== "PUBLISHED" && (
                      <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/[0.08]">
                        {data.course.status === "DRAFT" ? "Course draft" : "Archived"}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <button
                ref={closeRef}
                onClick={onClose}
                aria-label="Close"
                className="p-2 -mr-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-white/10 dark:hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-6">
              {loading && !data && (
                <div className="space-y-3" aria-busy="true">
                  <div className="h-40 rounded-2xl bg-gray-100 dark:bg-white/[0.05] animate-pulse" />
                  <div className="h-16 rounded-2xl bg-gray-100 dark:bg-white/[0.05] animate-pulse" />
                  <div className="h-56 rounded-2xl bg-gray-100 dark:bg-white/[0.05] animate-pulse" />
                </div>
              )}
              {failed && !data && <p className="text-sm text-red-600 dark:text-red-400">{failed}</p>}

              {data && hero && (
                <>
                  {/* Reach: the answer, then each link in the chain with its fix */}
                  <section className={`rounded-2xl border bg-gradient-to-br ${hero.tone} p-4`} data-testid="reach-hero">
                    <div className="flex items-center gap-3">
                      {hero.icon}
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">
                          {data.reach.state === "SCHEDULED" && data.reach.opens_at
                            ? `Opens to students ${formatOpensAt(data.reach.opens_at)}`
                            : hero.title}
                        </p>
                        {data.placement && (
                          <p className="text-xs text-gray-600 dark:text-gray-300 truncate">{data.placement.section_title}</p>
                        )}
                      </div>
                    </div>
                    <ol className="mt-4 space-y-2.5">
                      {data.reach.steps.map((s) => (
                        <li key={s.key} className="flex items-start gap-2.5">
                          <span
                            className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                              s.ok
                                ? "bg-emerald-500 text-white"
                                : "border-2 border-dashed border-amber-400 dark:border-amber-500/70"
                            }`}
                          >
                            {s.ok && (
                              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                                <Check className="w-3 h-3" strokeWidth={3} />
                              </motion.span>
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm ${s.ok ? "text-gray-600 dark:text-gray-300" : "font-medium text-gray-900 dark:text-gray-100"}`}>
                              {s.label}
                            </p>
                            {!s.ok && s.detail && <p className="text-xs text-gray-500 dark:text-gray-400">{s.detail}</p>}
                          </div>
                          {!s.ok && s.fix && (
                            <button
                              onClick={() => fix(s.fix!)}
                              disabled={!!busy}
                              className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-900 text-white dark:bg-white dark:text-gray-900 hover:opacity-90 disabled:opacity-50 transition"
                            >
                              {busy === s.fix ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                              {FIX_LABEL[s.fix]}
                            </button>
                          )}
                        </li>
                      ))}
                    </ol>
                  </section>

                  {/* Readers */}
                  {students && (
                    <section className="rounded-2xl border border-gray-200 dark:border-white/10 p-4" data-testid="note-readers">
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                          <Users className="w-4 h-4 text-gray-400" /> Students
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                          {students.members === 0
                            ? "No students enrolled yet"
                            : `${students.completed} of ${students.members} finished · ${students.started} started`}
                        </p>
                      </div>
                      {students.members > 0 && (
                        <div className="mt-3 h-2 rounded-full bg-gray-100 dark:bg-white/[0.08] overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-emerald-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                          />
                        </div>
                      )}
                    </section>
                  )}

                  {/* Weeks */}
                  {data.course ? (
                    <section ref={weeksRef} aria-labelledby="note-weeks-title">
                      <div className="flex items-baseline justify-between mb-2">
                        <h3 id="note-weeks-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {data.placement ? "Move to another week" : "Choose the week"}
                        </h3>
                        <span className="text-[11px] text-gray-400">{data.sections.length} weeks</span>
                      </div>
                      {data.sections.length === 0 ? (
                        <p className="text-sm text-gray-500">This course has no weeks yet — add one in the course builder.</p>
                      ) : (
                        <ul className="space-y-2" role="radiogroup" aria-label="Course weeks">
                          {data.sections.map((w) => {
                            const here = data.placement?.section_id === w.section_id;
                            const range = fmtRange(w);
                            return (
                              <li key={w.section_id}>
                                <button
                                  role="radio"
                                  aria-checked={here}
                                  onClick={() => placeIn(w)}
                                  disabled={!!busy}
                                  className={`w-full text-left rounded-xl border p-3 transition-all disabled:cursor-wait ${
                                    here
                                      ? "border-emerald-400 bg-emerald-50/60 dark:bg-emerald-400/10 dark:border-emerald-400/40"
                                      : w.suggested
                                        ? "border-blue-300 bg-blue-50/50 dark:bg-blue-400/10 dark:border-blue-400/40 hover:border-blue-400"
                                        : "border-gray-200 dark:border-white/10 hover:border-blue-300 hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                                  }`}
                                >
                                  <div className="flex items-start gap-2.5">
                                    <span
                                      className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                        here ? "border-emerald-500 bg-emerald-500" : "border-gray-300 dark:border-gray-600"
                                      }`}
                                    >
                                      {here && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{w.title}</p>
                                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                                        <WeekStatus w={w} />
                                        {range && <span>{range}</span>}
                                        <span>· {w.item_count} item{w.item_count === 1 ? "" : "s"}</span>
                                        {w.is_current && (
                                          <span className="font-semibold text-violet-600 dark:text-violet-300">· This week</span>
                                        )}
                                      </div>
                                      {w.suggested && !here && (
                                        <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                                          <Sparkles className="w-3 h-3" /> Suggested{w.reason ? ` — ${w.reason.toLowerCase()}` : ""}
                                        </p>
                                      )}
                                    </div>
                                    {busy === `week-${w.section_id}` ? (
                                      <Loader2 className="w-4 h-4 animate-spin text-blue-500 flex-shrink-0" />
                                    ) : here ? (
                                      <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                                        Here
                                      </span>
                                    ) : null}
                                  </div>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  ) : (
                    <section className="rounded-2xl border border-dashed border-gray-300 dark:border-white/15 p-5 text-center">
                      <CircleSlash className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600" />
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{data.no_course_reason}</p>
                      <Link
                        to={builderRoutes.list}
                        className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold bg-blue-600 text-white hover:bg-blue-500"
                      >
                        Set up the course <ArrowRight className="w-4 h-4" />
                      </Link>
                    </section>
                  )}
                </>
              )}
            </div>

            {data?.course && (
              <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-100 dark:border-white/10">
                <Link
                  to={builderRoutes.build(data.course.course_id)}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-300 hover:underline"
                >
                  Open course builder <ExternalLink className="w-3.5 h-3.5" />
                </Link>
                {data.placement && (
                  <button
                    onClick={remove}
                    disabled={!!busy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-400/10 disabled:opacity-50"
                  >
                    {busy === "remove" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Remove from course
                  </button>
                )}
              </div>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default NoteElearningPanel;
