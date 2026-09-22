import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Loader2, Send, Sparkles, X } from "lucide-react";
import { apiService } from "../../../services/api";
import { learnerRoutes } from "../../../api/elearning";
import { useNavigate } from "react-router-dom";
import { useMotion } from "../../../design/motion";
import Mascot from "../ui/Mascot";

interface Turn {
  role: "user" | "assistant";
  html: string;
  citations?: { item_id: number; title: string; section_id: number }[];
  grounded?: boolean;
  follow_ups?: string[];
}

interface Props {
  courseId: number;
  sectionId: number | null;
  open: boolean;
  onClose: () => void;
}

/** Bottom-sheet tutor scoped to the whole course: suggested questions from the week's criteria, cited answers (UX plan §4.3). */
const AITutorSheet: React.FC<Props> = ({ courseId, sectionId, open, onClose }) => {
  const m = useMotion();
  const navigate = useNavigate();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    apiService
      .get(`/elearning/my/courses/${courseId}/ask/suggestions`, { params: { section_id: sectionId || undefined } })
      .then((r) => setSuggestions(r.data.data.questions || []))
      .catch(() => setSuggestions(["Explain this week in simpler words", "Give me an example", "Quiz me on this week"]));
  }, [open, courseId, sectionId]);

  useEffect(() => {
    const el = listRef.current;
    if (el && typeof el.scrollTo === "function") el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setTurns((t) => [...t, { role: "user", html: q }]);
    setBusy(true);
    const mode = /quiz me/i.test(q) ? "quiz" : /simpler|simple words/i.test(q) ? "simpler" : /example/i.test(q) ? "example" : "";
    try {
      const r = await apiService.post(`/elearning/my/courses/${courseId}/ask`, { question: q, section_id: sectionId, mode });
      const d = r.data.data;
      setTurns((t) => [...t, { role: "assistant", html: d.answer_html, citations: d.citations, grounded: d.grounded, follow_ups: d.follow_ups }]);
    } catch (e: any) {
      setTurns((t) => [...t, { role: "assistant", html: `<p>${e?.response?.data?.message || "I couldn't answer that just now. Try again in a moment."}</p>`, grounded: false }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/30 lg:bg-transparent lg:pointer-events-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            role="dialog"
            aria-label="AI tutor"
            className="fixed z-50 bottom-0 left-0 right-0 lg:left-auto lg:right-4 lg:bottom-4 lg:w-[420px] max-h-[80vh] flex flex-col rounded-t-3xl lg:rounded-3xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-md shadow-float border border-gray-200/70 dark:border-gray-700/60"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <Mascot pose={busy ? "thinking" : "book"} size={32} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Ask about this course</p>
                <p className="text-[11px] text-gray-500">Answers come from your teacher's notes and say where they found it.</p>
              </div>
              <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close tutor"><X className="w-4 h-4" /></button>
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[160px]">
              {turns.length === 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Try asking</p>
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => ask(s)} className="block w-full text-left min-h-[44px] px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-800 dark:text-gray-100 hover:border-brand-200">
                      <Sparkles className="inline w-3.5 h-3.5 text-accent-500 mr-1.5" />{s}
                    </button>
                  ))}
                </div>
              )}
              {turns.map((t, i) =>
                t.role === "user" ? (
                  <motion.p key={i} {...m("reveal")} className="ml-8 px-3 py-2 rounded-2xl rounded-br-md bg-brand-500 text-white text-sm">{t.html}</motion.p>
                ) : (
                  <motion.div key={i} {...m("reveal")} className="mr-4 px-3 py-2 rounded-2xl rounded-bl-md bg-gray-100 dark:bg-gray-800">
                    {t.grounded === false && <p className="text-[11px] text-warning-700 mb-1">Not in your notes — take this with care.</p>}
                    <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: t.html }} />
                    {t.citations && t.citations.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Sources">
                        {t.citations.map((c) => (
                          <li key={c.item_id}>
                            <button onClick={() => { onClose(); navigate(learnerRoutes.item(courseId, c.item_id)); }} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-pill bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-brand-700 dark:text-brand-200">
                              <BookOpen className="w-3 h-3" /> {c.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {t.follow_ups && t.follow_ups.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {t.follow_ups.map((f) => (
                          <button key={f} onClick={() => ask(f)} className="text-[11px] px-2 py-1 rounded-pill bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">{f}</button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ),
              )}
              {busy && <p className="text-xs text-gray-400 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading your notes…</p>}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
              className="flex items-center gap-2 p-3 border-t border-gray-100 dark:border-gray-800"
            >
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything about this course…" aria-label="Your question" className="flex-1 min-h-[44px] px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-brand-500" />
              <button type="submit" disabled={!input.trim() || busy} className="w-11 h-11 flex items-center justify-center rounded-pill bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-40" aria-label="Send"><Send className="w-4 h-4" /></button>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

export default AITutorSheet;
