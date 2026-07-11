# E2E User-Flow Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Playwright end-to-end tests that validate the core user journeys (event lifecycle through delete, roster RSVP round-trip, audit-history revert, board claim/release) with Hendrickson-style round-trip, invariant, and guard checks.

**Architecture:** Black-box tests that drive the real UI and read the real DOM, one spec file per concern. A shared `e2e/helpers.ts` removes login and create-event boilerplate. A deterministic seed fixture (a fixed lead token plus a small roster) lets the RSVP round-trip target a stable `/lead/<token>` URL instead of the fragile import-then-copy-link chain.

**Tech Stack:** Playwright (`@playwright/test` 1.60), Next.js 16 app already built and served by the Playwright `webServer`, Prisma seed (`prisma/seed.ts`, run via `tsx`).

## Global Constraints

- These are **characterization tests** of existing behavior. Each spec should PASS on its first correct run. A failure means a wrong selector or assumption to fix, or a genuine defect to investigate, not code to write.
- The suite assumes a **freshly seeded database**, matching CI (`npm run db:seed` runs before `npm run test:e2e`) and the existing specs. Run `npm run db:seed` before running these tests locally.
- The Playwright `webServer` runs `npm run start`, which needs a prior `npm run build`. Build once locally before the first e2e run.
- Organizer password comes from `process.env.ORGANIZER_PASSWORD ?? "test-organizer-pw"` (see `playwright.config.ts`).
- Confirm dialogs (`window.confirm` on Delete and Revert): register `page.on("dialog", (d) => d.accept())` before the click.
- Prose in comments follows the project style: active voice, no em dashes.
- Before claiming done: `npx tsc --noEmit` and `npm run lint` clean, and the targeted specs green.

---

## File Structure

- Create `e2e/fixtures.ts` — shared constants for the RSVP fixture (token, group, roster names). Imported by both the seed and the RSVP spec, so the token lives in exactly one place.
- Create `e2e/helpers.ts` — `signInAsOrganizer`, `createEvent`, `uniqueName`.
- Modify `prisma/seed.ts` — add the deterministic roster + lead fixture, guarded to non-production, and delete roster rows on reseed.
- Create `e2e/event-lifecycle.spec.ts` — create through delete, plus archive/restore invariant and blank-name guard.
- Create `e2e/history-revert.spec.ts` — edit a task, revert the edit, confirm the value returns.
- Create `e2e/roster-rsvp.spec.ts` — the lead RSVP round-trip and guard (core), plus the organizer import-and-copy-link chain (separate test).
- Modify `e2e/board.spec.ts` — add the empty-name guard and the release-restores-count invariant.

---

## Task 1: Shared fixtures and helpers

**Files:**
- Create: `e2e/fixtures.ts`
- Create: `e2e/helpers.ts`

**Interfaces:**
- Produces:
  - `E2E_LEAD_TOKEN: string`, `E2E_LEAD_GROUP: string`, `E2E_ROSTER: string[]` (from `e2e/fixtures.ts`).
  - `signInAsOrganizer(page: Page): Promise<void>`, `createEvent(page: Page, name: string): Promise<void>`, `uniqueName(prefix: string): string` (from `e2e/helpers.ts`).

- [ ] **Step 1: Write `e2e/fixtures.ts`**

```ts
// Shared constants for the deterministic RSVP fixture. The seed and the
// roster-rsvp spec both import these so the token is defined in one place.

// A fixed, opaque capability token (see lib/security/tokens.ts). Not a secret.
// The seed only creates it outside production.
export const E2E_LEAD_TOKEN = "e2e00000-0000-4000-8000-00000000feed";

export const E2E_LEAD_GROUP = "Scouts";

// Full adult names so boardDisplayName shows them unabbreviated.
export const E2E_ROSTER = ["Kenji Tanaka", "Mai Suzuki", "Ren Watanabe"];
```

- [ ] **Step 2: Write `e2e/helpers.ts`**

```ts
import { expect, type Page } from "@playwright/test";

const PASSWORD = process.env.ORGANIZER_PASSWORD ?? "test-organizer-pw";

/** Sign in on /organize and wait for the organizer home to render. */
export async function signInAsOrganizer(page: Page): Promise<void> {
  await page.goto("/organize");
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("button", { name: /create event/i })).toBeVisible();
}

/** Create an event from the organizer home and wait for its draft grid. */
export async function createEvent(page: Page, name: string): Promise<void> {
  await page.getByLabel(/event name/i).fill(name);
  await page.getByLabel(/first day/i).fill("2026-08-01");
  await page.getByLabel(/last day/i).fill("2026-08-02");
  await page.getByRole("button", { name: /create event/i }).click();
  await expect(page.getByText(/draft — only organizers/i)).toBeVisible();
}

/** A collision-free name for isolation across parallel workers and reruns. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
}
```

