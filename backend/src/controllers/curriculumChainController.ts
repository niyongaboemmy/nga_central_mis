import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { NotFoundError, ValidationError } from "../errors/CustomError";
import { loadReadableScheme } from "../services/curriculumChain/lessonPlans";
import { loadWeekBundles } from "../services/curriculumChain/weekBundle";

/**
 * `GET /scheme-of-work/schemes/:id/week-bundles` — every week of a scheme with its plans,
 * notes, materials and e-learning state (LESSON_STUDIO plan §5.1). Owner, co-teachers and
 * scheme validators only; anyone else gets 404.
 */
export const getWeekBundles = asyncHandler(async (req: any, res: any) => {
  const schemeId = Number(req.params.id);
  if (!Number.isInteger(schemeId) || schemeId <= 0) throw new ValidationError("Invalid scheme id");
  const scheme = await loadReadableScheme(schemeId, req.user.userId, req.user.permissions ?? []);
  if (!scheme) throw new NotFoundError("Scheme of work not found");
  const result = await loadWeekBundles(scheme);
  successResponse(res, "Week bundles", {
    scheme: { scheme_id: scheme.scheme_id, subject_id: scheme.subject_id, class_group_id: scheme.class_group_id, academic_term_id: scheme.academic_term_id },
    ...result,
  });
});
