import { Request, Response } from "express";
import { db } from "../db";
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
import { isHashedClientSecret } from "../utils/ssoClientSecret";

export const createSystem = async (req: Request, res: Response) => {
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

    await db.insert(System).values({
      name,
      description,
      client_id,
      client_secret,
      allowed_redirect_uris,
      icon_url,
      home_url,
      backchannel_logout_uri: backchannel_logout_uri ?? null,
    });

    res.status(201).json({
      message: "System created successfully",
      data: { client_id, client_secret }, // Return credentials if created
    });
  } catch (error) {
    console.error("Error creating system:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getAllSystems = async (req: Request, res: Response) => {
  try {
    const systems = await db.select().from(System);
    res.status(200).json(systems);
  } catch (error) {
    console.error("Error fetching systems:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getSystemById = async (req: Request, res: Response) => {
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
    if (client_id && !existingSystem[0].client_id) {
      client_secret = crypto.randomBytes(32).toString("hex");
    }

    await db
      .update(System)
      .set({
        name,
        description,
        status,
        client_id,
        client_secret,
        allowed_redirect_uris,
        icon_url,
        home_url,
        // Left untouched when the form doesn't send it.
        ...(backchannel_logout_uri === undefined ? {} : { backchannel_logout_uri }),
      })
      .where(eq(System.system_id, Number(id)));

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

    // System.system_id is referenced by SchoolSystemAssignment and
    // RoleSystemFragment with ON DELETE NO ACTION, so a module that's
    // assigned to any school or role would otherwise fail the DELETE with
    // an opaque FK constraint error. Check first and report clearly.
    const [schoolAssignments, roleAssignments] = await Promise.all([
      db
        .select({ school_id: SchoolSystemAssignment.school_id })
        .from(SchoolSystemAssignment)
        .where(eq(SchoolSystemAssignment.system_id, systemId)),
      db
        .select({ fragment_id: RoleSystemFragment.fragment_id })
        .from(RoleSystemFragment)
        .where(eq(RoleSystemFragment.system_id, systemId)),
    ]);

    if (schoolAssignments.length > 0 || roleAssignments.length > 0) {
      return res.status(409).json({
        message:
          "Cannot delete this module: it is still assigned to " +
          [
            schoolAssignments.length > 0
              ? `${schoolAssignments.length} school(s)`
              : null,
            roleAssignments.length > 0
              ? `${roleAssignments.length} role(s)`
              : null,
          ]
            .filter(Boolean)
            .join(" and ") +
          ". Remove those assignments first.",
      });
    }

    await db.delete(System).where(eq(System.system_id, systemId));

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

// Assign System to School
export const assignSystemToSchool = async (req: Request, res: Response) => {
  try {
    const { school_id, system_id } = req.body;

    const existingAssignment = await db
      .select()
      .from(SchoolSystemAssignment)
      .where(
        and(
          eq(SchoolSystemAssignment.school_id, school_id),
          eq(SchoolSystemAssignment.system_id, system_id),
        ),
      );

    if (existingAssignment.length > 0) {
      return res
        .status(400)
        .json({ message: "System already assigned to this school" });
    }

    await db.insert(SchoolSystemAssignment).values({
      school_id,
      system_id,
    });

    res.status(201).json({ message: "System assigned to school successfully" });
  } catch (error) {
    console.error("Error assigning system to school:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Remove System from School
export const removeSystemFromSchool = async (req: Request, res: Response) => {
  try {
    const { school_id, system_id } = req.body; // or params, depending on route choice. Using body for consistency.

    await db
      .delete(SchoolSystemAssignment)
      .where(
        and(
          eq(SchoolSystemAssignment.school_id, school_id),
          eq(SchoolSystemAssignment.system_id, system_id),
        ),
      );

    res
      .status(200)
      .json({ message: "System removed from school successfully" });
  } catch (error) {
    console.error("Error removing system from school:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

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

export const getSchoolSystems = async (req: Request, res: Response) => {
  try {
    const { schoolId } = req.params;
    const result = await db
      .select({
        system: System,
      })
      .from(SchoolSystemAssignment)
      .innerJoin(System, eq(SchoolSystemAssignment.system_id, System.system_id))
      .where(eq(SchoolSystemAssignment.school_id, Number(schoolId)));

    const systems = result.map((r) => r.system);
    res.json(systems);
  } catch (error) {
    console.error("Error fetching school systems:", error);
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
