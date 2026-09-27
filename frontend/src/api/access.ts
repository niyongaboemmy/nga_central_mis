import api from "../services/api";
import type { AccessSnapshot, Depth, ScopeType } from "../vendor/nga-access";

/**
 * Access control v2 API (backend/src/routes/access.ts). Every call returns the
 * unwrapped `data` of the `{ success, message, data }` envelope.
 */

type Envelope<T> = { success: boolean; message: string; data: T };
const unwrap = <T,>(p: Promise<{ data: Envelope<T> }>) => p.then((r) => r.data.data);

export interface CatalogCapability {
  name: string;
  app: string;
  key: string;
  label: string;
  domain: string | null;
  kind: "READ" | "WRITE";
  depths: Depth[];
  restricted: boolean;
  scopeable: boolean;
  deprecated: boolean;
}

export interface Catalog {
  apps: Array<{ app: string; label: string; version: string | null; published_at: string }>;
  capabilities: CatalogCapability[];
}

export interface RoleCapability {
  name: string;
  app: string;
  kind: "READ" | "WRITE";
  depth: Depth | null;
  deprecated: boolean;
}

export interface AccessRoleRow {
  role_id: number;
  name: string;
  description: string | null;
  status: "ACTIVE" | "DISABLED";
  preset_key: string | null;
  category: string | null;
  allowed_scope_types: ScopeType[];
  max_holders: number | null;
  platform_only: number;
  is_preset: number;
  version: number;
  holders: number;
  capabilities: RoleCapability[];
}

export interface GrantRow {
  grant_id: number;
  user_id: number;
  full_name: string;
  username: string;
  role_id: number;
  role_name: string;
  preset_key?: string | null;
  scope_type: ScopeType;
  scope_id: number | null;
  scope_id2: number | null;
  academic_year_id: number | null;
  academic_year_name?: string | null;
  valid_from: string | null;
  valid_until: string | null;
  title: string | null;
  justification: string | null;
  source: "MANUAL" | "RULE" | "MIGRATION";
  status: "ACTIVE" | "SUSPENDED" | "ENDED";
  last_certified_at: string | null;
}

export interface Nodes {
  programs: Array<{ id: number; name: string }>;
  grades: Array<{ id: number; name: string; program_id: number; level_order: number }>;
  classGroups: Array<{ id: number; name: string; grade_id: number }>;
  departments: Array<{ id: number; code: string; name: string; status: string }>;
  subjects: Array<{ id: number; code: string; name: string }>;
}

export interface RuleRow {
  rule_id: number;
  rule_key: string | null;
  name: string;
  trigger_type: "PERSONA" | "CLASS_TEACHER" | "SUBJECT_TEACHER" | "PROGRAM_LEAD" | "MENTOR" | "PARENT";
  trigger_filter: string | null;
  role_id: number;
  status: "ACTIVE" | "PAUSED";
}

export interface DepartmentRow {
  department_id: number;
  code: string;
  name: string;
  status: "ACTIVE" | "DISABLED";
  subjects: Array<{ subject_id: number; code: string; name: string }>;
}

export interface AuditRow {
  audit_id: number;
  actor_id: number | null;
  subject_user_id: number | null;
  action: string;
  target: string | null;
  reason: string | null;
  created_at: string;
}

export interface ShadowDiffRow {
  diff_id: number;
  user_id: number;
  capability: string;
  route: string;
  legacy_allowed: number;
  v2_allowed: number;
  v2_depth: string | null;
  hits: number;
  last_seen: string;
  reviewed_at: string | null;
}

export interface Decision {
  allowed: boolean;
  depth: Depth | null;
  via: number[];
  grants: Array<{ grant_id: number; role: string; scope_type: ScopeType; scope_id: number | null }>;
}

export interface GrantInput {
  user_id: number;
  role_id: number;
  scope_type: ScopeType;
  scope_id?: number | null;
  scope_id2?: number | null;
  valid_from?: string | null;
  valid_until?: string | null;
  title?: string | null;
  justification?: string | null;
}

export interface InsightWidget {
  app: string;
  app_label: string;
  metric: string;
  label: string;
  source: "mis" | "app";
}

export interface InsightResult {
  metric: string;
  label: string;
  unit: string;
  node: string;
  groupBy: string;
  depth: Depth;
  min_cohort: number;
  rows: Array<{ key: number | string; label: string; value: number | null; n: number; suppressed: boolean }>;
  total: { value: number | null; n: number; suppressed: boolean };
}

