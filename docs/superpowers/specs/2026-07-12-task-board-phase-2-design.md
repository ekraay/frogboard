# Task Board redesign, Phase 2: filter flyout and shareable links

## Context

Phase 1 shipped the volunteer board at `/b/[slug]`: tasks split into Available
and Claimed, a claim/detail panel, and card deep-linking. This phase adds the
board's controls, reshaped by a real need the organizer raised: **hand a group
its own signup link.** "Give Scouts their link" should mean filter to Scouts,
copy the URL, done.

The epic once framed Phase 2 as a column-grouping engine plus a legend. The
brainstorm on 2026-07-12 replaced that: the actual need is filtering that any
filtered view can be shared as a permanent link, in a fast Trello-style flyout.
Column grouping is deferred; the Available/Claimed columns stay.

Source every color and font from the existing `@theme` tokens in
`app/globals.css`, keeping the "Matsuri at Dusk" identity. The board is
mobile-first.

## Decisions locked (brainstorming, 2026-07-12)

- **Filter flyout, not a segmented control.** Filtering is multi-dimensional and
  multi-select (group AND category AND day, several values each). A segmented
  control expresses only one single-choice axis, so it cannot carry this. A
  flyout also keeps the phone-first board clean and opens on demand.
- **Availability drops out of the filter.** The two columns already split
  Available from Claimed, so a filter for it is redundant.
- **Hidden filters need a visible signal.** When any filter is applied, an
  always-visible chip bar shows the active filters as removable chips with a
  "Show all tasks" clear. The Filter button carries a count badge.
- **Permanent shareable links.** Filter state lives in the query string, so any
  filtered view is a copy-and-send link. This is the group-link mechanism.
