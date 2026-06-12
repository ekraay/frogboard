# Phase 2 — Organizer Grid: Design Spec

*2026-06-11. Builds on the Phase 1 spec (`2026-06-09-volunteer-frog-board-design.md`)
and the live app at https://frogboard.vercel.app.*

## Purpose

Let organizers set up an event's tasks in a **spreadsheet-style grid** that feels
native to people who live in Google Sheets, seeded by **pasting cells from their
existing sheets**, then make the event visible to volunteers with one **"Open
sign-ups"** action. One user (the organizer), one job (get the event ready),
one new surface (`/organize`).

Grounded in three real BCSF/community sheets (Ginza kitchen duties, crab-feed
roster, JCCCNC registration). All three have wildly different layouts; none are
clean tables. Conclusion: **the editable grid is the product; paste is a
forgiving accelerator, never a layout-aware importer.**

## Principles

- **Match the Sheets mental model.** Autosave (no Save button), type-anything
  cells, paste blocks, fill-down, drag to reorder. The grid looks like a sheet.
- **Trust the organizer** (Bungay/Kniberg). Freedom inside boundaries: within a
  day, *their* row order is the board's order; prose fields invite intent
  ("What is this about? Why is it important?") rather than instructions.
- **Undo beats confirm** (Raskin). Destructive acts get a 10-second undo toast;
  the one confirm dialog is deleting a task that already has signups.
- **Answer "who can see this right now?" at all times** — persistent status
  banner (Draft vs Live).
- **Edits never harm signups.** Updating a task keeps its claims; only explicit
  delete removes them, audit-logged.
- **Accessible by standard, verified by tooling** (see Accessibility).
- **Simplest thing that could possibly work** (Cunningham). Hand-rolled grid;
  no Airtable machinery (per-cell sync, views, formulas) without observed need.

## Access: shared password at `/organize`

- Unlisted route group `/organize`, not linked from the public board.
- One shared password in env var `ORGANIZER_PASSWORD` (set in Vercel).
- Sign-in page → server action does constant-time compare → signed, HTTP-only
  session cookie (~30 days). Sign-out clears it. A layout-level check guards
  everything under `/organize`.
- No per-person accounts (Phase 4). Audit log is the backstop; edits are
  attributed to "organizer".

## Event lifecycle: Draft → Sign-ups open

- `Event.status`: `draft` (default) | `published`.
- **Public board shows only published events.** (`getActiveEventBoard` gains a
  status filter; the Phase 1 seeded event is backfilled to `published`.)
- Button wording: **"Open sign-ups"** / **"Close sign-ups"** (the moment the
  organizer would have emailed the sheet link).
- Publish is a **visibility switch, not versioning**. After opening sign-ups,
  edits go live immediately — exactly like editing a shared Sheet. No
  republish step.
- Status banner pinned above the grid:
  - 🌱 *"Draft — only organizers can see this."*
  - 🏮 *"Live — volunteers see changes as you make them."*

## Data model changes (one migration)

- `Event.status` — enum `draft | published`, default `draft`; backfill existing.
- `Task.description` — `String?` (the "What is this about?" field).
- `Task.position` — `Int` (manual ordering; see Reordering).
- No new columns for `pointOfContact` / `definitionOfDone` — they exist.

**Timezone rule (fixes the Phase 1 charter finding).** Organizers type Pacific
wall-clock times next to a date. The server combines `date + startTime/endTime`
in `America/Los_Angeles` into stored UTC instants, and stores `date` as that
day's UTC midnight. Day-group headers and displayed times now derive from the
same row input, so they can never disagree.

## The grid

**Columns** (mental-model order):
drag-handle ⋮⋮ · Title · Kind (shift/frog) · Date · Need · Time · Category ·
Group · Location.

**Expanding row** for the three prose fields (click row or press Enter; Esc
closes). Full-width text boxes with question helper text:

| Field label | Helper text |
|---|---|
| Description | *What is this about? Why is it important?* |
| Definition of done | *What does done look like?* |
| Point of contact | *Who can help?* |

This mirrors the users' own sheets, which put descriptions on the line under
the task.

**Autosave per row** (the row is the unit of meaning — a task; a cell is half a
thought). On leaving a row (blur, debounced), one server action `saveTask`
upserts it and writes an `edit` AuditLog entry (eventId, taskId, before/after
snapshot). New rows get ids on first save. Status chip: *Saving… → Saved ✓*;
on failure, *Couldn't save — retry*, row highlighted, text preserved client-side.

**Forgiving cell parsers** (pure domain functions, dialects from the real sheets):
- Date: `Sat Jul 25`, `7/25`, `July 25` (event year inferred).
- Time: `8-11am`, `8:00 AM - 11:00 AM`, `10:30 AM- 2:00 PM` → start/end.
  For frogs: `by Sat 10am`, `by 3:00 PM` → due-by.
- Need: integer; blank → 1.
- An unparseable cell gets an amber underline **plus** an inline message (not
  color-only); the chip reads "1 row needs attention"; that row alone pauses
  saving. Other rows keep autosaving.

**Validation:** Title required for a row to save. Need cannot drop below the
current signup count (inline nudge: "3 already signed up").

