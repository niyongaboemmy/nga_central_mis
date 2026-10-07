import express from "express";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireCapability, requestSnapshot, decideAny } from "../services/access/policy";
import { recordActivity } from "../utils/activityLogger";
import { CAP, CoverError, assign, board, cancelAbsence, decide, mine, reportAbsence, suggestions, teacherList } from "../services/staffCover";

/**
 * Staff absence and cover (services/staffCover.ts).
 *
 * Any teacher:
 *   GET  /cover/mine                       my absences and the covers I'm doing
 *   POST /cover/absences                   { from, to, reason, note? }  (managers may add teacherId: approved at once)
 *   POST /cover/absences/:id/cancel        the teacher or a manager
 * Cover managers (STAFF_COVER_MANAGE):
 *   GET  /cover/board?from=YYYY-MM-DD      pending absences + the week's cover lessons
 *   POST /cover/absences/:id/decision      { approve: boolean }
 *   GET  /cover/lessons/:id/suggestions    free colleagues, best first
 *   POST /cover/lessons/:id/assign         { teacherId | null, note? }
 *   GET  /cover/teachers                   for the "record an absence for…" picker
 */
export function staffCoverRouter(
  auth: express.RequestHandler = authenticate,
  manager: express.RequestHandler = requireCapability(CAP, () => ({ type: "SCHOOL" }) as any),
  isManager: (req: any) => Promise<boolean> = async (req) => {
    try {
      return decideAny(await requestSnapshot(req), [CAP], { type: "SCHOOL" } as any, null).allowed;
    } catch {
      return false;
    }
  },
) {
  const router = express.Router();
  router.use(auth);
  const fail = (res: express.Response, e: unknown) => {
    if (e instanceof CoverError) return res.status(e.status).json({ success: false, message: e.message });
    throw e;
  };
  const me = (req: any) => Number(req.user.userId);

  router.get(
    "/mine",
    asyncHandler(async (req: any, res) => {
      res.set("Cache-Control", "private, no-store");
      res.json({ success: true, data: { ...(await mine(me(req))), canManage: await isManager(req) } });
    }),
  );

  router.post(
    "/absences",
    asyncHandler(async (req: any, res) => {
      try {
        const id = await reportAbsence(me(req), await isManager(req), req.body);
        await recordActivity(me(req), "STAFF_ABSENCE_REPORT", "Reported a staff absence", "StaffAbsence", id, { from: req.body?.from, to: req.body?.to, reason: req.body?.reason }, me(req));
        res.status(201).json({ success: true, data: { id } });
      } catch (e) {
        fail(res, e);
      }
    }),
  );

  router.post(
    "/absences/:id/cancel",
    asyncHandler(async (req: any, res) => {
      try {
        await cancelAbsence(Math.trunc(Number(req.params.id)), me(req), await isManager(req));
        res.json({ success: true, data: { cancelled: true } });
      } catch (e) {
        fail(res, e);
      }
    }),
  );

  router.get(
    "/board",
    manager,
    asyncHandler(async (req: any, res) => {
      res.set("Cache-Control", "private, no-store");
      res.json({ success: true, data: await board(String(req.query?.from || "")) });
    }),
  );

  router.post(
    "/absences/:id/decision",
    manager,
    asyncHandler(async (req: any, res) => {
      try {
        const id = Math.trunc(Number(req.params.id));
        const out = await decide(id, me(req), req.body?.approve === true);
        await recordActivity(me(req), "STAFF_ABSENCE_DECIDE", req.body?.approve ? "Approved a staff absence" : "Declined a staff absence", "StaffAbsence", id, out, me(req));
        res.json({ success: true, data: out });
      } catch (e) {
        fail(res, e);
      }
    }),
  );

  router.get(
    "/lessons/:id/suggestions",
    manager,
    asyncHandler(async (req: any, res) => {
      try {
        res.json({ success: true, data: await suggestions(Math.trunc(Number(req.params.id))) });
      } catch (e) {
        fail(res, e);
      }
    }),
  );

  router.post(
    "/lessons/:id/assign",
    manager,
    asyncHandler(async (req: any, res) => {
      try {
        const t = req.body?.teacherId === null ? null : Math.trunc(Number(req.body?.teacherId));
        if (t !== null && !(t > 0)) return res.status(400).json({ success: false, message: "Choose a teacher" });
        res.json({ success: true, data: await assign(Math.trunc(Number(req.params.id)), t, me(req), req.body?.note) });
      } catch (e) {
        fail(res, e);
      }
    }),
  );

  router.get(
    "/teachers",
    manager,
    asyncHandler(async (_req, res) => {
      res.json({ success: true, data: await teacherList() });
    }),
  );

  return router;
}

export default staffCoverRouter();
