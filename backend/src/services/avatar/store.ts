import { eq } from "drizzle-orm";
import { db } from "../../db";
import { User } from "../../db/schema";
import { NotFoundError } from "../../errors/CustomError";
import storage from "../../utils/fileServer";
import logger from "../../utils/logger";
import { AVATAR_SIZE_NAMES, AvatarCrop, COVER_SIZE_NAMES, renderAvatar, renderCover } from "./image";
import {
  AvatarUrls,
  CoverUrls,
  MediaKind,
  avatarStoragePath,
  avatarUrls,
  coverStoragePath,
  coverUrls,
} from "./urls";

/** Profile picture and cover share one lifecycle; only sizes, column and paths differ. */
const KINDS = {
  avatar: {
    column: User.avatar_version,
    field: "avatar_version" as const,
    sizes: AVATAR_SIZE_NAMES as readonly string[],
    render: renderAvatar as (input: Buffer, crop?: AvatarCrop) => Promise<Record<string, Buffer>>,
    path: avatarStoragePath as (userId: number, version: number, size: any) => string,
  },
  cover: {
    column: User.cover_version,
    field: "cover_version" as const,
    sizes: COVER_SIZE_NAMES as readonly string[],
    render: renderCover as (input: Buffer, crop?: AvatarCrop) => Promise<Record<string, Buffer>>,
    path: coverStoragePath as (userId: number, version: number, size: any) => string,
  },
};

async function currentVersion(kind: MediaKind, userId: number): Promise<number | null> {
  const rows = await db
    .select({ v: KINDS[kind].column })
    .from(User)
    .where(eq(User.user_id, userId))
    .limit(1);
  if (!rows.length) throw new NotFoundError("User not found");
  return rows[0].v ?? null;
}

/** Best effort: an orphaned old rendition costs a few KB, never a failed request. */
function deleteVersion(kind: MediaKind, userId: number, version: number) {
  for (const size of KINDS[kind].sizes) {
    storage
      .deleteFile(KINDS[kind].path(userId, version, size))
      .catch((err) => logger.warn(`${kind} cleanup failed for ${userId}/${version}-${size}: ${err?.message ?? err}`));
  }
}

/** Resizes + compresses the upload, stores the renditions, then points the user at them. */
async function setMedia(kind: MediaKind, userId: number, input: Buffer, crop?: AvatarCrop): Promise<number> {
  const k = KINDS[kind];
  const previous = await currentVersion(kind, userId);
  const renditions = await k.render(input, crop);

  // Seconds since the epoch, but always moving forward, so two uploads in the same
  // second still get distinct (cache-busting) URLs.
  const version = Math.max(Math.floor(Date.now() / 1000), (previous ?? 0) + 1);
  await Promise.all(k.sizes.map((size) => storage.uploadFile(renditions[size], k.path(userId, version, size))));
  await db.update(User).set({ [k.field]: version }).where(eq(User.user_id, userId));
  if (previous) deleteVersion(kind, userId, previous);

  logger.info(`${kind} updated for user ${userId} (v${version})`);
  return version;
}

async function removeMedia(kind: MediaKind, userId: number): Promise<void> {
  const previous = await currentVersion(kind, userId);
  if (!previous) return;
  await db.update(User).set({ [KINDS[kind].field]: null }).where(eq(User.user_id, userId));
  deleteVersion(kind, userId, previous);
  logger.info(`${kind} removed for user ${userId}`);
}

export async function getAvatar(userId: number): Promise<AvatarUrls | null> {
  return avatarUrls(userId, await currentVersion("avatar", userId));
}
export async function setAvatar(userId: number, input: Buffer, crop?: AvatarCrop): Promise<AvatarUrls> {
  return avatarUrls(userId, await setMedia("avatar", userId, input, crop))!;
}
export const removeAvatar = (userId: number) => removeMedia("avatar", userId);

export async function getCover(userId: number): Promise<CoverUrls | null> {
  return coverUrls(userId, await currentVersion("cover", userId));
}
export async function setCover(userId: number, input: Buffer, crop?: AvatarCrop): Promise<CoverUrls> {
  return coverUrls(userId, await setMedia("cover", userId, input, crop))!;
}
export const removeCover = (userId: number) => removeMedia("cover", userId);
