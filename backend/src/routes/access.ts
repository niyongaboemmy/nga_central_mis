import express from "express";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireServiceToken } from "../middleware/serviceAuth";
import { successResponse } from "../utils/response";
import { db } from "../db";
import {
  AccessAudit,
  AccessManifestRow,
  AccessPermission,
  AccessRole,
  AccessRule,
  AccessShadowDiff,
} from "../db/accessSchema";
import { System } from "../db/schema";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "../errors/CustomError";
import { decide, Depth, DEPTHS, Manifest, parseNode, Target } from "../vendor/nga-access";
import { computeMisInsight, InsightError, listWidgets } from "../services/access/insights";
import { engineReady, requireCapability } from "../services/access/policy";
import { coversNode } from "../services/access/delegation";
import { getSnapshot } from "../services/access/snapshotCache";
import { ensurePresets, syncManifest, ManifestValidationError, writeAudit } from "../services/access/registry";
import { syncRuleGrants } from "../services/access/ruleEngine";
import { appForClient, APP_LABELS } from "../access/apps";
import {
  createRole,
  createRule,
  hierarchyNodes,
  holdersOf,
  listDepartments,
  listGrants,
  listRoles,
  saveDepartment,
  setDepartmentSubjects,
  setRoleStatus,
  updateRole,
  updateRule,
} from "../services/access/admin";
import {
  certifyGrant,
  createGrant,
  endGrant,
  setGrantSuspended,
} from "../services/access/grants";

/**
 * Access control v2 API (ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md §7, §9).
 * Every endpoint here is new: the v2 engine always decides, whatever
 * ACCESS_V2_MIS_MODE says about the legacy routes.
 */
const router = express.Router();

const ONE_OF_APPS = /^[a-z][a-z0-9]{1,29}$/;
const appParam = (raw: unknown) => {
  const app = String(raw ?? "mis").toLowerCase();
  if (app !== "*" && !ONE_OF_APPS.test(app)) throw new ValidationError("Invalid app");
  return app;
};
const intParam = (raw: unknown, name: string) => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`Invalid ${name}`);
  return n;
};
const optInt = (raw: unknown) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const targetFromQuery = (q: any): Target => ({
  programId: optInt(q.programId),
  departmentId: optInt(q.departmentId),
  gradeId: optInt(q.gradeId),
  classGroupId: optInt(q.classGroupId),
  subjectId: optInt(q.subjectId),
  studentId: optInt(q.studentId),
  ownerId: optInt(q.ownerId),
});
const depthParam = (raw: unknown): Depth | null => {
  if (raw === undefined || raw === "") return null;
  if (!DEPTHS.includes(raw as Depth)) throw new ValidationError("Invalid depth");
  return raw as Depth;
};

/** 503 instead of SQL errors when migration 090 is missing on this server. */
router.use(
  asyncHandler(async (_req: any, res: any, next: any) => {
    if (!(await engineReady())) {
      return res.status(503).json({ success: false, message: "Access control v2 is not installed on this server (migration 090)." });
    }
    next();
  }),
);

// ---------------------------------------------------------------------------
// App-to-MIS endpoints (client credentials / integration token)
// ---------------------------------------------------------------------------

/** An app publishes its capability manifest on deploy (plan §6). */
router.put(
  "/manifests/:app",
  requireServiceToken("access:publish"),
  asyncHandler(async (req: any, res: any) => {
    const app = appParam(req.params.app);
    // Client credentials identify a System; it may only publish its own app.
    const systemId = -Number(req.service?.tokenId);
    const [system] = systemId > 0
      ? await db.select({ client_id: System.client_id }).from(System).where(eq(System.system_id, systemId)).limit(1)
      : [];
    if (!system || appForClient(system.client_id) !== app || app === "mis") {
      throw new AuthorizationError(`This client may not publish the "${app}" manifest`);
    }
    const manifest = req.body as Manifest;
    if (manifest?.app !== app) throw new ValidationError("Manifest app does not match the URL");
    try {
      const result = await syncManifest(manifest);
      // Newly registered capabilities pick up their preset links now
      // (insert-only; links leadership removed are never re-added).
      const presets = result.created.length || result.revived.length ? await ensurePresets() : null;
      successResponse(res, result.unchanged ? "Manifest unchanged" : "Manifest published", {
        ...result,
        presetLinksAdded: presets?.linksAdded.length ?? 0,
      });
    } catch (err) {
      if (err instanceof ManifestValidationError) throw new ValidationError("Invalid manifest", err.errors);
      throw err;
    }
  }),
);

