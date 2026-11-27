import { Request, Response } from "express";
import { db as tenantDb, primaryDb } from "../db";
import { responseTenant } from "../tenancy/claims";
import { assignSystem, filterAssignedSystems, systemRefusal } from "../tenancy/systems";
import { PRIMARY_TENANT_ID } from "../vendor/nga-tenancy";
import { parseScopes, writeSystemScopes } from "../tenancy/systemScopes";
import { controlPool, isControlPlaneMissing } from "../db/platform";
import { invalidateModules, resolveSchoolIds, schoolModules } from "../services/tenantMgmt/modules";
import { moduleKey } from "../services/tenantMgmt/catalog";
import { setModuleForSchools, setTenantApp } from "../services/tenantMgmt/lifecycle";
import { onEntitlementsChanged } from "../services/tenantMgmt/entitlementsChanged";

// System rows are global (the primary tenant's DB); only the primary tenant
// manages them ([MIS-A17]). Everything else in this file is tenant data.
const db = tenantDb;
const platformOnly = (res: Response) =>
  res.status(403).json({ success: false, code: "PLATFORM_ONLY", message: "Only the platform manages systems." });
import {
  System,
  SchoolSystemAssignment,
  RoleSystemFragment,
  School,
  Role,
  ActivityLog,
  User,
  UserProfile,
} from "../db/schema";
import { eq, and, desc, gte, lte, like } from "drizzle-orm";
import crypto from "crypto";
import { auditCsv, auditFacets, listAuditLogs, parseAuditFilters, summarizeAuditLogs } from "../services/auditLog";
import { validBackchannelUri } from "../services/sso/backchannelLogout";
import { hashClientSecret, isHashedClientSecret } from "../utils/ssoClientSecret";

