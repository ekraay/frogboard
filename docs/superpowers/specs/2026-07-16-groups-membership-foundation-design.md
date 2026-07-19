# Groups Sub-project 1a: Managed Groups and Membership (Invisible Foundation)

**Design doc for review.** First slice of the Groups epic (`2026-07-11-groups-epic-design.md`), sub-project 1, under the "migration first, then UI" approach. This slice adds `Group` and `Membership` entities, migrates the existing free-text `Person.group`/`subGroup` data into them, and re-points every group read and write onto them. It ships **no visible change**: the directory UI is the next slice (1b).

> Revised to incorporate an adversarial review (2026-07-17). Key corrections: import **moves** a membership rather than adding one; the lead-RSVP authorization gate is a first-class re-pointed reader; the backfill is one idempotent, re-runnable artifact that both the migration and a db test execute; the backfill covers **all** people with a group, not only active ones.

## Goal

Replace the free-text `Person.group` model with real entities, without changing any behavior a user can see. Success is the existing suites passing with the same output assertions, plus new tests for the entities, the import move-semantics, the re-pointed authorization gate, and the backfill. This de-risks a live-prod-data migration in isolation from new UI.

## The model

Add two entities. Leave `Person`, `Lead`, `Rsvp`, `Event` structurally as they are for this slice.

```prisma
model Group {
  id          String       @id @default(cuid())
  orgId       String
  org         Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  name        String
  createdAt   DateTime     @default(now())
  memberships Membership[]

  @@unique([orgId, name])   // one group name per org; the natural key the backfill maps onto
}

model Membership {
  id        String   @id @default(cuid())
  personId  String
  person    Person   @relation(fields: [personId], references: [id], onDelete: Cascade)
  groupId   String
  group     Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  subGroup  String?  // patrol: a fact about a person within one group, moved off Person
  createdAt DateTime @default(now())

  @@unique([personId, groupId])
  @@index([groupId])
}
```

- **Many-to-many** person-group, per the epic (no one-way door). Existing data has one group per person, so each person gets exactly one membership; multi-group is a latent capability, deliberately unused in 1a and enabled by the 1b directory, **not** by import (see import below).
- **`subGroup` (patrol) moves onto `Membership`**.
- Add the `Organization.groups` and `Person.memberships` back-relations.

### Reserved seam for group-lead roles (accounts deferred)

Group-lead identity and authn are a separate future project (BACKLOG "Accounts / identity & roles"), sequenced with epic sub-project 2. We reserve the seam without building it: a lead role attaches to `Membership` later as an additive field. Adding a column to a join table is non-breaking, so we add **no dead column now**. The join table is the open door.

## Migration and backfill (expand, migrate, contract)

1. **Expand.** Create `Group` and `Membership` (additive, safe). Keep `Person.group` and `Person.subGroup` in place.
2. **Backfill, as one idempotent re-runnable artifact.** The backfill is SQL that is safe to run more than once (`INSERT ... ON CONFLICT DO NOTHING`, membership insert guarded by `WHERE NOT EXISTS`). The migration runs it on deploy; a db test runs the same SQL against arranged legacy rows (see Testing). Idempotency is what makes it both automatically applied and testable, and it covers the roll-forward case (below).
   - One `Group` per distinct `(orgId, group)` where `group IS NOT NULL`.
   - One `Membership` per person (active **or inactive**) with a group, linking to that group and carrying the person's `subGroup`. Backfilling everyone matters: the contract migration later drops `Person.group`, so an inactive person excluded here would lose their affiliation permanently, and the lead-RSVP gate (which does not filter `active`) would start refusing an inactive group member it accepts today.
3. **Migrate reads and writes** onto `Group`/`Membership` (below).
4. **Keep the string columns as a dual-written fallback** through 1a and 1b: `importPeople` keeps setting `Person.group`/`subGroup` alongside the membership, preserving a rollback reference.
5. **Contract (a separate later migration, not this slice):** once proven in prod, stop dual-writing and drop `Person.group`/`Person.subGroup` and the `[orgId, group, subGroup]` index.

**Before writing the migration**, run `SELECT DISTINCT group FROM "Person"` against prod to see exactly which strings become groups. Untrimmed or case-variant legacy values would each become their own `Group` behind the `@@unique([orgId, name])` constraint; decide any canonicalization from real data, not guesses.

## Reads and writes to re-point

Complete list (a task still greps for stragglers, but each item below is a design decision, specified here):

