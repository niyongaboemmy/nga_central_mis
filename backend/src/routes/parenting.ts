import express from "express";
import {
  getParents,
  getStudents,
  assignParent,
  removeRelationship,
  searchPotentialRelations,
} from "../controllers/parentingController";
import { authenticate as protect, authorize } from "../middleware/auth";

const router = express.Router();

router.use(protect);

router.get("/student/:studentId/parents", getParents);
router.get("/parent/:parentId/students", getStudents);
router.post("/assign", assignParent); // Body: student_id, parent_id
router.post("/remove", removeRelationship); // Body: student_id, parent_id
router.get("/search", searchPotentialRelations);

export default router;
