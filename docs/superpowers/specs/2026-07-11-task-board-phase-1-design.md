# Task Board redesign, Phase 1: volunteer-first Availability board

## Context

A Claude-designed handoff (`~/Downloads/design_handoff_task_board`) reimagines the
Frog Board as one role-aware surface with four views (Board, Calendar, List,
Timeline), a detail panel, drag-and-drop, comments, and new task fields. That is
an epic, not a single change. This spec covers only the first slice. The rest is
decomposed below and deferred.

The design is high-fidelity and final on look. Source every color and font from
the existing `@theme` tokens in `app/globals.css`, keeping the "Matsuri at Dusk"
identity.

## Decisions locked (brainstorming, 2026-07-11)

- **Keep the `/organize` grid.** The new board is the primary view/claim surface;
  the grid stays as the bulk create/edit/paste tool. Retire it later, only once
  the board covers bulk entry.
- **New route first, flip when ready.** Build at a new route so `/[slug]` and
  `/organize` keep serving live events unchanged. Flip `/[slug]` to the new
  surface later, when proven.
- **Role is auth, not a toggle.** The prototype's "Viewing as" switch was a demo
  convenience. In production, role is derived from the session: a public visitor
  is a volunteer, an authenticated organizer sees more. No client `role` state,
  no toggle. (Removes a footgun and simplifies state.)
- **Volunteer-first MVP.** The first slice ships the volunteer claim/browse
  experience. Organizer editing stays in the grid for now.
- **Status is deferred.** The board defaults to Availability grouping (Available
  vs Claimed), which needs no statuses. The fixed Backlog/Next/In process/Waiting/
  Done columns appear only under Status grouping, a later phase. The user is
  unsure about fixed statuses and prefers a Trello-style agnostic model; that
  decision moves to the Status-grouping phase. Logged as a backlog card.

## Epic decomposition (for reference; only Phase 1 is specced here)

- **Phase 1 (this spec):** new route, flag-gated, Board view, Availability
  grouping, cards, claim CTA, an overlay detail panel (claim block + read-only
  details), and card deep-linking via the URL hash + a Share button. Essentially
  no schema change.
- **Phase 2:** grouping engine (Status, Category, Group, Location, Day) + legend.
  Carries the "fixed statuses vs Trello-style custom columns" decision.
- **Phase 3:** drag-and-drop (set the grouped field on drop; move actions).
- **Phase 4:** alternate views (List, Calendar with the Bon Dance key event,
  Timeline).
- **Phase 5:** comments (a `Comment` model, thread UI, post action).
- **Phase 6:** organizer in-panel editing + "+ Add task", complete + archive, a
  real per-task route (Phase 1 deep-links via the URL hash), keyboard **E**,
  key-event config.

## Goal

At a new, flag-gated route, a volunteer sees the event's tasks as cards split
into **Available** (still needs people) and **Claimed** (full), and can claim a
task through a detail panel, all in the new high-fidelity look. Organizers see
the same board plus the copy-public-link control and the Live/archived counts.
Nothing about `/[slug]` or `/organize` changes.

## Architecture

A new server route renders a new client board component. Reads reuse the existing
`getEventBoardByParam` repository function unchanged; the only write is claiming,
which reuses the existing `claimSlot` action. That action already runs
`revalidatePath("/")`, but the board updates on the client through
`router.refresh()` inside the reused claim form, exactly as `/[slug]` does today.

```
app/b/[slug]/page.tsx  (server)
  -> flagEnabled("task_board", { param })      // env + preview query flag; notFound() when off
  -> getEventBoardByParam(slug)                // lib/repository/events.ts, reused as-is
  -> isOrganizer from session                  // reuse isValidSession/SESSION_COOKIE
  -> <TaskBoard event tasks isOrganizer />     // client
       -> partitionByAvailability(tasks)       // lib/domain/board.ts, built on getSlotInfo
       -> <BoardCard/> per task
       -> opens <TaskPanel/> (overlay) via openId + URL hash #task-<id>
            -> claim block + read-only details + Share
            -> claimSlot action (via the reused claim form)
```

## Components and units

### `lib/flags.ts` (new)
- `flagEnabled(name: string, opts: { cookies: { get(name: string): { value: string } | undefined } }): boolean`.
- True when env `FLAG_<NAME_UPPER>` is a truthy value (`"1"`/`"true"`), OR the
  request carries the preview cookie `ff_<name>` set to `"1"`. Default off in
  production, on in development (`NODE_ENV !== "production"`).
- Pure over its inputs (env + the passed cookies accessor); no global state. The
  `cookies` param is structurally satisfied by Next's `ReadonlyRequestCookies`,
  and a `{ get }` stub in tests.
- **Preview opt-in.** Cookies can only be written from a Route Handler or Server
  Action in this Next version, not during a page render. So persistence uses a
  tiny Route Handler `app/b/[slug]/preview/route.ts`: `GET .../preview?on=1`
  sets `ff_task_board=1` (and `?on=0` clears it), then redirects to
  `/b/<slug>`. The organizer visits that link once to opt their session in.
  The page render only reads cookies, never writes them. (Confirm the cookie and
  redirect APIs against `node_modules/next/dist/docs/` when implementing.)

