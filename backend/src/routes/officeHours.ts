import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { authenticate, authorize } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { Permissions } from "../utils/permissions";
import { db } from "../db";
import { OfficeHourSchedule, OfficeHourSession } from "../db/officeHoursSchema";
import { AuthorizationError, ValidationError } from "../errors/CustomError";
import { addDaysYmd } from "../services/reminders/time";
import { actorOf } from "../services/officeHours/access";
import { intList, isYmd, resolveTermId, todayYmd, toInt, loadTerm } from "../services/officeHours/common";
import { getSettings, publicConfig, saveSettings } from "../services/officeHours/settings";
import {
  createSchedule,
  deleteSchedule,
  endSchedule,
  listSchedules,
  loadSchedule,
  serializeSchedules,
  sessionsBetween,
  updateSchedule,
  PURPOSES,
} from "../services/officeHours/schedules";
import {
  assignStudents,
  candidatesFor,
  endAssignment,
  overrideAssignment,
  rosterOf,
  REASON_CODES,
  END_REASON_CODES,
} from "../services/officeHours/assignments";
import { cancelSession, CANCEL_REASONS, ensureSessions, restoreSession, setSessionHost } from "../services/officeHours/sessions";
import { assertValidTransferBody, cancelTransfer, decideTransfer, requestTransfer, transfersFor } from "../services/officeHours/transfers";
import { createClosure, deleteClosure, listClosures, previewClosure } from "../services/officeHours/closures";

/**
 * Mandatory office hours (OFFICE_HOURS_IMPLEMENTATION_PLAN.md §7.2).
 * Guards use the legacy OFFICE_HOURS_* permissions; ownership and area scope
 * are checked in the services (access.ts).
 */
const router = Router();
router.use(authenticate);

const P = Permissions;
const teacher = authorize([P.OFFICE_HOURS_MANAGE_OWN, P.OFFICE_HOURS_MANAGE_ANY]);
const leadership = authorize([P.OFFICE_HOURS_MANAGE_ANY]);
const anyOfficeHours = authorize([
  P.OFFICE_HOURS_MANAGE_OWN,
  P.OFFICE_HOURS_MANAGE_ANY,
  P.OFFICE_HOURS_VIEW,
  P.OFFICE_HOURS_VIEW_SELF,
  P.OFFICE_HOURS_CONFIGURE,
]);
const configure = authorize([P.OFFICE_HOURS_CONFIGURE]);
const closuresWrite = authorize([P.OFFICE_HOURS_MANAGE_ANY, P.OFFICE_HOURS_CONFIGURE]);

const idParam = (raw: unknown, name = "id") => {
  const id = toInt(raw);
  if (!id) throw new ValidationError(`Invalid ${name}`);
  return id;
};

// ---------------------------------------------------------------- config
router.get(
  "/config",
  anyOfficeHours,
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    const termId = await resolveTermId(req.query.term_id).catch(() => null);
    const term = termId ? await loadTerm(termId).catch(() => null) : null;
    successResponse(res, "Office hours configuration", {
      ...publicConfig(settings),
      purposes: PURPOSES,
      reason_codes: REASON_CODES,
      end_reason_codes: END_REASON_CODES.filter((c) => c !== "SCHEDULE_ENDED" && c !== "ADMIN_OVERRIDE"),
      cancel_reasons: CANCEL_REASONS.filter((c) => c !== "CLOSURE" && c !== "SCHEDULE_ENDED" && c !== "SCHEDULE_CHANGED"),
      term,
      today: todayYmd(),
      capabilities: {
        manage_own: actorOf(req).manageOwn,
        manage_any: actorOf(req).manageAny,
        view: actorOf(req).view,
        view_self: actorOf(req).viewSelf,
        configure: actorOf(req).configure,
      },
    });
  }),
);

