import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import sharp from "sharp";
import { FILES, openFile, openPuzzle, signOutFromHeader, visible } from "./helpers";

const base = () => test.info().project.use.baseURL ?? "";

async function devLogin(page: Page, login: string): Promise<void> {
  const response = await page.request.post("/api/dev/login", { data: { login }, headers: { origin: base() } });
  expect(response.ok()).toBe(true);
}

const unique = (prefix: string) => `${prefix}-${Math.random().toString(16).slice(2, 8)}`;
/** The page's background token, as #rrggbb (the production CSS build shortens #ffffff to #fff). */
const bg = (page: Page) =>
  page.evaluate(() => {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    return /^#[0-9a-f]{3}$/i.test(value) ? `#${[...value.slice(1)].map((digit) => digit + digit).join("")}` : value;
  });

/** Opens the theme dialog from the profile page, where the Theme button lives, signed in or not. */
async function openThemes(page: Page): Promise<void> {
  if (new URL(page.url()).pathname !== "/profile") await page.goto("/profile");
  await visible(page, "theme-button").click();
  await expect(page.getByTestId("theme-dialog")).toBeVisible();
}

async function chooseTheme(page: Page, id: string, apply = true): Promise<void> {
  await openThemes(page);
  const dialog = page.getByTestId("theme-dialog");
  await expect(dialog.getByTestId(`theme-option-${id}`)).toBeVisible();
  await dialog.getByTestId(`theme-option-${id}`).click();
  if (apply) {
    await dialog.getByTestId("theme-apply").click();
    await expect(dialog).toBeHidden();
  }
}

/** Messages the app wrote to the e2e outbox for one address, newest last. */
function outboxFor(address: string): { to: string; subject: string; text: string }[] {
  const directory = process.env.DEV_OUTBOX_DIR ?? "";
  return readdirSync(directory)
    .sort()
    .map((name) => JSON.parse(readFileSync(path.join(directory, name), "utf8")) as { to: string; subject: string; text: string })
    .filter((message) => message.to === address);
}