- [ ] **Step 3: Verify types and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add e2e/fixtures.ts e2e/helpers.ts
git commit -m "test(e2e): shared fixtures and organizer helpers"
```

---

## Task 2: Seed the deterministic RSVP fixture

**Files:**
- Modify: `prisma/seed.ts`

**Interfaces:**
- Consumes: `E2E_LEAD_TOKEN`, `E2E_LEAD_GROUP`, `E2E_ROSTER` from `e2e/fixtures.ts`.
- Produces: after `npm run db:seed` outside production, one `Lead` with `token === E2E_LEAD_TOKEN` for the seeded `ginza-2026` event, and three blank `Person` rows in group `Scouts`.

**Note:** The seed is a fixture, not behavior code, so it has no unit test (an AGENTS.md exception). Verify it by running it and by the `roster-rsvp` spec in Task 5.

- [ ] **Step 1: Import the fixture constants**

Add to the top of `prisma/seed.ts`, after the existing import:

```ts
import { E2E_LEAD_TOKEN, E2E_LEAD_GROUP, E2E_ROSTER } from "../e2e/fixtures";
```

- [ ] **Step 2: Delete roster rows on reseed**

The existing cleanup deletes auditLog, signup, task, and event. Deleting events cascades leads and rsvps, but `Person` rows have no event relation and would accumulate (and the fixed lead token would collide on the next reseed). Add a person delete to the cleanup block, right after `await prisma.event.deleteMany();`:

```ts
  await prisma.person.deleteMany();
```

- [ ] **Step 3: Create the roster and lead after the tasks**

Add, immediately before the final `console.log(...)` line in `main()`:

```ts
  // Deterministic RSVP fixture for e2e. Never in production: the token is fixed.
  if (process.env.NODE_ENV !== "production") {
    await prisma.person.createMany({
      data: E2E_ROSTER.map((name) => ({
        orgId: event.orgId, name, group: E2E_LEAD_GROUP, active: true,
      })),
    });
    await prisma.lead.create({
      data: {
        eventId: event.id, orgId: event.orgId, group: E2E_LEAD_GROUP,
        name: "E2E Lead", token: E2E_LEAD_TOKEN,
      },
    });
    console.log(`Seeded RSVP fixture: ${E2E_ROSTER.length} people, lead token ${E2E_LEAD_TOKEN}.`);
  }
```

- [ ] **Step 4: Run the seed against a dev or test database**

Run: `npm run db:seed`
Expected: output includes `Seeded RSVP fixture: 3 people, lead token e2e00000-...`. No error.

- [ ] **Step 5: Verify types and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts
git commit -m "test(e2e): seed a deterministic roster and lead token fixture"
```

---

## Task 3: Event lifecycle spec

**Files:**
- Create: `e2e/event-lifecycle.spec.ts`

**Interfaces:**
- Consumes: `signInAsOrganizer`, `createEvent`, `uniqueName` from `e2e/helpers.ts`.

Behavior reference:
- Blank-name create returns "Give the event a name." (`createEventAction`).
- The public board banner reads "🌱 Draft — only organizers can see this." (draft) and "🏮 Live — volunteers see changes as you make them." (published).
- Archive uses the button `aria-label="Archive <name>"` on `/organize`; Restore and Delete live inside the collapsed "Archived (n)" `<details>`, `aria-label="Restore <name>"` / `Delete <name>`.
- Delete fires `window.confirm`.
- "View signup page" is a link to the event's board; an unknown board slug returns 404.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from "@playwright/test";
import { signInAsOrganizer, createEvent, uniqueName } from "./helpers";

test("blank event name is rejected", async ({ page }) => {
  await signInAsOrganizer(page);
  // Leave the name empty, fill valid dates, submit.
  await page.getByLabel(/first day/i).fill("2026-08-01");
  await page.getByLabel(/last day/i).fill("2026-08-02");
  await page.getByRole("button", { name: /create event/i }).click();
  await expect(page.getByRole("alert")).toHaveText(/give the event a name/i);
});

