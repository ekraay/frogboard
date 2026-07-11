# Roster + RSVP (with minimal delegation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each group a standing directory of people, let a lead record whole-event RSVP (Yes/No/Maybe + reason) one tap at a time, and hand leads a private link to their by-sub-group chase view, all behind a multi-tenant org seam.

**Architecture:** Clean layering the codebase already uses: pure domain (`lib/domain`) → DB repository (`lib/repository`) → server actions (`app/actions`) → pages/components. New Prisma models `Organization`, `Person`, `Rsvp`, `Lead`; `Event` gains `orgId`. The organizer (password) sees per-group count rollups and appoints leads; a lead (revocable token) sees and edits only their group's RSVPs.

**Tech Stack:** Next.js App Router (read guides in `node_modules/next/dist/docs/` before writing routes), Prisma v6 + Postgres, React, Vitest (jsdom unit; node `*.db.test.ts`), Tailwind ("Matsuri at Dusk" tokens in `app/globals.css`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-08-roster-rsvp-design.md`. This supersedes the delegate-per-group spec/plan.
- Privacy is enforced by tests: no raw Scout IDs at rest (store `externalIdHash`); no contact details imported or shown; minor names abbreviated via `boardDisplayName(name, minor)`; reasons appear only on the lead view; lead pages are `noindex` + no-referrer.
- Slice 1 records only the whole-event answer (`Rsvp.day = null`). The `day` column and override rule ship for additivity but no per-day write path exists yet.
- Roles: org coordinator (existing `ORGANIZER_PASSWORD` cookie session) sees rollup counts only and appoints leads; a lead token authorizes RSVP writes for its own group only.
- One `Organization` seeded now (`id = 'org_bcsf'`, name "BCSF", slug "bcsf"); `orgId` non-null on `Person`, `Event`, `Lead`. `Event.slug` unique per org.
- Prisma pinned to v6; `DATABASE_URL` stays in `schema.prisma`.
- Writing style (repo CLAUDE.md): omit needless words, active voice, no em dash. Applies to comments and commit messages.
- Before done: `npm test` and `npm run test:db` green, plus `npx tsc --noEmit` and `npm run lint`. New pages pass the repo axe check with zero violations.
- Strict TDD: red → green → refactor. Schema/migration is the documented exception, verified by running the suites.

---

### Task 1: Schema, migration, org seed, test reset

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_roster_rsvp/migration.sql` (via `--create-only`, then hand-edited)
- Modify: `test/db.ts`

**Interfaces:**
- Produces: models `Organization`, `Person`, `Rsvp` (+ enum `RsvpStatus`), `Lead`; `Event.orgId` (non-null, FK) and back-relations; `Event.slug` unique per org. Prisma client accessors `prisma.organization`, `prisma.person`, `prisma.rsvp`, `prisma.lead`.

Schema-migration TDD exception: verified by a green client regen, both databases applied, and `tsc`.

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Add to the `Event` model (alongside `tasks Task[]`): `orgId String`, `org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)`, `rsvps Rsvp[]`, `leads Lead[]`. Change `slug String? @unique` to `slug String?` and add `@@unique([orgId, slug])` to the model body. Then append:

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
  id             String       @id @default(cuid())
  orgId          String
  org            Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  name           String
  externalIdHash String?
  email          String?
  phone          String?
  group          String?
  subGroup       String?
  position       String?
  minor          Boolean?
  active         Boolean      @default(true)
  createdAt      DateTime     @default(now())
  rsvps          Rsvp[]

  @@unique([orgId, externalIdHash])
  @@index([orgId, group, subGroup])
}

enum RsvpStatus {
  yes
  no
  maybe
}

model Rsvp {
  id        String     @id @default(cuid())
  personId  String
  person    Person     @relation(fields: [personId], references: [id], onDelete: Cascade)
  eventId   String
  event     Event      @relation(fields: [eventId], references: [id], onDelete: Cascade)
  day       DateTime?
  status    RsvpStatus
  reason    String?
  updatedAt DateTime   @updatedAt

  @@index([eventId, personId])
}

model Lead {
  id        String       @id @default(cuid())
  orgId     String
  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  eventId   String
  event     Event        @relation(fields: [eventId], references: [id], onDelete: Cascade)
  group     String
  name      String
  token     String       @unique
  createdAt DateTime     @default(now())

  @@index([eventId, group])
}
```

- [ ] **Step 2: Generate the migration without applying**

Run: `npm run db:migrate -- --create-only --name add_roster_rsvp`
Expected: a new `prisma/migrations/<ts>_add_roster_rsvp/migration.sql` is written, not yet applied.

- [ ] **Step 3: Hand-edit the migration to seed the org and backfill non-null `orgId`**

Prisma cannot add a non-null column to a populated table without a default. Replace the auto-generated `ALTER TABLE "Event" ADD COLUMN "orgId"` line and the slug index change with a backfilling sequence. The final `migration.sql` must, in order: create `Organization`, insert the seed row, add `Event.orgId` nullable, backfill it, set it non-null, add the FK, and swap the slug index. Ensure these statements are present (the table creates for Person/Rsvp/Lead/enum stay as generated):

```sql
CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

INSERT INTO "Organization" ("id", "name", "slug") VALUES ('org_bcsf', 'BCSF', 'bcsf');

ALTER TABLE "Event" ADD COLUMN "orgId" TEXT;
UPDATE "Event" SET "orgId" = 'org_bcsf' WHERE "orgId" IS NULL;
ALTER TABLE "Event" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Event" ADD CONSTRAINT "Event_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "Event_slug_key";
CREATE UNIQUE INDEX "Event_orgId_slug_key" ON "Event"("orgId", "slug");
```

(Keep the generator's `CREATE TABLE "Person" / "Rsvp" / "Lead"`, the `CREATE TYPE "RsvpStatus"`, and their indexes/FKs.)

- [ ] **Step 4: Apply to the dev database and regenerate the client**

Run: `npm run db:migrate`
Expected: "Your database is now in sync", and `prisma generate` runs so `prisma.person` etc. exist.

- [ ] **Step 5: Apply to the test database**

Run: `npm run db:migrate:test`
Expected: the migration applies cleanly.

- [ ] **Step 6: Clear the new tables in `resetDb`**

In `test/db.ts`, add these before `await prisma.event.deleteMany();` (children first; keep `Organization` because the seed row must survive resets):

```ts
  await prisma.rsvp.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.person.deleteMany();
```

Note for later tasks: `resetDb` does NOT delete `Organization`, so `'org_bcsf'` persists across tests. Tests create events with `orgId: 'org_bcsf'`.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations test/db.ts
git commit -m "feat: Organization/Person/Rsvp/Lead schema and org seam"
```

---

### Task 2: `hashExternalId` (privacy: no raw Scout IDs)

**Files:**
- Create: `lib/security/hash.ts`
- Test: `lib/security/hash.test.ts`

**Interfaces:**
- Produces: `hashExternalId(raw: string): string` — deterministic salted HMAC-SHA256 hex.

- [ ] **Step 1: Write the failing test**

Create `lib/security/hash.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { hashExternalId } from "@/lib/security/hash";

describe("hashExternalId", () => {
  test("is deterministic and trims", () => {
    expect(hashExternalId("135291163")).toBe(hashExternalId(" 135291163 "));
  });
  test("differs by input and never returns the raw id", () => {
    const h = hashExternalId("135291163");
    expect(h).not.toBe(hashExternalId("14878458"));
    expect(h).not.toContain("135291163");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/security/hash.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `lib/security/hash.ts`:

```ts
import { createHmac } from "node:crypto";

// A fixed salt so the same source id hashes the same on re-import (dedup). Set
// ROSTER_ID_SALT in production; the dev fallback keeps tests deterministic.
const SALT = process.env.ROSTER_ID_SALT ?? "frogboard-dev-roster-salt";

