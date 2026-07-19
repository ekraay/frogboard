# Groups Sub-project 1a: Managed Groups and Membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text `Person.group`/`subGroup` with real `Group` and `Membership` entities, migrate existing data into them, and re-point every group read and write onto them, with no visible change.

**Architecture:** Expand-migrate-contract. This slice expands (adds tables), backfills existing rows with an idempotent artifact, and re-points reads and writes, while keeping the `Person.group`/`subGroup` strings dual-written as a fallback. A later, separate contract migration (not in this plan) drops the strings. No feature flag: this changes storage, not surfaces.

**Tech Stack:** Next.js (App Router, customized per `AGENTS.md`), Prisma 6 + Postgres (Neon), Vitest (jsdom unit + node `*.db.test.ts`).

## Global Constraints

- **Invisible:** every existing test keeps its current output assertions. Behavior a user can see does not change.
- **TDD mandatory** (red -> green -> refactor). Schema/migration steps are the documented exception, verified by running the suites and `tsc`.
- **Import moves, does not add:** re-importing a matched person replaces their membership with the target group (today's overwrite semantics). A plain membership upsert would leave them in two groups.
- **Dual-write the strings** (`Person.group`/`subGroup`) through this slice; do not drop them here.
- **Backfill covers all people with a non-null group** (active or inactive), and is one idempotent, re-runnable SQL artifact executed by both the migration and a db test.
- **Reserved seam:** group-lead roles will attach to `Membership` later as an additive field; add no column now.
- **Gate before "done":** `npm test && npm run test:db && npx tsc --noEmit && npm run lint`, all green.

**Migration structuring note (deliberate refinement of the spec's "same migration"):** the structural migration (tables) is applied in Task 1 so later tasks' tests can use the tables, and the backfill is a separate idempotent data migration in Task 3. Two migrations (structural, then data) keep the task ordering clean and each migration immutable. The testability and auto-apply properties the spec requires are unchanged: the backfill's canonical SQL lives in `prisma/sql/backfill-groups.sql`, the data migration runs it on deploy, and the db test runs the same file.

---

### Task 1: Schema, tables migration, and test-reset

**Files:**
- Modify: `prisma/schema.prisma` (add `Group`, `Membership`, back-relations)
- Create: `prisma/migrations/<timestamp>_add_groups_and_membership/migration.sql` (via Prisma)
- Modify: `test/db.ts` (truncate the new tables)

**Interfaces:**
- Produces: `Group { id, orgId, name, createdAt }` with `@@unique([orgId, name])`; `Membership { id, personId, groupId, subGroup, createdAt }` with `@@unique([personId, groupId])`. Later tasks consume these models via the Prisma client.

- [ ] **Step 1: Add the models to the schema**

In `prisma/schema.prisma`, add the back-relations and the two models:

```prisma
// in model Organization, add:
  groups Group[]

// in model Person, add:
  memberships Membership[]
```

```prisma
model Group {
  id          String       @id @default(cuid())
  orgId       String
  org         Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  name        String
  createdAt   DateTime     @default(now())
  memberships Membership[]

  @@unique([orgId, name])
}

model Membership {
  id        String   @id @default(cuid())
  personId  String
  person    Person   @relation(fields: [personId], references: [id], onDelete: Cascade)
  groupId   String
  group     Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  subGroup  String?
  createdAt DateTime @default(now())

  @@unique([personId, groupId])
  @@index([groupId])
}
```

- [ ] **Step 2: Generate and apply the tables migration**

Run: `npx prisma migrate dev --name add_groups_and_membership`
Expected: a new migration with `CREATE TABLE "Group"` and `CREATE TABLE "Membership"`, applied to the dev database, and the client regenerated. (If `migrate dev` reports drift on the dev database, use `npx prisma migrate dev --create-only --name add_groups_and_membership` then `npx prisma migrate deploy`.)

- [ ] **Step 3: Truncate the new tables in resetDb**

In `test/db.ts`, add membership and group deletions in FK-safe order (membership is a child of both person and group):

```ts
  await prisma.auditLog.deleteMany();
  await prisma.signup.deleteMany();
  await prisma.rsvp.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.person.deleteMany();
  await prisma.group.deleteMany();
  await prisma.task.deleteMany();
  await prisma.event.deleteMany();
```

- [ ] **Step 4: Verify nothing broke (schema-task check)**

Run: `npm test && npm run test:db && npx tsc --noEmit && npm run lint`
Expected: all green. The tables exist and are unused; behavior is unchanged.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations test/db.ts
git commit -m "feat(groups): add Group and Membership tables (unused; expand step)"
```

---

### Task 2: Group and membership repository helpers

**Files:**
- Create: `lib/repository/groups.ts`
- Create: `lib/repository/groups.db.test.ts`

**Interfaces:**
- Produces:
  - `upsertGroup(orgId: string, name: string): Promise<string>` returns the group id, idempotent and race-safe.
  - `resolveGroupId(orgId: string, name: string): Promise<string | null>`.
  - `moveMembership(personId: string, groupId: string, subGroup: string | null): Promise<void>` makes the target the person's sole membership.
- Consumed by Tasks 4-7.

- [ ] **Step 1: Write the failing tests**

Create `lib/repository/groups.db.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { upsertGroup, resolveGroupId, moveMembership } from "@/lib/repository/groups";

const ORG = "org_bcsf";
beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

test("upsertGroup creates once and returns the same id on repeat", async () => {
  const a = await upsertGroup(ORG, "Scouts");
  const b = await upsertGroup(ORG, "Scouts");
  expect(a).toBe(b);
  expect(await prisma.group.count({ where: { orgId: ORG, name: "Scouts" } })).toBe(1);
});

test("resolveGroupId returns null for an unknown name", async () => {
  expect(await resolveGroupId(ORG, "Nope")).toBeNull();
});

test("moveMembership makes the target the person's only membership", async () => {
  const p = await prisma.person.create({ data: { orgId: ORG, name: "Simon" } });
  const scouts = await upsertGroup(ORG, "Scouts");
  const taiko = await upsertGroup(ORG, "Taiko");
  await moveMembership(p.id, scouts, "Fox");
  await moveMembership(p.id, taiko, null);
  const memberships = await prisma.membership.findMany({ where: { personId: p.id } });
  expect(memberships).toHaveLength(1);
  expect(memberships[0].groupId).toBe(taiko);
  expect(memberships[0].subGroup).toBeNull();
});
```

- [ ] **Step 2: Run the tests, watch them fail**

Run: `npm run test:db -- lib/repository/groups.db.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the helpers**

Create `lib/repository/groups.ts`:

```ts
import { prisma } from "@/lib/db";

/** Find-or-create a group by name, race-safe against a concurrent create. */
export async function upsertGroup(orgId: string, name: string): Promise<string> {
  const existing = await prisma.group.findUnique({ where: { orgId_name: { orgId, name } }, select: { id: true } });
  if (existing) return existing.id;
  try {
    const created = await prisma.group.create({ data: { orgId, name }, select: { id: true } });
    return created.id;
  } catch (e: unknown) {
    // P2002: another writer created it between our read and write.
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      const now = await prisma.group.findUniqueOrThrow({ where: { orgId_name: { orgId, name } }, select: { id: true } });
      return now.id;
    }
    throw e;
  }
}

export async function resolveGroupId(orgId: string, name: string): Promise<string | null> {
  const g = await prisma.group.findUnique({ where: { orgId_name: { orgId, name } }, select: { id: true } });
  return g?.id ?? null;
}

/** Make `groupId` the person's sole membership (move, not add), carrying subGroup. */
export async function moveMembership(personId: string, groupId: string, subGroup: string | null): Promise<void> {
  await prisma.$transaction([
    prisma.membership.deleteMany({ where: { personId, NOT: { groupId } } }),
    prisma.membership.upsert({
      where: { personId_groupId: { personId, groupId } },
      create: { personId, groupId, subGroup },
      update: { subGroup },
    }),
  ]);
}
```

- [ ] **Step 4: Run the tests, watch them pass**

Run: `npm run test:db -- lib/repository/groups.db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/repository/groups.ts lib/repository/groups.db.test.ts
git commit -m "feat(groups): group/membership repo helpers (upsert, resolve, move)"
```

---

### Task 3: Idempotent backfill (data migration + test)

**Files:**
- Create: `prisma/sql/backfill-groups.sql` (canonical, idempotent)
- Create: `prisma/migrations/<timestamp>_backfill_groups/migration.sql` (holds the same SQL)
- Create: `lib/repository/backfill.db.test.ts`

**Interfaces:**
- Consumes: `Group`, `Membership`, `Person` (Task 1). Produces no code interface; a one-time data transform.

- [ ] **Step 1: Write the canonical backfill SQL**

Create `prisma/sql/backfill-groups.sql`. It is idempotent: groups insert on conflict do nothing; memberships insert only where absent. It covers every person with a non-null group, active or not, and carries `subGroup`.

```sql
-- One Group per distinct (orgId, group).
INSERT INTO "Group" ("id", "orgId", "name", "createdAt")
SELECT gen_random_uuid()::text, p."orgId", p."group", now()
FROM (SELECT DISTINCT "orgId", "group" FROM "Person" WHERE "group" IS NOT NULL) AS p
ON CONFLICT ("orgId", "name") DO NOTHING;

-- One Membership per grouped person, linked to that group, carrying subGroup.
INSERT INTO "Membership" ("id", "personId", "groupId", "subGroup", "createdAt")
SELECT gen_random_uuid()::text, p."id", g."id", p."subGroup", now()
FROM "Person" p
JOIN "Group" g ON g."orgId" = p."orgId" AND g."name" = p."group"
WHERE p."group" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Membership" m WHERE m."personId" = p."id" AND m."groupId" = g."id"
  );
```

- [ ] **Step 2: Write the failing backfill test**

Create `lib/repository/backfill.db.test.ts`. It arranges legacy rows, runs the canonical SQL, and asserts, including idempotency.

```ts
// @vitest-environment node
import { afterAll, beforeEach, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";

const ORG = "org_bcsf";
const SQL = readFileSync(join(process.cwd(), "prisma/sql/backfill-groups.sql"), "utf8");
const runBackfill = () => prisma.$executeRawUnsafe(SQL);

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

test("backfills groups and memberships from the legacy strings, idempotently", async () => {
  await prisma.person.create({ data: { orgId: ORG, name: "Active Scout", group: "Scouts", subGroup: "Fox" } });
  await prisma.person.create({ data: { orgId: ORG, name: "Inactive Scout", group: "Scouts", active: false } });
  await prisma.person.create({ data: { orgId: ORG, name: "Taiko Player", group: "Taiko" } });
  await prisma.person.create({ data: { orgId: ORG, name: "No Group", group: null } });

  await runBackfill();

  expect(await prisma.group.count({ where: { orgId: ORG } })).toBe(2); // Scouts, Taiko
  const scouts = await prisma.group.findUniqueOrThrow({ where: { orgId_name: { orgId: ORG, name: "Scouts" } } });
  const members = await prisma.membership.findMany({ where: { groupId: scouts.id }, include: { person: true } });
  expect(members).toHaveLength(2); // active AND inactive
  expect(members.find((m) => m.person.name === "Active Scout")!.subGroup).toBe("Fox");
  const ungrouped = await prisma.person.findFirstOrThrow({ where: { name: "No Group" } });
  expect(await prisma.membership.count({ where: { personId: ungrouped.id } })).toBe(0);

  await runBackfill(); // second run changes nothing
  expect(await prisma.group.count({ where: { orgId: ORG } })).toBe(2);
  expect(await prisma.membership.count()).toBe(3);
});
```

- [ ] **Step 3: Run it, watch it fail**

Run: `npm run test:db -- lib/repository/backfill.db.test.ts`
Expected: FAIL until the SQL file exists and is correct (Step 1 file present; run to confirm green here).

- [ ] **Step 4: Add the data migration that runs the same SQL on deploy**

Run: `npx prisma migrate dev --create-only --name backfill_groups`
Then paste the contents of `prisma/sql/backfill-groups.sql` into the new `prisma/migrations/<timestamp>_backfill_groups/migration.sql`.
Then apply: `npx prisma migrate deploy` (applies to the dev database; safe and idempotent).

- [ ] **Step 5: Run the full db suite**

Run: `npm run test:db`
Expected: PASS (the migration ran on the empty test db as a no-op; the backfill test arranges its own rows).

- [ ] **Step 6: Commit**

```bash
git add prisma/sql/backfill-groups.sql prisma/migrations lib/repository/backfill.db.test.ts
git commit -m "feat(groups): idempotent backfill from group strings (data migration + test)"
```

---

### Task 4: Re-point importPeople (move semantics + dual-write)

**Files:**
- Modify: `lib/repository/directory.ts` (`importPeople`)
- Modify: `lib/repository/directory.db.test.ts` (add the move test)

**Interfaces:**
- Consumes: `upsertGroup`, `moveMembership` (Task 2). Signature of `importPeople` is unchanged.

- [ ] **Step 1: Write the failing "moves, not adds" test**

In `lib/repository/directory.db.test.ts`, inside `describe("importPeople", ...)`, add:

```ts
  test("re-importing a person into a new group moves them (one membership)", async () => {
    await importPeople(ORG, "Scouts", [{ name: "Simon", subGroup: "Fox", position: null, externalId: "1" }], { minor: false });
    await importPeople(ORG, "Taiko", [{ name: "Simon", subGroup: null, position: null, externalId: "1" }], { minor: false });
    const person = await prisma.person.findFirstOrThrow({ where: { orgId: ORG } });
    const memberships = await prisma.membership.findMany({ where: { personId: person.id }, include: { group: true } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0].group.name).toBe("Taiko");
    expect(person.group).toBe("Taiko"); // dual-write kept in sync
  });
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run test:db -- lib/repository/directory.db.test.ts`
Expected: FAIL (no memberships created yet).

- [ ] **Step 3: Re-point importPeople**

Rewrite `importPeople` in `lib/repository/directory.ts` to upsert the group and move each person's membership, while keeping the string dual-write. Replace the batch `$transaction` body:

```ts
import { upsertGroup, moveMembership } from "@/lib/repository/groups";
// ...existing imports...

export async function importPeople(
  orgId: string,
  group: string,
  rows: ImportedPerson[],
  opts: { minor: boolean },
): Promise<{ created: number; updated: number }> {
  const groupId = await upsertGroup(orgId, group);

  const byHash = new Map<string, ImportedPerson>();
  const withoutHash: ImportedPerson[] = [];
  for (const row of rows) {
    const hash = row.externalId ? hashExternalId(row.externalId) : null;
    if (hash) byHash.set(hash, row);
    else withoutHash.push(row);
  }
  const existing = byHash.size
    ? await prisma.person.findMany({
        where: { orgId, externalIdHash: { in: [...byHash.keys()] } },
        select: { id: true, externalIdHash: true },
      })
    : [];
  const idByHash = new Map(existing.map((p) => [p.externalIdHash!, p.id]));

  const personData = (row: ImportedPerson, hash: string | null) => ({
    name: row.name, group, subGroup: row.subGroup, position: row.position,
    minor: opts.minor, externalIdHash: hash,
  });

  let created = 0;
  let updated = 0;
  // Sequential so each person's id is known for its membership move.
  for (const row of withoutHash) {
    const p = await prisma.person.create({ data: { orgId, ...personData(row, null) }, select: { id: true } });
    await moveMembership(p.id, groupId, row.subGroup);
    created++;
  }
  for (const [hash, row] of byHash) {
    const id = idByHash.get(hash);
    if (id) {
      await prisma.person.update({ where: { id }, data: { ...personData(row, hash), active: true } });
      await moveMembership(id, groupId, row.subGroup);
      updated++;
    } else {
      const p = await prisma.person.create({ data: { orgId, ...personData(row, hash) }, select: { id: true } });
      await moveMembership(p.id, groupId, row.subGroup);
      created++;
    }
  }
  return { created, updated };
}
```

- [ ] **Step 4: Run the directory suite**

Run: `npm run test:db -- lib/repository/directory.db.test.ts`
Expected: PASS (existing import tests unchanged, new move test green).

- [ ] **Step 5: Commit**

```bash
git add lib/repository/directory.ts lib/repository/directory.db.test.ts
git commit -m "feat(groups): import writes memberships (move semantics), dual-writing the string"
```

---

### Task 5: Re-point getGroupRollups

**Files:**
- Modify: `lib/repository/directory.ts` (`getGroupRollups`)
- Modify: `lib/repository/directory.db.test.ts` (add the all-inactive edge test)

**Interfaces:**
- Return shape unchanged: `{ group: string; counts: StatusCounts }[]`.

- [ ] **Step 1: Write the failing edge test**

In `lib/repository/directory.db.test.ts`, inside `describe("getGroupRollups", ...)`, add:

```ts
  test("a group whose members are all inactive does not appear", async () => {
    const e = await prisma.event.create({ data: { name: "Obon", orgId: ORG, startDate: new Date(), endDate: new Date() } });
    await importPeople(ORG, "Ghosts", [{ name: "Gone Person", subGroup: null, position: null, externalId: "g1" }], { minor: false });
    await prisma.person.updateMany({ where: { orgId: ORG, name: "Gone Person" }, data: { active: false } });
    expect(await getGroupRollups(e.id)).toEqual([]);
  });
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run test:db -- lib/repository/directory.db.test.ts`
Expected: FAIL (current query still reads `Person.group`, which the import also set; the group would appear because the read is not yet membership-based, but the person is inactive so it may pass by luck. If it passes, still proceed: the point is Step 3 must keep it green while switching source.)

- [ ] **Step 3: Re-point getGroupRollups**

Replace `getGroupRollups` in `lib/repository/directory.ts`:

```ts
export async function getGroupRollups(eventId: string): Promise<{ group: string; counts: StatusCounts }[]> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { orgId: true } });
  const memberships = await prisma.membership.findMany({
    where: { group: { orgId: event.orgId }, person: { active: true } },
    select: { personId: true, group: { select: { name: true } } },
  });
  const rsvps = await getEventRsvps(eventId);
  const byPerson = new Map<string, RsvpRecord[]>();
  for (const r of rsvps) {
    if (!byPerson.has(r.personId)) byPerson.set(r.personId, []);
    byPerson.get(r.personId)!.push({ day: r.day, status: r.status });
  }
  const groups = new Map<string, { id: string }[]>();
  for (const m of memberships) {
    const g = m.group.name;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push({ id: m.personId });
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([group, ppl]) => ({ group, counts: statusCounts(ppl, byPerson) }));
}
```

- [ ] **Step 4: Run the directory suite**

Run: `npm run test:db -- lib/repository/directory.db.test.ts`
Expected: PASS (the existing rollup test arranges via `importPeople`, which now writes memberships; the edge test passes because only-inactive groups yield no membership rows for active people).

- [ ] **Step 5: Commit**

```bash
git add lib/repository/directory.ts lib/repository/directory.db.test.ts
git commit -m "feat(groups): rollups read Group/Membership, active groups only"
```

---

### Task 6: Re-point getLeadRosterView + shared test helper

**Files:**
- Create: `test/factories.ts` (`personInGroup` helper)
- Modify: `lib/repository/leads.ts` (`getLeadRosterView` people query)
- Modify: `lib/repository/leads.db.test.ts` (unresolved-group test; swap direct fixtures if any)

**Interfaces:**
- Produces: `personInGroup(orgId, group, data?)` for direct-fixture tests.
- Return shape of `getLeadRosterView` unchanged.

- [ ] **Step 1: Write the shared helper**

Create `test/factories.ts`:

```ts
import { prisma } from "@/lib/db";
import { upsertGroup, moveMembership } from "@/lib/repository/groups";

/** A person plus their group/membership, dual-writing the legacy string. */
export async function personInGroup(
  orgId: string,
  group: string,
  data: { name: string; subGroup?: string | null; minor?: boolean | null; active?: boolean } ,
) {
  const person = await prisma.person.create({
    data: { orgId, name: data.name, group, subGroup: data.subGroup ?? null, minor: data.minor ?? null, active: data.active ?? true },
  });
  const groupId = await upsertGroup(orgId, group);
  await moveMembership(person.id, groupId, data.subGroup ?? null);
  return person;
}
```

- [ ] **Step 2: Write the failing unresolved-group test**

In `lib/repository/leads.db.test.ts` (inside `describe("getLeadRosterView", ...)`), add:

```ts
  test("returns an empty roster when the lead's group has no Group row", async () => {
    const e = await prisma.event.create({ data: { name: "Obon", orgId: ORG, startDate: new Date(), endDate: new Date() } });
    const lead = await createLead(e.id, "Nonexistent", "Simon");
    const view = await getLeadRosterView(lead.token);
    expect(view).not.toBeNull();
    expect(view!.roster).toEqual([]);
    expect(view!.counts.heard).toBe(0);
  });
```

(Adjust `counts` field to match `StatusCounts`; the intent is zeroed counts.)

- [ ] **Step 3: Run it, watch it fail**

Run: `npm run test:db -- lib/repository/leads.db.test.ts`
Expected: FAIL if the current query throws or misbehaves on an unmatched group; otherwise it should already return empty. Proceed to keep it green after the re-point.

- [ ] **Step 4: Re-point getLeadRosterView's people query**

In `lib/repository/leads.ts`, replace the people lookup:

```ts
import { resolveGroupId } from "@/lib/repository/groups";
// ...
  const groupId = await resolveGroupId(lead.orgId, lead.group);
  const memberships = groupId
    ? await prisma.membership.findMany({
        where: { groupId, person: { active: true } },
        select: { subGroup: true, person: { select: { id: true, name: true, minor: true, position: true } } },
      })
    : [];
  const people = memberships.map((m) => ({
    id: m.person.id, name: m.person.name, subGroup: m.subGroup, minor: m.person.minor, position: m.person.position,
  }));
```

Leave the rest of the function (abbreviation, `statusCounts`, `patrolSummary`, `rosterView`, `boardParam`) unchanged.

- [ ] **Step 5: Swap any direct-create fixtures to the helper**

In `lib/repository/leads.db.test.ts`, any fixture that creates a person with `prisma.person.create({ data: { ..., group } })` and expects it in the roster must use `personInGroup(ORG, group, {...})` so a membership exists. Existing tests that arrange via `importPeople` need no change.

- [ ] **Step 6: Run the leads suite**

Run: `npm run test:db -- lib/repository/leads.db.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add test/factories.ts lib/repository/leads.ts lib/repository/leads.db.test.ts
git commit -m "feat(groups): lead roster reads memberships; empty on unresolved group"
```

---

### Task 7: Re-point the lead-RSVP authorization gate

**Files:**
- Modify: `app/actions/rsvp.ts` (`setRsvpAction`)
- Modify: `app/actions/rsvp.db.test.ts`, `lib/repository/rsvp.db.test.ts` (fixtures + gate tests)

**Interfaces:**
- Consumes: `resolveGroupId` (Task 2). Behavior unchanged for existing group members.

- [ ] **Step 1: Write the failing gate tests**

In `app/actions/rsvp.db.test.ts`, arrange people via `personInGroup` and assert the membership-based gate:

```ts
import { personInGroup } from "@/test/factories";
// ...
  test("allows an active and an inactive member of the lead's group, refuses others", async () => {
    const event = await prisma.event.create({ data: { name: "Obon", orgId: ORG, startDate: new Date(), endDate: new Date() } });
    const active = await personInGroup(ORG, "Scouts", { name: "Simon Kraay" });
    const inactive = await personInGroup(ORG, "Scouts", { name: "Old Scout", active: false });
    const other = await personInGroup(ORG, "YAO", { name: "Ava Lin" });
    const lead = await createLead(event.id, "Scouts", "Simon");

    expect((await setRsvpAction(lead.token, active.id, "yes", null)).ok).toBe(true);
    expect((await setRsvpAction(lead.token, inactive.id, "no", null)).ok).toBe(true);
    expect((await setRsvpAction(lead.token, other.id, "yes", null)).ok).toBe(false);
  });
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npm run test:db -- app/actions/rsvp.db.test.ts`
Expected: FAIL (gate still reads `person.group`, and `personInGroup` dual-writes it, so this may pass by luck; the goal is Step 3 keeps it green on the membership predicate).

- [ ] **Step 3: Re-point the gate**

In `app/actions/rsvp.ts`, replace the authorization check:

```ts
import { resolveGroupId } from "@/lib/repository/groups";
// ...
  const auth = await getLeadAuth(token);
  if (!auth) return { ok: false, error: "This link isn't valid." };
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { orgId: true } });
  if (!person || person.orgId !== auth.orgId) {
    return { ok: false, error: "That person isn't in your group." };
  }
  const groupId = await resolveGroupId(auth.orgId, auth.group);
  const inGroup = groupId ? (await prisma.membership.count({ where: { personId, groupId } })) > 0 : false;
  if (!inGroup) {
    return { ok: false, error: "That person isn't in your group." };
  }
```

- [ ] **Step 4: Swap the fixtures in the rsvp db tests**

In `lib/repository/rsvp.db.test.ts` and `app/actions/rsvp.db.test.ts`, replace `prisma.person.create({ data: { orgId, name, group } })` fixtures with `personInGroup(ORG, group, { name })` so memberships exist for the re-pointed gate.

- [ ] **Step 5: Run the rsvp suites**

Run: `npm run test:db -- lib/repository/rsvp.db.test.ts app/actions/rsvp.db.test.ts`
Expected: PASS.

- [ ] **Step 6: Full gate + commit**

Run: `npm test && npm run test:db && npx tsc --noEmit && npm run lint`
Expected: all green.

```bash
git add app/actions/rsvp.ts app/actions/rsvp.db.test.ts lib/repository/rsvp.db.test.ts
git commit -m "feat(groups): lead-RSVP gate authorizes by membership, not the group string"
```

---

## Self-Review

- **Spec coverage:** model (Task 1), reserved seam (Task 1, no column), backfill covering all people, idempotent and tested (Task 3), import move-not-add + dual-write (Task 4), rollups active-groups-only + JS sort (Task 5), lead roster empty-on-unresolved (Task 6), the authorization gate re-point (Task 7), `Lead` stays a string and `Signup.group` untouched (not modified anywhere). Deploy window and rollback are runtime properties of the idempotent backfill (Task 3), not code to write.
- **Ordering:** the writer (`importPeople`, Task 4) precedes the readers (Tasks 5-7) because the rollup and lead tests arrange through it. `personInGroup` (Task 6) covers the direct-create fixtures the readers' tests use.
- **Type consistency:** `upsertGroup`/`resolveGroupId`/`moveMembership` signatures are defined in Task 2 and consumed unchanged in Tasks 4-7. Prisma composite-unique accessors are `orgId_name` and `personId_groupId`, matching the `@@unique` declarations.
- **Out of scope, correctly absent:** the directory UI, the contract migration that drops the strings, `Lead.groupId`, and multi-group creation (all later slices).
