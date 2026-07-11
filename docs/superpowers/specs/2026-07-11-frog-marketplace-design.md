# Frog Marketplace (standing board): Design Spec

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
  `dueBy` and no shift structure. Rev Opel's hallway frogs fit its shape; the claim and
  capacity semantics are verified below rather than assumed.

So the marketplace is mostly **reuse**. The genuinely new parts are making a board evergreen
and giving the organizer a way to clear an abandoned claim.

---

## Architecture

The codebase's clean layering holds: pure domain (`lib/domain`) → repository
(`lib/repository`) → server actions (`app/actions`) → pages/components.

**The spine: a standing board is an `Event`.** Chosen over a new `Board` entity because
every piece already hangs off `Event`: the public board, tasks, signups, claim tokens, and
the audit log. A new parent would fork the whole task layer for a naming benefit. A
standing board is an `Event` that never ends.

### Data model

- `Event` gains `standing Boolean @default(false)`.
- `Event.startDate` and `Event.endDate` become **optional**, so a standing board carries no
  dates. Existing dated events keep both.
- A **standing board** is an `Event` with `standing = true`, no dates, a slug (e.g.
  `temple`), scoped to the one seeded org.
- A **frog** is a `Task` with `kind = "frog"` (exists), optional `dueBy` (exists), and its
  **area** stored in the existing `category` field.
- **Signups, claim tokens, and the audit log** are reused. The claim path is already
  concurrency-safe (see Verified below), so reuse here is proven, not assumed.

The schema change is small (one boolean plus two nullable columns), but nullable dates have
a behavioral blast radius. TypeScript surfaces the full impact: every reader that types a
date as non-null `Date` must change. Known readers today: `createEvent`, `listEvents`,
`getEventGrid` (`lib/repository/organize.ts`), and `PublishedEventSummary` /
`listPublishedEvents` (`lib/repository/events.ts`), plus the components that format an
event's date range (`NewEventForm`, `EventList`, the organizer grid header). The plan
treats the compile errors as the impact inventory and fixes each.

### Invariants and validation

The design permits invalid states unless one invariant is stated and enforced at the write
boundary:

```
standing = false  →  startDate AND endDate present
standing = true   →  startDate AND endDate absent
```

- Enforced in the event write paths only: `createEvent` (dated) and the new
  `createStandingBoard` action. Dated create requires both dates; standing create sets both
  to null. No `Event` write bypasses these.
- **Standing boards must not leak into event lists.** `listEvents` (organizer home) and
  `listPublishedEvents` (public event index) filter to `standing = false`. The standing
  board is reached only by its own slug.
- **Frog-only on standing boards.** The task write path rejects `kind = "shift"` when the
  parent board is `standing`. A standing board holds frogs only; shifts (time slots) belong
  to dated events. This keeps day-grouping and slot semantics well defined.

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
  (`dueBy`), and `neededCount`. Frogs default to `neededCount = 1` (one volunteer takes the
  whole frog). A higher count means the frog needs that many separate volunteer claims (a
  pair to move tables), never a quantity of goods.
- **Area is a free-typed `category`.** The create form suggests areas already in use so the
  coordinator reuses "Grounds" instead of typing "grounds". This keeps the facet list clean
  without a managed taxonomy. A trimmed, non-empty string is the only rule.
- The public board serves only `status = "published"` boards (as it does for events), so
  the coordinator **publishes** the standing board to make `/<slug>` live.
- **New frogs on a published board go public immediately** (a published board shows all its
  tasks). Acceptable for now: the coordinator builds the board in draft, publishes when
  ready, and thereafter posts frogs that are meant to be seen. Per-frog drafting is deferred.
- **Clearing an abandoned claim.** On an evergreen board time never retires a stuck frog, so
  the organizer needs a way to release any claim and reopen the frog. Today release requires
  the volunteer's device-local token (`validateRelease`), and no organizer override exists.
  Slice one adds an **organizer-gated release**: remove a signup by id without the token,
  audited like a normal release. This is the one genuinely new capability.

No new organizer screens; the clear-claim control lives in the existing organizer surface.

### Volunteer

- The public board at `/<slug>` already renders frogs with a claim form. A standing board
  at `/temple` works the day it exists. No new claim code.
