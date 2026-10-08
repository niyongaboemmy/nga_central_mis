import { eq } from "drizzle-orm";
import { db } from "../../db";
import { User } from "../../db/schema";
import { NotFoundError } from "../../errors/CustomError";
import storage from "../../utils/fileServer";
import logger from "../../utils/logger";
import { AVATAR_SIZE_NAMES, AvatarCrop, renderAvatar } from "./image";
import { AvatarUrls, avatarStoragePath, avatarUrls } from "./urls";

async function currentVersion(userId: number): Promise<number | null> {
  const rows = await db
    .select({ avatar_version: User.avatar_version })
    .from(User)
    .where(eq(User.user_id, userId))
    .limit(1);
  if (!rows.length) throw new NotFoundError("User not found");
  return rows[0].avatar_version ?? null;
}

/** Best effort: an orphaned old rendition costs a few KB, never a failed request. */
function deleteVersion(userId: number, version: number) {
  for (const size of AVATAR_SIZE_NAMES) {
    storage
      .deleteFile(avatarStoragePath(userId, version, size))
      .catch((err) => logger.warn(`avatar cleanup failed for ${userId}/${version}-${size}: ${err?.message ?? err}`));
  }
}

export async function getAvatar(userId: number): Promise<AvatarUrls | null> {
  return avatarUrls(userId, await currentVersion(userId));
}

/** Resizes + compresses the upload, stores the renditions, then points the user at them. */
export async function setAvatar(userId: number, input: Buffer, crop?: AvatarCrop): Promise<AvatarUrls> {
  const previous = await currentVersion(userId);
  const renditions = await renderAvatar(input, crop);

  // Seconds since the epoch, but always moving forward, so two uploads in the same
  // second still get distinct (cache-busting) URLs.
  const version = Math.max(Math.floor(Date.now() / 1000), (previous ?? 0) + 1);
  await Promise.all(
    AVATAR_SIZE_NAMES.map((size) => storage.uploadFile(renditions[size], avatarStoragePath(userId, version, size))),
  );
  await db.update(User).set({ avatar_version: version }).where(eq(User.user_id, userId));
  if (previous) deleteVersion(userId, previous);

  logger.info(`avatar updated for user ${userId} (v${version})`);
  return avatarUrls(userId, version)!;
}

export async function removeAvatar(userId: number): Promise<void> {
  const previous = await currentVersion(userId);
  if (!previous) return;
  await db.update(User).set({ avatar_version: null }).where(eq(User.user_id, userId));
  deleteVersion(userId, previous);
  logger.info(`avatar removed for user ${userId}`);
}
