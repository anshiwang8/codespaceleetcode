import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { getPool } from "@/lib/server/db";
import { siteOrigin } from "@/lib/server/site";
import { seedFixtures } from "./fixtures";
import { hasDatabase } from "./helpers";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("siteOrigin", () => {
  it("is BETTER_AUTH_URL's origin, without a path or trailing slash", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://codebases.example/some/path/");
    expect(siteOrigin()).toBe("https://codebases.example");
  });

  it("falls back to the local dev server outside production", () => {
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(siteOrigin()).toBe("http://127.0.0.1:3000");
  });

  it("is required in production", () => {
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => siteOrigin()).toThrow(/BETTER_AUTH_URL/);
  });
});

describe("robots.txt", () => {
  it("allows the site, keeps crawlers out of the API, and points at the sitemap", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://codebases.example");
    const result = robots();
    expect(result.sitemap).toBe("https://codebases.example/sitemap.xml");
    expect(result.rules).toEqual([
      { userAgent: "*", allow: "/", disallow: ["/api/", "/profile", "/snapshots/"] },
    ]);
  });
});

describe.skipIf(!hasDatabase)("sitemap.xml", () => {
  beforeAll(async () => {
    await seedFixtures();
  });

  it("lists the landing page, the puzzle list, the legal pages and every published puzzle", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://codebases.example");
    const entries = await sitemap();
    const { rows } = await getPool().query<{ slug: string }>(
      "select slug from puzzles where published order by slug",
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(entries.map((entry) => entry.url)).toEqual([
      "https://codebases.example/",
      "https://codebases.example/puzzles",
      "https://codebases.example/privacy",
      "https://codebases.example/terms",
      ...rows.map((row) => `https://codebases.example/puzzles/${row.slug}`),
    ]);
    for (const entry of entries.slice(4)) expect(entry.lastModified).toBeInstanceOf(Date);
  });

  it("leaves out unpublished puzzles", async () => {
    const { rows } = await getPool().query<{ slug: string }>("select slug from puzzles where not published");
    expect(rows.length).toBeGreaterThan(0);
    const urls = (await sitemap()).map((entry) => entry.url);
    for (const { slug } of rows) expect(urls.some((url) => url.endsWith(`/puzzles/${slug}`))).toBe(false);
  });
});
