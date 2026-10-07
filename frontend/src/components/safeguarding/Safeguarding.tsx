import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, ShieldAlert, Users } from "lucide-react";
import { apiError } from "../../api/desktopTools";
import {
  CATEGORY_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  safeguardingApi,
  type Concern,
  type ConcernRow,
  type ConcernStatus,
  type SafeguardingSummary,
  type Severity,
} from "../../api/safeguarding";
import { Card, CardTitle, EmptyState, Muted, Spinner, inputCls, labelCls, primaryBtn, secondaryBtn } from "../officeHours/ohUi";
import Modal from "../ui/Modal";
import SelectField from "../ui/SelectField";
import { useToast } from "../../contexts/ToastContext";

const SEVERITY_CLS: Record<Severity, string> = {
  high: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200",
  medium: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100",
  low: "bg-slate-100 text-slate-700 dark:bg-gray-700/50 dark:text-gray-200",
};
const STATUS_CLS: Record<ConcernStatus, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200",
  acknowledged: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200",
  in_progress: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100",
  closed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
};
const FILTERS: Array<[string, string]> = [
  ["open", "Open"],
  ["new", "New"],
  ["in_progress", "In progress"],
  ["closed", "Closed"],
  ["all", "All"],
];

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
const Pill: React.FC<React.PropsWithChildren<{ cls: string }>> = ({ cls, children }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>
);

/**
 * The safeguarding team's queue (SAFEGUARDING_MANAGE): concerns from the AI
 * Tutor, weekly check-ins, students' own reports and staff. Every concern view
 * is recorded in the audit log.
 */
