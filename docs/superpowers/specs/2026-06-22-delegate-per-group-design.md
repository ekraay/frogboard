# Delegate per Group — Design Spec

**Sub-project 1 of "Delegated Organizing."** Appoint a lead for a group within
an event; give that lead a private, revocable link to a read-only coverage
report for their group's tasks.

**Source of truth for decisions:** `docs/design/2026-06-22-delegated-organizing-review-handoff.md`.
This spec implements that handoff. Reminders, gap-chasing, and accounts are
separate, later sub-projects.

---

## Goal

A head organizer appoints a lead for a `requestedGroup` (e.g. "Hawks", "YAO")
within an event. The lead receives a private URL to a read-only report: their
group's tasks, gaps first, each showing `definitionOfDone` and who has signed up.
The link is revocable.

## North star (Kniberg self-organizing)

- **No bottleneck.** The lead's report removes the organizer from the loop.
- **Self-selection, not assignment.** Signups stay volunteer-driven.
  `requestedGroup` is an invitation ("Hawks, come help"), never "assigned to."
  No field becomes an assignment.
- **Brief the intent, show Done.** `definitionOfDone` surfaces in the report.
- **Coverage and gaps, not steps.** The report shows what is unfilled, not a
  checklist of how.

**Conscious departure:** leads are **appointed, not claimed.** A patrol leader is
elected, then handed the link. We reject "whoever opens the link first owns it."
Justified by scouting's accountability needs. This is deliberate, not a
contradiction of self-organizing.

## Delegation spine: GROUP

Delegation keys on `requestedGroup`, not `category`. Confirmed constraint: one
group per task (already true; `requestedGroup` is single-valued). `category`
survives only as free-text sub-grouping *within* a report.

---

## Data model

New `Delegate` model. No change to `Task`.

```prisma
model Delegate {
  id             String   @id @default(cuid())
  eventId        String
  event          Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  requestedGroup String   // the group this lead owns; joins to Task.requestedGroup
  name           String
  email          String?
  phone          String?
  token          String   @unique // unguessable; the lead's private report link
  createdAt      DateTime @default(now())

  @@unique([eventId, requestedGroup]) // one lead per group per event
}
```

`Event` gains `delegates Delegate[]`. Token uses the existing generator
(`newClaimToken` in `lib/security/tokens.ts`); rename-agnostic, a random secret.

Migration: `prisma migrate dev` on the dev DB, `db:migrate:test` on the test DB;
prod applies on the Vercel build.

---

## Contact resolution (issue 5, decided)

Pure rule, used on the board and later in reminders:

```
contact(task, delegateName) = task.pointOfContact (if non-empty)
                            ?? delegateName (the lead of task.requestedGroup)
                            ?? null
```

**Migration of existing `pointOfContact`: non-destructive.** Existing per-task
values remain as **overrides**; the delegate is the default only where
`pointOfContact` is null. No data migration, no auto-clear.

---

## Stable join (issue 1, decided)

`requestedGroup` is free text and now load-bearing, so the join must not lie.

- **Assigning a lead picks from groups already in use** on the event's tasks (a
  dropdown of distinct non-empty `requestedGroup` values). No free typing of the
  group at assignment time.
- **The Leads panel flags an orphaned delegate** whose `requestedGroup` matches
  zero current tasks: "No tasks ask for Hawks right now." A later rename surfaces
  visibly, never as a silent zero.
- No `Group` entity in this slice. That normalization is the fallback if
  free-text proves messy.

## Mixed group types (issue 2, decided)

Flat group list. Nothing here assumes a group is a patrol (no minor-routing in
this slice; that belongs to the reminder sub-project). Partner orgs (YAO, BWA)
and patrols are handled identically for now.

## Token revocation (issue 3, decided)

- `removeDelegate(id)` deletes the row, revoking the link.
- `regenerateDelegateToken(id)` mints a new token, killing the old link.
- Both organizer-gated. A departed lead's window closes.

---

## Components and layering (follows existing clean architecture)

### Domain (pure, unit-tested) — `lib/domain/delegate.ts`
- `resolveContact(pointOfContact: string | null, delegateName: string | null): string | null`
  applies the resolution rule (trims; empty string counts as absent).
- Reuse `coverageFor` and `getSlotInfo` from `lib/domain/board.ts` for coverage.
- `gapsFirst(tasks)`: stable sort, understaffed tasks before full ones (uses
  `getSlotInfo(t).isFull`).
