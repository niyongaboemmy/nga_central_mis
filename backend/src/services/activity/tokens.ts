import crypto from "crypto";
import { PRIMARY_TENANT_ID } from "../../vendor/nga-tenancy";
import { scopeTid } from "../../tenancy/scoped";

/**
 * Small HMAC tokens used by the collector (plan §5.1, §5.3, §9.4):
 *
 *  - device token `dt`: proves that a browser was issued this `did`, so an anonymous batch
 *    cannot write into someone else's device history by guessing ids;
 *  - beacon ticket: lets a sendBeacon on unload (which can't set headers) prove its user
 *    for 10 minutes;
 *  - stream ticket: single-use, 60 s, so the 24 h JWT never ends up in nginx logs as `?token=`.
 */
const secret = () =>
  process.env.ACTIVITY_SECRET ||
  crypto
    .createHash("sha256")
    .update(`nga-activity:${process.env.JWT_SECRET || "dev-secret"}`)
    .digest("hex");

const mac = (s: string) => crypto.createHmac("sha256", secret()).update(s).digest("base64url");

const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

export const DEVICE_ID_RE = /^[A-Za-z0-9_-]{22}$/;

export const newDeviceId = () => crypto.randomBytes(16).toString("base64url"); // 22 chars

export const deviceToken = (did: string) => mac(`dt.${did}`).slice(0, 32);

export const verifyDeviceToken = (did: string, dt: unknown) =>
  typeof dt === "string" && DEVICE_ID_RE.test(did) && safeEqual(deviceToken(did), dt);

/** Short code shown for visitors: V- + 7 chars of base32 from the device id. */
export const visitorCode = (did: string) => {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.createHash("sha1").update(did).digest();
  let out = "";
  for (let i = 0; i < 7; i++) out += alphabet[bytes[i] % alphabet.length];
  return `V-${out}`;
};

/** The school the current request runs for, or null (never throws). */
const hereTid = (): number | null => {
  try {
    return scopeTid("activity ticket");
  } catch {
    return null;
  }
};

/**
 * Beacon and stream tickets carry the school they were issued in (user ids repeat
 * across schools): a ticket is honoured only by a request running in that school.
 * Tickets minted before multi-tenancy (no tid part) belong to the primary school.
 */
export const issueBeaconTicket = (userId: number, did: string, ttlMs = 10 * 60_000, tid: number = scopeTid("beacon ticket")) => {
  const body = `${userId}.${did}.${Date.now() + ttlMs}.${tid}`;
  return `${body}.${mac(`bt.${body}`).slice(0, 32)}`;
};

export const verifyBeaconTicket = (ticket: unknown, did: string): number | null => {
  if (typeof ticket !== "string") return null;
  const parts = ticket.split(".");
  if (parts.length !== 4 && parts.length !== 5) return null;
  const sig = parts[parts.length - 1];
  const [uid, tDid, exp] = parts;
  const tid = parts.length === 5 ? Number(parts[3]) : PRIMARY_TENANT_ID;
  const body = parts.slice(0, -1).join(".");
  if (!safeEqual(mac(`bt.${body}`).slice(0, 32), sig)) return null;
  if (tDid !== did || Number(exp) < Date.now()) return null;
  if (tid !== hereTid()) return null;
  const n = Number(uid);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Single-use stream tickets. Kept in memory, which is fine for the single MIS process. */
const usedStreamTickets = new Map<string, number>();

export const issueStreamTicket = (userId: number, ttlMs = 60_000, tid: number = scopeTid("stream ticket")) => {
  const nonce = crypto.randomBytes(9).toString("base64url");
  const body = `${userId}.${Date.now() + ttlMs}.${nonce}.${tid}`;
  return `${body}.${mac(`st.${body}`).slice(0, 32)}`;
};

/** The user a stream ticket was issued to, or null. `tid` (default: the request's) must match. */
export const consumeStreamTicket = (ticket: unknown, tid: number | null = hereTid()): number | null => {
  if (typeof ticket !== "string") return null;
  const parts = ticket.split(".");
  if (parts.length !== 4 && parts.length !== 5) return null;
  const sig = parts[parts.length - 1];
  const [uid, exp, nonce] = parts;
  const ticketTid = parts.length === 5 ? Number(parts[3]) : PRIMARY_TENANT_ID;
  const body = parts.slice(0, -1).join(".");
  if (!safeEqual(mac(`st.${body}`).slice(0, 32), sig)) return null;
  const expMs = Number(exp);
  if (expMs < Date.now() || usedStreamTickets.has(nonce)) return null;
  if (ticketTid !== tid) return null;
  usedStreamTickets.set(nonce, expMs);
  if (usedStreamTickets.size > 1000) {
    const now = Date.now();
    for (const [k, v] of usedStreamTickets) if (v < now) usedStreamTickets.delete(k);
  }
  const n = Number(uid);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** The school a (validly signed) stream ticket was issued in, or null. */
export const streamTicketTid = (ticket: unknown): number | null => {
  if (typeof ticket !== "string") return null;
  const parts = ticket.split(".");
  if (parts.length === 4) return PRIMARY_TENANT_ID;
  if (parts.length !== 5) return null;
  const body = parts.slice(0, -1).join(".");
  if (!safeEqual(mac(`st.${body}`).slice(0, 32), parts[4])) return null;
  const n = Number(parts[3]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** 26-char ULID (Crockford base32): 48-bit ms time + 80 bits of randomness. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const ulid = (time = Date.now()) => {
  let t = time;
  let ts = "";
  for (let i = 0; i < 10; i++) {
    ts = CROCKFORD[t % 32] + ts;
    t = Math.floor(t / 32);
  }
  const rnd = crypto.randomBytes(16);
  let r = "";
  for (let i = 0; i < 16; i++) r += CROCKFORD[rnd[i] % 32];
  return ts + r;
};
export const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
