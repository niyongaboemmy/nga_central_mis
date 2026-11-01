import crypto from "crypto";

/**
 * Envelope encryption for secrets users give us, such as their own AI provider keys
 * (PERSONAL_AI_PROVIDERS_PLAN.md §6).
 *
 * - Each secret is sealed with its own random 256-bit data key (AES-256-GCM).
 * - The data key is wrapped with the key-encryption key (KEK) from the environment:
 *   AI_VAULT_KEK_<n> (32 random bytes, base64) and AI_VAULT_KEK_CURRENT=<n>.
 * - The additional authenticated data (AAD) names the row the secret belongs to, so a
 *   ciphertext copied onto another user's row will not open.
 * - There is deliberately no fallback key (unlike reminders/secretBox.ts): without a KEK
 *   the vault reports itself unconfigured and the features using it stay off.
 *
 * Rotation re-wraps only the data keys (scripts/vault-rotate.ts); secrets are never
 * re-encrypted. Losing every KEK makes stored secrets unrecoverable: users re-enter them.
 */

export interface SealedSecret {
  ciphertext: Buffer;
  nonce: Buffer;
  tag: Buffer;
  wrappedDek: Buffer;
  dekNonce: Buffer;
  dekTag: Buffer;
  kekVersion: number;
}

export class VaultNotConfiguredError extends Error {
  readonly code = "VAULT_NOT_CONFIGURED";
  constructor() {
    super("The key vault is not configured (AI_VAULT_KEK_CURRENT / AI_VAULT_KEK_<n>).");
  }
}

const ALGO = "aes-256-gcm";

function kek(version: number): Buffer {
  const raw = process.env[`AI_VAULT_KEK_${version}`];
  if (!raw) throw new VaultNotConfiguredError();
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new VaultNotConfiguredError();
  return key;
}

export function currentKekVersion(): number {
  const v = Number(process.env.AI_VAULT_KEK_CURRENT);
  if (!Number.isInteger(v) || v < 1) throw new VaultNotConfiguredError();
  return v;
}

export function isVaultConfigured(): boolean {
  try {
    kek(currentKekVersion());
    return true;
  } catch {
    return false;
  }
}

function encrypt(key: Buffer, plain: Buffer, aad: string) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, nonce);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { ciphertext, nonce, tag: cipher.getAuthTag() };
}

function decrypt(key: Buffer, ciphertext: Buffer, nonce: Buffer, tag: Buffer, aad: string): Buffer {
  const decipher = crypto.createDecipheriv(ALGO, key, nonce);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

const dekAad = (aad: string, version: number) => `dek|kek${version}|${aad}`;

export function seal(secret: string, aad: string): SealedSecret {
  const kekVersion = currentKekVersion();
  const dek = crypto.randomBytes(32);
  try {
    const body = encrypt(dek, Buffer.from(secret, "utf8"), aad);
    const wrapped = encrypt(kek(kekVersion), dek, dekAad(aad, kekVersion));
    return { ...body, wrappedDek: wrapped.ciphertext, dekNonce: wrapped.nonce, dekTag: wrapped.tag, kekVersion };
  } finally {
    dek.fill(0);
  }
}

/** Throws if the KEK is missing, the data was tampered with, or the AAD doesn't match. */
export function open(s: SealedSecret, aad: string): string {
  const dek = decrypt(kek(s.kekVersion), s.wrappedDek, s.dekNonce, s.dekTag, dekAad(aad, s.kekVersion));
  try {
    return decrypt(dek, s.ciphertext, s.nonce, s.tag, aad).toString("utf8");
  } finally {
    dek.fill(0);
  }
}

/** Re-wrap the data key under the current KEK; the secret itself is untouched. */
export function rewrap(s: SealedSecret, aad: string): SealedSecret {
  const target = currentKekVersion();
  if (s.kekVersion === target) return s;
  const dek = decrypt(kek(s.kekVersion), s.wrappedDek, s.dekNonce, s.dekTag, dekAad(aad, s.kekVersion));
  try {
    const wrapped = encrypt(kek(target), dek, dekAad(aad, target));
    return { ...s, wrappedDek: wrapped.ciphertext, dekNonce: wrapped.nonce, dekTag: wrapped.tag, kekVersion: target };
  } finally {
    dek.fill(0);
  }
}

/** "sk-…a1F9": enough for a person to recognise their key, never enough to use it. */
export function keyHint(secret: string): string {
  const t = secret.trim();
  if (t.length <= 8) return "…" + t.slice(-2);
  const prefix = /^[a-z]{2,6}[-_]/i.exec(t)?.[0] ?? "";
  return `${prefix}…${t.slice(-4)}`;
}
