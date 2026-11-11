import crypto from "crypto";
import { eq } from "drizzle-orm";
import { tenantTimezone } from "../../tenancy/timezone";
import { db } from "../../db";
import { PRIMARY_TENANT_ID } from "../../vendor/nga-tenancy";
import { scopeTid } from "../../tenancy/scoped";
import { CalendarFeedToken } from "../../db/reminderSchema";
import { collectOccurrences, type Occurrence } from "./occurrences";
import { getPreferences, type ReminderPreferences } from "./preferences";
import { appUrl } from "./webPush";

/**
 * Personal calendar feed (webcal://) -- REMINDERS_SOLUTION_PROPOSAL.md §6.3.
 *
 * Apple Calendar and Outlook subscribe to this URL and fire the embedded
 * VALARMs on the device itself, even offline. The URL's random token is the
 * only credential, so it can be rotated (which kills old subscriptions) and
 * the feed holds titles, times and rooms only.
 */

export const FEED_WEEKS = 8;

/**
 * Tokens are "t<tid>.<secret>": the public feed URL has no session, so the token
 * names its school and is then looked up in that school's database only (a
 * tampered prefix finds nothing). Tokens issued before multi-tenancy have no
 * prefix and belong to the primary school.
 */
const FEED_TOKEN_RE = /^(?:t([1-9][0-9]{0,9})\.)?([A-Za-z0-9_-]{20,64})$/;

export const feedTokenTid = (token: string): number | null => {
  const m = FEED_TOKEN_RE.exec(String(token || ""));
  if (!m || token.length > 64) return null;
  return m[1] ? Number(m[1]) : PRIMARY_TENANT_ID;
};

export const issueFeedToken = async (userId: number) => {
  const token = `t${scopeTid("calendar feed")}.${crypto.randomBytes(32).toString("base64url")}`;
  await db
    .insert(CalendarFeedToken)
    .values({ user_id: userId, token })
    .onDuplicateKeyUpdate({ set: { token, created_at: new Date(), last_fetched_at: null } });
  return token;
};

export const getFeedToken = async (userId: number) => {
  const [row] = await db.select().from(CalendarFeedToken).where(eq(CalendarFeedToken.user_id, userId)).limit(1);
  return row?.token ?? null;
};

export const revokeFeedToken = async (userId: number) => {
  await db.delete(CalendarFeedToken).where(eq(CalendarFeedToken.user_id, userId));
};

export const userForFeedToken = async (token: string) => {
  const tid = feedTokenTid(token);
  if (!tid || tid !== scopeTid("calendar feed")) return null;
  const [row] = await db.select().from(CalendarFeedToken).where(eq(CalendarFeedToken.token, token)).limit(1);
  if (!row) return null;
  db.update(CalendarFeedToken)
    .set({ last_fetched_at: new Date() })
    .where(eq(CalendarFeedToken.user_id, row.user_id))
    .catch(() => undefined);
  return row.user_id;
};

// ─── iCalendar (RFC 5545) ────────────────────────────────────────────────────

const escapeText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Fold content lines at 75 octets (RFC 5545 §3.1), never splitting a UTF-8 char. */
export const foldLine = (line: string): string => {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const chSize = Buffer.byteLength(ch, "utf8");
    if (size + chSize > limit) {
      parts.push(current);
      current = "";
      size = 0;
      limit = 74; // continuation lines start with a space
    }
    current += ch;
    size += chSize;
  }
  parts.push(current);
  return parts.join("\r\n ");
};

const alarmOffsets = (occ: Occurrence, prefs: ReminderPreferences) => {
  const setting = prefs.settings[occ.kind];
  if (!setting || !setting.enabled) return [];
  if (occ.kind === "lesson" && occ.role === "teaching" && !prefs.lessonCustomized) return [15];
  return setting.offsets;
};

export const buildIcs = (occurrences: Occurrence[], prefs: ReminderPreferences, now = new Date()) => {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//New Generation Academy//NGA Reminders//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:NGA · My Timetable",
    `X-WR-TIMEZONE:${tenantTimezone()}`,
    "X-WR-CALDESC:Lessons\\, activities and deadlines from NGA",
    // Refresh hints; Apple and Outlook honour them, Google ignores them.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  const stamp = utcStamp(now);
  for (const occ of occurrences) {
    const end = occ.end && occ.end.getTime() > occ.start.getTime() ? occ.end : new Date(occ.start.getTime() + 30 * 60_000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${occ.key.replace(/[^A-Za-z0-9:_-]/g, "-")}@reminders.nga`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utcStamp(occ.start)}`,
      `DTEND:${utcStamp(end)}`,
      `SUMMARY:${escapeText(occ.title)}`,
    );
    if (occ.location) lines.push(`LOCATION:${escapeText(occ.location)}`);
    if (occ.detail) lines.push(`DESCRIPTION:${escapeText(occ.detail)}`);
    lines.push(`URL:${appUrl(occ.link)}`);
    lines.push(`CATEGORIES:${occ.kind.toUpperCase()}`);
    for (const offset of alarmOffsets(occ, prefs)) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeText(occ.title)}`,
        `TRIGGER:-PT${offset}M`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
};

export const buildFeedForUser = async (userId: number, now = new Date()) => {
  const [occurrences, prefs] = await Promise.all([
    collectOccurrences(userId, new Date(now.getTime() - 24 * 3_600_000), new Date(now.getTime() + FEED_WEEKS * 7 * 86_400_000)),
    getPreferences(userId),
  ]);
  return buildIcs(occurrences, prefs, now);
};
