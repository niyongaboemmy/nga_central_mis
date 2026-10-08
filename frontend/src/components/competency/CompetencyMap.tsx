import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Grid3x3, Lightbulb } from "lucide-react";
import { apiError } from "../../api/desktopTools";
import { competencyApi, type CompMap, type CompOptions, type CompState, type CompStudentDetail } from "../../api/competency";
import { Card, CardTitle, EmptyState, Muted, Spinner, labelCls } from "../officeHours/ohUi";
import Modal from "../ui/Modal";
import SelectField from "../ui/SelectField";

export const STATE_META: Record<CompState, { label: string; cell: string; pill: string }> = {
  DEMONSTRATED: {
    label: "Demonstrated",
    cell: "bg-emerald-500 dark:bg-emerald-400",
    pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  },
  COVERED: {
    label: "Working towards",
    cell: "bg-amber-400 dark:bg-amber-300",
    pill: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100",
  },
  NOT_COVERED: {
    label: "Not assessed yet",
    cell: "bg-slate-200 dark:bg-gray-700",
    pill: "bg-slate-100 text-slate-700 dark:bg-gray-700/60 dark:text-gray-200",
  },
};
const KIND_LABEL: Record<string, string> = { quiz: "Task Mentor quiz", assignment: "Task Mentor assignment", elearning: "E-learning" };