**Row operations:** Add row · Duplicate row (one task → its sub-shifts) ·
Fill down · Delete (undo toast ~10s; confirm dialog only if the task has
signups, then audit-snapshot like Phase 1 release).

**Reordering:** drag the ⋮⋮ handle, or Alt+↑/↓ with the row focused. Saves
`position` like any row edit. **Board ordering rule:** day groups stay
(by date); *within* a day group, tasks sort by `position` — the organizer's
order is the priority order. The "No set date" group becomes a hand-ordered
backlog (top frog first). Implementation detail (plan, not spec): midpoint
positions, renumber when crowded.

## Paste

- Paste a rectangular block from any spreadsheet (clipboard TSV). Rows append
  at the paste point; cells map left-to-right from the target column, like a
  sheet.
- Two kindnesses, applied at paste time into real, editable cells:
  - **Blank dates carry forward** from the row above (the sheets' "Saturday,
    July 25 then blanks" convention).
  - **Time ranges split** into start/end (or due-by for frogs).
- Nothing layout-aware. Junk rows are one keystroke to delete (with undo).
- Framing in UI copy: **"Add your tasks — type or paste from your sheet."**
  Accelerator language; never "import".
- Volunteers/emails in pasted blocks are **not** imported as signups (v1).

## Screens

1. **Sign-in** (`/organize`): one labeled password field; plain error on
   mismatch; no lockout.
2. **Events list** (`/organize` after auth): events with status chips
   (🌱 Draft / 🏮 Sign-ups open), inline "New event" form (name, start date,
   end date), click through to the grid.
3. **Grid** (`/organize/[eventId]`): banner, chip, toolbar, grid, expanding
   rows, Open/Close sign-ups button.

Desktop-first (organizers work on laptops); functional at tablet width. The
public board remains the mobile-first surface.

## Accessibility (WCAG 2.1 AA, enforced)

Standards applied to all Phase 2 surfaces, and any violations found in Phase 1
components get fixed in passing:

- **Semantics:** the grid is honest table markup (`table/tr/td` with `<th scope>`
  headers) — not div soup; expanding rows use the disclosure pattern
  (`aria-expanded`, `aria-controls`). Every input has an accessible name
  (column header + row title context).
- **Keyboard complete:** Tab/Shift-Tab through cells, Enter expands, Esc
  closes, Alt+↑/↓ reorders (drag is an enhancement, never the only way).
  Visible focus ring (the Matsuri `--color-reed` outline at ≥3:1 contrast).
- **Live regions:** Saving/Saved chip is `aria-live="polite"`; the undo toast
  is `role="status"` with the Undo button keyboard-reachable; row-validation
  messages tied to inputs via `aria-describedby`.
- **Not color-only:** invalid cells pair the amber underline with an icon +
  text; status chips pair color with emoji + words.
- **Contrast:** all Matsuri-palette text/background pairs meet 4.5:1 (3:1 for
  large text); verify the lantern-orange and pond-teal tints during build.
- **Touch targets ≥44px** on interactive controls; `prefers-reduced-motion`
  respected (already a Phase 1 convention).
- **Enforcement:** `eslint-plugin-jsx-a11y` in the lint gate; `@axe-core/playwright`
  assertions in E2E for the sign-in, events list, grid, and public board pages.
  CI fails on violations.

## Error handling

- Wrong password: clear message, no lockout (trusted small group; audit log is
  the backstop).
- Save failure: text stays in the grid; retry on next blur; chip + row
  highlight communicate state.
- Concurrent organizers: last-write-wins per row; acceptable at this scale;
  all writes audit-logged.

## Out of scope (Phase 2)

- Kanban, table/roster view, report lenses, CSV export → **Phase 3** (the
  schema already carries `status`/`waiting`).
- Accounts, "My shifts", admin revert UI, QR codes → Phase 4.
- Importing volunteer names/emails as signups; live Google Sheets API sync;
  column-mapping wizard; per-cell realtime sync; views/filters/formulas;
  per-event timezone (still fixed `America/Los_Angeles`).

## Testing strategy (TDD throughout)

- **Pure domain first:** cell parsers (date, time-range, due-by, need),
  carry-forward, Pacific date+time→UTC combiner, position assignment.
- **Repository (`.db.test.ts`):** upsert preserves signups; need-below-signups
  rejected; delete writes audit snapshot; event create/status flip; board
  query filters to published.
- **Components:** row autosave on blur; paste appends parsed rows; undo
  restores; expanding row edits prose fields; keyboard reorder updates
  position; axe has no violations (vitest-axe where practical).
- **E2E:** sign in → create event → paste rows → reorder → open sign-ups →
  task appears on public board → close sign-ups → board hides it. Axe scan on
  each screen.

## Reversibility notes

- **Draft/published as enum** — two-way door; richer lifecycle states can be
  added later.
- **Shared password → accounts** — two-way door; the session-cookie gate swaps
  to a session from Auth.js without touching the grid.
- **`position` as int** — two-way door; renumbering strategy is internal.
- **Hand-rolled grid → library** — contained: the grid is one component tree
  behind the same server actions.
- **Parsers log generously** — paste/parse decisions are visible in cells
  immediately, so there is no hidden state to regret.