/** Who can do `cap` on a target -- approval pools and notification routing. */
router.get(
  "/holders",
  requireServiceToken("access:read"),
  asyncHandler(async (req: any, res: any) => {
    const app = appParam(req.query.app);
    const cap = String(req.query.cap ?? "");
    if (!/^[A-Z][A-Z0-9_]{1,98}$/.test(cap)) throw new ValidationError("Invalid cap");
    const name = app === "mis" ? cap : `${app}:${cap}`;
    const holders = await holdersOf(name, targetFromQuery(req.query), depthParam(req.query.minDepth));
    successResponse(res, "Holders", holders);
  }),
);

/** Apps report restricted (sensitive) reads so they appear in one audit log. */
router.post(
  "/audit",
  requireServiceToken("access:publish"),
  asyncHandler(async (req: any, res: any) => {
    const b = req.body ?? {};
    const action = String(b.action ?? "");
    if (!/^[a-z0-9_.:-]{3,60}$/i.test(action)) throw new ValidationError("Invalid action");
    await writeAudit({
      actorId: optInt(b.actor_id),
      subjectUserId: optInt(b.subject_user_id),
      action: `app.${action}`.slice(0, 60),
      target: { ...(typeof b.target === "object" ? b.target : {}), by: req.service?.name },
      reason: b.reason ? String(b.reason).slice(0, 500) : null,
    });
    successResponse(res, "Recorded", null, 201);
  }),
);

// ---------------------------------------------------------------------------
// Everything below is for signed-in users
// ---------------------------------------------------------------------------
router.use(authenticate);

/** My access snapshot for one app (plan §7.1). */
router.get(
  "/me",
  asyncHandler(async (req: any, res: any) => {
    successResponse(res, "Access snapshot", await getSnapshot(req.user.userId, appParam(req.query.app)));
  }),
);

/** "Why can / can't X do Y here?" -- own decisions, or anyone's with Studio access. */
router.get(
  "/explain",
  asyncHandler(async (req: any, res: any) => {
    const userId = optInt(req.query.userId) ?? req.user.userId;
    if (userId !== req.user.userId) {
      // Someone else's access is as sensitive as previewing it (audited).
      const me = await getSnapshot(req.user.userId, "mis");
      if (!decide(me, "ACCESS_PREVIEW_AS").allowed) throw new AuthorizationError("Forbidden");
      await writeAudit({ actorId: req.user.userId, subjectUserId: userId, action: "access.explain", target: { cap: req.query.cap } });
    }
    const app = appParam(req.query.app);
    const cap = String(req.query.cap ?? "");
    const snapshot = await getSnapshot(userId, app);
    const d = decide(snapshot, cap, targetFromQuery(req.query), depthParam(req.query.minDepth));
    successResponse(res, "Decision", {
      ...d,
      grants: d.via.map((id) => ({ grant_id: id, ...snapshot.grants[String(id)] })),
    });
  }),
);

/** Read-only preview of another user's access (audited). */
router.get(
  "/users/:id",
  requireCapability("ACCESS_PREVIEW_AS"),
  asyncHandler(async (req: any, res: any) => {
    const userId = intParam(req.params.id, "user id");
    const app = appParam(req.query.app);
    await writeAudit({ actorId: req.user.userId, subjectUserId: userId, action: "access.preview", target: { app } });
    successResponse(res, "Access snapshot", await getSnapshot(userId, app));
  }),
);

