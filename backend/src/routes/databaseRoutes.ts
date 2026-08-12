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
} from "../controllers/databaseController";
import { authenticate, authorize, requireDbStepUp } from "../middleware/auth";
import { Permissions } from "../utils/permissions";

const router = Router();

router.use(
  authenticate,
  authorize([Permissions.DATABASE_MANAGEMENT]),
  requireDbStepUp,
);

router.get("/status", getServerStatus);
router.get("/query/history", getQueryHistory);
router.post("/query", runQuery);

router.get("/tables", listTables);
router.get("/tables/:table/structure", getTableStructure);
router.get("/tables/:table/data", getTableData);
router.get("/tables/:table/export", exportTable);
router.post("/tables/:table/rows", insertRow);
router.put("/tables/:table/rows", updateRow);
router.delete("/tables/:table/rows", deleteRow);

export default router;