const StatePill: React.FC<{ state: CompState }> = ({ state }) => (
  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATE_META[state].pill}`}>{STATE_META[state].label}</span>
);

/**
 * Where each student stands on the subject's learning outcomes, from Task Mentor
 * work tagged with them and e-learning items aligned to them. Subject teachers see
 * the classes they teach; e-learning oversight sees every class.
 */
const CompetencyMap: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [options, setOptions] = useState<CompOptions | null>(null);
  const [map, setMap] = useState<CompMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const subjectId = Number(params.get("subject")) || 0;
  const classGroupId = Number(params.get("class")) || 0;
  const openId = Number(params.get("student")) || 0;

  const set = (patch: Record<string, number | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, String(v));
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  useEffect(() => {
    competencyApi
      .options()
      .then((r) => setOptions(r.data.data))
      .catch((e) => setError(apiError(e, "Couldn't load your subjects.")));
  }, []);

  // Pick the first subject/class the viewer has, once options arrive.
  useEffect(() => {
    if (!options?.subjects.length) return;
    const subject = options.subjects.find((s) => s.subject_id === subjectId) ?? options.subjects[0];
    const klass = subject.classes.find((c) => c.class_group_id === classGroupId) ?? subject.classes[0];
    if (subject.subject_id !== subjectId || klass?.class_group_id !== classGroupId) set({ subject: subject.subject_id, class: klass?.class_group_id ?? null, student: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, subjectId, classGroupId]);

  useEffect(() => {
    if (!subjectId || !classGroupId) return;
    let live = true;
    setLoading(true);
    competencyApi
      .map(subjectId, classGroupId)
      .then((r) => live && setMap(r.data.data))
      .catch((e) => live && setError(apiError(e, "Couldn't load the competency map.")))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [subjectId, classGroupId]);

  const subject = options?.subjects.find((s) => s.subject_id === subjectId);
  const criteria = useMemo(() => map?.outcomes.flatMap((o) => o.criteria) ?? [], [map]);
  const cells = (map?.students.length ?? 0) * criteria.length;
  const demonstratedCells = map?.students.reduce((n, s) => n + s.demonstrated, 0) ?? 0;
  const assessedCells = map?.students.reduce((n, s) => n + s.assessed, 0) ?? 0;
  const gaps = criteria.filter((c) => !c.tasks && !c.elearning_items);

  if (error) return <div className="p-6"><EmptyState title="Competency map" body={error} /></div>;
  if (!options) return <div className="p-6"><Spinner label="Loading your subjects" /></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
          <Grid3x3 className="h-6 w-6 text-blue-600 dark:text-blue-400" aria-hidden /> Competency map
        </h1>
        <Muted className="mt-1">
          Where each student stands on the subject's learning outcomes, from Task Mentor quizzes and assignments tagged with them and from e-learning work.
          A score of {map?.competent_pct ?? 70}% or more demonstrates a criterion.
        </Muted>
      </header>

      {!options.subjects.length ? (
        <EmptyState title="No classes to show" body="The competency map shows the subjects you teach this year. You aren't assigned to teach any subject yet." />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-72">
              <label className={labelCls} htmlFor="comp-subject">Subject</label>
              <SelectField id="comp-subject" value={subjectId || ""} onChange={(e) => set({ subject: Number(e.target.value), class: null, student: null })}>
                {options.subjects.map((s) => <option key={s.subject_id} value={s.subject_id}>{s.code ? `${s.code} · ${s.name}` : s.name}</option>)}
              </SelectField>
            </div>
            <div className="w-full sm:w-56">
              <label className={labelCls} htmlFor="comp-class">Class</label>
              <SelectField id="comp-class" value={classGroupId || ""} onChange={(e) => set({ class: Number(e.target.value), student: null })}>
                {(subject?.classes ?? []).map((c) => <option key={c.class_group_id} value={c.class_group_id}>{c.name}</option>)}
              </SelectField>
            </div>
            <ul className="flex flex-wrap gap-3 text-xs text-slate-700 dark:text-gray-200 sm:ml-auto" aria-label="Legend">
              {(Object.keys(STATE_META) as CompState[]).map((k) => (
                <li key={k} className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded ${STATE_META[k].cell}`} aria-hidden />{STATE_META[k].label}</li>
              ))}
            </ul>
          </div>

          {loading && !map ? (
            <Spinner label="Loading the map" />
          ) : map && !criteria.length ? (
            <EmptyState title="No learning outcomes yet" body={`${map.subject.name} has no learning outcomes in its curriculum yet. Add or import them under Curriculum, then tag work with them.`} />
          ) : map ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="comp-summary">
                {[
                  ["Students", String(map.students.length)],
                  ["Criteria with evidence", `${map.criteria_total - map.criteria_without_evidence} of ${map.criteria_total}`],
                  ["Demonstrated", cells ? `${Math.round((demonstratedCells / cells) * 100)}%` : "0%"],
                  ["Assessed so far", cells ? `${Math.round((assessedCells / cells) * 100)}%` : "0%"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-700/50 dark:bg-gray-800/40">
                    <p className="text-xs font-medium text-slate-600 dark:text-gray-300">{label}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
                  </div>
                ))}
              </div>

              <Card labelledBy="comp-grid">
                <CardTitle id="comp-grid">{map.subject.name} · {map.class_group.name}</CardTitle>
                {!map.students.length ? (
                  <Muted>No students in this class take this subject this year.</Muted>
                ) : (
                  <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                    <table className="border-separate border-spacing-0 text-sm" data-testid="comp-table">
                      <thead>
                        <tr>
                          <th scope="col" rowSpan={2} className="sticky left-0 z-10 min-w-[11rem] bg-white pb-2 pr-3 text-left align-bottom text-xs font-semibold text-slate-600 dark:bg-gray-900 dark:text-gray-300">Student</th>
                          {map.outcomes.map((o) => (
                            <th key={o.competency_id} scope="colgroup" colSpan={o.criteria.length} title={o.title}
                              className="max-w-[1px] truncate border-l border-slate-200 px-1 pb-1 text-left text-xs font-semibold text-slate-800 dark:border-gray-700 dark:text-gray-100">
                              LO{o.element_number} {o.title}
                            </th>
                          ))}
                        </tr>
                        <tr>
                          {map.outcomes.map((o) =>
                            o.criteria.map((c, i) => (
                              <th key={c.criteria_id} scope="col" title={`${c.criteria_number} ${c.description}\n${c.demonstrated_pct}% demonstrated · ${c.tasks} tagged task(s), ${c.elearning_items} e-learning item(s)`}
                                className={`px-0.5 pb-2 text-center text-[10px] font-medium tabular-nums text-slate-600 dark:text-gray-300 ${i === 0 ? "border-l border-slate-200 dark:border-gray-700" : ""}`}>
                                <span className="block">{c.criteria_number}</span>
                                <span className={`block font-semibold ${c.tasks || c.elearning_items ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-gray-500"}`}>{c.demonstrated_pct}%</span>
                              </th>
                            )),
                          )}
                        </tr>
                      </thead>
                      <tbody data-testid="comp-rows">
                        {map.students.map((s) => (
                          <tr key={s.user_id}>
                            <th scope="row" className="sticky left-0 z-10 bg-white py-0.5 pr-3 text-left font-normal dark:bg-gray-900">
                              <button type="button" onClick={() => set({ student: s.user_id })} className="text-left text-slate-900 hover:underline dark:text-white">
                                {s.name}
                              </button>
                              <span className="block text-[11px] text-slate-500 dark:text-gray-400">{s.demonstrated} of {criteria.length} demonstrated</span>
                            </th>
                            {map.outcomes.map((o) =>
                              o.criteria.map((c, i) => {
                                const st = s.states[c.criteria_id] ?? "NOT_COVERED";
                                const best = s.best[c.criteria_id];
                                return (
                                  <td key={c.criteria_id} className={`px-0.5 py-0.5 ${i === 0 ? "border-l border-slate-200 dark:border-gray-700" : ""}`}>
                                    <button type="button" onClick={() => set({ student: s.user_id })} data-state={st}
                                      aria-label={`${s.name}, ${c.criteria_number}: ${STATE_META[st].label}${best !== null && best !== undefined ? ` (best ${Math.round(best)}%)` : ""}`}
                                      title={`${c.criteria_number}: ${STATE_META[st].label}${best !== null && best !== undefined ? ` · best ${Math.round(best)}%` : ""}`}
                                      className={`block h-6 w-7 rounded ${STATE_META[st].cell} focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`} />
                                  </td>
                                );
                              }),
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {gaps.length > 0 && (
                <Card labelledBy="comp-gaps">
                  <CardTitle id="comp-gaps" icon={<Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400" />}>
                    {gaps.length} criteri{gaps.length === 1 ? "on has" : "a have"} no evidence yet
                  </CardTitle>
                  <Muted>Tag a Task Mentor quiz or assignment with these learning outcomes (Learning outcomes on the quiz or assignment page), or align an e-learning item to them.</Muted>
                  <ul className="mt-3 grid gap-1 text-sm text-slate-800 dark:text-gray-100 sm:grid-cols-2" data-testid="comp-gaps-list">
                    {gaps.map((c) => (
                      <li key={c.criteria_id}><span className="font-semibold tabular-nums">{c.criteria_number}</span> {c.description}</li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          ) : null}
        </>
      )}

      {openId > 0 && subjectId > 0 && classGroupId > 0 && (
        <StudentEvidence id={openId} subjectId={subjectId} classGroupId={classGroupId} onClose={() => set({ student: null })} />
      )}
    </div>
  );
};

const StudentEvidence: React.FC<{ id: number; subjectId: number; classGroupId: number; onClose: () => void }> = ({ id, subjectId, classGroupId, onClose }) => {
  const [d, setD] = useState<CompStudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    competencyApi
      .student(id, subjectId, classGroupId)
      .then((r) => setD(r.data.data))
      .catch((e) => setError(apiError(e, "Couldn't load this student's evidence.")));
  }, [id, subjectId, classGroupId]);
  return (
    <Modal isOpen onClose={onClose} title={d ? d.student.name : "Student"} size="2xl">
      <div data-testid="comp-student" className="space-y-4">
        {error ? <Muted>{error}</Muted> : !d ? <Spinner /> : d.outcomes.map((o) => (
          <section key={o.competency_id}>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">LO{o.element_number} {o.title}</h3>
            <ul className="mt-2 space-y-2">
              {o.criteria.map((c) => (
                <li key={c.criteria_id} className="rounded-xl border border-slate-200 p-3 dark:border-gray-700">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm text-slate-800 dark:text-gray-100"><span className="font-semibold tabular-nums">{c.criteria_number}</span> {c.description}</p>
                    <StatePill state={c.state} />
                  </div>
                  {c.evidence.length ? (
                    <ul className="mt-2 space-y-1 text-xs text-slate-700 dark:text-gray-200">
                      {c.evidence.map((e, i) => (
                        <li key={`${e.kind}-${e.ref}-${i}`} className="flex flex-wrap gap-x-2">
                          <span className="font-medium">{e.title}</span>
                          <span className="text-slate-500 dark:text-gray-400">{KIND_LABEL[e.kind] ?? e.kind}</span>
                          {e.score_pct !== null && <span className="tabular-nums">{Math.round(e.score_pct)}%</span>}
                          {e.at && <span className="text-slate-500 dark:text-gray-400">{e.at.slice(0, 10)}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">No evidence yet.</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
};

export default CompetencyMap;
