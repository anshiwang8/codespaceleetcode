import type { SettingsResponse } from "@/lib/api-types";
import { getCurrentUser } from "@/lib/server/auth";
import { errorResponse, jsonResponse, route } from "@/lib/server/http";
import { getSettingsData } from "@/lib/server/settings";

/** The signed-in user's editable settings. The only response that carries their email and birthday. */
export const GET = route("me.settings", async (request) => {
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to see your settings");
  const { details, links, appearance, avatarVersion, email } = await getSettingsData(user);
  return jsonResponse<SettingsResponse>({
    login: user.login,
    provider: user.via,
    details,
    links,
    appearance,
    avatarVersion,
    email,
  });
});