// ---------------------------------------------------------------- teacher: my office hours
router.get(
  "/my",
  teacher,
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const termId = await resolveTermId(req.query.term_id);
    const schedules = await listSchedules({ termId, teacherId: actor.userId });
    for (const s of schedules) if (s.status === "ACTIVE") await ensureSessions(s.schedule_id);
    const today = todayYmd();
    // Sessions I host (my own and any I cover as a substitute), last 14 days to next 14.
    const ownIds = schedules.map((s) => s.schedule_id);
    const hosted = await db
      .select({ id: OfficeHourSession.schedule_id })
      .from(OfficeHourSession)
      .where(and(eq(OfficeHourSession.host_teacher_id, actor.userId), eq(OfficeHourSession.academic_term_id, termId)));
    const scheduleIds = [...new Set([...ownIds, ...hosted.map((h) => h.id)])];
    const sessions = (await sessionsBetween({ scheduleIds, fromYmd: addDaysYmd(today, -14), toYmd: addDaysYmd(today, 14) })).filter(
      (s) => s.host_teacher_id === actor.userId,
    );
    successResponse(res, "My office hours", {
      term_id: termId,
      today,
      schedules,
      today_sessions: sessions.filter((s) => s.session_date === today),
      upcoming: sessions.filter((s) => s.session_date > today && s.state !== "cancelled").slice(0, 10),
      unmarked: sessions.filter((s) => s.state === "unmarked"),
      transfers: await transfersFor(actor.userId),
    });
  }),
);

router.post(
  "/schedules",
  teacher,
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const scheduleId = await createSchedule(actor, req.body ?? {});
    let assignment = null;
    if (Array.isArray(req.body?.student_ids) && req.body.student_ids.length) {
      assignment = await assignStudents(actor, scheduleId, intList(req.body.student_ids, "student_ids", 200), {
        reasonCode: req.body.reason_code,
        reasonNote: req.body.reason_note,
      });
    }
    const [schedule] = await serializeSchedules([await loadSchedule(scheduleId)]);
    successResponse(res, "Office hours created", { schedule, assignment }, 201);
  }),
);

router.get(
  "/schedules/:id",
  anyOfficeHours,
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const schedule = await loadSchedule(idParam(req.params.id));
    if (!(actor.manageAny || actor.view || schedule.teacher_id === actor.userId)) {
      throw new AuthorizationError("You can only open your own office hours");
    }
    if (schedule.status === "ACTIVE") await ensureSessions(schedule.schedule_id);
    const [shaped] = await serializeSchedules([schedule]);
    const roster = await rosterOf(schedule);
    const sessions = await sessionsBetween({ scheduleIds: [schedule.schedule_id], fromYmd: schedule.effective_from, toYmd: schedule.effective_to });
    successResponse(res, "Office hours", { schedule: shaped, roster, sessions });
  }),
);

router.patch(
  "/schedules/:id",
  teacher,
  asyncHandler(async (req, res) => {
    const schedule = await updateSchedule(actorOf(req), idParam(req.params.id), req.body ?? {});
    const [shaped] = await serializeSchedules([schedule]);
    successResponse(res, "Office hours updated", shaped);
  }),
);

router.post(
  "/schedules/:id/publish",
  teacher,
  asyncHandler(async (req, res) => {
    const schedule = await updateSchedule(actorOf(req), idParam(req.params.id), { status: "ACTIVE" });
    const [shaped] = await serializeSchedules([schedule]);
    successResponse(res, "Office hours published", shaped);
  }),
);

router.post(
  "/schedules/:id/end",
  teacher,
  asyncHandler(async (req, res) => {
    const schedule = await endSchedule(actorOf(req), idParam(req.params.id));
    const [shaped] = await serializeSchedules([schedule]);
    successResponse(res, "Office hours ended", shaped);
  }),
);

router.delete(
  "/schedules/:id",
  teacher,
  asyncHandler(async (req, res) => {
    await deleteSchedule(actorOf(req), idParam(req.params.id));
    successResponse(res, "Office hours deleted");
  }),
);

