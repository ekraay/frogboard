# Groups Sub-project 1a: Managed Groups and Membership (Invisible Foundation)

**Design doc for review.** First slice of the Groups epic (`2026-07-11-groups-epic-design.md`), sub-project 1, under the "migration first, then UI" approach. This slice adds the `Group` and `Membership` entities, migrates the existing free-text `Person.group`/`subGroup` data into them, and re-points every group read onto them. It ships **no visible change**: the directory UI is the next slice (1b).

## Goal

Replace the free-text `Person.group` model with real entities, without changing any behavior a user can see. Success is the existing test suites passing with the same output assertions, plus new tests for the entities and the backfill. This de-risks a live-prod-data migration in isolation from new UI.

## Why this slice ships nothing visible

The organizer already authenticates (shared password) and manages the roster through import. Sub-project 1a swaps the storage under the reads and writes; the screens render identically. The directory page (create/rename groups, add/remove people, group detail, import confirmation) is sub-project 1b and depends on this foundation.

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

- **Many-to-many** person-group, per the epic (no one-way door). Existing data has one group per person, so each person gets exactly one membership; multi-group is a latent capability, unused until later.
- **`subGroup` (patrol) moves onto `Membership`**, since a patrol is a person-within-group fact.
- `Group` and `Membership` get `Organization`/`Person` back-relations.

### Reserved seam for group-lead roles (accounts deferred)

Group-lead identity and authn are a separate future project (see BACKLOG "Accounts / identity & roles"), sequenced with epic sub-project 2 where leads self-serve. We reserve the seam without building it: a lead role attaches to `Membership` later as an additive field (for example `role` or `isLead`). Adding a column to a join table is a non-breaking migration, so we do **not** add a dead column now. The join table is the open door.

## Migration and backfill (expand, migrate, contract)

Standard expand-migrate-contract so the live roster is never at risk.

1. **Expand.** Create `Group` and `Membership` (additive, safe). Keep `Person.group` and `Person.subGroup` in place.
2. **Backfill** (in the same migration, so it runs automatically via the deploy's `prisma migrate deploy`):
   - One `Group` per distinct `(orgId, group)` where `group` is not null.
   - One `Membership` per active person with a group, linking to that group and carrying the person's `subGroup`.
3. **Migrate reads and writes** onto `Group`/`Membership` (below).
4. **Keep the string columns as a dual-written fallback** during the transition: `importPeople` continues to set `Person.group`/`subGroup` in addition to writing memberships. This preserves a rollback reference if a re-pointed read misbehaves in prod.
5. **Contract (a later, separate migration, not in this slice):** once the joins are proven in prod, stop dual-writing and drop `Person.group`/`Person.subGroup` and the `[orgId, group, subGroup]` index.

Rollback within 1a: the string columns still hold the pre-migration truth, so reverting the deploy restores the old reads.

## Reads and writes to re-point

Exhaustive list for this slice (a task will grep for any missed `Person.group` reader):

- **`importPeople(orgId, group, rows)`** (`lib/repository/directory.ts`): upsert the `Group` by `(orgId, group)`, upsert each `Person`, upsert each `Membership(person, group, subGroup)`. Keep setting `Person.group`/`subGroup` (dual-write). Import creating a group by name is the only way groups appear until the 1b directory ships, which matches today's behavior.
- **`getGroupRollups(eventId)`** (`lib/repository/directory.ts`): build the per-group buckets from `Group` + `Membership` instead of `Person.group`. Same return shape `{ group: name, counts }`, same name sort. Identical output for current single-membership data.
- **`getLeadRosterView(token)`** (`lib/repository/leads.ts`): resolve the lead's group name to a `Group` in the org, then scope people through its memberships, replacing `where: { group: lead.group }`. The person's `subGroup` now comes from the membership.
- **`Lead` stays a string in 1a.** `createLead(eventId, group, name)` and `getLeadAuth` keep the `group` name; only the read (`getLeadRosterView`) is re-pointed. A `Lead.groupId` is out of scope here (candidate for 1b or sub-project 3).
- **`Signup.group` is untouched.** It is a point-in-time snapshot on a signup, not a `Person.group` read.

## Testing (the invisibility proof)

- The existing db tests for rollups, leads, and import (`directory` tests, `leads.db.test.ts`, `organize.db.test.ts`, `rsvp.db.test.ts`) must keep the **same output assertions**. Their **arrange steps change**: fixtures that create a `Person` with a `group` string must also create the `Group`/`Membership` (a shared test helper, e.g. `personInGroup(...)`, keeps this clean). Same outputs from new storage is the proof the swap is invisible.
- **New unit/db tests**: `Group`/`Membership` repo functions (create/upsert group, attach membership, list groups with member counts) and a **backfill correctness test** (distinct strings become one group each; each person gets one membership carrying its subGroup; null groups produce nothing).
- Full gate as always: `npm test && npm run test:db && npx tsc --noEmit && npm run lint`.

## Rollout

- No feature flag: this slice changes storage, not surfaces, so there is nothing to gate. Safety comes from expand-migrate-contract and the kept fallback columns, not a flag.
- The backfill runs in prod automatically when the branch merges and the build runs `prisma migrate deploy` before `next build`.
- Coordinate with the parallel RSVP/lead session: this slice touches `Person`, `directory.ts`, and `leads.ts`. Keep the branch short-lived to limit conflicts.

## Open decisions (please confirm on review)

1. **Backfill mechanism**: raw SQL inside the migration (auto-runs on deploy; ids via `gen_random_uuid()::text`, cosmetically unlike cuids but functionally fine) **vs** a one-shot TS backfill script run by hand (cuid ids, but a manual prod step). Recommendation: SQL-in-migration, for automatic, atomic prod application.
2. **Dual-write duration**: keep writing the string columns through 1a and drop them in a dedicated contract migration after 1b ships and the joins are proven (recommended), or cut writes to memberships only in 1a and treat the strings as a frozen snapshot.
3. **Reserved seam**: document-only now (recommended, no dead column), or add an unused `Membership.role` field immediately.

## Out of scope (later slices / sub-projects)

- **1b**: the directory page (groups CRUD, add/remove people, group detail, import-confirmation view) and the contract migration that drops the string columns.
- **Sub-project 2**: group-first navigation, home group, and where group-lead accounts/roles land.
- **Sub-project 3**: event-group participation (rollups show only participating groups; org-wide/standing case).
- **Accounts / identity & roles**: its own project (BACKLOG), sequenced with sub-project 2.
