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
      })
      .where(eq(System.system_id, Number(id)));

    res.status(200).json({
      message: "System updated successfully",
      data: { client_id, client_secret },
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

// Get Logs History with date range filtering
// Default date range is 2 days
// start_date and end_date should be in ISO format (YYYY-MM-DD)
export const getLogsHistory = async (req: Request, res: Response) => {
  try {
    const {
      start_date,
      end_date,
      limit = 100,
      offset = 0,
      user_id,
    } = req.query;

    // Calculate default date range (last 2 days)
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    let startDate: Date;
    let endDate: Date;

    if (start_date && end_date) {
      startDate = new Date(String(start_date));
      endDate = new Date(String(end_date));
      // Set end date to end of day
      endDate.setHours(23, 59, 59, 999);
    } else {
      // Default to last 2 days
      startDate = twoDaysAgo;
      endDate = now;
    }

    // Build query conditions
    const conditions = [
      gte(ActivityLog.created_at, startDate),
      lte(ActivityLog.created_at, endDate),
    ];

    // Add user filter if provided
    if (user_id) {
      conditions.push(eq(ActivityLog.user_id, Number(user_id)));
    }

    // Query logs with date range filter
    const logs = await db
      .select()
      .from(ActivityLog)
      .where(and(...conditions))
      .orderBy(desc(ActivityLog.created_at))
      .limit(Number(limit))
      .offset(Number(offset));

    // Get total count for pagination
    const countResult = await db
      .select({ count: ActivityLog.activity_id })
      .from(ActivityLog)
      .where(and(...conditions));

    const total = countResult[0]?.count || 0;

    // Enrich logs with user and actor information
    // Get unique user IDs from logs
    const userIds = [
      ...new Set(
        logs.map((l) => l.user_id).filter((id): id is number => id !== null),
      ),
    ];
    const actorIds = [
      ...new Set(
        logs.map((l) => l.actor_id).filter((id): id is number => id !== null),
      ),
    ];
    const allIds = [...new Set([...userIds, ...actorIds])];

    // Fetch user info for all relevant IDs - fetch all users and filter in memory
    let userMap = new Map<
      number,
      {
        username: string | null;
        first_name: string | null;
        last_name: string | null;
      }
    >();

    if (allIds.length > 0) {
      const allUsers = await db
        .select({
          user_id: User.user_id,
          username: User.username,
          first_name: UserProfile.first_name,
          last_name: UserProfile.last_name,
        })
        .from(User)
        .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id));

      // Filter to only relevant users
      const relevantUsers = allUsers.filter((u) =>
        allIds.includes(Number(u.user_id)),
      );
      userMap = new Map(
        relevantUsers.map((u) => [
          Number(u.user_id),
          {
            username: u.username,
            first_name: u.first_name,
            last_name: u.last_name,
          },
        ]),
      );
    }

    // Transform logs with user info
    const enrichedLogs = logs.map((log) => {
      const user = userMap.get(Number(log.user_id));
      const actor = log.actor_id ? userMap.get(Number(log.actor_id)) : null;

      // Compute full names
      const userName = user
        ? [user.first_name, user.last_name].filter(Boolean).join(" ") ||
          user.username ||
          null
        : null;
      const actorName = actor
        ? [actor.first_name, actor.last_name].filter(Boolean).join(" ") ||
          actor.username ||
          null
        : null;

      return {
        ...log,
        user_username: user?.username || null,
        user_first_name: user?.first_name || null,
        user_last_name: user?.last_name || null,
        user_name: userName,
        actor_username: actor?.username || null,
        actor_first_name: actor?.first_name || null,
        actor_last_name: actor?.last_name || null,
        actor_name: actorName,
      };
    });

    res.status(200).json({
      logs: enrichedLogs,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: Number(offset) + logs.length < total,
      },
      dateRange: {
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDate.toISOString().split("T")[0],
      },
    });
  } catch (error) {
    console.error("Error fetching logs history:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
