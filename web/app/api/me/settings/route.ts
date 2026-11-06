import type { SettingsResponse } from "@/lib/api-types";
import { getCurrentUser } from "@/lib/server/auth";
import { getAvatar } from "@/lib/server/avatar";
import { getEmailStatus } from "@/lib/server/email";
import { errorResponse, jsonResponse, route } from "@/lib/server/http";
import { getAppearance, getProfileRecord } from "@/lib/server/settings";

/** The signed-in user's editable settings. The only response that carries their email and birthday. */
export const GET = route("me.settings", async (request) => {
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to see your settings");
  const [record, appearance, avatar, email] = await Promise.all([
    getProfileRecord(user.id),
    getAppearance(user.id),
    getAvatar(user.id),
    getEmailStatus(user),
  ]);
  return jsonResponse<SettingsResponse>({
    login: user.login,
    provider: user.via,
    details: record.details,
    links: record.links,
    appearance,
    avatarVersion: avatar?.version ?? null,
    email,
  });
});
