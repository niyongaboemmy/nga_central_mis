import express from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { recordActivity } from "../utils/activityLogger";
import { childrenOf, importParents, preferences, savePreferences } from "../services/families";

/**
 * Families (services/families.ts).
 *   GET  /families/me                 a parent's children, in plain words + preferences
 *   PUT  /families/me/preferences     { weeklyDigest?, digestEmail? }
 *   POST /families/import             registrars (MANAGE_USERS): { rows: [{ student, parentName, email, phone?, relationship? }] }
 */
export function familiesRouter(auth: express.RequestHandler = authenticate) {
  const router = express.Router();
  router.use(auth);
  const me = (req: any) => Number(req.user.userId);
  const canImport = (req: any) => {
    const p = req.user?.permissions;
    return !!p && (Array.isArray(p) ? p.includes("MANAGE_USERS") : p.has?.("MANAGE_USERS"));
  };

  router.get(
    "/me",
    asyncHandler(async (req: any, res) => {
      const [tg] = (await db.execute(sql`SELECT 1 AS x FROM TelegramLink WHERE user_id = ${me(req)} LIMIT 1`).catch(() => [[]])) as any;
      res.set("Cache-Control", "private, no-store");
      res.json({
        success: true,
        data: {
          children: await childrenOf(me(req)),
          preferences: await preferences(me(req)),
          telegramLinked: Array.isArray(tg) ? tg.length > 0 : !!tg,
        },
      });
    }),
  );

  router.put(
    "/me/preferences",
    asyncHandler(async (req: any, res) => {
      const b = req.body ?? {};
      const out = await savePreferences(me(req), {
        weeklyDigest: typeof b.weeklyDigest === "boolean" ? b.weeklyDigest : undefined,
        digestEmail: typeof b.digestEmail === "boolean" ? b.digestEmail : undefined,
      });
      res.json({ success: true, data: out });
    }),
  );

  router.post(
    "/import",
    asyncHandler(async (req: any, res) => {
      if (!canImport(req)) return res.status(403).json({ success: false, message: "You need the Manage users permission to import parents" });
      try {
        const results = await importParents(req.body?.rows, me(req));
        await recordActivity(me(req), "FAMILY_IMPORT", "Imported parents", "Parenting", undefined, {
          rows: results.length,
          created: results.filter((r) => r.outcome === "created").length,
          errors: results.filter((r) => r.outcome === "error").length,
        }, me(req));
        res.json({ success: true, data: results });
      } catch (e: any) {
        if (e?.status) return res.status(e.status).json({ success: false, message: e.message });
        throw e;
      }
    }),
  );

  return router;
}

export default familiesRouter();
