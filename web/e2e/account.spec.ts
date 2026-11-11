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

    // The first click only opens the warning, with Cancel focused; Cancel closes it without deleting.
    await visible(page, "delete-account-start").click();
    await expect(visible(page, "delete-account")).toContainText("can't be undone");
    await expect(visible(page, "delete-account")).toContainText("Your leaderboard entry and public name");
    await expect(visible(page, "delete-account-cancel")).toBeFocused();
    await visible(page, "delete-account-cancel").click();
    await expect(visible(page, "delete-account-confirm")).toHaveCount(0);
    await expect(visible(page, "delete-account-start")).toBeFocused();

    // Deleting needs DELETE typed exactly, case included.
    await visible(page, "delete-account-start").click();
    await expect(visible(page, "delete-account-confirm")).toBeDisabled();
    await expect(visible(page, "delete-account-input")).toHaveAttribute("autocomplete", "off");
    await visible(page, "delete-account-input").fill("delete");
    await expect(visible(page, "delete-account-confirm")).toBeDisabled();
    await visible(page, "delete-account-input").fill("DELETE");
    await expect(visible(page, "delete-account-confirm")).toBeEnabled();
    // A dev-login session always counts as a recent sign-in, so no GitHub sign-in is asked for.
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
      const footer = page.getByRole("navigation", { name: "Footer" });
      await expect(footer.getByRole("link", { name: "Privacy", exact: true })).toHaveAttribute("href", "/privacy");
      await expect(footer.getByRole("link", { name: "Terms", exact: true })).toHaveAttribute("href", "/terms");
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
