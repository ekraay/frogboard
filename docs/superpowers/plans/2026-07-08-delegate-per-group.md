# Delegate per Group Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Appoint one lead per `requestedGroup` in an event and give that lead a private, revocable link to a read-only, gaps-first coverage report for their group's tasks.

**Architecture:** A new `Delegate` model keyed on `(eventId, requestedGroup)`. Pure domain helpers (`resolveContact`, `gapsFirst`, `groupByCategory`) in `lib/domain/delegate.ts`. A DB-tested repository in `lib/repository/delegates.ts`. Organizer-gated server actions in `app/actions/delegates.ts`. A `LeadsPanel` on the organizer event page and a public `/lead/[token]` report built from the existing `BoardTask` shape. Follows the established clean-architecture layering: domain (pure) → repository (DB) → actions (gated) → components/pages.

**Tech Stack:** Next.js App Router (see `node_modules/next/dist/docs/`), Prisma v6 + Postgres, React, Vitest (jsdom for unit, node for `*.db.test.ts`), Tailwind ("Matsuri at Dusk" tokens in `app/globals.css`).

## Global Constraints

- Source of truth for decisions: `docs/design/2026-06-22-delegated-organizing-review-handoff.md` and spec `docs/superpowers/specs/2026-06-22-delegate-per-group-design.md`.
- Delegation spine is `requestedGroup`, never `category`. One lead per group per event (`@@unique([eventId, requestedGroup])`).
- Leads are appointed, not claimed. No field becomes "assigned to"; signups stay volunteer-driven.
- Token reuses `newClaimToken()` from `lib/security/tokens.ts` (a random secret; name is not load-bearing).
- Minor privacy: signup names on the report pass through `boardDisplayName(name, minor)`; no volunteer email/phone on the report in this slice.
- Prisma pinned to v6 (v7 dropped url-in-schema). `DATABASE_URL` stays in `schema.prisma`.
- Writing style (repo CLAUDE.md): omit needless words, active voice, no em dash. Applies to code comments and commit messages.
- Before claiming done: `npm test` and `npm run test:db` green, plus `npx tsc --noEmit` and `npm run lint`.
- Strict TDD: red → green → refactor. Schema/migration is the documented exception, verified by running the suites.

---

### Task 1: Schema, migration, and test reset

**Files:**
- Modify: `prisma/schema.prisma` (add `Delegate` model; add back-relation on `Event`)
- Modify: `test/db.ts` (clear `Delegate` in `resetDb`)

**Interfaces:**
- Consumes: nothing.
- Produces: `Delegate` Prisma model with fields `id, eventId, event, requestedGroup, name, email?, phone?, token (unique), createdAt` and compound unique `@@unique([eventId, requestedGroup])` (Prisma client accessor name `eventId_requestedGroup`). `Event.delegates: Delegate[]`.

This is the schema-migration TDD exception: verified by regenerating the client, applying to both databases, and a green type-check, not by a failing test.

- [ ] **Step 1: Add the `Delegate` model and `Event` back-relation**

In `prisma/schema.prisma`, add `delegates Delegate[]` to the `Event` model (next to `tasks Task[]`), then add this model after `Event`:

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

- [ ] **Step 2: Clear delegates in `resetDb`**

In `test/db.ts`, add `await prisma.delegate.deleteMany();` before `await prisma.event.deleteMany();`:

```ts
  await prisma.auditLog.deleteMany();
  await prisma.signup.deleteMany();
  await prisma.task.deleteMany();
  await prisma.delegate.deleteMany();
  await prisma.event.deleteMany();
```

- [ ] **Step 3: Create the dev migration (regenerates the client)**

Run: `npm run db:migrate -- --name add_delegate`
Expected: a new folder under `prisma/migrations/` and "Your database is now in sync". This also runs `prisma generate`, so `prisma.delegate` becomes available.

- [ ] **Step 4: Apply the migration to the test database**

Run: `npm run db:migrate:test`
Expected: "No pending migrations" turns into the delegate migration applied; ends clean.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (the `Delegate` type and `prisma.delegate` now exist).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations test/db.ts
git commit -m "feat: Delegate model, one lead per group per event"
```

---

### Task 2: Domain helpers (`lib/domain/delegate.ts`)

**Files:**
- Create: `lib/domain/delegate.ts`
- Test: `lib/domain/delegate.test.ts`

**Interfaces:**
- Consumes: `BoardTask` from `@/lib/domain/types`; `getSlotInfo` from `@/lib/domain/board`.
- Produces:
  - `resolveContact(pointOfContact: string | null, delegateName: string | null): string | null`
  - `gapsFirst(tasks: BoardTask[]): BoardTask[]`
  - `interface CategoryGroup { category: string; tasks: BoardTask[] }`
  - `groupByCategory(tasks: BoardTask[]): CategoryGroup[]`

- [ ] **Step 1: Write the failing tests**

Create `lib/domain/delegate.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { resolveContact, gapsFirst, groupByCategory } from "@/lib/domain/delegate";
import type { BoardTask } from "@/lib/domain/types";

function task(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "t", kind: "shift", title: "T", category: null, requestedGroup: null,
    neededCount: 2, date: null, startAt: null, endAt: null, dueBy: null,
    pointOfContact: null, location: null, definitionOfDone: null,
    position: 0, status: "todo", waiting: false, signups: [], ...overrides,
  };
}
function signups(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `V${i}`, group: null }));
}

describe("resolveContact", () => {
  test("prefers a non-empty pointOfContact", () => {
    expect(resolveContact("Aki", "Lead")).toBe("Aki");
  });
  test("falls back to the delegate when pointOfContact is empty", () => {
    expect(resolveContact("   ", "Lead")).toBe("Lead");
    expect(resolveContact(null, "Lead")).toBe("Lead");
  });
  test("returns null when both are absent", () => {
    expect(resolveContact(null, null)).toBeNull();
    expect(resolveContact("  ", "  ")).toBeNull();
  });
});

