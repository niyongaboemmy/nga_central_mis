import express from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { getTenant, primaryTenantCtx, runWithTenant, type TenantCtx } from "../tenancy";
import logger from "../utils/logger";
import { appUrl, apiUrl } from "../services/reminders/webPush";
import { exchangeCode, getInstallation, githubConfig, userInstallationIds, verifySignature } from "../services/sideProjects/git/github";
import { processEvent, storeEvent } from "../services/sideProjects/git/ingest";
import { installationRouteTid, readState, routeInstallation, tenantForInstallation } from "../services/sideProjects/git/store";
import { submitDraft } from "../services/sideProjects/git/drafts";

/**
 * GitHub's side of the integration, unsigned by MIS tokens (GIT_AUTOMATED_REPORTING_ANALYSIS.md §9):
 *   POST /integrations/github/webhook       signed deliveries (X-Hub-Signature-256 over the raw body)
 *   GET  /integrations/github/setup         after installing the app (state signed by us)
 *   GET  /integrations/github/oauth/callback after "Connect GitHub" (state signed by us)
 *   POST /integrations/github/drafts/action  one-tap "Submit as is" from a push notification
 * Mounted before the JSON parser and CORS: the webhook needs the exact bytes GitHub signed.
 */

const tenantOf = async (tid: unknown): Promise<TenantCtx | null> => {
  const n = Number(tid);
  if (!Number.isInteger(n) || n <= 0) return null;
  return (await getTenant(n).catch(() => null)) ?? (n === 1 ? primaryTenantCtx() : null);
};

