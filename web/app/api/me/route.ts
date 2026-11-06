import { z } from "zod";
import type { MeResponse } from "@/lib/api-types";
import { deleteAccount } from "@/lib/server/account";
import { DEV_COOKIE, getCurrentUser, isDevAuthAllowed } from "@/lib/server/auth";
import { getAuth, isGitHubAuthConfigured } from "@/lib/server/better-auth";
import { getAccountSummary } from "@/lib/server/settings";
import { errorResponse, isSameOriginRequest, jsonResponse, readJson, route } from "@/lib/server/http";

export const GET = route("me", async (request) => {
  const user = await getCurrentUser(request.headers);
  const summary = user ? await getAccountSummary(user.id) : null;
  return jsonResponse<MeResponse>({
    user: user && summary ? { login: user.login, via: user.via, ...summary } : null,
    githubAuth: isGitHubAuthConfigured(),
    devAuth: isDevAuthAllowed(request.headers),
  });
});

const deleteSchema = z.strictObject({ confirm: z.literal(true) });

/** Deletes the signed-in user's account and everything recorded about them, then signs them out. */
export const DELETE = route("me.delete", async (request) => {
  if (!isSameOriginRequest(request.headers)) return errorResponse(403, "Request refused");
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to delete your account");
  if (!deleteSchema.safeParse(await readJson(request)).success) {
    return errorResponse(400, "Confirm that you want to delete your account");
  }
  await deleteAccount(user.id);

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
