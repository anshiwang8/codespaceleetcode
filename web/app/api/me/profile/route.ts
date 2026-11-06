import type { ProfileResponse } from "@/lib/api-types";
import { getCurrentUser } from "@/lib/server/auth";
import { errorResponse, jsonResponse, route } from "@/lib/server/http";
import { getProfile } from "@/lib/server/profile";

/** The signed-in user's own profile. jsonResponse sends `Cache-Control: no-store`. */
export const GET = route("me.profile", async (request) => {
  const user = await getCurrentUser(request.headers);
  if (!user) return errorResponse(401, "Sign in to see your profile");
  const profile = await getProfile(user.id);
  if (!profile) return errorResponse(401, "Sign in to see your profile");
  return jsonResponse<ProfileResponse>(profile);
});
