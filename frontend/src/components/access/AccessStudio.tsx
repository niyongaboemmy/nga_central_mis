import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  accessApi,
  AccessRoleRow,
  Catalog,
  DepartmentRow,
  GrantRow,
  Nodes,
  RuleRow,
} from "../../api/access";
import { useAccess } from "../../hooks/useAccess";
import { PositionsTab } from "./PositionsTab";
import { RolesTab } from "./RolesTab";
import { AuditTab, DepartmentsTab, ExplorerTab, RulesTab, StructureTab } from "./OtherTabs";
import { Empty, Panel } from "./shared";

/**
 * Access Studio (ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md §9): the one place
 * to manage who may do what, where, in every app. Each tab is shown only to
 * holders of the capability behind it; the server re-checks everything.
 */

type TabKey = "structure" | "positions" | "roles" | "rules" | "departments" | "explorer" | "audit";

export default function AccessStudio() {
  const { can, loading, unavailable, refresh } = useAccess();
  const studio = can("ACCESS_STUDIO_VIEW");

  const tabs = useMemo(
    () =>
      (
        [
          ["structure", "Structure", can(["VIEW_LEADERSHIP_STRUCTURE", "ACCESS_STUDIO_VIEW"])],
          ["positions", "Positions", studio],
          ["roles", "Roles", studio],
          ["rules", "Auto-assignment", studio],
          ["departments", "Departments", studio || can("MANAGE_DEPARTMENTS")],
          ["explorer", "Explorer", can("ACCESS_PREVIEW_AS")],
          ["audit", "Audit", can("ACCESS_AUDIT_VIEW")],
        ] as Array<[TabKey, string, boolean]>
      ).filter(([, , ok]) => ok),
    [can, studio],
  );
  const [tab, setTab] = useState<TabKey>("structure");
  const current = tabs.find(([k]) => k === tab)?.[0] ?? tabs[0]?.[0];

  const [nodes, setNodes] = useState<Nodes | null>(null);
  const [positions, setPositions] = useState<GrantRow[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [roles, setRoles] = useState<AccessRoleRow[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);

  const reload = useCallback(async () => {
    if (!tabs.length) return;
    const quiet = <T,>(p: Promise<T>, set: (v: T) => void) => p.then(set).catch(() => undefined);
    await Promise.all([
      quiet(accessApi.structure(), (s) => {
        setNodes(s.nodes);
        setPositions(s.positions);
      }),
      studio ? quiet(accessApi.grants(), setGrants) : null,
      studio ? quiet(accessApi.roles(), setRoles) : null,
      studio ? quiet(accessApi.catalog(), setCatalog) : null,
      studio ? quiet(accessApi.rules(), setRules) : null,
      studio || can("MANAGE_DEPARTMENTS") ? quiet(accessApi.departments(), setDepartments) : null,
    ]);
  }, [tabs.length, studio, can]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onChanged = () => {
    void reload();
    void refresh(); // my own access may have changed
  };

  if (loading) return <div data-testid="access-studio"><Panel><Empty>Loading access…</Empty></Panel></div>;
  if (unavailable) return <div data-testid="access-studio"><Panel><Empty>Access Studio is not installed on this server yet.</Empty></Panel></div>;
  if (!tabs.length) return <div data-testid="access-studio"><Panel><Empty>You do not have access to Access Studio.</Empty></Panel></div>;

  return (
    <div className="space-y-4 px-3 sm:px-0" data-testid="access-studio">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-slate-700 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-brand-600 dark:text-brand-200" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary-light dark:text-text-primary-dark">Leadership & Access</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Who can do what, where -- across the MIS, Task Mentor, Discipline & Attendance and Tupo.
          </p>
        </div>
      </header>

      <div
        className="flex flex-wrap gap-1"
        role="tablist"
        aria-label="Leadership & Access sections"
        onKeyDown={(e) => {
          // WAI-ARIA tabs: arrows / Home / End move and select.
          const keys = tabs.map(([k]) => k);
          const i = keys.indexOf(current as TabKey);
          const next =
            e.key === "ArrowRight" ? keys[(i + 1) % keys.length]
            : e.key === "ArrowLeft" ? keys[(i - 1 + keys.length) % keys.length]
            : e.key === "Home" ? keys[0]
            : e.key === "End" ? keys[keys.length - 1]
            : null;
          if (!next) return;
          e.preventDefault();
          setTab(next);
          document.getElementById(`access-tab-${next}`)?.focus();
        }}
      >
        {tabs.map(([key, label]) => (
          <button
            key={key}
            id={`access-tab-${key}`}
            role="tab"
            type="button"
            aria-selected={current === key}
            aria-controls={`access-panel-${key}`}
            tabIndex={current === key ? 0 : -1}
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
              current === key
                ? "bg-brand-600 text-white"
                : "text-slate-700 dark:text-slate-200 hover:bg-surface-light dark:hover:bg-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div id={`access-panel-${current}`} role="tabpanel" aria-labelledby={`access-tab-${current}`} tabIndex={0} className="focus:outline-none">
        {current === "structure" && <StructureTab positions={positions} nodes={nodes} />}
        {current === "positions" && (
          <PositionsTab grants={grants} roles={roles} nodes={nodes} canManage={can("ACCESS_GRANTS_MANAGE")} onChanged={onChanged} />
        )}
        {current === "roles" && <RolesTab roles={roles} catalog={catalog} canEdit={can("ACCESS_ROLES_MANAGE")} onChanged={onChanged} />}
        {current === "rules" && <RulesTab rules={rules} roles={roles} canEdit={can("ACCESS_RULES_MANAGE")} onChanged={onChanged} />}
        {current === "departments" && (
          <DepartmentsTab departments={departments} nodes={nodes} canEdit={can("MANAGE_DEPARTMENTS")} onChanged={onChanged} />
        )}
        {current === "explorer" && <ExplorerTab nodes={nodes} canPreview={can("ACCESS_PREVIEW_AS")} />}
        {current === "audit" && <AuditTab />}
      </div>
    </div>
  );
}
