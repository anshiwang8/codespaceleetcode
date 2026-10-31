import type { MeResponse } from "@/lib/api-types";
import { getCurrentUser, isDevAuthAllowed } from "@/lib/server/auth";
import { jsonResponse, route } from "@/lib/server/http";

export const GET = route("me", async (request) => {
  const user = await getCurrentUser(request.headers);
  return jsonResponse<MeResponse>({
    user: user ? { login: user.login } : null,
    devAuth: isDevAuthAllowed(request.headers),
  });
});
