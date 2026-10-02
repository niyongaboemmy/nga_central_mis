import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
// @ts-expect-error — katex ships no type declarations for this subpath
import renderMathInElement from "katex/contrib/auto-render";
import {
  AlertTriangle,
  ArrowUp,
  Bot,
  Copy,
  CornerDownLeft,
  Loader2,
  Quote,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { lessonNotesApi, NoteAskAnswer } from "../../../api/lessonNotes";

export type AskMode = "explain" | "simplify" | "example" | "define" | "quiz";

/** A request pushed in from the reader (selection toolbar, header button, keyboard shortcut).
 *  `id` is a monotonic counter so the panel can tell a genuinely new request from a re-render
 *  of the same one and never fire the same question twice. */
export interface AskRequest {
  id: number;
  question: string;
  selection?: string;
  mode?: AskMode;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  text?: string;
  html?: string;
  selection?: string;
  keyPoints?: string[];
  followUps?: string[];
  grounded?: boolean;
  error?: boolean;
}

interface Props {
  noteId: number;
  noteTitle: string;
  subjectName: string;
  open: boolean;
  onClose: () => void;
  request: AskRequest | null;
  /** The standalone reader owns the whole viewport, so the panel runs floor to
   *  ceiling. Embedded in the course page it must clear the app navbar. */
  offsetTop?: boolean;
  /** Sits beside the page (no backdrop) rather than over it. Undocked — small screens,
   *  or a course page without room beside the paper — it dims the page behind it.
   *  Left unset, it docks from lg up (the reader pads lg:pr-[420px] for it). */
  docked?: boolean;
}

const STARTERS = [
  { label: "Summarise this note", question: "Summarise this note in a few short points." },
  { label: "Explain it simply", question: "Explain the main idea of this note in the simplest words you can." },
  { label: "Key terms", question: "List and define the key terms in this note." },
  { label: "Quiz me", question: "Ask me a few practice questions on this note, then give the answers.", mode: "quiz" as AskMode },
  { label: "Real-world examples", question: "Give me real-world examples of what this note covers.", mode: "example" as AskMode },
  // "Explain it differently" (Lesson Studio §11): the same lesson, another way in.
  { label: "Example from a Rwandan workplace", question: "Explain the main idea of this note with an example from a workplace in Rwanda (a garage, a cooperative, a clinic, an office or mobile money).", mode: "example" as AskMode },
  { label: "Step by step", question: "Explain this note step by step, one small step at a time, as if I am seeing it for the first time.", mode: "simplify" as AskMode },
  { label: "En français", question: "Explique l'idée principale de cette note en français simple." },
];

const historyKey = (noteId: number) => `lessonNoteReader.chat.${noteId}`;

const AssistantBody: React.FC<{ html: string }> = ({ html }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    renderMathInElement(ref.current, {
      delimiters: [{ left: "$", right: "$", display: false }],
      throwOnError: false,
    });
  }, [html]);
  return (
    <div
      ref={ref}
      className="lesson-note-preview note-ai-answer max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

const NoteAIPanel: React.FC<Props> = ({
  noteId,
  noteTitle,
  subjectName,
  open,
  onClose,
  request,
  offsetTop = true,
  docked,
}) => {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const raw = sessionStorage.getItem(historyKey(noteId));
      return raw ? (JSON.parse(raw) as Message[]) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastRequestId = useRef<number>(0);

  // Session-scoped: a conversation about a note is useful while the student is studying, but
  // shouldn't quietly persist on a shared school machine after they close the browser.
  useEffect(() => {
    try {
      sessionStorage.setItem(historyKey(noteId), JSON.stringify(messages.slice(-30)));
    } catch {
      // Never let a storage failure break the chat.
    }
  }, [messages, noteId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = useCallback(
    async (question: string, selection?: string, mode?: AskMode) => {
      const trimmed = question.trim();
      if (!trimmed || busy) return;

      const userMessage: Message = {
        id: `u${Date.now()}`,
        role: "user",
        text: trimmed,
        selection: selection || undefined,
      };
      // Snapshot the history *before* this turn — the backend wants prior context only.
      const history = messages
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.text || m.html || "" }))
        .filter((m) => m.content);

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setPendingSelection(null);
      setBusy(true);

      try {
        const res = await lessonNotesApi.askAboutShared(noteId, {
          question: trimmed,
          selection_text: selection,
          mode,
          history,
        });
        const answer: NoteAskAnswer = res.data.data;
        setMessages((prev) => [
          ...prev,
          {
            id: `a${Date.now()}`,
            role: "assistant",
            html: answer.answer_html,
            keyPoints: answer.key_points,
            followUps: answer.follow_ups,
            grounded: answer.grounded,
          },
        ]);
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          {
            id: `e${Date.now()}`,
            role: "assistant",
            text:
              err?.response?.data?.message ||
              "The study assistant could not answer that right now. Please try again in a moment.",
            error: true,
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, noteId],
  );

  // Requests arriving from the reader's selection toolbar / header buttons.
  useEffect(() => {
    if (!request || request.id === lastRequestId.current) return;
    lastRequestId.current = request.id;
    if (request.question) {
      send(request.question, request.selection, request.mode);
    } else if (request.selection) {
      // No question yet: park the quote above the composer and let the student type.
      setPendingSelection(request.selection);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input, pendingSelection || undefined);
    }
  };

  const lastUserTurn = useMemo(() => [...messages].reverse().find((m) => m.role === "user"), [messages]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop unless the panel is docked beside the page. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className={`fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40 ${docked === undefined ? "lg:hidden" : docked ? "hidden" : ""}`}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 260 }}
            className={`fixed ${offsetTop ? "top-16" : "top-0"} right-0 bottom-0 z-40 w-full sm:w-[420px] flex flex-col bg-white dark:bg-[#0b0d12] border-l border-gray-200 dark:border-white/[0.07] shadow-2xl`}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm flex-shrink-0">
                  <Sparkles className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 leading-tight">Study Assistant</p>
                  <p className="text-[11px] text-gray-400 truncate">
                    {subjectName} · answers from this note
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {messages.length > 0 && (
                  <button
                    onClick={() => setMessages([])}
                    title="Clear conversation"
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  aria-label="Close study assistant"
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Conversation */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 && !busy && (
                <div className="text-center py-6">
                  <div className="inline-flex p-3 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/30 mb-3">
                    <Bot className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    Ask me anything about this note
                  </p>
                  <p className="text-xs text-gray-400 mt-1 mb-4 px-4">
                    Highlight any sentence in "{noteTitle}" and I'll explain it — or start with one of these.
                  </p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {STARTERS.map((s) => (
                      <button
                        key={s.label}
                        onClick={() => send(s.question, undefined, s.mode)}
                        className="px-3 py-1.5 text-xs font-medium rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex flex-col items-end gap-1">
                    {m.selection && (
                      <div className="max-w-[92%] flex items-start gap-1.5 px-3 py-2 rounded-xl rounded-br-sm bg-amber-50 dark:bg-amber-900/20 border border-amber-200/70 dark:border-amber-800/40">
                        <Quote className="w-3 h-3 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                        <p className="text-[11px] text-amber-800 dark:text-amber-200 line-clamp-3 italic">
                          {m.selection}
                        </p>
                      </div>
                    )}
                    <div className="max-w-[92%] px-3.5 py-2.5 rounded-2xl rounded-br-sm bg-gradient-to-br from-blue-500 to-blue-600 text-white text-sm shadow-sm">
                      {m.text}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-2.5">
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        m.error
                          ? "bg-red-50 dark:bg-red-900/30 text-red-500"
                          : "bg-gradient-to-br from-blue-500 to-blue-600 text-white"
                      }`}
                    >
                      {m.error ? <AlertTriangle className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      {m.grounded === false && (
                        <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 mb-1.5">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                          This note doesn't fully cover that — check with your teacher.
                        </p>
                      )}
                      <div
                        className={`rounded-2xl rounded-tl-sm px-3.5 py-3 text-sm ${
                          m.error
                            ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300"
                            : "bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-200"
                        }`}
                      >
                        {m.html ? <AssistantBody html={m.html} /> : <p>{m.text}</p>}

                        {m.keyPoints && m.keyPoints.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-200/70 dark:border-gray-700/60">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                              Key points
                            </p>
                            <ul className="space-y-1">
                              {m.keyPoints.map((k, i) => (
                                <li key={i} className="flex gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                                  <span className="text-blue-500 flex-shrink-0">•</span>
                                  <span>{k}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {!m.error && (
                        <div className="flex items-center gap-1 mt-1.5">
                          <button
                            onClick={() => {
                              const el = document.createElement("div");
                              el.innerHTML = m.html || "";
                              navigator.clipboard?.writeText(m.text || el.textContent || "");
                            }}
                            title="Copy answer"
                            className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          {lastUserTurn && (
                            <button
                              onClick={() => send(lastUserTurn.text || "", lastUserTurn.selection)}
                              title="Ask again"
                              className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}

                      {m.followUps && m.followUps.length > 0 && !busy && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {m.followUps.map((f, i) => (
                            <button
                              key={i}
                              onClick={() => send(f)}
                              className="px-2.5 py-1 text-[11px] rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-left"
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ),
              )}

              {busy && (
                <div className="flex gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-3.5 h-3.5" />
                  </span>
                  <div className="flex items-center gap-2 px-3.5 py-3 rounded-2xl rounded-tl-sm bg-gray-50 dark:bg-gray-800/60 text-xs text-gray-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading the note...
                  </div>
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-gray-100 dark:border-gray-800 p-3 flex-shrink-0 bg-white dark:bg-gray-900">
              {pendingSelection && (
                <div className="flex items-start gap-1.5 mb-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/70 dark:border-amber-800/40">
                  <Quote className="w-3 h-3 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="flex-1 text-[11px] text-amber-800 dark:text-amber-200 line-clamp-2 italic">
                    {pendingSelection}
                  </p>
                  <button
                    onClick={() => setPendingSelection(null)}
                    aria-label="Remove quoted text"
                    className="text-amber-500 hover:text-amber-700 flex-shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <div className="relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={2}
                  maxLength={1000}
                  placeholder={pendingSelection ? "Ask about the highlighted text..." : "Ask anything about this note..."}
                  className="w-full resize-none pr-11 pl-3.5 py-2.5 text-sm rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
                />
                <button
                  onClick={() => send(input, pendingSelection || undefined)}
                  disabled={!input.trim() || busy}
                  aria-label="Send question"
                  className="absolute right-2 bottom-2.5 p-2 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUp className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="flex items-center gap-1 text-[10px] text-gray-400 mt-1.5 px-1">
                <CornerDownLeft className="w-2.5 h-2.5" /> Enter to send · AI answers can be imperfect — always
                double-check against the note.
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

export default NoteAIPanel;
