import crypto from "crypto";
import fs from "fs";
import path from "path";
import logger from "../../utils/logger";

/**
 * The key MIS signs SSO logout tokens with (RS256), published as a JWKS at
 * /.well-known/jwks.json so every NGA app can verify them without sharing a
 * secret (their own JWT secrets differ, and client secrets may be stored
 * hashed -- neither can sign anything verifiable).
 *
 * Production: SSO_SIGNING_PRIVATE_KEY = the PEM (literal "\n" allowed).
 * Development: generated once into backend/.sso-signing-key.pem (git-ignored).
 * Tests: generated in memory.
 */

interface SigningKey {
  privateKey: crypto.KeyObject;
  publicJwk: crypto.JsonWebKey & { kid: string; alg: "RS256"; use: "sig" };
  kid: string;
}

let cached: SigningKey | null | undefined;
const DEV_FILE = path.resolve(__dirname, "../../../.sso-signing-key.pem");

const fromPem = (pem: string): SigningKey => {
  const privateKey = crypto.createPrivateKey(pem);
  const jwk = crypto.createPublicKey(privateKey).export({ format: "jwk" }) as crypto.JsonWebKey;
  // RFC 7638 thumbprint as the key id.
  const kid = crypto.createHash("sha256").update(JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n })).digest("base64url");
  return { privateKey, kid, publicJwk: { ...jwk, kid, alg: "RS256", use: "sig" } };
};

const generatePem = () =>
  crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();

export const loadSigningKey = (): SigningKey | null => {
  if (cached !== undefined) return cached;
  const fromEnv = process.env.SSO_SIGNING_PRIVATE_KEY?.trim();
  try {
    if (fromEnv) {
      cached = fromPem(fromEnv.replace(/\\n/g, "\n"));
    } else if (process.env.NODE_ENV === "production") {
      logger.warn("[sso] SSO_SIGNING_PRIVATE_KEY not set -- single sign-out to other apps is disabled");
      cached = null;
    } else if (process.env.NODE_ENV === "test") {
      cached = fromPem(generatePem());
    } else {
      if (!fs.existsSync(DEV_FILE)) {
        fs.writeFileSync(DEV_FILE, generatePem(), { mode: 0o600 });
        logger.info(`[sso] generated a development signing key in ${DEV_FILE}`);
      }
      cached = fromPem(fs.readFileSync(DEV_FILE, "utf8"));
    }
  } catch (error) {
    logger.error("[sso] could not load the signing key", { error });
    cached = null;
  }
  return cached;
};

/** Test hook. */
export const resetSigningKeyForTests = () => {
  cached = undefined;
};

export const jwks = () => {
  const key = loadSigningKey();
  return { keys: key ? [key.publicJwk] : [] };
};

/** Who issues SSO tokens: the public API origin. */
export const ssoIssuer = () =>
  (process.env.SSO_ISSUER || process.env.REMINDERS_API_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/$/, "");
