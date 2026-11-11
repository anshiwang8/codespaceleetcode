import { z } from "zod";
import type { MeResponse } from "@/lib/api-types";
import { DELETE_CONFIRMATION } from "@/lib/account-deletion";
import { deleteAccount } from "@/lib/server/account";
import { DEV_COOKIE, getCurrentUser, isDevAuthAllowed } from "@/lib/server/auth";
import { getAuth, isGitHubAuthConfigured } from "@/lib/server/better-auth";
import { hasRecentSignIn } from "@/lib/server/email";
import { getAccountSummary } from "@/lib/server/settings";
import { errorResponse, isSameOriginRequest, jsonResponse, readJson, route } from "@/lib/server/http";
import { DELETE_ACCOUNT_LIMIT, isRateLimited, rateLimitKey } from "@/lib/server/rate-limit";

export const GET = route("me", async (request) => {
  const user = await getCurrentUser(request.headers);
  const summary = user ? await getAccountSummary(user.id) : null;
  return jsonResponse<MeResponse>({
    user: user && summary ? { login: user.login, via: user.via, ...summary } : null,
    githubAuth: isGitHubAuthConfigured(),
    devAuth: isDevAuthAllowed(request.headers),
  });
});

const deleteSchema = z.strictObject({ confirm: z.literal(DELETE_CONFIRMATION) });

/**
 * Deletes the signed-in user's account and everything recorded about them, then signs them out.
 * Needs a same-origin request, `{ "confirm": "DELETE" }`, and a GitHub sign-in within the last
 * 15 minutes, so a stolen or forgotten session can't delete an account on its own.
 */
export const DELETE = route("me.delete", async (request) => {
  if (!isSameOriginRequest(request.headers)) return errorResponse(403, "Request refused");
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to delete your account");
  if (await isRateLimited(`delete-account:${rateLimitKey(user, request.headers)}`, DELETE_ACCOUNT_LIMIT)) {
    return errorResponse(429, "Too many attempts. Try again later.");
  }
  if (!deleteSchema.safeParse(await readJson(request)).success) {
    return errorResponse(400, `Type ${DELETE_CONFIRMATION} to confirm that you want to delete your account`);
  }
  if (!hasRecentSignIn(user)) {
    return jsonResponse(
      { error: "Sign in with GitHub again to confirm it's you, then delete your account.", reauth: true },
      403,
    );
  }
  if (!(await deleteAccount(user.id))) return errorResponse(401, "Sign in to delete your account");

  const response = jsonResponse<MeResponse>({
    user: null,
    githubAuth: isGitHubAuthConfigured(),
    devAuth: isDevAuthAllowed(request.headers),
  });
  // The sessions are gone with the account; this clears the browser's copies too.
  const { authCookies } = await getAuth().$context;
  for (const { name, attributes } of [
    authCookies.sessionToken,
    authCookies.sessionData,
    authCookies.dontRememberToken,
    authCookies.accountData,
  ]) {
    // Clearing only needs the same name, path and domain; secure keeps a __Secure- name valid.
    response.cookies.set(name, "", {
      path: attributes.path ?? "/",
      ...(attributes.domain ? { domain: attributes.domain } : {}),
      secure: attributes.secure ?? false,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 0,
    });
  }
  response.cookies.set(DEV_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
});