describe("gapsFirst", () => {
  test("understaffed tasks come before full ones, stably", () => {
    const full = task({ id: "full", neededCount: 1, signups: signups(1) });
    const gapA = task({ id: "gapA", neededCount: 3, signups: signups(1) });
    const gapB = task({ id: "gapB", neededCount: 2, signups: signups(0) });
    const out = gapsFirst([full, gapA, gapB]).map((t) => t.id);
    expect(out).toEqual(["gapA", "gapB", "full"]);
  });
  test("does not mutate the input", () => {
    const input = [task({ id: "a", signups: signups(2) }), task({ id: "b" })];
    gapsFirst(input);
    expect(input.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("groupByCategory", () => {
  test("groups by category in first-seen order, empty last as Other", () => {
    const out = groupByCategory([
      task({ id: "1", category: "Food" }),
      task({ id: "2", category: null }),
      task({ id: "3", category: "Food" }),
      task({ id: "4", category: "  " }),
    ]);
    expect(out.map((g) => g.category)).toEqual(["Food", "Other"]);
    expect(out[0].tasks.map((t) => t.id)).toEqual(["1", "3"]);
    expect(out[1].tasks.map((t) => t.id)).toEqual(["2", "4"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/domain/delegate.test.ts`
Expected: FAIL, "does not provide an export named 'resolveContact'" (module missing).

- [ ] **Step 3: Write the implementation**

Create `lib/domain/delegate.ts`:

```ts
import type { BoardTask } from "@/lib/domain/types";
import { getSlotInfo } from "@/lib/domain/board";

/**
 * Who to contact for a task: an explicit per-task pointOfContact wins; else the
 * group's appointed lead; else nobody. Whitespace-only counts as absent.
 */
export function resolveContact(pointOfContact: string | null, delegateName: string | null): string | null {
  const poc = pointOfContact?.trim();
  if (poc) return poc;
  const lead = delegateName?.trim();
  if (lead) return lead;
  return null;
}

/** Understaffed tasks before fully staffed ones. Stable: original order holds within each bucket. */
export function gapsFirst(tasks: BoardTask[]): BoardTask[] {
  return [...tasks].sort((a, b) => Number(getSlotInfo(a).isFull) - Number(getSlotInfo(b).isFull));
}

export interface CategoryGroup {
  category: string;
  tasks: BoardTask[];
}

/** Ordered category buckets for report sub-headings. Null/empty category collects last under "Other". */
export function groupByCategory(tasks: BoardTask[]): CategoryGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, BoardTask[]>();
  for (const t of tasks) {
    const key = t.category?.trim() ? t.category.trim() : "Other";
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(t);
  }
  order.sort((a, b) => Number(a === "Other") - Number(b === "Other"));
  return order.map((category) => ({ category, tasks: byKey.get(category)! }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/domain/delegate.test.ts`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/delegate.ts lib/domain/delegate.test.ts
git commit -m "feat: delegate domain helpers (resolveContact, gapsFirst, groupByCategory)"
```

---

### Task 3: Repository writes (`lib/repository/delegates.ts`)

**Files:**
- Create: `lib/repository/delegates.ts`
- Test: `lib/repository/delegates.db.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/db`; `newClaimToken` from `@/lib/security/tokens`; `Delegate` type from `@prisma/client`.
- Produces:
  - `upsertDelegate(eventId: string, requestedGroup: string, data: { name: string; email?: string | null; phone?: string | null }): Promise<Delegate>`
  - `removeDelegate(id: string): Promise<boolean>`
  - `regenerateDelegateToken(id: string): Promise<Delegate | null>`

- [ ] **Step 1: Write the failing tests**

Create `lib/repository/delegates.db.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { upsertDelegate, removeDelegate, regenerateDelegateToken } from "@/lib/repository/delegates";

async function event(name = "Ginza") {
  return prisma.event.create({ data: { name, startDate: new Date(), endDate: new Date() } });
}

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("upsertDelegate", () => {
  test("creates a delegate with a token", async () => {
    const e = await event();
    const d = await upsertDelegate(e.id, "Hawks", { name: "Aki" });
    expect(d.requestedGroup).toBe("Hawks");
    expect(d.name).toBe("Aki");
    expect(d.token).toBeTruthy();
  });
  test("updates in place and preserves the token (one lead per group)", async () => {
    const e = await event();
    const first = await upsertDelegate(e.id, "Hawks", { name: "Aki", email: "a@x.com" });
    const second = await upsertDelegate(e.id, "Hawks", { name: "Bo" });
    expect(second.id).toBe(first.id);
    expect(second.name).toBe("Bo");
    expect(second.email).toBeNull();
    expect(second.token).toBe(first.token);
    expect(await prisma.delegate.count({ where: { eventId: e.id } })).toBe(1);
  });
});

describe("removeDelegate", () => {
  test("deletes the row and reports success", async () => {
    const e = await event();
    const d = await upsertDelegate(e.id, "Hawks", { name: "Aki" });
    expect(await removeDelegate(d.id)).toBe(true);
    expect(await prisma.delegate.findUnique({ where: { id: d.id } })).toBeNull();
  });
  test("returns false for a missing id", async () => {
    expect(await removeDelegate("nope")).toBe(false);
  });
});

describe("regenerateDelegateToken", () => {
  test("mints a fresh token, killing the old link", async () => {
    const e = await event();
    const d = await upsertDelegate(e.id, "Hawks", { name: "Aki" });
    const rolled = await regenerateDelegateToken(d.id);
    expect(rolled).not.toBeNull();
    expect(rolled!.token).not.toBe(d.token);
  });
  test("returns null for a missing id", async () => {
    expect(await regenerateDelegateToken("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:db -- lib/repository/delegates.db.test.ts`
Expected: FAIL, module `@/lib/repository/delegates` not found.

- [ ] **Step 3: Write the implementation**

Create `lib/repository/delegates.ts`:

```ts
import { prisma } from "@/lib/db";
import type { Delegate } from "@prisma/client";
import { newClaimToken } from "@/lib/security/tokens";

/** Create or replace the lead for a group. Mints a token on create, preserves it on update. */
export async function upsertDelegate(
  eventId: string,
  requestedGroup: string,
  data: { name: string; email?: string | null; phone?: string | null },
): Promise<Delegate> {
  return prisma.delegate.upsert({
    where: { eventId_requestedGroup: { eventId, requestedGroup } },
    update: { name: data.name, email: data.email ?? null, phone: data.phone ?? null },
    create: {
      eventId, requestedGroup, name: data.name,
      email: data.email ?? null, phone: data.phone ?? null, token: newClaimToken(),
    },
  });
}

/** Revoke a lead's link by deleting the row. False when it was already gone. */
export async function removeDelegate(id: string): Promise<boolean> {
  const result = await prisma.delegate.deleteMany({ where: { id } });
  return result.count > 0;
}

/** Mint a new token, invalidating the old link. Null when the delegate is gone. */
export async function regenerateDelegateToken(id: string): Promise<Delegate | null> {
  const existing = await prisma.delegate.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.delegate.update({ where: { id }, data: { token: newClaimToken() } });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:db -- lib/repository/delegates.db.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/repository/delegates.ts lib/repository/delegates.db.test.ts
git commit -m "feat: delegate repository writes (upsert, remove, regenerate token)"
```

---

### Task 4: Repository reads (`getEventGroups`, `getDelegatePatch`)

**Files:**
- Modify: `lib/repository/delegates.ts`
- Test: `lib/repository/delegates.db.test.ts` (add describe blocks)

**Interfaces:**
- Consumes: `BoardTask` from `@/lib/domain/types`; `boardDisplayName` from `@/lib/domain/displayName`.
- Produces:
  - `interface EventGroupRow { requestedGroup: string; covered: number; total: number; delegate: Delegate | null }`
  - `getEventGroups(eventId: string): Promise<EventGroupRow[]>` — one row per distinct in-use `requestedGroup` (coverage + its lead), plus any orphaned delegate whose group has zero tasks (`total: 0`). Sorted alphabetically by group.
  - `interface DelegatePatchData { eventName: string; requestedGroup: string; delegateName: string; tasks: BoardTask[] }`
  - `getDelegatePatch(token: string): Promise<DelegatePatchData | null>` — null on unknown token. Tasks carry `definitionOfDone`, slot counts (via `neededCount` + `signups.length`), and minor-abbreviated signup names.

Note: the report reuses `BoardTask` (not a new `PatchTask` type) so the report shares the board's shape and its `getSlotInfo`/coverage helpers. This is a deliberate reuse choice; the spec's `PatchTask` was illustrative.

- [ ] **Step 1: Write the failing tests**

Append to `lib/repository/delegates.db.test.ts` (add the new imports to the existing import line):

```ts
import { upsertDelegate, removeDelegate, regenerateDelegateToken, getEventGroups, getDelegatePatch } from "@/lib/repository/delegates";
```

```ts
async function task(eventId: string, over: { requestedGroup?: string | null; neededCount?: number; category?: string | null; title?: string; definitionOfDone?: string | null } = {}) {
  return prisma.task.create({
    data: {
      eventId, title: over.title ?? "T", position: Math.random() * 1e6,
      requestedGroup: over.requestedGroup ?? null, neededCount: over.neededCount ?? 1,
      category: over.category ?? null, definitionOfDone: over.definitionOfDone ?? null,
    },
  });
}
async function signup(taskId: string, name: string, minor = false) {
  return prisma.signup.create({ data: { taskId, name, minor, claimToken: "x" } });
}

describe("getEventGroups", () => {
  test("one row per in-use group with coverage and its lead", async () => {
    const e = await event();
    const full = await task(e.id, { requestedGroup: "Hawks", neededCount: 1 });
    await signup(full.id, "Aki");
    await task(e.id, { requestedGroup: "Hawks", neededCount: 2 }); // a gap
    await task(e.id, { requestedGroup: "Eagle", neededCount: 1 });
    const d = await upsertDelegate(e.id, "Hawks", { name: "Lead A" });
    const rows = await getEventGroups(e.id);
    expect(rows.map((r) => r.requestedGroup)).toEqual(["Eagle", "Hawks"]);
    const hawks = rows.find((r) => r.requestedGroup === "Hawks")!;
    expect(hawks).toMatchObject({ covered: 1, total: 2 });
    expect(hawks.delegate!.id).toBe(d.id);
    expect(rows.find((r) => r.requestedGroup === "Eagle")!.delegate).toBeNull();
  });
  test("flags an orphaned delegate whose group has no tasks", async () => {
    const e = await event();
    await task(e.id, { requestedGroup: "Hawks", neededCount: 1 });
    await upsertDelegate(e.id, "Racoon", { name: "Stale" });
    const rows = await getEventGroups(e.id);
    const orphan = rows.find((r) => r.requestedGroup === "Racoon")!;
    expect(orphan.total).toBe(0);
    expect(orphan.delegate).not.toBeNull();
  });
});

describe("getDelegatePatch", () => {
  test("returns the group's tasks with definitionOfDone and minor-abbreviated names", async () => {
    const e = await event("Ginza Bazaar");
    const t = await task(e.id, { requestedGroup: "Hawks", neededCount: 2, definitionOfDone: "Booth staffed", title: "Games" });
    await signup(t.id, "Alex Tanaka", true);
    await task(e.id, { requestedGroup: "Eagle" }); // other group, excluded
    const d = await upsertDelegate(e.id, "Hawks", { name: "Lead A" });
    const patch = await getDelegatePatch(d.token);
    expect(patch).not.toBeNull();
    expect(patch!.eventName).toBe("Ginza Bazaar");
    expect(patch!.requestedGroup).toBe("Hawks");
    expect(patch!.delegateName).toBe("Lead A");
    expect(patch!.tasks).toHaveLength(1);
    expect(patch!.tasks[0].definitionOfDone).toBe("Booth staffed");
    expect(patch!.tasks[0].signups[0].name).toBe("Alex T.");
  });
  test("returns null for an unknown token", async () => {
    expect(await getDelegatePatch("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:db -- lib/repository/delegates.db.test.ts`
Expected: FAIL, `getEventGroups`/`getDelegatePatch` are not exported.

- [ ] **Step 3: Write the implementation**

Append to `lib/repository/delegates.ts` (add the two imports at the top):

```ts
import type { BoardTask } from "@/lib/domain/types";
import { boardDisplayName } from "@/lib/domain/displayName";
```

```ts
export interface EventGroupRow {
  requestedGroup: string;
  covered: number;
  total: number;
  delegate: Delegate | null;
}

/** Distinct in-use groups with coverage and their lead, plus orphaned delegates (total 0). */
export async function getEventGroups(eventId: string): Promise<EventGroupRow[]> {
  const tasks = await prisma.task.findMany({
    where: { eventId, NOT: { requestedGroup: null } },
    select: { requestedGroup: true, neededCount: true, _count: { select: { signups: true } } },
  });
  const delegates = await prisma.delegate.findMany({ where: { eventId } });
  const byGroup = new Map<string, { covered: number; total: number }>();
  for (const t of tasks) {
    const g = (t.requestedGroup ?? "").trim();
    if (!g) continue;
    const row = byGroup.get(g) ?? { covered: 0, total: 0 };
    row.total += 1;
    if (t._count.signups >= t.neededCount) row.covered += 1;
    byGroup.set(g, row);
  }
  const leadByGroup = new Map(delegates.map((d) => [d.requestedGroup, d]));
  for (const d of delegates) {
    if (!byGroup.has(d.requestedGroup)) byGroup.set(d.requestedGroup, { covered: 0, total: 0 });
  }
  return [...byGroup.entries()]
    .map(([requestedGroup, c]) => ({
      requestedGroup, covered: c.covered, total: c.total,
      delegate: leadByGroup.get(requestedGroup) ?? null,
    }))
    .sort((a, b) => a.requestedGroup.localeCompare(b.requestedGroup));
}

export interface DelegatePatchData {
  eventName: string;
  requestedGroup: string;
  delegateName: string;
  tasks: BoardTask[];
}

/** The lead's read-only report by token, or null. Names are minor-abbreviated for public display. */
export async function getDelegatePatch(token: string): Promise<DelegatePatchData | null> {
  const delegate = await prisma.delegate.findUnique({ where: { token }, include: { event: true } });
  if (!delegate) return null;
  const tasks = await prisma.task.findMany({
    where: { eventId: delegate.eventId, requestedGroup: delegate.requestedGroup },
    orderBy: { position: "asc" },
    include: { signups: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, group: true, minor: true } } },
  });
  // Mirrors toBoardTasks in lib/repository/events.ts; kept local to avoid exporting that private mapper.
  return {
    eventName: delegate.event.name,
    requestedGroup: delegate.requestedGroup,
    delegateName: delegate.name,
    tasks: tasks.map((t) => ({
      id: t.id, kind: t.kind, title: t.title, category: t.category,
      requestedGroup: t.requestedGroup, neededCount: t.neededCount, date: t.date,
      startAt: t.startAt, endAt: t.endAt, dueBy: t.dueBy,
      pointOfContact: t.pointOfContact, location: t.location,
      definitionOfDone: t.definitionOfDone, position: t.position, status: t.status,
      waiting: t.waiting,
      signups: t.signups.map((s) => ({ id: s.id, name: boardDisplayName(s.name, s.minor), group: s.group })),
    })),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:db -- lib/repository/delegates.db.test.ts`
Expected: PASS (10 tests total in the file).

- [ ] **Step 5: Commit**

```bash
git add lib/repository/delegates.ts lib/repository/delegates.db.test.ts
git commit -m "feat: delegate repository reads (getEventGroups, getDelegatePatch)"
```

---

### Task 5: Server actions (`app/actions/delegates.ts`)

**Files:**
- Create: `app/actions/delegates.ts`
- Test: `app/actions/delegates.db.test.ts`

**Interfaces:**
- Consumes: `upsertDelegate`, `removeDelegate`, `regenerateDelegateToken`, `getEventGroups` from `@/lib/repository/delegates`; `isValidSession`, `SESSION_COOKIE` from `@/lib/security/session`.
- Produces:
  - `saveDelegate(formData: FormData): Promise<{ ok: true; token: string } | { ok: false; error: string }>` — reads `eventId`, `requestedGroup`, `name`, `email`, `phone`; requires the group be one of the event's in-use groups.
  - `removeDelegateAction(id: string, eventId: string): Promise<{ ok: true } | { ok: false; error: string }>`
  - `regenerateDelegateTokenAction(id: string, eventId: string): Promise<{ ok: true; token: string } | { ok: false; error: string }>`

- [ ] **Step 1: Write the failing tests**

Create `app/actions/delegates.db.test.ts`:

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
import { saveDelegate, removeDelegateAction, regenerateDelegateTokenAction } from "@/app/actions/delegates";

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
});
afterAll(async () => { await prisma.$disconnect(); });

function authenticate() { cookieJar.set(SESSION_COOKIE, sessionToken()); }
function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}
async function eventWithGroup(group = "Hawks") {
  const e = await prisma.event.create({ data: { name: "Ginza", startDate: new Date(), endDate: new Date() } });
  await prisma.task.create({ data: { eventId: e.id, title: "T", position: 1024, requestedGroup: group, neededCount: 1 } });
  return e;
}

describe("saveDelegate", () => {
  test("rejects a signed-out caller", async () => {
    const e = await eventWithGroup();
    expect(await saveDelegate(fd({ eventId: e.id, requestedGroup: "Hawks", name: "Aki" })))
      .toEqual({ ok: false, error: "Please sign in." });
    expect(await prisma.delegate.count()).toBe(0);
  });
  test("assigns a lead to an in-use group", async () => {
    authenticate();
    const e = await eventWithGroup();
    const r = await saveDelegate(fd({ eventId: e.id, requestedGroup: "Hawks", name: "Aki" }));
    expect(r.ok).toBe(true);
    expect(await prisma.delegate.count({ where: { eventId: e.id, requestedGroup: "Hawks" } })).toBe(1);
  });
  test("rejects a group with no tasks", async () => {
    authenticate();
    const e = await eventWithGroup();
    const r = await saveDelegate(fd({ eventId: e.id, requestedGroup: "Ghosts", name: "Aki" }));
    expect(r).toEqual({ ok: false, error: "That group has no tasks in this event." });
  });
  test("requires a name", async () => {
    authenticate();
    const e = await eventWithGroup();
    expect(await saveDelegate(fd({ eventId: e.id, requestedGroup: "Hawks", name: "  " })))
      .toEqual({ ok: false, error: "Give the lead a name." });
  });
});

describe("removeDelegateAction", () => {
  test("removes a delegate when signed in", async () => {
    authenticate();
    const e = await eventWithGroup();
    const d = await prisma.delegate.create({ data: { eventId: e.id, requestedGroup: "Hawks", name: "Aki", token: "tok" } });
    expect(await removeDelegateAction(d.id, e.id)).toEqual({ ok: true });
    expect(await prisma.delegate.findUnique({ where: { id: d.id } })).toBeNull();
  });
  test("rejects a signed-out caller", async () => {
    expect(await removeDelegateAction("x", "y")).toEqual({ ok: false, error: "Please sign in." });
  });
});

describe("regenerateDelegateTokenAction", () => {
  test("rolls the token when signed in", async () => {
    authenticate();
    const e = await eventWithGroup();
    const d = await prisma.delegate.create({ data: { eventId: e.id, requestedGroup: "Hawks", name: "Aki", token: "old" } });
    const r = await regenerateDelegateTokenAction(d.id, e.id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.token).not.toBe("old");
  });
  test("rejects a signed-out caller", async () => {
    expect(await regenerateDelegateTokenAction("x", "y")).toEqual({ ok: false, error: "Please sign in." });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:db -- app/actions/delegates.db.test.ts`
Expected: FAIL, module `@/app/actions/delegates` not found.

- [ ] **Step 3: Write the implementation**

Create `app/actions/delegates.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isValidSession, SESSION_COOKIE } from "@/lib/security/session";
import {
  upsertDelegate, removeDelegate, regenerateDelegateToken, getEventGroups,
} from "@/lib/repository/delegates";

type Ok = { ok: true };
type Err = { ok: false; error: string };

async function requireOrganizer(): Promise<Ok | Err> {
  const jar = await cookies();
  if (!isValidSession(jar.get(SESSION_COOKIE)?.value)) return { ok: false, error: "Please sign in." };
  return { ok: true };
}

/** Assign or update the lead for one group. The group must have tasks in the event. */
export async function saveDelegate(formData: FormData): Promise<{ ok: true; token: string } | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  const eventId = String(formData.get("eventId") ?? "").trim();
  const requestedGroup = String(formData.get("requestedGroup") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  if (!name) return { ok: false, error: "Give the lead a name." };
  if (!requestedGroup) return { ok: false, error: "Pick a group." };
  const groups = await getEventGroups(eventId);
  if (!groups.some((g) => g.requestedGroup === requestedGroup && g.total > 0)) {
    return { ok: false, error: "That group has no tasks in this event." };
  }
  const delegate = await upsertDelegate(eventId, requestedGroup, { name, email, phone });
  revalidatePath(`/organize/${eventId}`);
  return { ok: true, token: delegate.token };
}

/** Revoke a lead's link. Organizer-gated. */
export async function removeDelegateAction(id: string, eventId: string): Promise<Ok | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  const removed = await removeDelegate(id);
  if (!removed) return { ok: false, error: "That lead is already gone." };
  revalidatePath(`/organize/${eventId}`);
  return { ok: true };
}

/** Roll a lead's token, invalidating the old link. Organizer-gated. */
export async function regenerateDelegateTokenAction(id: string, eventId: string): Promise<{ ok: true; token: string } | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  const delegate = await regenerateDelegateToken(id);
  if (!delegate) return { ok: false, error: "That lead is already gone." };
  revalidatePath(`/organize/${eventId}`);
  return { ok: true, token: delegate.token };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:db -- app/actions/delegates.db.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add app/actions/delegates.ts app/actions/delegates.db.test.ts
git commit -m "feat: organizer-gated delegate actions (save, remove, regenerate)"
```

---

### Task 6: `DelegatePatch` component

**Files:**
- Create: `components/DelegatePatch.tsx`
- Test: `components/DelegatePatch.test.tsx`

**Interfaces:**
- Consumes: `BoardTask` from `@/lib/domain/types`; `gapsFirst`, `groupByCategory` from `@/lib/domain/delegate`; `getSlotInfo`, `coverageFor` from `@/lib/domain/board`.
- Produces: `DelegatePatch(props: { eventName: string; requestedGroup: string; delegateName: string; tasks: BoardTask[] }): JSX.Element`

- [ ] **Step 1: Write the failing tests**

Create `components/DelegatePatch.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { DelegatePatch } from "@/components/DelegatePatch";
import type { BoardTask } from "@/lib/domain/types";

function task(over: Partial<BoardTask>): BoardTask {
  return {
    id: "t", kind: "shift", title: "T", category: null, requestedGroup: "Hawks",
    neededCount: 2, date: null, startAt: null, endAt: null, dueBy: null,
    pointOfContact: null, location: null, definitionOfDone: null,
    position: 0, status: "todo", waiting: false, signups: [], ...over,
  };
}

test("shows lead, group, coverage, and gaps-first order", () => {
  render(<DelegatePatch eventName="Ginza" requestedGroup="Hawks" delegateName="Aki" tasks={[
    task({ id: "full", title: "Setup", neededCount: 1, signups: [{ id: "s", name: "Bo", group: null }] }),
    task({ id: "gap", title: "Games", neededCount: 3, definitionOfDone: "Booth staffed" }),
  ]} />);
  expect(screen.getByRole("heading", { level: 1, name: /Aki/ })).toBeInTheDocument();
  expect(screen.getByText(/Hawks/)).toBeInTheDocument();
  expect(screen.getByText(/1 of 2 covered/i)).toBeInTheDocument();
  const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
  expect(titles).toEqual(["Games", "Setup"]); // gap first
  expect(screen.getByText(/Booth staffed/)).toBeInTheDocument();
});

test("renders a friendly empty state and the reminders note", () => {
  render(<DelegatePatch eventName="Ginza" requestedGroup="Racoon" delegateName="Sam" tasks={[]} />);
  expect(screen.getByText(/No tasks ask for Racoon/i)).toBeInTheDocument();
  expect(screen.getByText(/Reminders and nudges are coming/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- components/DelegatePatch.test.tsx`
Expected: FAIL, module `@/components/DelegatePatch` not found.

- [ ] **Step 3: Write the implementation**

Create `components/DelegatePatch.tsx`:

```tsx
import type { BoardTask } from "@/lib/domain/types";
import { gapsFirst, groupByCategory } from "@/lib/domain/delegate";
import { getSlotInfo, coverageFor } from "@/lib/domain/board";

/** A group lead's read-only coverage report: gaps first, sub-grouped by category. */
export function DelegatePatch({ eventName, requestedGroup, delegateName, tasks }: {
  eventName: string; requestedGroup: string; delegateName: string; tasks: BoardTask[];
}) {
  const { covered, total } = coverageFor(tasks);
  const sections = groupByCategory(gapsFirst(tasks));
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-8">
      <header className="mb-6">
        <p className="text-sm font-bold text-reed-deep">{requestedGroup} · {eventName}</p>
        <h1 className="font-display text-2xl font-extrabold text-ink">Hi {delegateName} 🐸</h1>
        <p className="mt-1 text-ink-soft">{covered} of {total} covered</p>
      </header>
      {total === 0 && (
        <p className="text-ink-soft">No tasks ask for {requestedGroup} right now.</p>
      )}
      {sections.map((s) => (
        <section key={s.category} className="mb-6">
          <h2 className="mb-2 font-display text-lg font-bold text-ink">{s.category}</h2>
          <ul className="space-y-3">
            {s.tasks.map((t) => {
              const slot = getSlotInfo(t);
              return (
                <li key={t.id} className="rounded-2xl border border-lily-line bg-white px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-bold text-ink">{t.title}</h3>
                    <span className={slot.isFull ? "shrink-0 text-sm font-bold text-reed" : "shrink-0 text-sm font-bold text-lantern-deep"}>
                      {slot.filled} of {slot.needed} filled
                    </span>
                  </div>
                  {t.definitionOfDone && (
                    <p className="mt-1 text-sm text-ink-soft">
                      <span className="font-semibold">What good looks like:</span> {t.definitionOfDone}
                    </p>
                  )}
                  {t.signups.length > 0 && (
                    <p className="mt-1 text-sm text-ink-soft">{t.signups.map((s2) => s2.name).join(", ")}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="mt-8 text-sm text-ink-soft">Reminders and nudges are coming.</p>
    </main>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- components/DelegatePatch.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/DelegatePatch.tsx components/DelegatePatch.test.tsx
git commit -m "feat: DelegatePatch report (gaps-first, definitionOfDone, empty state)"
```

---

### Task 7: `/lead/[token]` public report page

**Files:**
- Create: `app/lead/[token]/page.tsx`

**Interfaces:**
- Consumes: `getDelegatePatch` from `@/lib/repository/delegates`; `DelegatePatch` from `@/components/DelegatePatch`.
- Produces: a route at `/lead/[token]`. No password. `force-dynamic`. Null token renders a friendly message, not a thrown error.

This page has no unit test (thin composition of tested parts). It is verified by the type-check and the manual smoke step below.

- [ ] **Step 1: Write the page**

Create `app/lead/[token]/page.tsx`:

```tsx
import { getDelegatePatch } from "@/lib/repository/delegates";
import { DelegatePatch } from "@/components/DelegatePatch";

// The report reflects live signups; always render fresh.
export const dynamic = "force-dynamic";

export default async function LeadReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const patch = await getDelegatePatch(token);
  if (!patch) {
    return (
      <main className="mx-auto max-w-md px-4 pt-16 text-center">
        <h1 className="font-display text-xl font-extrabold text-ink">This link isn&apos;t valid 🐸</h1>
        <p className="mt-2 text-ink-soft">Ask your organizer for a fresh one.</p>
      </main>
    );
  }
  return (
    <DelegatePatch
      eventName={patch.eventName}
      requestedGroup={patch.requestedGroup}
      delegateName={patch.delegateName}
      tasks={patch.tasks}
    />
  );
}
```

- [ ] **Step 2: Type-check the route**

Run: `npx tsc --noEmit`
Expected: no errors (Next's `params` promise shape matches the sibling routes).

- [ ] **Step 3: Commit**

```bash
git add app/lead/[token]/page.tsx
git commit -m "feat: /lead/[token] renders the group report or a friendly invalid message"
```

---

### Task 8: `LeadsPanel` component

**Files:**
- Create: `components/organize/LeadsPanel.tsx`
- Test: `components/organize/LeadsPanel.test.tsx`

**Interfaces:**
- Consumes: `EventGroupRow` from `@/lib/repository/delegates`; `saveDelegate`, `removeDelegateAction`, `regenerateDelegateTokenAction` from `@/app/actions/delegates`; `useRouter` from `next/navigation`.
- Produces: `LeadsPanel(props: { eventId: string; groups: EventGroupRow[] }): JSX.Element`

- [ ] **Step 1: Write the failing tests**

Create `components/organize/LeadsPanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { LeadsPanel } from "@/components/organize/LeadsPanel";
import type { EventGroupRow } from "@/lib/repository/delegates";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/delegates", () => ({
  saveDelegate: vi.fn(), removeDelegateAction: vi.fn(), regenerateDelegateTokenAction: vi.fn(),
}));

function row(over: Partial<EventGroupRow>): EventGroupRow {
  return { requestedGroup: "Hawks", covered: 1, total: 2, delegate: null, ...over };
}

test("shows coverage and an assign form for a group with no lead", () => {
  render(<LeadsPanel eventId="e1" groups={[row({})]} />);
  expect(screen.getByText(/Hawks/)).toBeInTheDocument();
  expect(screen.getByText(/1 of 2 covered/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /assign lead/i })).toBeInTheDocument();
});

test("shows the lead name plus copy, regenerate, and remove for an assigned group", () => {
  render(<LeadsPanel eventId="e1" groups={[row({
    delegate: { id: "d1", eventId: "e1", requestedGroup: "Hawks", name: "Aki", email: null, phone: null, token: "tok", createdAt: new Date() },
  })]} />);
  expect(screen.getByText(/Aki/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /regenerate/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
});

test("flags an orphaned group whose tasks are gone", () => {
  render(<LeadsPanel eventId="e1" groups={[row({ requestedGroup: "Racoon", total: 0, covered: 0,
    delegate: { id: "d2", eventId: "e1", requestedGroup: "Racoon", name: "Sam", email: null, phone: null, token: "t2", createdAt: new Date() } })]} />);
  expect(screen.getByText(/No tasks ask for Racoon right now/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- components/organize/LeadsPanel.test.tsx`
Expected: FAIL, module `@/components/organize/LeadsPanel` not found.

- [ ] **Step 3: Write the implementation**

Create `components/organize/LeadsPanel.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EventGroupRow } from "@/lib/repository/delegates";
import { saveDelegate, removeDelegateAction, regenerateDelegateTokenAction } from "@/app/actions/delegates";

/** Organizer panel: appoint or revoke one lead per group, with a copyable report link. */
export function LeadsPanel({ eventId, groups }: { eventId: string; groups: EventGroupRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
    run(() => saveDelegate(form));
  }

  return (
    <section className="rounded-2xl border border-lily-line bg-white px-4 py-3">
      <h2 className="font-display text-lg font-bold text-ink">Group leads</h2>
      {error && <p role="alert" className="mt-2 text-sm font-medium text-lantern-deep">{error}</p>}
      <ul className="mt-3 space-y-3">
        {groups.map((g) => (
          <li key={g.requestedGroup} className="rounded-xl border border-lily-line px-3 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-bold text-ink">{g.requestedGroup}</span>
              <span className="text-sm text-ink-soft">{g.covered} of {g.total} covered</span>
            </div>
            {g.total === 0 && (
              <p className="mt-1 text-sm font-medium text-lantern-deep">No tasks ask for {g.requestedGroup} right now.</p>
            )}
            {g.delegate ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-sm text-ink">Lead: <span className="font-semibold">{g.delegate.name}</span></span>
                <button type="button" disabled={pending}
                  onClick={() => void navigator.clipboard?.writeText(leadUrl(g.delegate!.token))}
                  className="rounded-lg bg-reed px-3 py-1 text-sm font-bold text-white hover:bg-reed-deep disabled:opacity-60">
                  Copy link
                </button>
                <button type="button" disabled={pending}
                  onClick={() => run(() => regenerateDelegateTokenAction(g.delegate!.id, eventId))}
                  className="rounded-lg px-3 py-1 text-sm font-bold text-pond underline underline-offset-2 disabled:opacity-60">
                  Regenerate
                </button>
                <button type="button" disabled={pending}
                  onClick={() => run(() => removeDelegateAction(g.delegate!.id, eventId))}
                  className="rounded-lg px-3 py-1 text-sm font-bold text-lantern-deep underline underline-offset-2 disabled:opacity-60">
                  Remove
                </button>
              </div>
            ) : (
              <form onSubmit={onAssign} className="mt-2 flex flex-wrap items-center gap-2">
                <input type="hidden" name="eventId" value={eventId} />
                <input type="hidden" name="requestedGroup" value={g.requestedGroup} />
                <input name="name" aria-label={`Lead name for ${g.requestedGroup}`} placeholder="Lead name" required
                  className="min-w-0 flex-1 rounded-lg border border-lily-line px-2 py-1 text-sm text-ink outline-none focus:border-reed" />
                <input name="email" aria-label={`Lead email for ${g.requestedGroup}`} placeholder="Email (optional)"
                  className="min-w-0 flex-1 rounded-lg border border-lily-line px-2 py-1 text-sm text-ink outline-none focus:border-reed" />
                <input name="phone" aria-label={`Lead phone for ${g.requestedGroup}`} placeholder="Phone (optional)"
                  className="min-w-0 flex-1 rounded-lg border border-lily-line px-2 py-1 text-sm text-ink outline-none focus:border-reed" />
                <button type="submit" disabled={pending}
                  className="shrink-0 rounded-lg bg-reed px-3 py-1 text-sm font-bold text-white hover:bg-reed-deep disabled:opacity-60">
                  Assign lead
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- components/organize/LeadsPanel.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/organize/LeadsPanel.tsx components/organize/LeadsPanel.test.tsx
git commit -m "feat: LeadsPanel to appoint, copy, regenerate, and remove group leads"
```

---

### Task 9: Wire `LeadsPanel` into the organizer event page

**Files:**
- Modify: `app/organize/[eventId]/page.tsx`

**Interfaces:**
- Consumes: `getEventGroups` from `@/lib/repository/delegates`; `LeadsPanel` from `@/components/organize/LeadsPanel`.
- Produces: the Leads panel above the grid on `/organize/[eventId]`.

This is a thin server-component wiring change, verified by the type-check, the full unit suite, and the manual smoke step.

- [ ] **Step 1: Add the imports**

In `app/organize/[eventId]/page.tsx`, add:

```ts
import { getEventGroups } from "@/lib/repository/delegates";
import { LeadsPanel } from "@/components/organize/LeadsPanel";
```

- [ ] **Step 2: Fetch groups and render the panel above the grid**

After `const grid = await getEventGrid(eventId); if (!grid) redirect("/organize");`, add:

```ts
  const groups = await getEventGroups(grid.id);
```

Then, between the `SlugEditor` block and `<OrganizeGrid ... />`, add:

```tsx
      <div className="mb-4">
        <LeadsPanel eventId={grid.id} groups={groups} />
      </div>
```

- [ ] **Step 3: Type-check and run the full unit suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all unit tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/organize/[eventId]/page.tsx
git commit -m "feat: show the Leads panel on the organizer event page"
```

---

### Task 10: Final verification and manual smoke

**Files:** none (verification only).

- [ ] **Step 1: Run both test suites**

Run: `npm test && npm run test:db`
Expected: both green.

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Manual smoke (record the result)**

Start the app (`npm run dev`), then: sign in at `/organize`, open an event with grouped tasks, assign a lead to a group in the Leads panel, click **Copy link**, open `/lead/<token>` in a private window, confirm the report shows gaps first with `definitionOfDone` and minor-abbreviated names. Click **Regenerate**, confirm the old link now shows "This link isn't valid." Click **Remove**, confirm the link dies.

- [ ] **Step 4: Commit any smoke-driven fixes**

Only if the smoke test surfaced a defect: write the failing test first (return to the relevant task's pattern), then fix, then commit.

---

## Self-Review

**Spec coverage:**
- Data model `Delegate` + `@@unique([eventId, requestedGroup])` → Task 1. ✓
- `resolveContact` resolution rule → Task 2. ✓ (Consumed later by reminders; defined now per spec.)
- `gapsFirst`, `groupByCategory` → Task 2, used in Task 6. ✓
- Repository `upsertDelegate`, `removeDelegate`, `regenerateDelegateToken` → Task 3. ✓
- Repository `getEventGroups` (coverage + orphan flag), `getDelegatePatch` → Task 4. ✓
- Actions `saveDelegate` (in-use-group validation), remove, regenerate, organizer-gated, revalidate → Task 5. ✓
- `LeadsPanel` (coverage, assign form, copy/regenerate/remove, orphan warning) → Task 8, wired in Task 9. ✓
- `DelegatePatch` (gaps-first, category sub-grouping, `definitionOfDone`, minor privacy, empty state, reminders note) → Task 6. ✓
- `/lead/[token]` `force-dynamic`, no password, friendly invalid message → Task 7. ✓
- Non-destructive `pointOfContact`: no data migration exists; `resolveContact` treats per-task value as override → satisfied by Task 2 + Task 1 (no migration touches `pointOfContact`). ✓
- Stable join / orphan flagging: assignment limited to in-use groups (Task 5), orphan surfaced (Task 4 + Task 8). ✓
- Token revocation via remove + regenerate → Tasks 3, 5, 8. ✓
- Out of scope (reminders, contact details on report, `Group` entity, accounts): not built. ✓

**Deliberate departure from the spec:** the report reuses `BoardTask` instead of a bespoke `PatchTask`, to share the board's shape and coverage helpers. Documented in Task 4.

**Placeholder scan:** no TBD/TODO/"handle edge cases"; every code step carries complete code. ✓

**Type consistency:** `EventGroupRow` and `DelegatePatchData` defined in Task 4 and consumed unchanged in Tasks 5, 8. Action names `saveDelegate` / `removeDelegateAction` / `regenerateDelegateTokenAction` match between Task 5 (definition) and Task 8 (use). `CategoryGroup` defined in Task 2, consumed in Task 6. ✓
