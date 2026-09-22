import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, RotateCcw, X } from "lucide-react";
import type { LearnerSection } from "../../../api/elearning";
import { elearningApi } from "../../../api/elearning";
import { lessonNotesApi } from "../../../api/lessonNotes";
import { useMotion } from "../../../design/motion";
import Mascot from "../ui/Mascot";
import { Skeleton } from "../ui/primitives";

export interface Flashcard {
  front: string;
  back: string;
  source: string;
}

/**
 * Builds Quizlet-style cards from the teacher's own content: every h2/h3 becomes the front,
 * the paragraph(s) after it the back. Definition-like lines ("Term: meaning", "Term — meaning")
 * become their own cards. Pure — unit-tested without a DOM.
 */
export function extractFlashcards(html: string, source: string, doc: Document = document): Flashcard[] {
  const root = doc.createElement("div");
  root.innerHTML = html;
  const cards: Flashcard[] = [];
  const clean = (t: string | null | undefined) => (t || "").replace(/\s+/g, " ").trim();

  root.querySelectorAll("h1, h2, h3").forEach((h) => {
    const front = clean(h.textContent);
    if (!front || front.length > 140) return;
    const parts: string[] = [];
    let el = h.nextElementSibling;
    while (el && !/^H[1-3]$/.test(el.tagName) && parts.join(" ").length < 320) {
      if (["P", "UL", "OL", "BLOCKQUOTE"].includes(el.tagName)) {
        const t = clean(el.textContent);
        if (t) parts.push(t);
      }
      el = el.nextElementSibling;
    }
    const back = parts.join(" ").slice(0, 360);
    if (back.length > 20) cards.push({ front, back, source });
  });

  root.querySelectorAll("p, li").forEach((p) => {
    const t = clean(p.textContent);
    const m = t.match(/^([A-Z][\w\s()/-]{2,60}?)\s*(?::|—|–| is defined as | means )\s*(.{20,300})$/);
    if (m && !cards.some((c) => c.front === m[1].trim())) cards.push({ front: m[1].trim(), back: m[2].trim(), source });
  });
  return cards.slice(0, 40);
}

interface Props {
  section: LearnerSection;
  onClose: () => void;
}

/** "Review this week" — flip cards from the week's notes and pages (UX plan §4.3 Review mode). */
const ReviewSheet: React.FC<Props> = ({ section, onClose }) => {
  const m = useMotion();
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Flashcard[] = [];
      for (const item of section.items) {
        if (item.locked) continue;
        try {
          if (item.item_type === "LESSON_NOTE" && item.ref_id) {
            const r = await lessonNotesApi.getShared(item.ref_id);
            out.push(...extractFlashcards(r.data.data.content_html || "", item.title));
          } else if (item.item_type === "PAGE") {
            const r = await elearningApi.openItem(item.item_id);
            out.push(...extractFlashcards(r.data.data.content?.content_html || "", item.title));
          }
        } catch {
          /* skip unreadable items */
        }
      }
      if (!cancelled) setCards(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [section]);

  const total = cards?.length || 0;
  const card = cards?.[index];
  const remaining = useMemo(() => total - known.size, [total, known]);

  const next = (markKnown?: boolean) => {
    if (markKnown) setKnown((k) => new Set(k).add(index));
    setFlipped(false);
    setIndex((i) => (i + 1) % Math.max(1, total));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") {
        setFlipped(false);
        setIndex((i) => (i - 1 + Math.max(1, total)) % Math.max(1, total));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, onClose]);

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Review ${section.title}`}
        className="w-full max-w-lg rounded-3xl el-float p-5"
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex-1 truncate">Review · {section.title.split(" — ")[0]}</p>
          {total > 0 && <span className="text-[11px] text-gray-500 tabular-nums">{index + 1}/{total} · {remaining} to go</span>}
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]" aria-label="Close review"><X className="w-4 h-4" /></button>
        </div>

        {cards === null ? (
          <Skeleton className="mt-4 h-48" />
        ) : total === 0 ? (
          <div className="mt-4 flex flex-col items-center text-center py-6">
            <Mascot pose="thinking" size={56} />
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">Nothing to review yet — cards come from headings and definitions in this week's notes.</p>
          </div>
        ) : (
          <>
            <button
              onClick={() => setFlipped((f) => !f)}
              aria-pressed={flipped}
              className="mt-4 w-full min-h-[200px] rounded-2xl border border-gray-200 dark:border-white/10 el-subtle p-5 text-left focus:outline-none focus-visible:shadow-glow"
              style={{ perspective: 1000 }}
            >
              <AnimatePresence mode="wait">
                <motion.div key={`${index}-${flipped}`} {...m("reveal")}>
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">{flipped ? "Answer" : "Term"} · {card?.source}</p>
                  <p className={`mt-2 ${flipped ? "text-sm leading-relaxed text-gray-800 dark:text-gray-100" : "text-lg font-semibold text-gray-900 dark:text-white"}`}>{flipped ? card?.back : card?.front}</p>
                  {!flipped && <p className="mt-4 text-xs text-gray-400">Tap to flip · space</p>}
                </motion.div>
              </AnimatePresence>
            </button>
            <div className="mt-4 flex items-center justify-between gap-2">
              <button onClick={() => { setFlipped(false); setIndex((i) => (i - 1 + total) % total); }} className="w-11 h-11 flex items-center justify-center rounded-pill text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]" aria-label="Previous card"><ChevronLeft className="w-5 h-5" /></button>
              <div className="flex gap-2">
                <button onClick={() => next(false)} className="min-h-[44px] px-4 rounded-pill el-chip text-sm font-medium text-gray-700 dark:text-gray-200 inline-flex items-center gap-1"><RotateCcw className="w-4 h-4" /> Again</button>
                <button onClick={() => next(true)} className="min-h-[44px] px-5 rounded-pill bg-success-500 text-white text-sm font-semibold">Got it</button>
              </div>
              <button onClick={() => next()} className="w-11 h-11 flex items-center justify-center rounded-pill text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]" aria-label="Next card"><ChevronRight className="w-5 h-5" /></button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
};

export default ReviewSheet;
