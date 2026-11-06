import type { ProfileLinks } from "@/lib/api-types";
import { getCurrentUser } from "@/lib/server/auth";
import { errorResponse, isSameOriginRequest, jsonResponse, readJson, route } from "@/lib/server/http";
import { linksBody, saveLinks, validateLinks } from "@/lib/server/settings";

/**
 * Saves the optional links. HTTPS only; known platforms must be on their own domains. A GitHub
 * link here is just a link: it never changes the GitHub account used to sign in.
 */
export const PUT = route("me.links", async (request) => {
  if (!isSameOriginRequest(request.headers)) return errorResponse(403, "Request refused");
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to edit your links");
  const body = linksBody.safeParse(await readJson(request));
  if (!body.success) return errorResponse(400, "Invalid links");
  const result = validateLinks(body.data);
  if (!result.ok) return jsonResponse({ error: "Check the highlighted links.", fields: result.errors }, 400);
  await saveLinks(user.id, result.value);
  return jsonResponse<ProfileLinks>(result.value);
});
