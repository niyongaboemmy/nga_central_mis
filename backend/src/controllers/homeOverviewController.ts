import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { AuthorizationError, ValidationError } from "../errors/CustomError";
import { buildHomeOverview } from "../services/home/buildHomeOverview";
import { engineReady, requestSnapshot } from "../services/access/policy";
import { decide } from "../vendor/nga-access";
import { writeAudit } from "../services/access/registry";
import { configuredApps, fetchAppSummary } from "../services/home/apps";
import { resolveHomeAccess } from "../services/home/access";
import { resolvePeriod } from "../services/academicPeriod";

const optInt = (raw: unknown): number | undefined => {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError("Invalid id");
  return n;
};

/**
 * GET /home/overview -- the signed-in user's Home (HOME_OVERVIEW_IMPLEMENTATION_PLAN.md).
 *
 * Query: academic_year_id, academic_term_id (top-nav period switcher),
 * refresh=1 (bypass the one-minute cache), as=<userId> (read-only preview of
 * another user's Home: needs ACCESS_PREVIEW_AS in the v2 engine; audited).
 */
export const getHomeOverview = asyncHandler(async (req: any, res: any) => {
  const viewerId = req.user.userId as number;
  const previewOf = optInt(req.query.as);
  let subjectId = viewerId;

  if (previewOf && previewOf !== viewerId) {
    const allowed =
      (await engineReady()) && decide(await requestSnapshot(req, "mis"), "ACCESS_PREVIEW_AS").allowed;
    if (!allowed) throw new AuthorizationError("You cannot preview another user's Home");
    await writeAudit({
      actorId: viewerId,
      subjectUserId: previewOf,
      action: "preview.as",
      target: { page: "home" },
    });
    subjectId = previewOf;
  }

  const overview = await buildHomeOverview(subjectId, {
    yearId: optInt(req.query.academic_year_id),
    termId: optInt(req.query.academic_term_id),
    refresh: req.query.refresh === "1" || req.query.refresh === "true",
    previewOf: subjectId !== viewerId ? subjectId : undefined,
  });
  successResponse(res, "Home overview", overview);
});

// ── Other apps (H3) ─────────────────────────────────────────────────────────

const lensHintCache = new Map<string, { at: number; lenses: Array<{ key: string; type: string; class_group_ids: number[] | null }> }>();

/** The token the user signed in with -- relayed as-is, so each app decides for this same user. */
const sessionToken = (req: any): string | null => {
  const header = req.headers?.authorization as string | undefined;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return req.cookies?.nga_auth_token ?? null;
};

/**
 * POST /home/apps/:source/summary -- relay one app's Home summary for the
 * signed-in user (Task Mentor, D&A, Tupo). The lens hints are computed here
 * from the user's own access, never taken from the browser.
 */
export const getHomeAppSummary = asyncHandler(async (req: any, res: any) => {
  const app = configuredApps().find((a) => a.source === req.params.source);
  if (!app) {
    return successResponse(res, "App not configured", { source: req.params.source, status: "unavailable", message: "This app is not connected to Home" });
  }
  const token = sessionToken(req);
  if (!token) throw new AuthorizationError("No session token to relay");

  const userId = req.user.userId as number;
  const yearId = optInt(req.body?.academic_year_id);
  const cacheKey = `${userId}|${yearId ?? "cur"}`;
  let hint = lensHintCache.get(cacheKey);
  if (!hint || Date.now() - hint.at > 60_000) {
    const { year } = await resolvePeriod(yearId);
    const access = await resolveHomeAccess(userId, year?.academic_year_id ?? null);
    hint = {
      at: Date.now(),
      lenses: access.lenses.map((l) => ({ key: l.key, type: l.type, class_group_ids: l.classGroupIds })),
    };
    lensHintCache.set(cacheKey, hint);
    if (lensHintCache.size > 2000) lensHintCache.clear();
  }

  const lessons = Array.isArray(req.body?.lessons) ? req.body.lessons.slice(0, 40) : [];
  const result = await fetchAppSummary(
    app,
    token,
    {
      date: typeof req.body?.date === "string" ? req.body.date.slice(0, 10) : undefined,
      tz: process.env.SCHOOL_TIMEZONE || "Africa/Kigali",
      lenses: hint.lenses,
      lessons,
    },
    new Set(hint.lenses.map((l) => l.key)),
  );
  successResponse(res, "App summary", result);
});