/** Capability catalog grouped for the role editor. */
router.get(
  "/catalog",
  requireCapability("ACCESS_STUDIO_VIEW"),
  asyncHandler(async (_req: any, res: any) => {
    const rows = await db.select().from(AccessPermission).where(eq(AccessPermission.status, "ACTIVE"));
    const manifests = await db
      .select({ app: AccessManifestRow.app, version: AccessManifestRow.version, published_at: AccessManifestRow.published_at })
      .from(AccessManifestRow);
    successResponse(res, "Catalog", {
      apps: manifests.map((m) => ({ ...m, label: APP_LABELS[m.app] ?? m.app })),
      capabilities: rows.map((r) => ({
        name: r.name,
        app: r.app,
        key: r.cap_key ?? r.name,
        label: r.label ?? r.description ?? r.name,
        domain: r.domain,
        kind: r.kind,
        depths: r.depths ? r.depths.split(",") : [],
        restricted: r.restricted === 1,
        scopeable: r.scopeable === 1,
        deprecated: r.deprecated_at !== null,
      })),
    });
  }),
);

router.get(
  "/nodes",
  requireCapability(["ACCESS_STUDIO_VIEW", "VIEW_LEADERSHIP_STRUCTURE"]),
  asyncHandler(async (_req: any, res: any) => successResponse(res, "Nodes", await hierarchyNodes())),
);

/** Who holds which position where (organisation chart). */
router.get(
  "/structure",
  requireCapability(["ACCESS_STUDIO_VIEW", "VIEW_LEADERSHIP_STRUCTURE"]),
  asyncHandler(async (_req: any, res: any) => {
    const grants = (await listGrants({ status: "ACTIVE" })).filter((g) =>
      ["PLATFORM", "SCHOOL", "PROGRAM", "DEPARTMENT", "GRADE", "CLASS_GROUP"].includes(g.scope_type),
    );
    // Presets let the chart name key posts and flag the vacant ones.
    const presetOf = new Map(
      (await db.select({ role_id: AccessRole.role_id, preset_key: AccessRole.preset_key }).from(AccessRole)).map((r) => [r.role_id, r.preset_key]),
    );
    successResponse(res, "Structure", {
      nodes: await hierarchyNodes(),
      positions: grants.map((g) => ({
        grant_id: g.grant_id,
        user_id: g.user_id,
        full_name: g.full_name,
        role_id: g.role_id,
        role_name: g.role_name,
        preset_key: presetOf.get(g.role_id) ?? null,
        title: g.title,
        scope_type: g.scope_type,
        scope_id: g.scope_id,
        valid_until: g.valid_until,
        source: g.source,
      })),
    });
  }),
);

// Leadership Insights (aggregates) -------------------------------------------------
router.get(
  "/insights/widgets",
  asyncHandler(async (req: any, res: any) => {
    const parsed = parseNode(String(req.query.node ?? "SCHOOL"));
    if (!parsed) throw new ValidationError("Invalid node");
    const node = {
      scopeType: parsed.type,
      scopeId: parsed.target.programId ?? parsed.target.departmentId ?? parsed.target.gradeId ?? parsed.target.subjectId ?? parsed.target.classGroupId ?? null,
      scopeId2: parsed.type === "SUBJECT_CLASS" ? parsed.target.classGroupId ?? null : null,
    };
    const all = await getSnapshot(req.user.userId, "*");
    successResponse(res, "Widgets", await listWidgets(all, node));
  }),
);
router.get(
  "/insights/:metric",
  asyncHandler(async (req: any, res: any) => {
    const mis = await getSnapshot(req.user.userId, "mis");
    try {
      successResponse(
        res,
        "Insight",
        await computeMisInsight(mis, String(req.params.metric), String(req.query.node ?? "SCHOOL"), req.query.groupBy ? String(req.query.groupBy) : undefined),
      );
    } catch (err) {
      if (err instanceof InsightError) return res.status(err.status).json({ success: false, message: err.message });
      throw err;
    }
  }),
);