router.get(
  "/schedules/:id/candidates",
  teacher,
  asyncHandler(async (req, res) => {
    const schedule = await loadSchedule(idParam(req.params.id));
    const data = await candidatesFor(actorOf(req), schedule, {
      classGroupId: toInt(req.query.class_group_id),
      q: typeof req.query.q === "string" ? req.query.q : null,
      onlyFree: req.query.only_free === "1" || req.query.only_free === "true",
    });
    successResponse(res, "Candidates", data);
  }),
);

router.post(
  "/schedules/:id/assignments",
  teacher,
  asyncHandler(async (req, res) => {
    const result = await assignStudents(actorOf(req), idParam(req.params.id), intList(req.body?.student_ids, "student_ids", 200), {
      reasonCode: req.body?.reason_code,
      reasonNote: req.body?.reason_note,
      effectiveFrom: req.body?.effective_from,
    });
    const status = result.assigned.length ? 201 : 200;
    successResponse(res, `${result.assigned.length} assigned`, result, status);
  }),
);

router.delete(
  "/assignments/:id",
  teacher,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const row = await endAssignment(actorOf(req), idParam(req.params.id), body.end_reason_code ?? req.query.end_reason_code, body.end_note ?? req.query.end_note);
    successResponse(res, "Student removed from office hours", row);
  }),
);

// ---------------------------------------------------------------- transfers
router.get(
  "/transfer-requests",
  teacher,
  asyncHandler(async (req, res) => {
    successResponse(res, "Transfer requests", await transfersFor(actorOf(req).userId));
  }),
);
router.post(
  "/transfer-requests",
  teacher,
  asyncHandler(async (req, res) => {
    const { studentId, toScheduleId } = assertValidTransferBody(req.body);
    const id = await requestTransfer(actorOf(req), studentId, toScheduleId, req.body?.message);
    successResponse(res, "Transfer requested", { request_id: id }, 201);
  }),
);
router.post(
  "/transfer-requests/:id/accept",
  teacher,
  asyncHandler(async (req, res) => {
    await decideTransfer(actorOf(req), idParam(req.params.id), true, req.body?.note);
    successResponse(res, "Transfer accepted");
  }),
);
router.post(
  "/transfer-requests/:id/decline",
  teacher,
  asyncHandler(async (req, res) => {
    await decideTransfer(actorOf(req), idParam(req.params.id), false, req.body?.note);
    successResponse(res, "Transfer declined");
  }),
);
router.post(
  "/transfer-requests/:id/cancel",
  teacher,
  asyncHandler(async (req, res) => {
    await cancelTransfer(actorOf(req), idParam(req.params.id));
    successResponse(res, "Transfer request cancelled");
  }),
);

// ---------------------------------------------------------------- sessions
router.get(
  "/sessions",
  teacher,
  asyncHandler(async (req, res) => {
    const actor = actorOf(req);
    const from = isYmd(req.query.from) ? (req.query.from as string) : todayYmd();
    const to = isYmd(req.query.to) ? (req.query.to as string) : addDaysYmd(from, 6);
    if (to < from || addDaysYmd(from, 120) < to) throw new ValidationError("Choose a range of at most 120 days");
    const own = await db.select({ id: OfficeHourSchedule.schedule_id, status: OfficeHourSchedule.status }).from(OfficeHourSchedule).where(eq(OfficeHourSchedule.teacher_id, actor.userId));
    for (const s of own) if (s.status === "ACTIVE") await ensureSessions(s.id, to > addDaysYmd(todayYmd(), 14) ? to : undefined);
    const hosted = await db
      .selectDistinct({ id: OfficeHourSession.schedule_id })
      .from(OfficeHourSession)
      .where(eq(OfficeHourSession.host_teacher_id, actor.userId));
    const ids = [...new Set([...own.map((o) => o.id), ...hosted.map((h) => h.id)])];
    const sessions = (await sessionsBetween({ scheduleIds: ids, fromYmd: from, toYmd: to })).filter(
      (s) => s.host_teacher_id === actor.userId || s.teacher_id === actor.userId,
    );
    successResponse(res, "Sessions", { from, to, sessions });
  }),
);

