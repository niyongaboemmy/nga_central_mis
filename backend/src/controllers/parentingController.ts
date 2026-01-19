import { Request, Response } from "express";
import { db } from "../db";
import { Parenting, User, UserProfile } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { AppError } from "../middleware/errorHandler";

export const getParents = async (req: Request, res: Response) => {
  const { studentId } = req.params;

  try {
    const parents = await db
      .select({
        parenting_id: Parenting.parenting_id,
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
        relationship: Parenting.relationship,
        created_at: Parenting.created_at,
        user_type: UserProfile.user_type,
      })
      .from(Parenting)
      .innerJoin(User, eq(Parenting.parent_id, User.user_id))
      .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .where(eq(Parenting.student_id, parseInt(studentId)));

    res.json({ success: true, data: parents });
  } catch (error) {
    console.error("Error fetching parents:", error);
    throw new AppError("Failed to fetch parents", 500);
  }
};

export const getStudents = async (req: Request, res: Response) => {
  const { parentId } = req.params;

  try {
    const students = await db
      .select({
        parenting_id: Parenting.parenting_id,
        user_id: User.user_id,
        username: User.username,
        email: User.email,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
        relationship: Parenting.relationship,
        created_at: Parenting.created_at,
        user_type: UserProfile.user_type,
      })
      .from(Parenting)
      .innerJoin(User, eq(Parenting.student_id, User.user_id))
      .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .where(eq(Parenting.parent_id, parseInt(parentId)));

    res.json({ success: true, data: students });
  } catch (error) {
    console.error("Error fetching students:", error);
    throw new AppError("Failed to fetch students", 500);
  }
};

export const assignParent = async (req: Request, res: Response) => {
  const { student_id, parent_id, relationship } = req.body;

  if (!student_id || !parent_id) {
    throw new AppError("Student ID and Parent ID are required", 400);
  }

  if (student_id === parent_id) {
    throw new AppError("Cannot assign user as their own parent", 400);
  }

  try {
    // Check if relationship already exists
    const existing = await db
      .select()
      .from(Parenting)
      .where(
        and(
          eq(Parenting.student_id, student_id),
          eq(Parenting.parent_id, parent_id),
        ),
      );

    if (existing.length > 0) {
      throw new AppError("Relationship already exists", 400);
    }

    // Check parent limit (max 2)
    const currentParents = await db
      .select({ count: sql<number>`count(*)` })
      .from(Parenting)
      .where(eq(Parenting.student_id, student_id));

    if (currentParents[0].count >= 2) {
      throw new AppError("Maximum of 2 parents allowed per student", 400);
    }

    await db.insert(Parenting).values({
      student_id,
      parent_id,
      relationship: relationship || "PARENT",
    });

    res.json({ success: true, message: "Parent assigned successfully" });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error("Error assigning parent:", error);
    throw new AppError("Failed to assign parent", 500);
  }
};

export const removeRelationship = async (req: Request, res: Response) => {
  const { student_id, parent_id } = req.body;

  if (!student_id || !parent_id) {
    throw new AppError("Student ID and Parent ID are required", 400);
  }

  try {
    await db
      .delete(Parenting)
      .where(
        and(
          eq(Parenting.student_id, student_id),
          eq(Parenting.parent_id, parent_id),
        ),
      );

    res.json({
      success: true,
      message: "Relationship removed successfully",
    });
  } catch (error) {
    console.error("Error removing relationship:", error);
    throw new AppError("Failed to remove relationship", 500);
  }
};

// Search users to assign (excluding already assigned)
export const searchPotentialRelations = async (req: Request, res: Response) => {
  const { query, excludeIds, type } = req.query;
  // type: 'parent' (searching for a parent for a student) or 'student' (searching for a student for a parent)

  if (!query) {
    return res.json({ success: true, data: [] });
  }

  try {
    const search = `%${query}%`;
    let queryBuilder = db
      .select({
        user_id: User.user_id,
        username: User.username,
        first_name: UserProfile.first_name,
        last_name: UserProfile.last_name,
        email: User.email,
        user_type: UserProfile.user_type,
      })
      .from(User)
      .leftJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
      .where(
        and(
          sql`(${User.username} LIKE ${search} OR ${User.email} LIKE ${search} OR ${UserProfile.first_name} LIKE ${search} OR ${UserProfile.last_name} LIKE ${search})`,
          eq(User.status, "ACTIVE"),
        ),
      )
      .limit(10);

    // Note: Application side filtering for excludeIds might be cleaner if list is small,
    // but for SQL exclusion we would need 'notInArray' if drizzle supports it easily with dynamic arrays.
    // Drizzle's notInArray expects a non-empty array.

    const results = await queryBuilder;

    const excludeArray = excludeIds
      ? (excludeIds as string).split(",").map(Number)
      : [];

    const filtered = results.filter((u) => !excludeArray.includes(u.user_id));

    res.json({ success: true, data: filtered });
  } catch (error) {
    console.error("Error searching users:", error);
    throw new AppError("Failed to search users", 500);
  }
};
