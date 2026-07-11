# Frog Marketplace (standing board) — Design Spec

**Sub-project of the "universal volunteer platform" effort.**
Let the temple post its ongoing needs as frogs on an evergreen board. A coordinator
states a need ("Trim hedges", "Pick up printer paper"); a volunteer opens a public URL,
grabs the frog, and it gets done. State the need, trust self-organization.

---

## Why (the vision)

Rev Opel runs a temple where physical frog cards hang in the hallway. Someone grabs
"Pick up printer paper" or "Trim hedges" off the wall and does it. The work self-organizes
around clearly stated needs. Today the app only serves **dated events**: every task lives
under an `Event` with a start and end date. Ongoing temple chores and supply runs have no
event to hang on. We need an **evergreen** board for standing needs.

## North star

Kniberg self-organizing. The coordinator specifies the need; volunteers self-select to
fulfill it. A frog is a stated need, nothing more. Grabbing one is a signal, never an
assignment.

## Goal

1. An **evergreen board** of standing temple needs, reachable at a stable public URL.
2. Needs are **frogs** the coordinator posts, each with an optional **due-by** and an
   **area** (Office, Building Management, Grounds, Hospitality).
3. Volunteers **grab** a frog from the public board, exactly as they claim a task today.
4. Volunteers filter the board **by area**.

## Core reframe

Two ideas from the original request collapse into what the app already has:

- **Supplies and chores are one thing.** "Printer paper" and "trim hedges" are both frogs.
  The only difference is the **area** they belong to. There is no separate supply model.
- **The frog already exists.** `Task.kind = "frog"` is a stated need with an optional
  `dueBy` and no shift structure. Rev Opel's hallway frogs map onto it directly.

So the marketplace is mostly **reuse**. The genuinely new part is making a board evergreen.

---

## Architecture

The codebase's clean layering holds: pure domain (`lib/domain`) → repository
(`lib/repository`) → server actions (`app/actions`) → pages/components.

**The spine: a standing board is an `Event`.** Chosen over a new `Board` entity because
every piece already hangs off `Event`: the public board, tasks, signups, claim tokens, and
the audit log. A new parent would fork the whole task layer for a naming benefit. A
standing board is an `Event` that never ends.

### Data model

One change to the spine; everything else is reused unchanged.

- `Event` gains `standing Boolean @default(false)`.
- `Event.startDate` and `Event.endDate` become **optional**, so a standing board carries no
  dates. Existing dated events keep both.
- A **standing board** is an `Event` with `standing = true`, no dates, a slug (e.g.
  `temple`), scoped to the one seeded org.
- A **frog** is a `Task` with `kind = "frog"` (exists), optional `dueBy` (exists), and its
  **area** stored in the existing `category` field.
- **Signups, claim tokens, and the audit log** are reused with no change.

Total schema footprint: one boolean plus two nullable columns.

### Roles

No new role. The **organizer** is the coordinator. One organization, one shared organizer
login, managing both dated events and the standing board. The "volunteer coordinator" is a
hat the organizer wears, not a permission system.

---

## Flows

### Coordinator (organizer)

- On the organizer home (`/organize`), a second create action: **"New ongoing board"**
  (name + slug, no dates), beside the existing "New event".
- Managing the board **reuses the existing** organizer task page (`/organize/[eventId]`).
  New tasks on a standing board default to `kind = "frog"`.
- The coordinator types the need, sets an **area** (`category`), an optional **due-by**
  (`dueBy`), and `neededCount` when a job wants more than one pair of hands.
- The public board serves only `status = "published"` boards (as it does for events), so
  the coordinator **publishes** the standing board to make `/<slug>` live. Publishing works
  the same as it does for an event.

No new organizer screens.

### Volunteer

- The public board at `/<slug>` already renders frogs with a claim form. A standing board
  at `/temple` works the day it exists. No new claim code.
- On a standing board, **hide the date-driven furniture**: no "first/last day", no day
  headers. Undated frogs already fall under the board's existing "all-day" grouping. The
  board read model carries `standing` so the page knows to drop the date UI.
- The **area facet stays**. The board already ships a facet filter bar, so "filter frogs by
  area" works the day areas exist. Zero new filtering code.
- Grabbing a frog = claiming it: the volunteer's name lands on the card; a device-local
  token lets them release it. Marking a frog **done** stays organizer-managed, as today.

---

## Scope

**In (slice one):**

- `Event.standing` flag and optional dates; migration.
- Create-a-standing-board action and a form on the organizer home.
- New tasks on a standing board default to the frog kind.
- The public board hides date furniture and renders undated frogs when `standing`.
- `dueBy` and the area (`category`) exposed on the frog create/edit and rendered on the card.

**Deferred (own specs, reachable without rework):**

- **QR-code frogs (immediate fast-follow).** Printable frog cards, each carrying a QR that
  deep-links to a **per-frog claim view at `/<slug>/f/<taskId>`**. Scanning a hallway card
  opens that one frog's claim page. This bridges the physical and digital worlds and is the
  heart of Rev Opel's vision. It reuses the existing claim action. **The per-frog deep-link
  view is a required part of that spec.**
- **Per-area leads.** A private link giving each area's manager a view of only their frogs.
  Reuses the delegate-per-group machinery already on this branch.

**Out (no evidence of need):**

- Fundraising sections.
- Quantity-splitting a supply (25 cookies from me, 25 from Joe). `neededCount` covers
  "needs more than one person"; per-amount pledges are unbuilt until real use asks for them.
- Multi-view rendering (kanban by status, calendar by date). The `Task` shape already
  supports these as future read-models; none is built now.
- Section on/off toggles. With supplies and chores unified and fundraising dropped, there
  is nothing to toggle.
- A distinct coordinator role or a second tenant.

---

## Testing

Strict TDD, matching the repo: red → green → refactor. Schema and migration are the
documented exception, verified by running the suites.

- Domain unit tests (jsdom) for any new pure logic.
- `*.db.test.ts` (node, test database) for the standing-board repository and actions.
- Component tests for the "New ongoing board" form and any board changes.
- New pages pass the repo axe check with zero violations.
- Before done: `npm test` and `npm run test:db` green, plus `npx tsc --noEmit` and
  `npm run lint`.

## Writing style

Repo CLAUDE.md: omit needless words, active voice, no em dash. Applies to code comments and
commit messages.
