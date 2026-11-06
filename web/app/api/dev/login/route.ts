import type { MeResponse } from "@/lib/api-types";
import {
  DEV_COOKIE,
  DEV_COOKIE_MAX_AGE_SECONDS,
  devLogin,
  devLoginSchema,
  isDevAuthAllowed,
} from "@/lib/server/auth";
import { isGitHubAuthConfigured } from "@/lib/server/better-auth";
import { getAccountSummary } from "@/lib/server/settings";
import { errorResponse, jsonResponse, readJson, route } from "@/lib/server/http";

export const POST = route("dev.login", async (request) => {
  if (!isDevAuthAllowed(request.headers)) return errorResponse(404, "Not found");
  const body = devLoginSchema.safeParse(await readJson(request));
  if (!body.success) return errorResponse(400, "login must be 1 to 39 letters, digits, - or _");
  const user = await devLogin(body.data.login);
  const summary = await getAccountSummary(user.id);
  const response = jsonResponse<MeResponse>({
    user: { login: user.login, via: "dev", ...summary },
    githubAuth: isGitHubAuthConfigured(),
    devAuth: true,
  });
  response.cookies.set(DEV_COOKIE, user.login, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: DEV_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
});