// Roles ----------------------------------------------------------------------
router.get(
  "/roles",
  requireCapability("ACCESS_STUDIO_VIEW"),
  asyncHandler(async (_req: any, res: any) => successResponse(res, "Roles", await listRoles())),
);
router.post(
  "/roles",
  requireCapability("ACCESS_ROLES_MANAGE"),
  asyncHandler(async (req: any, res: any) => {
    const roleId = await createRole(req.user.userId, req.body ?? {});
    successResponse(res, "Role created", { role_id: roleId }, 201);
  }),
);
router.patch(
  "/roles/:id",
  requireCapability("ACCESS_ROLES_MANAGE"),
  asyncHandler(async (req: any, res: any) => {
    await updateRole(req.user.userId, intParam(req.params.id, "role id"), req.body ?? {});
    successResponse(res, "Role updated");
  }),
);
router.post(
  "/roles/:id/:action(disable|enable)",
  requireCapability("ACCESS_ROLES_MANAGE"),
  asyncHandler(async (req: any, res: any) => {
    await setRoleStatus(req.user.userId, intParam(req.params.id, "role id"), req.params.action === "enable" ? "ACTIVE" : "DISABLED");
    successResponse(res, `Role ${req.params.action}d`);
  }),
);

// Grants ---------------------------------------------------------------------
router.get(
  "/grants",
  requireCapability("ACCESS_STUDIO_VIEW"),
  asyncHandler(async (req: any, res: any) => {
    const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    if (status && !["ACTIVE", "SUSPENDED", "ENDED"].includes(status)) throw new ValidationError("Invalid status");
    const rows = await listGrants({
      userId: optInt(req.query.userId) ?? undefined,
      roleId: optInt(req.query.roleId) ?? undefined,
      scopeType: req.query.scopeType ? String(req.query.scopeType).toUpperCase() : undefined,
      scopeId: optInt(req.query.scopeId) ?? undefined,
      status,
    });
    // Only grants at nodes inside the viewer's own Studio scope (a DOS sees
    // their programme, not the school). Personal grants (SELF, MENTEES,
    // CHILDREN) are visible to school-wide viewers only.
    const all = await getSnapshot(req.user.userId, "*");
    const visible = rows.filter((g) =>
      ["SELF", "MENTEES", "CHILDREN"].includes(g.scope_type)
        ? coversNode(all, "ACCESS_STUDIO_VIEW", { scopeType: "SCHOOL" })
        : coversNode(all, "ACCESS_STUDIO_VIEW", { scopeType: g.scope_type, scopeId: g.scope_id, scopeId2: g.scope_id2 }),
    );
    // Justifications are for people who can manage that grant.
    const canManage = (g: (typeof rows)[number]) =>
      coversNode(all, "ACCESS_GRANTS_MANAGE", { scopeType: g.scope_type === "PLATFORM" ? "PLATFORM" : g.scope_type, scopeId: g.scope_id, scopeId2: g.scope_id2 });
    successResponse(
      res,
      "Grants",
      visible.map((g) => (canManage(g) ? g : { ...g, justification: null })),
    );
  }),
);
router.post(
  "/grants",
  requireCapability("ACCESS_GRANTS_MANAGE"),
  asyncHandler(async (req: any, res: any) => {
    const grantId = await createGrant(req.user.userId, req.body ?? {});
    successResponse(res, "Position assigned", { grant_id: grantId }, 201);
  }),
);
router.post(
  "/grants/:id/end",
  requireCapability("ACCESS_GRANTS_MANAGE"),
  asyncHandler(async (req: any, res: any) => {
    await endGrant(req.user.userId, intParam(req.params.id, "grant id"), req.body?.reason);
    successResponse(res, "Position ended");
  }),
);
router.post(
  "/grants/:id/:action(suspend|resume)",
  requireCapability("ACCESS_GRANTS_MANAGE"),
  asyncHandler(async (req: any, res: any) => {
    await setGrantSuspended(req.user.userId, intParam(req.params.id, "grant id"), req.params.action === "suspend", req.body?.reason);
    successResponse(res, req.params.action === "suspend" ? "Suspended" : "Resumed");
  }),
);
router.post(
  "/grants/:id/certify",
  requireCapability("ACCESS_GRANTS_MANAGE"),
  asyncHandler(async (req: any, res: any) => {
    await certifyGrant(req.user.userId, intParam(req.params.id, "grant id"));
    successResponse(res, "Certified");
  }),
);

