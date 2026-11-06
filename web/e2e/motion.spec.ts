import { expect, test, type Page } from "@playwright/test";
import { browserIssues, denseActivity, fixtureAccount, ready, settled } from "./visual-helpers";

test.skip(!process.env.VISUAL_REVIEW, "Run pnpm visual:review");

async function recordMotion(page: Page) {
  await page.addInitScript(() => {
    const names: string[] = [];
    Object.assign(window, { motionNames: names });
    document.addEventListener("animationstart", (event) => names.push(event.animationName));
  });
}
async function recorded(page: Page) {
  return page.evaluate(() => (window as unknown as { motionNames: string[] }).motionNames);
}

test("motion-enabled entrances, once-only reveals, no-JS fallback, and reduced motion", async ({ page, browser }) => {
  const issues = browserIssues(page);
  await recordMotion(page);
  await page.goto("/");
  await ready(page);
  await settled(page);
  expect(await recorded(page)).toContain("motion-enter");
  const region = page.locator("#how");
  await region.scrollIntoViewIfNeeded();
  await expect(region).toHaveAttribute("data-revealed", "true");
  await settled(page);
  const count = (await recorded(page)).length;
  await page.evaluate(() => window.scrollTo(0, 0));
  await region.scrollIntoViewIfNeeded();
  await settled(page);
  expect((await recorded(page)).length).toBe(count);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  const durations = await page.locator("[data-testid=hero] h1").evaluate((element) => {
    const style = getComputedStyle(element);
    return { duration: parseFloat(style.animationDuration), delay: parseFloat(style.animationDelay) };
  });
  expect(durations.duration).toBeLessThanOrEqual(0.001);
  expect(durations.delay).toBe(0);
  await settled(page);
  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 900 } });
  try {
    const staticPage = await noJs.newPage();
    await staticPage.goto(page.url());
    await expect(staticPage.getByRole("heading", { name: "How a puzzle works" })).toBeVisible();
    await expect(staticPage.getByRole("link", { name: "Browse puzzles" })).toBeVisible();
    expect(await staticPage.locator("#how").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  } finally { await noJs.close(); }
  const noObserver = await browser.newContext();
  try {
    await noObserver.addInitScript(() => Object.defineProperty(window, "IntersectionObserver", {
      value: class { observe() {} unobserve() {} disconnect() {} },
    }));
    const fallback = await noObserver.newPage();
    await fallback.goto(page.url());
    await expect(fallback.locator("#how")).toBeVisible();
    expect(await fallback.locator("#how").getAttribute("data-revealed")).toBeNull();
    expect(await fallback.locator("#how").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  } finally { await noObserver.close(); }
  expect(issues).toEqual([]);
});

test("rapid group toggles, keyboard focus, filter pending, and navigation interruption", async ({ page }) => {
  const issues = browserIssues(page);
  await page.goto("/puzzles");
  await ready(page);
  const group = page.getByTestId("group-easy").filter({ visible: true });
  const summary = group.locator("summary");
  await summary.focus();
  for (let n = 0; n < 7; n++) await page.keyboard.press("Enter");
  await expect(group.locator("details")).not.toHaveAttribute("open");
  await expect(summary).toBeFocused();
  await expect(group.getByTestId("puzzle-row-e2e-find-file")).toBeHidden();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest("details:not([open]) :not(summary)"))).toBe(false);
  await summary.focus(); await page.keyboard.press("Enter");
  await settled(page);

  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/puzzles\?.*type=trace/, async (route) => { await gate; await route.continue(); });
  const select = page.getByRole("combobox", { name: "Type" });
  const before = await select.boundingBox();
  await select.selectOption("trace");
  await expect(page.locator("[aria-busy=true]")).toBeVisible();
  expect(await select.boundingBox()).toEqual(before);
  release();
  await expect(page.getByTestId("puzzle-count").filter({ visible: true })).toContainText("1 of 7");
  await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
  await settled(page);
  await page.unrouteAll({ behavior: "wait" });
  // Leave while the next entrance is still running.
  await page.goto("/");
  await page.getByRole("link", { name: "Browse puzzles" }).click();
  await expect(page.getByRole("heading", { name: "Puzzles", exact: true })).toBeVisible();
  await settled(page);
  expect(issues).toEqual([]);
});

