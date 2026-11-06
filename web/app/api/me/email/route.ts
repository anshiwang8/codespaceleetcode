import { z } from "zod";
import type { EmailStatus } from "@/lib/api-types";
import { getCurrentUser } from "@/lib/server/auth";
import { cancelPendingEmail, getEmailStatus, linkOrigin, requestEmail } from "@/lib/server/email";
import { errorResponse, isSameOriginRequest, jsonResponse, readJson, route } from "@/lib/server/http";

const body = z.strictObject({ email: z.string().max(400) });

/** Starts verifying a contact email: the first one, or a change. */
export const POST = route("me.email", async (request) => {
  if (!isSameOriginRequest(request.headers)) return errorResponse(403, "Request refused");
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to set your email");
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return errorResponse(400, "Enter a valid email address.");
  const result = await requestEmail(user, parsed.data.email, linkOrigin(request.headers));
  if (!result.ok) return jsonResponse({ error: result.error, ...(result.code ? { code: result.code } : {}) }, result.status);
  return jsonResponse<EmailStatus>(result.status);
});

/** Cancels a pending change. The verified address stays. */
export const DELETE = route("me.email.cancel", async (request) => {
  if (!isSameOriginRequest(request.headers)) return errorResponse(403, "Request refused");
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to change your email");
  await cancelPendingEmail(user);
  return jsonResponse<EmailStatus>(await getEmailStatus(user));
});