- **Greatest need is derived, not curated.** A single derived badge marks the
  task in view that needs attention most, computed without a new field. Manual
  "star one task" is deferred to Phase 6. **Open:** whether that signal is "most
  urgent" (soonest deadline) or "biggest gap" (largest unfilled need), and whether
  the two ship as one badge or as two separate filters, awaits a human call. See
  [Open decisions](#open-decisions).
- **Grouping engine deferred.** Reshaping columns by Day/Category/etc. waits for
  a later phase. No schema change in Phase 2.

## Goal

On the volunteer board, a **Filter** button opens a flyout to narrow tasks by
keyword, requested group, category, location, day, and "due soon." Filtering is
instant (client-side) and its state rides in the URL, so a filtered view is a
permanent link an organizer hands to a group. When any filter is active, a chip
bar shows what is applied and clears it in one tap. A derived badge marks the
task needing attention most and sits it first in its column. Its exact meaning,
"most urgent" versus "biggest gap," is an open decision (below).

## Architecture

The page parses the query into initial filters and passes them, with the full
task list and a server-stamped clock, to the client board. Filtering runs
client-side over data already in the browser, so it is instant; the client
mirrors filter state back into the URL for sharing. The server hands the client
one `nowMs`, so the SSR pass and hydration read the same instant and the
time-relative badge never mismatches. Filters use the query string, sharing the
`date` key with the legacy `/[slug]` board; the Phase 1 panel keeps using the
hash, so the two coexist.

```
app/b/[slug]/page.tsx  (server)
  -> parseBoardFilters(searchParams)          // lib/domain/boardFilters.ts (pure)
  -> getEventBoardByParam(slug)               // reused, unchanged
  -> nowMs = Date.now()                        // server clock, handed to the client
  -> <TaskBoard tasks initialFilters nowMs ... />   // client
       -> now = new Date(nowMs)                     // one clock: SSR and hydration agree
       -> applyBoardFilters(tasks, filters, now)   // lib/domain/boardFilters.ts (pure)
       -> mostNeededId(visibleTasks, now)          // lib/domain/boardFilters.ts (pure)
       -> partitionByAvailability(visible)         // Phase 1, reused
       -> <FilterFlyout facets value onChange/>     // opens from the Filter button
       -> <ActiveFilterBar value onRemove onClear/> // shown only when active
       -> <BoardCard needsMostHelp .../>            // badge on the most-needed task
       -> filtersToQuery(filters) -> history.replaceState  // URL sync + Copy link
```

## Components and units

### `lib/domain/boardFilters.ts` (new, pure)

The multi-select filter model and every rule over it, in one pure, DOM-free unit.
This board keeps its own richer model on purpose: the legacy `/[slug]` board stays
on the single-select `filterTasks(Facets)`, and Phase 2 does not unify the two.
What they share is the low-level primitives. `fieldEq` (matching), `tzIsoDate`
(calendar day), and `facetOptions` (option lists) live once in `board.ts`, so
match, date, and option rules never fork.

- **Model.**
  ```ts
  interface BoardFilters {
    keyword: string;     // "" means no keyword
    group: string[];     // requestedGroup values (OR within)
    category: string[];
    location: string[];
    date: string[];      // ISO calendar days (YYYY-MM-DD), query key `date`
    dueSoon: boolean;
  }
  ```
- `emptyFilters(): BoardFilters` and `hasAnyFilter(f): boolean`.
- `applyBoardFilters(tasks, f, now: Date): BoardTask[]`.
  - AND across sections, OR within a multi-select section.
  - `keyword`: case-insensitive substring of `title`.
  - `group`/`category`/`location`: trimmed, case-insensitive match on the task's
    `requestedGroup`/`category`/`location` (reuse the existing `fieldEq` from
    `board.ts`; export it, no behavior change). Internal spaces are significant,
    so values match as stored.
  - `date`: `tzIsoDate(task.date)` is in `f.date` (reuse `tzIsoDate`; export it).
  - `dueSoon`: `isDueSoon(task, now)`.
  - `now` is passed in, never read from the clock inside, so tests are
    deterministic.
- `effectiveWhen(task): Date | null` = `task.dueBy ?? task.date`. The urgency
  date: a frog's deadline, else its calendar day, else none (standing/undated).
- `isDueSoon(task, now): boolean`: `effectiveWhen(task)` exists and its calendar
  day is at or before the calendar day three days after `now`. Compare on ISO day
  strings, `tzIsoDate(effectiveWhen) <= tzIsoDate(now + 3 days)`, so the window is
  a whole-day count, not a wall-clock instant, and the boundary is deterministic.
  Days use the same UTC calendar basis as the rest of the board (`tzIsoDate`), so
  a `dueBy` timestamp counts by its calendar day. Overdue (any earlier day) counts
  as due soon.
- `mostNeededId(tasks, now): string | null` = the id of the top not-full task by
  this total order, or null when none is available:
  1. dated before undated (`effectiveWhen` present first),
  2. earlier `effectiveWhen` first,
  3. larger unfilled gap (`neededCount - signups.length`) first,
  4. lower `position` first.
- `parseBoardFilters(searchParams): BoardFilters` and `filtersToQuery(f):
  string`. Each multi-select section serializes as a repeated key, never a
  comma-joined value, so a value that itself contains a comma (a category like
  "Food, Drink") round-trips intact: `group=Scouts&group=Parents`, under keys
  `group`, `category`, `location`, and `date` (the `date` key matches the legacy
  `/[slug]` board). `keyword` is a string; `dueSoon` is `due=soon`. `parse`
  accepts Next's `string | string[]` for every key. Round-trip stable: within a
  section, emit values in the order received, so `parse(toQuery(f))` equals `f`.
  Unknown or empty keys are ignored, parsing never throws, and
  `filtersToQuery(emptyFilters())` is `""`.

### `lib/domain/board.ts` (touch)

- Export the existing `fieldEq` and `tzIsoDate` (today private) so
  `boardFilters.ts` reuses them instead of re-implementing the match and date
  rules. No behavior change.

### `components/board/FilterFlyout.tsx` (new, client)

- A panel that opens from the Filter button (overlay on mobile, anchored popover
  on wider screens; both use the same content). Themed to the board.
- Sections, each rendered only when the event has values for it (from
  `facetOptions`, reused): **Keyword** (text input), **Requested group**,
  **Category**, **Location**, **Day** (checkbox lists, multi-select), and a
  **Due soon** toggle (shown only when some task has an `effectiveWhen`).
- Props: `{ facets: FacetOptions; showDueSoon: boolean; value: BoardFilters;
  onChange(next): void; onClose(): void }`. Controlled: it renders `value` and
  reports changes; it holds no filter state of its own. `showDueSoon` is derived
  by the board (any task has an `effectiveWhen`), since a frog's deadline can
  exist without a calendar day and so is not captured by `facets.date`.
- Accessible: labelled dialog, focusable, Esc and backdrop close, each control
  labelled. A "Show all tasks" clear-all sits in the flyout footer too.

### `components/board/ActiveFilterBar.tsx` (new, client)

- Shown only when `hasAnyFilter(value)`. A slim row under the header of removable
  chips, one per active value (e.g. `👥 Scouts ✕`, `🏷️ Food ✕`, `📅 Sat Jul 25 ✕`,
  `⏰ Due soon ✕`, `"cups" ✕`), plus a **Show all tasks** button that clears all.
- Props: `{ value: BoardFilters; facets: FacetOptions; onRemove(section,
  item?): void; onClear(): void }`. Removing the keyword clears it; removing a
  multi-select chip drops that one value. `facets` supplies the friendly day
  label (ISO to "Sat Jul 25"); group/category/location chips show the raw value.
  When a filtered day is no longer in `facets` (its tasks are gone), the chip
  falls back to the raw ISO day so it still clears, matching the legacy board.
- Doubles as context for a shared group link: opening `?group=Scouts` shows the
  `👥 Scouts` chip, so a volunteer sees "you're viewing Scouts' tasks."

### `components/board/BoardCard.tsx` (touch)

- New optional prop `needsMostHelp?: boolean`. When true, render a small badge in
  the card header. The label is provisional, pending the open decision below
  ("⭐ Most urgent" or "⭐ Biggest gap"). Purely presentational; the ranking lives
  in the domain. No other card change.

### `components/board/TaskBoard.tsx` (touch)

- New props `initialFilters: BoardFilters` and `nowMs: number` (the server
  clock). New state `filters` seeded from `initialFilters`, and `flyoutOpen:
  boolean`. Build `const now = new Date(nowMs)` once and pass it to both domain
  calls, so SSR and hydration read the same instant and the badge never flickers
  or triggers a hydration mismatch.
- Controls row above the columns: a **Filter** button showing an active-value
  count badge, and (reused) the organizer copy-link. The button opens
  `FilterFlyout`; `ActiveFilterBar` renders under the header when filters are
  active.
- `const visible = applyBoardFilters(tasks, filters, now)`. Partition `visible`
  into the two columns as in Phase 1. `const mostId = mostNeededId(visible,
  now)`; in the Available column, render that task first with `needsMostHelp`,
  then the rest in position order.
- On every filter change, `history.replaceState` to
  `pathname + (filtersToQuery(next) ? "?" + query : "")`, preserving any
  `#task-<id>` hash. No page reload, no server round-trip.
- Copy-link copies `origin + pathname + "?" + filtersToQuery(filters)` (falling
  back to `origin + pathname` when no filter), so the organizer copies the
  current filtered link. The panel Share keeps copying the card's hash link.
- Empty result: when `visible` is empty, both columns show their zero state and
  a friendly "No tasks match. Show all tasks." with a clear-all.

### `app/b/[slug]/page.tsx` (touch)

- Accept `searchParams`, `const initialFilters = parseBoardFilters(await
  searchParams)`, read `const nowMs = Date.now()`, and pass both to `TaskBoard`.
  The page is already `dynamic = "force-dynamic"`, so the server renders the
  filtered board with one clock and hands that same `nowMs` to the client. A
  shared link renders already-filtered on first paint, no flash and no hydration
  mismatch. Everything else (flag, session, reused repository read) is unchanged.

## Filter semantics

- OR within a section, AND across sections, matching Trello.
- `keyword` matches the task title, case-insensitive substring.
- `group`/`category`/`location` match the task's field trimmed and
  case-insensitively; internal spaces are significant.
- `date` matches the task's calendar day (query key `date`, shared with
  `/[slug]`).
