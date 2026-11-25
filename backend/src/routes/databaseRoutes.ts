import { Router } from "express";
import {
  listTables,
  getTableStructure,
  getTableData,
  insertRow,
  updateRow,
  deleteRow,
  runQuery,
  getQueryHistory,
  exportTable,
  getServerStatus,
  generateSqlWithAI,
} from "../controllers/databaseController";
import { authenticate, authorize, requireDbStepUp } from "../middleware/auth";
import { Permissions } from "../utils/permissions";
import { requireAi } from "../services/ai/gate";
import { requireCapability } from "../services/access/policy";
import { requirePrimaryTenant } from "../services/tenantMgmt/guards";
import { PLATFORM_CAPS } from "../services/tenantMgmt/catalog";

const router = Router();

/**
 * MIS-ISO-1: the Database Management tool reads raw SQL over a MySQL user that can
 * see every school's database, so it is a platform-owner tool. It exists only in
 * the primary tenant (404 elsewhere, like the platform console) and needs the
 * platform-owner capability (PLATFORM_PACKAGES_MANAGE, never granted outside the
 * primary) on top of the legacy permission and the password step-up. Every
 * statement is pinned to the session's own schema (services/database/schemaPin.ts).
 */
export const databaseToolGuard = [
  authenticate,
  requirePrimaryTenant,
  requireCapability(PLATFORM_CAPS.packages),
  authorize([Permissions.DATABASE_MANAGEMENT]),
];

router.use(...databaseToolGuard, requireDbStepUp);

router.get("/status", getServerStatus);
router.get("/query/history", getQueryHistory);
router.post("/query", runQuery);
router.post("/query/ai-generate", requireAi("author"), generateSqlWithAI);

router.get("/tables", listTables);
router.get("/tables/:table/structure", getTableStructure);
router.get("/tables/:table/data", getTableData);
router.get("/tables/:table/export", exportTable);
router.post("/tables/:table/rows", insertRow);
router.put("/tables/:table/rows", updateRow);
router.delete("/tables/:table/rows", deleteRow);

export default router;