/** Salted hash of a source identifier (e.g. Scout ID) for import dedup. Never store the raw id. */
export function hashExternalId(raw: string): string {
  return createHmac("sha256", SALT).update(raw.trim()).digest("hex");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- lib/security/hash.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/security/hash.ts lib/security/hash.test.ts
git commit -m "feat: salted hashExternalId for roster dedup"
```

---

### Task 3: RSVP domain (`effectiveStatus`, `eventStatus`)

**Files:**
- Create: `lib/domain/rsvp.ts`
- Test: `lib/domain/rsvp.test.ts`

**Interfaces:**
- Produces:
  - `type RsvpStatus = "yes" | "no" | "maybe"`
  - `type EffectiveStatus = RsvpStatus | "blank"`
  - `interface RsvpRecord { day: Date | null; status: RsvpStatus }`
  - `effectiveStatus(records: RsvpRecord[], day: Date | null): EffectiveStatus`
  - `eventStatus(records: RsvpRecord[]): EffectiveStatus`

- [ ] **Step 1: Write the failing test**

Create `lib/domain/rsvp.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { effectiveStatus, eventStatus, type RsvpRecord } from "@/lib/domain/rsvp";

const D1 = new Date("2026-07-25T00:00:00Z");

describe("effectiveStatus", () => {
  test("blank when no records", () => {
    expect(effectiveStatus([], null)).toBe("blank");
  });
  test("uses the whole-event (null) answer", () => {
    expect(effectiveStatus([{ day: null, status: "yes" }], null)).toBe("yes");
  });
  test("a day-specific answer overrides the whole-event one", () => {
    const recs: RsvpRecord[] = [{ day: null, status: "yes" }, { day: D1, status: "no" }];
    expect(effectiveStatus(recs, D1)).toBe("no");
    expect(effectiveStatus(recs, null)).toBe("yes");
  });
});

describe("eventStatus", () => {
  test("yes beats maybe beats no beats blank", () => {
    expect(eventStatus([])).toBe("blank");
    expect(eventStatus([{ day: null, status: "no" }])).toBe("no");
    expect(eventStatus([{ day: D1, status: "no" }, { day: null, status: "maybe" }])).toBe("maybe");
    expect(eventStatus([{ day: D1, status: "yes" }, { day: null, status: "no" }])).toBe("yes");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/domain/rsvp.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `lib/domain/rsvp.ts`:

```ts
export type RsvpStatus = "yes" | "no" | "maybe";
export type EffectiveStatus = RsvpStatus | "blank";

export interface RsvpRecord {
  day: Date | null;
  status: RsvpStatus;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

/** A day-specific answer overrides the whole-event (null) answer; absent is "blank". */
export function effectiveStatus(records: RsvpRecord[], day: Date | null): EffectiveStatus {
  if (day) {
    const dayRow = records.find((r) => r.day && sameDay(r.day, day));
    if (dayRow) return dayRow.status;
  }
  const eventRow = records.find((r) => r.day === null);
  return eventRow ? eventRow.status : "blank";
}

/** Whole-event rollup: yes if coming any day, else maybe, else no, else blank. */
export function eventStatus(records: RsvpRecord[]): EffectiveStatus {
  if (records.some((r) => r.status === "yes")) return "yes";
  if (records.some((r) => r.status === "maybe")) return "maybe";
  if (records.some((r) => r.status === "no")) return "no";
  return "blank";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- lib/domain/rsvp.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/rsvp.ts lib/domain/rsvp.test.ts
git commit -m "feat: RSVP status domain (effective + event rollup)"
```

---

### Task 4: Roster rollups domain (`statusCounts`, `chaseList`)

**Files:**
- Create: `lib/domain/roster.ts`
- Test: `lib/domain/roster.test.ts`

**Interfaces:**
- Consumes: `RsvpRecord`, `EffectiveStatus`, `eventStatus` from `@/lib/domain/rsvp`.
- Produces:
  - `interface RosterPerson { id: string; name: string; subGroup: string | null; minor: boolean | null }`
  - `interface StatusCounts { yes: number; maybe: number; no: number; blank: number }`
  - `statusCounts(people: { id: string }[], byPerson: Map<string, RsvpRecord[]>): StatusCounts`
  - `interface ChaseGroup { subGroup: string; people: { id: string; name: string; minor: boolean | null; status: EffectiveStatus }[] }`
  - `chaseList(people: RosterPerson[], byPerson: Map<string, RsvpRecord[]>): ChaseGroup[]`

- [ ] **Step 1: Write the failing test**

Create `lib/domain/roster.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { statusCounts, chaseList, type RosterPerson } from "@/lib/domain/roster";
import type { RsvpRecord } from "@/lib/domain/rsvp";

function person(id: string, subGroup: string | null): RosterPerson {
  return { id, name: `Name ${id}`, subGroup, minor: true };
}
function map(entries: [string, RsvpRecord[]][]): Map<string, RsvpRecord[]> {
  return new Map(entries);
}

describe("statusCounts", () => {
  test("counts each effective status, blank when absent", () => {
    const people = [person("a", "Hawk"), person("b", "Hawk"), person("c", "Fox")];
    const byPerson = map([
      ["a", [{ day: null, status: "yes" }]],
      ["b", [{ day: null, status: "no" }]],
    ]);
    expect(statusCounts(people, byPerson)).toEqual({ yes: 1, maybe: 0, no: 1, blank: 1 });
  });
});

describe("chaseList", () => {
  test("keeps only blank and maybe, blank first, grouped by sub-group", () => {
    const people = [person("a", "Hawk"), person("b", "Hawk"), person("c", "Fox")];
    const byPerson = map([
      ["a", [{ day: null, status: "yes" }]],   // answered yes, dropped
      ["b", [{ day: null, status: "maybe" }]],  // maybe, chased
      // c is blank, chased
    ]);
    const groups = chaseList(people, byPerson);
    expect(groups.map((g) => g.subGroup)).toEqual(["Fox", "Hawk"]);
    expect(groups.find((g) => g.subGroup === "Hawk")!.people.map((p) => p.id)).toEqual(["b"]);
    expect(groups.find((g) => g.subGroup === "Fox")!.people.map((p) => p.status)).toEqual(["blank"]);
  });
  test("null sub-group collects under 'Ungrouped'", () => {
    const groups = chaseList([person("a", null)], map([]));
    expect(groups[0].subGroup).toBe("Ungrouped");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/domain/roster.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `lib/domain/roster.ts`:

```ts
import { type RsvpRecord, type EffectiveStatus, eventStatus } from "@/lib/domain/rsvp";

export interface RosterPerson {
  id: string;
  name: string;
  subGroup: string | null;
  minor: boolean | null;
}

export interface StatusCounts {
  yes: number;
  maybe: number;
  no: number;
  blank: number;
}

export function statusCounts(people: { id: string }[], byPerson: Map<string, RsvpRecord[]>): StatusCounts {
  const counts: StatusCounts = { yes: 0, maybe: 0, no: 0, blank: 0 };
  for (const p of people) counts[eventStatus(byPerson.get(p.id) ?? [])] += 1;
  return counts;
}

export interface ChaseGroup {
  subGroup: string;
  people: { id: string; name: string; minor: boolean | null; status: EffectiveStatus }[];
}

/** The people still to chase (blank, then maybe), grouped by sub-group, groups sorted alphabetically. */
export function chaseList(people: RosterPerson[], byPerson: Map<string, RsvpRecord[]>): ChaseGroup[] {
  const rank: Record<string, number> = { blank: 0, maybe: 1 };
  const bySub = new Map<string, ChaseGroup["people"]>();
  for (const p of people) {
    const status = eventStatus(byPerson.get(p.id) ?? []);
    if (status !== "blank" && status !== "maybe") continue;
    const key = p.subGroup?.trim() ? p.subGroup.trim() : "Ungrouped";
    if (!bySub.has(key)) bySub.set(key, []);
    bySub.get(key)!.push({ id: p.id, name: p.name, minor: p.minor, status });
  }
  return [...bySub.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([subGroup, ppl]) => ({
      subGroup,
      people: ppl.sort((x, y) => rank[x.status] - rank[y.status] || x.name.localeCompare(y.name)),
    }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- lib/domain/roster.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/roster.ts lib/domain/roster.test.ts
git commit -m "feat: roster rollups (statusCounts, chaseList)"
```

---

### Task 5: Roster import parser (`parsePersonRows`)

**Files:**
- Modify: `lib/domain/roster.ts`
- Test: `lib/domain/roster.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `parseTsv` from `@/lib/domain/paste`.
- Produces:
  - `interface ImportedPerson { name: string; subGroup: string | null; position: string | null; externalId: string | null }`
  - `parsePersonRows(raw: string): ImportedPerson[]`

- [ ] **Step 1: Write the failing test**

Append to `lib/domain/roster.test.ts` (add the import):

```ts
import { statusCounts, chaseList, parsePersonRows, type RosterPerson } from "@/lib/domain/roster";
```

```ts
describe("parsePersonRows", () => {
  test("maps First/Last/Patrol/Position/Scout ID by header, skips blanks", () => {
    const raw = [
      "First Name\tLast Name\tPatrol\tPosition\tScout ID",
      "Simon\tKraay\t\tSPL\t135291163",
      "Naoto\tThompson\tHawk\tPL\t135684307",
      "\t\t\t\t",
    ].join("\n");
    expect(parsePersonRows(raw)).toEqual([
      { name: "Simon Kraay", subGroup: null, position: "SPL", externalId: "135291163" },
      { name: "Naoto Thompson", subGroup: "Hawk", position: "PL", externalId: "135684307" },
    ]);
  });
  test("accepts a Team column as the sub-group and tolerates a missing Scout ID", () => {
    const raw = ["First Name\tLast Name\tTeam", "Ava\tLin\tTeam A"].join("\n");
    expect(parsePersonRows(raw)).toEqual([
      { name: "Ava Lin", subGroup: "Team A", position: null, externalId: null },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/domain/roster.test.ts`
Expected: FAIL, `parsePersonRows` not exported.

- [ ] **Step 3: Implement**

Append to `lib/domain/roster.ts` (add the import at the top):

```ts
import { parseTsv } from "@/lib/domain/paste";
```

```ts
export interface ImportedPerson {
  name: string;
  subGroup: string | null;
  position: string | null;
  externalId: string | null;
}

/** Parse a pasted roster block (header row + tab-separated columns) into people. */
export function parsePersonRows(raw: string): ImportedPerson[] {
  const grid = parseTsv(raw).filter((r) => r.some((c) => c.trim() !== ""));
  if (grid.length < 2) return [];
  const header = grid[0].map((h) => h.trim().toLowerCase());
  const col = (...wants: string[]) => header.findIndex((h) => wants.some((w) => h.includes(w)));
  const iFirst = col("first"), iLast = col("last");
  const iSub = col("patrol", "team");
  const iPos = col("position");
  const iId = col("scout id", "id");
  const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
  return grid
    .slice(1)
    .map((r) => ({
      name: [cell(r, iFirst), cell(r, iLast)].filter(Boolean).join(" "),
      subGroup: cell(r, iSub) || null,
      position: cell(r, iPos) || null,
      externalId: cell(r, iId) || null,
    }))
    .filter((p) => p.name !== "");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- lib/domain/roster.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/roster.ts lib/domain/roster.test.ts
git commit -m "feat: parsePersonRows roster paste parser"
```

---

### Task 6: Directory repository (import, add, deactivate, get)

**Files:**
- Create: `lib/repository/directory.ts`
- Test: `lib/repository/directory.db.test.ts`

**Interfaces:**
- Consumes: `prisma`; `hashExternalId`; `ImportedPerson` from `@/lib/domain/roster`.
- Produces:
  - `importPeople(orgId: string, group: string, rows: ImportedPerson[], opts: { minor: boolean }): Promise<{ created: number; updated: number }>`
  - `addPerson(orgId: string, data: { name: string; group: string; subGroup?: string | null; minor?: boolean }): Promise<Person>`
  - `deactivatePerson(id: string): Promise<boolean>`
  - `getDirectory(orgId: string, group?: string): Promise<Person[]>` (active only)

- [ ] **Step 1: Write the failing test**

Create `lib/repository/directory.db.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { hashExternalId } from "@/lib/security/hash";
import { importPeople, addPerson, deactivatePerson, getDirectory } from "@/lib/repository/directory";

const ORG = "org_bcsf";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("importPeople", () => {
  test("creates people, hashing the external id (never storing it raw)", async () => {
    const res = await importPeople(ORG, "Scouts", [
      { name: "Simon Kraay", subGroup: null, position: "SPL", externalId: "135291163" },
      { name: "Naoto Thompson", subGroup: "Hawk", position: "PL", externalId: "135684307" },
    ], { minor: true });
    expect(res).toEqual({ created: 2, updated: 0 });
    const simon = await prisma.person.findFirst({ where: { orgId: ORG, name: "Simon Kraay" } });
    expect(simon!.externalIdHash).toBe(hashExternalId("135291163"));
    expect(simon!.minor).toBe(true);
    expect(simon!.group).toBe("Scouts");
  });
  test("re-import updates in place by external id hash", async () => {
    await importPeople(ORG, "Scouts", [{ name: "Old Name", subGroup: "Fox", position: null, externalId: "1" }], { minor: true });
    const res = await importPeople(ORG, "Scouts", [{ name: "New Name", subGroup: "Hawk", position: null, externalId: "1" }], { minor: true });
    expect(res).toEqual({ created: 0, updated: 1 });
    expect(await prisma.person.count({ where: { orgId: ORG } })).toBe(1);
    const p = await prisma.person.findFirst({ where: { orgId: ORG } });
    expect(p!.name).toBe("New Name");
    expect(p!.subGroup).toBe("Hawk");
  });
});

describe("addPerson / deactivatePerson / getDirectory", () => {
  test("manual add appears in the directory; deactivate hides it", async () => {
    const p = await addPerson(ORG, { name: "Ava Lin", group: "YAO", subGroup: "Team A" });
    expect((await getDirectory(ORG, "YAO")).map((x) => x.name)).toEqual(["Ava Lin"]);
    expect(await deactivatePerson(p.id)).toBe(true);
    expect(await getDirectory(ORG, "YAO")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:db -- lib/repository/directory.db.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `lib/repository/directory.ts`:

```ts
import { prisma } from "@/lib/db";
import type { Person } from "@prisma/client";
import { hashExternalId } from "@/lib/security/hash";
import type { ImportedPerson } from "@/lib/domain/roster";

/** Idempotent roster import. People with a source id dedup by its hash; others are created. */
export async function importPeople(
  orgId: string,
  group: string,
  rows: ImportedPerson[],
  opts: { minor: boolean },
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const externalIdHash = row.externalId ? hashExternalId(row.externalId) : null;
    const data = {
      name: row.name, group, subGroup: row.subGroup, position: row.position,
      minor: opts.minor, externalIdHash,
    };
    if (externalIdHash) {
      const existing = await prisma.person.findUnique({
        where: { orgId_externalIdHash: { orgId, externalIdHash } },
      });
      if (existing) {
        await prisma.person.update({ where: { id: existing.id }, data: { ...data, active: true } });
        updated += 1;
        continue;
      }
    }
    await prisma.person.create({ data: { orgId, ...data } });
    created += 1;
  }
  return { created, updated };
}

export async function addPerson(
  orgId: string,
  data: { name: string; group: string; subGroup?: string | null; minor?: boolean },
): Promise<Person> {
  return prisma.person.create({
    data: { orgId, name: data.name, group: data.group, subGroup: data.subGroup ?? null, minor: data.minor ?? false },
  });
}

/** False when the person is already gone. Soft-deactivates (keeps history). */
export async function deactivatePerson(id: string): Promise<boolean> {
  const res = await prisma.person.updateMany({ where: { id }, data: { active: false } });
  return res.count > 0;
}

/** Active people in an org, optionally one group, ordered by sub-group then name. */
export async function getDirectory(orgId: string, group?: string): Promise<Person[]> {
  return prisma.person.findMany({
    where: { orgId, active: true, ...(group ? { group } : {}) },
    orderBy: [{ subGroup: "asc" }, { name: "asc" }],
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:db -- lib/repository/directory.db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/repository/directory.ts lib/repository/directory.db.test.ts
git commit -m "feat: directory repository (import, add, deactivate, get)"
```

---

### Task 7: RSVP repository (`setRsvp`, `getEventRsvps`)

**Files:**
- Create: `lib/repository/rsvp.ts`
- Test: `lib/repository/rsvp.db.test.ts`

**Interfaces:**
- Consumes: `prisma`; `RsvpStatus` from `@/lib/domain/rsvp`.
- Produces:
  - `setRsvp(personId: string, eventId: string, status: RsvpStatus, reason: string | null): Promise<void>` (upserts the whole-event `day = null` row)
  - `getEventRsvps(eventId: string): Promise<{ personId: string; day: Date | null; status: RsvpStatus }[]>`

- [ ] **Step 1: Write the failing test**

Create `lib/repository/rsvp.db.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { setRsvp, getEventRsvps } from "@/lib/repository/rsvp";

const ORG = "org_bcsf";

async function fixture() {
  const event = await prisma.event.create({ data: { name: "Obon", orgId: ORG, startDate: new Date(), endDate: new Date() } });
  const person = await prisma.person.create({ data: { orgId: ORG, name: "Simon Kraay", group: "Scouts" } });
  return { event, person };
}

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

test("setRsvp creates then updates the single whole-event row", async () => {
  const { event, person } = await fixture();
  await setRsvp(person.id, event.id, "no", "Out of town");
  await setRsvp(person.id, event.id, "yes", null);
  const rows = await prisma.rsvp.findMany({ where: { eventId: event.id, personId: person.id } });
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe("yes");
  expect(rows[0].reason).toBeNull();
  expect(rows[0].day).toBeNull();
});

test("getEventRsvps returns each person's rows", async () => {
  const { event, person } = await fixture();
  await setRsvp(person.id, event.id, "maybe", null);
  expect(await getEventRsvps(event.id)).toEqual([{ personId: person.id, day: null, status: "maybe" }]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:db -- lib/repository/rsvp.db.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `lib/repository/rsvp.ts`:

```ts
import { prisma } from "@/lib/db";
import type { RsvpStatus } from "@/lib/domain/rsvp";

/** Upsert the whole-event answer (day = null). Slice 1 writes only this grain. */
export async function setRsvp(
  personId: string,
  eventId: string,
  status: RsvpStatus,
  reason: string | null,
): Promise<void> {
  const existing = await prisma.rsvp.findFirst({ where: { personId, eventId, day: null } });
  if (existing) {
    await prisma.rsvp.update({ where: { id: existing.id }, data: { status, reason } });
    return;
  }
  await prisma.rsvp.create({ data: { personId, eventId, day: null, status, reason } });
}

export async function getEventRsvps(
  eventId: string,
): Promise<{ personId: string; day: Date | null; status: RsvpStatus }[]> {
  const rows = await prisma.rsvp.findMany({
    where: { eventId },
    select: { personId: true, day: true, status: true },
  });
  return rows;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:db -- lib/repository/rsvp.db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/repository/rsvp.ts lib/repository/rsvp.db.test.ts
git commit -m "feat: RSVP repository (whole-event upsert, getEventRsvps)"
```

---

### Task 8: Leads repository (create, remove, regenerate, auth)

**Files:**
- Create: `lib/repository/leads.ts`
- Test: `lib/repository/leads.db.test.ts`

**Interfaces:**
- Consumes: `prisma`; `newClaimToken` from `@/lib/security/tokens`.
- Produces:
  - `createLead(eventId: string, group: string, name: string): Promise<Lead>`
  - `removeLead(id: string): Promise<boolean>`
  - `regenerateLeadToken(id: string): Promise<Lead | null>`
  - `getEventLeads(eventId: string): Promise<{ id: string; group: string; name: string; token: string }[]>`
  - `getLeadAuth(token: string): Promise<{ eventId: string; orgId: string; group: string } | null>`

- [ ] **Step 1: Write the failing test**

Create `lib/repository/leads.db.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { createLead, removeLead, regenerateLeadToken, getEventLeads, getLeadAuth } from "@/lib/repository/leads";

const ORG = "org_bcsf";
async function event() {
  return prisma.event.create({ data: { name: "Obon", orgId: ORG, startDate: new Date(), endDate: new Date() } });
}

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

test("createLead mints a token and carries the org", async () => {
  const e = await event();
  const lead = await createLead(e.id, "Scouts", "Simon");
  expect(lead.token).toBeTruthy();
  expect(lead.orgId).toBe(ORG);
  expect((await getEventLeads(e.id)).map((l) => l.name)).toEqual(["Simon"]);
});

test("multiple leads per group are allowed", async () => {
  const e = await event();
  await createLead(e.id, "Scouts", "Simon");
  await createLead(e.id, "Scouts", "Naoto");
  expect(await prisma.lead.count({ where: { eventId: e.id, group: "Scouts" } })).toBe(2);
});

test("removeLead and regenerateLeadToken revoke the link", async () => {
  const e = await event();
  const lead = await createLead(e.id, "Scouts", "Simon");
  const rolled = await regenerateLeadToken(lead.id);
  expect(rolled!.token).not.toBe(lead.token);
  expect(await removeLead(lead.id)).toBe(true);
  expect(await removeLead("missing")).toBe(false);
  expect(await regenerateLeadToken("missing")).toBeNull();
});

test("getLeadAuth resolves scope, null on bad token", async () => {
  const e = await event();
  const lead = await createLead(e.id, "Scouts", "Simon");
  expect(await getLeadAuth(lead.token)).toEqual({ eventId: e.id, orgId: ORG, group: "Scouts" });
  expect(await getLeadAuth("nope")).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:db -- lib/repository/leads.db.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `lib/repository/leads.ts`:

```ts
import { prisma } from "@/lib/db";
import type { Lead } from "@prisma/client";
import { newClaimToken } from "@/lib/security/tokens";

export async function createLead(eventId: string, group: string, name: string): Promise<Lead> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { orgId: true } });
  return prisma.lead.create({ data: { eventId, orgId: event.orgId, group, name, token: newClaimToken() } });
}

export async function removeLead(id: string): Promise<boolean> {
  const res = await prisma.lead.deleteMany({ where: { id } });
  return res.count > 0;
}

export async function regenerateLeadToken(id: string): Promise<Lead | null> {
  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.lead.update({ where: { id }, data: { token: newClaimToken() } });
}

export async function getEventLeads(
  eventId: string,
): Promise<{ id: string; group: string; name: string; token: string }[]> {
  return prisma.lead.findMany({
    where: { eventId },
    orderBy: [{ group: "asc" }, { createdAt: "asc" }],
    select: { id: true, group: true, name: true, token: true },
  });
}

/** The scope a lead token authorizes, or null. Used to gate RSVP writes. */
export async function getLeadAuth(
  token: string,
): Promise<{ eventId: string; orgId: string; group: string } | null> {
  const lead = await prisma.lead.findUnique({
    where: { token },
    select: { eventId: true, orgId: true, group: true },
  });
  return lead;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:db -- lib/repository/leads.db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/repository/leads.ts lib/repository/leads.db.test.ts
git commit -m "feat: leads repository (create, remove, regenerate, auth)"
```

---

### Task 9: Read models (`getGroupRollups`, `getLeadChaseView`)

**Files:**
- Modify: `lib/repository/directory.ts` (add `getGroupRollups`)
- Modify: `lib/repository/leads.ts` (add `getLeadChaseView`)
- Test: `lib/repository/directory.db.test.ts`, `lib/repository/leads.db.test.ts` (add blocks)

**Interfaces:**
- Consumes: `statusCounts`, `chaseList`, `type StatusCounts`, `type ChaseGroup` from `@/lib/domain/roster`; `getEventRsvps` from `@/lib/repository/rsvp`; `boardDisplayName` from `@/lib/domain/displayName`; `type RsvpRecord` from `@/lib/domain/rsvp`.
- Produces:
  - `getGroupRollups(eventId: string): Promise<{ group: string; counts: StatusCounts }[]>` (attendance counts per group; ordered by group)
  - `getLeadChaseView(token: string): Promise<{ group: string; eventName: string; counts: StatusCounts; chase: ChaseGroup[] } | null>` (names abbreviated, no contact fields, null on bad token)

- [ ] **Step 1: Write the failing tests**

Append to `lib/repository/directory.db.test.ts` (extend the import line):

```ts
import { importPeople, addPerson, deactivatePerson, getDirectory, getGroupRollups } from "@/lib/repository/directory";
import { setRsvp } from "@/lib/repository/rsvp";
```

```ts
describe("getGroupRollups", () => {
  test("counts attendance per group for the event", async () => {
    const e = await prisma.event.create({ data: { name: "Obon", orgId: ORG, startDate: new Date(), endDate: new Date() } });
    await importPeople(ORG, "Scouts", [
      { name: "A A", subGroup: "Hawk", position: null, externalId: "1" },
      { name: "B B", subGroup: "Fox", position: null, externalId: "2" },
    ], { minor: true });
    const a = await prisma.person.findFirst({ where: { name: "A A" } });
    await setRsvp(a!.id, e.id, "yes", null);
    expect(await getGroupRollups(e.id)).toEqual([
      { group: "Scouts", counts: { yes: 1, maybe: 0, no: 0, blank: 1 } },
    ]);
  });
});
```

Append to `lib/repository/leads.db.test.ts` (extend the import line):

```ts
import { createLead, removeLead, regenerateLeadToken, getEventLeads, getLeadAuth, getLeadChaseView } from "@/lib/repository/leads";
import { importPeople } from "@/lib/repository/directory";
import { setRsvp } from "@/lib/repository/rsvp";
```

```ts
describe("getLeadChaseView", () => {
  test("shows the group's chase list, abbreviated, with counts", async () => {
    const e = await event();
    await importPeople(ORG, "Scouts", [
      { name: "Alex Tanaka", subGroup: "Hawk", position: null, externalId: "1" },
      { name: "Bo Smith", subGroup: "Hawk", position: null, externalId: "2" },
    ], { minor: true });
    const bo = await prisma.person.findFirst({ where: { name: "Bo Smith" } });
    await setRsvp(bo!.id, e.id, "yes", null); // answered, drops off the chase list
    const lead = await createLead(e.id, "Scouts", "Simon");
    const view = await getLeadChaseView(lead.token);
    expect(view!.group).toBe("Scouts");
    expect(view!.eventName).toBe("Obon");
    expect(view!.counts).toEqual({ yes: 1, maybe: 0, no: 0, blank: 1 });
    const hawk = view!.chase.find((g) => g.subGroup === "Hawk")!;
    expect(hawk.people.map((p) => p.name)).toEqual(["Alex T."]); // minor abbreviation, Bo dropped
  });
  test("null on an unknown token", async () => {
    expect(await getLeadChaseView("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:db -- lib/repository/directory.db.test.ts lib/repository/leads.db.test.ts`
Expected: FAIL, `getGroupRollups` / `getLeadChaseView` not exported.

- [ ] **Step 3: Implement `getGroupRollups`**

Append to `lib/repository/directory.ts` (add imports):

```ts
import { statusCounts, type StatusCounts } from "@/lib/domain/roster";
import { getEventRsvps } from "@/lib/repository/rsvp";
import type { RsvpRecord } from "@/lib/domain/rsvp";
```

```ts
/** Attendance counts per group for an event: what the org coordinator sees (no names). */
export async function getGroupRollups(eventId: string): Promise<{ group: string; counts: StatusCounts }[]> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { orgId: true } });
  const people = await prisma.person.findMany({
    where: { orgId: event.orgId, active: true, NOT: { group: null } },
    select: { id: true, group: true },
  });
  const rsvps = await getEventRsvps(eventId);
  const byPerson = new Map<string, RsvpRecord[]>();
  for (const r of rsvps) {
    if (!byPerson.has(r.personId)) byPerson.set(r.personId, []);
    byPerson.get(r.personId)!.push({ day: r.day, status: r.status });
  }
  const groups = new Map<string, { id: string }[]>();
  for (const p of people) {
    const g = p.group!;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push({ id: p.id });
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([group, ppl]) => ({ group, counts: statusCounts(ppl, byPerson) }));
}
```

- [ ] **Step 4: Implement `getLeadChaseView`**

Append to `lib/repository/leads.ts` (add imports):

```ts
import { chaseList, type ChaseGroup, statusCounts, type StatusCounts, type RosterPerson } from "@/lib/domain/roster";
import { getEventRsvps } from "@/lib/repository/rsvp";
import { boardDisplayName } from "@/lib/domain/displayName";
import type { RsvpRecord } from "@/lib/domain/rsvp";
```

```ts
/** A lead's read view: their group's chase list (abbreviated names, no contact details) and counts. */
export async function getLeadChaseView(
  token: string,
): Promise<{ group: string; eventName: string; counts: StatusCounts; chase: ChaseGroup[] } | null> {
  const lead = await prisma.lead.findUnique({
    where: { token },
    select: { group: true, orgId: true, eventId: true, event: { select: { name: true } } },
  });
  if (!lead) return null;
  const people = await prisma.person.findMany({
    where: { orgId: lead.orgId, active: true, group: lead.group },
    select: { id: true, name: true, subGroup: true, minor: true },
  });
  const rsvps = await getEventRsvps(lead.eventId);
  const byPerson = new Map<string, RsvpRecord[]>();
  for (const r of rsvps) {
    if (!byPerson.has(r.personId)) byPerson.set(r.personId, []);
    byPerson.get(r.personId)!.push({ day: r.day, status: r.status });
  }
  // Abbreviate before building the view so a full surname never leaves the server.
  const roster: RosterPerson[] = people.map((p) => ({
    id: p.id, name: boardDisplayName(p.name, p.minor), subGroup: p.subGroup, minor: p.minor,
  }));
  return {
    group: lead.group,
    eventName: lead.event.name,
    counts: statusCounts(roster, byPerson),
    chase: chaseList(roster, byPerson),
  };
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npm run test:db -- lib/repository/directory.db.test.ts lib/repository/leads.db.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/repository/directory.ts lib/repository/leads.ts lib/repository/directory.db.test.ts lib/repository/leads.db.test.ts
git commit -m "feat: read models (getGroupRollups, getLeadChaseView)"
```

---

### Task 10: Lead + import actions (organizer-gated)

**Files:**
- Create: `app/actions/leads.ts`
- Test: `app/actions/leads.db.test.ts`

**Interfaces:**
- Consumes: `createLead`, `removeLead`, `regenerateLeadToken` from `@/lib/repository/leads`; `importPeople` from `@/lib/repository/directory`; `parsePersonRows` from `@/lib/domain/roster`; `prisma`; session helpers.
- Produces:
  - `createLeadAction(eventId: string, group: string, name: string): Promise<{ ok: true; token: string } | { ok: false; error: string }>`
  - `removeLeadAction(id: string, eventId: string): Promise<{ ok: true } | { ok: false; error: string }>`
  - `regenerateLeadTokenAction(id: string, eventId: string): Promise<{ ok: true; token: string } | { ok: false; error: string }>`
  - `importRosterAction(eventId: string, group: string, raw: string, isYouth: boolean): Promise<{ ok: true; created: number; updated: number } | { ok: false; error: string }>`

- [ ] **Step 1: Write the failing test**

Create `app/actions/leads.db.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

const cookieJar = new Map<string, string>();
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  }),
}));

import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { sessionToken, SESSION_COOKIE } from "@/lib/security/session";
import { createLeadAction, removeLeadAction, regenerateLeadTokenAction, importRosterAction } from "@/app/actions/leads";

const ORG = "org_bcsf";
async function event() {
  return prisma.event.create({ data: { name: "Obon", orgId: ORG, startDate: new Date(), endDate: new Date() } });
}
function authenticate() { cookieJar.set(SESSION_COOKIE, sessionToken()); }

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
  vi.stubEnv("ORGANIZER_PASSWORD", "lily-pad-42");
});
afterAll(async () => { await prisma.$disconnect(); });

test("createLeadAction rejects a signed-out caller", async () => {
  const e = await event();
  expect(await createLeadAction(e.id, "Scouts", "Simon")).toEqual({ ok: false, error: "Please sign in." });
});

test("createLeadAction returns a token when signed in", async () => {
  authenticate();
  const e = await event();
  const r = await createLeadAction(e.id, "Scouts", "Simon");
  expect(r.ok).toBe(true);
  expect(await prisma.lead.count({ where: { eventId: e.id } })).toBe(1);
});

test("importRosterAction parses and imports, gated", async () => {
  const e = await event();
  const raw = "First Name\tLast Name\tPatrol\tScout ID\nSimon\tKraay\tHawk\t135291163";
  expect(await importRosterAction(e.id, "Scouts", raw, true)).toEqual({ ok: false, error: "Please sign in." });
  authenticate();
  const r = await importRosterAction(e.id, "Scouts", raw, true);
  expect(r).toEqual({ ok: true, created: 1, updated: 0 });
  expect(await prisma.person.count({ where: { orgId: ORG, group: "Scouts" } })).toBe(1);
});

test("remove and regenerate are gated and effective", async () => {
  authenticate();
  const e = await event();
  const lead = await prisma.lead.create({ data: { eventId: e.id, orgId: ORG, group: "Scouts", name: "S", token: "t" } });
  const rolled = await regenerateLeadTokenAction(lead.id, e.id);
  expect(rolled.ok).toBe(true);
  expect(await removeLeadAction(lead.id, e.id)).toEqual({ ok: true });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:db -- app/actions/leads.db.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `app/actions/leads.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isValidSession, SESSION_COOKIE } from "@/lib/security/session";
import { createLead, removeLead, regenerateLeadToken } from "@/lib/repository/leads";
import { importPeople } from "@/lib/repository/directory";
import { parsePersonRows } from "@/lib/domain/roster";

type Err = { ok: false; error: string };

async function requireOrganizer(): Promise<{ ok: true } | Err> {
  const jar = await cookies();
  if (!isValidSession(jar.get(SESSION_COOKIE)?.value)) return { ok: false, error: "Please sign in." };
  return { ok: true };
}

export async function createLeadAction(
  eventId: string, group: string, name: string,
): Promise<{ ok: true; token: string } | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  if (!group.trim()) return { ok: false, error: "Pick a group." };
  if (!name.trim()) return { ok: false, error: "Give the lead a name." };
  const lead = await createLead(eventId, group.trim(), name.trim());
  revalidatePath(`/organize/${eventId}`);
  return { ok: true, token: lead.token };
}

export async function removeLeadAction(id: string, eventId: string): Promise<{ ok: true } | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  if (!(await removeLead(id))) return { ok: false, error: "That lead is already gone." };
  revalidatePath(`/organize/${eventId}`);
  return { ok: true };
}

export async function regenerateLeadTokenAction(
  id: string, eventId: string,
): Promise<{ ok: true; token: string } | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  const lead = await regenerateLeadToken(id);
  if (!lead) return { ok: false, error: "That lead is already gone." };
  revalidatePath(`/organize/${eventId}`);
  return { ok: true, token: lead.token };
}

export async function importRosterAction(
  eventId: string, group: string, raw: string, isYouth: boolean,
): Promise<{ ok: true; created: number; updated: number } | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  if (!group.trim()) return { ok: false, error: "Name the group first." };
  const { prisma } = await import("@/lib/db");
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { orgId: true } });
  if (!event) return { ok: false, error: "That event no longer exists." };
  const people = parsePersonRows(raw);
  if (people.length === 0) return { ok: false, error: "No people found in that paste." };
  const res = await importPeople(event.orgId, group.trim(), people, { minor: isYouth });
  revalidatePath(`/organize/${eventId}`);
  return { ok: true, ...res };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:db -- app/actions/leads.db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/actions/leads.ts app/actions/leads.db.test.ts
git commit -m "feat: organizer-gated lead and roster-import actions"
```

---

### Task 11: RSVP action (token-gated, cross-group rejection)

**Files:**
- Create: `app/actions/rsvp.ts`
- Test: `app/actions/rsvp.db.test.ts`

**Interfaces:**
- Consumes: `getLeadAuth` from `@/lib/repository/leads`; `setRsvp` from `@/lib/repository/rsvp`; `prisma`; `RsvpStatus` from `@/lib/domain/rsvp`.
- Produces: `setRsvpAction(token: string, personId: string, status: RsvpStatus, reason: string | null): Promise<{ ok: true } | { ok: false; error: string }>`

- [ ] **Step 1: Write the failing test**

Create `app/actions/rsvp.db.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, expect, test, vi } from "vitest";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { setRsvpAction } from "@/app/actions/rsvp";
import { createLead } from "@/lib/repository/leads";

const ORG = "org_bcsf";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

async function fixture() {
  const event = await prisma.event.create({ data: { name: "Obon", orgId: ORG, startDate: new Date(), endDate: new Date() } });
  const scout = await prisma.person.create({ data: { orgId: ORG, name: "Simon Kraay", group: "Scouts" } });
  const baller = await prisma.person.create({ data: { orgId: ORG, name: "Ava Lin", group: "YAO" } });
  const lead = await createLead(event.id, "Scouts", "Simon");
  return { event, scout, baller, lead };
}

test("a valid lead token records an answer for its own group", async () => {
  const { scout, lead, event } = await fixture();
  expect(await setRsvpAction(lead.token, scout.id, "no", "Out of town")).toEqual({ ok: true });
  const row = await prisma.rsvp.findFirst({ where: { personId: scout.id, eventId: event.id } });
  expect(row!.status).toBe("no");
  expect(row!.reason).toBe("Out of town");
});

test("rejects an unknown token", async () => {
  const { scout } = await fixture();
  expect(await setRsvpAction("nope", scout.id, "yes", null)).toEqual({ ok: false, error: "This link isn't valid." });
});

test("rejects writing to a person in another group", async () => {
  const { baller, lead } = await fixture();
  expect(await setRsvpAction(lead.token, baller.id, "yes", null)).toEqual({ ok: false, error: "That person isn't in your group." });
  expect(await prisma.rsvp.count()).toBe(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:db -- app/actions/rsvp.db.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `app/actions/rsvp.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getLeadAuth } from "@/lib/repository/leads";
import { setRsvp } from "@/lib/repository/rsvp";
import type { RsvpStatus } from "@/lib/domain/rsvp";

type Err = { ok: false; error: string };

/** A lead records one person's whole-event answer. Authorized by the lead token, scoped to its group. */
export async function setRsvpAction(
  token: string, personId: string, status: RsvpStatus, reason: string | null,
): Promise<{ ok: true } | Err> {
  const auth = await getLeadAuth(token);
  if (!auth) return { ok: false, error: "This link isn't valid." };
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { orgId: true, group: true } });
  if (!person || person.orgId !== auth.orgId || person.group !== auth.group) {
    return { ok: false, error: "That person isn't in your group." };
  }
  await setRsvp(personId, auth.eventId, status, reason?.trim() ? reason.trim() : null);
  revalidatePath(`/lead/${token}`);
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:db -- app/actions/rsvp.db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/actions/rsvp.ts app/actions/rsvp.db.test.ts
git commit -m "feat: token-gated setRsvpAction with cross-group rejection"
```

---

### Task 12: `ChaseView` component (one-tap RSVP)

**Files:**
- Create: `components/ChaseView.tsx`
- Test: `components/ChaseView.test.tsx`

**Interfaces:**
- Consumes: `setRsvpAction` from `@/app/actions/rsvp`; `type ChaseGroup`, `type StatusCounts` from `@/lib/domain/roster`; `useRouter` from `next/navigation`.
- Produces: `ChaseView(props: { token: string; group: string; eventName: string; counts: StatusCounts; chase: ChaseGroup[] }): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `components/ChaseView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ChaseView } from "@/components/ChaseView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/rsvp", () => ({ setRsvpAction: vi.fn().mockResolvedValue({ ok: true }) }));

const counts = { yes: 1, maybe: 0, no: 0, blank: 2 };
const chase = [{ subGroup: "Hawk", people: [{ id: "p1", name: "Alex T.", minor: true, status: "blank" as const }] }];

test("leads with the progress and lists who is left", () => {
  render(<ChaseView token="t" group="Scouts" eventName="Obon" counts={counts} chase={chase} />);
  expect(screen.getByText(/1 of 3/i)).toBeInTheDocument(); // heard from 1 of 3
  expect(screen.getByText("Hawk")).toBeInTheDocument();
  expect(screen.getByText("Alex T.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /yes/i })).toBeInTheDocument();
});

test("celebrates when nobody is left to chase", () => {
  render(<ChaseView token="t" group="Scouts" eventName="Obon" counts={{ yes: 3, maybe: 0, no: 0, blank: 0 }} chase={[]} />);
  expect(screen.getByText(/all .*accounted for/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/ChaseView.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `components/ChaseView.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRsvpAction } from "@/app/actions/rsvp";
import type { ChaseGroup, StatusCounts } from "@/lib/domain/roster";
import type { RsvpStatus } from "@/lib/domain/rsvp";

const CHOICES: { value: RsvpStatus; label: string; icon: string }[] = [
  { value: "yes", label: "Yes", icon: "✓" },
  { value: "no", label: "No", icon: "✗" },
  { value: "maybe", label: "Maybe", icon: "?" },
];

export function ChaseView({ token, group, eventName, counts, chase }: {
  token: string; group: string; eventName: string; counts: StatusCounts; chase: ChaseGroup[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const total = counts.yes + counts.maybe + counts.no + counts.blank;
  const heard = total - counts.blank;

  function record(personId: string, status: RsvpStatus, reason: string | null) {
    setError(null);
    startTransition(async () => {
      const r = await setRsvpAction(token, personId, status, reason);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-8">
      <p className="text-sm font-bold text-reed-deep">{group} · {eventName}</p>
      <h1 className="font-display text-2xl font-extrabold text-ink">
        Heard from {heard} of {total}
      </h1>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-lily-line" aria-hidden="true">
        <div className="h-full bg-reed" style={{ width: total ? `${(heard / total) * 100}%` : "0%" }} />
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-lantern-deep">{error}</p>}
      {chase.length === 0 ? (
        <p className="mt-8 text-ink-soft">All {total} accounted for 🎉</p>
      ) : (
        chase.map((g) => (
          <section key={g.subGroup} className="mt-6">
            <h2 className="mb-2 font-display text-lg font-bold text-ink">{g.subGroup}</h2>
            <ul className="space-y-2">
              {g.people.map((p) => (
                <li key={p.id} className="rounded-2xl border border-lily-line bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">{p.name}</span>
                    <ReasonThenButtons pending={pending} onPick={(status, reason) => record(p.id, status, reason)} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <p className="mt-8 text-sm text-ink-soft">Reminders are coming.</p>
    </main>
  );
}

function ReasonThenButtons({ pending, onPick }: {
  pending: boolean; onPick: (status: RsvpStatus, reason: string | null) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="flex shrink-0 items-center gap-1">
      {CHOICES.map((c) => (
        <button key={c.value} type="button" disabled={pending}
          onClick={() => onPick(c.value, c.value === "yes" ? null : reason.trim() || null)}
          aria-label={c.label}
          className="rounded-xl border border-lily-line px-3 py-2 text-sm font-bold text-ink hover:border-reed disabled:opacity-60">
          <span aria-hidden="true">{c.icon}</span> {c.label}
        </button>
      ))}
      <input value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason (optional)"
        placeholder="reason?"
        className="w-20 rounded-xl border border-lily-line px-2 py-2 text-xs text-ink outline-none focus:border-reed" />
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- components/ChaseView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ChaseView.tsx components/ChaseView.test.tsx
git commit -m "feat: ChaseView one-tap RSVP with progress"
```

---

### Task 13: Lead report page `/lead/[token]`

**Files:**
- Create: `app/lead/[token]/page.tsx`

**Interfaces:**
- Consumes: `getLeadChaseView` from `@/lib/repository/leads`; `ChaseView` from `@/components/ChaseView`.
- Produces: route `/lead/[token]`, `force-dynamic`, `noindex` + no-referrer, friendly invalid page.

No unit test (thin composition); verified by `tsc` and the manual smoke in Task 16.

- [ ] **Step 1: Write the page**

Create `app/lead/[token]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getLeadChaseView } from "@/lib/repository/leads";
import { ChaseView } from "@/components/ChaseView";

// Live signups; always fresh. Keep the token out of search engines and Referer headers.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function LeadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getLeadChaseView(token);
  if (!view) {
    return (
      <main className="mx-auto max-w-md px-4 pt-16 text-center">
        <h1 className="font-display text-xl font-extrabold text-ink">This link isn&apos;t valid 🐸</h1>
        <p className="mt-2 text-ink-soft">Ask your organizer for a fresh one.</p>
      </main>
    );
  }
  return (
    <ChaseView token={token} group={view.group} eventName={view.eventName} counts={view.counts} chase={view.chase} />
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/lead/[token]/page.tsx
git commit -m "feat: /lead/[token] chase page (noindex, no-referrer)"
```

---

### Task 14: `GroupRollups` component

**Files:**
- Create: `components/organize/GroupRollups.tsx`
- Test: `components/organize/GroupRollups.test.tsx`

**Interfaces:**
- Consumes: `type StatusCounts` from `@/lib/domain/roster`.
- Produces: `GroupRollups(props: { groups: { group: string; counts: StatusCounts }[] }): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `components/organize/GroupRollups.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { GroupRollups } from "@/components/organize/GroupRollups";

test("shows per-group counts, no individual names", () => {
  render(<GroupRollups groups={[{ group: "Scouts", counts: { yes: 22, maybe: 3, no: 5, blank: 10 } }]} />);
  expect(screen.getByText("Scouts")).toBeInTheDocument();
  expect(screen.getByText(/22/)).toBeInTheDocument();
  expect(screen.getByText(/10 to go/i)).toBeInTheDocument();
});

test("prompts to import when empty", () => {
  render(<GroupRollups groups={[]} />);
  expect(screen.getByText(/no one imported yet/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/organize/GroupRollups.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `components/organize/GroupRollups.tsx`:

```tsx
import type { StatusCounts } from "@/lib/domain/roster";

/** Org coordinator view: attendance counts per group. No individual names (privacy). */
export function GroupRollups({ groups }: { groups: { group: string; counts: StatusCounts }[] }) {
  if (groups.length === 0) {
    return <p className="text-sm text-ink-soft">No one imported yet. Add a group roster to start chasing RSVPs.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {groups.map(({ group, counts }) => (
        <div key={group} className="rounded-2xl border border-lily-line bg-white px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="font-display font-bold text-ink">{group}</span>
            <span className="text-sm font-bold text-lantern-deep">{counts.blank} to go</span>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            <span className="font-bold text-reed">{counts.yes}</span> yes · {counts.maybe} maybe · {counts.no} no
          </p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- components/organize/GroupRollups.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/organize/GroupRollups.tsx components/organize/GroupRollups.test.tsx
git commit -m "feat: GroupRollups org attendance cards"
```

---

### Task 15: `LeadsPanel` with roster import

**Files:**
- Create: `components/organize/LeadsPanel.tsx`
- Test: `components/organize/LeadsPanel.test.tsx`

**Interfaces:**
- Consumes: `createLeadAction`, `removeLeadAction`, `regenerateLeadTokenAction`, `importRosterAction` from `@/app/actions/leads`; `parsePersonRows` from `@/lib/domain/roster`; `useRouter` from `next/navigation`.
- Produces: `LeadsPanel(props: { eventId: string; groups: string[]; leads: { id: string; group: string; name: string; token: string }[] }): JSX.Element`

- [ ] **Step 1: Write the failing test**

Create `components/organize/LeadsPanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { LeadsPanel } from "@/components/organize/LeadsPanel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/leads", () => ({
  createLeadAction: vi.fn(), removeLeadAction: vi.fn(),
  regenerateLeadTokenAction: vi.fn(), importRosterAction: vi.fn(),
}));

test("lists leads with copy/regenerate/remove", () => {
  render(<LeadsPanel eventId="e1" groups={["Scouts"]}
    leads={[{ id: "l1", group: "Scouts", name: "Simon", token: "tok" }]} />);
  expect(screen.getByText(/Simon/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /regenerate/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
});

test("offers an import affordance and an assign form", () => {
  render(<LeadsPanel eventId="e1" groups={["Scouts"]} leads={[]} />);
  expect(screen.getByRole("button", { name: /import roster/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /assign lead/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/organize/LeadsPanel.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `components/organize/LeadsPanel.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createLeadAction, removeLeadAction, regenerateLeadTokenAction, importRosterAction,
} from "@/app/actions/leads";
import { parsePersonRows } from "@/lib/domain/roster";

type Lead = { id: string; group: string; name: string; token: string };

export function LeadsPanel({ eventId, groups, leads }: { eventId: string; groups: string[]; leads: Lead[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  function leadUrl(token: string) {
    const base = typeof window === "undefined" ? "" : window.location.origin;
    return `${base}/lead/${token}`;
  }
  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) router.refresh();
      else setError(r.error ?? "Something went wrong.");
    });
  }
  function onAssign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    run(() => createLeadAction(eventId, String(form.get("group") ?? ""), String(form.get("name") ?? "")));
  }

  return (
    <section className="rounded-2xl border border-lily-line bg-white px-4 py-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">Group leads</h2>
        <button type="button" onClick={() => setShowImport((v) => !v)}
          className="rounded-lg bg-pond px-3 py-1 text-sm font-bold text-white hover:opacity-90">
          Import roster
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm font-medium text-lantern-deep">{error}</p>}

      {showImport && <ImportForm eventId={eventId} pending={pending} onDone={() => { setShowImport(false); router.refresh(); }} onError={setError} />}

      <ul className="mt-3 space-y-2">
        {leads.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-lily-line px-3 py-2">
            <span className="text-sm text-ink"><span className="font-semibold">{l.name}</span> · {l.group}</span>
            <button type="button" disabled={pending} onClick={() => void navigator.clipboard?.writeText(leadUrl(l.token))}
              className="rounded-lg bg-reed px-3 py-1 text-sm font-bold text-white hover:bg-reed-deep disabled:opacity-60">Copy link</button>
            <button type="button" disabled={pending} onClick={() => run(() => regenerateLeadTokenAction(l.id, eventId))}
              className="rounded-lg px-3 py-1 text-sm font-bold text-pond underline underline-offset-2 disabled:opacity-60">Regenerate</button>
            <button type="button" disabled={pending} onClick={() => run(() => removeLeadAction(l.id, eventId))}
              className="rounded-lg px-3 py-1 text-sm font-bold text-lantern-deep underline underline-offset-2 disabled:opacity-60">Remove</button>
          </li>
        ))}
      </ul>

      <form onSubmit={onAssign} className="mt-3 flex flex-wrap items-center gap-2">
        <input name="group" list="lead-groups" placeholder="Group" required
          className="min-w-0 flex-1 rounded-lg border border-lily-line px-2 py-1 text-sm text-ink outline-none focus:border-reed" />
        <datalist id="lead-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
        <input name="name" aria-label="Lead name" placeholder="Lead name" required
          className="min-w-0 flex-1 rounded-lg border border-lily-line px-2 py-1 text-sm text-ink outline-none focus:border-reed" />
        <button type="submit" disabled={pending}
          className="shrink-0 rounded-lg bg-reed px-3 py-1 text-sm font-bold text-white hover:bg-reed-deep disabled:opacity-60">Assign lead</button>
      </form>
    </section>
  );
}

function ImportForm({ eventId, pending, onDone, onError }: {
  eventId: string; pending: boolean; onDone: () => void; onError: (e: string) => void;
}) {
  const [group, setGroup] = useState("");
  const [text, setText] = useState("");
  const [youth, setYouth] = useState(true);
  const [busy, startTransition] = useTransition();
  const preview = useMemo(() => (text.trim() ? parsePersonRows(text).length : 0), [text]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await importRosterAction(eventId, group, text, youth);
      if (r.ok) onDone();
      else onError(r.error);
    });
  }
  return (
    <form onSubmit={submit} className="mt-3 rounded-xl border border-lily-line bg-pond/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Group name (e.g. Scouts)" required
          className="min-w-0 flex-1 rounded-lg border border-lily-line px-2 py-1 text-sm text-ink outline-none focus:border-reed" />
        <label className="flex items-center gap-1 text-sm text-ink">
          <input type="checkbox" checked={youth} onChange={(e) => setYouth(e.target.checked)} /> youth roster
        </label>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
        placeholder="Paste rows from your sheet (First Name, Last Name, Patrol, Scout ID)"
        className="mt-2 w-full rounded-lg border border-lily-line px-2 py-1 text-sm text-ink outline-none focus:border-reed" />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-ink-soft">{preview} people detected</span>
        <button type="submit" disabled={pending || busy || preview === 0}
          className="rounded-lg bg-reed px-3 py-1 text-sm font-bold text-white hover:bg-reed-deep disabled:opacity-60">Import</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- components/organize/LeadsPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/organize/LeadsPanel.tsx components/organize/LeadsPanel.test.tsx
git commit -m "feat: LeadsPanel with roster import and lead links"
```

---

### Task 16: Wire into the organizer page + verify

**Files:**
- Modify: `app/organize/[eventId]/page.tsx`

**Interfaces:**
- Consumes: `getGroupRollups` from `@/lib/repository/directory`; `getEventLeads` from `@/lib/repository/leads`; `GroupRollups`, `LeadsPanel` components.

- [ ] **Step 1: Add imports**

In `app/organize/[eventId]/page.tsx`, add:

```ts
import { getGroupRollups } from "@/lib/repository/directory";
import { getEventLeads } from "@/lib/repository/leads";
import { GroupRollups } from "@/components/organize/GroupRollups";
import { LeadsPanel } from "@/components/organize/LeadsPanel";
```

- [ ] **Step 2: Fetch and render above the grid**

After `if (!grid) redirect("/organize");`, add (the lead-assign dropdown draws its group options from the rollups, so no separate directory fetch is needed):

```ts
  const [rollups, leads] = await Promise.all([
    getGroupRollups(grid.id),
    getEventLeads(grid.id),
  ]);
  const groups = rollups.map((r) => r.group);
```

Then, between the `SlugEditor` block and `<OrganizeGrid ... />`, add:

```tsx
      <div className="mb-4 space-y-4">
        <GroupRollups groups={rollups} />
        <LeadsPanel eventId={grid.id} groups={groups} leads={leads} />
      </div>
```

- [ ] **Step 3: Type-check and run the unit suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all unit tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/organize/[eventId]/page.tsx
git commit -m "feat: roster rollups and leads panel on the organizer page"
```

---

### Task 17: Final verification and manual smoke

**Files:** none (verification only).

- [ ] **Step 1: Both suites**

Run: `npm test && npm run test:db`
Expected: both green.

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Accessibility check on the new page**

Start `npm run dev`, create a published event, and from `/organize/<id>` import a small roster and assign a lead. Open the lead link, then run the repo axe check against it (adapt `axe-check.mjs`'s target URL to the `/lead/<token>` page).
Expected: zero axe violations. Confirm Yes/No/Maybe read by icon + text without relying on color.

- [ ] **Step 4: Manual smoke (record the result)**

As the organizer: import the Scouts sheet columns, assign Simon and Naoto as Scouts leads, copy Simon's link. In a private window open `/lead/<token>`: confirm the chase list shows only unanswered people, grouped by patrol, names abbreviated, progress "Heard from X of N." Tap No with a reason, confirm the person drops off and the number moves. Confirm the org page shows Scouts counts but no individual names. Regenerate Simon's link and confirm the old one shows "This link isn't valid."

- [ ] **Step 5: Commit any smoke-driven fixes**

Only if the smoke test surfaced a defect: write the failing test first, then fix, then commit.

---

## Self-Review

**Spec coverage:**
- Organization seam + `orgId` on roots + per-org slug → Task 1. ✓
- No raw Scout IDs (hash) → Task 2, used in Task 6, tested in Task 6. ✓
- RSVP per-day model with override, whole-event write only → Tasks 3, 7. ✓
- Rollups + chase list, Blank-first → Tasks 4, 9. ✓
- Roster import parser (Scout ID / Team columns) → Task 5. ✓
- Directory import/add/deactivate, data minimization (no contact import) → Task 6. ✓
- Role split: org sees counts only (Task 9 `getGroupRollups`, Task 14 `GroupRollups`), lead sees individuals (Task 9 `getLeadChaseView`, Task 12 `ChaseView`). ✓
- Minimal delegation: multiple group leads, links → Tasks 8, 10, 15. ✓
- Token-gated RSVP write, cross-group rejection → Task 11. ✓
- Minor abbreviation server-side → Task 9 (`boardDisplayName` before building the view). ✓
- Lead page noindex + no-referrer, friendly invalid → Task 13. ✓
- One-tap UX, progress, empty/celebration states, icon+text status → Task 12. ✓
- Accessibility AA / axe → Task 17. ✓
- Both-suites + tsc + lint gate → Task 17. ✓

**Placeholder scan:** Task 16 Step 2 deliberately shows a wrong-then-corrected fetch to steer the implementer away from an unneeded `getDirectory` call; the corrected block is complete. No TBD/"handle errors" placeholders elsewhere. ✓

**Type consistency:** `StatusCounts`, `ChaseGroup`, `RosterPerson`, `RsvpRecord`, `EffectiveStatus`, `ImportedPerson` defined in Tasks 3–5 and consumed unchanged in Tasks 6–15. Action names (`createLeadAction`, `removeLeadAction`, `regenerateLeadTokenAction`, `importRosterAction`, `setRsvpAction`) match between definition (Tasks 10–11) and use (Tasks 12, 15). `getLeadAuth`/`getLeadChaseView`/`getEventLeads` consistent between Tasks 8–9 and consumers. ✓