const Safeguarding: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("open");
  const [rows, setRows] = useState<ConcernRow[] | null>(null);
  const [summary, setSummary] = useState<SafeguardingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openId = Number(params.get("concern")) || null;

  const load = useCallback(async () => {
    try {
      const [list, sum] = await Promise.all([safeguardingApi.concerns(filter), safeguardingApi.summary()]);
      setRows(list.data.data);
      setSummary(sum.data.data);
    } catch (e) {
      setError(apiError(e, "Couldn't load the concerns."));
    }
  }, [filter]);
  useEffect(() => {
    void load();
  }, [load]);

  const open = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("concern", String(id));
    else next.delete("concern");
    setParams(next, { replace: true });
  };

  if (error) return <div className="p-6"><EmptyState title="Safeguarding" body={error} /></div>;
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
          <ShieldAlert className="h-6 w-6 text-rose-600 dark:text-rose-400" aria-hidden /> Safeguarding
        </h1>
        <Muted className="mt-1">Concerns about students, from the AI Tutor, weekly check-ins, students' own reports and staff. Restricted: every view is recorded.</Muted>
      </header>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="sg-summary">
          {[
            ["Open concerns", summary.concerns.open],
            ["New (not yet seen)", summary.concerns.new],
            ["Urgent and open", summary.concerns.high],
            ["Check-ins this week", `${summary.weeks.find((w) => w.week === summary.week)?.checkIns ?? 0} / ${summary.students}`],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-700/50 dark:bg-gray-800/40">
              <p className="text-xs font-medium text-slate-600 dark:text-gray-300">{label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
            </div>
          ))}
        </div>
      )}

      <Card labelledBy="sg-list">
        <CardTitle
          id="sg-list"
          icon={<AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
          action={
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter concerns">
              {FILTERS.map(([k, l]) => (
                <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === k ? "bg-slate-900 text-white dark:bg-white dark:text-gray-900" : "text-slate-700 hover:bg-slate-100 dark:text-gray-200 dark:hover:bg-gray-700/50"}`}>
                  {l}
                </button>
              ))}
            </div>
          }
        >
          Concerns
        </CardTitle>
        {!rows ? (
          <Spinner label="Loading" />
        ) : rows.length === 0 ? (
          <Muted>No concerns here.</Muted>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-gray-700/40" data-testid="sg-rows">
            {rows.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => open(r.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-3 text-left hover:bg-slate-50 dark:hover:bg-gray-800/50">
                  <Pill cls={SEVERITY_CLS[r.severity]}>{r.severity === "high" ? "Urgent" : r.severity === "medium" ? "Medium" : "Low"}</Pill>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900 dark:text-white">{r.student || `Student #${r.studentId}`} · {CATEGORY_LABEL[r.category] ?? r.category}</span>
                    <span className="block text-xs text-slate-600 dark:text-gray-300">{r.summary} · {SOURCE_LABEL[r.source]} · {when(r.createdAt)}{r.assignee ? ` · ${r.assignee}` : ""}</span>
                  </span>
                  <Pill cls={STATUS_CLS[r.status]}>{STATUS_LABEL[r.status]}</Pill>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {summary && summary.weeks.length > 0 && (
        <Card labelledBy="sg-weeks">
          <CardTitle id="sg-weeks" icon={<Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />}>Weekly check-ins (whole school)</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-600 dark:text-gray-300">
                <tr><th className="py-1 pr-4">Week of</th><th className="pr-4">Check-ins</th><th className="pr-4">Average mood (1–5)</th><th className="pr-4">Feel safe (1–5)</th><th>Asked to talk</th></tr>
              </thead>
              <tbody className="text-slate-800 dark:text-gray-100">
                {summary.weeks.map((w) => (
                  <tr key={w.week} className="border-t border-slate-100 dark:border-gray-700/40">
                    <td className="py-1.5 pr-4">{w.week}</td><td className="pr-4">{w.checkIns}</td><td className="pr-4">{w.mood}</td><td className="pr-4">{w.safe}</td><td>{w.wantsTalk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {openId && <ConcernDialog id={openId} onClose={() => open(null)} onChanged={() => void load()} />}
    </div>
  );
};

const ConcernDialog: React.FC<{ id: number; onClose: () => void; onChanged: () => void }> = ({ id, onClose, onChanged }) => {
  const [c, setC] = useState<Concern | null>(null);
  const [team, setTeam] = useState<Array<{ id: number; name: string }>>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<ConcernStatus | "">("");
  const [assignTo, setAssignTo] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    safeguardingApi.concern(id).then(
      (r) => {
        setC(r.data.data);
        setAssignTo(r.data.data.assignedTo ? String(r.data.data.assignedTo) : "");
      },
      (e) => setErr(apiError(e, "Couldn't open this concern.")),
    );
    safeguardingApi.team().then((r) => setTeam(r.data.data), () => undefined);
  }, [id]);

  const save = async () => {
    if (!c) return;
    setBusy(true);
    try {
      const body: { text?: string; status?: ConcernStatus; assignTo?: number | null } = {};
      if (text.trim()) body.text = text.trim();
      if (status && status !== c.status) body.status = status;
      const a = assignTo ? Number(assignTo) : null;
      if (a !== c.assignedTo) body.assignTo = a;
      const r = await safeguardingApi.act(c.id, body);
      setC(r.data.data);
      setText("");
      setStatus("");
      showToast("Saved.", "success");
      onChanged();
    } catch (e) {
      showToast(apiError(e, "Couldn't save."), "error");
    } finally {
      setBusy(false);
    }
  };

  const changed = !!c && (!!text.trim() || (!!status && status !== c.status) || (assignTo ? Number(assignTo) : null) !== c.assignedTo);
  return (
    <Modal isOpen onClose={onClose} title={c ? `${c.student || `Student #${c.studentId}`}${c.className ? ` · ${c.className}` : ""}` : "Concern"} size="2xl">
      {err ? (
        <Muted>{err}</Muted>
      ) : !c ? (
        <Spinner label="Loading" />
      ) : (
        <div className="space-y-4" data-testid="sg-concern">
          <div className="flex flex-wrap items-center gap-2">
            <Pill cls={SEVERITY_CLS[c.severity]}>{c.severity === "high" ? "Urgent" : c.severity === "medium" ? "Medium" : "Low"}</Pill>
            <Pill cls={STATUS_CLS[c.status]}>{STATUS_LABEL[c.status]}</Pill>
            <span className="text-sm text-slate-700 dark:text-gray-200">{CATEGORY_LABEL[c.category] ?? c.category} · {SOURCE_LABEL[c.source]} · {when(c.createdAt)}</span>
          </div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{c.summary}</p>
          {c.detail && (
            <blockquote className="whitespace-pre-wrap rounded-xl border-l-4 border-rose-300 bg-rose-50/60 px-3 py-2 text-sm text-slate-800 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-gray-100">{c.detail}</blockquote>
          )}
          {c.reporter && c.source === "staff" && <Muted>Reported by {c.reporter}.</Muted>}
          {c.source === "ai_tutor" && c.ref && <Muted>The full AI Tutor conversation is in Desktop tools → AI Tutor → Conversations.</Muted>}

          {c.notes.length > 0 && (
            <ol className="space-y-2 border-l border-slate-200 pl-4 dark:border-gray-700/50" aria-label="What has been done">
              {c.notes.map((n) => (
                <li key={n.id} className="text-sm">
                  <span className="text-xs text-slate-600 dark:text-gray-300">{when(n.at)} · {n.author || (n.action === "again" ? "Raised again" : "System")}</span>
                  <p className="text-slate-800 dark:text-gray-100">
                    {n.action === "status" ? `Status: ${STATUS_LABEL[(n.text ?? "new") as ConcernStatus] ?? n.text}` : n.action === "assign" ? (n.text ? `Assigned to ${team.find((t) => String(t.id) === n.text)?.name ?? "a team member"}` : "Unassigned") : n.text}
                  </p>
                </li>
              ))}
            </ol>
          )}

          {c.history.length > 0 && (
            <Muted>Earlier concerns for this student: {c.history.map((h) => `${CATEGORY_LABEL[h.category] ?? h.category} (${STATUS_LABEL[h.status]}, ${new Date(h.createdAt).toLocaleDateString()})`).join("; ")}</Muted>
          )}

          <div className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-gray-700/50">
            <div>
              <label htmlFor="sg-note" className={labelCls}>Add a note (what was done, who was told)</label>
              <textarea id="sg-note" className={inputCls} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="sg-status" className={labelCls}>Status</label>
                <SelectField id="sg-status" value={status || c.status} onChange={(e) => setStatus(e.target.value as ConcernStatus)} className={inputCls}>
                  {(Object.keys(STATUS_LABEL) as ConcernStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </SelectField>
              </div>
              <div>
                <label htmlFor="sg-assign" className={labelCls}>Assigned to</label>
                <SelectField id="sg-assign" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className={inputCls}>
                  <option value="">Nobody yet</option>
                  {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </SelectField>
              </div>
            </div>
            {status === "closed" && !text.trim() && <p className="text-xs text-rose-700 dark:text-rose-300">Add a note saying what was done before closing.</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={secondaryBtn} onClick={onClose}>Close</button>
              <button type="button" className={primaryBtn} disabled={!changed || busy || (status === "closed" && !text.trim())} onClick={() => void save()}>Save</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default Safeguarding;
