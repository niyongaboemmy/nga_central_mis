import express from "express";
import { authenticate, authorize } from "../middleware/auth";
import { Permissions } from "../utils/permissions";
import { asyncHandler } from "../middleware/asyncHandler";
import { perMinute } from "../middleware/rateLimit";
import { successResponse } from "../utils/response";
import { openSessionEvents, RunnerError, runCode, runnerLanguages, sessionInput, startSession, stopSession, validSessionId } from "../services/codePlayground/relay";

/**
 * Code Playground -- run the code in lessons, exercises and the Code Playground
 * page (services/codePlayground/relay.ts). Needs CODE_PLAYGROUND_USE, which every
 * role holds by default (migration 120); runs are practice only (nothing graded
 * or stored).
 */
const router = express.Router();

const MAX_CODE = 64 * 1024;
const MAX_STDIN = 16 * 1024;
/** A playground project: its main file plus up to this many others. */
const MAX_FILES = 24;
const MAX_PROJECT = 512 * 1024;
const PATH = /^[\w.-]+(\/[\w.-]+){0,4}$/;
const validPath = (p: string) => PATH.test(p) && !p.split("/").some((s) => s === "." || s === "..");
const LANGUAGE = /^[a-z][a-z0-9+#_-]{0,39}$/;

/** Per user, on top of Task Mentor's own per-user limit: a stuck "Run" key can't flood the runner. */
const runs = perMinute(20);

const sessionToken = (req: any): string | null => {
  const header = req.headers?.authorization as string | undefined;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return req.cookies?.nga_auth_token ?? null;
};

const fail = (res: any, status: number, code: string, message: string) => res.status(status).json({ success: false, code, message });

/** The program in a run/session request, checked; answers the error itself and returns null when invalid. */
function parseProgram(raw: any, res: any) {
  const body = raw && typeof raw === "object" ? raw : {};
  const language = typeof body.language === "string" ? body.language.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code : "";
  const stdin = typeof body.stdin === "string" ? body.stdin : "";
  const files = Array.isArray(body.files) ? body.files : [];
  const entry = typeof body.entry === "string" && body.entry.trim() ? body.entry.trim() : null;
  if (entry && !validPath(entry)) return void fail(res, 400, "VALIDATION_ERROR", "The main file's name is invalid.");
  if (!LANGUAGE.test(language)) return void fail(res, 400, "VALIDATION_ERROR", "Pick a language to run.");
  if (!code.trim()) return void fail(res, 400, "VALIDATION_ERROR", "There's no code to run.");
  if (code.length > MAX_CODE) return void fail(res, 413, "TOO_LARGE", "The code is too long to run here (64 KB at most).");
  if (stdin.length > MAX_STDIN) return void fail(res, 413, "TOO_LARGE", "The input is too long (16 KB at most).");
  if (files.length > MAX_FILES) return void fail(res, 400, "VALIDATION_ERROR", `At most ${MAX_FILES} extra files.`);
  const extra: { path: string; content: string }[] = [];
  for (const f of files) {
    const path = typeof f?.path === "string" ? f.path.trim() : "";
    if (!validPath(path) || typeof f?.content !== "string" || f.content.length > MAX_CODE) {
      return void fail(res, 400, "VALIDATION_ERROR", `The file "${path.slice(0, 80) || "?"}" is invalid.`);
    }
    if (path === entry || extra.some((x) => x.path === path)) return void fail(res, 400, "VALIDATION_ERROR", `Two files are named "${path}".`);
    extra.push({ path, content: f.content });
  }
  if (code.length + extra.reduce((n, f) => n + f.content.length, 0) > MAX_PROJECT) return void fail(res, 413, "TOO_LARGE", "The files are too large to run here (512 KB at most).");
  return { language, code, entry, stdin, extra };
}

router.use(authenticate, authorize(Permissions.CODE_PLAYGROUND_USE));

router.get(
  "/languages",
  asyncHandler(async (req: any, res: any) => {
    const token = sessionToken(req);
    if (!token) return fail(res, 401, "SESSION_EXPIRED", "Sign in again to run code.");
    try {
      const r = await runnerLanguages(token);
      successResponse(res, "Runner languages", { available: true, languages: r.languages, interactive: r.interactive });
    } catch (e) {
      if (!(e instanceof RunnerError)) throw e;
      // The page still runs web code in the browser: say the runner is away, don't fail.
      successResponse(res, "Runner unavailable", { available: false, languages: [], interactive: false, code: e.code, message: e.message });
    }
  }),
);

router.post(
  "/run",
  asyncHandler(async (req: any, res: any) => {
    const token = sessionToken(req);
    if (!token) return fail(res, 401, "SESSION_EXPIRED", "Sign in again to run code.");
    const parsed = parseProgram(req.body, res);
    if (!parsed) return;
    const { language, code, entry, stdin, extra } = parsed;
    if (!runs.take(String(req.user.userId))) return fail(res, 429, "RATE_LIMITED", "Too many runs — wait a minute and try again.");

    try {
      successResponse(res, "Ran", await runCode(token, { language, code, entry, stdin, files: extra }));
    } catch (e) {
      if (!(e instanceof RunnerError)) throw e;
      fail(res, e.status, e.code, e.message);
    }
  }),
);

// ---------------------------------------------------------------- live runs
// A program that asks for input runs live: output streams as Server-Sent Events, what the
// student types goes to its stdin (services/codePlayground/relay.ts, Task Mentor sessions).

router.post(
  "/sessions",
  asyncHandler(async (req: any, res: any) => {
    const token = sessionToken(req);
    if (!token) return fail(res, 401, "SESSION_EXPIRED", "Sign in again to run code.");
    const parsed = parseProgram(req.body, res);
    if (!parsed) return;
    if (!runs.take(String(req.user.userId))) return fail(res, 429, "RATE_LIMITED", "Too many runs — wait a minute and try again.");
    try {
      successResponse(res, "Started", { id: await startSession(token, { language: parsed.language, code: parsed.code, entry: parsed.entry, files: parsed.extra }) }, 201);
    } catch (e) {
      if (!(e instanceof RunnerError)) throw e;
      fail(res, e.status, e.code, e.message);
    }
  }),
);

/** Keeps proxies (nginx: 60 s) from closing a stream while the program waits for input. */
const KEEPALIVE_MS = 15_000;

router.get(
  "/sessions/:id/events",
  asyncHandler(async (req: any, res: any) => {
    const token = sessionToken(req);
    const id = String(req.params.id);
    if (!token) return fail(res, 401, "SESSION_EXPIRED", "Sign in again to run code.");
    if (!validSessionId(id)) return fail(res, 404, "SESSION_NOT_FOUND", "This run has ended. Run your program again.");
    const abort = new AbortController();
    let finished = false;
    // res (not req): req's "close" fires once the request has been read, not when the page leaves.
    res.on("close", () => {
      abort.abort();
      // The page left before the program ended: stop it.
      if (!finished) void stopSession(token, id);
    });
    let stream: ReadableStream<Uint8Array> | null;
    try {
      stream = await openSessionEvents(token, id, abort.signal);
    } catch (e) {
      if (!(e instanceof RunnerError)) throw e;
      return fail(res, e.status, e.code, e.message);
    }
    if (!stream) return fail(res, 404, "SESSION_NOT_FOUND", "This run has ended. Run your program again.");
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();
    const ping = setInterval(() => res.write(": keep-alive\n\n"), KEEPALIVE_MS);
    const reader = stream.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      finished = true;
    } catch {
      /* the page left, or the runner closed the stream */
    } finally {
      clearInterval(ping);
      res.end();
    }
  }),
);

