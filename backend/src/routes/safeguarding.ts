import express from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireCapability } from "../services/access/policy";
import { recordActivity } from "../utils/activityLogger";
import {
  CAP,
  REPORT_CATEGORIES,
  SafeguardingError,
  act,
  getConcern,
  listConcerns,
  myCheckIn,
  raiseConcern,
  submitCheckIn,
  summary,
  team,
  validCheckIn,
} from "../services/safeguarding";

/**
 * Safeguarding and wellbeing (services/safeguarding.ts).
 *
 * Students:
 *   GET  /safeguarding/check-in          this week's check-in (done or not)
 *   POST /safeguarding/check-in          { mood 1-5, safe 1-5, wantsTalk, comment? }
 *   POST /safeguarding/report            "Report a concern" { category, text }   (anyone signed in)
 * The safeguarding team (SAFEGUARDING_MANAGE):
 *   GET  /safeguarding/summary           open concerns + check-in trend (no names)
 *   GET  /safeguarding/concerns?status=  open | new | acknowledged | in_progress | closed | all
 *   GET  /safeguarding/concerns/:id      one concern with its notes (audited)
 *   POST /safeguarding/concerns/:id      { text?, status?, assignTo? }
 *   GET  /safeguarding/team              who concerns can be assigned to
 */
export function safeguardingRouter(
  auth: express.RequestHandler = authenticate,
  team$: express.RequestHandler = requireCapability(CAP, () => ({ type: "SCHOOL" }) as any),
) {
const router = express.Router();
router.use(auth);

/** The token only carries the user id: the user type comes from the database (cached on the request). */
const isStudent = async (req: any): Promise<boolean> => {
  if (req._isStudent === undefined) {
    const r: any = await db.execute(sql`SELECT user_type AS t FROM UserProfile WHERE user_id = ${Number(req.user.userId)}`);
    const row = (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : r)[0];
    req._isStudent = String(row?.t || "").toUpperCase() === "STUDENT";
  }
  return req._isStudent;
};

const fail = (res: express.Response, e: unknown) => {
  if (e instanceof SafeguardingError) return res.status(e.status).json({ success: false, message: e.message });
  throw e;
};

router.get(
  "/check-in",
  asyncHandler(async (req: any, res) => {
    if (!(await isStudent(req))) return res.json({ success: true, data: { applies: false } });
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: { applies: true, ...(await myCheckIn(Number(req.user.userId))) } });
  }),
);

router.post(
  "/check-in",
  asyncHandler(async (req: any, res) => {
    if (!(await isStudent(req))) return res.status(403).json({ success: false, message: "The weekly check-in is for students" });
    const c = validCheckIn(req.body);
    if (!c) return res.status(400).json({ success: false, message: "Choose an answer for both questions" });
    try {
      res.json({ success: true, data: { applies: true, ...(await submitCheckIn(Number(req.user.userId), c)) } });
    } catch (e) {
      fail(res, e);
    }
  }),
);

router.post(
  "/report",
  asyncHandler(async (req: any, res) => {
    const category = String(req.body?.category || "");
    const text = String(req.body?.text || "").trim();
    if (!(REPORT_CATEGORIES as readonly string[]).includes(category)) return res.status(400).json({ success: false, message: "Choose what it is about" });
    if (text.length < 3) return res.status(400).json({ success: false, message: "Tell us a little about what is happening" });
    const userId = Number(req.user.userId);
    const student = await isStudent(req);
    const id = await raiseConcern({
      studentId: userId,
      source: student ? "student" : "staff",
      category,
      summary: student ? "A student asked for help" : "Reported by a member of staff",
      detail: text,
      reportedBy: userId,
    });
    if (id === null) return res.status(503).json({ success: false, message: "It couldn't be sent. Please talk to a teacher you trust." });
    res.status(201).json({ success: true, data: { received: true } });
  }),
);

router.get(
  "/summary",
  team$,
  asyncHandler(async (_req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: await summary() });
  }),
);

router.get(
  "/concerns",
  team$,
  asyncHandler(async (req: any, res) => {
    const s = String(req.query?.status || "open");
    const status = (["open", "all", "new", "acknowledged", "in_progress", "closed"].includes(s) ? s : "open") as any;
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: await listConcerns({ status }) });
  }),
);

router.get(
  "/concerns/:id",
  team$,
  asyncHandler(async (req: any, res) => {
    const id = Math.trunc(Number(req.params.id));
    const c = id > 0 ? await getConcern(id) : null;
    if (!c) return res.status(404).json({ success: false, message: "Concern not found" });
    const by = Number(req.user.userId);
    await recordActivity(by, "SAFEGUARDING_VIEW", `Viewed safeguarding concern ${id}`, "SafeguardingConcern", id, undefined, by);
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: c });
  }),
);

router.post(
  "/concerns/:id",
  team$,
  asyncHandler(async (req: any, res) => {
    const id = Math.trunc(Number(req.params.id));
    const by = Number(req.user.userId);
    const b = req.body ?? {};
    const assignTo = b.assignTo === undefined ? undefined : b.assignTo === null ? null : Math.trunc(Number(b.assignTo));
    try {
      const c = await act(id, by, { text: b.text, status: b.status, assignTo });
      await recordActivity(by, "SAFEGUARDING_ACT", `Updated safeguarding concern ${id}`, "SafeguardingConcern", id, { status: b.status ?? null, assignTo: assignTo ?? null, note: !!b.text }, by);
      res.json({ success: true, data: c });
    } catch (e) {
      fail(res, e);
    }
  }),
);

router.get(
  "/team",
  team$,
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await team() });
  }),
);

return router;
}

export default safeguardingRouter();
