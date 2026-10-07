import React, { useEffect, useState } from "react";
import { HeartHandshake, LifeBuoy, Phone, ShieldCheck } from "lucide-react";
import { apiError } from "../../api/desktopTools";
import { safeguardingApi, type MyCheckIn } from "../../api/safeguarding";
import { Card, CardTitle, Muted, Spinner, inputCls, labelCls, primaryBtn } from "../officeHours/ohUi";
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

/** Scale of five buttons (radio group). */
const Scale: React.FC<{ label: string; value: number; onChange: (v: number) => void; labels: string[]; faces?: boolean }> = ({ label, value, onChange, labels, faces }) => (
  <fieldset>
    <legend className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">{label}</legend>
    <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={label}>
      {labels.map((l, i) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={value === i + 1}
          onClick={() => onChange(i + 1)}
          className={`flex flex-col items-center gap-1 rounded-2xl border px-1 py-2.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            value === i + 1
              ? "border-blue-600 bg-blue-50 text-blue-800 dark:border-blue-400 dark:bg-blue-500/15 dark:text-blue-100"
              : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-gray-700/50 dark:text-gray-200 dark:hover:bg-gray-800/60"
          }`}
        >
          {faces && <span className="text-2xl" aria-hidden>{MOODS[i]}</span>}
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
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
          <HeartHandshake className="h-6 w-6 text-rose-600 dark:text-rose-400" aria-hidden /> Wellbeing
        </h1>
        <Muted className="mt-1">How you feel matters. What you share here goes only to the school's safeguarding team (the counsellor and the people who look after students), never to your classmates.</Muted>
      </header>

      {state.applies && (
        <Card labelledBy="wb-checkin">
          <CardTitle id="wb-checkin" icon={<ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />}>This week's check-in</CardTitle>
          {state.done ? (
            <div data-testid="checkin-done">
              <p className="text-sm text-slate-800 dark:text-gray-100">
                Done for this week {state.checkIn ? <span aria-hidden>{MOODS[state.checkIn.mood - 1]}</span> : null}. Thank you! The next one opens on Monday.
              </p>
              {state.checkIn?.wantsTalk && <Muted className="mt-1">You asked to talk to someone: a member of staff will find you soon.</Muted>}
            </div>
          ) : (
            <div className="space-y-5">
              <Scale label="How have you been feeling this week?" value={mood} onChange={setMood} labels={MOOD_LABEL} faces />
              <Scale label="Do you feel safe at school?" value={safe} onChange={setSafe} labels={SAFE_LABEL} />
              <label className="flex items-center gap-3 text-sm text-slate-800 dark:text-gray-100">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={wantsTalk} onChange={(e) => setWantsTalk(e.target.checked)} />
                I'd like to talk to someone
              </label>
              <div>
                <label htmlFor="wb-comment" className={labelCls}>Anything else? (optional)</label>
                <textarea id="wb-comment" className={inputCls} rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
              <button type="button" className={primaryBtn} disabled={!mood || !safe || busy} onClick={() => void submit()}>
                Send my check-in
              </button>
            </div>
          )}
        </Card>
      )}

      <Card labelledBy="wb-help">
        <CardTitle id="wb-help" icon={<LifeBuoy className="h-5 w-5 text-rose-600 dark:text-rose-400" />}>Ask for help</CardTitle>
        {sent ? (
          <div role="status" data-testid="report-sent">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Thank you for telling us.</p>
            <Muted className="mt-1">Someone from the safeguarding team will talk to you soon. If you are in danger now, go to the nearest teacher.</Muted>
            <button type="button" className="mt-3 text-sm font-semibold text-blue-700 underline dark:text-blue-300" onClick={() => setSent(false)}>Tell us something else</button>
          </div>
        ) : (
          <div className="space-y-4">
            <Muted>Is something worrying you, or someone else? Tell us here. You can also talk to any teacher you trust.</Muted>
            <fieldset>
              <legend className={labelCls}>What is it about?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {REPORT_OPTIONS.map(([v, l]) => (
                  <label key={v} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${category === v ? "border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-500/15" : "border-slate-200 dark:border-gray-700/50"} text-slate-800 dark:text-gray-100`}>
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
            <button type="button" className={primaryBtn} disabled={!category || text.trim().length < 3 || busy} onClick={() => void report()}>
              Send to the safeguarding team
            </button>
          </div>
        )}
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:bg-rose-500/10 dark:text-rose-100">
          <Phone className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
          <span>Need to talk now? Call the free child helpline <strong>116</strong> at any time. In an emergency call <strong>112</strong>.</span>
        </p>
      </Card>
    </div>
  );
};

export default Wellbeing;
