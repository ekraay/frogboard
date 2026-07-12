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
  grouping, cards, claim CTA, detail panel with the claim block and read-only
  details. Essentially no schema change.
- **Phase 2:** grouping engine (Status, Category, Group, Location, Day) + legend.
  Carries the "fixed statuses vs Trello-style custom columns" decision.
- **Phase 3:** drag-and-drop (set the grouped field on drop; move actions).
- **Phase 4:** alternate views (List, Calendar with the Bon Dance key event,
  Timeline).
- **Phase 5:** comments (a `Comment` model, thread UI, post action).
- **Phase 6:** organizer in-panel editing + "+ Add task", complete + archive,
  per-task permalinks/route, keyboard **E**, pairing nudges, key-event config.

## Goal

At a new, flag-gated route, a volunteer sees the event's tasks as cards split
into **Available** (still needs people) and **Claimed** (full), and can claim a
task through a detail panel, all in the new high-fidelity look. Organizers see
the same board plus the copy-public-link control and the Live/archived counts.
Nothing about `/[slug]` or `/organize` changes.

## Architecture

A new server route renders a new client board component. All reads flow through a
new repository function; the only write is claiming, which reuses the existing
claim server action. The board re-renders via the existing `revalidatePath`
pattern.

```
app/board/[slug]/page.tsx  (server)
  -> flagEnabled("task_board", { cookies })   // env + preview cookie; notFound() when off
  -> getTaskBoard(param)                       // lib/repository/taskBoard.ts
  -> isOrganizer from session                  // reuse isValidSession/SESSION_COOKIE
  -> <TaskBoard event tasks isOrganizer />     // client
       -> groupByAvailability(tasks)           // lib/domain/availability.ts (pure)
       -> <BoardCard/> per task
       -> <TaskPanel/> when openId set (claim block + read-only details)
            -> existing claim server action
```

## Components and units

### `lib/flags.ts` (new)
- `flagEnabled(name: string, opts: { cookies: ReadonlyRequestCookies }): boolean`.
- True when env `FLAG_<NAME_UPPER>` is a truthy value (`"1"`/`"true"`), OR the
  request carries the preview cookie `ff_<name>` set to `"1"`. Default off in
  production, on in development (`NODE_ENV !== "production"`).
- Pure over its inputs (env + the passed cookies); no global state.
- **Preview opt-in.** Cookies can only be written from a Route Handler or Server
  Action in this Next version, not during a page render. So persistence uses a
  tiny Route Handler `app/board/[slug]/preview/route.ts`: `GET .../preview?on=1`
  sets `ff_task_board=1` (and `?on=0` clears it), then redirects to
  `/board/<slug>`. The organizer visits that link once to opt their session in.
  The page render only reads cookies, never writes them. (Confirm the cookie and
  redirect APIs against `node_modules/next/dist/docs/` when implementing.)

### `lib/domain/availability.ts` (new, pure)
- `groupByAvailability(tasks: BoardTask[]): { available: BoardTask[]; claimed: BoardTask[] }`.
- Available = `signups.length < neededCount`; Claimed = `signups.length >= neededCount`.
- Order within each bucket preserves the incoming order (already position-sorted).

### `lib/repository/taskBoard.ts` (new)
- `getTaskBoard(param: string): Promise<TaskBoardData | null>`.
- Resolves a **published** event by slug or id, scoped to `org_bcsf` (mirror
  `getEventBoardByParam`; do not modify that function).
- Returns `{ id, name, slug, standing, tasks }`, where each task is the existing
  `BoardTask` shape (so `boardDisplayName` abbreviates minors and no raw minor
  flag leaks). Coverage is derived client-side from `signups.length` vs
  `neededCount`, as the board already does.
- Returns null when the event is missing or not published (the route then
  `notFound()`s).

### `app/board/[slug]/page.tsx` (new, server component)
- `export const dynamic = "force-dynamic"` (per-request session + flag).
- Read cookies once (read-only; the preview cookie is set by the
  `preview` Route Handler above, not here).
- If `!flagEnabled("task_board", { cookies })` -> `notFound()`.
- `const board = await getTaskBoard(slug); if (!board) notFound();`
- `const isOrganizer = isValidSession(cookies.get(SESSION_COOKIE)?.value)`.
- Render `<TaskBoard event={board} tasks={board.tasks} isOrganizer={isOrganizer} />`.

