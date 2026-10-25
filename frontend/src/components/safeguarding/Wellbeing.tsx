import React, { useEffect, useState } from "react";
import { HeartHandshake, LifeBuoy, Lock, MessageCircle } from "lucide-react";
import { apiError } from "../../api/desktopTools";
import { safeguardingApi, type MyCheckIn } from "../../api/safeguarding";
import { Muted, Spinner, inputCls, labelCls, primaryBtn } from "../officeHours/ohUi";
import { useToast } from "../../contexts/ToastContext";

const MOODS = ["😞", "🙁", "😐", "🙂", "😄"];
const MOOD_LABEL = ["Very bad", "Not good", "Okay", "Good", "Great"];
const SAFE_LABEL = ["Not at all", "Not really", "Sometimes", "Mostly", "Yes, always"];

const REPORT_OPTIONS: Array<[string, string]> = [
  ["bullying", "Bullying or someone being unkind"],
  ["unsafe", "I don't feel safe"],
  ["home", "Something at home"],
  ["health", "My health or how I feel"],
  ["someone_else", "I'm worried about someone else"],
  ["other", "Something else"],
];

const panel = "rounded-3xl border border-slate-200/70 bg-white p-6 shadow-sm sm:p-8 dark:border-gray-700/50 dark:bg-gray-900/40";