### `lib/domain/board.ts` (extend, pure)
- Add `partitionByAvailability(tasks: BoardTask[]): { available: BoardTask[]; claimed: BoardTask[] }`
  next to the existing `getSlotInfo`/`coverageFor` it builds on.
- Available = `!getSlotInfo(t).isFull`; Claimed = `getSlotInfo(t).isFull`. Reuse
  `getSlotInfo` so the fill rule lives in one place; do not re-inline the
  `signups.length` vs `neededCount` comparison.
- Order within each bucket preserves the incoming order (already position-sorted).

### Reads reuse `getEventBoardByParam` (no new repository function)
- `getEventBoardByParam(param)` (`lib/repository/events.ts`) already resolves a
  **published** event by slug or id scoped to `org_bcsf`, runs tasks through
  `toBoardTasks` (so `boardDisplayName` abbreviates minors and no raw minor flag
  leaks), and returns `{ id, name, standing, tasks }`. The board needs nothing
  more, so call it directly and add no clone. Links derive from
  `window.location`, so the board never needs `slug` in the data.
- It returns null when the event is missing or unpublished; the route
  `notFound()`s. Its existing DB tests already cover scoping and minor safety.

### `app/b/[slug]/page.tsx` (new, server component)
- `export const dynamic = "force-dynamic"` (per-request session + flag).
- Read cookies once (read-only; the preview cookie is set by the `preview` Route
  Handler below, not here).
- If `!flagEnabled("task_board", { cookies })` -> `notFound()`.
- `const board = await getEventBoardByParam(slug); if (!board) notFound();`
- `const isOrganizer = isValidSession((await cookies()).get(SESSION_COOKIE)?.value)`.
- Render `<TaskBoard event={board} tasks={board.tasks} isOrganizer={isOrganizer} />`.

### `components/board/TaskBoard.tsx` (new, client)
- Props: `{ event: { name: string }, tasks: BoardTask[], isOrganizer: boolean }`.
  The header reads only `name`; do not thread `id`/`slug`/`standing` the board
  never renders. Links come from `window.location`, tasks carry their own ids,
  and Availability grouping is date-agnostic, so none are needed this phase.
