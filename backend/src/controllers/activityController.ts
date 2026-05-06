import { db } from "../db";
import { sql, eq, and, desc, gte, lte } from "drizzle-orm";
import { successResponse } from "../utils/response";
import { asyncHandler } from "../middleware/asyncHandler";
import logger from "../utils/logger";
import { ValidationError } from "../errors/CustomError";

export const getUserActivities = asyncHandler(async (req: any, res: any) => {
  const { userId } = req.params;
  const { startDate, endDate, page = 1, limit = 50 } = req.query;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  const uid = parseInt(userId);
  if (isNaN(uid)) {
    throw new ValidationError("Invalid user ID");
  }

  logger.info("Fetching user activities", {
    userId: uid,
    page: pageNum,
    limit: limitNum,
  });

  // Default to 7 days if not provided
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date();
  if (!startDate) {
    start.setDate(end.getDate() - 7);
  }

  // Format dates for SQL
  const startStr = start.toISOString().split("T")[0] + " 00:00:00";
  const endStr = end.toISOString().split("T")[0] + " 23:59:59";

  /**
   * We aggregate activities from:
   * 1. ActivityLog (Generic)
   * 2. Document (Uploads)
   * 3. DocumentFolder (Folder Creation)
   * 4. StudentSubjectEnrollment (Enrollments)
   * 5. TeacherSubjectAssignment (Assignments)
   * 6. OTP (Security events)
   * 7. Parenting (Family links)
   */

  // Using a simpler approach: fetch from ActivityLog and supplement with specific table queries
  // Since we want a single paginated list, a UNION ALL approach is best but might be complex with Drizzle.
  // We'll use sql templates for the union to ensure performance and pagination.

  // Join outer query with User, UserProfile and Role to get actor details
  const query = sql`
    SELECT 
      act.*,
      ap.first_name AS actor_first_name,
      ap.last_name AS actor_last_name,
      (SELECT r.name FROM Role r JOIN UserRole ur ON r.role_id = ur.role_id WHERE ur.user_id = act.actor_id LIMIT 1) AS actor_role
    FROM (
      SELECT 
        activity_id AS id, 
        user_id, 
        actor_id,
        action_type, 
        description, 
        'ActivityLog' AS entity_type, 
        activity_id AS entity_id, 
        metadata,
        created_at 
      FROM ActivityLog
      WHERE actor_id = ${uid} AND created_at BETWEEN ${startStr} AND ${endStr}

      UNION ALL

      SELECT 
        document_id AS id, 
        user_id, 
        user_id AS actor_id,
        'DOCUMENT_UPLOAD' COLLATE utf8mb4_unicode_ci AS action_type, 
        CONCAT('Uploaded document: ', original_name) COLLATE utf8mb4_unicode_ci AS description, 
        'Document' COLLATE utf8mb4_unicode_ci AS entity_type, 
        document_id AS entity_id, 
        NULL AS metadata,
        created_at
      FROM Document
      WHERE user_id = ${uid} AND created_at BETWEEN ${startStr} AND ${endStr}

      UNION ALL

      SELECT 
        folder_id AS id, 
        user_id, 
        user_id AS actor_id,
        'FOLDER_CREATE' COLLATE utf8mb4_unicode_ci AS action_type, 
        CONCAT('Created folder: ', name) COLLATE utf8mb4_unicode_ci AS description, 
        'DocumentFolder' COLLATE utf8mb4_unicode_ci AS entity_type, 
        folder_id AS entity_id, 
        NULL AS metadata,
        created_at
      FROM DocumentFolder
      WHERE user_id = ${uid} AND created_at BETWEEN ${startStr} AND ${endStr}

      UNION ALL

      SELECT 
        otp_id AS id, 
        user_id, 
        user_id AS actor_id,
        'SECURITY_OTP' COLLATE utf8mb4_unicode_ci AS action_type, 
        CONCAT('Requested OTP type: ', otp_type) COLLATE utf8mb4_unicode_ci AS description, 
        'OTP' COLLATE utf8mb4_unicode_ci AS entity_type, 
        otp_id AS entity_id, 
        NULL AS metadata,
        created_at
      FROM OTP
      WHERE user_id = ${uid} AND created_at BETWEEN ${startStr} AND ${endStr}

      UNION ALL

      SELECT 
        otp_id AS id, 
        user_id, 
        user_id AS actor_id,
        'SECURITY_OTP' COLLATE utf8mb4_unicode_ci AS action_type, 
        CONCAT('Requested OTP type: ', otp_type) COLLATE utf8mb4_unicode_ci AS description, 
        'OTP' COLLATE utf8mb4_unicode_ci AS entity_type, 
        otp_id AS entity_id, 
        NULL AS metadata,
        created_at
      FROM OTP
      WHERE user_id = ${uid} AND created_at BETWEEN ${startStr} AND ${endStr}

    ) AS act
    LEFT JOIN UserProfile ap ON act.actor_id = ap.user_id
    ORDER BY act.created_at DESC
    LIMIT ${limitNum} OFFSET ${offset}
  `;

  const countQuery = sql`
    SELECT COUNT(*) AS total FROM (
      SELECT created_at FROM ActivityLog WHERE actor_id = ${uid} AND created_at BETWEEN ${startStr} AND ${endStr}
      UNION ALL
      SELECT created_at FROM Document WHERE user_id = ${uid} AND created_at BETWEEN ${startStr} AND ${endStr}
      UNION ALL
      SELECT created_at FROM DocumentFolder WHERE user_id = ${uid} AND created_at BETWEEN ${startStr} AND ${endStr}
      UNION ALL
      SELECT created_at FROM OTP WHERE user_id = ${uid} AND created_at BETWEEN ${startStr} AND ${endStr}
    ) AS total_activities
  `;

  const [activities, countResult] = await Promise.all([
    db.execute(query),
    db.execute(countQuery),
  ]);

  const total = (countResult[0] as any)[0]?.total || 0;
  const totalPages = Math.ceil(total / limitNum);

  res.setHeader("X-Total-Count", total.toString());
  res.setHeader("X-Total-Pages", totalPages.toString());

  successResponse(res, "Activities retrieved successfully", {
    activities: activities[0],
    pagination: {
      total,
      totalPages,
      currentPage: pageNum,
      limit: limitNum,
    },
  });
});
