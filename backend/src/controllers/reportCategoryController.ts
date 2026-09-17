import { db } from "../db";
import { eq } from "drizzle-orm";
import { SupportRequestCategory, ChallengeCategory } from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { ValidationError, NotFoundError } from "../errors/CustomError";

// ─────────────────────────────────────────────────────────────────────────────
// Admin-managed lookup lists backing LessonReportModal's "Support Needed" /
// "Challenges" multi-selects (Analysis §5.1/§5.3, Phase 4).
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/reports/categories/support-request — active only, for the picker
export const getSupportRequestCategories = asyncHandler(async (req: any, res: any) => {
  const rows = await db
    .select()
    .from(SupportRequestCategory)
    .where(eq(SupportRequestCategory.is_active, 1));
  return successResponse(res, "Support request categories retrieved", rows);
});

// GET /api/reports/categories/challenge — active only, for the picker
export const getChallengeCategories = asyncHandler(async (req: any, res: any) => {
  const rows = await db
    .select()
    .from(ChallengeCategory)
    .where(eq(ChallengeCategory.is_active, 1));
  return successResponse(res, "Challenge categories retrieved", rows);
});

// POST /api/reports/admin/categories/support-request
export const createSupportRequestCategory = asyncHandler(async (req: any, res: any) => {
  const { label } = req.body;
  if (!label || !String(label).trim()) throw new ValidationError("label is required");

  const result = (await db.insert(SupportRequestCategory).values({ label: label.trim() })) as any;
  return successResponse(res, "Support request category created", { category_id: result[0].insertId }, 201);
});

// PUT /api/reports/admin/categories/support-request/:id
export const updateSupportRequestCategory = asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const { label, is_active } = req.body;

  const existing = await db
    .select({ category_id: SupportRequestCategory.category_id })
    .from(SupportRequestCategory)
    .where(eq(SupportRequestCategory.category_id, id))
    .limit(1);
  if (existing.length === 0) throw new NotFoundError("Support request category not found");

  await db
    .update(SupportRequestCategory)
    .set({
      ...(label !== undefined ? { label: String(label).trim() } : {}),
      ...(is_active !== undefined ? { is_active: is_active ? 1 : 0 } : {}),
    })
    .where(eq(SupportRequestCategory.category_id, id));

  return successResponse(res, "Support request category updated", { category_id: id });
});

// DELETE /api/reports/admin/categories/support-request/:id — soft-delete
// (deactivate) so existing LessonReportSupportRequest rows keep their label.
export const deactivateSupportRequestCategory = asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const existing = await db
    .select({ category_id: SupportRequestCategory.category_id })
    .from(SupportRequestCategory)
    .where(eq(SupportRequestCategory.category_id, id))
    .limit(1);
  if (existing.length === 0) throw new NotFoundError("Support request category not found");

  await db
    .update(SupportRequestCategory)
    .set({ is_active: 0 })
    .where(eq(SupportRequestCategory.category_id, id));

  return successResponse(res, "Support request category deactivated", { category_id: id });
});

// POST /api/reports/admin/categories/challenge
export const createChallengeCategory = asyncHandler(async (req: any, res: any) => {
  const { label } = req.body;
  if (!label || !String(label).trim()) throw new ValidationError("label is required");

  const result = (await db.insert(ChallengeCategory).values({ label: label.trim() })) as any;
  return successResponse(res, "Challenge category created", { category_id: result[0].insertId }, 201);
});

// PUT /api/reports/admin/categories/challenge/:id
export const updateChallengeCategory = asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const { label, is_active } = req.body;

  const existing = await db
    .select({ category_id: ChallengeCategory.category_id })
    .from(ChallengeCategory)
    .where(eq(ChallengeCategory.category_id, id))
    .limit(1);
  if (existing.length === 0) throw new NotFoundError("Challenge category not found");

  await db
    .update(ChallengeCategory)
    .set({
      ...(label !== undefined ? { label: String(label).trim() } : {}),
      ...(is_active !== undefined ? { is_active: is_active ? 1 : 0 } : {}),
    })
    .where(eq(ChallengeCategory.category_id, id));

  return successResponse(res, "Challenge category updated", { category_id: id });
});

// DELETE /api/reports/admin/categories/challenge/:id — soft-delete
export const deactivateChallengeCategory = asyncHandler(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  const existing = await db
    .select({ category_id: ChallengeCategory.category_id })
    .from(ChallengeCategory)
    .where(eq(ChallengeCategory.category_id, id))
    .limit(1);
  if (existing.length === 0) throw new NotFoundError("Challenge category not found");

  await db
    .update(ChallengeCategory)
    .set({ is_active: 0 })
    .where(eq(ChallengeCategory.category_id, id));

  return successResponse(res, "Challenge category deactivated", { category_id: id });
});
