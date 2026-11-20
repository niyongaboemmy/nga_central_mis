import express from "express";
import multer from "multer";
import os from "os";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { authorizeIn } from "../services/access/policy";
import { recordActivity } from "../utils/activityLogger";
import { MAX_UPLOAD_BYTES } from "../services/files/fileKinds";
import { CAP, DOC_TYPES, DocType, fail, isStudentAccount, SideProjectError, Status } from "../services/sideProjects/core";
import { accessProject, assertEdit, assertOwnerOrAny, isEmptyScope, snapshotViewer, Viewer, ViewerResolver } from "../services/sideProjects/access";
import * as projects from "../services/sideProjects/projects";
import * as files from "../services/sideProjects/files";
import * as progress from "../services/sideProjects/progress";
import * as reviewSvc from "../services/sideProjects/review";
import * as members from "../services/sideProjects/members";
import * as work from "../services/sideProjects/work";
import * as customers from "../services/sideProjects/customers";
import { projectDelivery } from "../services/sideProjects/delivery";
import { assertManage } from "../services/sideProjects/access";
import * as monitor from "../services/sideProjects/monitor";
import * as notify from "../services/sideProjects/notify";
import { runImport, TEMPLATE_CSV } from "../services/sideProjects/importer";
import * as aiSetup from "../services/sideProjects/aiSetup";
import { personalFor } from "../services/ai/personal/routes";
import { one } from "../services/sideProjects/core";
import { sql } from "drizzle-orm";

/**
 * Student side projects (STUDENT_PROJECTS_IMPLEMENTATION_PLAN.md §8), mounted at /side-projects.
 *
 * Students (SIDE_PROJECTS_MANAGE_OWN, plus ownership / membership in the service):
 *   GET/POST /mine, /, PATCH /:id, POST /:id/transition, PATCH /board/order, archive/restore,
 *   DELETE /:id, documents, media, links, milestones, updates, comments, members, invitations.
 * Staff (access v2 snapshot: SIDE_PROJECTS_VIEW / REVIEW / MANAGE_ANY, or a project's supervisor):
 *   /monitor/{options,summary,projects,projects/:id,board,export}, POST /:id/review,
 *   PATCH /:id/supervisor, /admin/{import,projects,projects/:id/status,categories}, /supervising.
 * Files: GET /files/:assetId?variant=original|pdf|thumb|text — any viewer of the project.
 *
 * Errors are { success:false, code, message, field? } so forms can point at the field.
 */

const upload = multer({ storage: multer.diskStorage({ destination: os.tmpdir() }), limits: { fileSize: MAX_UPLOAD_BYTES, files: 10 } });
const sheetUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

// 30 uploads per 10 minutes per person.
const uploadHits = new Map<number, number[]>();
function uploadRateLimit(req: any, res: express.Response, next: express.NextFunction) {
  const id = Number(req.user?.userId);
  const now = Date.now();
  const hits = (uploadHits.get(id) ?? []).filter((t) => now - t < 10 * 60_000);
  if (hits.length >= 30) return res.status(429).json({ success: false, code: "RATE_LIMITED", message: "Too many uploads. Wait a few minutes" });
  hits.push(now);
  uploadHits.set(id, hits);
  next();
}

