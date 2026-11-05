import { expect, test } from "@playwright/test";

test.describe("search and sharing metadata", () => {
  test("robots.txt allows the site, keeps out the API, and names the sitemap", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.ok()).toBe(true);
    const text = await response.text();
    expect(text).toMatch(/User-Agent: \*/i);
    expect(text).toContain("Disallow: /api/");
    expect(text).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
  });

  // Leaving out unpublished puzzles is tested in tests/seo.test.ts, whose fixtures have some.
  test("sitemap.xml lists the published puzzles", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("xml");
    const xml = await response.text();
    expect(xml).toContain("/puzzles/e2e-find-symbol</loc>");
    expect(xml).toContain("/puzzles/e2e-sentinel</loc>");
    expect(xml).toContain("/puzzles</loc>");
    expect(xml).not.toContain("/api/");
  });

  test("the social preview image is a 1200 by 630 PNG", async ({ request }) => {
    const response = await request.get("/opengraph-image");
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toBe("image/png");
    const png = await response.body();
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  test("the landing page points link previews at that image with an absolute URL", async ({ page }) => {
    await page.goto("/");
    const image = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(image).toMatch(/^https?:\/\/[^/]+\/opengraph-image/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "codebases");
  });
});
