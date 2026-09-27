import React, { useMemo, useState } from "react";
import { ChevronRight, Plus, Users as UsersIcon } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import {
  accessApi,
  accessErrorMessage,
  AccessRoleRow,
  Catalog,
  CatalogCapability,
} from "../../api/access";
import type { Depth, ScopeType } from "../../vendor/nga-access";
import { btnGhost, btnPrimary, DEPTH_INFO, DepthPill, Empty, inputCls, Panel, SCOPE_LABELS } from "./shared";

const APP_LABEL: Record<string, string> = { mis: "Central MIS", tm: "Task Mentor", da: "Discipline & Attendance", tupo: "Tupo" };
const MANUAL_SCOPES: ScopeType[] = ["PLATFORM", "SCHOOL", "PROGRAM", "DEPARTMENT", "GRADE", "CLASS_GROUP", "SUBJECT_CLASS", "MENTEES", "CHILDREN", "SELF"];

type Selection = Record<string, Depth | "on" | undefined>;

const selectionOf = (role: AccessRoleRow | null): Selection =>
  Object.fromEntries((role?.capabilities ?? []).map((c) => [c.name, c.kind === "READ" ? (c.depth ?? "detail") : "on"]));

/** Edit one role: capabilities (with read depth), where it may be granted, holder cap. */
export const RoleEditor: React.FC<{
  role: AccessRoleRow | null; // null = new role
  catalog: Catalog;
  canEdit: boolean;
  onSaved: () => void;
  onClose: () => void;
}> = ({ role, catalog, canEdit, onSaved, onClose }) => {
  const { showToast } = useToast();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [scopes, setScopes] = useState<ScopeType[]>(role?.allowed_scope_types ?? ["SCHOOL"]);
  const [maxHolders, setMaxHolders] = useState<string>(role?.max_holders ? String(role.max_holders) : "");
  const [sel, setSel] = useState<Selection>(selectionOf(role));
  const [filter, setFilter] = useState("");
  const [app, setApp] = useState<string>("mis");
  const [saving, setSaving] = useState(false);
  const initial = useMemo(
    () => JSON.stringify({ n: role?.name ?? "", d: role?.description ?? "", s: role?.allowed_scope_types ?? ["SCHOOL"], m: role?.max_holders ? String(role.max_holders) : "", c: selectionOf(role) }),
    [role],
  );
  const dirty = JSON.stringify({ n: name, d: description, s: scopes, m: maxHolders, c: Object.fromEntries(Object.entries(sel).filter(([, v]) => v)) }) !== initial;
  const confirm = useConfirm();
  const close = async () => {
    if (canEdit && dirty) {
      const discard = await confirm({
        title: "Discard your changes?",
        message: "Your edits to this role have not been saved.",
        confirmText: "Discard changes",
        cancelText: "Keep editing",
        tone: "danger",
      });
      if (!discard) return;
    }
    onClose();
  };

  const apps = useMemo(() => Array.from(new Set(catalog.capabilities.map((c) => c.app))).sort(), [catalog]);
  const grouped = useMemo(() => {
    const out = new Map<string, CatalogCapability[]>();
    for (const c of catalog.capabilities) {
      if (c.app !== app || (c.deprecated && !sel[c.name])) continue;
      if (filter && !`${c.label} ${c.key}`.toLowerCase().includes(filter.toLowerCase())) continue;
      const d = c.domain ?? "OTHER";
      out.set(d, [...(out.get(d) ?? []), c]);
    }
    return [...out.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalog, app, filter, sel]);

  const counts = useMemo(() => {
    const byApp: Record<string, number> = {};
    for (const [n, v] of Object.entries(sel)) if (v) byApp[n.includes(":") ? n.split(":")[0] : "mis"] = (byApp[n.includes(":") ? n.split(":")[0] : "mis"] ?? 0) + 1;
    return byApp;
  }, [sel]);

  const save = async () => {
    setSaving(true);
    const capabilities = Object.entries(sel)
      .filter(([, v]) => v)
      .map(([n, v]) => ({ name: n, depth: v === "on" ? null : (v as Depth) }));
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      allowed_scope_types: scopes,
      max_holders: maxHolders ? Number(maxHolders) : null,
      capabilities,
    };
    try {
      if (role) await accessApi.updateRole(role.role_id, body);
      else await accessApi.createRole(body as any);
      showToast(role ? "Role saved" : "Role created", "success");
      onSaved();
      onClose();
    } catch (err) {
      showToast(accessErrorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="font-medium">Name</span>
          <input className={inputCls} disabled={!canEdit} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="font-medium">Most holders at once (optional)</span>
          <input className={inputCls} disabled={!canEdit} type="number" min={1} value={maxHolders} onChange={(e) => setMaxHolders(e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="font-medium">Description</span>
        <input className={inputCls} disabled={!canEdit} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div>
        <span className="font-medium">Can be granted at</span>
        <div className="flex flex-wrap gap-2 mt-1">
          {MANUAL_SCOPES.map((s) => (
            <label key={s} className="inline-flex items-center gap-1.5 rounded-lg border border-border-light dark:border-slate-700 px-2 py-1">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={scopes.includes(s)}
                onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))}
              />
              {SCOPE_LABELS[s]}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {apps.map((a) => (
            <button key={a} className={a === app ? btnPrimary : btnGhost} onClick={() => setApp(a)}>
              {APP_LABEL[a] ?? a} {counts[a] ? `(${counts[a]})` : ""}
            </button>
          ))}
          <input aria-label="Filter capabilities" className={`${inputCls} max-w-xs`} placeholder="Filter capabilities" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">
          Read depth: <strong>Summary</strong> = dashboards and class/grade summaries only (no names); <strong>Detail</strong> = individual
          records; <strong>Sensitive</strong> = restricted fields.
        </p>
        <div className="max-h-[420px] overflow-auto space-y-3 pr-1">
          {grouped.map(([domain, caps]) => (
            <div key={domain}>
              <div className="text-[11px] uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1">{domain.toLowerCase()}</div>
              <ul className="divide-y divide-border-light dark:divide-slate-700/50 rounded-lg border border-border-light dark:border-slate-700/50">
                {caps.map((c) => (
                  <li key={c.name} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <div className="min-w-0">
                      <div className="break-words">
                        {c.label} {c.deprecated && <span className="text-rose-600 text-xs">(removed from app)</span>}
                        {c.restricted && <span className="ml-1 text-rose-600 text-[11px]">restricted</span>}
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300">{c.key}{!c.scopeable && " · school-wide only"}</div>
                    </div>
                    {c.kind === "READ" ? (
                      <select
                        aria-label={`Depth for ${c.key}`}
                        className="rounded-md border border-border-light dark:border-slate-700 bg-transparent px-2 py-1 text-xs"
                        disabled={!canEdit}
                        value={(sel[c.name] as string) ?? ""}
                        onChange={(e) => setSel({ ...sel, [c.name]: (e.target.value || undefined) as Depth | undefined })}
                      >
                        <option value="">None</option>
                        {c.depths.map((d) => (
                          <option key={d} value={d}>
                            {DEPTH_INFO[d].label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="checkbox"
                        aria-label={`Allow ${c.key}`}
                        disabled={!canEdit}
                        checked={sel[c.name] === "on"}
                        onChange={(e) => setSel({ ...sel, [c.name]: e.target.checked ? "on" : undefined })}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {grouped.length === 0 && <Empty>No capabilities for this app yet. It appears once the app publishes its manifest.</Empty>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border-light dark:border-slate-700/50">
        <span className="text-xs text-slate-600 dark:text-slate-300">
          {!dirty && role
            ? "No changes yet."
            : role
              ? `Saving changes access for ${role.holders} ${role.holders === 1 ? "person" : "people"} within minutes, in every app.`
              : "New roles start with no holders."}
        </span>
        <div className="flex gap-2">
          <button type="button" className={btnGhost} onClick={close}>
            {canEdit ? "Cancel" : "Close"}
          </button>
          {canEdit && (
            <button type="button" className={btnPrimary} disabled={saving || !dirty || name.trim().length < 3 || scopes.length === 0} onClick={save}>
              {saving ? "Saving..." : "Save role"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const RolesTab: React.FC<{
  roles: AccessRoleRow[];
  catalog: Catalog | null;
  canEdit: boolean;
  onChanged: () => void;
}> = ({ roles, catalog, canEdit, onChanged }) => {
  const [open, setOpen] = useState<AccessRoleRow | "new" | null>(null);
  const [category, setCategory] = useState("");
  const categories = Array.from(new Set(roles.map((r) => r.category ?? "Other"))).sort();
  const shown = roles.filter((r) => !category || (r.category ?? "Other") === category);

  if (open && catalog) {
    const role = open === "new" ? null : open;
    return (
      <Panel title={role ? `Role: ${role.name}` : "New role"}>
        <RoleEditor role={role} catalog={catalog} canEdit={canEdit && !(role?.platform_only && !canEdit)} onSaved={onChanged} onClose={() => setOpen(null)} />
      </Panel>
    );
  }

  return (
    <Panel
      title={`Roles (${shown.length})`}
      actions={
        <div className="flex gap-2">
          <select aria-label="Filter roles by category" className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {canEdit && (
            <button className={btnPrimary} onClick={() => setOpen("new")}>
              <Plus className="w-4 h-4" /> New role
            </button>
          )}
        </div>
      }
    >
      <ul className="divide-y divide-border-light dark:divide-slate-700/50">
        {shown.map((r) => {
          const reads = r.capabilities.filter((c) => c.kind === "READ");
          const deepest = reads.some((c) => c.depth === "sensitive") ? "sensitive" : reads.some((c) => c.depth === "detail") ? "detail" : reads.length ? "summary" : null;
          return (
            <li key={r.role_id}>
              <button className="w-full flex items-center justify-between gap-3 py-2 text-left" onClick={() => setOpen(r)}>
                <div className="min-w-0">
                  <div className="font-medium">
                    {r.name}{" "}
                    {r.status === "DISABLED" && <span className="text-xs text-slate-500">(disabled)</span>}
                    {r.is_preset ? <span className="ml-1 text-[11px] text-brand-700 dark:text-brand-200">preset</span> : null}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 break-words">
                    {r.category ?? "Other"} · {r.allowed_scope_types.map((s) => SCOPE_LABELS[s]).join(", ")} · {r.capabilities.length} capabilities
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {deepest && <DepthPill depth={deepest as Depth} />}
                  <span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                    <UsersIcon className="w-3.5 h-3.5" /> {r.holders}
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};
