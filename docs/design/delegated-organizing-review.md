# Frog Board, Delegated Organizing: design review packet

A self-contained summary for external review. Captures the vision, this first
sub-project's design, and the rationale, so a cold reader can critique it.
Date: 2026-06-19. Status: design, pre-spec.

## Product context

Frog Board is a mobile-first web app for a Boy Scouts troop / community group
(BCSF) to self-organize volunteers at events (festivals like Ginza Bazaar, Bon
Odori). It replaces a clunky incumbent. Core ethos: **no logins for
volunteers.** People sign up from a public board; ownership of a signup is a
device-local **claim token** (a secret in their browser), not an account. Built
with Next.js (App Router), Prisma 6, Neon Postgres, deployed on Vercel. Strict
TDD. Lives in prod.

Existing data model highlights:

- `Task` (a shift or a flexible "frog"): `title`, `category` (free text, e.g.
  "Games"), `requestedGroup` (which patrol is asked, e.g. "Hawks"),
  `neededCount`, schedule (`date`/`startAt`/`endAt`/`dueBy`), `location`,
  `pointOfContact` (free-text name), `definitionOfDone` (what good looks like).
- `Signup`: `name`, optional `email`/`phone`, `minor` flag, `claimToken`.
  Minors' last names show abbreviated ("Tomas R.").

## The vision

Apply **mission command** (Stephen Bungay: brief the intent, not the steps) and
the **Patrol Method** (Baden-Powell: the adult leads *through* youth patrol
leaders). In software: a head organizer carves an event into areas of
responsibility, hands each to a **delegate** (a lead), and the delegate runs
their patch. The system empowers leaders rather than micromanaging volunteers.

This decomposes into four sub-projects, in dependency order:

1. **Categories with a lead + delegate report link** (THIS spec).
2. **Reminder loop**: text-first, consolidated, fired within a lead's scope.
3. **Manage the signup network**: delegate nudges, reopens, reassigns.
4. Finer-grained delegation, real accounts.

## This sub-project: Categories with a lead + delegate report link

**Goal:** let a head organizer name a lead for a category of work, and give that
lead a private link to a read-only coverage report for their category.
Foundation for everything else. Delivers value alone (a lead sees their own
coverage; no more group texts asking "who's covering Games?").

**Key modeling decision: no new "area" concept.** An "area" is just a
**category that has a lead.** Users already have categories ("Games," "Food").
Delegating = naming who leads a category. Avoids forcing users to distinguish
"category" from "area."

**Second decision: a delegate subsumes "point of contact."** Today
`pointOfContact` is a name retyped per task. A delegate is the same person with
powers (a link, reports). So the category's delegate becomes the **default**
contact for that category's tasks. The per-task `pointOfContact` remains only as
an optional override. One resolution rule everywhere:
`contact = task.pointOfContact ?? delegate-for(event, task.category)`.

**New model:**

```
Delegate
  eventId    -> Event (cascade delete)
  category   the category they lead
  name
  email?  phone?
  token      unguessable; their private report link
  @@unique([eventId, category])   one lead per category per event
```

No `Area` table, no `areaId` on `Task`, no change to `Task`.

**Organizer UI:** a "Leads" panel on the event page (`/organize/[eventId]`),
above the grid. Lists each category in use (derived from tasks), its coverage
("7 of 9 covered"), and its lead. Inline form to assign a lead (pick an existing
category, type name + contact). A "Copy link" button per row hands the delegate
their URL.

**Delegate report:** route `/lead/[token]`, read-only, no password (token is the
key). Shows the lead's name + category + event, a coverage summary, and the
category's tasks **gaps-first**, each with when/where, "X of N filled," and
signed-up names (minors abbreviated). No volunteer contact details yet. Invalid
token shows a friendly message, not an error.

**Architecture (existing clean layering):**

- Domain (pure, unit-tested): `resolveContact`, category coverage (reuse
  existing `coverageFor`/`getSlotInfo`), group-by-category.
- Repository (DB-tested): `upsertDelegate` (mints token, enforces
  one-per-category), `removeDelegate`, `getEventDelegates`,
  `getDelegatePatch(token)`.
- Actions (organizer-gated, DB-tested): `saveDelegate`, `removeDelegate`.
- Components/pages (unit-tested): `LeadsPanel`, `DelegatePatch`, `/lead/[token]`.
- New `Delegate` migration.

**Privacy/security:** token is random and unguessable; it grants read access to
one category's report only. Report shows volunteer names with minor
abbreviation; no volunteer phone/email in this slice.

**Explicitly out of scope (later):** reminders, volunteer contact details on the
report, delegate-driven nudges/reassignment, "specific shifts" (non-category)
delegation, real accounts.

## Decisions already made for *later* sub-projects (context, not this build)

- **Channel:** text-first, email fallback (youth read texts, not email). Texting
  needs Twilio + US A2P 10DLC + SMS opt-in consent.
- **Anti-spam:** one consolidated message per person per send (a digest of all
  their shifts), not one per shift. Cadence per event, not per shift. Confirming
  silences later nudges. Quiet hours + one-per-day cap.
- **Reminder v1 scope:** a single well-timed reminder plus a one-tap "decline
  reopens the slot and notifies the lead" loop.
- **Tiered minor routing:** scouts 13+ can get their own reminder; younger route
  to a parent; last name kept private either way.
- **Tone:** mission-command, brief the intent (`definitionOfDone`) and the lead,
  not a checklist.

## Questions for the reviewer

1. Is "a category with a lead" the right collapse, or does delegating need
   first-class areas (a lead owning multiple categories or a hand-picked task
   set) sooner than "later"?
2. Is free-text `category` too brittle to hang delegation on? Worth normalizing
   categories now?
3. Read-only report with names but no contact info: too thin to be useful, or
   correctly minimal for a first slice?
4. Token-in-URL with no expiry for the delegate link: acceptable given the
   no-accounts ethos, or does it need rotation/expiry?
5. Any concern unifying `pointOfContact` into the delegate (losing per-task
   contact as the default)?
