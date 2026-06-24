import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PASSWORD = process.env.ORGANIZER_PASSWORD ?? "test-organizer-pw";

test("organizer sets up an event and opens sign-ups", async ({ page }) => {
  await page.goto("/organize");
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.getByLabel(/event name/i).fill("E2E Matsuri");
  await page.getByLabel(/first day/i).fill("2026-08-01");
  await page.getByLabel(/last day/i).fill("2026-08-02");
  await page.getByRole("button", { name: /create event/i }).click();

  await expect(page.getByText(/draft — only organizers/i)).toBeVisible();

  // the organizer can jump to the public signup page for this event
  await expect(page.getByRole("link", { name: /view signup page/i })).toBeVisible();

  await page.getByRole("button", { name: /add row/i }).click();
  await page.getByLabel("Title, row 1").fill("Lantern setup");
  await page.getByLabel("Date, row 1").fill("Aug 1");
  await page.getByLabel("Time, row 1").fill("9:00 AM - 11:00 AM");
  await page.getByLabel("Need, row 1").fill("3");
  // Click outside the row to blur it → autosave. (Tabbing isn't enough: the
  // next focusable element is the row's own delete button, still inside it.)
  await page.getByRole("heading", { name: /E2E Matsuri/ }).click();
  await expect(page.getByText("Saved ✓")).toBeVisible();

  // a11y scan of the grid while we're here
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);

  await page.getByRole("button", { name: /open sign-ups/i }).click();
  await expect(page.getByText(/live — volunteers/i)).toBeVisible();

  // Two events are published now (this one + the seeded one), so the root is a
  // chooser. Open this event's board from it.
  await page.goto("/");
  await page.getByRole("link", { name: /E2E Matsuri/ }).click();
  await expect(page.getByText("Lantern setup")).toBeVisible();

  // close sign-ups → only the seeded event stays published, so / goes there
  await page.goto("/organize");
  await page.getByRole("link", { name: /E2E Matsuri/ }).click();
  await page.getByRole("button", { name: /close sign-ups/i }).click();
  // Wait for the banner to confirm the status change before navigating away.
  await expect(page.getByText(/draft — only organizers/i)).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("E2E Matsuri")).not.toBeVisible();
});
