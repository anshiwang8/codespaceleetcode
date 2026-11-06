import type { EmailStatus } from "@/lib/api-types";
import { getCurrentUser } from "@/lib/server/auth";
import { linkOrigin, resendEmail } from "@/lib/server/email";
import { errorResponse, isSameOriginRequest, jsonResponse, route } from "@/lib/server/http";

/** Sends a new link for the pending address; the previous link stops working. */
export const POST = route("me.email.resend", async (request) => {
  if (!isSameOriginRequest(request.headers)) return errorResponse(403, "Request refused");
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to set your email");
  const result = await resendEmail(user, linkOrigin(request.headers));
  if (!result.ok) return jsonResponse({ error: result.error, ...(result.code ? { code: result.code } : {}) }, result.status);
  return jsonResponse<EmailStatus>(result.status);
});
