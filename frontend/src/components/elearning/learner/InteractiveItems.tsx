import React, { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Check, CheckCircle2, Frown, Meh, RotateCcw, Smile, Ticket, Undo2, X } from "lucide-react";
import { apiService, API_BASE_URL } from "../../../services/api";
import { getToken } from "../../../utils/auth";
import { useMotion } from "../../../design/motion";
import { sendOrQueue } from "./offline";
import { GRADE_LABEL, Grade, previewIntervals, review, sessionQueue } from "./flashcardModel";
import RichHtml from "../../codeWindow/RichHtml";

/**
 * Learner views for exit tickets, flashcards and practical tasks (LESSON_STUDIO plan §11).
 * Phone first: one thing per screen, 44 px targets, everything reachable by keyboard.
 */

// ---------------------------------------------------------------- exit ticket

const CONFIDENCE: { v: 1 | 2 | 3; label: string; icon: React.ElementType }[] = [
  { v: 1, label: "Not sure", icon: Frown },
  { v: 2, label: "Fairly sure", icon: Meh },
  { v: 3, label: "Very sure", icon: Smile },
];

export const ExitTicketCard: React.FC<{ itemId: number; content: any; onDone?: () => void }> = ({ itemId, content, onDone }) => {
  const m = useMotion();
  const questions: any[] = content?.questions || [];
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [confidence, setConfidence] = useState<1 | 2 | 3 | null>(null);
  const [result, setResult] = useState<any>(content?.submitted ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = questions.every((q) => answers[q.id] !== undefined) && (content?.ask_confidence === false || confidence !== null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await apiService.post<any>(`/elearning/my/items/${itemId}/exit-ticket`, { answers, confidence: confidence ?? 2 });
      setResult({ ...r.data.data, answers });
      onDone?.();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Couldn't send — try again.");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const keys = new Map((result.keys || []).map((k: any) => [k.id, k]));
    const given = result.answers || answers;
    return (
      <motion.div {...m("reveal")} className="el-card p-5 space-y-4">
        <p className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <CheckCircle2 className="w-5 h-5 text-success-700 dark:text-success-500" /> Sent — {result.correct} of {result.total} right
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300">Your teacher sees the class's answers before the next lesson.</p>
        {questions.map((q, i) => {
          const k: any = keys.get(q.id);
          const ok = k && Number(given[q.id]) === k.correct_index;
          return (
            <div key={q.id} className="rounded-xl el-subtle p-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{i + 1}. {q.prompt}</p>
              {k && (
                <p className={`mt-1 text-sm ${ok ? "text-success-700 dark:text-success-500" : "text-warning-700 dark:text-warning-500"}`}>
                  {ok ? "✓ " : "Answer: "}
                  {q.options[k.correct_index]}
                  {k.explanation ? ` — ${k.explanation}` : ""}
                </p>
              )}
            </div>
          );
        })}
      </motion.div>
    );
  }

  return (
    <div className="el-card p-5 space-y-5">
      <p className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-300">
        <Ticket className="w-4 h-4" /> Exit ticket · before you go
      </p>
      {questions.map((q, i) => (
        <fieldset key={q.id}>
          <legend className="text-base font-medium text-gray-900 dark:text-white">{i + 1}. {q.prompt}</legend>
          <div className="mt-2 space-y-2" role="radiogroup">
            {q.options.map((o: string, j: number) => {
              const on = answers[q.id] === j;
              return (
                <button key={j} role="radio" aria-checked={on} onClick={() => setAnswers({ ...answers, [q.id]: j })} className={`w-full text-left min-h-[48px] px-4 rounded-xl border text-sm transition-colors focus:outline-none focus-visible:shadow-glow ${on ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-gray-900 dark:text-white" : "border-gray-200 dark:border-white/10 text-gray-800 dark:text-gray-100"}`}>
                  {o}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      {content?.ask_confidence !== false && (
        <fieldset>
          <legend className="text-sm font-medium text-gray-900 dark:text-white">How sure are you?</legend>
          <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup">
            {CONFIDENCE.map(({ v, label, icon: Icon }) => (
              <button key={v} role="radio" aria-checked={confidence === v} onClick={() => setConfidence(v)} className={`min-h-[64px] rounded-xl border flex flex-col items-center justify-center gap-1 text-xs font-medium focus:outline-none focus-visible:shadow-glow ${confidence === v ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-gray-900 dark:text-white" : "border-gray-200 dark:border-white/10 text-slate-600 dark:text-slate-300"}`}>
                <Icon className="w-5 h-5" /> {label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {error && <p className="text-sm text-danger-700 dark:text-danger-500">{error}</p>}
      <button disabled={!ready || busy} onClick={submit} className="w-full min-h-[48px] rounded-pill bg-brand-600 text-white text-sm font-semibold disabled:opacity-50">
        Send to my teacher
      </button>
    </div>
  );
};

// ---------------------------------------------------------------- flashcards

export const FlashcardDeck: React.FC<{ itemId: number; content: any; onDone?: () => void }> = ({ itemId, content, onDone }) => {
  const m = useMotion();
  const cards: { id: string; front: string; back: string; gloss_rw?: string }[] = content?.cards || [];
  const [states, setStates] = useState<Record<string, any>>(() => Object.fromEntries((content?.reviews || []).map((r: any) => [r.card_id, r.fsrs_state])));
  const initialQueue = useMemo(() => {
    const q = sessionQueue(cards, content?.reviews || []);
    return q.length ? q : cards.map((c) => c.id); // nothing due: practise the whole deck
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [queue, setQueue] = useState<string[]>(initialQueue);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const card = cards.find((c) => c.id === queue[0]);
  const intervals = useMemo(() => (card ? previewIntervals(states[card.id]) : null), [card, states]);

  const grade = (g: Grade) => {
    if (!card) return;
    const next = review(states[card.id], g);
    setStates((s) => ({ ...s, [card.id]: next.state }));
    void sendOrQueue(`/elearning/my/items/${itemId}/flashcards/review`, { card_id: card.id, rating: next.rating, due_at: next.due.toISOString(), fsrs_state: next.state });
    setFlipped(false);
    setDone((d) => d + 1);
    // "Again" comes back at the end of this session.
    setQueue((q) => (g === "again" ? [...q.slice(1), card.id] : q.slice(1)));
    if (queue.length === 1 && g !== "again") onDone?.();
  };

  if (!card) {
    return (
      <div className="el-card p-6 text-center">
        <CheckCircle2 className="w-10 h-10 mx-auto text-success-700 dark:text-success-500" />
        <p className="mt-2 text-base font-semibold text-gray-900 dark:text-white">Deck done — {done} card{done === 1 ? "" : "s"} reviewed</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">Each card comes back just before you'd forget it.</p>
        <button onClick={() => { setQueue(cards.map((c) => c.id)); setDone(0); }} className="mt-3 inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-pill el-chip text-sm font-medium">
          <RotateCcw className="w-4 h-4" /> Practise again
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600 dark:text-slate-300 tabular-nums" aria-live="polite">{queue.length} card{queue.length === 1 ? "" : "s"} to go</p>
      <button
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={(e) => {
          if (e.key === " ") {
            e.preventDefault();
            setFlipped((f) => !f);
          }
        }}
        aria-label={flipped ? `Answer: ${card.back}. Tap to see the question` : `${card.front}. Tap to see the answer`}
        className="w-full min-h-[220px] el-card p-6 flex flex-col items-center justify-center text-center focus:outline-none focus-visible:shadow-glow"
      >
        <AnimatePresence mode="wait">
          <motion.div key={`${card.id}-${flipped}`} {...m("fade")}>
            {!flipped ? (
              <>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{card.front}</p>
                {card.gloss_rw && <p className="mt-1 text-sm italic text-slate-600 dark:text-slate-300">{card.gloss_rw}</p>}
                <p className="mt-4 text-xs text-slate-600 dark:text-slate-300">Think of the answer, then tap</p>
              </>
            ) : (
              <p className="text-lg text-gray-900 dark:text-white">{card.back}</p>
            )}
          </motion.div>
        </AnimatePresence>
      </button>
      {flipped && intervals && (
        <motion.div {...m("reveal")} className="grid grid-cols-4 gap-2" role="group" aria-label="How well did you remember?">
          {(["again", "hard", "good", "easy"] as Grade[]).map((g) => (
            <button key={g} onClick={() => grade(g)} className={`min-h-[56px] rounded-xl text-sm font-semibold flex flex-col items-center justify-center focus:outline-none focus-visible:shadow-glow ${g === "again" ? "el-chip-danger" : g === "good" ? "bg-brand-600 text-white" : "el-chip"}`}>
              {GRADE_LABEL[g]}
              <span className="text-[10px] font-normal opacity-80">{intervals[g]}</span>
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- practical task

/** Photos from a phone camera are 3–8 MB; send ≤ 1600 px JPEGs (~200–400 KB) instead. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<File> {
  try {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap === "undefined") return file;
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

const STATUS_COPY: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: "Waiting for your teacher", cls: "el-chip-brand" },
  RETURNED: { label: "Your teacher asks for changes", cls: "el-chip-warning" },
  SIGNED_OFF: { label: "Signed off ✓", cls: "el-chip-success" },
};

export const PracticalTaskView: React.FC<{ itemId: number; content: any; onChanged?: () => void }> = ({ itemId, content, onChanged }) => {
  const [photos, setPhotos] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<any>(content?.submission ?? null);
  const input = useRef<HTMLInputElement>(null);
  const max = content?.max_photos || 3;
  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  const canSend = photos.length > 0 && submission?.status !== "SIGNED_OFF";
  const token = encodeURIComponent(getToken() || "");

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      for (const p of photos) form.append("photos", await compressImage(p));
      if (note.trim()) form.append("note", note.trim());
      await apiService.post(`/elearning/my/items/${itemId}/practical`, form, { headers: { "Content-Type": "multipart/form-data" }, timeout: 0 });
      setSubmission({ status: "SUBMITTED", student_note: note, photos: [] });
      setPhotos([]);
      onChanged?.();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Couldn't send — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {content?.brief_html && <RichHtml className="el-card p-5 lesson-note-preview note-reader-body note-reader-body--sans" style={{ "--reader-font-scale": 0.95 } as React.CSSProperties} html={content.brief_html} />}
      <div className="el-card p-5">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Your teacher will check</p>
        <ul className="mt-2 space-y-1.5">
          {(content?.checklist || []).map((c: any) => {
            const ticked = submission?.checklist_result?.[c.id];
            return (
              <li key={c.id} className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-100">
                <span className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${ticked ? "bg-success-700 border-success-700 text-white" : "border-gray-300 dark:border-white/20"}`}>{ticked && <Check className="w-3.5 h-3.5" />}</span>
                {c.text}
                {c.criteria_number && <span className="ml-auto px-1.5 rounded-pill el-chip text-[10px] font-semibold">{c.criteria_number}</span>}
              </li>
            );
          })}
        </ul>
      </div>
      {submission && (
        <div className="el-card p-4 space-y-2">
          <span className={`inline-block px-2 py-0.5 rounded-pill text-xs font-semibold ${STATUS_COPY[submission.status]?.cls}`}>{STATUS_COPY[submission.status]?.label}</span>
          {submission.teacher_comment && <p className="text-sm text-gray-800 dark:text-gray-100"><Undo2 className="w-4 h-4 inline mr-1" />{submission.teacher_comment}</p>}
          {submission.photos?.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {submission.photos.map((p: any) => (
                <img key={p.asset_id} src={`${API_BASE_URL}/elearning/my/practical-photos/${p.asset_id}?token=${token}`} alt={p.original_name} className="w-24 h-24 object-cover rounded-xl" loading="lazy" />
              ))}
            </div>
          )}
        </div>
      )}
      {submission?.status !== "SIGNED_OFF" && (
        <div className="el-card p-5 space-y-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{submission ? "Send new photos" : "Show your work"}</p>
          <div className="flex gap-2 flex-wrap">
            {previews.map((src, i) => (
              <div key={src} className="relative">
                <img src={src} alt={`Photo ${i + 1}`} className="w-24 h-24 object-cover rounded-xl" />
                <button aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))} className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            {photos.length < max && (
              <button onClick={() => input.current?.click()} className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 dark:border-white/20 flex flex-col items-center justify-center gap-1 text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus-visible:shadow-glow">
                <Camera className="w-5 h-5" /> Add photo
              </button>
            )}
          </div>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; setPhotos((ps) => [...ps, ...f].slice(0, max)); }} />
          <label className="block">
            <span className="text-xs text-slate-600 dark:text-slate-300">A note for your teacher (optional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} className="mt-1 el-input py-2" />
          </label>
          {error && <p className="text-sm text-danger-700 dark:text-danger-500">{error}</p>}
          <button disabled={!canSend || busy} onClick={send} className="w-full min-h-[48px] rounded-pill bg-brand-600 text-white text-sm font-semibold disabled:opacity-50">
            {busy ? "Sending…" : `Send ${photos.length || ""} photo${photos.length === 1 ? "" : "s"} to my teacher`}
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- daily review (all decks)

export interface DueCard {
  item_id: number;
  deck: string;
  card: { id: string; front: string; back: string; gloss_rw?: string };
  fsrs_state: any;
}

/**
 * Today's five-minute review across every deck the student has (§11): cards that are due,
 * graded on the device and synced (queued while offline).
 */
export const DailyReview: React.FC<{ due: DueCard[]; onClose: () => void }> = ({ due, onClose }) => {
  const m = useMotion();
  const [queue, setQueue] = useState(due);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const cur = queue[0];
  const intervals = useMemo(() => (cur ? previewIntervals(cur.fsrs_state) : null), [cur]);
  const grade = (g: Grade) => {
    if (!cur) return;
    const next = review(cur.fsrs_state, g);
    void sendOrQueue(`/elearning/my/items/${cur.item_id}/flashcards/review`, { card_id: cur.card.id, rating: next.rating, due_at: next.due.toISOString(), fsrs_state: next.state });
    setFlipped(false);
    setDone((d) => d + 1);
    setQueue((q) => (g === "again" ? [...q.slice(1), { ...cur, fsrs_state: next.state }] : q.slice(1)));
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Today's review" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <motion.div {...m("reveal")} className="w-full sm:max-w-md bg-white dark:bg-[#0b0b0f] rounded-t-3xl sm:rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-gray-900 dark:text-white">Today's review</p>
          <button onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center"><X className="w-5 h-5" /></button>
        </div>
        {!cur ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-10 h-10 mx-auto text-success-700 dark:text-success-500" />
            <p className="mt-2 text-base font-semibold text-gray-900 dark:text-white">All done — {done} card{done === 1 ? "" : "s"}</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">Come back tomorrow for the next few.</p>
            <button onClick={onClose} autoFocus className="mt-4 min-h-[44px] px-5 rounded-pill bg-brand-600 text-white text-sm font-semibold">Close</button>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-600 dark:text-slate-300" aria-live="polite">{cur.deck} · {queue.length} left</p>
            <button autoFocus onClick={() => setFlipped((f) => !f)} className="w-full min-h-[200px] el-card p-6 text-center flex items-center justify-center focus:outline-none focus-visible:shadow-glow" aria-label={flipped ? `Answer: ${cur.card.back}` : `${cur.card.front}. Tap to see the answer`}>
              {flipped ? <span className="text-lg text-gray-900 dark:text-white">{cur.card.back}</span> : <span className="text-2xl font-bold text-gray-900 dark:text-white">{cur.card.front}</span>}
            </button>
            {flipped && intervals && (
              <div className="grid grid-cols-4 gap-2" role="group" aria-label="How well did you remember?">
                {(["again", "hard", "good", "easy"] as Grade[]).map((g) => (
                  <button key={g} onClick={() => grade(g)} className={`min-h-[56px] rounded-xl text-sm font-semibold flex flex-col items-center justify-center ${g === "again" ? "el-chip-danger" : g === "good" ? "bg-brand-600 text-white" : "el-chip"}`}>
                    {GRADE_LABEL[g]}
                    <span className="text-[10px] font-normal opacity-80">{intervals[g]}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
};