test("archive hides an event and restore brings it back", async ({ page }) => {
  const name = uniqueName("Archive Trip");
  await signInAsOrganizer(page);
  await createEvent(page, name);

  await page.goto("/organize");
  const active = page.getByRole("listitem").filter({ hasText: name });
  await expect(active).toBeVisible();

  await page.getByRole("button", { name: `Archive ${name}` }).click();
  // It leaves the active list and moves under the Archived disclosure.
  await expect(page.getByRole("button", { name: `Archive ${name}` })).toHaveCount(0);
  await page.getByRole("group").getByText(/archived/i).click(); // expand <details>
  await expect(page.getByRole("button", { name: `Restore ${name}` })).toBeVisible();

  await page.getByRole("button", { name: `Restore ${name}` }).click();
  await expect(page.getByRole("button", { name: `Archive ${name}` })).toBeVisible();
});

test("an event runs create → open → close → archive → delete", async ({ page }) => {
  const name = uniqueName("Lifecycle Matsuri");
  await signInAsOrganizer(page);
  await createEvent(page, name);

  // Grab the event id from the URL so we can 404-check its board after delete.
  const eventId = page.url().split("/organize/")[1];
  const boardLink = page.getByRole("link", { name: /view signup page/i });
  const boardHref = await boardLink.getAttribute("href");

  // Add one task and let it autosave (blur by clicking the heading).
  await page.getByRole("button", { name: /add row/i }).click();
  await page.getByLabel("Title, row 1").fill("Lantern setup");
  await page.getByLabel("Date, row 1").fill("Aug 1");
  await page.getByLabel("Time, row 1").fill("9:00 AM - 11:00 AM");
  await page.getByLabel("Need, row 1").fill("3");
  await page.getByRole("heading", { name }).click();
  await expect(page.getByText("Saved ✓")).toBeVisible();

  // Open sign-ups, then close them (status round-trip).
  await page.getByRole("button", { name: /open sign-ups/i }).click();
  await expect(page.getByText(/live — volunteers/i)).toBeVisible();
  await page.getByRole("button", { name: /close sign-ups/i }).click();
  await expect(page.getByText(/draft — only organizers/i)).toBeVisible();

  // Archive, then delete from the Archived disclosure. Accept the confirm.
  await page.goto("/organize");
  await page.getByRole("button", { name: `Archive ${name}` }).click();
  await page.getByRole("group").getByText(/archived/i).click();
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: `Delete ${name}` }).click();

  // Round-trip invariant: the event is gone from /organize and its board 404s.
  await expect(page.getByText(name)).toHaveCount(0);
  const res = await page.goto(boardHref ?? `/${eventId}`);
  expect(res?.status()).toBe(404);
});
```

- [ ] **Step 2: Reseed and run the spec**

Run: `npm run db:seed && npx playwright test e2e/event-lifecycle.spec.ts`
Expected: 3 passed. (Build first with `npm run build` if the webServer has never started.)

- [ ] **Step 3: Verify types and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add e2e/event-lifecycle.spec.ts
git commit -m "test(e2e): event lifecycle through delete, with archive and guard checks"
```

---

## Task 4: History revert spec

**Files:**
- Create: `e2e/history-revert.spec.ts`

**Interfaces:**
- Consumes: `signInAsOrganizer`, `createEvent`, `uniqueName` from `e2e/helpers.ts`.

Behavior reference:
- Editing a task's field creates an `edit` audit entry; `edit` and `delete` are revertible (`lib/domain/history.ts`). Revert restores the prior field values.
- The history page lives at `/organize/<eventId>/history`; a "History" link sits on the event grid.
- Each revertible entry renders a "Revert" button; Revert fires `window.confirm` then refreshes.
- The grid title input has `aria-label="Title, row 1"`.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from "@playwright/test";
import { signInAsOrganizer, createEvent, uniqueName } from "./helpers";