export function sideProjectsRouter(
  auth: express.RequestHandler = authenticate,
  own: express.RequestHandler = authorizeIn(CAP.OWN, undefined, { legacy: [CAP.OWN] }),
  viewerOf: ViewerResolver = snapshotViewer,
  assigned: express.RequestHandler = authorizeIn(CAP.ASSIGNED, undefined, { legacy: [CAP.ASSIGNED] }),
) {
  const router = express.Router();
  router.use(auth);
  router.use((_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });

  const uid = (req: any) => Number(req.user.userId);
  const idParam = (req: any, name = "id") => {
    const n = Number(req.params[name]);
    if (!Number.isInteger(n) || n <= 0) fail(404, "NOT_FOUND", "Not found");
    return n;
  };
  const handle =
    (fn: (req: any, res: express.Response) => Promise<unknown>) =>
    asyncHandler(async (req: any, res: express.Response) => {
      try {
        const out = await fn(req, res);
        if (out !== undefined && !res.headersSent) res.json({ success: true, data: out });
      } catch (e) {
        if (e instanceof SideProjectError) {
          return res.status(e.status).json({ success: false, code: e.code, message: e.message, field: e.field });
        }
        throw e;
      }
    });
  const viewer = async (req: any): Promise<Viewer> => (req._spViewer ??= await viewerOf(req));
  const studentAccess = (req: any) => accessProject(idParam(req), { userId: uid(req) });
  const staffAccess = async (req: any) => accessProject(idParam(req), await viewer(req), { staffOnly: true });
  const anyAccess = async (req: any) => accessProject(idParam(req), await viewer(req));
  const multerFiles = (req: any): files.Upload[] => (Array.isArray(req.files) ? req.files : req.file ? [req.file] : []);

  // ------------------------------------------------------------------ shared lookups
  router.get("/categories", handle(async () => projects.categories()));
  router.get("/tags", handle(async (req) => projects.tagSuggestions(String(req.query.q ?? ""))));
  router.get(
    "/supervisors",
    handle(async (req) =>
      projects.supervisorCandidates(String(req.query.q ?? ""), { askerId: uid(req), projectId: Number(req.query.projectId) > 0 ? Number(req.query.projectId) : null }),
    ),
  );
  router.get("/import/template.csv", (req, res) => {
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", 'attachment; filename="side-projects-import-template.csv"');
    res.send(TEMPLATE_CSV);
  });

  /** SIDE_PROJECTS_CLASSIFY, and never a student account (migration 132). */
  const mayClassify = async (req: any) => ((req.user?.permissions ?? []) as string[]).includes(CAP.CLASSIFY) && !(await isStudentAccount(uid(req)));

  // ------------------------------------------------------------------ what this user may open
  router.get(
    "/me",
    handle(async (req) => {
      const v = await viewer(req);
      const perms: string[] = req.user?.permissions ?? [];
      const supervising = await monitor.listProjects(null, { supervisedBy: uid(req) }, { pageSize: 5 });
      return {
        own: perms.includes(CAP.OWN),
        assigned: perms.includes(CAP.ASSIGNED),
        classify: perms.includes(CAP.CLASSIFY) && !(await isStudentAccount(uid(req))),
        aiSetup: await aiSetup.mayUseAiSetup(uid(req), perms),
        view: v.detail && !isEmptyScope(v.detail) ? "detail" : v.summary && !isEmptyScope(v.summary) ? "summary" : null,
        review: !!v.review && !isEmptyScope(v.review),
        manageAny: v.manageAny,
        supervising: supervising.total,
        customers: (await customers.customerScope(uid(req), v.manageAny)) === null ? "all" : "own",
      };
    }),
  );

  // ------------------------------------------------------------------ files (any viewer)
  router.get(
    "/files/:assetId",
    handle(async (req, res) => {
      const assetId = idParam(req, "assetId");
      const projectId = await files.projectOfAsset(assetId);
      if (!projectId) fail(404, "NOT_FOUND", "File not found");
      const a = await accessProject(projectId as number, await viewer(req));
      const asset = await files.assetOfProject(projectId as number, assetId);
      if (!asset) fail(404, "NOT_FOUND", "File not found");
      if (!a.isOwner && !a.isMember && req.query.download === "1") {
        await recordActivity(uid(req), "SIDE_PROJECT_FILE_DOWNLOAD", `Downloaded ${asset.original_name}`, "side_project", projectId as number);
      }
      if (req.query.manifest === "1") return files.manifestOf(asset);
      await files.streamAsset(res, asset, req.query.variant, { range: req.headers.range, download: req.query.download === "1" });
      return undefined;
    }),
  );

  // ------------------------------------------------------------------ monitor (staff)
  router.get(
    "/monitor/options",
    handle(async (req) => {
      const v = await viewer(req);
      // Without SIDE_PROJECTS_VIEW only the supervising view is open: no classes, and only the
      // customers of projects this person supervises.
      const sees = !isEmptyScope(v.summary) || !isEmptyScope(v.detail);
      return monitor.filterOptions(sees ? (v.summary ?? v.detail) : { students: [] }, sees ? {} : { supervisorId: uid(req) });
    }),
  );
  router.get(
    "/monitor/summary",
    handle(async (req) => {
      const v = await viewer(req);
      const f = monitor.parseFilters(req.query);
      if (req.query.scope === "supervising") return monitor.summary(null, { ...f, supervisedBy: uid(req) }, "detail");
      if (!isEmptyScope(v.detail)) return monitor.summary(v.detail, f, "detail");
      if (!isEmptyScope(v.summary)) return monitor.summary(v.summary, f, "summary");
      return fail(403, "FORBIDDEN", "You can't see side projects");
    }),
  );
  router.get(
    "/monitor/projects",
    handle(async (req) => {
      const v = await viewer(req);
      const f = monitor.parseFilters(req.query);
      if (req.query.scope === "supervising") return monitor.listProjects(null, { ...f, supervisedBy: uid(req) }, req.query);
      if (isEmptyScope(v.detail)) fail(403, "FORBIDDEN", "You can't see individual projects");
      return monitor.listProjects(v.detail, f, req.query);
    }),
  );
  router.get(
    "/monitor/board",
    handle(async (req) => {
      const v = await viewer(req);
      const f = monitor.parseFilters(req.query);
      if (req.query.scope === "supervising") return monitor.boardProjects(null, { ...f, supervisedBy: uid(req) });
      if (isEmptyScope(v.detail)) fail(403, "FORBIDDEN", "You can't see individual projects");
      return monitor.boardProjects(v.detail, f);
    }),
  );
  router.get(
    "/monitor/projects/:id",
    handle(async (req) => {
      const a = await staffAccess(req);
      await recordActivity(uid(req), "SIDE_PROJECT_VIEW", `Opened side project ${a.project.title}`, "side_project", Number(a.project.project_id));
      return projects.projectDetail(a);
    }),
  );
  router.get(
    "/monitor/export",
    handle(async (req, res) => {
      const v = await viewer(req);
      if (isEmptyScope(v.detail)) fail(403, "FORBIDDEN", "You can't export projects");
      const format = req.query.format === "csv" ? "csv" : req.query.format === "pdf" ? "pdf" : "xlsx";
      const me = await one(sql`SELECT TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))) AS name FROM UserProfile WHERE user_id = ${uid(req)}`);
      const out = await monitor.exportRows(v.detail, monitor.parseFilters(req.query), format, { generatedBy: me?.name || "MIS" });
      await recordActivity(uid(req), "SIDE_PROJECT_EXPORT", `Exported ${out.count} side projects (${format})`, "side_project", undefined, { filters: req.query });
      const stamp = new Date().toISOString().slice(0, 10);
      const types = { csv: "text/csv; charset=utf-8", pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as const;
      res.set("Content-Type", types[format]);
      res.set("Content-Disposition", `attachment; filename="projects-report-${stamp}.${format}"`);
      res.send(out.body);
      return undefined;
    }),
  );

  router.post(
    "/:id/review",
    handle(async (req) => {
      const a = await staffAccess(req);
      const kind = String(req.body?.kind ?? "COMMENT").toUpperCase();
      const id = await reviewSvc.review(a, uid(req), req.body ?? {});
      await notify.onReview(Number(a.project.project_id), uid(req), kind as any);
      return { id };
    }),
  );
  router.patch(
    "/:id/supervisor",
    handle(async (req) => {
      const a = await staffAccess(req);
      if (!a.canReview) fail(403, "NOT_REVIEWER", "You can't change the supervisor");
      await projects.updateBasics({ ...a, canEdit: true }, uid(req), { supervisorId: req.body?.supervisorId ?? null });
      await notify.onSupervisor(Number(a.project.project_id), uid(req), req.body?.supervisorId ? Number(req.body.supervisorId) : null);
      return { ok: true };
    }),
  );

  // ------------------------------------------------------------------ admin (MANAGE_ANY)
  const requireAny = async (req: any) => {
    if (!(await viewer(req)).manageAny) fail(403, "FORBIDDEN", "Only the projects lead can do this");
  };
  router.post(
    "/admin/import",
    sheetUpload.single("file"),
    handle(async (req) => {
      await requireAny(req);
      if (!req.file) fail(400, "VALIDATION", "Choose a .csv or .xlsx file", "file");
      const dryRun = req.query.dryRun !== "0";
      const out = await runImport(req.file.buffer, uid(req), dryRun);
      if (!dryRun) await recordActivity(uid(req), "SIDE_PROJECT_IMPORT", `Imported ${out.valid} side projects`, "side_project");
      return out;
    }),
  );
  router.post(
    "/admin/projects",
    uploadRateLimit,
    upload.single("concept"),
    handle(async (req) => {
      await requireAny(req);
      const studentId = Number(req.body?.studentId);
      if (!studentId) fail(400, "VALIDATION", "Choose the owner", "studentId");
      const id = await projects.createProject(studentId, uid(req), { ...req.body, concept: req.file ?? null }, { conceptPending: !req.file && !req.body?.conceptWritten, canClassify: await mayClassify(req) });
      await notify.notifyMany([studentId], "side_project_created_for", "A project was added for you", "Open My projects to see it.", id, false);
      return { id };
    }),
  );
  router.patch(
    "/admin/projects/:id/status",
    handle(async (req) => {
      await requireAny(req);
      const a = await staffAccess(req);
      const from = String(a.project.status);
      const r = await projects.moveProject(a, uid(req), req.body ?? {}, { correction: true });
      if (r?.to && r.to !== from) await notify.onStatus(Number(a.project.project_id), uid(req), r.to, from);
      return r;
    }),
  );
  router.post(
    "/admin/projects/:id/archive",
    handle(async (req) => {
      await requireAny(req);
      const a = await staffAccess(req);
      await projects.archiveProject(a, uid(req), req.body?.archived !== false);
      return { ok: true };
    }),
  );
  router.delete(
    "/admin/projects/:id",
    handle(async (req) => {
      await requireAny(req);
      const a = await staffAccess(req);
      await projects.deleteProject(a, uid(req));
      await recordActivity(uid(req), "SIDE_PROJECT_DELETE", `Deleted side project ${a.project.title}`, "side_project", Number(a.project.project_id));
      return { ok: true };
    }),
  );
  router.get(
    "/admin/people",
    handle(async (req) => {
      await requireAny(req);
      return members.people(0, String(req.query.q ?? ""));
    }),
  );

  // ------------------------------------------------------------------ student board
  router.get("/mine", own, handle(async (req) => projects.myProjects(uid(req), { archived: req.query.archived === "1" })));
  // Assigned projects: everything I supervise or help build (SIDE_PROJECTS_ASSIGNED).
  router.get("/assigned", assigned, handle(async (req) => monitor.assignedProjects(uid(req), monitor.parseFilters(req.query))));
  router.get("/people", own, handle(async (req) => members.people(uid(req), String(req.query.q ?? ""))));
  // Customers, shared by every project (migration 133). Logos are images only (no SVG).
  const withTemp = async <T,>(req: any, fn: () => Promise<T>) => {
    try {
      return await fn();
    } finally {
      if (req.file?.path) await import("fs").then((fs) => fs.promises.rm(req.file.path, { force: true })).catch(() => undefined);
    }
  };
  // Students see only their own customers and those of projects they are in (customers.ts).
  const custScope = async (req: any) => customers.customerScope(uid(req), (await viewer(req)).manageAny);
  router.get("/customers", own, handle(async (req) => customers.listCustomers(String(req.query.q ?? ""), { archived: req.query.archived === "1", scope: await custScope(req) })));
  router.get("/customers/:cid", own, handle(async (req) => customers.getCustomer(idParam(req, "cid"), await custScope(req))));
  router.post(
    "/customers",
    own,
    uploadRateLimit,
    upload.single("logo"),
    handle(async (req) => withTemp(req, async () => customers.createCustomer(uid(req), req.body ?? {}, req.file ?? null, await custScope(req)))),
  );
  router.patch(
    "/customers/:cid",
    own,
    uploadRateLimit,
    upload.single("logo"),
    handle(async (req) => withTemp(req, async () => customers.updateCustomer(uid(req), (await viewer(req)).manageAny, idParam(req, "cid"), req.body ?? {}, req.file ?? null, await custScope(req)))),
  );
  router.delete("/customers/:cid", own, handle(async (req) => customers.removeCustomer(uid(req), (await viewer(req)).manageAny, idParam(req, "cid"))));
  router.post(
    "/customers/:cid/restore",
    own,
    handle(async (req) => {
      await customers.restoreCustomer(uid(req), (await viewer(req)).manageAny, idParam(req, "cid"));
      return { ok: true };
    }),
  );
  router.get(
    "/customers/:cid/logo",
    handle(async (req, res) => {
      const asset = await customers.logoAsset(idParam(req, "cid"), await custScope(req));
      await files.streamAsset(res, asset, req.query.variant, { range: req.headers.range });
      return undefined;
    }),
  );

  // The caller's tasks across every project (migration 133).
  router.get("/my-tasks", own, handle(async (req) => work.myTasks(uid(req))));

  // ------------------------------------------------------------------ set up with AI (migration 140)
  // SIDE_PROJECTS_AI_SETUP and never a student account. Documents are read to text here and the
  // files are dropped at once; the browser keeps them and attaches them through the normal create.
  const aiOk = async (req: any) => aiSetup.assertAiSetup(uid(req), req.user?.permissions);
  // 30 AI rounds an hour per person: each one spends the school's free AI quota.
  const aiHits = new Map<number, number[]>();
  const aiRate = (req: any) => {
    const now = Date.now();
    const hits = (aiHits.get(uid(req)) ?? []).filter((t) => now - t < 60 * 60_000);
    if (hits.length >= 30) fail(429, "RATE_LIMITED", "That's a lot of AI rounds: wait a little and try again");
    hits.push(now);
    aiHits.set(uid(req), hits);
  };
  router.get("/ai-setup/providers", own, handle(async (req) => (await aiOk(req), aiSetup.providers())));
  router.post("/ai-setup/sessions", own, handle(async (req) => (await aiOk(req), aiSetup.createSession(uid(req)))));
  router.get("/ai-setup/sessions/:sid", own, handle(async (req) => (await aiOk(req), aiSetup.sessionView(uid(req), String(req.params.sid)))));
  router.post(
    "/ai-setup/sessions/:sid/files",
    own,
    uploadRateLimit,
    upload.single("file"),
    handle(async (req) => {
      try {
        await aiOk(req);
      } catch (e) {
        if (req.file?.path) await import("fs").then((fs) => fs.promises.rm(req.file.path, { force: true })).catch(() => undefined);
        throw e;
      }
      if (!req.file) fail(400, "VALIDATION", "Choose a document", "file");
      return aiSetup.addFile(uid(req), String(req.params.sid), req.file);
    }),
  );
  router.delete("/ai-setup/sessions/:sid/files/:fid", own, handle(async (req) => (await aiOk(req), aiSetup.removeFile(uid(req), String(req.params.sid), String(req.params.fid)))));
  router.post(
    "/ai-setup/sessions/:sid/draft",
    own,
    handle(async (req) => {
      await aiOk(req);
      aiRate(req);
      return aiSetup.draftProject(uid(req), String(req.params.sid), { ...(req.body ?? {}), personal: await personalFor(req, "author") });
    }),
  );
  router.post(
    "/ai-setup/sessions/:sid/refine",
    own,
    handle(async (req) => {
      await aiOk(req);
      aiRate(req);
      return aiSetup.refineProject(uid(req), String(req.params.sid), { ...(req.body ?? {}), personal: await personalFor(req, "author") });
    }),
  );
  router.post(
    "/:id/ai-plan",
    own,
    handle(async (req) => {
      await aiOk(req);
      const a = await studentAccess(req);
      assertEdit(a);
      const has = await one(sql`SELECT COUNT(*) AS n FROM SideProjectPlanItem WHERE project_id = ${a.project.project_id}`);
      const out = await aiSetup.applyPlan(a, uid(req), req.body?.phases, Number(has?.n ?? 0) === 0);
      await recordActivity(uid(req), "SIDE_PROJECT_AI_SETUP", `Set up ${a.project.title} with AI (${out.items} plan items, ${out.tasks} tasks)`, "side_project", Number(a.project.project_id));
      return out;
    }),
  );

  router.post(
    "/",
    own,
    uploadRateLimit,
    upload.single("concept"),
    handle(async (req) => {
      const id = await projects.createProject(uid(req), uid(req), { ...req.body, concept: req.file ?? null }, { canClassify: await mayClassify(req) });
      await notify.onCreated(id, uid(req));
      return { id };
    }),
  );

  router.patch(
    "/board/order",
    own,
    handle(async (req) => {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0).slice(0, 300) : [];
      await projects.reorderColumn(uid(req), String(req.body?.status ?? "").toUpperCase() as Status, ids);
      return { ok: true };
    }),
  );

  router.post(
    "/invitations/:id",
    own,
    handle(async (req) => {
      const accept = req.body?.accept === true || req.body?.accept === "true";
      await members.respond(idParam(req), uid(req), accept);
      await notify.onInviteAnswer(idParam(req), uid(req), accept);
      return { ok: true };
    }),
  );

  router.get("/:id", own, handle(async (req) => projects.projectDetail(await studentAccess(req))));

  router.patch(
    "/:id",
    own,
    handle(async (req) => {
      const a = await studentAccess(req);
      assertEdit(a);
      const before = a.project.supervisor_user_id ? Number(a.project.supervisor_user_id) : null;
      await projects.updateBasics(a, uid(req), req.body ?? {});
      const after = req.body?.supervisorId === undefined ? before : req.body.supervisorId ? Number(req.body.supervisorId) : null;
      if (after && after !== before) await notify.onSupervisor(Number(a.project.project_id), uid(req), after);
      return projects.projectDetail(await studentAccess(req));
    }),
  );

  router.post(
    "/:id/transition",
    own,
    handle(async (req) => {
      const a = await studentAccess(req);
      assertEdit(a);
      const from = String(a.project.status);
      const r = await projects.moveProject(a, uid(req), req.body ?? {});
      if (r.to !== from) await notify.onStatus(Number(a.project.project_id), uid(req), r.to, from);
      return r;
    }),
  );

  router.post(
    "/:id/archive",
    own,
    handle(async (req) => {
      const a = await studentAccess(req);
      assertOwnerOrAny(a);
      await projects.archiveProject(a, uid(req), true);
      return { ok: true };
    }),
  );
  router.post(
    "/:id/restore",
    own,
    handle(async (req) => {
      const a = await studentAccess(req);
      assertOwnerOrAny(a);
      await projects.archiveProject(a, uid(req), false);
      return { ok: true };
    }),
  );
  router.delete(
    "/:id",
    own,
    handle(async (req) => {
      await projects.deleteProject(await studentAccess(req), uid(req));
      return { ok: true };
    }),
  );

  router.post(
    "/:id/documents/:type",
    own,
    uploadRateLimit,
    upload.single("file"),
    handle(async (req) => {
      const type = String(req.params.type).toUpperCase() as DocType;
      if (!(DOC_TYPES as readonly string[]).includes(type)) fail(404, "NOT_FOUND", "Unknown document");
      let a;
      try {
        a = await studentAccess(req);
        assertEdit(a);
      } catch (e) {
        if (req.file) await import("fs").then((fs) => fs.promises.rm(req.file.path, { force: true })).catch(() => undefined);
        throw e;
      }
      const doc = await projects.uploadDocument(a, uid(req), type, req.file);
      await notify.onDocument(Number(a.project.project_id), uid(req), type);
      return doc;
    }),
  );

  router.post(
    "/:id/media",
    own,
    uploadRateLimit,
    upload.array("files", 10),
    handle(async (req) => {
      const list = multerFiles(req);
      let a;
      try {
        a = await studentAccess(req);
        assertEdit(a);
      } catch (e) {
        await Promise.all(list.map((f) => import("fs").then((fs) => fs.promises.rm(f.path, { force: true })).catch(() => undefined)));
        throw e;
      }
      const assets = await files.storeProjectFiles(Number(a.project.project_id), uid(req), list);
      const captions = Array.isArray(req.body?.captions) ? req.body.captions : req.body?.captions ? [req.body.captions] : [];
      const ids = await files.addMedia(Number(a.project.project_id), assets, uid(req), captions);
      return { ids };
    }),
  );
  router.patch(
    "/:id/media/order",
    own,
    handle(async (req) => {
      const a = await studentAccess(req);
      assertEdit(a);
      await files.reorderMedia(Number(a.project.project_id), (req.body?.ids ?? []).map(Number));
      return { ok: true };
    }),
  );
  router.patch(
    "/:id/media/:mediaId",
    own,
    handle(async (req) => {
      const a = await studentAccess(req);
      assertEdit(a);
      await files.updateMedia(Number(a.project.project_id), idParam(req, "mediaId"), req.body ?? {});
      return { ok: true };
    }),
  );
  router.delete(
    "/:id/media/:mediaId",
    own,
    handle(async (req) => {
      const a = await studentAccess(req);
      assertEdit(a);
      await files.removeMedia(Number(a.project.project_id), idParam(req, "mediaId"), uid(req));
      return { ok: true };
    }),
  );

  router.post(
    "/:id/milestones",
    own,
    handle(async (req) => {
      const a = await studentAccess(req);
      assertEdit(a);
      return { id: await progress.addMilestone(a, uid(req), req.body ?? {}) };
    }),
  );
  router.patch(
    "/:id/milestones/order",
    own,
    handle(async (req) => {
      const a = await studentAccess(req);
      assertEdit(a);
      await progress.reorderMilestones(a, (req.body?.ids ?? []).map(Number));
      return { ok: true };
    }),
  );
  router.patch(
    "/:id/milestones/:mid",
    own,
    handle(async (req) => {
      const a = await studentAccess(req);
      assertEdit(a);
      await progress.updateMilestone(a, uid(req), idParam(req, "mid"), req.body ?? {});
      return { ok: true };
    }),
  );
  router.delete(
    "/:id/milestones/:mid",
    own,
    handle(async (req) => {
      const a = await studentAccess(req);
      assertEdit(a);
      await progress.deleteMilestone(a, idParam(req, "mid"));
      return { ok: true };
    }),
  );

  const dropTemp = (list: files.Upload[]) => Promise.all(list.map((f) => import("fs").then((fs) => fs.promises.rm(f.path, { force: true })).catch(() => undefined)));
  router.post(
    "/:id/updates",
    own,
    uploadRateLimit,
    upload.array("files", 3),
    handle(async (req) => {
      const list = multerFiles(req);
      let a;
      try {
        a = await studentAccess(req);
        assertEdit(a);
      } catch (e) {
        await dropTemp(list);
        throw e;
      }
      const id = await progress.addUpdate(a, uid(req), req.body ?? {}, list);
      await notify.onReport(Number(a.project.project_id), uid(req), id);
      return { id };
    }),
  );
  router.patch(
    "/:id/updates/:uid",
    own,
    uploadRateLimit,
    upload.array("files", 3),
    handle(async (req) => {
      const list = multerFiles(req);
      let a;
      try {
        a = await studentAccess(req);
        assertEdit(a);
      } catch (e) {
        await dropTemp(list);
        throw e;
      }
      await progress.updateUpdate(a, uid(req), idParam(req, "uid"), req.body ?? {}, list);
      return { ok: true };
    }),
  );
  // Optional cover image and logo (migration 133): the team, or the lead.
  router.post(
    "/:id/branding/:which",
    uploadRateLimit,
    upload.single("file"),
    handle(async (req) => {
      const which = req.params.which === "logo" ? "logo" : req.params.which === "cover" ? "cover" : null;
      let a;
      try {
        if (!which) fail(404, "NOT_FOUND", "Unknown image");
        a = await anyAccess(req);
        assertEdit(a);
      } catch (e) {
        if (req.file?.path) await import("fs").then((fs) => fs.promises.rm(req.file!.path, { force: true })).catch(() => undefined);
        throw e;
      }
      return files.setBranding(Number(a.project.project_id), uid(req), which!, req.file ?? null);
    }),
  );
  router.delete(
    "/:id/branding/:which",
    handle(async (req) => {
      const which = req.params.which === "logo" ? "logo" : req.params.which === "cover" ? "cover" : null;
      if (!which) fail(404, "NOT_FOUND", "Unknown image");
      const a = await anyAccess(req);
      assertEdit(a);
      await files.clearBranding(Number(a.project.project_id), uid(req), which as "cover" | "logo");
      return { ok: true };
    }),
  );

  // ------------------------------------------------------------------ team, plan and tasks (migration 133)
  router.patch(
    "/:id/team",
    handle(async (req) => {
      const a = await anyAccess(req);
      return { mode: await members.setMode(a, uid(req), req.body?.mode) };
    }),
  );
  router.patch(
    "/:id/members/:userId",
    handle(async (req) => {
      const a = await anyAccess(req);
      const target = idParam(req, "userId");
      await members.updateMember(a, uid(req), target, req.body ?? {});
      if (typeof req.body?.roleTitle === "string" && target !== Number(a.project.owner_user_id))
        await notify.onPosition(Number(a.project.project_id), uid(req), target, req.body.roleTitle.trim() || null);
      return { ok: true };
    }),
  );
  router.get("/:id/plan", handle(async (req) => work.planOf(Number((await anyAccess(req)).project.project_id))));
  router.get("/:id/plan/templates", handle(async (req) => work.templates(await anyAccess(req))));
  router.post(
    "/:id/plan/generate",
    handle(async (req) => {
      const a = await anyAccess(req);
      assertManage(a);
      return work.generatePlan(a, uid(req), req.body ?? {});
    }),
  );
  router.post(
    "/:id/plan/items",
    handle(async (req) => {
      const a = await anyAccess(req);
      assertManage(a);
      return { id: await work.createItem(a, uid(req), req.body ?? {}) };
    }),
  );
  router.patch(
    "/:id/plan/order",
    handle(async (req) => {
      const a = await anyAccess(req);
      assertManage(a);
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : [];
      await work.reorderItems(a, req.body?.parentId ? Number(req.body.parentId) : null, ids);
      return { ok: true };
    }),
  );
  router.patch(
    "/:id/plan/items/:itemId",
    handle(async (req) => {
      const a = await anyAccess(req);
      assertManage(a);
      await work.updateItem(a, uid(req), idParam(req, "itemId"), req.body ?? {});
      return { ok: true };
    }),
  );
  router.delete(
    "/:id/plan/items/:itemId",
    handle(async (req) => {
      const a = await anyAccess(req);
      assertManage(a);
      await work.deleteItem(a, uid(req), idParam(req, "itemId"));
      return { ok: true };
    }),
  );
  router.post("/:id/tasks", handle(async (req) => ({ id: await work.createTask(await anyAccess(req), uid(req), req.body ?? {}) })));
  router.get("/:id/tasks/:taskId", handle(async (req) => work.taskDetail(await anyAccess(req), idParam(req, "taskId"))));
  router.patch(
    "/:id/tasks/:taskId",
    handle(async (req) => {
      await work.updateTask(await anyAccess(req), uid(req), idParam(req, "taskId"), req.body ?? {});
      return { ok: true };
    }),
  );
  router.post("/:id/tasks/:taskId/status", handle(async (req) => work.moveTask(await anyAccess(req), uid(req), idParam(req, "taskId"), req.body ?? {})));
  router.delete(
    "/:id/tasks/:taskId",
    handle(async (req) => {
      await work.deleteTask(await anyAccess(req), uid(req), idParam(req, "taskId"));
      return { ok: true };
    }),
  );
  router.post("/:id/tasks/:taskId/logs", handle(async (req) => ({ id: await work.addLog(await anyAccess(req), uid(req), idParam(req, "taskId"), req.body ?? {}) })));
  router.delete(
    "/:id/tasks/:taskId/logs/:logId",
    handle(async (req) => {
      await work.deleteLog(await anyAccess(req), uid(req), idParam(req, "taskId"), idParam(req, "logId"));
      return { ok: true };
    }),
  );
  router.get("/:id/delivery", handle(async (req) => projectDelivery(Number((await anyAccess(req)).project.project_id))));

  // Classification: Student / NGA Delivery Studio / Individual (the team or the lead; never students).
  router.patch(
    "/:id/kind",
    handle(async (req) => {
      const a = await anyAccess(req);
      return { kind: await projects.setKind(a, uid(req), req.user?.permissions ?? [], req.body?.kind) };
    }),
  );
  // Daily work activity for the contribution graph (anyone who may open the project).
  router.get(
    "/:id/activity",
    handle(async (req) => {
      const a = await anyAccess(req);
      return progress.activityOf(Number(a.project.project_id), Number(req.query.days) || 182);
    }),
  );
  // Stage plan: the project's dates and the stage boundaries (the team, or the lead).
  router.put(
    "/:id/plan",
    handle(async (req) => {
      const a = await anyAccess(req);
      assertEdit(a);
      return { plan: await projects.updatePlan(a, uid(req), req.body ?? {}) };
    }),
  );
  router.delete(
    "/:id/updates/:uid",
    own,
    handle(async (req) => {
      const a = await studentAccess(req);
      assertEdit(a);
      await progress.deleteUpdate(a, uid(req), idParam(req, "uid"));
      return { ok: true };
    }),
  );

  router.post(
    "/:id/comments",
    handle(async (req) => {
      const a = await anyAccess(req);
      const id = await reviewSvc.reply(a, uid(req), req.body ?? {});
      if (a.canEdit) await notify.onStudentReply(Number(a.project.project_id), uid(req));
      else await notify.onReview(Number(a.project.project_id), uid(req), "COMMENT");
      return { id };
    }),
  );
  router.delete(
    "/:id/comments/:cid",
    handle(async (req) => {
      await reviewSvc.deleteComment(await anyAccess(req), uid(req), idParam(req, "cid"));
      return { ok: true };
    }),
  );

  router.post(
    "/:id/members",
    own,
    handle(async (req) => {
      const a = await studentAccess(req);
      const b = req.body ?? {};
      const userId = await members.invite(a, uid(req), { userId: b.userId, regNumber: b.regNumber, roleKey: b.roleKey, roleTitle: b.roleTitle, responsibilities: b.responsibilities });
      await notify.onInvite(Number(a.project.project_id), uid(req), userId);
      return { userId };
    }),
  );
  router.delete(
    "/:id/members/:userId",
    own,
    handle(async (req) => {
      const a = await studentAccess(req);
      await members.removeMember(a, uid(req), idParam(req, "userId"));
      await notify.onMemberGone(Number(a.project.project_id), uid(req), idParam(req, "userId"));
      return { ok: true };
    }),
  );

  return router;
}

export default sideProjectsRouter();
