import { test, expect } from "@playwright/test";

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