test("reverting an edit restores the task's prior title", async ({ page }) => {
  const name = uniqueName("Revert Matsuri");
  page.on("dialog", (d) => d.accept());
  await signInAsOrganizer(page);
  await createEvent(page, name);
  const eventId = page.url().split("/organize/")[1];

  // Create a task (first save = create), then edit its title (second save = edit).
  await page.getByRole("button", { name: /add row/i }).click();
  await page.getByLabel("Title, row 1").fill("Lantern setup");
  await page.getByLabel("Date, row 1").fill("Aug 1");
  await page.getByLabel("Time, row 1").fill("9:00 AM - 11:00 AM");
  await page.getByLabel("Need, row 1").fill("3");
  await page.getByRole("heading", { name }).click();
  await expect(page.getByText("Saved ✓")).toBeVisible();

  await page.getByLabel("Title, row 1").fill("Lantern teardown");
  await page.getByRole("heading", { name }).click();
  await expect(page.getByText("Saved ✓")).toBeVisible();

  // Open history: the newest entry is the edit and is revertible.
  await page.goto(`/organize/${eventId}/history`);
  await expect(page.getByText(/edited: lantern teardown/i)).toBeVisible();
  await page.getByRole("button", { name: /^revert$/i }).first().click();

  // Round-trip: back on the grid, the title returned to its prior value.
  await page.goto(`/organize/${eventId}`);
  await expect(page.getByLabel("Title, row 1")).toHaveValue("Lantern setup");
});
```

- [ ] **Step 2: Reseed and run the spec**

Run: `npm run db:seed && npx playwright test e2e/history-revert.spec.ts`
Expected: 1 passed.

- [ ] **Step 3: Verify types and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add e2e/history-revert.spec.ts
git commit -m "test(e2e): revert a task edit and confirm the value returns"
```

---

## Task 5: Roster RSVP spec

**Files:**
- Create: `e2e/roster-rsvp.spec.ts`

**Interfaces:**
- Consumes: `E2E_LEAD_TOKEN`, `E2E_LEAD_GROUP` from `e2e/fixtures.ts`; `signInAsOrganizer`, `uniqueName` from `e2e/helpers.ts`.

Behavior reference:
- The lead page is `/lead/<token>`; an invalid token renders "This link isn't valid".
- The header reads "Heard from {heard} of {total}", where heard counts everyone except blank.
- The chase list shows only blank and "maybe" people; a person set to "yes" or "no" drops off. RSVP buttons carry `aria-label` "Yes" / "No" / "Maybe".
- On the organizer side, LeadsPanel imports a roster (fields `aria-label="Group name"`, `aria-label="Roster rows"`, button "Import"), assigns a lead (fields `aria-label="Group"`, `aria-label="Lead name"`, button "Assign lead"), and each lead row has a "Copy link" button that writes `/lead/<token>` to the clipboard.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from "@playwright/test";
import { E2E_LEAD_TOKEN, E2E_LEAD_GROUP } from "./fixtures";
import { signInAsOrganizer, uniqueName } from "./helpers";

