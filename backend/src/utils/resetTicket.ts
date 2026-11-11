import crypto from "crypto";
import config from "../config";

/**
 * The password-reset ticket (forgot-password, multi-tenancy).
 *
 * POST /auth/forgot-password must answer exactly the same whether the e-mail is
 * unknown, known to one school or known to several -- so the response can't carry
 * a JWT naming the user or the school. It carries this ticket instead: AES-256-GCM
 * over a fixed-size payload listing the (school, user) pairs a code was sent to
 * (possibly none), so its length and shape never vary. POST /auth/verify-reset-otp
 * opens it and tries the code in each listed school.
 */
export interface ResetCandidate {
  tid: number;
  uid: number;
  tv: number;
}

const PREFIX = "rt1.";
const PADDED = 640; // bytes of plaintext, always (room for MAX_CANDIDATES)
export const MAX_RESET_CANDIDATES = 8;

const key = () => crypto.createHash("sha256").update(`nga-reset-ticket:v1:${config.jwtSecret}`).digest();

export const isResetTicket = (token: unknown): token is string => typeof token === "string" && token.startsWith(PREFIX);

export function sealResetTicket(candidates: ResetCandidate[], ttlSeconds: number): string {
  const body = JSON.stringify({
    c: candidates.slice(0, MAX_RESET_CANDIDATES).map((c) => [c.tid, c.uid, c.tv]),
    e: Math.floor(Date.now() / 1000) + ttlSeconds,
    n: crypto.randomBytes(8).toString("hex"),
  });
  const plain = Buffer.alloc(PADDED, 0x20); // space padding: JSON.parse ignores it
  plain.write(body.slice(0, PADDED), "utf8");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64url");
}

/** The candidates of a valid, unexpired ticket; null otherwise. */
export function openResetTicket(ticket: string): ResetCandidate[] | null {
  if (!isResetTicket(ticket)) return null;
  try {
    const raw = Buffer.from(ticket.slice(PREFIX.length), "base64url");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const p = JSON.parse(plain);
    if (!p || typeof p.e !== "number" || p.e < Math.floor(Date.now() / 1000)) return null;
    return (Array.isArray(p.c) ? p.c : [])
      .map((x: any) => ({ tid: Number(x?.[0]), uid: Number(x?.[1]), tv: Number(x?.[2]) || 0 }))
      .filter((c: ResetCandidate) => Number.isSafeInteger(c.tid) && c.tid > 0 && Number.isSafeInteger(c.uid) && c.uid > 0);
  } catch {
    return null;
  }
}
