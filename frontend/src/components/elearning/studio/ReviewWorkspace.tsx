import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCheck,
  CircleHelp,
  ExternalLink,
  Hammer,
  Info,
  Layers,
  Link as LinkIcon,
  PlayCircle,
  RefreshCw,
  Ticket,
  Trash2,
  Quote,
} from "lucide-react";
import type { DraftItem, RunWeek } from "../../../api/studio";
import { lessonNotesApi } from "../../../api/lessonNotes";
import { elearningApi } from "../../../api/elearning";
import { useMotion } from "../../../design/motion";
import { hydrateInlineChecks } from "../interactive/hydrate";
import { attachImageTokenToHtml } from "../../../utils/lessonNoteImages";
import { flagTone, REVIEW_KEYS, weekIsClean } from "./studioModel";

/** Reader typography at review size: the full reader defaults to 1.15× for long reading. */
const READER_STYLE = { "--reader-font-scale": 0.92, "--reader-line-height": 1.65 } as React.CSSProperties;

const TYPE_META: Record<string, { icon: React.ElementType; label: string }> = {
  LESSON_NOTE: { icon: BookOpen, label: "Lesson" },
  KNOWLEDGE_CHECK: { icon: CircleHelp, label: "Knowledge check" },
  VIDEO: { icon: PlayCircle, label: "Video" },
  PAGE: { icon: Hammer, label: "Practical task" },
  PRACTICAL_TASK: { icon: Hammer, label: "Practical task" },
  EXIT_TICKET: { icon: Ticket, label: "Exit ticket" },
  FLASHCARDS: { icon: Layers, label: "Flashcards" },
};

