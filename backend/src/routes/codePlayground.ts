import express from "express";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { perMinute } from "../middleware/rateLimit";
import { successResponse } from "../utils/response";
import { RunnerError, runCode, runnerLanguages } from "../services/codePlayground/relay";

/**
 * Code Playground -- run the code in lessons and exercises
 * (services/codePlayground/relay.ts). Any signed-in user who can read a lesson
 * may run its code; runs are practice only (nothing graded or stored).
 */
const router = express.Router();

const MAX_CODE = 64 * 1024;
const MAX_STDIN = 16 * 1024;
const MAX_FILES = 10;
const LANGUAGE = /^[a-z][a-z0-9+#_-]{0,39}$/;

/** Per user, on top of Task Mentor's own per-user limit: a stuck "Run" key can't flood the runner. */
const runs = perMinute(20);

const sessionToken = (req: any): string | null => {
  const header = req.headers?.authorization as string | undefined;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return req.cookies?.nga_auth_token ?? null;
};

const fail = (res: any, status: number, code: string, message: string) => res.status(status).json({ success: false, code, message });

router.use(authenticate);

router.get(
  "/languages",
  asyncHandler(async (req: any, res: any) => {
    const token = sessionToken(req);
    if (!token) return fail(res, 401, "SESSION_EXPIRED", "Sign in again to run code.");
    try {
      successResponse(res, "Runner languages", { available: true, languages: await runnerLanguages(token) });
    } catch (e) {
      if (!(e instanceof RunnerError)) throw e;
      // The page still runs web code in the browser: say the runner is away, don't fail.
      successResponse(res, "Runner unavailable", { available: false, languages: [], code: e.code, message: e.message });
    }
  }),
);

router.post(
  "/run",
  asyncHandler(async (req: any, res: any) => {
    const token = sessionToken(req);
    if (!token) return fail(res, 401, "SESSION_EXPIRED", "Sign in again to run code.");
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const language = typeof body.language === "string" ? body.language.trim().toLowerCase() : "";
    const code = typeof body.code === "string" ? body.code : "";
    const stdin = typeof body.stdin === "string" ? body.stdin : "";
    const files = Array.isArray(body.files) ? body.files : [];
    if (!LANGUAGE.test(language)) return fail(res, 400, "VALIDATION_ERROR", "Pick a language to run.");
    if (!code.trim()) return fail(res, 400, "VALIDATION_ERROR", "There's no code to run.");
    if (code.length > MAX_CODE) return fail(res, 413, "TOO_LARGE", "The code is too long to run here (64 KB at most).");
    if (stdin.length > MAX_STDIN) return fail(res, 413, "TOO_LARGE", "The input is too long (16 KB at most).");
    if (files.length > MAX_FILES) return fail(res, 400, "VALIDATION_ERROR", `At most ${MAX_FILES} extra files.`);
    const extra: { path: string; content: string }[] = [];
    for (const f of files) {
      const path = typeof f?.path === "string" ? f.path.trim() : "";
      if (!/^[\w.-]+(\/[\w.-]+)*$/.test(path) || path.split("/").includes("..") || typeof f?.content !== "string" || f.content.length > MAX_CODE) {
        return fail(res, 400, "VALIDATION_ERROR", "One of the extra files is invalid.");
      }
      extra.push({ path, content: f.content });
    }
    if (!runs.take(String(req.user.userId))) return fail(res, 429, "RATE_LIMITED", "Too many runs — wait a minute and try again.");

    try {
      successResponse(res, "Ran", await runCode(token, { language, code, stdin, files: extra }));
    } catch (e) {
      if (!(e instanceof RunnerError)) throw e;
      fail(res, e.status, e.code, e.message);
    }
  }),
);

/** Tests only. */
export const resetPlaygroundRunLimit = () => runs.reset();

export default router;
