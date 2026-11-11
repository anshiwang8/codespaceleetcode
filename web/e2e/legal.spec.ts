import { expect, test } from "@playwright/test";
import { DELETE_CONFIRMATION, DELETED_DATA } from "../lib/account-deletion";
import { LEGAL } from "../lib/legal";
import { APPLIED_KEY, GUEST_FAVORITES_KEY, GUEST_PREFERENCE_KEY } from "../lib/themes/runtime";

// The legal pages' structure and the facts they share with the code. account.spec.ts checks the
// title, draft notice, contact and footer links.

test.describe("legal pages", () => {
  for (const key of ["privacy", "terms"] as const) {
    test(`/${key} shows "Needs review" notes exactly while it's a draft`, async ({ page }) => {
      await page.goto(`/${key}`);
      const notes = page.getByTestId("legal-review-note");
      // Approving a page means resolving and deleting every note, so a reviewed page has none.
      if (LEGAL.PAGES[key].reviewed) await expect(notes).toHaveCount(0);
      else expect(await notes.count()).toBeGreaterThan(0);
    });

    test(`/${key} fits a 375px phone without scrolling sideways`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`/${key}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("the privacy contents link to numbered sections, and every in-page link has a target", async ({ page }) => {
    await page.goto("/privacy");
    const contents = page.getByRole("navigation", { name: "Contents" });
    const links = contents.getByRole("link");
    const count = await links.count();
    expect(count).toBeGreaterThan(10);
    for (let index = 0; index < count; index++) {
      const link = links.nth(index);
      const id = ((await link.getAttribute("href")) ?? "").slice(1);
      const title = (await link.textContent()) ?? "";
      await expect(page.locator(`h2[id="${id}"]`)).toHaveText(`${index + 1}. ${title}`);
    }
    const missing = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>('main a[href^="#"]')]
        .map((anchor) => anchor.getAttribute("href")?.slice(1) ?? "")
        .filter((id) => !document.getElementById(id)),
    );
    expect(missing).toEqual([]);
  });

  test("the privacy policy names what deletion removes and every browser storage key", async ({ page }) => {
    await page.goto("/privacy");
    const deletion = page.locator("main");
    for (const item of DELETED_DATA) await expect(deletion.getByText(item, { exact: true })).toBeVisible();
    await expect(deletion).toContainText(`type ${DELETE_CONFIRMATION}`);
    for (const name of [APPLIED_KEY, GUEST_PREFERENCE_KEY, GUEST_FAVORITES_KEY, "cp-dev-login", "cp_dev_login"]) {
      await expect(page.locator("main code", { hasText: new RegExp(`^${name}$`) })).toHaveCount(1);
    }
  });

  test("the terms send account deletion to Settings, not the profile", async ({ page }) => {
    await page.goto("/terms");
    const account = page.locator("h2#account + p");
    await expect(account).toContainText("Danger zone");
    await expect(account.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });
});
