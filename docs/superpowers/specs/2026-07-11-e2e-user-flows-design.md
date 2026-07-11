# E2E user-flow suite (Hendrickson style)

Date: 2026-07-11
Status: approved design, pending plan

## Goal

Validate the core user journeys through the app with Playwright: an organizer
creates, runs, and deletes an event; a group lead RSVPs a roster and changes an
answer; an organizer reverts a logged change; a volunteer claims and releases a
slot. Follow Elizabeth Hendrickson's exploratory rigor: each flow asserts a
round-trip returns to its prior state, checks a post-condition invariant, and
probes one guard (a rejected bad input).

## Current coverage

The `e2e/` suite already exercises:

- `board.spec.ts`: claim and release a slot; public-board a11y scan.
- `organize.spec.ts`: sign in, create an event, add a task, open sign-ups,
  reach the board, close sign-ups.
- `slug.spec.ts`: pretty-URL routing and facet filters.

Gaps this spec fills: **event delete**, the **roster RSVP round-trip**, and the
**audit-history Revert**. It also strengthens the board test with a guard and an
invariant.

## Approach

Stay black-box: drive the real UI, read the real DOM, never touch the database
from a test. One spec file per concern, matching the existing convention. A
shared `e2e/helpers.ts` removes login and create-event boilerplate.

Every test creates uniquely named events (a prefix plus a per-test suffix) and
cleans up after itself, so the suite is re-runnable and order-independent
against the shared seeded database. No test asserts on singleton root behavior
(for example "the root redirects to the only published event"), so cross-file
parallelism against one database stays safe.

## Risk mitigation: a deterministic RSVP fixture

The RSVP journey is the longest chain and the highest risk. Reaching
`/lead/[token]` purely through the UI means: import a roster, assign a lead,
copy the link from the clipboard, then RSVP. If any organizer-side step shifts,
the core RSVP assertions never run.

Mitigation: seed a deterministic fixture and split the coverage.

1. **Extend `prisma/seed.ts`** with a fixed roster for the seeded `ginza-2026`
   event:
   - three `Person` rows in group "Scouts" (`orgId: "org_bcsf"`, `name`,
     `group: "Scouts"`; `externalIdHash` stays null, so no hashing is needed);
   - one `Lead` for group "Scouts" on the seeded event with a **constant token**
     held in an exported const, `E2E_LEAD_TOKEN` (a fixed UUID).
   Tokens are opaque capability strings, not secrets (see
   `lib/security/tokens.ts`), so a fixed value is safe. Guard the fixture behind
   `process.env.NODE_ENV !== "production"` so it never seeds in production. CI
   already runs `npm run db:seed` before the e2e job, so the fixture reaches CI
   automatically.

2. **`roster-rsvp.spec.ts` targets the stable URL** `/lead/<E2E_LEAD_TOKEN>`
   directly for the round-trip, invariant, and guard. Short and robust: it does
   not depend on the organizer UI at all.

3. **A separate happy-path test** still exercises the organizer chain (import a
   roster, assign a lead, copy the link, read it from the clipboard). If that
   fragile path breaks, it fails in isolation and cannot take down the core RSVP
   assertions.

The round-trip test establishes its own starting state (pick "yes", assert,
then "no", assert the flip). It never assumes "no RSVP exists yet", so re-runs
against a reused dev database still pass.

## Files and test charters

### `e2e/helpers.ts` (new)

- `signInAsOrganizer(page)`: go to `/organize`, fill the password
  (`process.env.ORGANIZER_PASSWORD ?? "test-organizer-pw"`), submit.
- `createEvent(page, name)`: fill name and the two dates, submit, wait for the
  draft banner.
- `uniqueName(prefix)`: append a timestamp-and-counter suffix for isolation.

### `e2e/event-lifecycle.spec.ts` (new)

Flow: sign in, create an event, add a task, open sign-ups, close sign-ups,
archive, delete.

- **Round-trip**: after delete, the event is gone from `/organize` and its board
  URL returns 404.
- **Invariant**: archive removes the event from the organizer's active list and
  moves it under "Archived"; restore returns it to the active list.
- **Guard**: submitting the create form with a blank name is rejected (no event
  is created, the form reports the error).
- **Mechanics**: the Delete button fires `window.confirm`; register
  `page.on("dialog", d => d.accept())` before clicking. Delete lives inside the
  collapsed "Archived" `<details>`, so archive and expand first.

### `e2e/roster-rsvp.spec.ts` (new)

Flow (core): open `/lead/<E2E_LEAD_TOKEN>`, RSVP a person "Yes", then change to
"No".

- **Round-trip**: re-picking flips the recorded status and moves the
  yes/no/maybe counts with it.
- **Invariant**: re-picking replaces the person's answer rather than adding a
  second one (the counts stay internally consistent, no double-count).
- **Guard**: `/lead/not-a-real-token` shows "This link isn't valid".

Flow (organizer chain, separate test): sign in, import a roster, assign a lead,
click "Copy link", read the URL with `navigator.clipboard.readText()` (grant
`clipboard-read` and `clipboard-write`), then load that URL and confirm the lead
page renders the group.

### `e2e/history-revert.spec.ts` (new)

Flow: sign in, create an event, add a task, edit the task's title, open the
event history, click Revert.

- **Round-trip**: the title returns to its prior value and the edit no longer
  appears in the live grid.
- **Mechanics**: Revert fires `window.confirm`; accept the dialog as above.
- Clean up the created event at the end.

### `e2e/board.spec.ts` (extend)

Keep the existing claim/release round-trip and a11y scan. Add:

- **Guard**: clicking "Add me" with an empty name is rejected (no claimant is
  added).
- **Invariant**: releasing a claimed slot restores the card's remaining count to
  its pre-claim value.

## Key mechanics

- **Confirm dialogs**: Delete and Revert use `window.confirm`. In a Playwright
  test, register `page.on("dialog", d => d.accept())` before the click. The MCP
  browser-dialog caveat does not apply to test files.
- **Reading the lead token in the organizer chain test**: grant clipboard
  permissions, click "Copy link", read `navigator.clipboard.readText()`. Stays
  black-box.
- **Isolation**: unique event names per test; each lifecycle and history test
  deletes or archives its own event; no assertions on singleton root behavior.

## Risks

- **RSVP chain fragility**: mitigated by the deterministic fixture and the
  split above.
- **Clipboard read flakiness** in the organizer-chain test: it is the only test
  that reads the clipboard, so any flake is isolated and never blocks the core
  RSVP round-trip.
- **Shared-database contention** under parallel workers: mitigated by unique
  names and order-independent assertions.

## Out of scope

- Load or performance testing.
- Cross-browser runs (Chromium only, matching CI).
- New product behavior. This suite tests existing behavior only.

## Verification

- `npm run test:e2e` green locally and in CI.
- `npx tsc --noEmit` and `npm run lint` clean for the new files and the seed
  change.
- The seed fixture appears only when `NODE_ENV` is not production.
