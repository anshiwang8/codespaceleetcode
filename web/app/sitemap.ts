import type { MetadataRoute } from "next";
import { PUZZLES_PATH } from "@/lib/browse";
import { listSitemapPuzzles } from "@/lib/server/puzzles";
import { siteOrigin } from "@/lib/server/site";

// Read on each request, so a newly published puzzle appears without a rebuild, and a build
// doesn't need the database.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const puzzles = await listSitemapPuzzles();
  return [
    { url: `${origin}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${origin}${PUZZLES_PATH}`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${origin}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${origin}/terms`, changeFrequency: "yearly", priority: 0.2 },
    ...puzzles.map(({ slug, lastModified }) => ({
      url: `${origin}${PUZZLES_PATH}/${encodeURIComponent(slug)}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