- `groupByCategory(tasks)`: ordered map of category → tasks, for report
  sub-headings (null/empty category grouped last under "Other").

### Repository (DB-tested) — `lib/repository/delegates.ts`
- `upsertDelegate(eventId, requestedGroup, { name, email, phone }): Promise<Delegate>`
  create or update by `(eventId, requestedGroup)`; mint token on create, preserve
  on update.
- `removeDelegate(id): Promise<boolean>` — true when a row was deleted.
- `regenerateDelegateToken(id): Promise<Delegate | null>` — null when missing.
- `getEventGroups(eventId): Promise<{ requestedGroup; covered; total; delegate: Delegate | null }[]>`
  one row per distinct in-use `requestedGroup`, with coverage and its lead (if
  any). Drives the Leads panel. Also includes any delegate whose group is now
  orphaned (zero tasks), flagged with `total: 0`.
- `getDelegatePatch(token): Promise<{ eventName; requestedGroup; delegateName; tasks: PatchTask[] } | null>`
  null on unknown token. `PatchTask` carries title, schedule, location,
  `definitionOfDone`, slot counts, and signup display names.

### Actions (organizer-gated, DB-tested) — `app/actions/delegates.ts`
- `saveDelegate(formData)` — assign/update; `requestedGroup` must be one of the
  event's in-use groups.
- `removeDelegate(id)`, `regenerateDelegateToken(id)`.
- All call `requireOrganizer()` and `revalidatePath("/organize/...")`.

### Pages / components (unit-tested)
- `components/organize/LeadsPanel.tsx` — on `/organize/[eventId]` above the grid.
  Per group: name, coverage ("7 of 9 covered"), the lead or an "Assign lead"
  inline form (group dropdown + name + optional email/phone), **Copy link**,
  **Regenerate link**, **Remove**. Orphaned groups show the warning.
- `components/organize/DelegatePatch.tsx` — the read-only report.
- `app/lead/[token]/page.tsx` — `force-dynamic`, no password; resolves the token,
  renders `DelegatePatch`, or a friendly "this link isn't valid" on null.
- Wire `LeadsPanel` into `app/organize/[eventId]/page.tsx`.

---

## The delegate report (`/lead/[token]`)

- Header: lead name, group, event name, coverage summary.
- Tasks **gaps-first**, sub-grouped by `category`. Each task: title, when/where,
  "X of N filled," `definitionOfDone` ("what good looks like"), and signed-up
  names with minors abbreviated via `boardDisplayName` (`lib/domain/displayName.ts`).
- **No volunteer contact details** in this slice. A quiet note: "Reminders and
  nudges are coming."
- Invalid token → friendly message, not an error page.

Cohesive with the "Matsuri at Dusk" aesthetic already in `app/globals.css`.

---

## Privacy and security

- Token is random and unguessable; it grants read access to **one group's report**
  only. Revocable via remove/regenerate.
- Names shown with minor abbreviation; no volunteer phone/email.

## Error handling

- Invalid/unknown token → friendly page.
- Assigning a lead to a group with zero tasks: allowed, shown as orphaned.
- `removeDelegate`/`regenerateDelegateToken` on a missing id → `false`/`null`,
  handled gracefully.
- One-lead-per-group enforced by `@@unique`; `upsertDelegate` updates in place.

## Testing strategy (strict TDD, red → green → refactor)

- **Domain unit:** `resolveContact` precedence (override, fallback, both null,
  whitespace); `gapsFirst` ordering; `groupByCategory`.
- **Repository DB:** upsert creates-then-updates and enforces one-per-group;
  token minted on create, preserved on update, changed on regenerate; remove
  revokes; `getEventGroups` coverage + orphan flagging; `getDelegatePatch`
  returns the right tasks/signups and null on bad token.
- **Actions DB:** organizer gate; group-must-be-in-use validation; revalidation.
- **Components unit:** `LeadsPanel` renders groups + coverage + copy/regen/remove
  and the orphan warning; `DelegatePatch` renders gaps-first, `definitionOfDone`,
  minor privacy, empty and invalid states.

## Out of scope (later sub-projects)

Reminders (text-first, consolidated, tiered minor-routing), volunteer contact
details on the report, delegate-driven nudges/reassignment, a normalized `Group`
entity, real accounts.
