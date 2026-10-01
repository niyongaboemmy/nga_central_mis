import crypto from "crypto";

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

export const issueBeaconTicket = (userId: number, did: string, ttlMs = 10 * 60_000) => {
  const body = `${userId}.${did}.${Date.now() + ttlMs}`;
  return `${body}.${mac(`bt.${body}`).slice(0, 32)}`;
};

export const verifyBeaconTicket = (ticket: unknown, did: string): number | null => {
  if (typeof ticket !== "string") return null;
  const parts = ticket.split(".");
  if (parts.length !== 4) return null;
  const [uid, tDid, exp, sig] = parts;
  const body = `${uid}.${tDid}.${exp}`;
  if (!safeEqual(mac(`bt.${body}`).slice(0, 32), sig)) return null;
  if (tDid !== did || Number(exp) < Date.now()) return null;
  const n = Number(uid);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Single-use stream tickets. Kept in memory, which is fine for the single MIS process. */
const usedStreamTickets = new Map<string, number>();

export const issueStreamTicket = (userId: number, ttlMs = 60_000) => {
  const nonce = crypto.randomBytes(9).toString("base64url");
  const body = `${userId}.${Date.now() + ttlMs}.${nonce}`;
  return `${body}.${mac(`st.${body}`).slice(0, 32)}`;
};

export const consumeStreamTicket = (ticket: unknown): number | null => {
  if (typeof ticket !== "string") return null;
  const parts = ticket.split(".");
  if (parts.length !== 4) return null;
  const [uid, exp, nonce, sig] = parts;
  const body = `${uid}.${exp}.${nonce}`;
  if (!safeEqual(mac(`st.${body}`).slice(0, 32), sig)) return null;
  const expMs = Number(exp);
  if (expMs < Date.now() || usedStreamTickets.has(nonce)) return null;
  usedStreamTickets.set(nonce, expMs);
  if (usedStreamTickets.size > 1000) {
    const now = Date.now();
    for (const [k, v] of usedStreamTickets) if (v < now) usedStreamTickets.delete(k);
  }
  const n = Number(uid);
  return Number.isInteger(n) && n > 0 ? n : null;
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
