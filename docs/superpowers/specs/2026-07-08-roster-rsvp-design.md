# Roster + RSVP (with minimal delegation): Design Spec

**Sub-project 1 of the "Delegated Organizing / universal volunteer platform" effort.**
Give each group a standing directory of its people, let them RSVP Yes/No/Maybe (with a
reason) per event day, and hand group leads a private link to their slice so they can
chase the people they have not heard from. Treat the roster as sensitive minor data
from the first line of code, and bake in the multi-tenant seam so a second org is a
later addition, not a migration.

**Supersedes** `docs/superpowers/specs/2026-06-22-delegate-per-group-design.md`
and its plan `docs/superpowers/plans/2026-07-08-delegate-per-group.md`.

---

## Why (the live pain)

Only 7 of ~45 members have signed up for tasks. The board records task signups, but it
has no way to record "No, I am out of town." So a lead cannot tell "not coming" from
"has not picked a task yet," and re-asks people who already answered. The troop's Google
Sheet solves this the old way: a standing roster with "Attending? = Yes/No/Maybe/Blank"
and a by-patrol rollup. "Blank" is the chase target. The multi-day case (Obon) is what
tangled the sheet, because it bolts per-day answers onto a whole-event layout.

## Goal

1. A standing, group-owned **directory** of people (name, group, sub-group, active).
2. **RSVP** per person per event: Yes / No / Maybe + reason, one tap. The whole-event
   answer is the slice-1 grain and solves the stated pain on its own. Per-day refinement
   is deferred (see Scope); the `Rsvp.day` column ships now so adding it stays additive.
3. **Chase views**: who has not answered, grouped by sub-group.
4. **Minimal delegation**: private, revocable links that scope a lead to one group.
5. The **Organization seam**: one seeded org today, `orgId` on the roots.

## North star

Kniberg self-organizing + the Patrol Method. Each group shapes its own internal
structure and owns its own roster. The org coordinator sees only "Scouts: 40, 22 in"
counts, never the individual children or the patrols inside. Signups and RSVPs are
volunteer signals, never assignments.

---

## Scope

**In this spec:** Organization seam, group-owned People directory, per-day RSVP with
reasons, chase rollups, group-level lead links.

**Deferred (named so the map is on paper):**
- **Sub-project 2: delegation tree.** Leads appoint sub-leads from their own page
  (`appointedById`, cascade revocation); sub-group scoping; board coverage on the report.
- **Sub-project 3+: universal platform** (Rev. Opel): toggleable sections for ongoing
  needs, supplies, fundraising; **per-group accounts** (replacing the shared password and
  closing the last privacy gap below); org routing; org onboarding.
- **Per-day RSVP refinement.** Slice 1 records one whole-event answer per person
  (`day = null`). The `Rsvp.day` column and the `effectiveStatus` override rule ship now
  so the split-weekend case (Obon) is a later write path and UI, never a migration. Reason:
  the live pain is Blank-vs-No at the whole-event grain; splitting a day is speculative
  until a real person needs it. YAGNI.
- **Self-serve RSVP** (people answer their own link) and reminders. The RSVP model is
  built to accept these without change.

---

## Privacy first (this drives the design, not the other way round)

The directory holds minors' names, patrols, attendance, and free-text reasons. Design
rules, enforced by tests:

1. **Data minimization.** Store only what the chase needs: `name`, `group`, `subGroup`,
   `minor`, `active`. **Do not import or display contact details** (email/phone) in this
   slice; the columns exist for the later reminder sub-project but stay empty and unshown.
2. **No raw Scout IDs at rest.** The Scout ID is a sensitive external identifier used only
   to dedup the import. Store a **salted hash** (`externalIdHash`), never the raw number,
   and never display it. Matching still works; a database leak reveals no membership IDs.
3. **Minor names always abbreviated** where shown, via `boardDisplayName(name, minor)`
   ("Alex T."). Server-side, so a full surname never reaches a browser.
4. **Reasons are sensitive free text** ("out of country," and worse). They appear only on
   the group lead's revocable view, never at org level, never public, never indexed.
   Reasons are optional; the UI never requires one.