router.post(
  "/sessions/:id/input",
  asyncHandler(async (req: any, res: any) => {
    const token = sessionToken(req);
    const id = String(req.params.id);
    if (!token) return fail(res, 401, "SESSION_EXPIRED", "Sign in again to run code.");
    if (!validSessionId(id)) return fail(res, 404, "SESSION_NOT_FOUND", "This run has ended. Run your program again.");
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const body: { data?: string; eof?: boolean; signal?: "SIGINT" | "SIGTERM" } = {};
    if (b.data !== undefined) {
      if (typeof b.data !== "string" || b.data.length > MAX_STDIN) return fail(res, 400, "VALIDATION_ERROR", "Invalid input.");
      body.data = b.data;
    }
    if (b.eof === true) body.eof = true;
    if (b.signal === "SIGINT" || b.signal === "SIGTERM") body.signal = b.signal;
    if (!Object.keys(body).length) return fail(res, 400, "VALIDATION_ERROR", "Nothing to send.");
    try {
      await sessionInput(token, id, body);
      res.status(204).end();
    } catch (e) {
      if (!(e instanceof RunnerError)) throw e;
      fail(res, e.status, e.code, e.message);
    }
  }),
);

router.delete(
  "/sessions/:id",
  asyncHandler(async (req: any, res: any) => {
    const token = sessionToken(req);
    const id = String(req.params.id);
    if (token && validSessionId(id)) await stopSession(token, id);
    res.status(204).end();
  }),
);

/** Tests only. */
export const resetPlaygroundRunLimit = () => runs.reset();

export default router;
