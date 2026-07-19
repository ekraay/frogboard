# Archive ongoing boards

Date: 2026-07-18
Status: approved

## Problem

Dated events on /organize have an Archive button, a collapsed "Archived (n)"
section, Restore, and Delete. Ongoing (standing) boards have none of these. The
organizer has four retired temple boards that clutter the Ongoing boards list
and the public garden home with no way to put them away.

## Decision summary

- Give ongoing boards the same archive lifecycle dated events already have.
- Extract the shared controls into one component so both lists stay DRY.
- Archived boards keep their data; Delete stays the only destructive step.
- Public link of an archived board returns the not-found page. This already
  works: `getEventBoardByParam` and `listPublishedStandingBoards` filter on
  `status: "published"`.

## What already exists (no changes needed)

- `EventStatus` enum already has `archived`; standing boards are Event rows.
- `setEventStatus` and `deleteEvent` in `lib/repository/organize.ts` operate on
  any Event row, standing or dated.
- Server actions `setEventStatusAction` and `deleteEventAction` wrap them.
- Public read queries exclude non-published boards, so archiving removes a
  board from the garden home and 404s its public URL with no public-side work.
  Writes are a different story; see Out of scope.
- `listStandingBoards` returns all statuses; the UI splits, as `EventList`
  does today.

## Design

### New shared component: `components/organize/ArchiveControls.tsx` (client)

Two exports, each owning its own `useTransition` and `router.refresh()`:

- `ArchiveButton({ id, name })`: the per-row "Archive" button. Calls
  `setEventStatusAction(id, "archived")`. Styling and `aria-label`
  (`Archive <name>`) lifted verbatim from `EventList`.
- `ArchivedSection({ items })`: the collapsed `<details>` block titled
  "Archived (n)". Each row shows the item name with two buttons:
  - Restore: `setEventStatusAction(id, "draft")`. Restore goes to draft so
    the organizer republishes deliberately.
  - Delete: `window.confirm` with the existing wording, then
    `deleteEventAction(id)`.
  `items` is `{ id, name }[]`. Renders nothing when empty.

Transition granularity, pinned: each `ArchiveButton` owns one transition; each
`ArchivedSection` row owns one transition shared by its Restore and Delete
pair, so the two can never race on the same row. This deliberately changes
today's `EventList` behavior, where one shared transition disables every
button on the page during any action. Per-row pending is the intent: archiving
one board leaves the others clickable.

### `EventList` (refactor)

Drops its inline archive JSX and transition plumbing in favor of
`ArchiveButton` and `ArchivedSection`. With the client bits pushed into the
controls, `EventList` becomes a server component that filters events into
active and archived and renders rows. Visual output stays identical; the only
behavior change is the per-row pending state described above.

### `StandingBoardList` (feature)

Stays a server component. Splits boards into active and archived:

- Active rows keep the workspace link, task count, Live/Draft pill, and the
  "View board" link, and gain an `ArchiveButton`.
- Archived boards render through `ArchivedSection` below the active list.
- The list currently returns null when empty; keep that behavior keyed on the
  full list, so an all-archived list still shows the Archived section.
- When every board is archived, render "All ongoing boards are archived."
  where the active rows would be, paralleling EventList's empty-state line.

Known risk, accepted: Archive is a one-tap, unconfirmed action beside the row
link, and a standing board is usually live when archived. A stray tap 404s
every bookmarked volunteer URL until the organizer restores and republishes
(restore alone lands in draft). Dated events share this exact asymmetry;
consistency wins for now. If it bites, add a confirm to Archive in both lists.

### Out of scope

- No unified archived section across events and boards.
- No read-only or "retired" public view.
- No data migration: the four temple boards get archived through the UI in
  prod once this ships.
- `/organize/[eventId]` stays reachable for archived boards, matching archived
  events today.
- Closing writes on archived boards. `createSignupWithAudit` and
  `deleteSignupWithAudit` never check event status, so a volunteer who loaded
  the board before archiving can still claim or release afterward. Archiving
  closes reads, not writes. Archived dated events share this gap; fixing it is
  a separate change across both board kinds.

## Error handling

Unchanged from the existing event flow: actions return false when the row is
gone; the refresh re-renders the true state. Delete keeps its confirm dialog.

## Testing (TDD)

- New `ArchiveControls.test.tsx`: ArchiveButton calls the status action with
  "archived"; ArchivedSection renders count, Restore calls the action with
  "draft", Delete asks for confirmation and calls delete only on accept;
  renders nothing when empty.
- `StandingBoardList.test.tsx` (extend the existing file): splits active from
  archived, active rows get an Archive button, archived boards appear in the
  Archived section, all-archived list still renders with the empty-state line.
  The existing tests (workspace link, renders nothing when the full list is
  empty, slug-less board) keep passing under the keyed-on-full-list rule.
- `EventList.test.tsx`: existing assertions keep passing after the refactor.
- Repo layer already covered: `setEventStatus` and `deleteEvent` have db tests.