test.describe("themes", () => {
  test("preview, cancel, apply, and the saved theme painted before any app script runs", async ({ page }) => {
    await page.goto("/puzzles");
    expect(await bg(page)).toBe("#ffffff");

    // Choosing previews without saving; Cancel puts it back.
    await chooseTheme(page, "dracula", false);
    await expect.poll(() => bg(page)).toBe("#282a36");
    await page.getByTestId("theme-dialog").getByTestId("theme-cancel").click();
    await expect.poll(() => bg(page)).toBe("#ffffff");
    await page.reload();
    expect(await bg(page)).toBe("#ffffff");

    // Escape cancels too.
    await chooseTheme(page, "nord", false);
    await page.keyboard.press("Escape");
    await expect.poll(() => bg(page)).toBe("#ffffff");

    await chooseTheme(page, "dracula");
    await expect.poll(() => bg(page)).toBe("#282a36");

    // With every Next.js script blocked, only the inline pre-paint script can have set the theme.
    await page.route("**/_next/static/**/*.js", (route) => route.abort());
    await page.goto("/puzzles");
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--bg"))).toBe("#282a36");
    expect(await page.evaluate(() => document.documentElement.dataset.scheme)).toBe("dark");
    await page.unrouteAll();

    // The landing page, which is static and has no account, uses it too.
    await page.goto("/");
    expect(await bg(page)).toBe("#282a36");

    await openThemes(page);
    await page.getByTestId("theme-dialog").getByTestId("theme-restore").click();
    await expect.poll(() => bg(page)).toBe("#ffffff");
  });

  test("System follows the device between the default light and dark themes", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openThemes(page);
    const dialog = page.getByTestId("theme-dialog");
    await dialog.getByTestId("theme-option-system").click();
    await dialog.getByTestId("theme-apply").click();
    await expect.poll(() => bg(page)).toBe("#0f141b");
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => bg(page)).toBe("#ffffff");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    expect(await bg(page)).toBe("#0f141b");
  });

  test("search, filters and favorites work from the keyboard", async ({ page }) => {
    await openThemes(page);
    const dialog = page.getByTestId("theme-dialog");
    await dialog.getByTestId("theme-search").fill("fjord");
    await expect(dialog.getByTestId("theme-list").locator("label")).toHaveCount(2);
    await dialog.getByRole("radiogroup", { name: "Show" }).getByText("Dark", { exact: true }).click();
    await expect(dialog.getByTestId("theme-list").locator("label")).toHaveCount(1);
    // Arrow keys move the choice and preview it.
    await dialog.getByTestId("theme-search").fill("");
    await dialog.getByTestId("theme-list").getByRole("radio").first().focus();
    await page.keyboard.press("ArrowDown");
    const checked = await dialog.getByTestId("theme-list").getByRole("radio", { checked: true }).getAttribute("value");
    expect(checked).not.toBeNull();
    await dialog.getByTestId("theme-favorite").click();
    await dialog.getByRole("radiogroup", { name: "Show" }).getByText("Favorites", { exact: true }).click();
    await expect(dialog.getByTestId(`theme-option-${checked}`)).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("a theme belongs to its account: signing out or in as someone else never keeps it", async ({ page }) => {
    const alice = unique("theme-alice");
    await devLogin(page, alice);
    await page.goto("/puzzles");
    await chooseTheme(page, "dracula");
    await signOutFromHeader(page);
    await expect.poll(() => bg(page)).toBe("#ffffff");

    await devLogin(page, unique("theme-bob"));
    await page.goto("/puzzles");
    await expect(visible(page, "signed-in-as")).toBeVisible();
    await expect.poll(() => bg(page)).toBe("#ffffff");

    // Alice's choice comes back for Alice, on any browser, from her account.
    await devLogin(page, alice);
    await page.goto("/puzzles");
    await expect.poll(() => bg(page)).toBe("#282a36");
  });

  test("a theme change restyles Monaco without remounting it", async ({ page }) => {
    // With System saved, the device switching to dark changes the theme while the editor is open.
    await page.emulateMedia({ colorScheme: "light" });
    await chooseTheme(page, "system");
    await openPuzzle(page, "e2e-find-symbol");
    await openFile(page, FILES.router);
    const background = () =>
      page.locator(".monaco-editor-background").first().evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(await background()).toBe("rgb(255, 255, 255)");
    const editor = await page.locator(".monaco-editor").first().elementHandle();
    await page.locator(".monaco-editor .view-line").first().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Shift+Home");
    const selection = await page.evaluate(() => window.getSelection()?.toString() ?? "");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => bg(page)).toBe("#0f141b");
    await expect.poll(background).toBe("rgb(15, 20, 27)");
    expect(await editor?.evaluate((element) => element.isConnected)).toBe(true);
    await expect(page.getByTestId("code-viewer")).toHaveAttribute("data-shown-path", FILES.router);
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toBe(selection);
  });
});

