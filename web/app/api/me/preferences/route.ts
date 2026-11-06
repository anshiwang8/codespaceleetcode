import type { AppearanceSettings } from "@/lib/api-types";
import { getCurrentUser } from "@/lib/server/auth";
import { errorResponse, isSameOriginRequest, jsonResponse, readJson, route } from "@/lib/server/http";
import { getAppearance, preferencesBody, saveAppearance } from "@/lib/server/settings";

/** Saves the account's theme and/or favorite themes. */
export const PUT = route("me.preferences", async (request) => {
  if (!isSameOriginRequest(request.headers)) return errorResponse(403, "Request refused");
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to save your theme");
  const body = preferencesBody.safeParse(await readJson(request));
  if (!body.success) return errorResponse(400, "Invalid preferences");
  const saved = await saveAppearance(user.id, body.data);
  if (!saved.ok) return errorResponse(400, saved.error);
  return jsonResponse<AppearanceSettings>(await getAppearance(user.id));
});