- On a standing board, **hide the date-driven furniture**: no "first/last day", and drop
  the "No set date" day header. `groupTasksByDay` already buckets undated tasks under an
  "all-day" group built from the tasks themselves, not from any event date range, so undated
  frogs render correctly today. The only change is cosmetic: the board read model carries
  `standing` so the page suppresses the lone empty day header.
- `dueBy` shows on the frog card. The plan verifies `formatWhen` renders it and that a
  Friday due date reads as Friday (the field is a calendar date, stored and shown without a
  timezone shift, matching the existing `date` handling).
- The **area facet stays**. The board already ships a facet filter bar, so "filter frogs by
  area" works the day areas exist. Zero new filtering code.
- Grabbing a frog = claiming it: the volunteer's name lands on the card; a device-local
  token lets them release it. Marking a frog **done** stays organizer-managed, as today.

---

## Scope

**In (slice one):**

- `Event.standing` flag and optional dates; migration.
- The `standing`/dates invariant, enforced at the event write boundary.
- Filter standing boards out of `listEvents` and `listPublishedEvents`.
- Create-a-standing-board action and a form on the organizer home.
- New tasks on a standing board default to the frog kind; the task write path rejects a
  `shift` kind when the board is `standing`.
- The public board hides date furniture and renders undated frogs when `standing`.
- `dueBy` and the area (`category`) exposed on the frog create/edit and rendered on the card;
  the create form suggests existing areas.
- Organizer-gated release to clear an abandoned claim and reopen a frog.

**Deferred (own specs, reachable without rework):**

- **QR-code frogs (immediate fast-follow).** Printable frog cards, each carrying a QR that
  deep-links to a **per-frog claim view at `/<slug>/f/<taskId>`**. Scanning a hallway card
  opens that one frog's claim page. This bridges the physical and digital worlds and is the
  heart of Rev Opel's vision. It reuses the existing claim action. **The per-frog deep-link
  view is a required part of that spec.**
- **Per-area leads.** A private link giving each area's manager a view of only their frogs.
  The delegate-per-group machinery on this branch is the likely starting point, but it keys
  on `Task.requestedGroup` while areas live in `Task.category`. The fields do not align yet,
  so reuse is a hypothesis, not a promise. When the need is real, we reassess whether the
  delegate mechanism parameterizes cleanly or areas need a different representation.

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

## Verified against the codebase

An adversarial review challenged the reuse claims. These were checked against the code:

- **Claim concurrency is safe.** `createSignupWithAudit` runs in a `$transaction` and takes
  `SELECT ... FOR UPDATE` on the task row before counting signups against `neededCount`.
  Two people racing for the last slot serialize on the lock; one loses cleanly. Reuse of the
  claim flow is proven.
- **Undated frogs render.** `groupTasksByDay` builds day buckets from the tasks, placing
  dateless tasks in an "all-day" group. No code derives buckets from an event's date range.
- **The card gates a full frog.** `TaskCard` replaces the claim form with "All set" when
  full, and `validateClaim` rejects a full slot server-side.
- **Slug and org are already consistent.** `RESERVED_SLUGS` blocks `organize`, `api`,
  `lead`, etc.; `createEvent` hard-codes `orgId: "org_bcsf"`. New code reuses both.

These findings drove the additions above: the invariant, list filtering, the frog-only
guard, and the organizer clear-claim. Claims the review rightly flagged as overstated
("maps onto it directly", "reused with no change", "total schema footprint") are now
narrowed to what the code supports.

## Testing

Strict TDD, matching the repo: red → green → refactor. Schema and migration are the
documented exception, verified by running the suites.

- Domain unit tests (jsdom) for any new pure logic.
- `*.db.test.ts` (node, test database) for the standing-board repository and actions,
  including: the `standing`/dates invariant (a standing create stores no dates; a dated
  create requires both), the frog-only guard (a `shift` on a standing board is rejected),
  standing boards absent from `listEvents` / `listPublishedEvents`, and the organizer
  clear-claim (release without a token reopens the frog).
- A unit test rendering a standing board with one undated frog, proving it appears.
- Component tests for the "New ongoing board" form and any board changes.
- New pages pass the repo axe check with zero violations.
- Before done: `npm test` and `npm run test:db` green, plus `npx tsc --noEmit` and
  `npm run lint`.

## Writing style

Repo CLAUDE.md: omit needless words, active voice, no em dash. Applies to code comments and
commit messages.
