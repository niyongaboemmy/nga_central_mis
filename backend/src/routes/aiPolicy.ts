import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { UserProfile } from "../db/schema";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { decideAny, requestSnapshot } from "../services/access/policy";
import { hasAiUse } from "../services/ai/gate";
import { getAiPolicy, setAiPolicy } from "../services/ai/policy";
import { getUserRoleNames } from "../utils/auth";
import logger from "../utils/logger";

/**
 * School AI policy (AI_USAGE_CONTROL_PLAN.md §4.2):
 *   GET /ai-policy   any signed-in user: { policy, me: { hasAiUse, canManage } } -- the
 *                    UI hides or explains AI buttons from it
 *   PUT /ai-policy   AI_POLICY_MANAGE and SUPER_ADMIN (both): partial policy; bumps v
 * Machine reads go through GET /integrations/ai-policy.
 */
const router = Router();

export const AI_POLICY_MANAGE = "AI_POLICY_MANAGE";

/** Holds AI_POLICY_MANAGE (legacy list or v2 snapshot) AND is a super admin. */
async function canManage(req: any): Promise<boolean> {
  const roles = await getUserRoleNames(Number(req.user.userId));
  if (!roles.includes("SUPER_ADMIN")) return false;
  if (Array.isArray(req.user?.permissions) && req.user.permissions.includes(AI_POLICY_MANAGE)) return true;
  try {
    return decideAny(await requestSnapshot(req), [AI_POLICY_MANAGE], null, null).allowed;
  } catch (e: any) {
    logger.warn(`[ai-policy] v2 check failed: ${e?.message ?? e}`);
    return false;
  }
}

async function nameOf(userId: number | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const [row] = await db
    .select({ first: UserProfile.first_name, last: UserProfile.last_name })
    .from(UserProfile)
    .where(eq(UserProfile.user_id, userId))
    .limit(1);
  const name = [row?.first, row?.last].filter(Boolean).join(" ").trim();
  return name || null;
}

router.use(authenticate);

router.get(
  "/",
  asyncHandler(async (req: any, res: any) => {
    const [policy, aiUse, manage] = await Promise.all([getAiPolicy(), hasAiUse(req), canManage(req)]);
    res.set("Cache-Control", "private, no-store");
    res.json({
      success: true,
      data: {
        policy,
        me: { hasAiUse: aiUse, canManage: manage },
        // Who made the last change, for Settings -> AI.
        ...(manage && { updatedByName: await nameOf(policy.updated_by) }),
      },
    });
  }),
);

router.put(
  "/",
  asyncHandler(async (req: any, res: any) => {
    if (!(await canManage(req))) {
      return res.status(403).json({ success: false, code: "SUPER_ADMIN_ONLY", message: "Only a super admin can change the school's AI settings." });
    }
    const policy = await setAiPolicy(req.body, Number(req.user.userId));
    res.json({ success: true, data: { policy, updatedByName: await nameOf(policy.updated_by) } });
  }),
);

export default router;