test.describe("settings", () => {
  test("signed out, settings explain themselves and offer sign-in", async ({ page }) => {
    await page.goto("/settings");
    await expect(visible(page, "settings-signed-out")).toBeVisible();
    await expect(page.getByTestId("details-form")).toHaveCount(0);
  });

  test("optional details save, survive a reload, report errors inline, and clear", async ({ page }) => {
    await devLogin(page, unique("details"));
    await page.goto("/settings");
    const form = page.getByTestId("details-form");
    await form.getByLabel(/Display name/).fill("Ada Reader");
    await form.getByLabel(/Pronouns/).fill("she/her");
    await form.getByLabel(/Short bio/).fill("I read code for fun.");
    await form.getByLabel(/Birthday/).fill("2000-02-29");
    await form.getByTestId("details-save").click();
    await expect(form.getByTestId("details-status")).toHaveText("Saved.");
    await page.reload();
    await expect(page.getByTestId("details-form").getByLabel(/Display name/)).toHaveValue("Ada Reader");
    await expect(page.getByTestId("details-form").getByLabel(/Birthday/)).toHaveValue("2000-02-29");

    // A future birthday can't be picked past the field's max, so it's sent through the API, as
    // a crafted request would be.
    const crafted = await page.request.put("/api/me/details", {
      headers: { origin: base() },
      data: { displayName: "Ada", pronouns: null, bio: null, birthday: "2999-01-01" },
    });
    expect(crafted.status()).toBe(400);

    // An invalid value keeps what was typed and marks the field.
    await page.getByTestId("details-form").getByLabel(/Display name/).fill("Line‮break");
    await page.getByTestId("details-form").getByTestId("details-save").click();
    await expect(page.getByTestId("details-form").getByLabel(/Display name/)).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("details-form").getByLabel(/Display name/)).toHaveValue("Line‮break");
    await expect(page.getByTestId("details-status")).toHaveAttribute("role", "alert");

    // Everything clears.
    await page.getByTestId("details-form").getByLabel(/Display name/).fill("");
    await page.getByTestId("details-form").getByLabel(/Pronouns/).fill("");
    await page.getByTestId("details-form").getByLabel(/Short bio/).fill("");
    await page.getByTestId("details-form").getByRole("button", { name: "Clear" }).click();
    await page.getByTestId("details-save").click();
    await expect(page.getByTestId("details-status")).toHaveText("Saved.");
    await page.goto("/profile");
    await expect(visible(page, "profile-identity")).not.toContainText("Ada Reader");
  });

  test("links are validated, saved, and shown on the profile as plain, safe links", async ({ page }) => {
    await devLogin(page, unique("links"));
    await page.goto("/settings");
    const form = page.getByTestId("links-form");
    await form.getByTestId("link-github").fill("javascript:alert(1)");
    await form.getByTestId("links-save").click();
    await expect(form.getByTestId("link-github")).toHaveAttribute("aria-invalid", "true");
    await form.getByTestId("link-github").fill("https://github.com/ada");
    await form.getByTestId("link-mastodon").fill("https://hachyderm.io/@ada");
    await form.getByTestId("add-custom-link").click();
    await form.getByLabel("Label").fill("<b>Talks</b>");
    await form.getByLabel("Link", { exact: true }).fill("https://talks.example/ada");
    await form.getByTestId("links-save").click();
    await expect(form.getByTestId("links-status")).toHaveText("Saved.");
    await page.goto("/profile");
    const links = visible(page, "profile-links");
    await expect(links.getByRole("link", { name: /GitHub/ })).toHaveAttribute("href", "https://github.com/ada");
    await expect(links.getByRole("link", { name: /GitHub/ })).toHaveAttribute("rel", "noopener noreferrer nofollow");
    // A label is text, never markup.
    await expect(links).toContainText("<b>Talks</b>");
    expect(await links.locator("b").count()).toBe(0);
  });

  test("a picture uploads with a chosen crop, shows everywhere, falls back, and can be removed", async ({ page }) => {
    await devLogin(page, unique("avatar"));
    await page.goto("/settings");
    await expect(page.getByTestId("account-menu-button").getByTestId("avatar")).toHaveAttribute("data-kind", "silhouette");
    const picture = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#cc3366" } }).png().toBuffer();
    await page.getByTestId("avatar-file").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: picture });
    const frame = page.getByTestId("avatar-crop");
    await expect(frame).toBeVisible();
    await page.getByTestId("avatar-zoom").fill("2");
    await frame.focus();
    await page.keyboard.press("ArrowRight");
    // Cancel leaves the saved picture (none) alone.
    await page.getByTestId("avatar-cancel").click();
    await expect(page.getByTestId("avatar-editor").getByTestId("avatar")).toHaveAttribute("data-kind", "silhouette");

    await page.getByTestId("avatar-file").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: picture });
    await page.getByTestId("avatar-save").click();
    await expect(page.getByTestId("avatar-status")).toHaveText("Picture saved.");
    const header = page.getByTestId("account-menu-button").getByTestId("avatar");
    await expect(header).toHaveAttribute("data-kind", "picture");
    await expect.poll(() => header.locator("img").evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(256);

    // The server decides what's a picture, whatever the browser claims.
    const svg = await page.request.post("/api/me/avatar?x=0&y=0&size=50", {
      headers: { origin: base(), "content-type": "image/png" },
      data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>'),
    });
    expect(svg.status()).toBe(400);

    // A picture that fails to load falls back to the silhouette.
    await page.route("**/api/me/avatar?v=*", (route) => route.fulfill({ status: 500 }));
    await page.goto("/profile");
    await expect(visible(page, "profile-identity").getByTestId("avatar")).toHaveAttribute("data-kind", "silhouette");
    await page.unrouteAll();

    await page.goto("/settings");
    await page.getByTestId("avatar-remove").click();
    await expect(page.getByTestId("avatar-status")).toContainText("Picture removed");
    await expect(page.getByTestId("account-menu-button").getByTestId("avatar")).toHaveAttribute("data-kind", "silhouette");
  });

  test("email setup: required to finish setup, confirmed by link once, changeable with the old address kept until then", async ({ page }) => {
    const login = unique("email");
    const first = `${login}@example.com`;
    const second = `${login}-new@example.com`;
    await devLogin(page, login);
    await page.goto("/puzzles");
    await expect(visible(page, "email-setup-banner")).toBeVisible();
    await visible(page, "email-setup-banner").getByRole("link", { name: "Add email" }).click();
    await expect(page).toHaveURL(/\/settings\/email$/);
    await page.getByTestId("email-input").fill(first);
    await page.getByTestId("email-submit").click();
    await expect(page.getByTestId("email-pending")).toContainText(first);

    const link = /https?:\/\/\S+token=\S+/.exec(outboxFor(first).at(-1)?.text ?? "")?.[0] ?? "";
    expect(link).toContain("/settings/email/verify?token=");
    await page.goto(link);
    await expect(page.getByTestId("verify-done")).toContainText(first);
    // The token is gone from the address bar.
    expect(new URL(page.url()).search).toBe("");
    await expect(page.getByTestId("email-setup-banner")).toHaveCount(0);
    // A link works once.
    await page.goto(link);
    await expect(page.getByTestId("verify-failed")).toContainText("isn't valid");

    // Change: the verified address stays until the new one is confirmed.
    await page.goto("/settings#email");
    await page.getByTestId("email-change").click();
    await page.getByTestId("email-input").fill(second);
    await page.getByTestId("email-submit").click();
    await expect(page.getByTestId("email-current")).toContainText(first);
    await expect(page.getByTestId("email-pending")).toContainText(second);

    // An expired link says so, and offers a new one.
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("update email_verifications set expires_at = now() - interval '1 minute' where email = $1", [second]);
    } finally {
      await client.end();
    }
    const expired = /https?:\/\/\S+token=\S+/.exec(outboxFor(second).at(-1)?.text ?? "")?.[0] ?? "";
    await page.goto(expired);
    await expect(page.getByTestId("verify-failed")).toContainText("expired");
    await page.goto("/settings#email");
    await page.getByTestId("email-resend").click();
    await expect(page.getByTestId("email-message")).toContainText("new link");
    const fresh = /https?:\/\/\S+token=\S+/.exec(outboxFor(second).at(-1)?.text ?? "")?.[0] ?? "";
    await page.goto(fresh);
    await expect(page.getByTestId("verify-done")).toContainText(second);
    expect(outboxFor(first).some((message) => message.subject === "Your codebases email was changed")).toBe(true);

    // The address never appears in the account summary every page loads.
    const me = await (await page.request.get("/api/me")).text();
    expect(me).not.toContain("@example.com");
  });

  test("settings work on a phone, and the header still fits", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    try {
      await devLogin(page, `${unique("phone")}-with-a-long-name`);
      for (const path of ["/settings", "/puzzles", "/profile"]) {
        await page.goto(path);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), path).toBe(0);
      }
      await openThemes(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    } finally {
      await context.close();
    }
  });
});