test("an invalid lead link is rejected", async ({ page }) => {
  await page.goto("/lead/not-a-real-token");
  await expect(page.getByText(/this link isn't valid/i)).toBeVisible();
});

test("a lead RSVPs a person and re-picks in place", async ({ page }) => {
  // Fresh seed: three blank Scouts, so the header starts at "Heard from 0 of 3".
  await page.goto(`/lead/${E2E_LEAD_TOKEN}`);
  await expect(page.getByRole("heading", { name: /heard from 0 of 3/i })).toBeVisible();

  const firstPerson = page.locator("main section ul > li").first();

  // Pick "Maybe": the person is now heard but stays on the chase list.
  await firstPerson.getByRole("button", { name: "Maybe" }).click();
  await expect(page.getByRole("heading", { name: /heard from 1 of 3/i })).toBeVisible();
  await expect(firstPerson.getByRole("button", { name: "Yes" })).toBeVisible();

  // Re-pick "Yes" on the same person: they drop off the list, and heard STAYS 1.
  // A duplicate RSVP would push heard to 2; it does not, proving replace-not-add.
  await firstPerson.getByRole("button", { name: "Yes" }).click();
  await expect(page.getByRole("heading", { name: /heard from 1 of 3/i })).toBeVisible();
  await expect(page.locator("main section ul > li")).toHaveCount(2);
});

test("the organizer chain mints a working lead link", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const group = uniqueName("Kitchen");
  await signInAsOrganizer(page);

  // Create an event to attach the roster and lead to.
  await page.getByLabel(/event name/i).fill(uniqueName("Chain Matsuri"));
  await page.getByLabel(/first day/i).fill("2026-08-01");
  await page.getByLabel(/last day/i).fill("2026-08-02");
  await page.getByRole("button", { name: /create event/i }).click();
  await expect(page.getByText(/draft — only organizers/i)).toBeVisible();

  // Import a one-person roster for a fresh group.
  await page.getByRole("button", { name: /import a roster|add a group|import/i }).first().click();
  await page.getByLabel("Group name").fill(group);
  await page.getByLabel("Roster rows").fill("Name\nHaruki Ito");
  await page.getByRole("button", { name: /^import$/i }).click();

  // Assign a lead to that group and copy the generated link.
  await page.getByLabel("Group", { exact: true }).fill(group);
  await page.getByLabel("Lead name").fill("Group Lead");
  await page.getByRole("button", { name: /assign lead/i }).click();
  await page.getByRole("button", { name: /copy link/i }).first().click();

  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toContain("/lead/");

  // The copied link renders that group's chase view.
  await page.goto(new URL(url).pathname);
  await expect(page.getByText(new RegExp(group, "i"))).toBeVisible();
});
```

Note on the import control: the LeadsPanel toggle wording may differ. If `Step 2` shows the import form does not open, read `components/organize/LeadsPanel.tsx`, match the real toggle button name, and update the locator. The core RSVP tests (the first two) do not depend on this and must pass regardless.

- [ ] **Step 2: Reseed and run the spec**

Run: `npm run db:seed && npx playwright test e2e/roster-rsvp.spec.ts`
Expected: 3 passed. If only the organizer-chain test fails, fix its locators per the note; the two core tests must pass.

- [ ] **Step 3: Verify types and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add e2e/roster-rsvp.spec.ts
git commit -m "test(e2e): roster RSVP round-trip, guard, and organizer link chain"
```

---

## Task 6: Extend the board spec

**Files:**
- Modify: `e2e/board.spec.ts`

**Interfaces:**
- Consumes: nothing new. Uses the seeded public board.

Behavior reference:
- A card's slot line reads "{filled} of {needed} filled".
- "Grab a frog" opens the claim form; the name input has label "Your name"; the submit button is "Add me".
- Submitting with an empty name returns "Please enter a name." and adds no claimant (`lib/domain/claim.ts`).

- [ ] **Step 1: Add the two tests**

Append to `e2e/board.spec.ts`:

```ts
test("a claim with an empty name is rejected", async ({ page }) => {
  await page.goto("/");
  const card = page.locator("article").filter({ has: page.getByRole("button", { name: /grab a frog/i }) }).first();
  await card.getByRole("button", { name: /grab a frog/i }).click();
  await card.getByRole("button", { name: /^add me$/i }).click();
  await expect(card.getByText(/please enter a name/i)).toBeVisible();
});

test("releasing a claim restores the slot's filled count", async ({ page }) => {
  await page.goto("/");
  const card = page.locator("article").filter({ has: page.getByRole("button", { name: /grab a frog/i }) }).first();

  const before = ((await card.getByText(/\d+ of \d+ filled/).textContent()) ?? "").trim();
  const filled = Number(before.match(/^(\d+) of/)?.[1]);
  const needed = before.match(/of (\d+) filled/)?.[1];

  await card.getByRole("button", { name: /grab a frog/i }).click();
  await card.getByLabel(/your name/i).fill("Count Invariant");
  await card.getByRole("button", { name: /^add me$/i }).click();
  await expect(card.getByText(`${filled + 1} of ${needed} filled`)).toBeVisible();

  await card.getByRole("button", { name: /remove count invariant/i }).click();
  await expect(card.getByText(`${filled} of ${needed} filled`)).toBeVisible();
});
```

- [ ] **Step 2: Reseed and run the spec**

Run: `npm run db:seed && npx playwright test e2e/board.spec.ts`
Expected: all board tests pass (the two originals plus the two new).

- [ ] **Step 3: Verify types and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add e2e/board.spec.ts
git commit -m "test(e2e): board empty-name guard and release-count invariant"
```

---

## Task 7: Full-suite verification

**Files:** none.

- [ ] **Step 1: Reseed and run the whole e2e suite**

Run: `npm run db:seed && npm run test:e2e`
Expected: all specs green.

- [ ] **Step 2: Final type and lint check**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Run the unit and DB suites to confirm the seed change broke nothing**

Run: `npm test && npm run test:db`
Expected: green (the seed change only adds fixture rows; `resetDb` still wipes the roster tables).

---

## Self-Review Notes

- **Spec coverage:** event lifecycle + delete (Task 3), RSVP round-trip + invariant + guard (Task 5), audit-history revert (Task 4), board claim/release guard + invariant (Task 6), deterministic fixture mitigation (Tasks 1-2). All spec sections map to a task.
- **RSVP behavior correction:** the spec described "yes then change to no", but the chase list drops yes/no people. The plan uses "maybe" as the still-visible intermediate, then "yes", asserting heard stays 1 (replace, not add). This matches the real UI and still proves the round-trip and the one-RSVP invariant.
- **Rerun safety:** every organizer test uses `uniqueName`; the RSVP core test relies on the freshly seeded fixture, consistent with CI and the existing specs.