const Flags: React.FC<{ flags: DraftItem["review_flags"]; targetId?: string }> = ({ flags, targetId }) => {
  const shown = (flags || []).filter((f) => (targetId ? f.target_id === targetId : !f.target_id));
  if (!shown.length) return null;
  return (
    <ul className="mt-2 space-y-1">
      {shown.map((f, i) => {
        const warn = flagTone(f.kind) === "warn";
        return (
          <li key={i} className={`flex items-start gap-1.5 text-xs rounded-lg px-2 py-1.5 ${warn ? "el-chip-warning" : "el-subtle text-slate-600 dark:text-slate-300"}`}>
            {warn ? <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" /> : <Info className="w-3.5 h-3.5 mt-px flex-shrink-0" />}
            <span>{f.note}</span>
          </li>
        );
      })}
    </ul>
  );
};

/** The lesson as the student will read it, with each section's sources one tap away. */
const LessonPreview: React.FC<{ draft: DraftItem }> = ({ draft }) => {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!draft.ref_id) return;
    let off = false;
    lessonNotesApi
      .get(draft.ref_id)
      .then((r) => !off && setHtml(r.data.data.content_html || ""))
      .catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
  }, [draft.ref_id]);
  useEffect(() => {
    if (html !== null) hydrateInlineChecks(ref.current);
  }, [html]);
  const sources = draft.source_refs?.sources ?? [];
  const titleOf = (refId: string) => sources.find((s) => s.ref === refId)?.title ?? refId;
  if (failed) return <p className="text-sm text-danger-700 dark:text-danger-500">Couldn't load this lesson.</p>;
  if (html === null) return <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-3 rounded bg-gray-100 dark:bg-white/10 animate-pulse" />)}</div>;
  return (
    <>
      <div ref={ref} className="lesson-note-preview note-reader-body note-reader-body--sans max-h-[60vh] overflow-y-auto pr-1" style={READER_STYLE} dangerouslySetInnerHTML={{ __html: attachImageTokenToHtml(html) }} />
      {(draft.source_refs?.sections?.length ?? 0) > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer min-h-[36px] inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-200">
            <Quote className="w-3.5 h-3.5" /> Where each part comes from
          </summary>
          <ul className="mt-2 space-y-1">
            {draft.source_refs!.sections!.map((s, i) => (
              <li key={i} className="text-xs flex flex-wrap items-center gap-1">
                <span className="font-medium text-gray-800 dark:text-gray-100">{s.heading}</span>
                <span className="text-slate-600 dark:text-slate-300">←</span>
                {s.refs.length ? (
                  s.refs.map((r) => (
                    <span key={r} title={titleOf(r)} className="px-1.5 rounded-pill el-chip-brand text-[11px] font-semibold">
                      {r} · {titleOf(r).slice(0, 40)}
                    </span>
                  ))
                ) : (
                  <span className="px-1.5 rounded-pill el-chip-warning text-[11px]">no source</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
};

const QuestionsPreview: React.FC<{ draft: DraftItem }> = ({ draft }) => {
  const qs: any[] = draft.content_json?.questions ?? [];
  const verifiedBy = draft.source_refs?.verified_by;
  return (
    <div>
      {verifiedBy && <p className="text-xs text-success-700 dark:text-success-500 inline-flex items-center gap-1"><CheckCheck className="w-3.5 h-3.5" /> Answers double-checked by a second AI</p>}
      <ol className="mt-2 space-y-3">
        {qs.map((q, i) => (
          <li key={q.id ?? i}>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {i + 1}. {q.prompt}
              {draft.source_refs?.questions?.[q.id]?.criteria && (
                <span className="ml-1.5 px-1.5 rounded-pill el-chip text-[10px] font-semibold align-middle">{draft.source_refs.questions[q.id].criteria}</span>
              )}
            </p>
            <ul className="mt-1 grid sm:grid-cols-2 gap-1">
              {(q.options ?? []).map((o: string, j: number) => (
                <li key={j} className={`text-sm px-2 py-1 rounded-lg flex items-center gap-1.5 ${j === q.correct_index ? "el-chip-success font-medium" : "el-subtle text-gray-700 dark:text-gray-200"}`}>
                  {j === q.correct_index && <Check className="w-3.5 h-3.5 flex-shrink-0" aria-label="Correct answer" />}
                  {o}
                </li>
              ))}
            </ul>
            {q.explanation && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{q.explanation}</p>}
            <Flags flags={draft.review_flags} targetId={q.id} />
          </li>
        ))}
      </ol>
    </div>
  );
};

const VideoSlot: React.FC<{ draft: DraftItem; onSaved: () => void }> = ({ draft, onSaved }) => {
  const [url, setUrl] = useState(draft.external_url || "");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const watchFor: string[] = draft.content_json?.watch_for ?? [];
  const search = draft.content_json?.search_terms as string | undefined;
  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await elearningApi.updateItem(draft.item_id, { url: url.trim(), title: draft.title });
      onSaved();
    } catch (e: any) {
      setErr(e?.response?.data?.message || "That link didn't work.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div>
      {watchFor.length > 0 && (
        <>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">As students watch, they look for:</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-gray-800 dark:text-gray-100">{watchFor.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </>
      )}
      {draft.external_url ? (
        <p className="mt-2 text-sm inline-flex items-center gap-1.5 text-success-700 dark:text-success-500"><Check className="w-4 h-4" /> Link added</p>
      ) : (
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <label className="sr-only" htmlFor={`v-${draft.item_id}`}>YouTube or Vimeo link</label>
          <input id={`v-${draft.item_id}`} inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a YouTube or Vimeo link" className="el-input flex-1" />
          <button disabled={!url.trim() || saving} onClick={save} className="min-h-[44px] px-4 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50">
            <LinkIcon className="w-4 h-4 inline mr-1" /> Add link
          </button>
        </div>
      )}
      {search && !draft.external_url && (
        <a className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-200" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(search)}`} target="_blank" rel="noopener noreferrer">
          Search YouTube for “{search}” <ExternalLink className="w-3 h-3" />
        </a>
      )}
      {err && <p className="mt-1 text-xs text-danger-700 dark:text-danger-500">{err}</p>}
    </div>
  );
};

const CardsPreview: React.FC<{ draft: DraftItem }> = ({ draft }) => (
  <ul className="grid sm:grid-cols-2 gap-2">
    {(draft.content_json?.cards ?? []).map((c: any) => (
      <li key={c.id} className="el-subtle rounded-xl p-2.5">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{c.front}{c.gloss_rw ? <em className="ml-1 font-normal text-slate-600 dark:text-slate-300">({c.gloss_rw})</em> : null}</p>
        <p className="text-xs text-slate-600 dark:text-slate-300">{c.back}</p>
      </li>
    ))}
  </ul>
);

/** One draft, as students will get it, with the teacher's four choices. */
const DraftCard: React.FC<{
  draft: DraftItem & { content_html?: string };
  busy: boolean;
  onApprove: () => void;
  onRegenerate: () => void;
  onDismiss: () => void;
  onChanged: () => void;
}> = ({ draft, busy, onApprove, onRegenerate, onDismiss, onChanged }) => {
  const m = useMotion();
  const meta = TYPE_META[draft.item_type] ?? { icon: BookOpen, label: draft.item_type };
  const own = draft.ai_origin === "NONE";
  const needsLink = draft.item_type === "VIDEO" && !draft.external_url;
  const editHref = draft.item_type === "LESSON_NOTE" && draft.ref_id ? `/lesson-notes/${draft.ref_id}` : null;
  return (
    <motion.article layout {...m("reveal")} className="el-card p-4" aria-label={`${meta.label}: ${draft.title}`}>
      <header className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl el-subtle flex items-center justify-center flex-shrink-0 text-gray-600 dark:text-gray-300"><meta.icon className="w-4 h-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
            {meta.label}
            {own ? <span className="normal-case tracking-normal px-1.5 rounded-pill el-chip text-[10px]">Your note</span> : <span className="normal-case tracking-normal px-1.5 rounded-pill el-chip-brand text-[10px]">AI draft{draft.review_state === "EDITED" ? " · edited" : ""}</span>}
          </p>
          <h4 className="text-base font-semibold text-gray-900 dark:text-white">{draft.title}</h4>
          {draft.criteria.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">{draft.criteria.map((c) => <span key={c.criteria_id} title={c.description} className="px-1.5 rounded-pill el-chip text-[11px] font-semibold">{c.criteria_number}</span>)}</div>
          )}
        </div>
      </header>
      <Flags flags={draft.review_flags} />
      <div className="mt-3">
        {draft.item_type === "LESSON_NOTE" && <LessonPreview draft={draft} />}
        {(draft.item_type === "KNOWLEDGE_CHECK" || draft.item_type === "EXIT_TICKET") && <QuestionsPreview draft={draft} />}
        {draft.item_type === "VIDEO" && <VideoSlot draft={draft} onSaved={onChanged} />}
        {(draft.item_type === "PAGE" || draft.item_type === "PRACTICAL_TASK") && draft.content_html && <div className="lesson-note-preview note-reader-body note-reader-body--sans" style={READER_STYLE} dangerouslySetInnerHTML={{ __html: draft.content_html }} />}
        {draft.item_type === "PRACTICAL_TASK" && (draft.content_json?.checklist?.length ?? 0) > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Success checklist (you tick it when signing off)</p>
            <ul className="mt-1 space-y-1">
              {draft.content_json.checklist.map((c: any) => (
                <li key={c.id} className="text-sm text-gray-800 dark:text-gray-100 flex gap-2">
                  <span className="w-4 h-4 mt-0.5 rounded border border-gray-300 dark:border-white/20 flex-shrink-0" aria-hidden />
                  {c.text}
                  {c.criteria_number && <span className="ml-auto px-1.5 rounded-pill el-chip text-[10px] font-semibold">{c.criteria_number}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {draft.item_type === "FLASHCARDS" && <CardsPreview draft={draft} />}
      </div>
      <footer className="mt-4 flex flex-wrap gap-2">
        <button disabled={busy || needsLink} onClick={onApprove} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill bg-success-700 hover:brightness-110 text-white text-sm font-semibold disabled:opacity-50" title={needsLink ? "Add a link first" : undefined}>
          <Check className="w-4 h-4" /> Approve
        </button>
        {editHref && (
          <a href={editHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill el-chip text-sm font-medium">
            Edit <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        {!own && (
          <button disabled={busy} onClick={onRegenerate} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill el-chip text-sm font-medium">
            <RefreshCw className="w-4 h-4" /> Redo with a note
          </button>
        )}
        <button disabled={busy} onClick={onDismiss} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill el-chip text-sm font-medium text-danger-700 dark:text-danger-500">
          <Trash2 className="w-4 h-4" /> {own ? "Remove" : "Discard"}
        </button>
      </footer>
    </motion.article>
  );
};

export const ReviewWorkspace: React.FC<{
  weeks: RunWeek[];
  focus: number | null;
  onFocus: (sectionId: number) => void;
  busy: boolean;
  onApproveWeek: (sectionId: number, opts: { itemIds?: number[]; publish: boolean }) => Promise<void>;
  onApproveClean: (sectionIds: number[], publish: boolean) => Promise<void>;
  onRegenerate: (item: DraftItem) => void;
  onDismiss: (item: DraftItem) => void;
  onChanged: () => void;
}> = ({ weeks, focus, onFocus, busy, onApproveWeek, onApproveClean, onRegenerate, onDismiss, onChanged }) => {
  const reviewable = useMemo(() => weeks.filter((w) => w.pending_review > 0), [weeks]);
  const current = reviewable.find((w) => w.section_id === focus) ?? reviewable[0] ?? null;
  const [publish, setPublish] = useState(true);
  const cleanWeeks = reviewable.filter((w) => weekIsClean(w.drafts));
  const m = useMotion();

  // j/k (↓/↑) move between weeks, a approves the week (§9.2 step 6). Ignored while typing.
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const action = REVIEW_KEYS[e.key];
      if (!action || !current) return;
      const i = reviewable.findIndex((w) => w.section_id === current.section_id);
      if (action === "next" && reviewable[i + 1]) onFocus(reviewable[i + 1].section_id);
      else if (action === "prev" && reviewable[i - 1]) onFocus(reviewable[i - 1].section_id);
      else if (action === "approve" && !busy) void onApproveWeek(current.section_id, { publish });
      else return;
      e.preventDefault();
    },
    [current, reviewable, onFocus, onApproveWeek, busy, publish],
  );
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  if (!current) {
    return (
      <div className="el-card p-8 text-center">
        <CheckCheck className="w-10 h-10 mx-auto text-success-500" />
        <p className="mt-2 text-base font-semibold text-gray-900 dark:text-white">Nothing waiting for review</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">Approved weeks are on the course. Turn weeks on in the builder when you're ready.</p>
      </div>
    );
  }
  const idx = reviewable.findIndex((w) => w.section_id === current.section_id);
  return (
    <div className="space-y-4">
      <div className="el-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Week {idx + 1} of {reviewable.length} to review
          </p>
          <p className="hidden md:block text-xs text-slate-600 dark:text-slate-300">
            <kbd className="px-1 rounded el-chip font-mono">J</kbd> / <kbd className="px-1 rounded el-chip font-mono">K</kbd> move · <kbd className="px-1 rounded el-chip font-mono">A</kbd> approve
          </p>
        </div>
        <h3 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{current.title}</h3>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {current.criteria.map((c) => {
            const ok = !current.coverage.gaps.includes(c.criteria_number);
            return <span key={c.criteria_id} title={c.description} className={`px-1.5 rounded-pill text-[11px] font-semibold ${ok ? "el-chip-success" : "el-chip-warning"}`}>{c.criteria_number} {ok ? "✓" : "missing"}</span>;
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100 dark:border-white/[0.06]">
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 mr-auto">
            <input type="checkbox" className="w-4 h-4 accent-brand-500" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            Turn the week on (opens on its date)
          </label>
          {cleanWeeks.length > 1 && (
            <button disabled={busy} onClick={() => onApproveClean(cleanWeeks.map((w) => w.section_id), publish)} className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-pill el-chip text-sm font-semibold">
              Approve {cleanWeeks.length} weeks with no warnings
            </button>
          )}
          <button disabled={busy} onClick={() => onApproveWeek(current.section_id, { publish })} className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-pill bg-success-700 hover:brightness-110 text-white text-sm font-semibold disabled:opacity-50">
            <CheckCheck className="w-4 h-4" /> Approve week
          </button>
        </div>
      </div>
      <AnimatePresence mode="popLayout">
        <motion.div key={current.section_id} {...m("fade")} className="space-y-3">
          {current.drafts.map((d) => (
            <DraftCard
              key={d.item_id}
              draft={d as any}
              busy={busy}
              onApprove={() => onApproveWeek(current.section_id, { itemIds: [d.item_id], publish: false })}
              onRegenerate={() => onRegenerate(d)}
              onDismiss={() => onDismiss(d)}
              onChanged={onChanged}
            />
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default ReviewWorkspace;
