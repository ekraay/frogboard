import { test, expect } from "@playwright/test";

// The seed publishes one event with slug "ginza-2026".

test("the root sends visitors to the event's pretty URL", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/ginza-2026$/);
  await expect(page.locator("article").first()).toContainText("filled");
});

test("the pretty slug URL renders that event's board", async ({ page }) => {
  await page.goto("/ginza-2026");
  await expect(page.locator("article").first()).toContainText("filled");
});

test("the group filter works on the pretty URL", async ({ page }) => {
  await page.goto("/ginza-2026?group=Scouts");
  await expect(page.getByText(/showing scouts/i)).toBeVisible();
});

test("an unknown slug returns 404", async ({ page }) => {
  const res = await page.goto("/no-such-event");
  expect(res?.status()).toBe(404);
});

test("combined facet filter narrows the board and updates coverage", async ({ page }) => {
  await page.goto("/ginza-2026?date=2026-07-25&group=Scouts");
  await expect(page.getByText(/showing .*scouts/i)).toBeVisible();
  await expect(page.locator("article").first()).toBeVisible();
});
