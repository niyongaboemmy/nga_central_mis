import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Plus, Check } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import {
  accessApi,
  accessErrorMessage,
  AccessRoleRow,
  AuditRow,
  Decision,
  DepartmentRow,
  Nodes,
  RuleRow,
  ShadowDiffRow,
} from "../../api/access";
import type { UserSearchResult } from "../../api/users";
import type { AccessSnapshot, ScopeEntry } from "../../vendor/nga-access";
import { btnGhost, btnPrimary, DepthPill, Empty, inputCls, nodeLabel, Panel, UserPicker } from "./shared";
import SelectField from "../ui/SelectField";

// ---------------------------------------------------------------------------
// Auto-assignment rules
// ---------------------------------------------------------------------------

const TRIGGER_LABEL: Record<RuleRow["trigger_type"], string> = {
  PERSONA: "Account type",
  CLASS_TEACHER: "Class-teacher assignment",
  SUBJECT_TEACHER: "Subject assignment",
  PROGRAM_LEAD: "Programme-lead assignment",
  MENTOR: "Mentor assignment",
  PARENT: "Parent link",
};

export const RulesTab: React.FC<{ rules: RuleRow[]; roles: AccessRoleRow[]; canEdit: boolean; onChanged: () => void }> = ({
  rules,
  roles,
  canEdit,
  onChanged,
}) => {
  const { showToast } = useToast();
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      showToast(ok, "success");
      onChanged();
    } catch (err) {
      showToast(accessErrorMessage(err), "error");
    }
  };
  return (
    <Panel
      title="Auto-assignment rules"
      actions={
        canEdit && (
          <button className={btnGhost} onClick={() => run(() => accessApi.syncRules(), "Rules re-applied")}>
            <RefreshCw className="w-4 h-4" /> Re-apply now
          </button>
        )
      }
    >
      <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
        Rules turn the existing assignments (class teacher, subject teacher, programme lead, mentor, parent link, account
        type) into positions automatically. Change the role a rule grants to change what, for example, every class teacher can
        do -- no code, applied within minutes.
      </p>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-600 dark:text-slate-300">
          <tr>
            <th className="py-2 pr-3">Rule</th>
            <th className="py-2 pr-3">When someone has</th>
            <th className="py-2 pr-3">They get</th>
            <th className="py-2">Active</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => {
            let filter = "";
            try {
              filter = r.trigger_filter ? ` (${JSON.parse(r.trigger_filter).user_type?.toLowerCase()})` : "";
            } catch {
              filter = "";
            }
            return (
              <tr key={r.rule_id} className="border-t border-border-light dark:border-slate-700/50">
                <td className="py-2 pr-3">{r.name}</td>
                <td className="py-2 pr-3">
                  {TRIGGER_LABEL[r.trigger_type]}
                  {filter}
                </td>
                <td className="py-2 pr-3">
                  <SelectField
                    className={inputCls}
                    aria-label={`Role granted by ${r.name}`}
                    disabled={!canEdit}
                    value={r.role_id}
                    onChange={(e) => run(() => accessApi.updateRule(r.rule_id, { role_id: Number(e.target.value) }), "Rule updated")}
                  >
                    {roles
                      .filter((x) => x.status === "ACTIVE" && !x.platform_only)
                      .map((x) => (
                        <option key={x.role_id} value={x.role_id}>
                          {x.name}
                        </option>
                      ))}
                  </SelectField>
                </td>
                <td className="py-2">
                  <input
                    type="checkbox"
                    aria-label={`Rule ${r.name} active`}
                    disabled={!canEdit}
                    checked={r.status === "ACTIVE"}
                    onChange={(e) =>
                      run(() => accessApi.updateRule(r.rule_id, { status: e.target.checked ? "ACTIVE" : "PAUSED" }), "Rule updated")
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
};

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export const DepartmentsTab: React.FC<{ departments: DepartmentRow[]; nodes: Nodes | null; canEdit: boolean; onChanged: () => void }> = ({
  departments,
  nodes,
  canEdit,
  onChanged,
}) => {
  const { showToast } = useToast();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const taken = useMemo(() => {
    const m = new Map<number, string>();
    departments.forEach((d) => d.subjects.forEach((s) => m.set(s.subject_id, d.name)));
    return m;
  }, [departments]);
  const unassigned = (nodes?.subjects ?? []).filter((s) => !taken.has(s.id)).length;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      showToast(ok, "success");
      onChanged();
      return true;
    } catch (err) {
      showToast(accessErrorMessage(err), "error");
      return false;
    }
  };

  return (
    <Panel title={`Departments (${departments.length})`} actions={unassigned > 0 && <span className="text-xs text-amber-600">{unassigned} subject(s) in no department</span>}>
      {canEdit && (
        <div className="flex flex-wrap gap-2 mb-3">
          <input aria-label="Department code" className={`${inputCls} max-w-[140px]`} placeholder="Code (SCI)" value={code} onChange={(e) => setCode(e.target.value)} />
          <input aria-label="Department name" className={`${inputCls} max-w-xs`} placeholder="Name (Sciences)" value={name} onChange={(e) => setName(e.target.value)} />
          <button
            className={btnPrimary}
            disabled={code.trim().length < 2 || name.trim().length < 2}
            onClick={async () => {
              if (await run(() => accessApi.createDepartment({ code, name }), "Department created")) {
                setCode("");
                setName("");
              }
            }}
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      )}
      {departments.length === 0 && <Empty>No departments yet.</Empty>}
      <ul className="space-y-2">
        {departments.map((d) => (
          <li key={d.department_id} className="rounded-xl border border-border-light dark:border-slate-700/50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <strong>{d.name}</strong> <span className="text-xs text-slate-600 dark:text-slate-300">{d.code}</span>
              </div>
              {canEdit && editing !== d.department_id && (
                <button
                  className={btnGhost}
                  onClick={() => {
                    setEditing(d.department_id);
                    setPicked(d.subjects.map((s) => s.subject_id));
                  }}
                >
                  Edit subjects
                </button>
              )}
            </div>
            {editing === d.department_id ? (
              <div className="mt-2">
                <div className="grid sm:grid-cols-2 gap-1 max-h-60 overflow-auto">
                  {(nodes?.subjects ?? []).map((s) => {
                    const elsewhere = taken.get(s.id);
                    const blocked = !!elsewhere && elsewhere !== d.name;
                    return (
                      <label key={s.id} className={`flex items-center gap-2 text-xs ${blocked ? "opacity-50" : ""}`}>
                        <input
                          type="checkbox"
                          disabled={blocked}
                          checked={picked.includes(s.id)}
                          onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))}
                        />
                        {s.name} <span className="text-slate-600 dark:text-slate-300">{s.code}</span>
                        {blocked && <span className="text-slate-600 dark:text-slate-300">({elsewhere})</span>}
                      </label>
                    );
                  })}
                </div>
                <div className="flex justify-end gap-2 mt-2">
                  <button className={btnGhost} onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                  <button
                    className={btnPrimary}
                    onClick={async () => {
                      if (await run(() => accessApi.setDepartmentSubjects(d.department_id, picked), "Subjects saved")) setEditing(null);
                    }}
                  >
                    <Check className="w-4 h-4" /> Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {d.subjects.length ? d.subjects.map((s) => s.name).join(", ") : "No subjects yet"}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
};

// ---------------------------------------------------------------------------
// Explorer: effective access of a person + "can X do Y here?"
// ---------------------------------------------------------------------------

const scopeText = (s: ScopeEntry, nodes: Nodes | null) => {
  if (s.all) return "Whole school";
  const parts: string[] = [];
  if (s.programs?.length) parts.push(s.programs.map((id) => nodeLabel("PROGRAM", id, null, nodes)).join(", "));
  if (s.departments?.length) parts.push(s.departments.map((id) => nodeLabel("DEPARTMENT", id, null, nodes)).join(", "));
  if (!s.programs?.length && s.grades?.length) parts.push(s.grades.map((id) => nodeLabel("GRADE", id, null, nodes)).join(", "));
  if (!s.programs?.length && !s.grades?.length && s.class_groups?.length)
    parts.push(s.class_groups.map((id) => nodeLabel("CLASS_GROUP", id, null, nodes)).join(", "));
  if (!s.departments?.length && s.pairs?.length)
    parts.push(s.pairs.map(([a, b]) => nodeLabel("SUBJECT_CLASS", a, b, nodes)).join(", "));
  if (s.students?.length) parts.push(`${s.students.length} student(s)`);
  if (s.self != null) parts.push("Own records");
  return parts.join(" · ") || "—";
};

export const ExplorerTab: React.FC<{ nodes: Nodes | null; canPreview: boolean }> = ({ nodes, canPreview }) => {
  const { showToast } = useToast();
  const [person, setPerson] = useState<UserSearchResult | null>(null);
  const [app, setApp] = useState("mis");
  const [snap, setSnap] = useState<AccessSnapshot | null>(null);
  const [cap, setCap] = useState("");
  const [classGroupId, setClassGroupId] = useState<string>("");
  const [decision, setDecision] = useState<Decision | null>(null);

  useEffect(() => {
    setSnap(null);
    setDecision(null);
    if (!person || !canPreview) return;
    accessApi
      .previewUser(person.user_id, app)
      .then(setSnap)
      .catch((err) => showToast(accessErrorMessage(err), "error"));
  }, [person, app, canPreview, showToast]);

  if (!canPreview) return <Panel title="Access explorer"><Empty>You need “Preview another user's access” to use the explorer.</Empty></Panel>;

  return (
    <div className="space-y-3">
      <Panel title="Whose access?">
        <div className="grid sm:grid-cols-[1fr_200px] gap-2">
          <UserPicker value={person} onChange={setPerson} />
          <SelectField aria-label="App" className={inputCls} value={app} onChange={(e) => setApp(e.target.value)}>
            <option value="mis">Central MIS</option>
            <option value="tm">Task Mentor</option>
            <option value="da">Discipline & Attendance</option>
            <option value="tupo">Tupo</option>
          </SelectField>
        </div>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Read-only preview. Every preview is recorded in the access audit log.</p>
      </Panel>
      {snap && (
        <>
          <Panel title="Positions">
            {Object.keys(snap.grants).length === 0 ? (
              <Empty>No positions.</Empty>
            ) : (
              <ul className="text-sm space-y-1">
                {Object.entries(snap.grants).map(([id, g]) => (
                  <li key={id}>
                    <strong>{g.title || g.role}</strong> — {nodeLabel(g.scope_type, g.scope_id, g.scope_id2, nodes)}
                    {g.valid_until ? ` · until ${g.valid_until}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title={`Effective capabilities (${Object.keys(snap.caps).length})`}>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(snap.caps)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, entries]) => (
                      <tr key={key} className="border-t border-border-light dark:border-slate-700/50 align-top">
                        <td className="py-1.5 pr-3 font-mono text-xs">{key}</td>
                        <td className="py-1.5">
                          {entries.map((e, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <DepthPill depth={e.depth} /> {scopeText(e.scope, nodes)}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Can this person …?">
            <div className="grid sm:grid-cols-[1fr_220px_auto] gap-2">
              <SelectField aria-label="Capability" className={inputCls} value={cap} onChange={(e) => setCap(e.target.value)}>
                <option value="">Choose a capability</option>
                {Object.keys(snap.caps).sort().map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </SelectField>
              <SelectField aria-label="Where" className={inputCls} value={classGroupId} onChange={(e) => setClassGroupId(e.target.value)}>
                <option value="">Anywhere</option>
                {(nodes?.classGroups ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    in class {c.name}
                  </option>
                ))}
              </SelectField>
              <button
                className={btnPrimary}
                disabled={!cap}
                onClick={() =>
                  accessApi
                    .explain({ userId: person!.user_id, app, cap, classGroupId: classGroupId || undefined })
                    .then(setDecision)
                    .catch((err) => showToast(accessErrorMessage(err), "error"))
                }
              >
                Check
              </button>
            </div>
            {decision && (
              <p className="mt-3 text-sm" role="status">
                {decision.allowed ? "Yes" : "No"}
                {decision.allowed && decision.depth ? ` (${decision.depth})` : ""}
                {decision.grants.length > 0 && ` — because of: ${decision.grants.map((g) => g.role).join(", ")}`}
              </p>
            )}
          </Panel>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Audit & shadow differences
// ---------------------------------------------------------------------------

export const AuditTab: React.FC = () => {
  const { showToast } = useToast();
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [diffs, setDiffs] = useState<ShadowDiffRow[]>([]);
  const reload = () => {
    accessApi.audit({ limit: 200 }).then(setAudit).catch(() => setAudit([]));
    accessApi.shadowDiffs(true).then(setDiffs).catch(() => setDiffs([]));
  };
  useEffect(reload, []);

  return (
    <div className="space-y-3">
      <Panel
        title={`Differences to review before enforcing (${diffs.length})`}
        actions={
          diffs.length > 0 && (
            <button
              className={btnGhost}
              onClick={() =>
                accessApi
                  .reviewShadowDiffs(diffs.map((d) => d.diff_id), "reviewed in Access Studio")
                  .then(() => {
                    showToast("Marked reviewed", "success");
                    reload();
                  })
                  .catch((err) => showToast(accessErrorMessage(err), "error"))
              }
            >
              <Check className="w-4 h-4" /> Mark all reviewed
            </button>
          )
        }
      >
        <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">
          While the new access model runs in shadow mode, the old checks still decide. Each row is a place where the new model
          would decide differently. Review them before switching enforcement on.
        </p>
        {diffs.length === 0 ? (
          <Empty>No unreviewed differences.</Empty>
        ) : (
          <div className="overflow-x-auto" role="region" aria-label="Differences to review (scrolls sideways)" tabIndex={0}>
          <table className="w-full text-xs min-w-[560px]">
            <thead className="text-left uppercase text-slate-600 dark:text-slate-300">
              <tr>
                <th className="py-1 pr-2">User</th>
                <th className="py-1 pr-2">Capability</th>
                <th className="py-1 pr-2">Route</th>
                <th className="py-1 pr-2">Today</th>
                <th className="py-1 pr-2">New model</th>
                <th className="py-1">Hits</th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((d) => (
                <tr key={d.diff_id} className="border-t border-border-light dark:border-slate-700/50">
                  <td className="py-1 pr-2">#{d.user_id}</td>
                  <td className="py-1 pr-2 font-mono">{d.capability}</td>
                  <td className="py-1 pr-2 font-mono">{d.route}</td>
                  <td className="py-1 pr-2">{d.legacy_allowed ? "allowed" : "refused"}</td>
                  <td className="py-1 pr-2">{d.v2_allowed ? `allowed${d.v2_depth ? ` (${d.v2_depth})` : ""}` : "refused"}</td>
                  <td className="py-1">{d.hits}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Panel>
      <Panel title="Access audit log">
        {audit.length === 0 ? (
          <Empty>Nothing recorded yet.</Empty>
        ) : (
          <ul className="text-xs divide-y divide-border-light dark:divide-slate-700/50">
            {audit.map((a) => (
              <li key={a.audit_id} className="py-1.5 flex gap-3">
                <span className="text-slate-600 dark:text-slate-300 whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</span>
                <span className="font-mono">{a.action}</span>
                <span>
                  {a.actor_id ? `by #${a.actor_id}` : "system"}
                  {a.subject_user_id ? ` · for #${a.subject_user_id}` : ""}
                  {a.reason ? ` · “${a.reason}”` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
};