### `components/board/TaskBoard.tsx` (new, client)
- Props: `{ event: { id; name; slug; standing }, tasks: BoardTask[], isOrganizer: boolean }`.
- State: `openId: string | null`.
- Header: 🐸 + event name (display serif) + a muted subline ("Grab a task to help
  out"). For organizers only: a "🔗 Copy public link" button (copies
  `<origin>/<slug>`, flips to "Copied ✓" briefly) and a "Live · N tasks" pill
  (append "· N archived" only once archiving exists; omit for now).
- Body: the two Availability columns (Available accent lantern `#e25325`, Claimed
  accent reed `#0e5e36`) via `groupByAvailability`. Each column: dot + uppercase
  label + count pill, then the cards.
- No controls row this phase (the view switcher and group-by are inert without
  other views/groupings; they arrive in Phase 2/4).
- Clicking a card sets `openId`; the panel reads the task by id.

### `components/board/BoardCard.tsx` (new, client)
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
- Overlay (blur backdrop, click to close) + panel (white, rounded, status-accent
  bar can use the column accent for now).
- Header: kind tag (read-only) + close ×.
- Title: read-only display-serif heading.
- **Claim block** (shown when not full): reed-tinted panel, "Your name" input
  (required) + a reed-green claim button ("🐸 Grab it" for a frog, "🎐 Add me"
  for a shift), an optional "Email or phone (optional)" input with the helper
  "We only use it to remind you about your shift." For `neededCount >= 2` with
  open spots, add the nudge "👥 More fun in a pair, grab it with a friend."
  Submitting calls the existing claim server action; on success the board
  refreshes and coverage advances. When full, replace the block with "🐸 All
  set, this one's covered."
- **Details** (read-only grid): When (the existing time label), Location (📍),
  Category (🏷️), Requested group (👥); plus Definition of done, Description, and
  Point of contact when present.
- Reuse the existing claim path (`ClaimForm`'s action and its name/email/phone/
  under-18 handling). The panel may reuse `ClaimForm` directly if its styling can
  be themed to the panel; otherwise a thin panel-styled form calling the same
  action. Claim semantics must not diverge from the current board.

## Data model

No schema change in Phase 1. `lib/flags.ts` reads env + a cookie. `getTaskBoard`
reads existing `Event`/`Task`/`Signup`. The `--color-tatami` token and the
`backlog`/`completed`/`archived`/`Comment` additions are deferred to the phases
that need them.

## Rollout

- Route is dark by default (`FLAG_TASK_BOARD` unset in production). Preview via
  `/board/<slug>?preview=1` (sets the cookie), which lets the organizer test in
  real production without exposing it.
- Add `"board"` to `RESERVED_SLUGS` so no event can take that slug and shadow the
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
  - `groupByAvailability`: partial -> available, full -> claimed, boundary
    (`signups.length === neededCount`) -> claimed, order preserved.
  - `flagEnabled`: env truthy -> true; cookie `ff_task_board=1` -> true; neither
    in production -> false; dev default -> true.
  - `BoardCard`: coverage pill states (Covered vs "N of M"), CTA label per kind
    and per `neededCount >= 2`, "No one yet" when empty, no CTA when full.
  - `TaskPanel`: claim block shows when not full and hides ("All set") when full;
    the pair nudge shows only for `neededCount >= 2` with open spots; read-only
    details render only present optional fields.
  - `TaskBoard`: the copy-link control renders for an organizer and not for a
    volunteer.
- **DB (`*.db.test.ts`):** `getTaskBoard` returns a published event scoped to
  `org_bcsf`, abbreviates a minor's name, excludes an unpublished event (null),
  and never leaks the raw minor flag.
- **Accessibility:** axe on `/board/<slug>` (a published event, flag on) reports
  zero violations, including the open panel (focusable, labeled, backdrop
  closes).
- **Gates before done:** `npm test`, `npm run test:db`, `npx tsc --noEmit`,
  `npm run lint` all green.

## Out of scope (deferred to later phases)

Controls row (view switcher, group-by, legend, hint); Calendar/List/Timeline
views; drag-and-drop; Status/Category/Group/Location/Day grouping and the status
model; comments; complete + archive; organizer in-panel editing and "+ Add
task"; per-task permalinks/route; keyboard shortcuts; the header Live/archived
count beyond a static task count; flipping `/[slug]`.
