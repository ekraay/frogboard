import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("claim and release a slot end-to-end", async ({ page }) => {
  await page.goto("/");

  const firstCard = page.locator("article").first();
  await expect(firstCard).toContainText("filled");

  await firstCard.getByRole("button", { name: /grab a frog/i }).click();
  await firstCard.getByLabel(/your name/i).fill("E2E Tester");
  await firstCard.getByRole("button", { name: /^add me$/i }).click();

  await expect(firstCard).toContainText("E2E Tester");

  await firstCard.getByRole("button", { name: /remove e2e tester/i }).click();
  await expect(firstCard).not.toContainText("E2E Tester");
});

test("public board has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/");
  // Wait for the card entrance animations (pad-rise, 500 ms) to finish so axe
  // sees fully-opaque elements and computes accurate contrast ratios.
  await page.waitForFunction(() =>
    document.querySelectorAll(".pad-rise").length === 0 ||
    [...document.querySelectorAll(".pad-rise")].every(
      (el) => parseFloat(window.getComputedStyle(el).opacity) > 0.99,
    ),
  );
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
