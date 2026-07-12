import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The board is dark by default. The preview Route Handler sets the opt-in cookie
// and redirects, so this also exercises the real dark-launch entry point.
const BOARD = "/b/ginza-2026";
const PREVIEW = "/b/ginza-2026/preview?on=1";

test("preview opt-in, claim through the panel, then clean up", async ({ page }) => {
  await page.goto(PREVIEW);
  await expect(page).toHaveURL(new RegExp(`${BOARD}$`));

  const available = page.getByRole("region", { name: "Available" });
  const claimed = page.getByRole("region", { name: "Claimed" });
  await expect(available).toBeVisible();
  await expect(claimed).toBeVisible();

  // Open the first available task's panel.
  const card = available.getByRole("button").first();
  const title = (await card.locator("p.font-display").first().innerText()).trim();
  await card.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  await expect(page).toHaveURL(/#task-/);

  // Claim through the reused ClaimFields.
  await dialog.getByLabel(/your name/i).fill("E2E Board Tester");
  await dialog.getByRole("button", { name: /^add me$/i }).click();

  // The board refreshes and the claimant shows on the board.
  await expect(page.getByText("E2E Board Tester")).toBeVisible();

  // Clean up via the classic board's remove control (same device token).
  await page.goto("/");
  await page.getByRole("button", { name: /remove e2e board tester/i }).click();
  await expect(page.getByText("E2E Board Tester")).toHaveCount(0);
});

test("task board has no WCAG A/AA violations, panel included", async ({ page }) => {
  await page.goto(PREVIEW);
  await expect(page.getByRole("region", { name: "Available" })).toBeVisible();

  const board = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(board.violations).toEqual([]);

  // Open a panel and re-scan the modal.
  await page.getByRole("region", { name: "Available" }).getByRole("button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const withPanel = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(withPanel.violations).toEqual([]);
});