5. **Role-scoped visibility.**
   - **Group lead** (token): their group's individuals, abbreviated, plus RSVP entry.
   - **Org coordinator** (password): per-group **rollup counts only** (attendance and
     coverage), never the individual roster of another group's minors.
6. **Token hygiene for lead links.** `noindex`, `referrer-policy: no-referrer`, and no
   third-party resources on the page, so a token never leaks via search engines, the
   Referer header, or an embedded request. Tokens are random, revocable, and single-group.
7. **Retention.** RSVP rows are event-scoped. Clearing an event's RSVPs removes its
   reasons. The standing directory persists; a person can be deactivated, not surfaced.
8. **Known limitation, closed in sub-project 3.** With one shared password and no
   accounts yet, the password-holder can reach a group's roster. That is acceptable while
   the password-holder is the group's own organizer (you, for Scouts). Per-group accounts
   later give each group a private login and hide individuals from the org coordinator
   entirely. This spec adds no barrier to that.

---

## Data model

New: `Organization`, `Person`, `Rsvp`, `Lead`. `Event` gains `orgId`. `Task`/`Signup`
unchanged this slice.

```prisma
model Organization {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  people    Person[]
  events    Event[]
  leads     Lead[]
}

model Person {
  id             String   @id @default(cuid())
  orgId          String
  org            Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  name           String
  externalIdHash String?  // salted hash of the source id (Scout ID) for import dedup only
  email          String?  // reserved for reminders; not imported or shown this slice
  phone          String?  // reserved for reminders; not imported or shown this slice
  group          String?  // organizer-facing group, joins Task.requestedGroup
  subGroup       String?  // internal division ("Hawk", "Team A"); blank for flat groups
  position       String?  // free-text role from the source ("SPL", "PL", "Captain")
  minor          Boolean?
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())
  rsvps          Rsvp[]

  @@unique([orgId, externalIdHash])
  @@index([orgId, group, subGroup])
}

model Rsvp {
  id        String     @id @default(cuid())
  personId  String
  person    Person     @relation(fields: [personId], references: [id], onDelete: Cascade)
  eventId   String
  event     Event      @relation(fields: [eventId], references: [id], onDelete: Cascade)
  day       DateTime?  // null = whole-event answer (slice 1 writes only this). When a date
                       // lands later (per-day refinement), it is utcMidnight of the
                       // event-tz calendar day, same convention as Task.date, so the
                       // override match is exact. See RSVP semantics for the null-row rule.
  status    RsvpStatus
  reason    String?
  updatedAt DateTime   @updatedAt

  @@index([eventId, personId])
}

enum RsvpStatus { yes  no  maybe }

model Lead {
  id        String   @id @default(cuid())
  orgId     String
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  eventId   String
  event     Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  group     String   // the group scope this lead chases
  name      String
  token     String   @unique
  createdAt DateTime @default(now())

  @@index([eventId, group])
}
```

`Event` gains `orgId`, `org`, `rsvps Rsvp[]`, `leads Lead[]`. **Tenant-safe uniqueness:**
move `Event.slug` to `@@unique([orgId, slug])`. Migration seeds one `Organization`
(`{ name: "BCSF", slug: "bcsf" }`) and backfills `Event.orgId`. `resetDb` clears the new
tables.

---

## Identity and directory population (Scout ID is not universal)

- Primary key is `Person.id`. `externalIdHash` is optional.
- **Dedup order on import:** match by `(orgId, externalIdHash)` when the row has a source
  id, else create. Email is reserved and not used for matching this slice (it is not
  imported). Name alone never auto-merges; a lead reconciles by hand.
- **Two population paths, one directory:**
  1. **Bulk import** (the Scouts sheet), run by the group's organizer. Map: Scout ID →
     `hash(externalIdHash)`, First + Last → `name`, Patrol → `subGroup`, group = "Scouts",
     Position → `position`, `minor` = true for the scouts sections and false for adults,
     `active` from the section (active vs Reserve/Inactive). Idempotent by the dedup rule.
  2. **Manual add**, for groups with no sheet (BWA): add a person by name with sub-group.

