import bcrypt from "bcryptjs";
import crypto from "crypto";

/** bcrypt hashes start with $2a$/$2b$/$2y$. */
export const isHashedClientSecret = (stored: string | null | undefined) =>
  typeof stored === "string" && /^\$2[aby]\$\d{2}\$/.test(stored);

export const hashClientSecret = (plain: string) => bcrypt.hash(plain, 12);

/**
 * Checks a presented SSO client secret against System.client_secret.
 *
 * Accepts both storage formats so rotating to hashed secrets
 * (scripts/hash-sso-client-secrets.ts) needs no coordinated deploy of the
 * spoke apps: bcrypt when the stored value is a hash, otherwise a
 * constant-time comparison against the legacy plaintext value.
 */
export const verifyClientSecret = async (
  presented: string,
  stored: string | null | undefined,
): Promise<boolean> => {
  if (!presented || !stored) return false;
  if (isHashedClientSecret(stored)) {
    return bcrypt.compare(presented, stored);
  }
  const a = crypto.createHash("sha256").update(String(presented)).digest();
  const b = crypto.createHash("sha256").update(String(stored)).digest();
  return crypto.timingSafeEqual(a, b);
};
