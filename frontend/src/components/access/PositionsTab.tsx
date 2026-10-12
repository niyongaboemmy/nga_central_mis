import UserAvatar from "../ui/UserAvatar";
import React, { useMemo, useState } from "react";
import { Plus, ShieldCheck, PauseCircle, PlayCircle, XCircle } from "lucide-react";
import Modal from "../ui/Modal";
import { useToast } from "../../contexts/ToastContext";
import {
  accessApi,
  accessErrorMessage,
  AccessRoleRow,
  GrantRow,
  Nodes,
} from "../../api/access";
import type { UserSearchResult } from "../../api/users";
import type { ScopeType } from "../../vendor/nga-access";
import {
  btnDanger,
  btnGhost,
  btnPrimary,
  Empty,
  inputCls,
  nodeLabel,
  NodePicker,
  ConfirmReasonDialog,
  mutedCls,
  Panel,
  SCOPE_LABELS,
  UserPicker,
} from "./shared";
import SelectField from "../ui/SelectField";

const SOURCE_LABEL: Record<GrantRow["source"], string> = {
  MANUAL: "Assigned",
  RULE: "From an assignment",
  MIGRATION: "Migrated",
};

/** Assign a position: person + role + node + dates (+ justification for restricted roles). */
export const AssignPositionModal: React.FC<{
  open: boolean;
  onClose: () => void;
  roles: AccessRoleRow[];
  nodes: Nodes | null;
  onAssigned: () => void;
  preset?: { roleId?: number; scopeType?: ScopeType; scopeId?: number | null };
}> = ({ open, onClose, roles, nodes, onAssigned, preset }) => {
  const { showToast } = useToast();
  const [person, setPerson] = useState<UserSearchResult | null>(null);
  const [roleId, setRoleId] = useState<number | null>(preset?.roleId ?? null);
  const [scopeType, setScopeType] = useState<ScopeType | "">(preset?.scopeType ?? "");
  const [scopeId, setScopeId] = useState<number | null>(preset?.scopeId ?? null);
  const [scopeId2, setScopeId2] = useState<number | null>(null);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [title, setTitle] = useState("");
  const [justification, setJustification] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string | null>(null);

  const assignable = roles.filter(
    (r) => r.status === "ACTIVE" && r.allowed_scope_types.some((s) => !["MENTEES", "CHILDREN", "SELF"].includes(s)),
  );
  const role = roles.find((r) => r.role_id === roleId) ?? null;
  const scopes = (role?.allowed_scope_types ?? []).filter((s) => !["MENTEES", "CHILDREN", "SELF"].includes(s));
  const restricted = !!role?.capabilities.some((c) => c.depth === "sensitive");
  const needsNode = scopeType && !["SCHOOL", "PLATFORM"].includes(scopeType);
  const ready =
    person && role && scopeType && (!needsNode || (scopeId && (scopeType !== "SUBJECT_CLASS" || scopeId2)));

  const submit = async () => {
    if (!ready) return;
    setSaving(true);
    setErrors(null);
    try {
      await accessApi.createGrant({
        user_id: person!.user_id,
        role_id: role!.role_id,
        scope_type: scopeType as ScopeType,
        scope_id: scopeId,
        scope_id2: scopeId2,
        valid_from: validFrom || null,
        valid_until: validUntil || null,
        title: title || null,
        justification: justification || null,
      });
      showToast(`${role!.name} assigned`, "success");
      onAssigned();
      onClose();
    } catch (err) {
      setErrors(accessErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Assign a position" size="lg">
      <div className="space-y-3 text-sm text-text-primary-light dark:text-text-primary-dark">
        <label className="block">
          <span className="font-medium">Person</span>
          <UserPicker value={person} onChange={setPerson} />
        </label>
        <label className="block">
          <span className="font-medium">Role</span>
          <SelectField
            className={inputCls}
            value={roleId ?? ""}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null;
              setRoleId(id);
              const next = roles.find((r) => r.role_id === id);
              const first = next?.allowed_scope_types.find((s) => !["MENTEES", "CHILDREN", "SELF"].includes(s)) ?? "";
              setScopeType(first as ScopeType | "");
              setScopeId(null);
              setScopeId2(null);
            }}
          >
            <option value="">Choose a role</option>
            {assignable.map((r) => (
              <option key={r.role_id} value={r.role_id}>
                {r.name}
                {r.category ? ` · ${r.category}` : ""}
              </option>
            ))}
          </SelectField>
          {role?.description && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{role.description}</p>}
        </label>
        {role && (
          <label className="block">
            <span className="font-medium">Where</span>
            <SelectField
              className={inputCls}
              value={scopeType}
              onChange={(e) => {
                setScopeType(e.target.value as ScopeType);
                setScopeId(null);
                setScopeId2(null);
              }}
            >
              {scopes.map((s) => (
                <option key={s} value={s}>
                  {SCOPE_LABELS[s]}
                </option>
              ))}
            </SelectField>
          </label>
        )}
        {needsNode && (
          <NodePicker
            scopeType={scopeType as ScopeType}
            nodes={nodes}
            scopeId={scopeId}
            scopeId2={scopeId2}
            onChange={(a, b) => {
              setScopeId(a);
              setScopeId2(b);
            }}
          />
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="font-medium">From (optional)</span>
            <input type="date" className={inputCls} value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="font-medium">Until {restricted ? "(required)" : "(optional -- acting / fixed term)"}</span>
            <input type="date" className={inputCls} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </label>
        </div>
        <label className="block">
          <span className="font-medium">Title shown (optional)</span>
          <input className={inputCls} value={title} placeholder="e.g. Director of Studies — Primary" onChange={(e) => setTitle(e.target.value)} />
        </label>
        {restricted && (
          <label className="block">
            <span className="font-medium">Justification (required -- this role includes sensitive access)</span>
            <textarea className={inputCls} rows={2} value={justification} onChange={(e) => setJustification(e.target.value)} />
          </label>
        )}
        {errors && (
          <p role="alert" className="rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 p-2 text-xs">
            {errors}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button className={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button className={btnPrimary} disabled={!ready || saving} onClick={submit}>
            {saving ? "Assigning..." : "Assign"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const StatusPill: React.FC<{ status: GrantRow["status"] }> = ({ status }) => (
  <span
    className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
      status === "ACTIVE"
        ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
    }`}
  >
    {status.toLowerCase()}
  </span>
);

type Pending = { kind: "end" | "suspend"; grant: GrantRow } | null;
const PERSONAL = ["SELF", "MENTEES", "CHILDREN"];
const PAGE = 25;

export const PositionsTab: React.FC<{
  grants: GrantRow[];
  roles: AccessRoleRow[];
  nodes: Nodes | null;
  canManage: boolean;
  onChanged: () => void;
}> = ({ grants, roles, nodes, canManage, onChanged }) => {
  const { showToast } = useToast();
  const [assigning, setAssigning] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<number | "">("");
  const [source, setSource] = useState<"" | GrantRow["source"]>("");
  // Personal baselines (own records, mentees, children) are automatic and
  // numerous; leaders manage positions, so those come first.
  const [showBaseline, setShowBaseline] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const matching = useMemo(
    () =>
      grants.filter(
        (g) =>
          (!roleFilter || g.role_id === roleFilter) &&
          (!source || g.source === source) &&
          (!q || `${g.full_name} ${g.username} ${g.role_name} ${g.title ?? ""}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [grants, q, roleFilter, source],
  );
  const baselineCount = matching.filter((g) => PERSONAL.includes(g.scope_type)).length;
  const filtered = showBaseline ? matching : matching.filter((g) => !PERSONAL.includes(g.scope_type));
  const rows = filtered.slice(0, limit);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
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

  const Actions: React.FC<{ g: GrantRow }> = ({ g }) => (
    <div className="flex justify-end gap-1">
      <button
        type="button"
        title="Certify: this person still needs this position"
        aria-label={`Certify ${g.role_name} for ${g.full_name}`}
        className={btnGhost}
        onClick={() => act(() => accessApi.certifyGrant(g.grant_id), "Certified")}
      >
        <ShieldCheck className="w-4 h-4" />
      </button>
      {g.status === "ACTIVE" ? (
        <button
          type="button"
          title="Suspend"
          aria-label={`Suspend ${g.role_name} for ${g.full_name}`}
          className={btnGhost}
          onClick={() => setPending({ kind: "suspend", grant: g })}
        >
          <PauseCircle className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          title="Resume"
          aria-label={`Resume ${g.role_name} for ${g.full_name}`}
          className={btnGhost}
          onClick={() => act(() => accessApi.resumeGrant(g.grant_id), "Resumed")}
        >
          <PlayCircle className="w-4 h-4" />
        </button>
      )}
      {g.source !== "RULE" && (
        <button
          type="button"
          title="End this position"
          aria-label={`End ${g.role_name} for ${g.full_name}`}
          className={btnDanger}
          onClick={() => setPending({ kind: "end", grant: g })}
        >
          <XCircle className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  return (
    <Panel
      title={`Positions & grants (${filtered.length})`}
      actions={
        canManage && (
          <button type="button" className={btnPrimary} onClick={() => setAssigning(true)}>
            <Plus className="w-4 h-4" /> Assign a position
          </button>
        )
      }
    >
      <div className="grid gap-2 sm:grid-cols-3 mb-3">
        <input
          className={inputCls}
          aria-label="Search positions"
          placeholder="Search person, role or title"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <SelectField aria-label="Filter by role" className={inputCls} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value ? Number(e.target.value) : "")}>
          <option value="">All roles</option>
          {roles.map((r) => (
            <option key={r.role_id} value={r.role_id}>
              {r.name}
            </option>
          ))}
        </SelectField>
        <SelectField aria-label="Filter by source" className={inputCls} value={source} onChange={(e) => setSource(e.target.value as any)}>
          <option value="">All sources</option>
          <option value="MANUAL">Assigned here</option>
          <option value="RULE">From assignments (class teacher, subject, ...)</option>
          <option value="MIGRATION">Migrated from old roles</option>
        </SelectField>
      </div>
      {baselineCount > 0 && (
        <label className={`mb-3 inline-flex items-center gap-2 text-sm ${mutedCls}`}>
          <input type="checkbox" checked={showBaseline} onChange={(e) => { setShowBaseline(e.target.checked); setLimit(PAGE); }} />
          Also show {baselineCount} personal baseline{baselineCount === 1 ? "" : "s"} (own records, mentees, children -- granted automatically)
        </label>
      )}
      {rows.length === 0 ? (
        <Empty>No positions match.</Empty>
      ) : (
        <>
          {/* Phones: one card per position (a 7-column table cannot fit). */}
          <ul className="md:hidden space-y-2" aria-label="Positions">
            {rows.map((g) => (
              <li key={g.grant_id} className="rounded-xl border border-border-light dark:border-slate-700/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex items-start gap-2.5">
                    <UserAvatar decorative userId={g.user_id} name={g.full_name} size={32} />
                    <div className="min-w-0">
                    <div className="font-medium break-words">{g.full_name}</div>
                    <div className="text-sm break-words">{g.title || g.role_name}</div>
                    </div>
                  </div>
                  <StatusPill status={g.status} />
                </div>
                <dl className={`mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs ${mutedCls}`}>
                  <dt>Where</dt>
                  <dd className="break-words">{nodeLabel(g.scope_type, g.scope_id, g.scope_id2, nodes)}</dd>
                  {g.academic_year_name && (
                    <>
                      <dt>School year</dt>
                      <dd>{g.academic_year_name}</dd>
                    </>
                  )}
                  <dt>Until</dt>
                  <dd>{g.valid_until ?? "No end date"}</dd>
                  <dt>Source</dt>
                  <dd>{SOURCE_LABEL[g.source]}</dd>
                </dl>
                {canManage && (
                  <div className="mt-2">
                    <Actions g={g} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Positions and grants</caption>
              <thead className={`text-left text-xs uppercase ${mutedCls}`}>
                <tr>
                  <th scope="col" className="py-2 pr-3">Person</th>
                  <th scope="col" className="py-2 pr-3">Role</th>
                  <th scope="col" className="py-2 pr-3">Where</th>
                  <th scope="col" className="py-2 pr-3">Until</th>
                  <th scope="col" className="py-2 pr-3">Source</th>
                  <th scope="col" className="py-2 pr-3">Status</th>
                  {canManage && (
                    <th scope="col" className="py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <tr key={g.grant_id} className="border-t border-border-light dark:border-slate-700/50">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar decorative userId={g.user_id} name={g.full_name} size={28} />
                        <div>
                          <div className="font-medium">{g.full_name}</div>
                          {g.title && <div className={`text-xs ${mutedCls}`}>{g.title}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 pr-3">{g.role_name}</td>
                    <td className="py-2 pr-3">
                      {nodeLabel(g.scope_type, g.scope_id, g.scope_id2, nodes)}
                      {g.academic_year_name && <div className={`text-xs ${mutedCls}`}>{g.academic_year_name}</div>}
                    </td>
                    <td className="py-2 pr-3">{g.valid_until ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs">{SOURCE_LABEL[g.source]}</td>
                    <td className="py-2 pr-3">
                      <StatusPill status={g.status} />
                    </td>
                    {canManage && (
                      <td className="py-2 whitespace-nowrap">
                        <Actions g={g} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {filtered.length > rows.length && (
        <div className="mt-3 text-center">
          <button type="button" className={btnGhost} onClick={() => setLimit((l) => l + PAGE)}>
            Show more ({filtered.length - rows.length} left)
          </button>
        </div>
      )}
      <AssignPositionModal open={assigning} onClose={() => setAssigning(false)} roles={roles} nodes={nodes} onAssigned={onChanged} />
      <ConfirmReasonDialog
        open={!!pending}
        danger={pending?.kind === "end"}
        title={pending?.kind === "end" ? "End this position?" : "Suspend this position?"}
        consequence={
          pending
            ? pending.kind === "end"
              ? `${pending.grant.full_name} will lose “${pending.grant.title || pending.grant.role_name}” (${nodeLabel(pending.grant.scope_type, pending.grant.scope_id, pending.grant.scope_id2, nodes)}) in every app within minutes. This cannot be undone -- you would assign it again.`
              : `${pending.grant.full_name} will lose “${pending.grant.title || pending.grant.role_name}” until you resume it.`
            : ""
        }
        confirmLabel={pending?.kind === "end" ? "End position" : "Suspend"}
        onCancel={() => setPending(null)}
        onConfirm={async (reason) => {
          if (!pending) return;
          const ok =
            pending.kind === "end"
              ? await act(() => accessApi.endGrant(pending.grant.grant_id, reason), "Position ended")
              : await act(() => accessApi.suspendGrant(pending.grant.grant_id, reason), "Suspended");
          if (ok) setPending(null);
        }}
      />
    </Panel>
  );
};