Domain contract: `parsePersonRows(raw) -> ImportedPerson[]` (column mapping, trim, derive
`minor`/`active`) and idempotent `importPeople(orgId, group, rows)`.

---

## RSVP semantics

- Stored per `(person, event, day)`. **Slice 1 writes only `day = null`,** the whole-event
  answer. A dated row arrives with per-day refinement later and overrides the null row for
  that day.
- **Coarse answer is one write.** "Coming? Yes" writes one `day = null` row; "No, out of
  town" writes one `day = null` row with the reason.
- **Effective status for a (person, day)** = the day-specific row, else the null row, else
  **Blank**. With slice-1 data (null rows only) this reduces to null-row-or-Blank. The
  function ships forward-compatible so the per-day path is a data change, not a code change.
- **Event rollup** ("is this person coming?"): Yes if any effective day is Yes, else Maybe
  if any is Maybe, else No if they said No, else Blank.
- **Single-day event** is the degenerate case; no multi-day branch anywhere.
- **Exactly one `day = null` row per `(person, event)`.** Postgres treats `NULL`s as
  distinct, so a plain unique index does not enforce this. Use a partial unique index
  `@@unique([personId, eventId])` scoped `WHERE day IS NULL` (raw SQL in the migration, or
  PG15 `NULLS NOT DISTINCT`). `setRsvp` upserts on that key; the index is the guardrail, not
  optional hardening. `getEventRsvps` filters `active` people only, so deactivated members
  never inflate a count.

## Chase views (rollups)

Pure domain functions over people + effective RSVP:
- **Status counts** per group and sub-group over **active** people: Yes / Maybe / No /
  Blank. Blank is the number the lead drives down.
- **Chase list**: Blank first, then Maybe, grouped by sub-group, with any reason shown.
  Answered-Yes people settle out of the way. This is the anti-re-ask mechanism.

## Who does what (roles, corrected for privacy)

- **Org coordinator** (existing password, on the organize page): sees per-group **rollup
  cards** (attendance + task coverage). Creates group-level `Lead`s and copies their links.
  Never sees another group's individual roster. Runs the one-time bulk import for a group
  the password-holder owns (see the known-limitation note).
- **Group lead** (`/lead/[token]`, no password): the working surface. Sees their group's
  chase view and records RSVPs one tap at a time as they reach people. Multiple leads per
  group, so Simon and Naoto both get Scouts links. Read + RSVP-write for one group only;
  no contact details, no bulk export, revocable.

---

## User experience (mobile-first, "Matsuri at Dusk")

The lead is chasing people on a phone, often mid-call. The experience must make "record an
answer" effortless and "who is left" obvious.

- **Lead with the gap, not the list.** The chase view opens on "You've heard from 22 of 40.
  18 to go," with progress rendered in the lantern/pad motif already in `globals.css`. The
  point of the tool is the shrinking number.
- **One tap to record.** Each person is a row with three fat, thumb-sized buttons: Yes /
  No / Maybe. Tapping sets the status optimistically (no full-page reload) and settles the
  row. A reason is an optional inline field revealed after No/Maybe, never required.
- **Answered people get out of the way.** Blank rows sit at top, grouped by sub-group;
  answered rows dim and drop below. The lead never re-reads a name they already handled.
- **One question, "Coming?"** Slice 1 asks the whole-event question only. Obon shows one
  Yes/No/Maybe per person, no grid. The per-day "which days?" affordance is deferred with
  the per-day write path (see Scope); this UI adds it without reshaping the surface.
- **Reason as context, not a form.** When someone declined, the reason ("out of town")
  shows quietly beside them so the lead knows not to chase and why.
- **Org rollup at a glance.** The coordinator's cards read like the sheet's summary:
  per group, Yes/Maybe/No/Blank and coverage, no scrolling through names.
- **Copy-link is one tap** with a clear "Copied" confirmation; regenerate warns it kills
  the old link; remove confirms.
