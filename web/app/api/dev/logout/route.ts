import type { MeResponse } from "@/lib/api-types";
import { DEV_COOKIE, isDevAuthAllowed } from "@/lib/server/auth";
import { isGitHubAuthConfigured } from "@/lib/server/better-auth";
import { errorResponse, jsonResponse, route } from "@/lib/server/http";

export const POST = route("dev.logout", async (request) => {
  if (!isDevAuthAllowed(request.headers)) return errorResponse(404, "Not found");
  const response = jsonResponse<MeResponse>({ user: null, githubAuth: isGitHubAuthConfigured(), devAuth: true });
  response.cookies.set(DEV_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
});