- `dueSoon` keeps tasks whose deadline or day falls on or before the calendar day
  three days out, counted in whole days, including overdue.

## Data model

No schema change. `boardFilters.ts` is pure over `BoardTask` plus a passed `now`.
Reads still reuse `getEventBoardByParam`. The manual "star one task" field is
deferred to Phase 6.

## Rollout

Same route, same flag (already on in production). No new flag. The controls ship
to the live board. `/[slug]` and `/organize` stay unchanged.

## Open decisions

- **The derived badge: "most urgent" vs "biggest gap."** `mostNeededId` orders by
  deadline first, then unfilled gap, so a nearly-covered task due tomorrow
  outranks a wide-open task due next week. The phrase "needs the most help" reads
  as coverage gap, which the ranking does not lead with. These are two distinct
  signals. A human should decide whether the board surfaces "most urgent" (soonest
  deadline), "biggest gap" (largest unfilled need), or both, and whether they ship
  as one badge or as two separate filters in the flyout. Until then the badge
  label and `mostNeededId`'s tie-order stay provisional. Keep the domain function
  and its tests structured so either ranking, or a split into two, is a small
  change.

## Error handling and edge cases

- Unknown or malformed query values are ignored; parsing never throws.
- A filter value no longer present on any task simply matches nothing; its chip
  still shows so the user can clear it.