export const accessApi = {
  insightWidgets: (node: string) => unwrap<InsightWidget[]>(api.get(`/access/insights/widgets`, { params: { node } })),
  insight: (metric: string, node: string, groupBy?: string) =>
    unwrap<InsightResult>(api.get(`/access/insights/${encodeURIComponent(metric)}`, { params: { node, groupBy } })),
  me: (app = "mis") => unwrap<AccessSnapshot>(api.get(`/access/me`, { params: { app } })),
  previewUser: (userId: number, app = "mis") =>
    unwrap<AccessSnapshot>(api.get(`/access/users/${userId}`, { params: { app } })),
  explain: (params: Record<string, string | number | undefined>) =>
    unwrap<Decision>(api.get(`/access/explain`, { params })),
  catalog: () => unwrap<Catalog>(api.get(`/access/catalog`)),
  nodes: () => unwrap<Nodes>(api.get(`/access/nodes`)),
  structure: () =>
    unwrap<{ nodes: Nodes; positions: GrantRow[] }>(api.get(`/access/structure`)),

  roles: () => unwrap<AccessRoleRow[]>(api.get(`/access/roles`)),
  createRole: (body: Partial<AccessRoleRow> & { capabilities: Array<{ name: string; depth?: Depth | null }> }) =>
    unwrap<{ role_id: number }>(api.post(`/access/roles`, body)),
  updateRole: (roleId: number, body: Record<string, unknown>) => unwrap<void>(api.patch(`/access/roles/${roleId}`, body)),
  setRoleEnabled: (roleId: number, enabled: boolean) =>
    unwrap<void>(api.post(`/access/roles/${roleId}/${enabled ? "enable" : "disable"}`)),

  grants: (params: Record<string, string | number | undefined> = {}) =>
    unwrap<GrantRow[]>(api.get(`/access/grants`, { params })),
  createGrant: (body: GrantInput) => unwrap<{ grant_id: number }>(api.post(`/access/grants`, body)),
  endGrant: (grantId: number, reason: string) => unwrap<void>(api.post(`/access/grants/${grantId}/end`, { reason })),
  suspendGrant: (grantId: number, reason: string) =>
    unwrap<void>(api.post(`/access/grants/${grantId}/suspend`, { reason })),
  resumeGrant: (grantId: number) => unwrap<void>(api.post(`/access/grants/${grantId}/resume`, {})),
  certifyGrant: (grantId: number) => unwrap<void>(api.post(`/access/grants/${grantId}/certify`, {})),

  rules: () => unwrap<RuleRow[]>(api.get(`/access/rules`)),
  updateRule: (ruleId: number, body: Partial<RuleRow> & { trigger_filter?: unknown }) =>
    unwrap<unknown>(api.patch(`/access/rules/${ruleId}`, body)),
  createRule: (body: Record<string, unknown>) => unwrap<unknown>(api.post(`/access/rules`, body)),
  syncRules: () => unwrap<unknown>(api.post(`/access/rules/sync`)),

  departments: () => unwrap<DepartmentRow[]>(api.get(`/access/departments`)),
  createDepartment: (body: { code: string; name: string }) =>
    unwrap<{ department_id: number }>(api.post(`/access/departments`, body)),
  updateDepartment: (id: number, body: { code: string; name: string; status?: string }) =>
    unwrap<void>(api.patch(`/access/departments/${id}`, body)),
  setDepartmentSubjects: (id: number, subjectIds: number[]) =>
    unwrap<void>(api.put(`/access/departments/${id}/subjects`, { subjectIds })),

  audit: (params: Record<string, string | number | undefined> = {}) =>
    unwrap<AuditRow[]>(api.get(`/access/audit`, { params })),
  shadowDiffs: (unreviewed = true) =>
    unwrap<ShadowDiffRow[]>(api.get(`/access/shadow-diffs`, { params: { unreviewed: unreviewed ? 1 : undefined } })),
  reviewShadowDiffs: (ids: number[], note?: string) =>
    unwrap<void>(api.post(`/access/shadow-diffs/review`, { ids, note })),
};

/** Human message from an API error (validation lists included). */
export function accessErrorMessage(err: any): string {
  const data = err?.response?.data;
  if (Array.isArray(data?.errors) && data.errors.length) {
    return `${data.message}: ${data.errors.map((e: unknown) => (typeof e === "string" ? e : JSON.stringify(e))).join("; ")}`;
  }
  return data?.message ?? err?.message ?? "Something went wrong";
}
