import crypto from "crypto";

/**
 * Small AES-256-GCM box for secrets stored in the database (Google refresh
 * tokens). Key: REMINDERS_ENCRYPTION_KEY, or -- so development works out of
 * the box -- a key derived from JWT_SECRET with a dedicated label. Output:
 * "v1.<iv>.<tag>.<ciphertext>" in base64url.
 */
const key = () => {
  const material = process.env.REMINDERS_ENCRYPTION_KEY || `nga-reminders-box:${process.env.JWT_SECRET || "dev"}`;
  return crypto.createHash("sha256").update(material).digest();
};

export const seal = (plain: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
};

export const open = (sealed: string): string => {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised sealed value");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
};

/** Short signed token for OAuth `state` (payload + expiry, HMAC). */
export const signState = (payload: Record<string, unknown>, ttlMs: number, now = Date.now()) => {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: now + ttlMs })).toString("base64url");
  const mac = crypto.createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${mac}`;
};

export const verifyState = <T extends Record<string, unknown>>(state: string, now = Date.now()): T | null => {
  const [body, mac] = String(state || "").split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", key()).update(body).digest("base64url");
  if (expected.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return typeof payload.exp === "number" && payload.exp > now ? (payload as T) : null;
  } catch {
    return null;
  }
};
