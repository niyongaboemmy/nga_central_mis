import crypto from "crypto";
import { and, eq, gte, notInArray } from "drizzle-orm";
import { db } from "../../db";
import { GoogleCalendarEvent, GoogleCalendarLink } from "../../db/reminderSchema";
import logger from "../../utils/logger";
import { collectOccurrences, type Occurrence } from "./occurrences";
import { getPreferences, type ReminderPreferences } from "./preferences";
import { open, seal, signState, verifyState } from "./secretBox";
import { apiUrl, appUrl } from "./webPush";

/**
 * "Connect Google Calendar" (REMINDERS_SOLUTION_PROPOSAL.md §6.2): works with
 * any Google account. The app creates ONE secondary calendar
 * ("NGA · My Timetable") in the user's account and keeps it in sync; the phone's
 * Google Calendar app then rings each reminder itself -- even offline.
 *
 * Scope: calendar.app.created only -- the app can manage the calendars it
 * created and nothing else (it never sees the user's own events).
 *
 * Setup (once, Google Cloud console, free):
 *   - OAuth client (Web): add redirect URI  <REMINDERS_API_URL>/reminders/google/callback
 *   - Enable the Google Calendar API; add the calendar.app.created scope to the
 *     consent screen (sensitive scope -> free Google verification; up to 100
 *     test users meanwhile).
 *   - API env: GOOGLE_CLIENT_ID (already set for sign-in), GOOGLE_CLIENT_SECRET.
 */

export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.app.created"];
const CAL = "https://www.googleapis.com/calendar/v3";
const SYNC_DAYS = 21;

export const googleConfig = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: apiUrl("/reminders/google/callback") };
};

/** HTTP transport (tests inject a fake). */
export type GoogleFetch = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; json: any }>;
const realFetch: GoogleFetch = async (url, init) => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
};
let gfetch: GoogleFetch = realFetch;
export const setGoogleTransport = (fn: GoogleFetch | null) => {
  gfetch = fn ?? realFetch;
};

// ─── OAuth ───────────────────────────────────────────────────────────────────

export const buildAuthUrl = (userId: number) => {
  const cfg = googleConfig();
  if (!cfg) return null;
  const state = signState({ uid: userId, n: crypto.randomBytes(8).toString("hex") }, 10 * 60_000);
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline", // refresh token, so sync works when the user is away
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
};

const form = (data: Record<string, string>) => new URLSearchParams(data).toString();

const tokenRequest = async (data: Record<string, string>) => {
  const res = await gfetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form(data),
  });
  if (res.status !== 200) {
    const err: any = new Error(res.json?.error_description || res.json?.error || `token request failed (${res.status})`);
    err.oauthError = res.json?.error;
    throw err;
  }
  return res.json as { access_token: string; refresh_token?: string; id_token?: string; expires_in: number };
};

const emailFromIdToken = (idToken?: string) => {
  if (!idToken) return null;
  try {
    return JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")).email ?? null;
  } catch {
    return null;
  }
};

/** OAuth callback: store the (encrypted) refresh token, create the calendar, first sync. */
export const completeConnect = async (code: string, state: string) => {
  const cfg = googleConfig();
  if (!cfg) throw new Error("Google Calendar is not configured");
  const payload = verifyState<{ uid: number }>(state);
  if (!payload?.uid) throw new Error("This sign-in link expired. Start again from the Reminders page.");
  const tokens = await tokenRequest({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });
  if (!tokens.refresh_token) throw new Error("Google didn't grant offline access. Please try again.");
  const userId = Number(payload.uid);
  const values = {
    user_id: userId,
    google_email: emailFromIdToken(tokens.id_token),
    refresh_token_enc: seal(tokens.refresh_token),
    calendar_id: null as string | null,
    status: "active",
    last_error: null as string | null,
  };
  await db.insert(GoogleCalendarLink).values(values).onDuplicateKeyUpdate({ set: values });
  await db.delete(GoogleCalendarEvent).where(eq(GoogleCalendarEvent.user_id, userId));
  await syncGoogleCalendar(userId, { accessToken: tokens.access_token });
  return userId;
};

const accessTokenFor = async (link: typeof GoogleCalendarLink.$inferSelect) => {
  const cfg = googleConfig();
  if (!cfg) throw new Error("Google Calendar is not configured");
  const tokens = await tokenRequest({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: open(link.refresh_token_enc),
    grant_type: "refresh_token",
  });
  return tokens.access_token;
};