export const createSystem = async (req: Request, res: Response) => {
  if (!responseTenant().isPrimary) return platformOnly(res);
  const db = primaryDb();
  try {
    const {
      name,
      description,
      client_id,
      allowed_redirect_uris,
      icon_url,
      home_url,
    } = req.body;

    let backchannel_logout_uri: string | null | undefined;
    try {
      backchannel_logout_uri = validBackchannelUri(req.body.backchannel_logout_uri);
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }

    if (!icon_url || !home_url) {
      return res
        .status(400)
        .json({ message: "icon_url and home_url are mandatory" });
    }

    const existingSystem = await db
      .select()
      .from(System)
      .where(eq(System.name, name));

    if (existingSystem.length > 0) {
      return res
        .status(400)
        .json({ message: "System with this name already exists" });
    }

    // Generate client_secret if client_id is provided
    let client_secret: string | undefined;
    if (client_id) {
      client_secret = crypto.randomBytes(32).toString("hex");
    }

    // Stored as a bcrypt hash ([MIS-A12]); the plaintext is returned once, below.
    await db.insert(System).values({
      name,
      description,
      client_id,
      client_secret: client_secret ? await hashClientSecret(client_secret) : client_secret,
      allowed_redirect_uris,
      icon_url,
      home_url,
      backchannel_logout_uri: backchannel_logout_uri ?? null,
    });
    const [created] = await db.select({ id: System.system_id }).from(System).where(eq(System.name, name)).limit(1);
    // Service scopes ([MIS-A11]); omitted = legacy (every scope).
    if (req.body.scopes !== undefined && created) await writeSystemScopes(created.id, parseScopes(req.body.scopes));
    invalidateModules();
    // Systems are assigned per school, the primary included (tenancy/systems.ts).
    // `tenant_ids` says which schools get the new module: a list of school ids, or
    // "all". Without it the module is the primary school's only (the behaviour
    // before the form asked), unless assign_primary is false.
    if (created && req.body.tenant_ids !== undefined) {
      try {
        const tids = await resolveSchoolIds(req.body.tenant_ids);
        await setModuleForSchools(created.id, tids, "ACTIVE", { userId: (req as any).user?.userId ?? null, ip: req.ip ?? null });
      } catch (error) {
        console.error("Error assigning the new system to schools:", error);
      }
    } else if (created && req.body.assign_primary !== false) {
      await assignSystem(PRIMARY_TENANT_ID, created.id).catch((error) => console.error("Error assigning system to tenant 1:", error));
    }

    res.status(201).json({
      message: "System created successfully",
      data: { client_id, client_secret, system_id: created?.id ?? null }, // Return credentials if created
    });
  } catch (error) {
    console.error("Error creating system:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getAllSystems = async (req: Request, res: Response) => {
  try {
    const systems = await primaryDb().select().from(System);
    if (!responseTenant().isPrimary) {
      // A school sees only its assigned apps, never their secrets.
      const mine = await filterAssignedSystems(systems);
      return res.status(200).json(mine.map(({ client_secret: _s, ...rest }) => rest));
    }
    res.status(200).json(systems);
  } catch (error) {
    console.error("Error fetching systems:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getSystemById = async (req: Request, res: Response) => {
  if (!responseTenant().isPrimary) return platformOnly(res);
  const db = primaryDb();
  try {
    const { id } = req.params;
    const systems = await db
      .select()
      .from(System)
      .where(eq(System.system_id, Number(id)));

    if (systems.length === 0) {
      return res.status(404).json({ message: "System not found" });
    }

    res.status(200).json(systems[0]);
  } catch (error) {
    console.error("Error fetching system:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateSystem = async (req: Request, res: Response) => {
  if (!responseTenant().isPrimary) return platformOnly(res);
  const db = primaryDb();
  try {
    const { id } = req.params;
    const {
      name,
      description,
      status,
      client_id,
      allowed_redirect_uris,
      icon_url,
      home_url,
    } = req.body;

    let backchannel_logout_uri: string | null | undefined;
    try {
      backchannel_logout_uri = validBackchannelUri(req.body.backchannel_logout_uri);
    } catch (e: any) {
      return res.status(400).json({ message: e.message });
    }

    const existingSystem = await db
      .select()
      .from(System)
      .where(eq(System.system_id, Number(id)));

    if (existingSystem.length === 0) {
      return res.status(404).json({ message: "System not found" });
    }

    if (name && name !== existingSystem[0].name) {
      const nameCheck = await db
        .select()
        .from(System)
        .where(eq(System.name, name));
      if (nameCheck.length > 0) {
        return res
          .status(400)
          .json({ message: "System with this name already exists" });
      }
    }

    // Generate new secret if client_id is being set for the first time
    let client_secret = existingSystem[0].client_secret;
    let storedSecret = client_secret;
    if (client_id && !existingSystem[0].client_id) {
      client_secret = crypto.randomBytes(32).toString("hex");
      storedSecret = await hashClientSecret(client_secret);
    }

    await db
      .update(System)
      .set({
        name,
        description,
        status,
        client_id,
        client_secret: storedSecret,
        allowed_redirect_uris,
        icon_url,
        home_url,
        // Left untouched when the form doesn't send it.
        ...(backchannel_logout_uri === undefined ? {} : { backchannel_logout_uri }),
      })
      .where(eq(System.system_id, Number(id)));
    if (req.body.scopes !== undefined) await writeSystemScopes(Number(id), parseScopes(req.body.scopes));

    invalidateModules();
    res.status(200).json({
      message: "System updated successfully",
      // A hashed secret (scripts/hash-sso-client-secrets.ts) is not the
      // secret itself -- never echo it back as if it were.
      data: {
        client_id,
        client_secret: isHashedClientSecret(client_secret) ? null : client_secret,
      },
    });
  } catch (error) {
    console.error("Error updating system:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteSystem = async (req: Request, res: Response) => {
  if (!responseTenant().isPrimary) return platformOnly(res);
  const db = primaryDb();
  try {
    const { id } = req.params;
    const systemId = Number(id);

    const existingSystem = await db
      .select()
      .from(System)
      .where(eq(System.system_id, systemId));

    if (existingSystem.length === 0) {
      return res.status(404).json({ message: "System not found" });
    }

    // Role assignments are the schools' own data: ask for them to be removed first.
    // SchoolSystemAssignment rows are leftovers of the pre-tenancy assignment
    // screen (nothing reads them any more), so they go with the module.
    const roleAssignments = await db
      .select({ fragment_id: RoleSystemFragment.fragment_id })
      .from(RoleSystemFragment)
      .where(eq(RoleSystemFragment.system_id, systemId));
    if (roleAssignments.length > 0) {
      return res.status(409).json({
        message: `Cannot delete this module: it is still assigned to ${roleAssignments.length} role(s). Remove those assignments first.`,
      });
    }
    await db.delete(SchoolSystemAssignment).where(eq(SchoolSystemAssignment.system_id, systemId));

    await db.delete(System).where(eq(System.system_id, systemId));
    invalidateModules();
    // The module is gone for every school: drop its switches and take it out of
    // the packages and overrides that named it.
    try {
      await controlPool().query("DELETE FROM TenantSystem WHERE system_id = ?", [systemId]);
      await controlPool().query("DELETE FROM PackageEntitlement WHERE ent_key = ?", [moduleKey(systemId)]);
      await controlPool().query("DELETE FROM TenantEntitlementOverride WHERE ent_key = ?", [moduleKey(systemId)]);
      await onEntitlementsChanged();
    } catch (error) {
      if (!isControlPlaneMissing(error)) console.error("Error cleaning up a deleted system's assignments:", error);
    }

    res.status(200).json({ message: "System deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting system:", error);
    if (error?.code === "ER_ROW_IS_REFERENCED_2" || error?.errno === 1451) {
      return res.status(409).json({
        message:
          "Cannot delete this module: other records still reference it.",
      });
    }
    res.status(500).json({ message: "Internal server error" });
  }
};

// --- Assignments ---

/**
 * Switch a module on or off for the school the request runs in (School profile ->
 * Configure -> System Assignments). This is the same switch as the platform
 * console's school -> Plan & apps: a TenantSystem row. Only the platform may flip
 * it; a school sees what it has and asks for the rest through its subscription.
 *
 * (Before multi-tenancy these wrote SchoolSystemAssignment, which nothing reads
 * any more: the switches looked right and changed nothing.)
 */
const setModuleForThisSchool = async (req: Request, res: Response, status: "ACTIVE" | "DISABLED") => {
  const tenant = responseTenant();
  if (!tenant.isPrimary) {
    return res.status(403).json({
      success: false,
      code: "PLATFORM_ONLY",
      message: "Modules are switched on for your school by Amashuri. See Subscription, or contact support.",
    });
  }
  const systemId = Number(req.body?.system_id);
  if (!Number.isInteger(systemId) || systemId <= 0) return res.status(400).json({ message: "Choose a module." });
  try {
    await setTenantApp(tenant.tid, systemId, status, { userId: (req as any).user?.userId ?? null, ip: req.ip ?? null });
    return res.status(status === "ACTIVE" ? 201 : 200).json({
      message: status === "ACTIVE" ? "Module switched on for this school" : "Module switched off for this school",
    });
  } catch (error: any) {
    if (isControlPlaneMissing(error)) {
      // A single-school install with no control plane: the school has every module.
      return res.status(200).json({ message: "This school has every module." });
    }
    if (error?.statusCode) return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
    console.error("Error switching a module for this school:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const assignSystemToSchool = (req: Request, res: Response) => setModuleForThisSchool(req, res, "ACTIVE");

export const removeSystemFromSchool = (req: Request, res: Response) => setModuleForThisSchool(req, res, "DISABLED");

// Assign System to Role in School context
export const assignSystemToRoleInSchool = async (
  req: Request,
  res: Response,
) => {
  try {
    const { school_id, role_id, system_id } = req.body;

    // Check if role exists
    const role = await db.select().from(Role).where(eq(Role.role_id, role_id));
    if (role.length === 0)
      return res.status(404).json({ message: "Role not found" });

    // Check if school exists
    const school = await db
      .select()
      .from(School)
      .where(eq(School.school_id, school_id));
    if (school.length === 0)
      return res.status(404).json({ message: "School not found" });

    // Check if system exists
    const system = await db
      .select()
      .from(System)
      .where(eq(System.system_id, system_id));
    if (system.length === 0)
      return res.status(404).json({ message: "System not found" });

    // Only the school's own apps (TenantSystem, in its package) can go to its roles (plan §4).
    const refusal = await systemRefusal(system[0]);
    if (refusal) {
      return res.status(403).json({ success: false, code: refusal, message: "This app is not enabled for your school" });
    }

    // Check if assignments exists
    const existing = await db
      .select()
      .from(RoleSystemFragment)
      .where(
        and(
          eq(RoleSystemFragment.school_id, school_id),
          eq(RoleSystemFragment.role_id, role_id),
          eq(RoleSystemFragment.system_id, system_id),
        ),
      );

    if (existing.length > 0) {
      return res.status(400).json({
        message: "System already assigned to this role in this school",
      });
    }

    await db.insert(RoleSystemFragment).values({
      school_id,
      role_id,
      system_id,
    });

    res
      .status(201)
      .json({ message: "System assigned to role in school successfully" });
  } catch (error) {
    console.error("Error assigning system to role:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * The modules that are on for the school the request runs in: assigned
 * (TenantSystem) and, for a built-in app, in its package. Never the secrets.
 */
export const getSchoolSystems = async (_req: Request, res: Response) => {
  try {
    const systems = await primaryDb().select().from(System).where(eq(System.status, "ACTIVE"));
    const mine = await filterAssignedSystems(systems);
    res.json(mine.map(({ client_secret: _s, ...rest }) => rest));
  } catch (error) {
    console.error("Error fetching school systems:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Every module with its state for this school (on / off, from the package or set
 * by hand, and whether the school may change it): the rows of System Assignments.
 */
export const getSchoolModules = async (_req: Request, res: Response) => {
  try {
    const tenant = responseTenant();
    const modules = (await schoolModules(tenant.tid)).filter((m) => m.moduleStatus === "ACTIVE");
    res.json({
      canManage: tenant.isPrimary,
      modules: modules.map((m) => ({
        system_id: m.systemId,
        name: m.name,
        description: m.description,
        icon_url: m.iconUrl,
        on: m.status === "ACTIVE" && !m.needsPackage,
        source: m.source,
        inPackage: m.inPackage,
        needsPackage: m.needsPackage,
      })),
    });
  } catch (error) {
    console.error("Error fetching school modules:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getSchoolRoleAssignments = async (req: Request, res: Response) => {
  try {
    const { schoolId } = req.params;
    const result = await db
      .select({
        fragment_id: RoleSystemFragment.fragment_id,
        school_id: RoleSystemFragment.school_id,
        role_id: RoleSystemFragment.role_id,
        system_id: RoleSystemFragment.system_id,
        role_name: Role.name,
        system_name: System.name,
        assigned_at: RoleSystemFragment.assigned_at,
      })
      .from(RoleSystemFragment)
      .innerJoin(Role, eq(RoleSystemFragment.role_id, Role.role_id))
      .innerJoin(System, eq(RoleSystemFragment.system_id, System.system_id))
      .where(eq(RoleSystemFragment.school_id, Number(schoolId)));

    res.json(result);
  } catch (error) {
    console.error("Error fetching school role assignments:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const removeSystemFromRoleInSchool = async (
  req: Request,
  res: Response,
) => {
  try {
    const { school_id, role_id, system_id } = req.body;

    await db
      .delete(RoleSystemFragment)
      .where(
        and(
          eq(RoleSystemFragment.school_id, school_id),
          eq(RoleSystemFragment.role_id, role_id),
          eq(RoleSystemFragment.system_id, system_id),
        ),
      );

    res
      .status(200)
      .json({ message: "System removed from role in school successfully" });
  } catch (error) {
    console.error("Error removing system from role:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Audit log (ActivityLog) -- see services/auditLog.ts. Dates are YYYY-MM-DD
// (from/to, or the older start_date/end_date); default is the last 7 days.
export const getLogsHistory = async (req: Request, res: Response) => {
  try {
    const f = parseAuditFilters(req.query as Record<string, unknown>);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const { rows, total } = await listAuditLogs(f, { limit, offset });
    res.status(200).json({
      logs: rows,
      pagination: { total, limit, offset, hasMore: offset + rows.length < total },
      dateRange: { start_date: f.fromDay, end_date: f.toDay },
    });
  } catch (error) {
    console.error("Error fetching logs history:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getLogsSummary = async (req: Request, res: Response) => {
  try {
    const f = parseAuditFilters(req.query as Record<string, unknown>);
    const [summary, facets] = await Promise.all([summarizeAuditLogs(f), auditFacets(f)]);
    res.status(200).json({ ...summary, facets, dateRange: { start_date: f.fromDay, end_date: f.toDay } });
  } catch (error) {
    console.error("Error summarising logs history:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const exportLogsCsv = async (req: Request, res: Response) => {
  try {
    const f = parseAuditFilters(req.query as Record<string, unknown>);
    const csv = await auditCsv(f);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="audit-log-${f.fromDay}-to-${f.toDay}.csv"`);
    res.status(200).send(csv);
  } catch (error) {
    console.error("Error exporting logs history:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
