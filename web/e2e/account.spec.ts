import { expect, test } from "@playwright/test";
import { FILES, openFile, openPuzzle, submitAndExpect, visible } from "./helpers";

test.describe("account deletion", () => {
  test("deleting from the profile removes progress and signs out", async ({ page }) => {
    await page.goto("/profile");
    await visible(page, "profile-signed-out").getByRole("button", { name: /Local dev sign-in/ }).click();
    await expect(visible(page, "stats-total")).toContainText("0 of 7");
    const login = await visible(page, "signed-in-as").textContent();

    await openPuzzle(page, "e2e-find-file");
    await openFile(page, FILES.config);
    await visible(page, "pick-open-file").click();
    await submitAndExpect(page, true);

    await page.goto("/profile");
    await expect(visible(page, "stats-total")).toContainText("1 of 7");

    // The first click only opens the warning; Cancel closes it without deleting.
    await page.getByTestId("delete-account-start").click();
    await expect(page.getByTestId("delete-account")).toContainText("can't be undone");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("delete-account-confirm")).toHaveCount(0);

    await page.getByTestId("delete-account-start").click();
    await page.getByTestId("delete-account-confirm").click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/profile");
    await expect(visible(page, "profile-signed-out")).toBeVisible();

    // Signing in again under the same dev name starts an empty account.
    await visible(page, "profile-signed-out").getByRole("button", { name: /Local dev sign-in/ }).click();
    await expect(visible(page, "signed-in-as")).toHaveText(login ?? "");
    await expect(visible(page, "stats-total")).toContainText("0 of 7");
  });
});

test.describe("legal pages", () => {
  for (const [path, title] of [
    ["/privacy", "Privacy policy"],
    ["/terms", "Terms"],
  ] as const) {
    test(`${path} renders, says it's a draft, and links to the other page`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.getByTestId("legal-draft")).toBeVisible();
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
