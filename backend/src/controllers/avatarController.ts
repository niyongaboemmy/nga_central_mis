import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { ValidationError } from "../errors/CustomError";
import { successResponse } from "../utils/response";
import { recordActivity } from "../utils/activityLogger";
import storage from "../utils/fileServer";
import { AVATAR_MAX_BYTES, AvatarSize, CoverSize, parseAvatarCrop } from "../services/avatar/image";
import { getAvatar, removeAvatar, setAvatar, removeCover, setCover } from "../services/avatar/store";
import { avatarStoragePath, coverStoragePath, profileMedia, verifyMediaSignature } from "../services/avatar/urls";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { User } from "../db/schema";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    // The real check is sharp decoding the bytes (services/avatar/image.ts); this only
    // turns away obvious non-images before they are buffered. HEIC from iPhones arrives
    // as image/heic and is rejected by the decoder with a clear message.
    if (/^image\//.test(file.mimetype) || file.mimetype === "application/octet-stream") cb(null, true);
    else cb(new ValidationError("Choose an image file (JPG, PNG, WebP, GIF or AVIF)"));
  },
});

/** multipart: `<field>` (the file) + optional `crop` (JSON fractions). Friendly 413/400s. */
const mediaUpload = (field: "avatar" | "cover") => (req: Request, res: Response, next: NextFunction) => {
  upload.single(field)(req, res, (err: any) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ success: false, message: "Picture must be 10 MB or smaller" });
    }
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: `Upload the picture in the "${field}" field (${err.code})` });
    }
    next(err);
  });
};
export const avatarUpload = mediaUpload("avatar");
export const coverUpload = mediaUpload("cover");

function targetUserId(req: any): number {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError("Invalid user id");
  return id;
}

async function store(req: any, userId: number) {
  if (!req.file?.buffer?.length) throw new ValidationError("Choose a picture to upload");
  const crop = parseAvatarCrop(req.body?.crop);
  return setAvatar(userId, req.file.buffer, crop);
}

async function storeCover(req: any, userId: number) {
  if (!req.file?.buffer?.length) throw new ValidationError("Choose a picture to upload");
  return setCover(userId, req.file.buffer, parseAvatarCrop(req.body?.crop));
}

/** GET /users/me/avatar */
export const getMyAvatar = asyncHandler(async (req: any, res: Response) => {
  successResponse(res, "Avatar retrieved", { avatar: await getAvatar(req.user.userId) });
});

/** PUT /users/me/avatar */
export const uploadMyAvatar = asyncHandler(async (req: any, res: Response) => {
  const userId = req.user.userId;
  const avatar = await store(req, userId);
  await recordActivity(userId, "PROFILE_PICTURE_UPDATE", "User changed their profile picture", "User", userId, { version: avatar.version }, userId);
  successResponse(res, "Profile picture updated", { avatar });
});

/** DELETE /users/me/avatar */
export const deleteMyAvatar = asyncHandler(async (req: any, res: Response) => {
  const userId = req.user.userId;
  await removeAvatar(userId);
  await recordActivity(userId, "PROFILE_PICTURE_REMOVE", "User removed their profile picture", "User", userId, undefined, userId);
  successResponse(res, "Profile picture removed", { avatar: null });
});

/** PUT /users/:id/avatar (MANAGE_USERS) -- e.g. the office setting a student's photo. */
export const uploadUserAvatar = asyncHandler(async (req: any, res: Response) => {
  const userId = targetUserId(req);
  const avatar = await store(req, userId);
  await recordActivity(userId, "PROFILE_PICTURE_UPDATE", "Administrator changed the profile picture", "User", userId, { version: avatar.version }, req.user.userId);
  successResponse(res, "Profile picture updated", { avatar });
});

/** DELETE /users/:id/avatar (MANAGE_USERS) */
export const deleteUserAvatar = asyncHandler(async (req: any, res: Response) => {
  const userId = targetUserId(req);
  await removeAvatar(userId);
  await recordActivity(userId, "PROFILE_PICTURE_REMOVE", "Administrator removed the profile picture", "User", userId, undefined, req.user.userId);
  successResponse(res, "Profile picture removed", { avatar: null });
});

/** PUT /users/me/cover -- the 3:1 profile banner. */
export const uploadMyCover = asyncHandler(async (req: any, res: Response) => {
  const userId = req.user.userId;
  const cover = await storeCover(req, userId);
  await recordActivity(userId, "PROFILE_COVER_UPDATE", "User changed their profile cover", "User", userId, { version: cover.version }, userId);
  successResponse(res, "Cover image updated", { cover });
});

/** DELETE /users/me/cover */
export const deleteMyCover = asyncHandler(async (req: any, res: Response) => {
  const userId = req.user.userId;
  await removeCover(userId);
  await recordActivity(userId, "PROFILE_COVER_REMOVE", "User removed their profile cover", "User", userId, undefined, userId);
  successResponse(res, "Cover image removed", { cover: null });
});

const LOOKUP_MAX = 1000;

/**
 * POST /users/profile-media/lookup  { user_ids: number[] }  (service token / client credentials)
 * The current picture + cover for many people at once, so a sibling app (Tupo's worker)
 * can show everyone's photo in its lists -- not only people who signed in since they
 * changed it. Unknown ids are simply absent from the answer.
 */
export const lookupProfileMedia = asyncHandler(async (req: any, res: Response) => {
  const raw = req.body?.user_ids;
  if (!Array.isArray(raw)) throw new ValidationError("user_ids must be an array of user ids");
  const ids = Array.from(new Set(raw.map(Number))).filter((n) => Number.isSafeInteger(n) && n > 0);
  if (ids.length > LOOKUP_MAX) throw new ValidationError(`At most ${LOOKUP_MAX} user ids per request`);
  const rows = ids.length
    ? await db
        .select({ user_id: User.user_id, avatar_version: User.avatar_version, cover_version: User.cover_version })
        .from(User)
        .where(inArray(User.user_id, ids))
    : [];
  successResponse(res, "Profile media retrieved", {
    users: rows.map((r) => ({ user_id: r.user_id, ...profileMedia(r) })),
  });
});

const notFound = (res: Response) => res.status(404).json({ success: false, message: "Not found" });

/**
 * GET /avatars/:userId/:version/:file and /covers/... -- public, but only with a valid
 * signature. Old versions are deleted from storage on replace/remove, so they 404.
 */
const serveMedia = (kind: "avatar" | "cover") =>
  asyncHandler(async (req: any, res: Response) => {
    const userId = Number(req.params.userId);
    const version = Number(req.params.version);
    const pattern = kind === "avatar" ? /^(sm|md|lg)\.webp$/ : /^(md|lg)\.webp$/;
    const match = pattern.exec(String(req.params.file));
    if (
      !match ||
      !Number.isSafeInteger(userId) || userId <= 0 ||
      !Number.isSafeInteger(version) || version <= 0 ||
      !verifyMediaSignature(kind, userId, version, req.query.s)
    ) {
      notFound(res);
      return;
    }
    const path =
      kind === "avatar"
        ? avatarStoragePath(userId, version, match[1] as AvatarSize)
        : coverStoragePath(userId, version, match[1] as CoverSize);
    // Loaded by <img> on the sibling apps' origins and inside the desktop app.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    try {
      await storage.streamTo(res, path, { contentType: "image/webp", cacheSeconds: 31536000 });
    } catch (err: any) {
      if (res.headersSent) return;
      if (err?.statusCode === 404) {
        notFound(res);
        return;
      }
      throw err;
    }
  });

export const serveAvatar = serveMedia("avatar");
export const serveCover = serveMedia("cover");
