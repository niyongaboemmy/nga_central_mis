import express from "express";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireServiceToken } from "../middleware/serviceAuth";
import { getCurrentAcademicYearId } from "../utils/academicYear";
import { CompetencyError, SOURCES, classMap, curriculumFor, ingestEvidence, mapOptions, studentEvidence, teaches, type Source } from "../services/competencyMap";

/**
 * Competency map (services/competencyMap.ts, migration 116).
 *
 * Apps (client credentials or a token):
 *   GET /competency/curriculum/:subjectId   learning outcomes + criteria, for tagging work  (sync:read)
 *   PUT /competency/evidence                { tasks: [{ source_type, source_ref, subject_id, title, criteria_ids, results }] }  (competency:write)
 * Staff:
 *   GET /competency/options                 subject × class pairs the viewer may open
 *   GET /competency/map?subjectId=&classGroupId=                 class × criteria map
 *   GET /competency/map/students/:id?subjectId=&classGroupId=    one student's evidence
 * A subject teacher sees the classes they teach; e-learning oversight (VIEW_ALL_COURSES) sees every class.
 */
const CLIENT_SOURCE: Record<string, Source> = { taskmentor_app: "taskmentor" };
export const OVERSIGHT_PERMISSION = "VIEW_ALL_COURSES";

export function competencyRouter(
  auth: express.RequestHandler = authenticate,
  read: express.RequestHandler = requireServiceToken("sync:read"),
  write: express.RequestHandler = requireServiceToken("competency:write"),
) {
  const router = express.Router();
  const fail = (res: express.Response, e: unknown) => {
    if (e instanceof CompetencyError) return res.status(e.status).json({ success: false, message: e.message });
    throw e;
  };
  const id = (v: unknown) => Math.trunc(Number(v)) || 0;

  router.get(
    "/curriculum/:subjectId",
    read,
    asyncHandler(async (req, res) => {
      res.json({ success: true, data: { subject_id: id(req.params.subjectId), outcomes: await curriculumFor(id(req.params.subjectId)) } });
    }),
  );

  router.put(
    "/evidence",
    write,
    asyncHandler(async (req: any, res) => {
      const clientId: string | undefined = req.service?.clientId;
      const source: Source | undefined = clientId ? CLIENT_SOURCE[clientId] : (SOURCES as readonly string[]).includes(req.body?.source) ? req.body.source : undefined;
      if (!source) return res.status(clientId ? 403 : 400).json({ success: false, message: clientId ? "This system may not send competency evidence" : "Unknown source" });
      try {
        res.json({ success: true, data: await ingestEvidence(source, req.body) });
      } catch (e) {
        fail(res, e);
      }
    }),
  );

  router.use(auth);
  const oversight = (req: any) => Array.isArray(req.user?.permissions) && req.user.permissions.includes(OVERSIGHT_PERMISSION);
  /** 0 = may open; otherwise the HTTP status to refuse with. */
  const refuse = async (req: any, subjectId: number, classGroupId: number, yearId: number | null) => {
    if (!subjectId || !classGroupId) return 400;
    if (!yearId) return 404;
    if (oversight(req)) return 0;
    return (await teaches(req.user.userId, subjectId, classGroupId, yearId)) ? 0 : 403;
  };

  router.get(
    "/options",
    asyncHandler(async (req: any, res) => {
      const yearId = await getCurrentAcademicYearId();
      res.set("Cache-Control", "private, no-store");
      res.json({ success: true, data: { oversight: oversight(req), subjects: await mapOptions(req.user.userId, oversight(req), yearId) } });
    }),
  );

  router.get(
    "/map",
    asyncHandler(async (req: any, res) => {
      const subjectId = id(req.query.subjectId), classGroupId = id(req.query.classGroupId);
      const yearId = await getCurrentAcademicYearId();
      const no = await refuse(req, subjectId, classGroupId, yearId);
      if (no) return res.status(no).json({ success: false, message: no === 403 ? "You don't teach this subject to this class" : no === 404 ? "No current academic year" : "subjectId and classGroupId are required" });
      try {
        res.set("Cache-Control", "private, no-store");
        res.json({ success: true, data: await classMap(subjectId, classGroupId, yearId!) });
      } catch (e) {
        fail(res, e);
      }
    }),
  );

  router.get(
    "/map/students/:id",
    asyncHandler(async (req: any, res) => {
      const subjectId = id(req.query.subjectId), classGroupId = id(req.query.classGroupId), studentId = id(req.params.id);
      const yearId = await getCurrentAcademicYearId();
      const no = await refuse(req, subjectId, classGroupId, yearId);
      if (no) return res.status(no).json({ success: false, message: no === 403 ? "You don't teach this subject to this class" : "subjectId and classGroupId are required" });
      const map = await classMap(subjectId, classGroupId, yearId!).catch((e) => (e instanceof CompetencyError ? null : Promise.reject(e)));
      const student = map?.students.find((s) => s.user_id === studentId);
      if (!student) return res.status(404).json({ success: false, message: "This student isn't in the class for this subject" });
      res.set("Cache-Control", "private, no-store");
      res.json({ success: true, data: { student: { user_id: student.user_id, name: student.name }, competent_pct: map!.competent_pct, outcomes: await studentEvidence(studentId, subjectId, classGroupId) } });
    }),
  );

  return router;
}

export default competencyRouter();
