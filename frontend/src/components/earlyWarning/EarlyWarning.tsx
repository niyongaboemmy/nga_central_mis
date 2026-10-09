import UserAvatar from "../ui/UserAvatar";
import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, ClipboardList, Radar } from "lucide-react";
import { apiError } from "../../api/desktopTools";
import { ACTION_LABEL, SOURCE_LABEL, earlyWarningApi, type EwDetail, type EwList, type Level } from "../../api/earlyWarning";
import { Card, CardTitle, EmptyState, Muted, Spinner, inputCls, labelCls, primaryBtn, secondaryBtn } from "../officeHours/ohUi";
import Modal from "../ui/Modal";
import SelectField from "../ui/SelectField";
import { useToast } from "../../contexts/ToastContext";

const LEVEL_META: Record<Level, { label: string; cls: string }> = {
  at_risk: { label: "At risk", cls: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200" },
  watch: { label: "Watch", cls: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100" },
  none: { label: "On track", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200" },
};
const FILTERS: Array<[string, string]> = [
  ["any", "Everyone"],
  ["at_risk", "At risk"],
  ["watch", "Watch"],
];
const SIGNAL_LABEL: Record<string, string> = {
  absences_14d: "Lessons missed (2 weeks)",
  absences_prev_14d: "Lessons missed (2 weeks before)",
  lates_14d: "Late (2 weeks)",
  incidents_30d: "Discipline incidents (month)",
  discipline_points_30d: "Discipline points (month)",
  due_14d: "Work due (2 weeks)",
  missed_14d: "Work missed (2 weeks)",
  avg_pct_30d: "Average mark (month)",
  avg_pct_prev_30d: "Average mark (month before)",
  failed_30d: "Quizzes/tests failed (month)",
};

const Pill: React.FC<{ level: Level }> = ({ level }) => (
  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${LEVEL_META[level].cls}`}>{LEVEL_META[level].label}</span>
);

/**
 * Students who may need support, from attendance and discipline (Tendo),
 * work and marks (Task Mentor) and office hours (MIS), with the reasons, and
 * what staff are doing about it. Class teachers see their class; leaders see
 * their area.
 */
const EarlyWarning: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [level, setLevel] = useState("any");
  const [classGroupId, setClassGroupId] = useState<number | null>(null);
  const [data, setData] = useState<EwList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openId = Number(params.get("student")) || null;

  const load = useCallback(async () => {
    try {
      setData((await earlyWarningApi.list({ level, classGroupId })).data.data);
    } catch (e) {
      setError(apiError(e, "Couldn't load early warning."));
    }
  }, [level, classGroupId]);
  useEffect(() => {
    void load();
  }, [load]);

  const open = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("student", String(id));
    else next.delete("student");
    setParams(next, { replace: true });
  };

  if (error) return <div className="p-6"><EmptyState title="Early warning" body={error} /></div>;
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
          <Radar className="h-6 w-6 text-blue-600 dark:text-blue-400" aria-hidden /> Early warning
        </h1>
        <Muted className="mt-1">Students who may need support, from lessons missed, discipline, missed work and marks. Each flag says why, so you can act early and record what you did.</Muted>
      </header>

      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="ew-counts">
          {[
            ["At risk", data.counts.at_risk, "text-rose-700 dark:text-rose-300"],
            ["Watch", data.counts.watch, "text-amber-700 dark:text-amber-300"],
            ["On track", data.counts.none, "text-emerald-700 dark:text-emerald-300"],
            ["With recent data", data.counts.withSignals, "text-slate-900 dark:text-white"],
          ].map(([label, value, cls]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-700/50 dark:bg-gray-800/40">
              <p className="text-xs font-medium text-slate-600 dark:text-gray-300">{label}</p>
              <p className={`mt-1 text-2xl font-bold ${cls}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      <Card labelledBy="ew-list">
        <CardTitle
          id="ew-list"
          icon={<AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {data && data.classes.length > 1 && (
                <SelectField aria-label="Class" value={classGroupId ?? ""} onChange={(e) => setClassGroupId(Number(e.target.value) || null)} className="w-40">
                  <option value="">All classes</option>
                  {data.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectField>
              )}
              <div className="flex gap-1" role="tablist" aria-label="Filter by level">
                {FILTERS.map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={level === k} onClick={() => setLevel(k)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${level === k ? "bg-slate-900 text-white dark:bg-white dark:text-gray-900" : "text-slate-700 hover:bg-slate-100 dark:text-gray-200 dark:hover:bg-gray-700/50"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          Students
        </CardTitle>
        {!data ? (
          <Spinner label="Loading" />
        ) : data.students.length === 0 ? (
          <Muted>{level === "any" ? "No students in your area yet." : "Nobody here right now."}</Muted>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-gray-700/40" data-testid="ew-rows">
            {data.students.map((s) => (
              <li key={s.studentId}>
                <button type="button" onClick={() => open(s.studentId)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-3 text-left hover:bg-slate-50 dark:hover:bg-gray-800/50">
                  <Pill level={s.level} />
                  <UserAvatar decorative userId={s.studentId} name={s.name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900 dark:text-white">{s.name}{s.className ? ` · ${s.className}` : ""}</span>
                    <span className="block text-xs text-slate-600 dark:text-gray-300">
                      {s.reasons.length ? s.reasons.slice(0, 3).map((r) => r.text).join(" · ") : Object.keys(s.asOf).length ? "No concerns in the latest data" : "No data from Tendo or Task Mentor yet"}
                    </span>
                  </span>
                  {s.openInterventions > 0 && (
                    <span className="flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-300">
                      <ClipboardList className="h-3.5 w-3.5" aria-hidden /> {s.openInterventions} open{s.nextReview ? ` · review ${s.nextReview}` : ""}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {openId && <StudentDialog id={openId} onClose={() => open(null)} onChanged={() => void load()} />}
    </div>
  );
};

const StudentDialog: React.FC<{ id: number; onClose: () => void; onChanged: () => void }> = ({ id, onClose, onChanged }) => {
  const [d, setD] = useState<EwDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [action, setAction] = useState("talk_student");
  const [notes, setNotes] = useState("");
  const [review, setReview] = useState("");
  const [closing, setClosing] = useState<number | null>(null);
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    earlyWarningApi.student(id).then((r) => setD(r.data.data), (e) => setErr(apiError(e, "Couldn't open this student.")));
  }, [id]);

  const add = async () => {
    setBusy(true);
    try {
      setD((await earlyWarningApi.addIntervention(id, { action, notes: notes.trim() || undefined, reviewDate: review || undefined })).data.data);
      setNotes("");
      setReview("");
      showToast("Recorded.", "success");
      onChanged();
    } catch (e) {
      showToast(apiError(e, "Couldn't save."), "error");
    } finally {
      setBusy(false);
    }
  };
  const close = async (ivId: number) => {
    setBusy(true);
    try {
      setD((await earlyWarningApi.close(ivId, outcome)).data.data);
      setClosing(null);
      setOutcome("");
      onChanged();
    } catch (e) {
      showToast(apiError(e, "Couldn't save."), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={d ? `${d.name}${d.className ? ` · ${d.className}` : ""}` : "Student"} size="2xl">
      {err ? (
        <Muted>{err}</Muted>
      ) : !d ? (
        <Spinner label="Loading" />
      ) : (
        <div className="space-y-4" data-testid="ew-student">
          <div className="flex items-center gap-2">
            <Pill level={d.level} />
            <span className="text-sm text-slate-700 dark:text-gray-200">
              {(["tendo", "taskmentor"] as const).map((src) => (d.asOf[src] ? `${SOURCE_LABEL[src]} ${d.asOf[src]}` : null)).filter(Boolean).join(" · ") || "No recent data from Tendo or Task Mentor"}
            </span>
          </div>
          {d.reasons.length > 0 ? (
            <ul className="space-y-1">
              {d.reasons.map((r) => (
                <li key={r.text} className="flex items-start gap-2 text-sm text-slate-800 dark:text-gray-100">
                  <span className="mt-0.5 rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600 dark:bg-gray-700 dark:text-gray-200">{SOURCE_LABEL[r.source]}</span>
                  {r.text}
                </li>
              ))}
            </ul>
          ) : (
            <Muted>No concerns in the latest data.</Muted>
          )}

          <details className="rounded-xl border border-slate-200 p-3 text-sm dark:border-gray-700/50">
            <summary className="cursor-pointer font-semibold text-slate-800 dark:text-gray-100">The numbers</summary>
            <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {Object.entries({ ...(d.signals.tendo ?? {}), ...(d.signals.taskmentor ?? {}) })
                .filter(([, v]) => v !== null)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-slate-600 dark:text-gray-300">{SIGNAL_LABEL[k] ?? k}</dt>
                    <dd className="font-semibold text-slate-900 dark:text-white">{k.startsWith("avg_pct") ? `${Math.round(Number(v))}%` : v}</dd>
                  </div>
                ))}
              <div className="flex justify-between gap-2">
                <dt className="text-slate-600 dark:text-gray-300">Office hours missed (month)</dt>
                <dd className="font-semibold text-slate-900 dark:text-white">{d.officeHoursAbsent30d}</dd>
              </div>
            </dl>
          </details>

          <section aria-labelledby="ew-iv">
            <h3 id="ew-iv" className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">What is being done</h3>
            {d.interventions.length === 0 ? (
              <Muted>Nothing recorded yet.</Muted>
            ) : (
              <ul className="space-y-2">
                {d.interventions.map((iv) => (
                  <li key={iv.id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-gray-700/50">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-slate-900 dark:text-white">{ACTION_LABEL[iv.action] ?? iv.action}</strong>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${iv.status === "open" ? "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"}`}>{iv.status === "open" ? "Open" : "Done"}</span>
                      <span className="text-xs text-slate-600 dark:text-gray-300">{iv.owner}{iv.reviewDate && iv.status === "open" ? ` · review ${iv.reviewDate}` : ""}</span>
                    </div>
                    {iv.notes && <p className="mt-1 text-slate-700 dark:text-gray-200">{iv.notes}</p>}
                    {iv.outcome && <p className="mt-1 text-emerald-800 dark:text-emerald-200">Outcome: {iv.outcome}</p>}
                    {iv.status === "open" && (closing === iv.id ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <input aria-label="Outcome" className={`${inputCls} flex-1`} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="How did it go?" />
                        <button type="button" className={primaryBtn} disabled={busy || outcome.trim().length < 3} onClick={() => void close(iv.id)}>Mark done</button>
                      </div>
                    ) : (
                      <button type="button" className="mt-2 text-xs font-semibold text-blue-700 underline dark:text-blue-300" onClick={() => setClosing(iv.id)}>Record the outcome</button>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-gray-700/50">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="ew-action" className={labelCls}>Action</label>
                <SelectField id="ew-action" value={action} onChange={(e) => setAction(e.target.value)} className={inputCls}>
                  {Object.entries(ACTION_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </SelectField>
              </div>
              <div>
                <label htmlFor="ew-review" className={labelCls}>Review on (optional)</label>
                <input id="ew-review" type="date" className={inputCls} value={review} onChange={(e) => setReview(e.target.value)} />
              </div>
            </div>
            <div>
              <label htmlFor="ew-notes" className={labelCls}>Notes (optional)</label>
              <textarea id="ew-notes" className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className={secondaryBtn} onClick={onClose}>Close</button>
              <button type="button" className={primaryBtn} disabled={busy} onClick={() => void add()}>Record action</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default EarlyWarning;