- **Friendly empty and error states**, on brand: an unassigned group ("No one added to
  Hawk yet"), a fully-answered group ("All 8 accounted for 🎉"), an invalid token ("This
  link isn't valid, ask your organizer for a fresh one").
- **Accessibility, WCAG 2.1 AA.** Every control labeled and keyboard-operable; status is
  never color-only (icon + text, so Yes/No/Maybe read without color); contrast meets AA.
  The repo already runs an axe check; the new pages must pass it with zero violations.

---

## Components and layering (existing clean architecture)

### Domain (pure, unit-tested): `lib/domain/rsvp.ts`, `lib/domain/roster.ts`
`effectiveStatus`, `eventStatus`, `statusCounts`, `chaseList`, `parsePersonRows`.

### Repository (DB-tested): `lib/repository/directory.ts`, `rsvp.ts`, `leads.ts`
`importPeople`, `addPerson`, `deactivatePerson`, `getDirectory(orgId, group)`,
`setRsvp(personId, eventId, day, status, reason)`, `getEventRsvps(eventId)`,
`getGroupRollups(eventId)` (counts only, for the org view), `createLead`, `removeLead`,
`regenerateLeadToken`, `getLeadChaseView(token)` (null on unknown token; group + counts +
chase list, abbreviated names, no contact details).

### Actions: `app/actions/leads.ts` (organizer-gated: create/remove/regenerate, import),
`app/actions/rsvp.ts` (`setRsvp` authorized by a **valid lead token for that person's
group**, not the password; scoped so a token can only write its own group).

### Pages / components (unit-tested)
- `components/organize/GroupRollups.tsx`: per-group count cards, no PII.
- `components/organize/LeadsPanel.tsx`: create/copy/regenerate/remove leads.
- `components/ChaseView.tsx`: the lead's read + one-tap-RSVP surface.
- `app/lead/[token]/page.tsx`: `force-dynamic`, `noindex`/no-referrer, renders `ChaseView`
  or the friendly invalid message.

---

## Multi-tenancy guardrails

One `Organization` seeded now; `orgId` on `Person`, `Event`, `Lead`. Every directory/RSVP/
lead query scoped by org through the event or person. `Event.slug` unique per org. Deferred
and additive: per-group accounts, routing, onboarding.

## Error handling

Unknown token → friendly page. `setRsvp` from a token whose group does not match the
person's group → rejected. Import row with no source id → new person. `removeLead`/
`regenerateLeadToken` on a missing id → `false`/`null`. Lead for an empty group → allowed,
shown empty.

## Testing strategy (strict TDD)

- **Domain unit:** `effectiveStatus` override + rollup; `eventStatus` precedence
  (yes > maybe > no > blank); `statusCounts`/`chaseList` grouping and Blank-first order;
  `parsePersonRows` mapping and `minor`/`active` derivation.
- **Repository DB:** `importPeople` idempotent by `externalIdHash`, never storing the raw
  id; `setRsvp` upsert of the null row, second write updates in place, and the partial
  unique index rejects a duplicate null row; `getGroupRollups` counts active only;
  lead create/remove/regenerate; `getLeadChaseView` scoping, abbreviated names, no contact
  fields, null on bad token; two seeded orgs stay isolated.
- **Actions DB:** organizer gate on lead/import; `setRsvp` authorized only by a matching
  lead token and rejected cross-group; revalidation.
- **Components unit:** `GroupRollups` counts and no names; `LeadsPanel` flows; `ChaseView`
  one-tap status, optional reason, progress, Blank-first order, minor abbreviation, empty
  and invalid states.
- **Accessibility:** the new pages pass the repo's axe check with zero violations; status
  conveyed by icon + text, not color alone.

## Future direction (recorded, not built)

Rev. Opel's universal platform (toggleable ongoing-needs / supplies / fundraising sections),
per-group accounts that close the known privacy limitation, self-serve RSVP links, and
reminders (text-first, tiered minor routing) all read off this standing directory and the
`orgId` seam. Delegation grows into the full tree (sub-project 2).

## Out of scope

The delegation tree and sub-group scoping, universal sections, per-group auth/routing,
self-serve RSVP, reminders, contact-detail capture, and any change to the task board.
