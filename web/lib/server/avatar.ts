import "server-only";
import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { getPool } from "@/lib/server/db";

// Profile pictures. An upload is decoded from its bytes (never trusting a file name or declared
// type), checked, cropped to the square the user chose, and re-encoded as a 256×256 WebP with no
// metadata. The result is stored in Postgres (user_avatars, at most 128 KB), so it survives
// deployments without a separate store, and served only to its owner by /api/me/avatar.

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_SIZE = 256;
/** Decoded dimensions allowed, each side. */
export const AVATAR_MAX_SIDE = 8000;
const MAX_PIXELS = 40_000_000;
const FORMATS = new Set(["jpeg", "png", "webp"]);

export interface Crop {
  /** Left edge in source pixels, after EXIF orientation is applied. */
  x: number;
  y: number;
  /** Side of the square, in source pixels. */
  size: number;
}

export type ProcessResult = { ok: true; image: Buffer; version: string } | { ok: false; error: string };

/**
 * Decodes, validates, crops and re-encodes an upload. Only JPEG, PNG and WebP with a single frame
 * are accepted: SVG, GIF, HEIF, AVIF, TIFF and animated images are refused by their decoded format.
 */
export async function processAvatar(input: Buffer, crop: Crop | null): Promise<ProcessResult> {
  if (input.length === 0) return { ok: false, error: "That file is empty." };
  if (input.length > AVATAR_MAX_BYTES) return { ok: false, error: "Pictures can be at most 5 MB." };
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error", animated: true }).metadata();
  } catch {
    return { ok: false, error: "That file isn't a picture codebases can read. Use a JPEG, PNG or WebP image." };
  }
  if (!meta.format || !FORMATS.has(meta.format)) {
    return { ok: false, error: "Use a JPEG, PNG or WebP image." };
  }
  if ((meta.pages ?? 1) > 1) return { ok: false, error: "Animated pictures aren't supported. Use a still image." };
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = rotated ? meta.height : meta.width;
  const height = rotated ? meta.width : meta.height;
  if (!width || !height) return { ok: false, error: "That picture has no size." };
  if (width > AVATAR_MAX_SIDE || height > AVATAR_MAX_SIDE) {
    return { ok: false, error: `Pictures can be at most ${AVATAR_MAX_SIDE} pixels on a side.` };
  }
  const side = Math.min(width, height);
  const region = crop ?? { x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), size: side };
  if (
    !Number.isInteger(region.x) ||
    !Number.isInteger(region.y) ||
    !Number.isInteger(region.size) ||
    region.size < 16 ||
    region.x < 0 ||
    region.y < 0 ||
    region.x + region.size > width ||
    region.y + region.size > height
  ) {
    return { ok: false, error: "That crop doesn't fit the picture. Adjust it and try again." };
  }
  let image: Buffer;
  try {
    image = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error" })
      .rotate()
      .extract({ left: region.x, top: region.y, width: region.size, height: region.size })
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
      .flatten({ background: "#ffffff" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return { ok: false, error: "That picture couldn't be processed. Try another." };
  }
  if (image.length > 131072) return { ok: false, error: "That picture couldn't be made small enough. Try another." };
  // The version names this exact image, so a replacement is never served from a cache of the old one.
  const version = createHash("sha256").update(image).digest("hex").slice(0, 16);
  return { ok: true, image, version };
}

export async function saveAvatar(userId: string, image: Buffer, version: string): Promise<void> {
  await getPool().query(
    `insert into user_avatars (user_id, image, content_type, version, updated_at)
     values ($1, $2, 'image/webp', $3, now())
     on conflict (user_id) do update set image = excluded.image, version = excluded.version, updated_at = now()`,
    [userId, image, version],
  );
}

export async function deleteAvatar(userId: string): Promise<void> {
  await getPool().query("delete from user_avatars where user_id = $1", [userId]);
}

export async function getAvatar(userId: string): Promise<{ image: Buffer; version: string } | null> {
  const { rows } = await getPool().query<{ image: Buffer; version: string }>(
    "select image, version from user_avatars where user_id = $1",
    [userId],
  );
  return rows[0] ?? null;
}
