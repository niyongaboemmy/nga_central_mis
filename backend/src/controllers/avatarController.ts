import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { ValidationError } from "../errors/CustomError";
import { successResponse } from "../utils/response";
import { recordActivity } from "../utils/activityLogger";
import storage from "../utils/fileServer";
import { AVATAR_MAX_BYTES, AvatarSize, parseAvatarCrop } from "../services/avatar/image";
import { getAvatar, removeAvatar, setAvatar } from "../services/avatar/store";
import { avatarStoragePath, verifyAvatarSignature } from "../services/avatar/urls";

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

/** multipart: `avatar` (the file) + optional `crop` (JSON fractions). Friendly 413/400s. */
export function avatarUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("avatar")(req, res, (err: any) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ success: false, message: "Picture must be 10 MB or smaller" });
    }
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: `Upload the picture in the "avatar" field (${err.code})` });
    }
    next(err);
  });
}

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

/**
 * GET /avatars/:userId/:version/:file -- public, but only with a valid signature.
 * Old versions are deleted from storage on replace/remove, so they 404 on their own.
 */
export const serveAvatar = asyncHandler(async (req: any, res: Response) => {
  const userId = Number(req.params.userId);
  const version = Number(req.params.version);
  const match = /^(sm|md|lg)\.webp$/.exec(String(req.params.file));
  if (
    !match ||
    !Number.isSafeInteger(userId) || userId <= 0 ||
    !Number.isSafeInteger(version) || version <= 0 ||
    !verifyAvatarSignature(userId, version, req.query.s)
  ) {
    res.status(404).json({ success: false, message: "Not found" });
    return;
  }
  const size = match[1] as AvatarSize;
  // Loaded by <img> on the sibling apps' origins and inside the desktop app.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  try {
    await storage.streamTo(res, avatarStoragePath(userId, version, size), {
      contentType: "image/webp",
      cacheSeconds: 31536000,
    });
  } catch (err: any) {
    if (res.headersSent) return;
    if (err?.statusCode === 404) {
      res.status(404).json({ success: false, message: "Not found" });
      return;
    }
    throw err;
  }
});
