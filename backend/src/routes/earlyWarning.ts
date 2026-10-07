import express from "express";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireServiceToken } from "../middleware/serviceAuth";
import { requireCapability } from "../services/access/policy";
import { recordActivity } from "../utils/activityLogger";
import { CAP, EwError, LEVELS, SOURCES, addIntervention, closeIntervention, ingest, listForScope, refreshStates, studentDetail, type Source } from "../services/earlyWarning";

/**
 * Early warning (services/earlyWarning.ts).
 *
 * Apps (client credentials or an `early-warning:write` token):
 *   PUT  /early-warning/signals                 { students: [{ student_id, metrics }], as_of? }
 * Staff with EARLY_WARNING_VIEW, within their scope:
 *   GET  /early-warning?level=&classGroupId=    students, worst first, with reasons
 *   GET  /early-warning/students/:id            one student: signals, reasons, interventions
 *   POST /early-warning/students/:id/interventions   { action, notes?, reviewDate?, ownerId? }
 *   POST /early-warning/interventions/:id/close      { outcome }
 */
const CLIENT_SOURCE: Record<string, Source> = { taskmentor_app: "taskmentor", discipline_attendance: "tendo" };
const SOURCE_CLIENTS = () =>
  new Set((process.env.EARLY_WARNING_SOURCE_CLIENTS || "taskmentor_app,discipline_attendance").split(",").map((s) => s.trim()).filter(Boolean));

export function earlyWarningRouter(
  auth: express.RequestHandler = authenticate,
  viewer: express.RequestHandler = requireCapability(CAP),
  service: express.RequestHandler = requireServiceToken("early-warning:write"),
) {
  const router = express.Router();
  const scopeOf = (req: any) => req.access?.scopeFor?.(CAP) ?? null;
  const fail = (res: express.Response, e: unknown) => {
    if (e instanceof EwError) return res.status(e.status).json({ success: false, message: e.message });
    throw e;
  };

  router.put(
    "/signals",
    service,
    asyncHandler(async (req: any, res) => {
      const clientId: string | undefined = req.service?.clientId;
      let source: Source | undefined;
      if (clientId) {
        if (!SOURCE_CLIENTS().has(clientId) || !CLIENT_SOURCE[clientId]) return res.status(403).json({ success: false, message: "This system may not send early-warning signals" });
        source = CLIENT_SOURCE[clientId];
      } else {
        const s = String(req.body?.source || "");
        if ((SOURCES as readonly string[]).includes(s)) source = s as Source;
      }
      if (!source) return res.status(400).json({ success: false, message: "Unknown source" });
      try {
        res.json({ success: true, data: await ingest(source, req.body) });
      } catch (e) {
        fail(res, e);
      }
    }),
  );

  router.use(auth, viewer);

  router.get(
    "/",
    asyncHandler(async (req: any, res) => {
      const level = String(req.query?.level || "any");
      const classGroupId = Math.trunc(Number(req.query?.classGroupId)) || null;
      const all = await listForScope(scopeOf(req), { level: "any" });
      const classes = new Map<number, string>();
      for (const s of all) if (s.classGroupId && s.className) classes.set(s.classGroupId, s.className);
      const shown = all.filter((s) => (!classGroupId || s.classGroupId === classGroupId) && (level === "any" || !(LEVELS as readonly string[]).includes(level) || s.level === level));
      res.set("Cache-Control", "private, no-store");
      res.json({
        success: true,
        data: {
          students: shown,
          counts: {
            at_risk: all.filter((s) => s.level === "at_risk").length,
            watch: all.filter((s) => s.level === "watch").length,
            none: all.filter((s) => s.level === "none").length,
            withSignals: all.filter((s) => Object.keys(s.asOf).length > 0).length,
          },
          classes: [...classes].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        },
      });
    }),
  );

  router.get(
    "/students/:id",
    asyncHandler(async (req: any, res) => {
      const id = Math.trunc(Number(req.params.id));
      const d = id > 0 ? await studentDetail(scopeOf(req), id) : null;
      if (!d) return res.status(404).json({ success: false, message: "Student not found in your area" });
      res.set("Cache-Control", "private, no-store");
      res.json({ success: true, data: d });
    }),
  );

  router.post(
    "/students/:id/interventions",
    asyncHandler(async (req: any, res) => {
      const id = Math.trunc(Number(req.params.id));
      const by = Number(req.user.userId);
      try {
        const ivId = await addIntervention(scopeOf(req), by, id, req.body);
        await recordActivity(by, "EARLY_WARNING_INTERVENTION", "Logged an early-warning intervention", "EarlyWarningIntervention", ivId, { studentId: id, action: req.body?.action }, by);
        res.status(201).json({ success: true, data: await studentDetail(scopeOf(req), id) });
      } catch (e) {
        fail(res, e);
      }
    }),
  );

  router.post(
    "/interventions/:id/close",
    asyncHandler(async (req: any, res) => {
      const id = Math.trunc(Number(req.params.id));
      try {
        const studentId = await closeIntervention(scopeOf(req), id, req.body?.outcome);
        void refreshStates([studentId]);
        res.json({ success: true, data: await studentDetail(scopeOf(req), studentId) });
      } catch (e) {
        fail(res, e);
      }
    }),
  );

  return router;
}

export default earlyWarningRouter();