const api = async (token: string, method: string, path: string, body?: unknown) => {
  const res = await gfetch(`${CAL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res;
};

// ─── Sync ────────────────────────────────────────────────────────────────────

const alarmOffsets = (occ: Occurrence, prefs: ReminderPreferences) => {
  const setting = prefs.settings[occ.kind];
  if (!setting || !setting.enabled) return [];
  if (occ.kind === "lesson" && occ.role === "teaching" && !prefs.lessonCustomized) return [15];
  return setting.offsets;
};

/** The Google event for one occurrence (pure, unit-tested). */
export const eventBody = (occ: Occurrence, prefs: ReminderPreferences) => {
  const end = occ.end && occ.end > occ.start ? occ.end : new Date(occ.start.getTime() + 30 * 60_000);
  const offsets = alarmOffsets(occ, prefs).slice(0, 5); // Google allows 5 overrides
  return {
    summary: occ.title,
    location: occ.location ?? undefined,
    description: [occ.detail, `Open in NGA: ${appUrl(occ.link)}`].filter(Boolean).join("\n"),
    start: { dateTime: occ.start.toISOString(), timeZone: "Africa/Kigali" },
    end: { dateTime: end.toISOString(), timeZone: "Africa/Kigali" },
    reminders: { useDefault: false, overrides: offsets.map((minutes) => ({ method: "popup", minutes })) },
    extendedProperties: { private: { ngaKey: occ.key } },
    source: { title: "NGA", url: appUrl(occ.link) },
  };
};

const hashOf = (body: unknown) => crypto.createHash("sha1").update(JSON.stringify(body)).digest("hex");

const ensureCalendar = async (token: string, link: typeof GoogleCalendarLink.$inferSelect) => {
  if (link.calendar_id) {
    const check = await api(token, "GET", `/calendars/${encodeURIComponent(link.calendar_id)}`);
    if (check.status === 200) return link.calendar_id;
  }
  const created = await api(token, "POST", "/calendars", {
    summary: "NGA · My Timetable",
    description: "Lessons, deadlines and meetings from New Generation Academy. Managed by NGA — changes here are overwritten.",
    timeZone: "Africa/Kigali",
  });
  if (created.status !== 200) throw new Error(`Couldn't create the NGA calendar (${created.status})`);
  const calendarId = created.json.id as string;
  await db.update(GoogleCalendarLink).set({ calendar_id: calendarId }).where(eq(GoogleCalendarLink.user_id, link.user_id));
  await db.delete(GoogleCalendarEvent).where(eq(GoogleCalendarEvent.user_id, link.user_id));
  return calendarId;
};

export interface SyncResult {
  created: number;
  updated: number;
  removed: number;
}

/**
 * Mirror the next SYNC_DAYS days of the user's occurrences into their NGA
 * calendar: insert new ones, patch changed ones (hash compare), delete ones
 * that disappeared. Never throws; records the error on the link instead.
 */
export const syncGoogleCalendar = async (userId: number, opts: { accessToken?: string; now?: Date } = {}): Promise<SyncResult | null> => {
  const [link] = await db.select().from(GoogleCalendarLink).where(eq(GoogleCalendarLink.user_id, userId)).limit(1);
  if (!link || link.status !== "active" || !googleConfig()) return null;
  const now = opts.now ?? new Date();
  const result: SyncResult = { created: 0, updated: 0, removed: 0 };
  try {
    const prefs = await getPreferences(userId);
    const token = opts.accessToken ?? (await accessTokenFor(link));
    const calendarId = await ensureCalendar(token, link);
    const cal = `/calendars/${encodeURIComponent(calendarId)}/events`;
    const occurrences = prefs.channels.googleCalendar
      ? await collectOccurrences(userId, now, new Date(now.getTime() + SYNC_DAYS * 86_400_000))
      : [];
    const existing = await db
      .select()
      .from(GoogleCalendarEvent)
      .where(eq(GoogleCalendarEvent.user_id, userId));
    const byKey = new Map(existing.map((e) => [e.occurrence_key, e]));
    const keep: string[] = [];

    for (const occ of occurrences) {
      const body = eventBody(occ, prefs);
      const hash = hashOf(body);
      const row = byKey.get(occ.key);
      keep.push(occ.key);
      if (row && row.content_hash === hash) continue;
      if (row) {
        const res = await api(token, "PATCH", `${cal}/${encodeURIComponent(row.event_id)}`, body);
        if (res.status === 200) {
          await db
            .update(GoogleCalendarEvent)
            .set({ content_hash: hash, starts_at: occ.start })
            .where(and(eq(GoogleCalendarEvent.user_id, userId), eq(GoogleCalendarEvent.occurrence_key, occ.key)));
          result.updated++;
          continue;
        }
        if (res.status !== 404 && res.status !== 410) throw new Error(`update failed (${res.status})`);
      }
      const res = await api(token, "POST", cal, body);
      if (res.status !== 200) throw new Error(`insert failed (${res.status})`);
      const values = { user_id: userId, occurrence_key: occ.key, event_id: res.json.id, content_hash: hash, starts_at: occ.start };
      await db.insert(GoogleCalendarEvent).values(values).onDuplicateKeyUpdate({ set: values });
      result.created++;
    }

    // Future events we own that are no longer planned (lesson moved away,
    // quiz cancelled, kind switched off): remove them.
    const staleFilter = [eq(GoogleCalendarEvent.user_id, userId), gte(GoogleCalendarEvent.starts_at, now)];
    if (keep.length) staleFilter.push(notInArray(GoogleCalendarEvent.occurrence_key, keep));
    const stale = await db.select().from(GoogleCalendarEvent).where(and(...staleFilter));
    for (const row of stale) {
      const res = await api(token, "DELETE", `${cal}/${encodeURIComponent(row.event_id)}`);
      if (res.status === 204 || res.status === 200 || res.status === 404 || res.status === 410) {
        await db
          .delete(GoogleCalendarEvent)
          .where(and(eq(GoogleCalendarEvent.user_id, userId), eq(GoogleCalendarEvent.occurrence_key, row.occurrence_key)));
        result.removed++;
      }
    }
    await db.update(GoogleCalendarLink).set({ last_sync_at: now, last_error: null }).where(eq(GoogleCalendarLink.user_id, userId));
    return result;
  } catch (error: any) {
    // invalid_grant: the user removed NGA's access in their Google account.
    const revoked = error?.oauthError === "invalid_grant";
    await db
      .update(GoogleCalendarLink)
      .set({ status: revoked ? "revoked" : "active", last_error: String(error?.message || error).slice(0, 500) })
      .where(eq(GoogleCalendarLink.user_id, userId));
    logger.warn("[reminders] google calendar sync failed", { data: { userId, error: String(error?.message || error) } });
    return null;
  }
};

export const getGoogleLink = async (userId: number) => {
  const [link] = await db.select().from(GoogleCalendarLink).where(eq(GoogleCalendarLink.user_id, userId)).limit(1);
  return link ?? null;
};

/** Delete the NGA calendar, revoke NGA's access, forget the link. */
export const disconnectGoogle = async (userId: number) => {
  const link = await getGoogleLink(userId);
  if (!link) return false;
  try {
    const refresh = open(link.refresh_token_enc);
    if (link.status === "active" && link.calendar_id && googleConfig()) {
      const token = await accessTokenFor(link).catch(() => null);
      if (token) await api(token, "DELETE", `/calendars/${encodeURIComponent(link.calendar_id)}`).catch(() => undefined);
    }
    await gfetch(`https://oauth2.googleapis.com/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form({ token: refresh }),
    }).catch(() => undefined);
  } catch {
    /* best effort: the link is removed regardless */
  }
  await db.delete(GoogleCalendarEvent).where(eq(GoogleCalendarEvent.user_id, userId));
  await db.delete(GoogleCalendarLink).where(eq(GoogleCalendarLink.user_id, userId));
  return true;
};

/** Background re-sync for every connected user (planner tick). */
export const syncAllGoogleCalendars = async () => {
  if (!googleConfig()) return 0;
  const links = await db.select({ user_id: GoogleCalendarLink.user_id }).from(GoogleCalendarLink).where(eq(GoogleCalendarLink.status, "active"));
  let ok = 0;
  for (const { user_id } of links) {
    if (await syncGoogleCalendar(user_id)) ok++;
    await new Promise((r) => setImmediate(r));
  }
  return ok;
};
