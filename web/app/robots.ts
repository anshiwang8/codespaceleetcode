import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/server/site";

// Search engines may index the landing page, the puzzle list and each puzzle. The API, the
// profile page and the local snapshot route have nothing for them.
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/profile", "/snapshots/"] }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