// Rules ----------------------------------------------------------------------
router.get(
  "/rules",
  requireCapability("ACCESS_STUDIO_VIEW"),
  asyncHandler(async (_req: any, res: any) => successResponse(res, "Rules", await db.select().from(AccessRule))),
);
router.post(
  "/rules",
  requireCapability("ACCESS_RULES_MANAGE"),
  asyncHandler(async (req: any, res: any) => successResponse(res, "Rule created", await createRule(req.user.userId, req.body), 201)),
);
router.patch(
  "/rules/:id",
  requireCapability("ACCESS_RULES_MANAGE"),
  asyncHandler(async (req: any, res: any) =>
    successResponse(res, "Rule updated", await updateRule(req.user.userId, intParam(req.params.id, "rule id"), req.body ?? {})),
  ),
);
router.post(
  "/rules/sync",
  requireCapability("ACCESS_RULES_MANAGE"),
  asyncHandler(async (req: any, res: any) => successResponse(res, "Rules synced", await syncRuleGrants({ actorId: req.user.userId }))),
);

// Departments ------------------------------------------------------------------
router.get(
  "/departments",
  requireCapability(["ACCESS_STUDIO_VIEW", "VIEW_LEADERSHIP_STRUCTURE", "MANAGE_DEPARTMENTS"]),
  asyncHandler(async (_req: any, res: any) => successResponse(res, "Departments", await listDepartments())),
);
router.post(
  "/departments",
  requireCapability("MANAGE_DEPARTMENTS"),
  asyncHandler(async (req: any, res: any) =>
    successResponse(res, "Department created", { department_id: await saveDepartment(req.user.userId, req.body) }, 201),
  ),
);
router.patch(
  "/departments/:id",
  requireCapability("MANAGE_DEPARTMENTS"),
  asyncHandler(async (req: any, res: any) => {
    await saveDepartment(req.user.userId, req.body, intParam(req.params.id, "department id"));
    successResponse(res, "Department updated");
  }),
);
router.put(
  "/departments/:id/subjects",
  requireCapability("MANAGE_DEPARTMENTS"),
  asyncHandler(async (req: any, res: any) => {
    await setDepartmentSubjects(req.user.userId, intParam(req.params.id, "department id"), req.body?.subjectIds);
    successResponse(res, "Department subjects saved");
  }),
);

// Audit & shadow review -----------------------------------------------------------
router.get(
  "/audit",
  requireCapability("ACCESS_AUDIT_VIEW"),
  asyncHandler(async (req: any, res: any) => {
    const rows = await db
      .select()
      .from(AccessAudit)
      .where(
        and(
          optInt(req.query.userId) ? eq(AccessAudit.subject_user_id, optInt(req.query.userId)!) : undefined,
          req.query.action ? eq(AccessAudit.action, String(req.query.action)) : undefined,
        ),
      )
      .orderBy(desc(AccessAudit.audit_id))
      .limit(Math.min(optInt(req.query.limit) ?? 200, 1000));
    successResponse(res, "Audit", rows);
  }),
);
router.get(
  "/shadow-diffs",
  requireCapability("ACCESS_AUDIT_VIEW"),
  asyncHandler(async (req: any, res: any) => {
    const rows = await db
      .select()
      .from(AccessShadowDiff)
      .where(
        and(
          req.query.unreviewed === "1" ? isNull(AccessShadowDiff.reviewed_at) : undefined,
          req.query.since ? gte(AccessShadowDiff.last_seen, new Date(String(req.query.since))) : undefined,
        ),
      )
      .orderBy(desc(AccessShadowDiff.hits))
      .limit(1000);
    successResponse(res, "Shadow differences", rows);
  }),
);
router.post(
  "/shadow-diffs/review",
  requireCapability("ACCESS_AUDIT_VIEW"),
  asyncHandler(async (req: any, res: any) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((n: number) => n > 0) : [];
    if (ids.length === 0) throw new ValidationError("ids are required");
    await db
      .update(AccessShadowDiff)
      .set({ reviewed_at: new Date(), reviewed_by: req.user.userId, review_note: String(req.body?.note ?? "").slice(0, 255) || null })
      .where(inArray(AccessShadowDiff.diff_id, ids));
    successResponse(res, "Marked reviewed");
  }),
);

router.use((_req: any, _res: any, next: any) => next(new NotFoundError("Not found")));

export default router;
