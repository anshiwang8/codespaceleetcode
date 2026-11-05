import "server-only";

const LOCAL_ORIGIN = "http://127.0.0.1:3000";

/**
 * The site's public origin, for absolute URLs in the sitemap, robots.txt and social previews.
 * It's BETTER_AUTH_URL, which production already requires to be the site's own origin.
 */
export function siteOrigin(): string {
  const configured = process.env.BETTER_AUTH_URL?.trim();
  if (!configured) {
    if (process.env.NODE_ENV === "production") throw new Error("BETTER_AUTH_URL is not set");
    return LOCAL_ORIGIN;
  }
  return new URL(configured).origin;
}