- State: `openId: string | null`.
- Header: 🐸 + event name (display serif) + a muted subline ("Grab a task to help
  out"). For organizers only: a "🔗 Copy public link" button and a "Live · N
  tasks" pill (append "· N archived" only once archiving exists; omit for now).
- Body: the two Availability columns (Available accent lantern `#e25325`, Claimed
  accent reed `#0e5e36`) via `partitionByAvailability`. Each column: dot + uppercase
  label + count pill, then the cards.
- No controls row this phase (the view switcher and group-by are inert without
  other views/groupings; they arrive in Phase 2/4).
- **Deep-linking (in scope).** `openId` mirrors the URL hash `#task-<id>`:
  - On mount, read `window.location.hash`; if it names a task on this board, open
    that panel. Also listen for `hashchange` (back/forward).
  - Opening a card sets the hash to `#task-<id>`; closing clears it (back to no
    fragment). A hash for an unknown id opens nothing.
  - This is client-only (a fragment never hits the server), so no route is
    needed. A real per-task route is a later option.
- **Links derive from `window.location`**, never hardcoded, so they stay correct
  at whatever path the board is mounted (today `/b/<slug>`, `/<slug>` after the
  flip):
  - Copy-public-link copies `origin + pathname` and flips to "Copied ✓".
  - The panel's Share copies `origin + pathname + "#task-<id>"`.
  - Caveat during dark launch: a shared `/b/<slug>...` link resolves only for
    sessions with the flag on; it becomes publicly usable once the flag opens.

### `components/board/BoardCard.tsx` (new, client)
- Deliberately parallels the existing `components/TaskCard.tsx` (which embeds the
  claim form on the current board). `BoardCard` is its high-fidelity successor;
  the two coexist during the dark launch and `BoardCard` replaces `TaskCard` when
  `/[slug]` flips. Keeping both is intentional, not a duplication to fold now.
- The new card look from the handoff section 6, minus the deferred bits: header
  (kind tag), coverage pill (Covered / "N of M"), title (display serif), time
  label, meta chips (category 🏷️, location 📍), coverage bar (fill = filled/needed
  in the column accent), footer avatars ("No one yet" when empty) + requested
  group chip, and the full-width claim CTA on any not-full task.
- Claim CTA label: `neededCount >= 2` -> "👥 Grab with a friend"; else frog ->
  "🐸 Grab a frog", shift -> "🎐 Claim a spot".
- No complete checkbox this phase (deferred to Phase 6). The card is not
  draggable yet.
- Clicking the card or the CTA opens the panel.

### `components/board/TaskPanel.tsx` (new, client)
- Overlay (fixed, blur backdrop, click backdrop to close, Esc to close) + panel
  (white, rounded, a status-accent bar on top, using the column accent for now).
  This overlay is in scope for Phase 1.
- Header: kind tag (read-only) + a "🔗 Share" button (copies
  `origin + pathname + "#task-<id>"`, flips to "Copied ✓") + close ×.
- Title: read-only display-serif heading.
- **Claim block** (shown when not full): reuses the claim semantics without
  inheriting `ClaimForm`'s collapsed-button presentation. Today `ClaimForm`
  (`components/ClaimForm.tsx`) is a button labeled "🐸 Grab a frog" that expands
  into the fields on click, so dropping it in whole would put a second frog
  button inside the panel and ignore the per-kind CTA labels. Instead, extract
  the form body into a shared `ClaimFields` unit: the honeypot, name, group,
  email, phone, under-18 checkbox, submit, `claimSlot` call, `rememberClaim` /
  `rememberProfile`, and `router.refresh()`. `ClaimForm` becomes a thin wrapper
  (button + `open` state) around `ClaimFields` so the current board is unchanged;
  the panel renders `ClaimFields` directly, already open, in a reed-tinted
  container. Claim semantics live in one place and never diverge. Around it the
  panel adds the copy: "{Grab this frog | Claim a spot}, no account needed, just
  add your name," and for `neededCount >= 2` with open spots the nudge "👥 More
  fun in a pair, grab it with a friend." `router.refresh()` inside `ClaimFields`
  re-fetches the server data (the action's `revalidatePath("/")` alone does not
  cover this route), so on success coverage advances, the task re-buckets from
  Available to Claimed, and the block is replaced by "🐸 All set, this one's
  covered."
- **Details** (read-only grid): When (the existing time label), Location (📍),
  Category (🏷️), Requested group (👥); plus Definition of done, Description, and
  Point of contact when present.

## Data model

No schema change in Phase 1. `lib/flags.ts` reads env + a cookie. Reads reuse
`getEventBoardByParam` over existing `Event`/`Task`/`Signup`. The `--color-tatami` token and the
`backlog`/`completed`/`archived`/`Comment` additions are deferred to the phases
that need them.

## Rollout

- Route is dark by default (`FLAG_TASK_BOARD` unset in production). Preview via
  `/b/<slug>/preview?on=1` (the Route Handler sets the cookie, then redirects to
  the board), which lets the organizer test in real production without exposing
  it broadly.
- Add `"b"` to `RESERVED_SLUGS` so no event can take that slug and shadow the
  route.
- Open publicly later by setting `FLAG_TASK_BOARD=1`. Flip `/[slug]` to the new
  surface in a later, separate change.

## Error handling and edge cases

- Missing/unpublished event or flag off -> `notFound()`.
- A standing board (no dates) works: the card's time label already handles
  undated frogs; Availability grouping is date-agnostic.
- An empty event renders both columns empty with zero counts (no crash).
- Claim failures surface the existing claim action's error, inline in the panel.

## Testing (strict TDD)

- **Unit (jsdom):**
  - `partitionByAvailability`: partial -> available, full -> claimed, boundary
    (`signups.length === neededCount`) -> claimed, order preserved.
  - `flagEnabled`: env truthy -> true; cookie `ff_task_board=1` -> true; neither
    in production -> false; dev default -> true.
  - `BoardCard`: coverage pill states (Covered vs "N of M"), CTA label per kind
    and per `neededCount >= 2`, "No one yet" when empty, no CTA when full.
  - `ClaimFields`: renders the fields open (no collapsed button), a successful
    submit calls `claimSlot` then `router.refresh()`; `ClaimForm` still renders
    its collapsed button and expands (guards the extraction).
  - `TaskPanel`: the claim block (`ClaimFields`) shows open when not full and is
    replaced by "All set" when full; the pair nudge shows only for `neededCount
    >= 2` with open spots; read-only details render only present optional fields.
  - `TaskBoard`: the copy-link control renders for an organizer and not for a
    volunteer.
  - **Deep-linking:** clicking a card sets the hash to `#task-<id>` and opens the
    panel; rendering with an initial `#task-<id>` opens that panel; closing
    clears the hash; an unknown id opens nothing. The Share button copies a URL
    ending in `#task-<id>` (assert against a stubbed `location`/clipboard).
- **DB (`*.db.test.ts`):** none new. Reads reuse `getEventBoardByParam`, whose
  existing DB tests already cover `org_bcsf` scoping, published-only, slug-or-id,
  minor abbreviation, and no raw minor flag leaking.
- **Accessibility:** axe on `/b/<slug>` (a published event, flag on) reports
  zero violations, including the open panel (focusable, labeled, backdrop and Esc
  close).
- **Gates before done:** `npm test`, `npm run test:db`, `npx tsc --noEmit`,
  `npm run lint` all green.

## Out of scope (deferred to later phases)

Controls row (view switcher, group-by, legend, hint); Calendar/List/Timeline
views; drag-and-drop; Status/Category/Group/Location/Day grouping and the status
model; comments; complete + archive; organizer in-panel editing and "+ Add
task"; a real per-task route (Phase 1 deep-links via the client URL hash only);
keyboard shortcuts; the header Live/archived count beyond a static task count;
flipping `/[slug]`.
