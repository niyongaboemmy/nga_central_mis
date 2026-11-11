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
  res.json({ tenants: tenants.map((t) => tenantBlock(t)) });
});

export default router;