- No available task (all full or none match) means no derived badge.
- A standing board (undated tasks) hides the Day and Due soon sections, since
  neither has values.
- Filtering to an empty set renders the empty state with a clear-all, never a
  crash.

## Testing (strict TDD)

- **Unit (jsdom):**
  - `applyBoardFilters`: each dimension in isolation; OR within a section; AND
    across sections; keyword substring and case-insensitivity; group/category/
    location match trimmed and case-insensitive with internal spaces significant;
    `dueSoon` boundary at exactly three calendar days (now+3 is due soon, now+4 is
    not) and an overdue task; empty filters return all.
  - `isDueSoon` / `effectiveWhen`: deadline vs day precedence; undated returns
    null and is never due soon; the three-calendar-day boundary; a `dueBy`
    timestamp counts by its calendar day.
  - `mostNeededId`: nearest deadline wins; gap breaks a deadline tie; undated
    ranks last; a full task is skipped; all-full or empty returns null.
  - `parseBoardFilters` / `filtersToQuery`: round-trip for multi-select, keyword,
    and `due=soon`; a value containing a comma survives (repeated keys, not
    comma-join); `parse` accepts `string | string[]`; empty filters serialize to
    `""`; unknown keys ignored.
  - `FilterFlyout`: toggling a value calls `onChange` with it added/removed; the
    keyword input reports changes; a section with no values does not render; Esc
    and backdrop close; clear-all resets.
  - `ActiveFilterBar`: renders one chip per active value; hidden when no filter;
    removing a chip drops just that value; "Show all tasks" clears all.
  - `BoardCard`: the badge shows when `needsMostHelp` and not otherwise.
  - `TaskBoard`: applying a filter narrows the columns; the Filter button count
    reflects active values; a filter change updates the URL query (assert
    against a stubbed `history`); the most-needed task renders first in Available
    with the badge; copy-link includes the active query; a fixed `nowMs` yields
    the same badge and visible set on SSR and after hydration.
- **DB (`*.db.test.ts`):** none new. No repository change.
- **e2e (`e2e/task-board.spec.ts`, extend):** open `/b/<slug>?group=<value>` and
  see only that group's tasks with the group chip present; set a filter in the
  flyout and watch the URL update; copy-link yields the filtered URL; axe reports
  zero WCAG A/AA violations with the flyout open.
- **Gates before done:** `npm test`, `npm run test:db`, `npx tsc --noEmit`,
  `npm run lint`, and the e2e all green.

## Out of scope (deferred)

Column-grouping engine (reshape columns by Day/Category/Group/Location);
manual "star one task" spotlight (Phase 6, needs a task field and an organizer
control); an Availability filter (the columns already split it); a Members
filter (no member model); keyword beyond the title; relative due buckets beyond
a single "due soon"; saved or named filter presets; flipping `/[slug]`.