const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,sans-serif;background:#0b1220;color:#e2e8f0}
main{max-width:420px;padding:32px;border:1px solid rgba(147,197,253,.2);border-radius:20px;text-align:center}h1{font-size:20px;margin:0 0 8px}p{color:#94a3b8;margin:0 0 20px}
a{color:#fff;background:#2563eb;padding:10px 18px;border-radius:12px;text-decoration:none;font-weight:600}</style></head><body><main>${body}</main></body></html>`;

/** How recent an installation must be when the setup redirect carries no OAuth code. */
export const SETUP_FRESH_MS = 10 * 60_000;

type OwnershipVerdict = "ok" | "already_ours" | "elsewhere" | "not_owner" | "stale" | "state_stale";

/**
 * MIS-ISO-3: may this setup redirect attach `installationId` to school `tid`?
 *  - with an OAuth `code` ("request user authorization during installation"): the
 *    GitHub user must be able to reach the installation (GET /user/installations);
 *  - without one: the App itself must report an installation created in the last
 *    10 minutes, after our signed state was issued (state ↔ school ↔ user ↔ expiry
 *    are HMAC-bound by signState), and not yet routed to any school.
 * An installation already routed to this school is a no-op; to another, refused.
 */
export async function verifyInstallationOwnership(
  installationId: number,
  tid: number,
  st: { iat?: number },
  code: unknown,
): Promise<OwnershipVerdict> {
  const routed = await installationRouteTid(installationId);
  if (routed !== null && routed !== tid) return "elsewhere";
  if (typeof code === "string" && code) {
    const ids = await userInstallationIds(code);
    if (!ids.includes(installationId)) return "not_owner";
    return "ok";
  }
  if (routed === tid) return "already_ours";
  const now = Date.now();
  const issued = Number(st.iat) * 1000;
  if (!Number.isFinite(issued) || now - issued > SETUP_FRESH_MS + 5 * 60_000) return "state_stale";
  const inst = await getInstallation(installationId);
  const created = Date.parse(String(inst?.created_at ?? ""));
  if (!Number.isFinite(created)) return "stale";
  // Created after this state was issued (60 s clock skew), and within the last 10 minutes.
  if (created < issued - 60_000 || now - created > SETUP_FRESH_MS || created > now + 60_000) return "stale";
  return "ok";
}

export function githubIntegrationRouter() {
  const router = express.Router();

  router.post("/webhook", express.raw({ type: "*/*", limit: "5mb" }), async (req, res) => {
    const cfg = githubConfig();
    if (!cfg) return res.status(503).json({ success: false, code: "GITHUB_OFF" });
    const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    if (!verifySignature(raw, req.get("X-Hub-Signature-256"), cfg.webhookSecret)) {
      logger.warn("[git] webhook with a bad signature", { delivery: req.get("X-GitHub-Delivery") });
      return res.status(401).json({ success: false, code: "BAD_SIGNATURE" });
    }
    const event = String(req.get("X-GitHub-Event") ?? "");
    const delivery = String(req.get("X-GitHub-Delivery") ?? "");
    if (event === "ping") return res.status(200).json({ success: true, pong: true });
    if (!event || !delivery) return res.status(400).json({ success: false, code: "BAD_REQUEST" });
    let payload: any;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      return res.status(400).json({ success: false, code: "BAD_JSON" });
    }
    const tenant = await tenantForInstallation(payload?.installation?.id ?? null);
    if (!tenant) return res.status(202).json({ success: true, ignored: "unknown installation" });
    try {
      const eventId = await runWithTenant(tenant, () => storeEvent(delivery, event, payload));
      res.status(202).json({ success: true, queued: eventId !== null });
      // Answer GitHub first (it waits about 10 s), then do the work in the tenant.
      if (eventId) setImmediate(() => void runWithTenant(tenant, () => processEvent(eventId)).catch((e) => logger.error("[git] processing failed", { error: e })));
    } catch (e) {
      logger.error("[git] webhook store failed", { error: e });
      if (!res.headersSent) res.status(500).json({ success: false });
    }
  });

  router.get("/setup", async (req, res) => {
    const st = readState<{ k: string; u: number; t: number; p?: number; iat?: number }>(req.query.state);
    const installationId = Number(req.query.installation_id);
    if (!st || st.k !== "install" || !Number.isInteger(installationId) || installationId <= 0) {
      return res.status(400).send(page("Link expired", `<h1>That link has expired</h1><p>Start again from the project's GitHub tab.</p><a href="${appUrl("/my-projects")}">Back to My projects</a>`));
    }
    const tenant = await tenantOf(st.t);
    if (!tenant) return res.status(400).send(page("Unknown school", "<h1>Unknown school</h1>"));
    try {
      // MIS-ISO-3: installation_id is only a query parameter -- prove it is this person's.
      const verdict = await verifyInstallationOwnership(installationId, tenant.tid, st, req.query.code);
      if (verdict === "already_ours") {
        const back = st.p ? `/my-projects?project=${st.p}&tab=github&installation=${installationId}` : "/my-projects";
        return res.redirect(302, appUrl(back));
      }
      if (verdict !== "ok") {
        logger.warn("[git] setup refused: installation not proven", { installationId, tid: tenant.tid, verdict });
        return res
          .status(verdict === "elsewhere" ? 409 : 403)
          .send(page("GitHub", `<h1>Couldn't verify this installation</h1><p>${verdict === "elsewhere" ? "This GitHub installation is already connected to another school." : "Install the app again from the project's GitHub tab and finish within 10 minutes."}</p><a href="${appUrl("/my-projects")}">Back to My projects</a>`));
      }
      const inst = await getInstallation(installationId);
      await routeInstallation(installationId, tenant.tid, inst.account?.login ?? null);
      await runWithTenant(tenant, () =>
        db.execute(sql`
          INSERT INTO GitInstallation (installation_id, account_id, account_login, account_type, installed_by, created_at, updated_at)
          VALUES (${installationId}, ${inst.account?.id ?? null}, ${inst.account?.login ?? "unknown"}, ${inst.account?.type ?? "User"}, ${st.u}, UTC_TIMESTAMP(), UTC_TIMESTAMP())
          ON DUPLICATE KEY UPDATE account_login = VALUES(account_login), installed_by = COALESCE(installed_by, VALUES(installed_by)), removed_at = NULL, updated_at = UTC_TIMESTAMP()`),
      );
      const back = st.p ? `/my-projects?project=${st.p}&tab=github&installation=${installationId}` : "/my-projects";
      return res.redirect(302, appUrl(back));
    } catch (e: any) {
      logger.error("[git] setup failed", { error: e });
      return res.status(e?.status === 409 ? 409 : 502).send(page("GitHub", `<h1>Couldn't finish connecting</h1><p>${String(e?.message ?? "GitHub didn't answer").replace(/[<>&]/g, "")}</p><a href="${appUrl("/my-projects")}">Back</a>`));
    }
  });

  router.get("/oauth/callback", async (req, res) => {
    const st = readState<{ k: string; u: number; t: number; r?: string }>(req.query.state);
    if (!st || st.k !== "oauth" || !req.query.code) return res.status(400).send(page("Link expired", `<h1>That link has expired</h1><p>Try Connect GitHub again.</p><a href="${appUrl("/my-projects")}">Back</a>`));
    const tenant = await tenantOf(st.t);
    if (!tenant) return res.status(400).send(page("Unknown school", "<h1>Unknown school</h1>"));
    try {
      const { user, emails } = await exchangeCode(String(req.query.code), apiUrl("/integrations/github/oauth/callback"));
      await runWithTenant(tenant, async () => {
        const taken = await db.execute(sql`SELECT user_id FROM GitIdentity WHERE github_user_id = ${user.id} AND user_id <> ${st.u}`);
        const rows = Array.isArray(taken) && Array.isArray(taken[0]) ? taken[0] : (taken as any);
        if (rows.length) throw Object.assign(new Error("This GitHub account is already connected to another person"), { status: 409 });
        await db.execute(sql`
          INSERT INTO GitIdentity (user_id, github_user_id, login, name, avatar_url, emails, verified_at, created_at, updated_at)
          VALUES (${st.u}, ${user.id}, ${user.login}, ${user.name}, ${user.avatar_url}, ${JSON.stringify(emails)}, UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())
          ON DUPLICATE KEY UPDATE github_user_id = VALUES(github_user_id), login = VALUES(login), name = VALUES(name), avatar_url = VALUES(avatar_url),
            emails = VALUES(emails), verified_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()`);
        // Commits pushed before connecting become theirs now.
        await db.execute(sql`UPDATE GitCommit SET author_user_id = ${st.u} WHERE author_user_id IS NULL AND (LOWER(author_login) = ${user.login.toLowerCase()}${emails.length ? sql` OR author_email IN (${sql.join(emails.map((e) => sql`${e}`), sql`, `)})` : sql``})`);
      });
      const back = st.r && st.r.startsWith("/") ? st.r : "/my-projects";
      return res.redirect(302, appUrl(`${back}${back.includes("?") ? "&" : "?"}github=connected`));
    } catch (e: any) {
      logger.error("[git] oauth failed", { error: e?.message ?? e });
      return res.status(e?.status === 409 ? 409 : 502).send(page("GitHub", `<h1>Couldn't connect GitHub</h1><p>${String(e?.message ?? "GitHub didn't answer").replace(/[<>&]/g, "")}</p><a href="${appUrl("/my-projects")}">Back</a>`));
    }
  });

  const draftAction = async (req: express.Request, res: express.Response, html: boolean) => {
    const st = readState<{ d: number; u: number; t: number; a: string }>(req.query.token);
    if (!st || st.a !== "submit") return html ? res.status(400).send(page("Link expired", `<h1>That link has expired</h1><p>Open the report in the MIS instead.</p><a href="${appUrl("/my-projects")}">Open My projects</a>`)) : res.status(400).json({ success: false, code: "EXPIRED" });
    const tenant = await tenantOf(st.t);
    if (!tenant) return res.status(400).json({ success: false });
    try {
      const reportId = await runWithTenant(tenant, () => submitDraft(Number(st.d), Number(st.u)));
      return html ? res.send(page("Report submitted", `<h1>Report submitted ✅</h1><p>Your team lead has been told.</p><a href="${appUrl("/my-projects")}">Open My projects</a>`)) : res.json({ success: true, data: { reportId } });
    } catch (e: any) {
      const msg = String(e?.message ?? "This draft can't be submitted").replace(/[<>&]/g, "");
      return html ? res.status(e?.status ?? 400).send(page("Report", `<h1>Not submitted</h1><p>${msg}</p><a href="${appUrl("/my-projects")}">Review it in the MIS</a>`)) : res.status(e?.status ?? 400).json({ success: false, message: msg });
    }
  };
  router.post("/drafts/action", (req, res) => void draftAction(req, res, false));
  router.get("/drafts/action", (req, res) => void draftAction(req, res, true));

  return router;
}
