import express from "express";
import { requireServiceToken } from "../middleware/serviceAuth";
import { listTenants } from "../tenancy/registry";
import { tenantBlock } from "../tenancy/claims";

/**
 * Control-plane endpoints for spoke apps (packages/tenancy/CONTRACT.md §4).
 *
 * GET /platform/tenants/active -- every tenant, every status (consumers filter);
 * same service auth as /integrations/sync/* (Basic SSO client credentials, or an
 * integration token), scope `tenants:read`.
 */
const router = express.Router();

router.get("/tenants/active", requireServiceToken("tenants:read"), async (_req, res) => {
  const tenants = await listTenants();
  res.set("Cache-Control", "no-store");
  // tenancy.strict: automatic strict mode per app (services/tenancy/strictMode.ts).
  const { strictFlags } = await import("../services/tenancy/strictMode");
  res.json({ tenants: tenants.map((t) => tenantBlock(t)), tenancy: { strict: await strictFlags() } });
});

/**
 * POST /platform/tenancy/fallbacks -- a spoke's daily fallback counts (also its
 * heartbeat): { app, day: "YYYY-MM-DD", counts: { no_context, legacy_tid, payload_no_tid }, sites? }.
 */
router.post("/tenancy/fallbacks", requireServiceToken("tenants:read"), async (req, res) => {
  const { recordFallbackReport } = await import("../services/tenancy/strictMode");
  try {
    await recordFallbackReport(req.body ?? {});
    res.json({ success: true });
  } catch (err: any) {
    res.status(err?.status ?? 500).json({ success: false, message: err?.status ? err.message : "Could not record the report" });
  }
});

export default router;
