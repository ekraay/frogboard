# Navigation: Ponds IA and the Universal Bar

**MVP spec.** The first shippable slice of a navigation system for Frog Board.
It ships the **Universal Nav bar** and the **ponds information architecture**
that gives the whole site one vocabulary. This is one shippable spec, not the
whole vision. The **garden** (org home) and **pond home** (group home) screens
are named as deferred sub-projects, gated on the Groups epic, not built here.

## Why

The app grew into a set of disconnected surfaces, each its own dead-end page:
the volunteer board (`/[slug]`, `/b/[slug]`), the organizer workspace
(`/organize`), the lead chase view (`/lead/<token>`), and the coming RSVP and
attendance surfaces. `app/layout.tsx` is bare: no header, no breadcrumb, no way
to move between surfaces. Every page uses link-based access with no accounts, so
people arrive deep in the app with no way to tell where they are.

A single bar fixes that. It always answers **where am I** (brand > org > event >
view) and offers only the moves that make sense for who you are. The bar is the
cheapest thing that ties the surfaces into one site, and it ships today with no
dependency on unbuilt work.

The deeper frame is a metaphor that makes the whole system legible to a scout and
calm for a scoutmaster: **you are the frog**, every group is a **pond**, and an
open spot is a **lily pad** you hop to.

## The metaphor (the north star)

The IA speaks one vocabulary, adopted from the design handoff:

- **Frog** = the volunteer (the person). When a pad opens, they "hop to it."
- **Lily pad** = an open spot to sign up for: a scheduled **shift**, or a one-off **mission** (buy 50 cups, hang the banner, trim the hedges).
- **Pond** = a group (Scouts, Taiko, BWA, YAO), first-class, with its own private
  roster.
- **Garden** = the org (BCSF), all ponds together.
- **Gathering** = an event, in one pond or rippling across many (a festival).
- Tagline and primary CTA everywhere: **"Hop to it."**

## Goals

- Every oriented surface carries one bar that answers "where am I" at a glance.
- The bar offers only in-reach moves; it never shows an action the viewer cannot
  take.
- The breadcrumb roots at the org and treats a group as a removable lens, so it
  stays reversible against the Groups epic's many-to-many model.
- Access reads as three independent switches (see, edit, roster), so no group's
  roster leaks on a shared festival.
- The deliberately chrome-free youth RSVP surface stays bare: it opts out of the
  bar.
- One clean metaphor in code and UI: the volunteer is the frog, the task is a
  lily pad.

## Non-goals (deferred, named on purpose)

- **The garden (org home).** The pond grid, the festival band, the "+ New pond"
  action. Needs the Group entity and Event-Group participation from the Groups
  epic.
- **The pond home (group home).** The gatherings list scoped to one group, the
  members-only roster, the "+ New gathering" default-to-this-pond behavior. Needs
  Group, Membership, and home-group behavior from the Groups epic.
- **A group switcher.** No cross-pond navigation menu until ponds exist.
- **Multiple orgs.** BCSF is the only org; the bar shows it, but org selection is
  out.
- **Google Sign-In for adults.** The organizer stays behind the shared password.

## Scope decisions

Two calls set this spec's boundaries:

1. **Bar-first MVP.** This spec ships the navigation IA and the Universal Nav bar,
   buildable now against today's model. The garden and pond home screens are
   deferred, gated on the Groups epic.
2. **Fold in the rename.** The `TaskKind` "frog" -> "mission" rename ships here as
   task 1, so the metaphor is clean before the bar names it.

## The Universal Nav bar

One bar, the same shape on every oriented surface. The left cluster is identical
everywhere; the right cluster adapts to the persona.

### Anatomy

- **Left cluster (identical always):** `🐸 Frog Board / <Org> / <Event> · <View>`.
  - **🐸 Frog Board** (brand) returns to org home.
  - **Org > Event** is the orientation anchor.
  - **· View** names what you are doing now (Sign up, Group lead, Organize).
- **Right cluster (contextual):** only the moves in reach for this persona.

### Personas and their right cluster

- **Volunteer** (public board, `/[slug]` and `/b/[slug]`): quiet. A "What's a
  pad?" help link and one green **"Hop to it"** CTA riding in the bar, thumb-
  reachable while the board scrolls.
- **Group lead** (`/lead/<token>`): a group scope chip (for example `👥 Scouts`)
  and a single "View public board" link. No account, no other moves.
- **Organizer** (`/organize`): real navigation. Board / Roster / Settings links
  and a "🔗 Share" action. The one persona with places to move between, so the
  one place the right cluster becomes a menu.

### Responsive

Most people open these links on a phone. The brand collapses to 🐸; the event and
view label stay to keep orientation; the primary action stays reachable in the
bar. On the public board the single green "Hop to it" action rides in the bar,
always thumb-reachable while scrolling.

### Where it lives

A `<SiteNav>` server component reads org, event, view, and persona from the route
and session, and renders the bar. It is **not** placed in the root layout.
Surfaces that want orientation render it; the chrome-free youth RSVP surface
("a tool you open, answer, and close") omits it and stays bare. This keeps the
youth privacy stance intact: no navigation chrome aimed at a kid's phone.

## Breadcrumb and IA rules (reversible)

The root is always the **org**. A group is a **removable lens chip**, never a path
segment that owns an event. This keeps the UI reversible against the Groups epic,
where an event belongs to zero, one, or many groups.

- **Org home** -> `BCSF`.
- **Group home** -> `BCSF / <Group>` (group as a removable lens chip).
- **Event via a group** -> `BCSF / <Group> / <Event>` (the chip is how you
  arrived, not ownership; the event still lives at the org and can carry other
  groups).