router.post(
  "/sessions/:id/cancel",
  teacher,
  asyncHandler(async (req, res) => {
    const session = await cancelSession(actorOf(req), idParam(req.params.id), req.body?.reason, req.body?.note);
    successResponse(res, "Session cancelled", session);
  }),
);
router.post(
  "/sessions/:id/restore",
  teacher,
  asyncHandler(async (req, res) => {
    successResponse(res, "Session restored", await restoreSession(actorOf(req), idParam(req.params.id)));
  }),
);
router.post(
  "/sessions/:id/host",
  teacher,
  asyncHandler(async (req, res) => {
    const teacherId = toInt(req.body?.teacher_id);
    if (!teacherId) throw new ValidationError("teacher_id is required");
    successResponse(res, "Host updated", await setSessionHost(actorOf(req), idParam(req.params.id), teacherId));
  }),
);

// ---------------------------------------------------------------- leadership
router.get(
  "/admin/schedules",
  leadership,
  asyncHandler(async (req, res) => {
    const termId = await resolveTermId(req.query.term_id);
    const schedules = await listSchedules({
      termId,
      teacherId: toInt(req.query.teacher_id),
      subjectId: toInt(req.query.subject_id),
      status: typeof req.query.status === "string" && req.query.status ? req.query.status : null,
    });
    successResponse(res, "Office hours", { term_id: termId, schedules });
  }),
);
router.post(
  "/admin/assignments/override",
  leadership,
  asyncHandler(async (req, res) => {
    const { studentId, toScheduleId } = assertValidTransferBody(req.body);
    const result = await overrideAssignment(actorOf(req), studentId, toScheduleId, req.body?.reason);
    successResponse(res, "Student moved", result, 201);
  }),
);
router.get(
  "/admin/transfer-requests",
  leadership,
  asyncHandler(async (req, res) => {
    successResponse(res, "Pending transfer requests", await transfersFor(actorOf(req).userId, true));
  }),
);

// ---------------------------------------------------------------- closures
router.get(
  "/closures",
  anyOfficeHours,
  asyncHandler(async (req, res) => {
    successResponse(res, "School closures", await listClosures(isYmd(req.query.from) ? (req.query.from as string) : null, isYmd(req.query.to) ? (req.query.to as string) : null));
  }),
);
router.get(
  "/closures/preview",
  closuresWrite,
  asyncHandler(async (req, res) => {
    const start = req.query.start_date;
    const end = req.query.end_date || start;
    if (!isYmd(start) || !isYmd(end)) throw new ValidationError("start_date and end_date are required");
    successResponse(res, "Closure preview", await previewClosure(start as string, end as string));
  }),
);
router.post(
  "/closures",
  closuresWrite,
  asyncHandler(async (req, res) => {
    successResponse(res, "Closure added", await createClosure(req.body, actorOf(req).userId), 201);
  }),
);
router.delete(
  "/closures/:id",
  closuresWrite,
  asyncHandler(async (req, res) => {
    successResponse(res, "Closure removed", await deleteClosure(idParam(req.params.id), actorOf(req).userId));
  }),
);

// ---------------------------------------------------------------- settings
router.get(
  "/settings",
  configure,
  asyncHandler(async (req, res) => {
    successResponse(res, "Office hours settings", await getSettings());
  }),
);
router.put(
  "/settings",
  configure,
  asyncHandler(async (req, res) => {
    successResponse(res, "Settings saved", await saveSettings(req.body ?? {}, actorOf(req).userId));
  }),
);

export default router;
