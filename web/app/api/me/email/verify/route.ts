import { z } from "zod";
import type { EmailStatus } from "@/lib/api-types";
import { getCurrentUser } from "@/lib/server/auth";
import { verifyEmail } from "@/lib/server/email";
import { errorResponse, isSameOriginRequest, jsonResponse, readJson, route } from "@/lib/server/http";

const body = z.strictObject({ token: z.string().max(200) });

/**
 * Confirms an address. The token arrives in the body (posted by the verify page, not the link
 * itself), so following a link never changes anything without the signed-in user's page asking.
 */
export const POST = route("me.email.verify", async (request) => {
  if (!isSameOriginRequest(request.headers)) return errorResponse(403, "Request refused");
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to confirm your email");
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return errorResponse(400, "This link isn't valid.");
  const result = await verifyEmail(user, parsed.data.token);
  if (!result.ok) return jsonResponse({ error: result.error, ...(result.code ? { code: result.code } : {}) }, result.status);
  return jsonResponse<EmailStatus>(result.status);
});
