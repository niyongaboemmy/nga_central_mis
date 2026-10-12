import React, { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { apiError } from "../../api/desktopTools";
import { myCompetencesApi, type CompState, type MyCompetences as MyData, type MySubject } from "../../api/competency";
import { EmptyState, Muted, Spinner } from "../officeHours/ohUi";

/** Plain words for students and parents. */
export const PLAIN: Record<CompState, { label: string; cls: string; dot: string }> = {
  DEMONSTRATED: { label: "Shown", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200", dot: "bg-emerald-500 dark:bg-emerald-400" },
  COVERED: { label: "Practising", cls: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100", dot: "bg-amber-400 dark:bg-amber-300" },
  NOT_COVERED: { label: "Not yet", cls: "bg-slate-100 text-slate-700 dark:bg-gray-700/60 dark:text-gray-200", dot: "bg-slate-300 dark:bg-gray-600" },
};
const KIND: Record<string, string> = { quiz: "Quiz", assignment: "Assignment", elearning: "E-learning" };

/** One subject: progress bar, then each learning outcome with its criteria and the work behind them. */
export const SubjectCompetences: React.FC<{ subject: MySubject; open?: boolean }> = ({ subject, open = false }) => {
  const pct = (n: number) => (subject.total ? Math.round((n / subject.total) * 100) : 0);
  return (
    <details open={open} className="group rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-700/50 dark:bg-gray-800/40" data-testid="comp-subject">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {subject.color && <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: subject.color }} aria-hidden />}
            {subject.name}
          </h2>
          <span className="text-sm text-slate-700 dark:text-gray-200">
            <strong>{subject.demonstrated}</strong> of {subject.total} shown{subject.assessed > subject.demonstrated ? `, ${subject.assessed - subject.demonstrated} practising` : ""}
          </span>
        </div>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-gray-700" role="img" aria-label={`${pct(subject.demonstrated)}% shown, ${pct(subject.assessed - subject.demonstrated)}% practising`}>
          <span className="bg-emerald-500 dark:bg-emerald-400" style={{ width: `${pct(subject.demonstrated)}%` }} />
          <span className="bg-amber-400 dark:bg-amber-300" style={{ width: `${pct(subject.assessed - subject.demonstrated)}%` }} />
        </div>
      </summary>
      <div className="mt-4 space-y-4">
        {subject.outcomes.map((o) => (
          <section key={o.competency_id}>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">LO{o.element_number} {o.title}</h3>
            <ul className="mt-2 space-y-2">
              {o.criteria.map((c) => (
                <li key={c.criteria_id} className="rounded-xl bg-slate-50 p-3 dark:bg-gray-900/40">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm text-slate-800 dark:text-gray-100"><span className="font-semibold tabular-nums">{c.criteria_number}</span> {c.description}</p>
                    <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${PLAIN[c.state].cls}`}>{PLAIN[c.state].label}</span>
                  </div>
                  {c.evidence.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-600 dark:text-gray-300">
                      {c.evidence.map((e, i) => (
                        <li key={`${e.kind}-${e.ref}-${i}`}>
                          {KIND[e.kind] ?? e.kind}: {e.title}
                          {e.score_pct !== null ? ` · ${Math.round(e.score_pct)}%` : ""}
                          {e.at ? ` · ${e.at.slice(0, 10)}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
};

/** The signed-in student's own competences across their subjects. */
const MyCompetences: React.FC = () => {
  const [data, setData] = useState<MyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    myCompetencesApi
      .me()
      .then((r) => setData(r.data.data))
      .catch((e) => setError(apiError(e, "Couldn't load your competences.")));
  }, []);

  if (error) return <div className="p-6"><EmptyState title="My competences" body={error} /></div>;
  if (!data) return <div className="p-6"><Spinner label="Loading your competences" /></div>;
  const total = data.subjects.reduce((n, s) => n + s.total, 0);
  const shown = data.subjects.reduce((n, s) => n + s.demonstrated, 0);
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
          <Target className="h-6 w-6 text-blue-600 dark:text-blue-400" aria-hidden /> My competences
        </h1>
        <Muted className="mt-1">
          What you can already show in each subject's learning outcomes. Score {data.competent_pct}% or more on a quiz or assignment linked to a skill to show it; lower marks mean you're still practising.
        </Muted>
      </header>
      <ul className="flex flex-wrap gap-3 text-xs text-slate-700 dark:text-gray-200" aria-label="Legend">
        {(Object.keys(PLAIN) as CompState[]).map((k) => (
          <li key={k} className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded-full ${PLAIN[k].dot}`} aria-hidden />{PLAIN[k].label}</li>
        ))}
      </ul>
      {!data.subjects.length ? (
        <EmptyState title="Nothing to show yet" body="Your subjects don't have learning outcomes in the system yet, or you aren't enrolled in a subject this year." />
      ) : (
        <>
          <p className="text-sm text-slate-700 dark:text-gray-200" data-testid="comp-overall"><strong>{shown}</strong> of {total} skills shown across {data.subjects.length} subject{data.subjects.length === 1 ? "" : "s"}.</p>
          <div className="space-y-3">
            {data.subjects.map((s, i) => <SubjectCompetences key={s.subject_id} subject={s} open={i === 0} />)}
          </div>
        </>
      )}
    </div>
  );
};

export default MyCompetences;
