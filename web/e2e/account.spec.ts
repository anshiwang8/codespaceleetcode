import { expect, test } from "@playwright/test";
import { LEGAL } from "../lib/legal";
import { FILES, openFile, openPuzzle, submitAndExpect, visible } from "./helpers";

test.describe("account deletion", () => {
  test("deleting from settings removes progress and signs out", async ({ page }) => {
    await page.goto("/profile");
    await visible(page, "profile-signed-out").getByRole("button", { name: /Local dev sign-in/ }).click();
    await expect(visible(page, "stats-total")).toContainText("0 of 8");
    const login = await visible(page, "signed-in-as").textContent();

    await openPuzzle(page, "e2e-find-file");
    await openFile(page, FILES.config);
    await visible(page, "pick-open-file").click();
    await submitAndExpect(page, true);

    await page.goto("/profile");
    await expect(visible(page, "stats-total")).toContainText("1 of 8");
    await visible(page, "nav-settings").click();
    await expect(page).toHaveURL(/\/settings$/);

    // The first click only opens the warning; Cancel closes it without deleting.
    await visible(page, "delete-account-start").click();
    await expect(visible(page, "delete-account")).toContainText("can't be undone");
    await visible(page, "delete-account-cancel").click();
    await expect(visible(page, "delete-account-confirm")).toHaveCount(0);

    await visible(page, "delete-account-start").click();
    await visible(page, "delete-account-confirm").click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/profile");
    await expect(visible(page, "profile-signed-out")).toBeVisible();

    // Signing in again under the same dev name starts an empty account.
    await visible(page, "profile-signed-out").getByRole("button", { name: /Local dev sign-in/ }).click();
    await expect(visible(page, "signed-in-as")).toHaveText(login ?? "");
    await expect(visible(page, "stats-total")).toContainText("0 of 8");
  });
});

test.describe("legal pages", () => {
  for (const [path, title, key] of [
    ["/privacy", "Privacy policy", "privacy"],
    ["/terms", "Terms", "terms"],
  ] as const) {
    test(`${path} renders, shows its review state and contact, and links to the other page`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      // The draft notice shows exactly until lib/legal.ts says the page was reviewed (M7, M11).
      await expect(page.getByTestId("legal-draft")).toHaveCount(LEGAL.PAGES[key].reviewed ? 0 : 1);
      if (LEGAL.CONTACT) {
        await expect(page.getByRole("link", { name: LEGAL.CONTACT, exact: true })).toHaveAttribute(
          "href",
          `mailto:${LEGAL.CONTACT}`,
        );
        await expect(page.getByTestId("legal-contact-missing")).toHaveCount(0);
      } else {
        await expect(page.getByTestId("legal-contact-missing")).toBeVisible();
      }
      await expect(page.getByRole("link", { name: "Privacy policy", exact: true })).toHaveAttribute("href", "/privacy");
      await expect(page.getByRole("link", { name: "Terms", exact: true })).toHaveAttribute("href", "/terms");
    });
  }

  test("the landing page footer links to both", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("navigation", { name: "Footer" });
    await footer.getByRole("link", { name: "Privacy" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await page.goto("/");
    await footer.getByRole("link", { name: "Terms" }).click();
    await expect(page).toHaveURL(/\/terms$/);
  });
});
