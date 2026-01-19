import { db } from "../db";
import { ActivityLog } from "../db/schema";
import logger from "./logger";

/**
 * Utility to record human-readable activities in the system.
 * This should be used for any mutation (Create, Update, Delete) on important tables.
 *
 * @param userId - The ID of the user performing the action or the subject of the action
 * @param actionType - A short string code for the action (e.g., 'PROFILE_UPDATE', 'ROLE_ASSIGN')
 * @param description - A clear, human-readable description of what happened
 * @param entityType - Optional: The name of the table or concept (e.g., 'User', 'Role')
 * @param entityId - Optional: The primary key of the affected entity
 * @param metadata - Optional: Extra data, payload or system information (as object or string)
 * @param actorId - Optional: The ID of the user who performed the action (performer)
 */
export const recordActivity = async (
  userId: number,
  actionType: string,
  description: string,
  entityType?: string,
  entityId?: number,
  metadata?: any,
  actorId?: number,
) => {
  try {
    const metadataStr = metadata
      ? typeof metadata === "object"
        ? JSON.stringify(metadata)
        : String(metadata)
      : null;

    await db.insert(ActivityLog).values({
      user_id: userId,
      actor_id: actorId,
      action_type: actionType,
      description: description,
      entity_type: entityType,
      entity_id: entityId,
      metadata: metadataStr,
    });

    logger.debug(
      `[ActivityLog] Recorded: ${actionType} for user ${userId}${actorId ? ` by actor ${actorId}` : ""}`,
    );
  } catch (error) {
    // We catch and log error but do NOT throw to avoid breaking the main operation
    logger.error("Failed to record activity log", {
      error,
      data: {
        userId,
        actionType,
        description,
        entityType,
        entityId,
        metadata,
        actorId,
      },
    });
  }
};