test("profile progress, appended history, confirmation focus, and reduced-motion controls", async ({ page }) => {
  const issues = browserIssues(page);
  await recordMotion(page);
  await fixtureAccount(page, true, "motion-profile");
  await page.goto("/profile");
  await ready(page);
  await expect(page.getByTestId("stats-total").filter({ visible: true })).toContainText("1 of 7");
  await settled(page);
  expect(await recorded(page)).toContain("motion-enter");
  const fill = page.getByRole("progressbar", { name: "Completion", exact: true }).locator(".progress-fill");
  const box = await fill.boundingBox();
  // Exercise a previous-to-next value on the existing node. Its accessible value and text stay final.
  const progress = await fill.evaluate((element) => {
    element.setAttribute("style", "--progress: 0.5");
    return element.parentElement?.getBoundingClientRect().toJSON();
  });
  await expect.poll(() => fill.evaluate((element) => getComputedStyle(element).transform)).toBe("matrix(0.5, 0, 0, 1, 0, 0)");
  expect(await fill.locator("..").boundingBox()).toMatchObject({ x: progress.x, y: progress.y, width: progress.width, height: progress.height });
  expect(box?.height).toBe(6);

  const more = page.getByTestId("history-load-more");
  await more.scrollIntoViewIfNeeded();
  await more.focus();
  const first = page.getByTestId("history-entry").first();
  const y = (await first.boundingBox())?.y;
  await more.click();
  await expect(page.getByTestId("history-entry")).toHaveCount(14);
  await settled(page);
  await expect(more).toBeFocused();
  expect((await first.boundingBox())?.y).toBe(y);
  await expect(page.getByRole("status")).toContainText("4 older submissions loaded.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fill.evaluate((element) => element.setAttribute("style", "--progress: 0.75"));
  await expect.poll(() => fill.evaluate((element) => getComputedStyle(element).transform)).toBe("matrix(0.75, 0, 0, 1, 0, 0)");
  expect(await fill.evaluate((element) => getComputedStyle(element).transformOrigin)).toMatch(/^0px/);
  // Deletion's confirmation lives in Settings.
  await page.goto("/settings");
  await ready(page);
  await expect(page.getByTestId("delete-account-start")).toBeVisible();
  for (let n = 0; n < 3; n++) {
    await page.getByTestId("delete-account-start").click();
    await expect(page.getByTestId("delete-account-cancel")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("delete-account-start")).toBeFocused();
  }
  await expect(page.getByTestId("delete-account-confirm")).toHaveCount(0);
  await settled(page);
  expect(issues).toEqual([]);
});

test("submission pending terminates, changed selections reject stale feedback, editor stays mounted", async ({ page }) => {
  const issues = browserIssues(page);
  await fixtureAccount(page, false, "motion-workspace");
  await page.goto("/puzzles/e2e-arch-choice");
  await ready(page);
  await expect(page.locator(".monaco-editor .view-line").first()).toBeVisible();
  const editor = await page.locator(".monaco-editor").first().elementHandle();
  await page.getByRole("radio", { name: "The router module" }).check();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let responseReady!: () => void;
  const responseReceived = new Promise<void>((resolve) => { responseReady = resolve; });
  let submissions = 0;
  await page.route("**/api/puzzles/*/submit", async (route) => {
    submissions++;
    const response = await route.fetch();
    responseReady();
    await gate;
    await route.fulfill({ response });
  });
  const submit = page.getByTestId("submit");
  const before = await submit.boundingBox();
  await submit.click();
  await expect(submit).toHaveAttribute("aria-busy", "true");
  expect(await submit.boundingBox()).toEqual(before);
  await submit.dispatchEvent("click");
  await page.getByRole("radio", { name: "The config module" }).check();
  await responseReceived;
  release();
  await expect(submit).toHaveAttribute("aria-busy", "false");
  expect(submissions).toBe(1);
  await expect(page.getByTestId("result")).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
  await submit.click();
  await expect(page.getByTestId("result")).toHaveAttribute("data-correct", "true");
  await settled(page);
  expect(await editor?.evaluate((element) => element.isConnected)).toBe(true);
  await page.getByTestId("view-solution").click();
  await expect(page.getByTestId("prompt-tab-solution")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("prompt-tab-description")).toBeFocused();
  await expect(page.getByTestId("prompt-panel-solution")).toBeHidden();
  await page.getByTestId("submit").click();
  await page.getByRole("link", { name: "Puzzles", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Puzzles", exact: true })).toBeVisible();
  await settled(page);
  expect(issues).toEqual([]);
});


test("landing sign-in keeps its dimensions and finishes feedback on a refused provider", async ({ page }) => {
  const exceptions: string[] = [];
  page.on("pageerror", (error) => exceptions.push(error.message));
  await page.goto("/");
  await ready(page); await settled(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  // This is an explicitly expected provider refusal, not a failed application request in a gallery.
  await page.route("**/api/auth/sign-in/social", async (route) => {
    await gate;
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "PROVIDER_NOT_FOUND" }) });
  });
  try {
    const button = page.getByTestId("log-in");
    const bounds = await button.boundingBox();
    await button.click();
    await expect(button).toHaveAttribute("aria-busy", "true");
    expect(await button.boundingBox()).toEqual(bounds);
    release();
    await expect(button).toHaveAttribute("aria-busy", "false");
    await expect(page.getByTestId("log-in-note")).toContainText("isn't set up");
    expect(await button.boundingBox()).toEqual(bounds);
    await settled(page);
    expect(exceptions).toEqual([]);
  } finally { release(); await page.unrouteAll({ behavior: "ignoreErrors" }); }
});