- **Festival (many groups)** -> `BCSF / <Event>` with a `👥 N groups` chip, never
  one false parent.
- **Org-wide standing board** -> `BCSF / <Board>` with an "All groups" note; group
  scope is simply absent.

The bar never nests an event under a single group as its owner. Baking a 1:1 into
the UI would become the migration the Groups epic exists to avoid.

## Permission model: see is not edit is not roster

Access is three **independent** switches, never one visibility flag:

- **Board visibility** — can you see the tasks and the board.
- **Edit rights** — your role in that group: none / member / group organizer /
  org organizer.
- **Roster visibility** — who can see the people and RSVPs. **Private to the group
  by default.**

The case this protects: on a shared festival the board can be visible to everyone
while a group's roster stays members-only. A Taiko lead watches Scouts shifts
fill up but never sees the Scouts member list.

Rules:

- **No dead affordances.** If you cannot edit, the control is **not rendered**,
  not greyed. No one is misled into thinking they could act.
- **Private groups** are hidden from the switcher entirely for non-members.
- **Org organizer** is the only role that can open a private roster.

### Today's mapping (encode the model, wire what exists)

No Group entity exists yet, so the bar computes the three switches from what is
already present:

- **Session cookie** (`SESSION_COOKIE`, the shared organizer password) -> edit and
  roster rights: the organizer persona.
- **Lead token** (`/lead/<token>`) -> group-scoped: the group lead persona, board
  visible, roster scoped to the token's group.
- **Default** (no session, no token) -> volunteer: board visible, no edit, no
  roster.

The three-switch shape ships now and gains real teeth as the Groups epic lands.
Group and org organizer roles resolve to the same organizer persona today; the
distinction becomes meaningful once groups are first-class.

## The frog -> mission rename

The metaphor requires that the volunteer is the frog, so a task cannot also be a
frog. Two independent pieces:

### UI copy (trivial, no data)

Every "Grab a frog" and "grab a frog" becomes **"Hop to it."** Touches the board
copy (`Board.tsx`), `ClaimForm.tsx`, `BoardCard.tsx`, and `TaskPanel.tsx`, plus
their tests. A one-off mission is just a small lily pad; the CTA is the same
"Hop to it" everywhere. The kind badge reads **🪷 Mission** beside **🎐 Shift**.

### Model value (needs a migration)

`TaskKind` becomes `"shift" | "mission"`. The one-off kind is a **noun** beside
`shift`: "frog" now names the volunteer, and "quick" read as an adjective, so the
value is `mission` (a one-off objective a volunteer pulls off the board). Because
`Task.kind` is stored as a literal string, this is not only a symbol swap:

- A Prisma migration renames the stored value in place to `mission`, preserving rows.
- Paste and import map legacy "frog" input to "mission" (`paste.ts`, `import.ts`).
- Domain functions swap the literal (`when.ts`, `time.ts`, `gridRow.ts`), with
  their unit tests updated first.

The rename is task 1, self-contained, done once, before the bar names the
metaphor.

## Deferred sub-projects (Groups-epic-gated)

Specified here as the destination, built after the Groups epic. They reuse the
same bar and metaphor.

### The garden (org home)

The coordinator's home: a festival band for the marquee cross-pond gathering, and
a grid of pond cards, one per group the viewer can see, each showing frog count,
open-pad count, and the next gathering. Private ponds the viewer is not a member
of are omitted, not shown locked, unless the viewer is an org organizer. Route
resolves at the org root. Needs Group and Event-Group participation.

### The pond home (group home)

A group organizer's calm water: the group's gatherings isolated to this pond, a
members-only roster, and a "+ New gathering" action that defaults new events to
this pond. This is where the Scoutmaster attention report from the youth-led RSVP
spec lives: a section of the Scouts pond, not a separate admin tier. Needs Group,
Membership, and home-group behavior.

## Testing and rollout

- **Behind a feature flag** (`FLAG_NAV`, the `flagEnabled` pattern used by
  `FLAG_TASK_BOARD`), dark by default, previewable on prod before flipping.
- **Strict TDD, red-green-refactor.** Bar logic lives in pure functions in
  `lib/domain/` with unit tests: persona resolution from session and token,
  breadcrumb assembly from route context, and which right-cluster actions render
  for each persona. Rendering gets component tests. DB paths, if any, get
  `*.db.test.ts` against the test database.
- **Riskiest-assumption test:** the same bar renders correctly and offers the
  right moves on the three surfaces people actually land on (volunteer board,
  lead page, organizer), and the youth RSVP page stays bare.
- **"Done" for the branch:** both suites green, `npx tsc --noEmit` clean,
  `npm run lint` clean, and the bar demonstrated on the volunteer board, the lead
  page, and the organizer, with the chrome-free youth page confirmed still bare.

## Relationship to prior specs

- **Groups epic** (`2026-07-11-groups-epic-design.md`): this nav is designed
  against it and preserves its reversibility. Org is the only true root; a group
  is a lens, not a parent; a pond is a group and its private roster is the group's
  Membership rows. The deferred garden and pond screens are the navigation face of
  the epic's sub-projects 2 and 3.
- **Youth-led RSVP and attendance** (`2026-07-13-youth-led-rsvp-attendance-design.md`):
  the youth surface opts out of the bar by design, and the Scoutmaster attention
  report finds its home in the deferred pond home.
- **Frog marketplace standing board** (`2026-07-11-frog-marketplace-design.md`):
  the org-wide, no-single-group case the breadcrumb's "All groups" state covers.
- **Task Board** (`2026-07-12-task-board-phase-2-design.md`): the redesigned board
  at `/b/<slug>` is a volunteer-persona surface that renders the bar.
						