/** Scale of five buttons (radio group). With faces it's the big mood picker. */
const Scale: React.FC<{ label: string; value: number; onChange: (v: number) => void; labels: string[]; faces?: boolean }> = ({ label, value, onChange, labels, faces }) => (
  <fieldset>
    <legend className={`mb-3 font-semibold text-slate-900 dark:text-white ${faces ? "text-lg" : "text-base"}`}>{label}</legend>
    <div className="grid grid-cols-5 gap-2 sm:gap-3" role="radiogroup" aria-label={label}>
      {labels.map((l, i) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === i + 1}
          onClick={() => onChange(i + 1)}
          className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 px-1 font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            faces ? "py-4 sm:py-5 text-xs sm:text-sm" : "py-3 text-xs sm:text-sm"
          } ${
            value === i + 1
              ? "border-blue-600 bg-blue-50 text-blue-800 shadow-sm dark:border-blue-400 dark:bg-blue-500/15 dark:text-blue-100"
              : "border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-slate-50 dark:border-gray-700/50 dark:text-gray-200 dark:hover:bg-gray-800/60"
          }`}
        >
          {faces && (
            <span className={`text-3xl sm:text-4xl transition-transform ${value === i + 1 ? "scale-110" : ""}`} aria-hidden>
              {MOODS[i]}
            </span>
          )}
          <span className="text-center leading-tight">{l}</span>
        </button>
      ))}
    </div>
  </fieldset>
);

/**
 * For students: the weekly check-in (two questions, about 20 seconds) and
 * "Ask for help". Both reach only the school's safeguarding team.
 */
const Wellbeing: React.FC = () => {
  const [state, setState] = useState<MyCheckIn | null>(null);
  const [mood, setMood] = useState(0);
  const [safe, setSafe] = useState(0);
  const [wantsTalk, setWantsTalk] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("");
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    safeguardingApi.checkIn().then((r) => setState(r.data.data), () => setState({ applies: false }));
  }, []);

  const submit = async () => {
    setBusy(true);
    try {
      setState((await safeguardingApi.submitCheckIn({ mood, safe, wantsTalk, comment: comment.trim() || undefined })).data.data);
      showToast("Thank you for checking in.", "success");
    } catch (e) {
      showToast(apiError(e, "It couldn't be saved. Try again."), "error");
    } finally {
      setBusy(false);
    }
  };
  const report = async () => {
    setBusy(true);
    try {
      await safeguardingApi.report({ category, text: text.trim() });
      setSent(true);
      setText("");
      setCategory("");
    } catch (e) {
      showToast(apiError(e, "It couldn't be sent. Please talk to a teacher you trust."), "error");
    } finally {
      setBusy(false);
    }
  };

  if (!state) return <div className="p-6"><Spinner label="Loading" /></div>;
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
          <HeartHandshake className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">Wellbeing</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600 dark:text-gray-300">
            <Lock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
            Only the school's safeguarding team sees what you share here, never your classmates.
          </p>
        </div>
      </header>

      <div className={`grid items-start gap-6 ${state.applies ? "lg:grid-cols-5" : ""}`}>
        {state.applies && (
          <section aria-labelledby="wb-checkin" className={`${panel} lg:col-span-3`}>
            <p id="wb-checkin" className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
              This week's check-in
            </p>
            {state.done ? (
              <div data-testid="checkin-done" className="flex flex-col items-center py-8 text-center">
                {state.checkIn && (
                  <span className="text-7xl" aria-hidden>
                    {MOODS[state.checkIn.mood - 1]}
                  </span>
                )}
                <h2 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">Thanks for checking in</h2>
                {state.checkIn && (
                  <p className="mt-1 text-slate-600 dark:text-gray-300">
                    You said you're feeling <strong className="text-slate-900 dark:text-white">{MOOD_LABEL[state.checkIn.mood - 1].toLowerCase()}</strong> this week.
                  </p>
                )}
                <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">Done for this week. The next one opens on Monday.</p>
                {state.checkIn?.wantsTalk && (
                  <p className="mt-5 flex items-center gap-2 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:bg-blue-500/15 dark:text-blue-100">
                    <MessageCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
                    You asked to talk to someone: a member of staff will find you soon.
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-2 space-y-7">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">How are you doing?</h2>
                  <Muted className="mt-1">Two quick questions. It takes about 20 seconds.</Muted>
                </div>
                <Scale label="How have you been feeling this week?" value={mood} onChange={setMood} labels={MOOD_LABEL} faces />
                <Scale label="Do you feel safe at school?" value={safe} onChange={setSafe} labels={SAFE_LABEL} />
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 text-sm font-medium transition ${
                    wantsTalk
                      ? "border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-500/15 dark:text-blue-100"
                      : "border-slate-200 text-slate-800 hover:bg-slate-50 dark:border-gray-700/50 dark:text-gray-100 dark:hover:bg-gray-800/60"
                  }`}
                >
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={wantsTalk} onChange={(e) => setWantsTalk(e.target.checked)} />
                  I'd like to talk to someone
                </label>
                <div>
                  <label htmlFor="wb-comment" className={labelCls}>Anything else? (optional)</label>
                  <textarea id="wb-comment" className={inputCls} rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
                </div>
                <button type="button" className={`${primaryBtn} w-full py-3 text-base sm:w-auto sm:px-8`} disabled={!mood || !safe || busy} onClick={() => void submit()}>
                  Send my check-in
                </button>
              </div>
            )}
          </section>
        )}

        <section aria-labelledby="wb-help" className={`${panel} ${state.applies ? "lg:col-span-2" : ""}`}>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
              <LifeBuoy className="h-5 w-5" aria-hidden />
            </span>
            <h2 id="wb-help" className="text-xl font-bold text-slate-900 dark:text-white">Ask for help</h2>
          </div>
          {sent ? (
            <div role="status" data-testid="report-sent" className="mt-5">
              <p className="text-base font-semibold text-slate-900 dark:text-white">Thank you for telling us.</p>
              <Muted className="mt-1">Someone from the safeguarding team will talk to you soon. If you are in danger now, go to the nearest teacher.</Muted>
              <button type="button" className="mt-4 text-sm font-semibold text-blue-700 underline dark:text-blue-300" onClick={() => setSent(false)}>Tell us something else</button>
            </div>
          ) : (
            <div className="mt-4 space-y-5">
              <Muted>Is something worrying you, or someone else? Tell us here. You can also talk to any teacher you trust.</Muted>
              <fieldset>
                <legend className={labelCls}>What is it about?</legend>
                <div className={`mt-1 grid gap-2 ${state.applies ? "" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
                  {REPORT_OPTIONS.map(([v, l]) => (
                    <label
                      key={v}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-2.5 text-sm transition ${
                        category === v
                          ? "border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-500/15 dark:text-blue-100"
                          : "border-slate-200 text-slate-800 hover:bg-slate-50 dark:border-gray-700/50 dark:text-gray-100 dark:hover:bg-gray-800/60"
                      }`}
                    >
                      <input type="radio" name="wb-cat" value={v} checked={category === v} onChange={() => setCategory(v)} />
                      {l}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <label htmlFor="wb-text" className={labelCls}>What is happening?</label>
                <textarea id="wb-text" className={inputCls} rows={4} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} />
              </div>
              <button type="button" className={`${primaryBtn} w-full py-3`} disabled={!category || text.trim().length < 3 || busy} onClick={() => void report()}>
                Send to the safeguarding team
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Wellbeing;
