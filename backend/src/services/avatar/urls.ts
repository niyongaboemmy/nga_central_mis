import crypto from "crypto";
import config from "../../config";
import { AVATAR_SIZE_NAMES, AvatarSize, COVER_SIZE_NAMES, CoverSize } from "./image";
import { PRIMARY_TENANT_ID } from "../../vendor/nga-tenancy";
import { responseTenant } from "../../tenancy/claims";

/**
 * Avatar links are what every NGA app stores and renders, so they are:
 *   - absolute     -- Task Mentor, Tendo, Tupo and the desktop app load them cross-origin
 *                     with a plain <img>, no token;
 *   - signed       -- a student's photo can't be fetched by walking user ids;
 *   - versioned    -- the upload time is in the path, so the files are cached for a
 *                     year and a new picture is a new URL everywhere at once.
 *
 *   https://api.amashuri.com/avatars/<userId>/<version>/<sm|md|lg>.webp?s=<sig>          (NGA, tenant 1)
 *   https://api.amashuri.com/avatars/t/<tid>/<userId>/<version>/<size>.webp?s=<sig>    (every other school)
 *
 * The routes are public (no token), so the school must be in the URL: user ids repeat
 * across school databases. Tenant 1 keeps the pre-tenancy shape, so every avatar URL
 * the spokes already stored keeps resolving; the signature of a tenant-N URL covers
 * the tid, so a URL can't be re-pointed at another school.
 */
/** The school a URL is minted for (the current context; primary outside one). */
const urlTid = () => responseTenant().tid;
const tenantSegment = (tid: number) => (tid === PRIMARY_TENANT_ID ? "" : `/t/${tid}`);
export interface AvatarUrls {
  version: number;
  sm: string;
  md: string;
  lg: string;
}

function secret(): string {
  return process.env.AVATAR_URL_SECRET || config.jwtSecret || "dev_avatar_secret";
}

/** The browser-facing base URL of this API (not the loopback address spokes call). */
export function publicApiBase(): string {
  const explicit = process.env.PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return config.envType === "production" ? "https://api.amashuri.com" : `http://localhost:${config.port}`;
}

export type MediaKind = "avatar" | "cover";

/** One signature covers every size of one picture version (kinds never share one). */
function mediaSignature(kind: MediaKind, userId: number, version: number, tid: number = PRIMARY_TENANT_ID): string {
  const payload = tid === PRIMARY_TENANT_ID ? `${kind}:v1:${userId}:${version}` : `${kind}:v2:${tid}:${userId}:${version}`;
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url").slice(0, 22);
}

export const avatarSignature = (userId: number, version: number, tid: number = urlTid()) => mediaSignature("avatar", userId, version, tid);
export const coverSignature = (userId: number, version: number, tid: number = urlTid()) => mediaSignature("cover", userId, version, tid);

export function verifyMediaSignature(
  kind: MediaKind,
  userId: number,
  version: number,
  sig: unknown,
  tid: number = PRIMARY_TENANT_ID,
): boolean {
  if (typeof sig !== "string" || sig.length !== 22) return false;
  const expected = Buffer.from(mediaSignature(kind, userId, version, tid));
  const given = Buffer.from(sig);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export const verifyAvatarSignature = (userId: number, version: number, sig: unknown) =>
  verifyMediaSignature("avatar", userId, version, sig);

/** File-server path (inside this app's namespace) of one rendition. */
export function avatarStoragePath(userId: number, version: number, size: AvatarSize): string {
  return `avatars/${userId}/${version}-${size}.webp`;
}

export function avatarUrls(userId: number, version: number | null | undefined, tid: number = urlTid()): AvatarUrls | null {
  if (!userId || !version) return null;
  const base = `${publicApiBase()}/avatars${tenantSegment(tid)}/${userId}/${version}`;
  const query = `?s=${avatarSignature(userId, version, tid)}`;
  const urls = Object.fromEntries(AVATAR_SIZE_NAMES.map((s) => [s, `${base}/${s}.webp${query}`]));
  return { version, ...(urls as Record<AvatarSize, string>) };
}

/** Profile banner, 3:1: https://api.amashuri.com/covers/<userId>/<version>/<md|lg>.webp?s=<sig> */
export interface CoverUrls {
  version: number;
  md: string;
  lg: string;
}

export function coverStoragePath(userId: number, version: number, size: CoverSize): string {
  return `covers/${userId}/${version}-${size}.webp`;
}

export function coverUrls(userId: number, version: number | null | undefined, tid: number = urlTid()): CoverUrls | null {
  if (!userId || !version) return null;
  const base = `${publicApiBase()}/covers${tenantSegment(tid)}/${userId}/${version}`;
  const query = `?s=${coverSignature(userId, version, tid)}`;
  const urls = Object.fromEntries(COVER_SIZE_NAMES.map((s) => [s, `${base}/${s}.webp${query}`]));
  return { version, ...(urls as Record<CoverSize, string>) };
}

/** `avatar` + `cover` for a user payload (both null when not set). */
export function profileMedia(user: { user_id: number; avatar_version?: number | null; cover_version?: number | null }) {
  return {
    avatar: avatarUrls(user.user_id, user.avatar_version),
    cover: coverUrls(user.user_id, user.cover_version),
  };
}

/**
 * The avatar fields every user payload carries: `avatar` (all sizes) and, on the user
 * row itself, `avatar_url` (the 256 px one) and `cover_url` (the wide banner) -- the
 * fields the spoke apps read.
 */
export function withAvatar<T extends { user_id: number; avatar_version?: number | null; cover_version?: number | null }>(
  user: T,
): T & { avatar_url: string | null; cover_url: string | null } {
  return {
    ...user,
    avatar_url: avatarUrls(user.user_id, user.avatar_version)?.md ?? null,
    cover_url: coverUrls(user.user_id, user.cover_version)?.lg ?? null,
  };
}
