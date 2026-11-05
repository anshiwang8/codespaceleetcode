import type { MeResponse } from "@/lib/api-types";
import { getCurrentUser, isDevAuthAllowed } from "@/lib/server/auth";
import { isGitHubAuthConfigured } from "@/lib/server/better-auth";
import { jsonResponse, route } from "@/lib/server/http";

export const GET = route("me", async (request) => {
  const user = await getCurrentUser(request.headers);
  return jsonResponse<MeResponse>({
    user: user ? { login: user.login, via: user.via } : null,
    githubAuth: isGitHubAuthConfigured(),
    devAuth: isDevAuthAllowed(request.headers),
  });
});