- **`importPeople(orgId, group, rows)`** (`lib/repository/directory.ts`): **move, do not add.** Today re-importing a matched person overwrites `Person.group`, moving them. To stay invisible, import must set the imported person's membership set to exactly the target group: upsert the `Group` by `(orgId, group)` (guard the concurrent read-then-write with `ON CONFLICT DO NOTHING` or a caught `P2002`), then for each person replace their memberships with a single membership to the target group carrying `row.subGroup`, and keep dual-writing `Person.group`/`subGroup`. A plain `Membership` upsert keyed on `(personId, groupId)` would **add** a second membership and silently activate multi-group, diverging from today. (When 1b lets the directory create multi-group memberships, import's clobber rule must be revisited; that is a 1b concern, flagged in Out of scope.)
- **`getGroupRollups(eventId)`** (`lib/repository/directory.ts`): build the per-group buckets from `Group` + `Membership` (active members only). **Include only groups with at least one active member**, matching today, where a group with no active people simply does not appear (the current query filters people, not groups). Keep the JS `localeCompare` name sort rather than trusting DB collation, since the assertion is byte-identical output. Same return shape `{ group: name, counts }`.
- **`getLeadRosterView(token)`** (`lib/repository/leads.ts`): resolve the lead's group name to a `Group` in the org, then scope people through its memberships (`active: true`), replacing `where: { group: lead.group }`; `subGroup` now comes from the membership. If the name resolves to **no** `Group` (leads accept free text, see below), return an **empty** roster exactly as today, never null or a throw.
- **`setRsvpAction(token, personId, ...)`** (`app/actions/rsvp.ts`): this is the lead-RSVP **authorization gate**, today `person.group !== auth.group`. Re-point it to: the person has a `Membership` in the `Group` named `auth.group` within `auth.orgId`. Backfilling inactive people (above) keeps this behaving identically for inactive group members. This is security-sensitive; it is specified here, not left to a grep.
- **`Lead` stays a string in 1a.** `createLead(eventId, group, name)` accepts free text (`app/actions/leads.ts`) and `getLeadAuth` returns the name; only the reads above are re-pointed. A `Lead.groupId` is out of scope here (candidate for 1b or sub-project 3).
- **`Signup.group` is untouched.** It is a point-in-time snapshot on a signup, verified not to be a `Person.group` read.

## Testing (the invisibility proof)

- **Fixture churn is small, and that is a design win.** Most db tests arrange through `importPeople`, which dual-writes, so they need **no** arrange changes; their output assertions stand unchanged as the invisibility proof. Only the fixtures that call `prisma.person.create` directly with a `group` string (`lib/repository/rsvp.db.test.ts`, `app/actions/rsvp.db.test.ts`) need a shared `personInGroup(...)` helper that also creates the `Group`/`Membership`.
- **New tests:**
  - **Backfill correctness**, run against the idempotent SQL: arrange legacy `Person.group`/`subGroup` rows (including an inactive person, a null-group person, and two people sharing a group name), execute the backfill SQL, assert one `Group` per distinct string, one `Membership` per grouped person carrying its `subGroup`, nothing for null groups, and that a second execution changes nothing (idempotent).
  - **Import moves, not adds**: import a matched person into a second group; assert exactly one membership (the new group), the old one gone, and `Person.group` equal to the new name.
  - **Re-pointed authorization gate**: a lead may set an RSVP for an active and an inactive member of its group, and is refused for a person in another group and for a person whose group has no `Group` row.
  - **Rollup edge case**: a group whose members are all inactive does not appear.
- Full gate: `npm test && npm run test:db && npx tsc --noEmit && npm run lint`.

## Rollout and rollback

- **No feature flag**: this slice changes storage, not surfaces. Safety comes from expand-migrate-contract, the dual-written fallback columns, and the idempotent backfill, not a flag.
- **Deploy window (stated, not hidden):** the backfill runs during `prisma migrate deploy` in the build while the old code still serves. An import in that window writes strings only, so the new deployment would see no membership for those people until the backfill re-runs. Because the backfill is idempotent and re-runnable, and because there is one organizer and a minutes-long window, this is near-zero risk; a re-run closes it fully.
- **Rollback is symmetric because the backfill re-runs.** Reverting the deploy restores the old string reads (dual-write kept them fresh). Rolling forward again does **not** leave memberships stale for anyone imported while rolled back, because the idempotent backfill runs again and fills them.

## Decisions (resolved with the adversarial review)

1. **Backfill mechanism**: idempotent SQL, in the migration for automatic prod application **and** executed by the db test against arranged rows. Not a trade-off between "auto-runs" and "tested"; idempotency gives both.
2. **Dual-write duration**: keep dual-writing the string columns through 1a and 1b; drop them in a dedicated contract migration afterward. The frozen-snapshot alternative is struck (it would break the rollback story).
3. **Reserved seam**: document-only, no column.

## Out of scope (later slices / sub-projects)

- **1b**: the directory page (groups CRUD, add/remove people, group detail, import-confirmation view), the contract migration that drops the string columns, and revisiting import's move-vs-add rule once the directory can create multi-group memberships.
- **Sub-project 2**: group-first navigation, home group, and where group-lead accounts/roles land.
- **Sub-project 3**: event-group participation.
- **Accounts / identity & roles**: its own project (BACKLOG), sequenced with sub-project 2.
