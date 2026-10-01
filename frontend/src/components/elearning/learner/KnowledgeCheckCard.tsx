import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, RotateCcw, X } from "lucide-react";
import { apiService } from "../../../services/api";
import { useMotion } from "../../../design/motion";
import { copy } from "../copy";
import Mascot from "../ui/Mascot";

export interface CheckQuestion {
  id: string;
  type: "MCQ" | "TRUE_FALSE";
  prompt: string;
  options: string[];
}

interface Props {
  itemId: number;
  questions: CheckQuestion[];
  onResult?: (r: { score_pct: number; passed: boolean; just_completed: boolean }) => void;
}

interface Feedback {
  correct: boolean;
  explanation: string;
  correct_index: number;
}

/**
 * Inline MCQ / true-false check (Brilliant pattern): instant, kind feedback with an
 * explanation; wrong → gentle shake + retry; unlimited attempts; keyboard 1-4.
 */
const KnowledgeCheckCard: React.FC<Props> = ({ itemId, questions, onResult }) => {
  const m = useMotion();
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [checking, setChecking] = useState(false);
  const [finished, setFinished] = useState<{ score: number; total: number; score_pct: number } | null>(null);
  const [wrongTick, setWrongTick] = useState(0);

  const q = questions[index];

  const check = useCallback(async () => {
    if (chosen === null || !q || checking) return;
    setChecking(true);
    try {
      const res = await apiService.post(`/elearning/my/items/${itemId}/knowledge-check/check`, { question_id: q.id, answer_index: chosen });
      const fb: Feedback = res.data.data;
      setFeedback(fb);
      if (!fb.correct) setWrongTick((t) => t + 1);
      else setAnswers((a) => ({ ...a, [q.id]: chosen }));
    } finally {
      setChecking(false);
    }
  }, [chosen, q, checking, itemId]);

  const next = useCallback(async () => {
    setChosen(null);
    setFeedback(null);
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      return;
    }
    // Submit the attempt: every question answered correctly at least once counts.
    const res = await apiService.post(`/elearning/my/items/${itemId}/knowledge-check`, { answers });
    const d = res.data.data;
    setFinished({ score: d.correct, total: d.total, score_pct: d.score_pct });
    onResult?.({ score_pct: d.score_pct, passed: d.passed, just_completed: d.just_completed });
  }, [index, questions.length, itemId, answers, onResult]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (!q || finished) return;
      const n = Number(e.key);
      if (n >= 1 && n <= q.options.length && !feedback) setChosen(n - 1);
      if (e.key === "Enter") {
        if (feedback?.correct) next();
        else if (feedback && !feedback.correct) {
          setFeedback(null);
        } else check();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, feedback, finished, check, next]);

  if (questions.length === 0) return <p className="text-sm text-gray-500">This check has no questions yet.</p>;

  if (finished) {
    const perfect = finished.score === finished.total;
    return (
      <motion.div {...m("reveal")} className="el-card p-6 flex flex-col items-center text-center">
        <Mascot pose={perfect ? "cheering" : "nudge"} size={64} />
        <p className="mt-3 text-base font-semibold text-gray-800 dark:text-gray-100">{copy.check.finished(finished.score, finished.total)}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{finished.score_pct}%</p>
        <button
          onClick={() => {
            setFinished(null);
            setIndex(0);
            setAnswers({});
          }}
          className="mt-4 inline-flex items-center gap-1.5 min-h-[44px] px-5 rounded-pill el-chip hover:bg-gray-200 dark:hover:bg-white/[0.10] text-sm font-medium text-gray-700 dark:text-gray-200"
        >
          <RotateCcw className="w-4 h-4" /> {copy.check.retake}
        </button>
      </motion.div>
    );
  }

  return (
    <div className="el-card p-5 sm:p-6">
      {/* Where you are in the check: words for the screen reader, a segment per question for the eye. */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
          Question {index + 1} of {questions.length}
        </p>
        <span className="flex gap-1" aria-hidden>
          {questions.map((qq, i) => (
            <span key={qq.id ?? i} className={`h-1.5 rounded-full transition-all ${i < index ? "w-4 bg-success-500" : i === index ? "w-6 bg-brand-600 dark:bg-brand-200" : "w-2 bg-gray-200 dark:bg-white/15"}`} />
          ))}
        </span>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={q.id} {...m("reveal")}>
          <p className="mt-3 text-base font-medium text-gray-900 dark:text-white leading-snug">{q.prompt}</p>
          <motion.div key={wrongTick} {...(feedback && !feedback.correct ? m("shake") : {})} className="mt-4 space-y-2" role="radiogroup" aria-label="Answer options">
            {q.options.map((opt, i) => {
              const selected = chosen === i;
              const showCorrect = feedback?.correct && selected;
              const showWrong = feedback && !feedback.correct && selected;
              return (
                <div key={i}>
                  <button
                    role="radio"
                    aria-checked={selected}
                    disabled={!!feedback?.correct}
                    onClick={() => {
                      setChosen(i);
                      if (feedback && !feedback.correct) setFeedback(null);
                    }}
                    className={`w-full flex items-center gap-3 text-left min-h-[48px] px-4 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus-visible:shadow-glow ${
                      showCorrect
                        ? "border-success-500 el-chip-success"
                        : showWrong
                          ? "border-warning-500 el-chip-warning"
                          : selected
                            ? "border-brand-500 el-chip-brand text-gray-900 dark:text-white"
                            : "border-gray-200 dark:border-white/10 text-gray-800 dark:text-gray-100 hover:border-brand-200 dark:hover:border-brand-700"
                    }`}
                  >
                    <span className="w-6 h-6 rounded-md el-chip text-[11px] font-semibold flex items-center justify-center flex-shrink-0 tabular-nums" aria-hidden>
                      {showCorrect ? <Check className="w-3.5 h-3.5" /> : showWrong ? <X className="w-3.5 h-3.5" /> : i + 1}
                    </span>
                    <span>{opt}</span>
                  </button>
                </div>
              );
            })}
          </motion.div>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {feedback && (
          <motion.p
            {...m("reveal")}
            className={`mt-4 text-sm ${feedback.correct ? "text-success-700 dark:text-success-500" : "text-warning-700 dark:text-warning-500"}`}
            aria-live="polite"
          >
            {feedback.correct
              ? feedback.explanation
                ? copy.check.correctWhy(feedback.explanation)
                : copy.check.correct
              : feedback.explanation
                ? copy.check.wrongHint(feedback.explanation)
                : copy.check.wrong}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="mt-5 flex items-center justify-end gap-3">
        <p className="hidden lg:block mr-auto text-xs text-slate-600 dark:text-slate-300">
          Press <kbd className="px-1 rounded el-chip font-mono">1</kbd>–<kbd className="px-1 rounded el-chip font-mono">{q.options.length}</kbd> to choose, <kbd className="px-1 rounded el-chip font-mono">Enter</kbd> to check
        </p>
        {feedback?.correct ? (
          <motion.button {...m("tap")} onClick={next} className="w-full sm:w-auto min-h-[48px] sm:min-h-[44px] px-5 rounded-pill bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold shadow-soft focus:outline-none focus-visible:shadow-glow">
            {index + 1 < questions.length ? copy.check.nextQuestion : copy.course.done}
          </motion.button>
        ) : (
          <motion.button
            {...m("tap")}
            onClick={check}
            disabled={chosen === null || checking}
            className="w-full sm:w-auto min-h-[48px] sm:min-h-[44px] px-5 rounded-pill bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold shadow-soft disabled:opacity-50 focus:outline-none focus-visible:shadow-glow"
          >
            {feedback && !feedback.correct ? copy.check.tryAgain : copy.check.submit}
          </motion.button>
        )}
      </div>
    </div>
  );
};

export default KnowledgeCheckCard;
