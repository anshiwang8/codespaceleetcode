import type { ProfileDetails } from "@/lib/api-types";
import { getCurrentUser } from "@/lib/server/auth";
import { errorResponse, isSameOriginRequest, jsonResponse, readJson, route } from "@/lib/server/http";
import { detailsBody, saveDetails, validateDetails } from "@/lib/server/settings";

/**
 * Saves the optional details: display name, pronouns, bio and birthday. Each may be null, which
 * clears it. Only these four fields are accepted; nothing else on the account changes.
 */
export const PUT = route("me.details", async (request) => {
  if (!isSameOriginRequest(request.headers)) return errorResponse(403, "Request refused");
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to edit your profile");
  const body = detailsBody.safeParse(await readJson(request));
  if (!body.success) return errorResponse(400, "Invalid profile details");
  const result = validateDetails(body.data);
  if (!result.ok) return jsonResponse({ error: "Check the highlighted fields.", fields: result.errors }, 400);
  await saveDetails(user.id, result.value);
  return jsonResponse<ProfileDetails>(result.value);
});
