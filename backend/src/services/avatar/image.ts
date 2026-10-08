import sharp from "sharp";
import { ValidationError } from "../../errors/CustomError";

/**
 * Turns one uploaded photo into the three square WebP renditions every NGA app uses:
 *   sm  64 px  -- navbars, chips, lists (2x of a 32 px avatar)
 *   md 256 px  -- cards, profile headers in the other apps
 *   lg 512 px  -- the MIS profile page, retina headers
 * EXIF orientation is applied and all metadata (GPS included) is dropped.
 */
export const AVATAR_SIZES = { sm: 64, md: 256, lg: 512 } as const;
export type AvatarSize = keyof typeof AVATAR_SIZES;
export const AVATAR_SIZE_NAMES = Object.keys(AVATAR_SIZES) as AvatarSize[];

/** Largest upload accepted; phone photos are typically 2-6 MB. */
export const AVATAR_MAX_BYTES = 10 * 1024 * 1024;
/** Decoding guard against decompression bombs (~ a 7000x7000 photo). */
const MAX_INPUT_PIXELS = 50_000_000;
/** Smallest usable source side, so the 64 px rendition is not pure upscaling mush. */
const MIN_SIDE = 32;
/** The source is first normalised to at most this side, which bounds memory for the crop. */
const WORK_SIDE = 2048;

const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "heif", "tiff"]);

/** Crop square chosen in the browser, as fractions (0..1) of the upright image. */
export interface AvatarCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AvatarRenditions = Record<AvatarSize, Buffer>;

/** Parses the multipart `crop` field (JSON); undefined = let the server pick the crop. */
export function parseAvatarCrop(raw: unknown): AvatarCrop | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  let value: any = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new ValidationError("crop must be JSON: {x, y, width, height}");
    }
  }
  const nums = ["x", "y", "width", "height"].map((k) => Number(value?.[k]));
  if (nums.some((n) => !Number.isFinite(n))) {
    throw new ValidationError("crop needs numeric x, y, width and height");
  }
  const [x, y, width, height] = nums;
  const EPS = 1e-3;
  if (x < -EPS || y < -EPS || width <= 0 || height <= 0 || x + width > 1 + EPS || y + height > 1 + EPS) {
    throw new ValidationError("crop must lie inside the image (fractions between 0 and 1)");
  }
  return { x, y, width, height };
}

async function decodeUpright(input: Buffer) {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new ValidationError("That file is not a picture we can read. Use a JPG, PNG, WebP, GIF or AVIF image.");
  }
  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) {
    throw new ValidationError("Unsupported picture format. Use a JPG, PNG, WebP, GIF or AVIF image.");
  }
  if ((meta.width ?? 0) * (meta.height ?? 0) > MAX_INPUT_PIXELS) {
    throw new ValidationError("That picture is too large. Use one under 50 megapixels.");
  }
  try {
    // rotate() with no angle applies the EXIF orientation, so crop fractions chosen on
    // the browser's (already upright) preview line up. Raw pixels: no generation loss.
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
      .rotate()
      .resize({ width: WORK_SIDE, height: WORK_SIDE, fit: "inside", withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new ValidationError("That picture could not be processed. It may be damaged; try another one.");
  }
}

export async function renderAvatar(input: Buffer, crop?: AvatarCrop): Promise<AvatarRenditions> {
  if (!input?.length) throw new ValidationError("Choose a picture to upload");
  if (input.length > AVATAR_MAX_BYTES) throw new ValidationError("Picture must be 10 MB or smaller");

  const { data, info } = await decodeUpright(input);
  const { width: W, height: H, channels } = info;
  if (Math.min(W, H) < MIN_SIDE) {
    throw new ValidationError(`Picture is too small; use one at least ${MIN_SIDE}x${MIN_SIDE} pixels`);
  }

  const raw = () => sharp(data, { raw: { width: W, height: H, channels } });
  let square: Buffer;
  let side: number;
  if (crop) {
    // A square in pixels, centred on the requested box (the browser's box can drift a
    // pixel off-square from rounding), clamped inside the image.
    side = Math.max(1, Math.round(Math.min(crop.width * W, crop.height * H, W, H)));
    const cx = (crop.x + crop.width / 2) * W;
    const cy = (crop.y + crop.height / 2) * H;
    const left = Math.min(Math.max(0, Math.round(cx - side / 2)), W - side);
    const top = Math.min(Math.max(0, Math.round(cy - side / 2)), H - side);
    if (side < MIN_SIDE) throw new ValidationError("The selected area is too small; zoom out a little");
    square = await raw().extract({ left, top, width: side, height: side }).raw().toBuffer();
  } else {
    // No crop chosen: keep the most "interesting" square (faces, contrast).
    side = Math.min(W, H);
    square = await raw()
      .resize({ width: side, height: side, fit: "cover", position: sharp.strategy.attention })
      .raw()
      .toBuffer();
  }

  const entries = await Promise.all(
    AVATAR_SIZE_NAMES.map(async (name) => {
      const px = AVATAR_SIZES[name];
      const out = await sharp(square, { raw: { width: side, height: side, channels } })
        .resize({ width: px, height: px, kernel: sharp.kernel.lanczos3 })
        .webp({ quality: name === "sm" ? 78 : 82, effort: 4, smartSubsample: true })
        .toBuffer();
      return [name, out] as const;
    }),
  );
  return Object.fromEntries(entries) as AvatarRenditions;
}
