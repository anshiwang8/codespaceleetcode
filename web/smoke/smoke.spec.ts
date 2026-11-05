import { expect, type Page, test } from "@playwright/test";
import { FILES, openFile, openPuzzle, visible } from "../e2e/helpers";

// Against `next build && next start` (scripts/smoke.mjs). Production differs from `next dev` in
// ways the e2e suite can't see: a stricter CSP with no eval, static pages, the dev login and the
// local /snapshots route switched off, and snapshot files from the CDN.

const CDN = process.env.SMOKE_CDN_URL ?? "";

/** CSP violations and uncaught errors on the page. */
function problems(page: Page): string[] {
  const found: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy|Refused to/i.test(message.text())) {
      found.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => found.push(`pageerror: ${error.message}`));
  void page.exposeFunction("__reportCspViolation", (text: string) => found.push(text));
  void page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      const report = (window as unknown as { __reportCspViolation: (text: string) => void }).__reportCspViolation;
      report(`${event.violatedDirective} blocked ${event.blockedURI || "inline"}`);
    });
  });
  return found;
}

test("the landing page is up, with production's headers", async ({ page }) => {
  const found = problems(page);
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("hero")).toBeVisible();
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).not.toContain("unsafe-eval");
  expect(csp).toContain("upgrade-insecure-requests");
  expect(csp).toMatch(new RegExp(`connect-src 'self' ${CDN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(;|$)`));
  expect(response?.headers()["strict-transport-security"]).toContain("max-age=");
  expect(found).toEqual([]);
});

test("the puzzle list shows the published puzzles", async ({ page }) => {
  const found = problems(page);
  await page.goto("/puzzles");
  await expect(visible(page, "puzzle-row-e2e-find-file")).toBeVisible();
  await expect(visible(page, "puzzle-row-e2e-trace-sequence")).toBeVisible();
  expect(found).toEqual([]);
});

test("a puzzle page loads its code from the CDN, with no CSP violations", async ({ page }) => {
  const found = problems(page);
  const snapshotRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/snapshots/")) snapshotRequests.push(request.url());
  });
  await openPuzzle(page, "e2e-find-symbol");
  await openFile(page, FILES.router);
  await expect(page.locator(".monaco-editor .view-line").first()).toBeVisible();
  expect(snapshotRequests.length).toBeGreaterThanOrEqual(2);
  for (const url of snapshotRequests) expect(url.startsWith(`${CDN}/snapshots/`)).toBe(true);
  expect(found).toEqual([]);
});

test("the app's own /snapshots route serves nothing in production", async ({ request }) => {
  const api = await request.get("/api/puzzles/e2e-find-symbol");
  const { snapshot } = (await api.json()) as { snapshot: { manifestUrl: string } };
  expect((await request.get(snapshot.manifestUrl)).status()).toBe(404);
});

test("the dev login and its other routes are 404", async ({ request }) => {
  expect((await request.post("/api/dev/login", { data: { login: "intruder" } })).status()).toBe(404);
  expect((await request.post("/api/dev/logout")).status()).toBe(404);
  const me = (await (await request.get("/api/me")).json()) as { devAuth: boolean; user: unknown };
  expect(me).toMatchObject({ devAuth: false, user: null });
});

test("robots.txt and the sitemap use the site's own origin", async ({ request, baseURL }) => {
  expect(await (await request.get("/robots.txt")).text()).toContain(`Sitemap: ${baseURL}/sitemap.xml`);
  expect(await (await request.get("/sitemap.xml")).text()).toContain(`<loc>${baseURL}/puzzles/e2e-find-symbol</loc>`);
});

test("the legal pages are up", async ({ page }) => {
  for (const path of ["/privacy", "/terms"]) {
    expect((await page.goto(path))?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});
