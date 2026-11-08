import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { AVATAR_MAX_BYTES, AVATAR_TOO_LARGE } from "@/lib/profile-fields";
import { deleteAvatar, getAvatar, processAvatar, saveAvatar } from "@/lib/server/avatar";
import { errorResponse, isSameOriginRequest, jsonResponse, queryParams, readBytes, route } from "@/lib/server/http";
import { consumeRateLimit } from "@/lib/server/rate-limit";

const AVATAR_LIMIT = { limit: 20, windowMs: 60 * 60_000 };

/**
 * The signed-in user's own picture. Only its owner can read it: profiles are private. A request
 * naming the current version is cached privately for a year; a new upload has a new version.
 */
export const GET = route("me.avatar", async (request) => {
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to see your picture");
  const avatar = await getAvatar(user.id);
  if (!avatar) return errorResponse(404, "No picture");
  const current = request.nextUrl.searchParams.get("v") === avatar.version;
  return new NextResponse(new Uint8Array(avatar.image), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(avatar.image.length),
      "Cache-Control": current ? "private, max-age=31536000, immutable" : "private, no-cache",
      ETag: `"${avatar.version}"`,
      "Content-Disposition": "inline",
    },
  });
});

const cropSchema = z.strictObject({
  x: z.string().regex(/^\d{1,5}$/).transform(Number),
  y: z.string().regex(/^\d{1,5}$/).transform(Number),
  size: z.string().regex(/^\d{1,5}$/).transform(Number),
});

/**
 * Uploads a picture: the raw file bytes as the body, the square crop (in source pixels, after EXIF
 * orientation) in the query. The bytes are decoded and re-encoded; the declared type is ignored.
 */
export const POST = route("me.avatar.upload", async (request) => {
  if (!isSameOriginRequest(request.headers)) return errorResponse(403, "Request refused");
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to change your picture");
  const crop = cropSchema.safeParse(queryParams(request));
  if (!crop.success) return errorResponse(400, "Invalid crop");
  const limited = await consumeRateLimit(`avatar:user:${user.id}`, AVATAR_LIMIT);
  if (limited.limited) return errorResponse(429, "Too many uploads. Try again later.");
  const bytes = await readBytes(request, AVATAR_MAX_BYTES);
  if (bytes === undefined) return errorResponse(413, AVATAR_TOO_LARGE);
  const result = await processAvatar(Buffer.from(bytes), crop.data);
  if (!result.ok) return errorResponse(400, result.error);
  await saveAvatar(user.id, result.image, result.version);
  return jsonResponse({ version: result.version });
});

/** Removes the picture; the default silhouette shows again. */
export const DELETE = route("me.avatar.delete", async (request) => {
  if (!isSameOriginRequest(request.headers)) return errorResponse(403, "Request refused");
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to change your picture");
  await deleteAvatar(user.id);
  return jsonResponse({ version: null });
});