test("a correct result's check bounces once inside a fixed box, and not at all with reduced motion", async ({ page }) => {
  const issues = browserIssues(page);
  await fixtureAccount(page, false, "motion-bounce");
  await recordMotion(page);
  await page.goto("/puzzles/e2e-arch-choice");
  await ready(page);
  await settled(page);

  // A wrong answer shows an ✗ with no bounce.
  await page.getByRole("radio", { name: "The router module" }).check();
  await page.getByTestId("submit").click();
  await expect(page.getByTestId("result")).toHaveAttribute("data-correct", "false");
  await settled(page);
  expect(await recorded(page)).not.toContain("motion-bounce");

  // Slow the bounce down so it can be measured while it runs; the keyframes are unchanged.
  await page.addStyleTag({ content: ":root { --motion-bounce-time: 1500ms; }" });
  await page.getByRole("radio", { name: "The config module" }).check();
  await page.getByTestId("submit").click();
  const icon = page.getByTestId("result-icon");
  await expect(icon).toHaveText("✓");
  const running = await icon.evaluate((element) => {
    const animation = element.getAnimations().find((item) => (item as CSSAnimation).animationName === "motion-bounce");
    return animation ? { state: animation.playState, iterations: animation.effect?.getTiming().iterations } : null;
  });
  expect(running).toEqual({ state: "running", iterations: 1 });

  // The scale peaks once above 1 and nothing around it moves or resizes. The result box has its own
  // short entrance, so measure once that has ended, while the slowed bounce is still running.
  const box = page.getByTestId("result");
  await expect.poll(() => box.evaluate((element) => element.getAnimations().length)).toBe(0);
  expect(await icon.evaluate((element) => element.getAnimations()[0]?.playState)).toBe("running");
  const viewSolution = page.getByTestId("view-solution");
  const boxBefore = await box.boundingBox();
  const buttonBefore = await viewSolution.boundingBox();
  const wrapper = await icon.evaluate((element) => {
    const rect = element.parentElement?.getBoundingClientRect();
    return rect ? { width: rect.width, height: rect.height } : null;
  });
  expect(wrapper).toEqual({ width: 20, height: 20 });
  const peak = await icon.evaluate((element) => {
    const animation = element.getAnimations()[0];
    if (!animation) return 0;
    const resumeAt = animation.currentTime;
    animation.pause();
    let highest = 0;
    for (let step = 0; step <= 30; step++) {
      animation.currentTime = (1500 * step) / 30;
      highest = Math.max(highest, new DOMMatrix(getComputedStyle(element).transform).a);
    }
    // Return to where it was before playing on: play() from the very end would rewind and restart it.
    animation.currentTime = resumeAt;
    animation.play();
    return highest;
  });
  expect(peak).toBeGreaterThan(1.1);
  expect(peak).toBeLessThan(1.3);
  expect(await box.boundingBox()).toEqual(boxBefore);
  expect(await viewSolution.boundingBox()).toEqual(buttonBefore);

  // It ends, at rest, and doesn't replay on its own.
  await settled(page);
  expect(await icon.evaluate((element) => getComputedStyle(element).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  expect((await recorded(page)).filter((name) => name === "motion-bounce")).toHaveLength(1);

  // Reduced motion: the ✓ shows at once, at full size.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await ready(page);
  await page.getByRole("radio", { name: "The config module" }).check();
  await page.getByTestId("submit").click();
  await expect(page.getByTestId("result-icon")).toHaveText("✓");
  const reduced = await page.getByTestId("result-icon").evaluate((element) => ({
    duration: parseFloat(getComputedStyle(element).animationDuration),
    opacity: getComputedStyle(element).opacity,
  }));
  expect(reduced.duration).toBeLessThanOrEqual(0.001);
  expect(reduced.opacity).toBe("1");
  expect(issues).toEqual([]);
});

test("the activity tracker keeps its squares still, gives brief feedback, and stops it under reduced motion", async ({ page }) => {
  const issues = browserIssues(page);
  await fixtureAccount(page, false, "motion-tracker");
  await denseActivity("motion-tracker");
  await recordMotion(page);
  await page.goto("/profile");
  await ready(page);
  await settled(page);
  const grid = page.getByTestId("activity-grid");
  // No square in a year-wide grid animates, on load or when the period changes.
  const squareAnimations = () =>
    grid.evaluate((element) => [...element.querySelectorAll("td")].reduce((sum, cell) => sum + cell.getAnimations().length, 0));
  expect(await squareAnimations()).toBe(0);
  const lastYear = String(new Date().getUTCFullYear() - 1);
  await page.getByTestId("activity-period").selectOption(lastYear);
  await expect(page.getByTestId("activity-summary")).toHaveText(new RegExp(`^${lastYear}: `));
  expect(await squareAnimations()).toBe(0);
  await page.getByTestId("activity-period").selectOption("rolling");
  await expect(page.getByTestId("activity-summary")).toHaveText(/^Last 365 days: /);
  await settled(page);

  // Picking a date: the cell keeps its size and place, and the selection strip fades in once.
  const cell = grid.locator('[role=gridcell][tabindex="0"]');
  // Focus first: focusing may scroll the page, which isn't the cell moving.
  await cell.focus();
  const before = await cell.boundingBox();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("activity-selected")).toBeVisible();
  expect(await cell.boundingBox()).toEqual(before);
  expect(await recorded(page)).toContain("motion-fade");
  await settled(page);

  // Reduced motion: the same steps leave nothing running.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByTestId("activity-selected").getByRole("button", { name: "Clear date" }).click();
  await cell.focus();
  await page.keyboard.press("Enter");
  const running = await page.evaluate(() =>
    document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getComputedTiming();
      return animation.playState === "running" && Number(timing?.duration ?? 0) > 1;
    }).length,
  );
  expect(running).toBe(0);
  const fade = await page.getByTestId("activity-selected").evaluate((element) => parseFloat(getComputedStyle(element).animationDuration));
  expect(fade).toBeLessThanOrEqual(0.001);
  expect(issues).toEqual([]);
});
