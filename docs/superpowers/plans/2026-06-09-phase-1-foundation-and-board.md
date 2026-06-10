# Phase 1 — Foundation & Public Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the MVP volunteer frog board — anyone with the link can see an event's shifts/frogs grouped by day and claim or release a slot, with every change written to an append-only audit log.

**Architecture:** Next.js (App Router) full-stack app. Pure domain functions in `lib/domain/` hold all logic (grouping, slot math, claim/release validation, audit-entry construction) and are unit-tested without a database. A thin repository layer (`lib/repository/`) wraps Prisma in transactions and is covered by integration tests against a test Postgres database. Server Actions call the repository; React Server Components render the board; one client component handles claim/release with optimistic UI.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Tailwind CSS, Prisma ORM, Neon Postgres, Vitest + @testing-library/react.

This is Phase 1 of 5. See the spec at `docs/superpowers/specs/2026-06-09-volunteer-frog-board-design.md`. Phases 2–5 (admin/import, Kanban/table, accounts, reports) are separate plans. The Prisma schema in this plan includes fields used by later phases (`status`, `waiting`, `userId`, etc.) so no migration is needed to add them later.

---

## Guiding Principles (ways of working)

These shape *how* every task below is built, not just what it builds.

- **Kent Beck — TDD & simple design.** Red → green → refactor on every task (this
  plan is structured that way). Make it work, then right, then fast. Four rules of
  simple design, in order: passes the tests, reveals intent, no duplication,
  fewest elements. When a change is awkward, first make the change *easy*, then
  make the easy change.
- **Ward Cunningham — simplest thing & honest debt.** Build the simplest thing
  that could possibly work. When you knowingly take a shortcut, write it down (a
  one-line `## Known debt` note in the PR/commit) and pay it back deliberately —
  debt is a tool only if it's visible.
- **Bob Martin — clean architecture & boundaries.** Hold the dependency rule:
  `lib/domain/` knows nothing about Prisma, Next, or React; frameworks depend on
  the domain, never the reverse. The repository layer is the only seam that
  touches the database. (Already the structure here — keep it that way.)
- **Elizabeth Hendrickson — exploratory testing.** Automated tests prove what you
  thought to check; they don't find surprises. After each phase, run a timeboxed
  charter — e.g. "explore claiming the last slot from two phones at once; weird
  names, double-taps, back-button" — and turn anything found into a new test.
- **Henrik Kniberg — self-organization, visual management, definition of done.**
  The product embodies these; so does the process. Honor each task's DoD
  checkboxes; visualize work; prefer pull over push.
- **Don Reinertsen — flow & small batches.** Thin vertical slices (Phase 1 is a
  shippable slice). One task = one commit = small batch. Limit work-in-progress.
  Sequence by cost of delay — the no-login board ships first because its delay
  cost is highest (scouts can't sign up without it).
- **John Cutler — outcomes over output.** Success = scouts actually sign up and
  gaps close, not features shipped. Each phase must earn the next; resist the
  feature factory. Keep the work and its rationale visible.
- **Esther Derby — retrospect & improve the system.** After each phase, a short
  retro: what helped, what to change, one adjustment to the next plan. Improve the
  system, not the people.

## File Structure

```
prisma/
  schema.prisma              # data model: Event, Task, Signup, AuditLog + enums
  seed.ts                    # loads one real event for local dev
lib/
  db.ts                      # singleton Prisma client
  domain/
    types.ts                 # plain TS types used by domain + UI (no Prisma imports)
    board.ts                 # groupTasksByDay, getSlotInfo, formatWhen
    claim.ts                 # validateClaim, validateRelease
    audit.ts                 # claimAuditDetails, releaseAuditDetails
  repository/
    signups.ts               # createSignupWithAudit, deleteSignupWithAudit (transactions)
    events.ts                # getActiveEventBoard
app/
  actions/signups.ts         # claimSlot, releaseSignup server actions
  page.tsx                   # home: render active event's board
  layout.tsx                 # root layout (pond theme shell)
  globals.css                # Tailwind + theme tokens
components/
  Board.tsx                  # server component: day groups -> TaskCard list
  TaskCard.tsx               # server component: one shift/frog card
  ClaimForm.tsx              # client component: claim a slot (optimistic)
  Claimant.tsx               # client component: a claimed name + remove button
test/
  setup.ts                   # RTL/jsdom setup
  db.ts                      # test-db helpers: resetDb()
```

**Responsibility boundaries:**
- `lib/domain/*` — pure, deterministic, no I/O. The heart; heavily unit-tested.
- `lib/repository/*` — the only place Prisma is touched for writes; transactional; integration-tested.
- `app/actions/*` — glue: validate via domain, persist via repository, `revalidatePath`.
- `components/*` — rendering only; the single client component owns optimistic state.

---

## Prerequisites (one-time, before Task 1)

You need a Neon account (free) with two databases: one for dev, one for tests. From the Neon console create a project, then two databases (e.g. `frogboard` and `frogboard_test`); copy each connection string. You'll paste them into `.env` and `.env.test` in Task 2. No other accounts are needed for Phase 1.

---

## Task 1: Scaffold the Next.js app with testing

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `test/setup.ts`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `postcss.config.mjs`, `tailwind.config.ts`
- Test: `test/smoke.test.ts`

- [ ] **Step 1: Scaffold with create-next-app**

Run from `/Users/ekraay/claude/volunteer`:

```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --no-src-dir --import-alias "@/*" --use-npm --yes
```

Expected: project files created in the current directory. If it refuses because the directory isn't empty, move the existing `docs/` aside, scaffold, then move it back:

```bash
mv docs ../_docs_tmp && npx create-next-app@latest . --typescript --tailwind --app --eslint --no-src-dir --import-alias "@/*" --use-npm --yes && mv ../_docs_tmp docs
```

- [ ] **Step 2: Install test tooling**

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

Expected: packages added to `devDependencies`.

- [ ] **Step 3: Add Vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    globals: true,
    include: ["**/*.test.ts", "**/*.test.tsx"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 4: Add test setup file**

Create `test/setup.ts`:

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: Add test scripts to package.json**

In `package.json`, add to the `"scripts"` object:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Write the smoke test**

Create `test/smoke.test.ts`:

```typescript
import { expect, test } from "vitest";

test("test runner works", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 7: Run the smoke test to verify it passes**

Run: `npm test`
Expected: PASS — 1 passed.

- [ ] **Step 8: Verify the dev server boots**

Run: `npm run build`
Expected: build completes with no type errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest"
```

---

## Task 2: Data model with Prisma and Neon

**Files:**
- Create: `prisma/schema.prisma`, `lib/db.ts`, `.env`, `.env.test`, `.env.example`
- Modify: `package.json` (add prisma scripts), `.gitignore` (ensure `.env*` ignored — already present)

- [ ] **Step 1: Install Prisma**

```bash
npm install -D prisma
npm install @prisma/client
```

- [ ] **Step 2: Write the schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum TaskKind {
  shift
  frog
}

enum TaskStatus {
  todo
  in_progress
  review
  done
}

enum AuditAction {
  claim
  release
  edit
  move
  flag
}

model Event {
  id        String   @id @default(cuid())
  name      String
  startDate DateTime
  endDate   DateTime
  tasks     Task[]
  createdAt DateTime @default(now())
}

model Task {
  id               String      @id @default(cuid())
  eventId          String
  event            Event       @relation(fields: [eventId], references: [id], onDelete: Cascade)
  kind             TaskKind    @default(shift)
  title            String
  category         String?
  requestedGroup   String?
  neededCount      Int         @default(1)
  date             DateTime?
  startTime        String?     // display string e.g. "10:00 AM"; null = all-day
  endTime          String?
  dueBy            DateTime?   // frog deadline
  pointOfContact   String?
  location         String?
  definitionOfDone String?
  status           TaskStatus  @default(todo)
  waiting          Boolean     @default(false)
  signups          Signup[]
  auditLogs        AuditLog[]
  createdAt        DateTime    @default(now())

  @@index([eventId])
}

model Signup {
  id        String   @id @default(cuid())
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  name      String
  email     String?
  phone     String?
  group     String?
  minor     Boolean?
  userId    String?  // reserved for Phase 4 optional accounts
  createdAt DateTime @default(now())

  @@index([taskId])
}

model AuditLog {
  id        String      @id @default(cuid())
  taskId    String
  task      Task        @relation(fields: [taskId], references: [id], onDelete: Cascade)
  action    AuditAction
  details   Json
  createdAt DateTime    @default(now())

  @@index([taskId])
}
```

- [ ] **Step 2b: Create env files**

Create `.env` (paste your Neon dev connection string):

```
DATABASE_URL="postgresql://USER:PASS@HOST/frogboard?sslmode=require"
```

Create `.env.test` (paste your Neon test connection string):

```
DATABASE_URL="postgresql://USER:PASS@HOST/frogboard_test?sslmode=require"
```

Create `.env.example` (committed, no secrets):

```
DATABASE_URL="postgresql://USER:PASS@HOST/DBNAME?sslmode=require"
```

- [ ] **Step 3: Add Prisma scripts to package.json**

In `"scripts"`:

```json
"db:migrate": "prisma migrate dev",
"db:push:test": "dotenv -e .env.test -- prisma migrate deploy",
"db:seed": "prisma db seed"
```

Install dotenv-cli for the test script:

```bash
npm install -D dotenv-cli
```

- [ ] **Step 4: Run the first migration**

Run: `npx prisma migrate dev --name init`
Expected: creates `prisma/migrations/`, applies to the dev database, generates the client. Output ends with "Your database is now in sync with your schema."

- [ ] **Step 5: Apply schema to the test database**

Run: `npm run db:push:test`
Expected: "All migrations have been successfully applied."

- [ ] **Step 6: Create the Prisma client singleton**

Create `lib/db.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 7: Write a connection smoke test**

Create `test/db-connection.test.ts`:

```typescript
import { expect, test } from "vitest";
import { prisma } from "@/lib/db";

test("can reach the database", async () => {
  const result = await prisma.$queryRaw`SELECT 1 as ok`;
  expect(result).toEqual([{ ok: 1 }]);
});
```

- [ ] **Step 8: Run the connection test**

Run: `npx dotenv -e .env.test -- npx vitest run test/db-connection.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add Prisma schema and Neon connection"
```

---

## Task 3: Domain types and board grouping

**Files:**
- Create: `lib/domain/types.ts`, `lib/domain/board.ts`
- Test: `lib/domain/board.test.ts`

- [ ] **Step 1: Define domain types**

Create `lib/domain/types.ts`:

```typescript
export type TaskKind = "shift" | "frog";
export type TaskStatus = "todo" | "in_progress" | "review" | "done";

export interface BoardSignup {
  id: string;
  name: string;
  group: string | null;
  minor: boolean | null;
}

export interface BoardTask {
  id: string;
  kind: TaskKind;
  title: string;
  category: string | null;
  requestedGroup: string | null;
  neededCount: number;
  date: Date | null;
  startTime: string | null;
  endTime: string | null;
  dueBy: Date | null;
  pointOfContact: string | null;
  location: string | null;
  definitionOfDone: string | null;
  status: TaskStatus;
  waiting: boolean;
  signups: BoardSignup[];
}

export interface SlotInfo {
  filled: number;
  needed: number;
  isFull: boolean;
}

export interface DayGroup {
  /** ISO date string (YYYY-MM-DD) or the literal "all-day" for undated tasks */
  key: string;
  /** Human label, e.g. "Saturday, Jul 25" or "No set date" */
  label: string;
  tasks: BoardTask[];
}
```

- [ ] **Step 2: Write failing tests for getSlotInfo**

Create `lib/domain/board.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { getSlotInfo, groupTasksByDay, formatWhen } from "@/lib/domain/board";
import type { BoardTask } from "@/lib/domain/types";

function task(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "t1",
    kind: "shift",
    title: "Games",
    category: null,
    requestedGroup: null,
    neededCount: 3,
    date: new Date("2026-07-25T00:00:00Z"),
    startTime: "10:00 AM",
    endTime: "1:00 PM",
    dueBy: null,
    pointOfContact: null,
    location: null,
    definitionOfDone: null,
    status: "todo",
    waiting: false,
    signups: [],
    ...overrides,
  };
}

describe("getSlotInfo", () => {
  test("counts filled vs needed", () => {
    const t = task({
      neededCount: 3,
      signups: [
        { id: "s1", name: "Ann", group: null, minor: null },
        { id: "s2", name: "Bob", group: null, minor: null },
      ],
    });
    expect(getSlotInfo(t)).toEqual({ filled: 2, needed: 3, isFull: false });
  });

  test("isFull when filled reaches needed", () => {
    const t = task({
      neededCount: 1,
      signups: [{ id: "s1", name: "Ann", group: null, minor: null }],
    });
    expect(getSlotInfo(t)).toEqual({ filled: 1, needed: 1, isFull: true });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/domain/board.test.ts`
Expected: FAIL — cannot find module `board` / exports not defined.

- [ ] **Step 4: Implement getSlotInfo, formatWhen, groupTasksByDay**

Create `lib/domain/board.ts`:

```typescript
import type { BoardTask, DayGroup, SlotInfo } from "@/lib/domain/types";

export function getSlotInfo(task: BoardTask): SlotInfo {
  const filled = task.signups.length;
  const needed = task.neededCount;
  return { filled, needed, isFull: filled >= needed };
}

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayLabel(d: Date): string {
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** A frog with no time and no date shows "Anytime"; a shift with no times shows "All day". */
export function formatWhen(task: BoardTask): string {
  if (task.kind === "frog") {
    if (task.dueBy) {
      const d = task.dueBy;
      return `By ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
    }
    return "Anytime";
  }
  if (task.startTime && task.endTime) return `${task.startTime}–${task.endTime}`;
  if (task.startTime) return `From ${task.startTime}`;
  return "All day";
}

/**
 * Group tasks by calendar day, sorted ascending. Undated tasks go in a
 * trailing "all-day" group. Within a day, tasks sort by startTime then title.
 */
export function groupTasksByDay(tasks: BoardTask[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();

  for (const t of tasks) {
    const key = t.date ? isoDate(t.date) : "all-day";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: t.date ? dayLabel(t.date) : "No set date",
        tasks: [],
      });
    }
    groups.get(key)!.tasks.push(t);
  }

  for (const g of groups.values()) {
    g.tasks.sort((a, b) => {
      const at = a.startTime ?? "";
      const bt = b.startTime ?? "";
      if (at !== bt) return at < bt ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
  }

  return [...groups.values()].sort((a, b) => {
    if (a.key === "all-day") return 1;
    if (b.key === "all-day") return -1;
    return a.key < b.key ? -1 : 1;
  });
}
```

- [ ] **Step 5: Add tests for groupTasksByDay and formatWhen**

Append to `lib/domain/board.test.ts`:

```typescript
describe("formatWhen", () => {
  test("shift with both times", () => {
    expect(formatWhen(task({ startTime: "10:00 AM", endTime: "1:00 PM" })))
      .toBe("10:00 AM–1:00 PM");
  });

  test("shift with no times is all day", () => {
    expect(formatWhen(task({ startTime: null, endTime: null }))).toBe("All day");
  });

  test("frog with a deadline", () => {
    expect(
      formatWhen(task({ kind: "frog", startTime: null, endTime: null, date: null, dueBy: new Date("2026-07-25T00:00:00Z") })),
    ).toBe("By Jul 25");
  });

  test("frog with no deadline is anytime", () => {
    expect(
      formatWhen(task({ kind: "frog", startTime: null, endTime: null, date: null, dueBy: null })),
    ).toBe("Anytime");
  });
});

describe("groupTasksByDay", () => {
  test("groups by date, sorts days ascending, all-day last", () => {
    const result = groupTasksByDay([
      task({ id: "b", date: new Date("2026-07-26T00:00:00Z"), startTime: "9:00 AM" }),
      task({ id: "a", date: new Date("2026-07-25T00:00:00Z"), startTime: "10:00 AM" }),
      task({ id: "c", date: null, startTime: null }),
    ]);
    expect(result.map((g) => g.key)).toEqual(["2026-07-25", "2026-07-26", "all-day"]);
  });

  test("sorts tasks within a day by start time", () => {
    const [group] = groupTasksByDay([
      task({ id: "late", startTime: "2:00 PM" }),
      task({ id: "early", startTime: "9:00 AM" }),
    ]);
    expect(group.tasks.map((t) => t.id)).toEqual(["early", "late"]);
  });
});
```

- [ ] **Step 6: Run all board tests to verify they pass**

Run: `npx vitest run lib/domain/board.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 7: Commit**

```bash
git add lib/domain/types.ts lib/domain/board.ts lib/domain/board.test.ts
git commit -m "feat: board grouping and slot-info domain logic"
```

---

## Task 4: Claim and release validation

**Files:**
- Create: `lib/domain/claim.ts`
- Test: `lib/domain/claim.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/domain/claim.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { validateClaim, validateRelease } from "@/lib/domain/claim";
import type { BoardTask } from "@/lib/domain/types";

function task(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "t1", kind: "shift", title: "Games", category: null,
    requestedGroup: null, neededCount: 2, date: null, startTime: null,
    endTime: null, dueBy: null, pointOfContact: null, location: null,
    definitionOfDone: null, status: "todo", waiting: false, signups: [],
    ...overrides,
  };
}

describe("validateClaim", () => {
  test("accepts a trimmed name and normalizes optional fields", () => {
    const result = validateClaim(task({}), { name: "  Kenji  ", group: "Scouts" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        name: "Kenji", email: null, phone: null, group: "Scouts", minor: null,
      });
    }
  });

  test("rejects an empty name", () => {
    const result = validateClaim(task({}), { name: "   " });
    expect(result).toEqual({ ok: false, error: "Please enter a name." });
  });

  test("rejects when the task is already full", () => {
    const full = task({
      neededCount: 1,
      signups: [{ id: "s1", name: "Ann", group: null, minor: null }],
    });
    const result = validateClaim(full, { name: "Kenji" });
    expect(result).toEqual({ ok: false, error: "This task is already full." });
  });

  test("coerces empty optional strings to null", () => {
    const result = validateClaim(task({}), { name: "Kenji", email: "", phone: "" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBeNull();
      expect(result.value.phone).toBeNull();
    }
  });
});

describe("validateRelease", () => {
  test("accepts releasing an existing signup", () => {
    const t = task({ signups: [{ id: "s1", name: "Ann", group: null, minor: null }] });
    expect(validateRelease(t, "s1")).toEqual({ ok: true });
  });

  test("rejects releasing a signup that is not on the task", () => {
    const t = task({ signups: [] });
    expect(validateRelease(t, "nope")).toEqual({
      ok: false,
      error: "That signup is no longer here.",
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/domain/claim.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement validation**

Create `lib/domain/claim.ts`:

```typescript
import { getSlotInfo } from "@/lib/domain/board";
import type { BoardTask } from "@/lib/domain/types";

export interface ClaimInput {
  name: string;
  email?: string;
  phone?: string;
  group?: string;
  minor?: boolean;
}

export interface ClaimValue {
  name: string;
  email: string | null;
  phone: string | null;
  group: string | null;
  minor: boolean | null;
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type VoidResult = { ok: true } | { ok: false; error: string };

function nullIfBlank(v: string | undefined): string | null {
  const trimmed = (v ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export function validateClaim(task: BoardTask, input: ClaimInput): Result<ClaimValue> {
  const name = (input.name ?? "").trim();
  if (name === "") return { ok: false, error: "Please enter a name." };
  if (getSlotInfo(task).isFull) {
    return { ok: false, error: "This task is already full." };
  }
  return {
    ok: true,
    value: {
      name,
      email: nullIfBlank(input.email),
      phone: nullIfBlank(input.phone),
      group: nullIfBlank(input.group),
      minor: input.minor ?? null,
    },
  };
}

export function validateRelease(task: BoardTask, signupId: string): VoidResult {
  const exists = task.signups.some((s) => s.id === signupId);
  if (!exists) return { ok: false, error: "That signup is no longer here." };
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/domain/claim.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/claim.ts lib/domain/claim.test.ts
git commit -m "feat: claim and release validation"
```

---

## Task 5: Audit-entry construction

**Files:**
- Create: `lib/domain/audit.ts`
- Test: `lib/domain/audit.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/domain/audit.test.ts`:

```typescript
import { expect, test } from "vitest";
import { claimAuditDetails, releaseAuditDetails } from "@/lib/domain/audit";

test("claimAuditDetails records who joined", () => {
  expect(
    claimAuditDetails({ signupId: "s1", name: "Kenji", group: "Scouts" }),
  ).toEqual({
    summary: "Kenji claimed a slot",
    signupId: "s1",
    name: "Kenji",
    group: "Scouts",
  });
});

test("releaseAuditDetails captures the removed signup so it can be reverted", () => {
  expect(
    releaseAuditDetails({ signupId: "s1", name: "Kenji", group: null, email: "k@x.com", phone: null, minor: true }),
  ).toEqual({
    summary: "Kenji was removed",
    signupId: "s1",
    name: "Kenji",
    group: null,
    email: "k@x.com",
    phone: null,
    minor: true,
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/domain/audit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement audit details**

Create `lib/domain/audit.ts`:

```typescript
export interface ClaimAuditInput {
  signupId: string;
  name: string;
  group: string | null;
}

export interface ReleaseAuditInput {
  signupId: string;
  name: string;
  group: string | null;
  email: string | null;
  phone: string | null;
  minor: boolean | null;
}

export function claimAuditDetails(input: ClaimAuditInput) {
  return {
    summary: `${input.name} claimed a slot`,
    signupId: input.signupId,
    name: input.name,
    group: input.group,
  };
}

/** Release stores the full signup snapshot so a future revert can recreate it. */
export function releaseAuditDetails(input: ReleaseAuditInput) {
  return {
    summary: `${input.name} was removed`,
    signupId: input.signupId,
    name: input.name,
    group: input.group,
    email: input.email,
    phone: input.phone,
    minor: input.minor,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/domain/audit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/audit.ts lib/domain/audit.test.ts
git commit -m "feat: audit-entry construction"
```

---

## Task 6: Repository — persist claim/release in a transaction

**Files:**
- Create: `lib/repository/signups.ts`, `lib/repository/events.ts`, `test/db.ts`
- Test: `lib/repository/signups.test.ts`

- [ ] **Step 1: Create the test-db reset helper**

Create `test/db.ts`:

```typescript
import { prisma } from "@/lib/db";

export async function resetDb() {
  // Order matters: children before parents.
  await prisma.auditLog.deleteMany();
  await prisma.signup.deleteMany();
  await prisma.task.deleteMany();
  await prisma.event.deleteMany();
}
```

- [ ] **Step 2: Create the board-read repository**

Create `lib/repository/events.ts`:

```typescript
import { prisma } from "@/lib/db";
import type { BoardTask } from "@/lib/domain/types";

/** Returns the most recently created event plus its tasks, mapped to BoardTask. */
export async function getActiveEventBoard(): Promise<
  { id: string; name: string; tasks: BoardTask[] } | null
> {
  const event = await prisma.event.findFirst({
    orderBy: { createdAt: "desc" },
    include: {
      tasks: {
        include: {
          signups: {
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, group: true, minor: true },
          },
        },
      },
    },
  });
  if (!event) return null;
  return {
    id: event.id,
    name: event.name,
    tasks: event.tasks.map((t) => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      category: t.category,
      requestedGroup: t.requestedGroup,
      neededCount: t.neededCount,
      date: t.date,
      startTime: t.startTime,
      endTime: t.endTime,
      dueBy: t.dueBy,
      pointOfContact: t.pointOfContact,
      location: t.location,
      definitionOfDone: t.definitionOfDone,
      status: t.status,
      waiting: t.waiting,
      signups: t.signups,
    })),
  };
}
```

- [ ] **Step 3: Write failing repository tests**

Create `lib/repository/signups.test.ts`:

```typescript
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { createSignupWithAudit, deleteSignupWithAudit } from "@/lib/repository/signups";

async function makeTaskNeeding(n: number): Promise<string> {
  const event = await prisma.event.create({
    data: { name: "Test", startDate: new Date(), endDate: new Date() },
  });
  const task = await prisma.task.create({
    data: { eventId: event.id, title: "Games", neededCount: n },
  });
  return task.id;
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("createSignupWithAudit", () => {
  test("creates a signup and a claim audit row together", async () => {
    const taskId = await makeTaskNeeding(2);
    const result = await createSignupWithAudit(taskId, { name: "Kenji", group: "Scouts" });

    expect(result.ok).toBe(true);
    const signups = await prisma.signup.findMany({ where: { taskId } });
    const audits = await prisma.auditLog.findMany({ where: { taskId } });
    expect(signups).toHaveLength(1);
    expect(signups[0].name).toBe("Kenji");
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("claim");
  });

  test("refuses to overfill a task", async () => {
    const taskId = await makeTaskNeeding(1);
    await createSignupWithAudit(taskId, { name: "Ann" });
    const result = await createSignupWithAudit(taskId, { name: "Bob" });

    expect(result).toEqual({ ok: false, error: "This task is already full." });
    const signups = await prisma.signup.findMany({ where: { taskId } });
    expect(signups).toHaveLength(1);
  });
});

describe("deleteSignupWithAudit", () => {
  test("removes the signup and writes a release audit row with a snapshot", async () => {
    const taskId = await makeTaskNeeding(2);
    const created = await createSignupWithAudit(taskId, { name: "Kenji", email: "k@x.com" });
    expect(created.ok).toBe(true);
    const signupId = created.ok ? created.signupId : "";

    const result = await deleteSignupWithAudit(signupId);
    expect(result).toEqual({ ok: true });

    const signups = await prisma.signup.findMany({ where: { taskId } });
    const release = await prisma.auditLog.findFirst({ where: { taskId, action: "release" } });
    expect(signups).toHaveLength(0);
    expect(release).not.toBeNull();
    expect((release!.details as { name: string }).name).toBe("Kenji");
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `npx dotenv -e .env.test -- npx vitest run lib/repository/signups.test.ts`
Expected: FAIL — `createSignupWithAudit` not found.

- [ ] **Step 5: Implement the repository**

Create `lib/repository/signups.ts`:

```typescript
import { prisma } from "@/lib/db";
import type { BoardTask } from "@/lib/domain/types";
import { validateClaim, validateRelease, type ClaimInput, type VoidResult } from "@/lib/domain/claim";
import { claimAuditDetails, releaseAuditDetails } from "@/lib/domain/audit";

type CreateResult = { ok: true; signupId: string } | { ok: false; error: string };

/** Map a Prisma task+signups row into the domain BoardTask shape. */
function toBoardTask(t: {
  id: string; kind: "shift" | "frog"; title: string; category: string | null;
  requestedGroup: string | null; neededCount: number; date: Date | null;
  startTime: string | null; endTime: string | null; dueBy: Date | null;
  pointOfContact: string | null; location: string | null;
  definitionOfDone: string | null; status: BoardTask["status"]; waiting: boolean;
  signups: { id: string; name: string; group: string | null; minor: boolean | null }[];
}): BoardTask {
  return { ...t };
}

export async function createSignupWithAudit(
  taskId: string,
  input: ClaimInput,
): Promise<CreateResult> {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { id: taskId },
      include: { signups: { select: { id: true, name: true, group: true, minor: true } } },
    });
    if (!task) return { ok: false as const, error: "That task no longer exists." };

    const check = validateClaim(toBoardTask({ ...task }), input);
    if (!check.ok) return { ok: false as const, error: check.error };

    const signup = await tx.signup.create({
      data: {
        taskId,
        name: check.value.name,
        email: check.value.email,
        phone: check.value.phone,
        group: check.value.group,
        minor: check.value.minor,
      },
    });
    await tx.auditLog.create({
      data: {
        taskId,
        action: "claim",
        details: claimAuditDetails({
          signupId: signup.id,
          name: check.value.name,
          group: check.value.group,
        }),
      },
    });
    return { ok: true as const, signupId: signup.id };
  });
}

export async function deleteSignupWithAudit(signupId: string): Promise<VoidResult> {
  return prisma.$transaction(async (tx) => {
    const signup = await tx.signup.findUnique({
      where: { id: signupId },
      include: { task: { include: { signups: { select: { id: true, name: true, group: true, minor: true } } } } },
    });
    if (!signup) return { ok: false as const, error: "That signup is no longer here." };

    const check = validateRelease(toBoardTask({ ...signup.task }), signupId);
    if (!check.ok) return check;

    await tx.auditLog.create({
      data: {
        taskId: signup.taskId,
        action: "release",
        details: releaseAuditDetails({
          signupId: signup.id,
          name: signup.name,
          group: signup.group,
          email: signup.email,
          phone: signup.phone,
          minor: signup.minor,
        }),
      },
    });
    await tx.signup.delete({ where: { id: signupId } });
    return { ok: true as const };
  });
}
```

- [ ] **Step 6: Run to verify pass**

Run: `npx dotenv -e .env.test -- npx vitest run lib/repository/signups.test.ts`
Expected: PASS — all repository tests green.

- [ ] **Step 7: Commit**

```bash
git add lib/repository test/db.ts
git commit -m "feat: transactional claim/release repository with audit"
```

---

## Task 7: Seed a real event

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (add `prisma.seed` config)

- [ ] **Step 1: Add seed config to package.json**

Add a top-level `"prisma"` key in `package.json`:

```json
"prisma": {
  "seed": "npx tsx prisma/seed.ts"
}
```

Install the TypeScript runner:

```bash
npm install -D tsx
```

- [ ] **Step 2: Write the seed script**

Create `prisma/seed.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Fresh slate for local dev.
  await prisma.auditLog.deleteMany();
  await prisma.signup.deleteMany();
  await prisma.task.deleteMany();
  await prisma.event.deleteMany();

  const event = await prisma.event.create({
    data: {
      name: "Ginza Bazaar / Bon Odori 2026",
      startDate: new Date("2026-07-25T00:00:00Z"),
      endDate: new Date("2026-07-26T00:00:00Z"),
    },
  });

  await prisma.task.createMany({
    data: [
      {
        eventId: event.id, kind: "shift", title: "Games", category: "Games",
        requestedGroup: "Scouts", neededCount: 5,
        date: new Date("2026-07-25T00:00:00Z"),
        startTime: "10:00 AM", endTime: "1:00 PM",
        location: "Inside Gym", pointOfContact: "Yumi 415-370-1477",
        definitionOfDone: "Booth staffed and tidy at handover.",
      },
      {
        eventId: event.id, kind: "shift", title: "Bingo", category: "Bingo",
        neededCount: 3, date: new Date("2026-07-25T00:00:00Z"),
        startTime: "1:00 PM", endTime: "4:00 PM", location: "Inside Gym",
      },
      {
        eventId: event.id, kind: "shift", title: "Food Service", category: "Food/Kitchen",
        requestedGroup: "Scouts", neededCount: 3,
        date: new Date("2026-07-25T00:00:00Z"),
        startTime: "10:00 AM", endTime: "5:00 PM",
      },
      {
        eventId: event.id, kind: "frog", title: "Bring 50 paper cups",
        category: "Supplies", neededCount: 1,
        dueBy: new Date("2026-07-25T00:00:00Z"),
        definitionOfDone: "Cups delivered to the dining area.",
      },
    ],
  });

  console.log(`Seeded event ${event.id} with 4 tasks.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 3: Run the seed against the dev database**

Run: `npm run db:seed`
Expected: prints "Seeded event ... with 4 tasks."

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts package.json
git commit -m "feat: seed Ginza Bazaar event for local dev"
```

---

## Task 8: Server actions for claim and release

**Files:**
- Create: `app/actions/signups.ts`
- Test: `app/actions/signups.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/actions/signups.test.ts`:

```typescript
import { afterAll, beforeEach, expect, test, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { claimSlot, releaseSignup } from "@/app/actions/signups";

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedTask(): Promise<string> {
  const event = await prisma.event.create({
    data: { name: "E", startDate: new Date(), endDate: new Date() },
  });
  const task = await prisma.task.create({
    data: { eventId: event.id, title: "Games", neededCount: 2 },
  });
  return task.id;
}

test("claimSlot persists a signup from form data", async () => {
  const taskId = await seedTask();
  const fd = new FormData();
  fd.set("taskId", taskId);
  fd.set("name", "Kenji");
  fd.set("group", "Scouts");

  const result = await claimSlot(fd);
  expect(result.ok).toBe(true);
  const signups = await prisma.signup.findMany({ where: { taskId } });
  expect(signups.map((s) => s.name)).toEqual(["Kenji"]);
});

test("claimSlot returns an error for a blank name", async () => {
  const taskId = await seedTask();
  const fd = new FormData();
  fd.set("taskId", taskId);
  fd.set("name", "   ");

  const result = await claimSlot(fd);
  expect(result).toEqual({ ok: false, error: "Please enter a name." });
});

test("releaseSignup removes a signup", async () => {
  const taskId = await seedTask();
  const fd = new FormData();
  fd.set("taskId", taskId);
  fd.set("name", "Kenji");
  await claimSlot(fd);
  const signup = await prisma.signup.findFirstOrThrow({ where: { taskId } });

  const result = await releaseSignup(signup.id);
  expect(result).toEqual({ ok: true });
  expect(await prisma.signup.count({ where: { taskId } })).toBe(0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx dotenv -e .env.test -- npx vitest run app/actions/signups.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the server actions**

Create `app/actions/signups.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createSignupWithAudit, deleteSignupWithAudit } from "@/lib/repository/signups";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function claimSlot(formData: FormData): Promise<ActionResult> {
  const taskId = String(formData.get("taskId") ?? "");
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const phone = String(formData.get("phone") ?? "");
  const group = String(formData.get("group") ?? "");
  const minor = formData.get("minor") === "on" ? true : undefined;

  if (!taskId) return { ok: false, error: "Missing task." };

  const result = await createSignupWithAudit(taskId, { name, email, phone, group, minor });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/");
  return { ok: true };
}

export async function releaseSignup(signupId: string): Promise<ActionResult> {
  const result = await deleteSignupWithAudit(signupId);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/");
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx dotenv -e .env.test -- npx vitest run app/actions/signups.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/actions/signups.ts app/actions/signups.test.ts
git commit -m "feat: claim/release server actions"
```

---

## Task 9: Board UI — server components

**Files:**
- Create: `components/Board.tsx`, `components/TaskCard.tsx`
- Modify: `app/page.tsx`, `app/globals.css`

- [ ] **Step 1: Write a render test for TaskCard**

Create `components/TaskCard.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { TaskCard } from "@/components/TaskCard";
import type { BoardTask } from "@/lib/domain/types";

function task(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "t1", kind: "shift", title: "Games", category: "Games",
    requestedGroup: "Scouts", neededCount: 3, date: new Date("2026-07-25T00:00:00Z"),
    startTime: "10:00 AM", endTime: "1:00 PM", dueBy: null,
    pointOfContact: "Yumi 415-370-1477", location: "Inside Gym",
    definitionOfDone: "Booth tidy at handover.", status: "todo",
    waiting: false, signups: [], ...overrides,
  };
}

test("shows title, time window, slot count, location and contact", () => {
  render(<TaskCard task={task({})} />);
  expect(screen.getByText("Games")).toBeInTheDocument();
  expect(screen.getByText("10:00 AM–1:00 PM")).toBeInTheDocument();
  expect(screen.getByText("0 of 3 filled")).toBeInTheDocument();
  expect(screen.getByText(/Inside Gym/)).toBeInTheDocument();
  expect(screen.getByText(/Yumi/)).toBeInTheDocument();
});

test("lists claimant names", () => {
  render(
    <TaskCard
      task={task({ signups: [{ id: "s1", name: "Kenji", group: "Scouts", minor: null }] })}
    />,
  );
  expect(screen.getByText("Kenji")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/TaskCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement TaskCard**

Create `components/TaskCard.tsx`:

```tsx
import { formatWhen, getSlotInfo } from "@/lib/domain/board";
import type { BoardTask } from "@/lib/domain/types";
import { ClaimForm } from "@/components/ClaimForm";
import { Claimant } from "@/components/Claimant";

export function TaskCard({ task }: { task: BoardTask }) {
  const slot = getSlotInfo(task);
  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm transition ${
        slot.isFull ? "border-emerald-200 bg-emerald-50/40 opacity-70" : "border-emerald-300 bg-white"
      }`}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-emerald-900">{task.title}</h3>
          <p className="text-sm text-emerald-700">{formatWhen(task)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
          {slot.filled} of {slot.needed} filled
        </span>
      </header>

      <dl className="mt-2 space-y-0.5 text-sm text-emerald-800">
        {task.category && <div>🏷️ {task.category}</div>}
        {task.requestedGroup && <div>👥 Requested: {task.requestedGroup}</div>}
        {task.location && <div>📍 {task.location}</div>}
        {task.pointOfContact && <div>📞 {task.pointOfContact}</div>}
        {task.definitionOfDone && <div className="italic">✅ {task.definitionOfDone}</div>}
      </dl>

      {task.signups.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {task.signups.map((s) => (
            <Claimant key={s.id} signupId={s.id} name={s.name} group={s.group} />
          ))}
        </ul>
      )}

      {!slot.isFull && <ClaimForm taskId={task.id} />}
    </article>
  );
}
```

- [ ] **Step 4: Run TaskCard test (still fails — ClaimForm/Claimant missing)**

Run: `npx vitest run components/TaskCard.test.tsx`
Expected: FAIL — cannot resolve `ClaimForm` / `Claimant`. These are built in Task 10; create temporary stubs now so this task's test passes:

Create `components/ClaimForm.tsx` (temporary stub, replaced in Task 10):

```tsx
export function ClaimForm({ taskId }: { taskId: string }) {
  return <div data-testid="claim-form" data-task={taskId} />;
}
```

Create `components/Claimant.tsx` (temporary stub, replaced in Task 10):

```tsx
export function Claimant({ name }: { signupId: string; name: string; group: string | null }) {
  return <li>{name}</li>;
}
```

- [ ] **Step 5: Run TaskCard test to verify pass**

Run: `npx vitest run components/TaskCard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Implement Board**

Create `components/Board.tsx`:

```tsx
import { groupTasksByDay } from "@/lib/domain/board";
import type { BoardTask } from "@/lib/domain/types";
import { TaskCard } from "@/components/TaskCard";

export function Board({ eventName, tasks }: { eventName: string; tasks: BoardTask[] }) {
  const groups = groupTasksByDay(tasks);
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold text-emerald-900">🐸 {eventName}</h1>
      <p className="mb-6 text-sm text-emerald-700">
        Tap a lily pad to grab a frog. No account needed — just add your name.
      </p>
      {groups.map((g) => (
        <section key={g.key} className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-600">
            {g.label}
          </h2>
          <div className="space-y-3">
            {g.tasks.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
```

- [ ] **Step 7: Wire the home page**

Replace `app/page.tsx` with:

```tsx
import { getActiveEventBoard } from "@/lib/repository/events";
import { Board } from "@/components/Board";

export const dynamic = "force-dynamic";

export default async function Home() {
  const board = await getActiveEventBoard();
  if (!board) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 text-center text-emerald-800">
        <h1 className="text-2xl font-bold">🐸 No event yet</h1>
        <p className="mt-2">Run <code>npm run db:seed</code> to load one.</p>
      </main>
    );
  }
  return <Board eventName={board.name} tasks={board.tasks} />;
}
```

- [ ] **Step 8: Verify the build compiles**

Run: `npm run build`
Expected: compiles with no type errors.

- [ ] **Step 9: Manually verify the board renders**

Run: `npm run dev`, open http://localhost:3000
Expected: the seeded event title and four cards grouped by day, each showing "0 of N filled". Stop the server with Ctrl-C.

- [ ] **Step 10: Commit**

```bash
git add components/Board.tsx components/TaskCard.tsx components/TaskCard.test.tsx components/ClaimForm.tsx components/Claimant.tsx app/page.tsx
git commit -m "feat: server-rendered board and task cards"
```

---

## Task 10: Claim/release interaction with optimistic UI

**Files:**
- Modify: `components/ClaimForm.tsx`, `components/Claimant.tsx`
- Test: `components/ClaimForm.test.tsx`

- [ ] **Step 1: Write a failing interaction test**

Create `components/ClaimForm.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi, beforeEach } from "vitest";

const claimSlot = vi.fn();
vi.mock("@/app/actions/signups", () => ({
  claimSlot: (fd: FormData) => claimSlot(fd),
  releaseSignup: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ClaimForm } from "@/components/ClaimForm";

beforeEach(() => claimSlot.mockReset());

test("opens the form, submits a name, and calls the action", async () => {
  claimSlot.mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  render(<ClaimForm taskId="t1" />);

  await user.click(screen.getByRole("button", { name: /grab a frog/i }));
  await user.type(screen.getByLabelText(/your name/i), "Kenji");
  await user.click(screen.getByRole("button", { name: /^add me$/i }));

  expect(claimSlot).toHaveBeenCalledOnce();
  const fd = claimSlot.mock.calls[0][0] as FormData;
  expect(fd.get("name")).toBe("Kenji");
  expect(fd.get("taskId")).toBe("t1");
});

test("shows the error message when the action fails", async () => {
  claimSlot.mockResolvedValue({ ok: false, error: "This task is already full." });
  const user = userEvent.setup();
  render(<ClaimForm taskId="t1" />);

  await user.click(screen.getByRole("button", { name: /grab a frog/i }));
  await user.type(screen.getByLabelText(/your name/i), "Kenji");
  await user.click(screen.getByRole("button", { name: /^add me$/i }));

  expect(await screen.findByText("This task is already full.")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/ClaimForm.test.tsx`
Expected: FAIL — the stub has no button.

- [ ] **Step 3: Implement the real ClaimForm**

Replace `components/ClaimForm.tsx` with:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimSlot } from "@/app/actions/signups";

export function ClaimForm({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-xl bg-emerald-600 py-2 font-medium text-white hover:bg-emerald-700"
      >
        🐸 Grab a frog
      </button>
    );
  }

  async function onSubmit(formData: FormData) {
    setError(null);
    formData.set("taskId", taskId);
    startTransition(async () => {
      const result = await claimSlot(formData);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form action={onSubmit} className="mt-3 space-y-2">
      <label className="block text-sm font-medium text-emerald-900">
        Your name
        <input
          name="name"
          autoFocus
          className="mt-1 w-full rounded-lg border border-emerald-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm text-emerald-800">
        Group (optional)
        <input name="group" className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-2" />
      </label>
      <label className="flex items-center gap-2 text-sm text-emerald-800">
        <input type="checkbox" name="minor" /> Under 18
      </label>
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-xl bg-emerald-600 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          Add me
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-emerald-300 px-4 py-2 text-emerald-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run ClaimForm test to verify pass**

Run: `npx vitest run components/ClaimForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write a failing test for Claimant remove**

Create `components/Claimant.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi, beforeEach } from "vitest";

const releaseSignup = vi.fn();
vi.mock("@/app/actions/signups", () => ({
  releaseSignup: (id: string) => releaseSignup(id),
  claimSlot: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { Claimant } from "@/components/Claimant";

beforeEach(() => releaseSignup.mockReset());

test("clicking remove calls releaseSignup with the id", async () => {
  releaseSignup.mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  render(<Claimant signupId="s1" name="Kenji" group="Scouts" />);

  await user.click(screen.getByRole("button", { name: /remove kenji/i }));
  expect(releaseSignup).toHaveBeenCalledWith("s1");
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run components/Claimant.test.tsx`
Expected: FAIL — stub has no button.

- [ ] **Step 7: Implement the real Claimant**

Replace `components/Claimant.tsx` with:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { releaseSignup } from "@/app/actions/signups";

export function Claimant({
  signupId,
  name,
  group,
}: {
  signupId: string;
  name: string;
  group: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onRemove() {
    startTransition(async () => {
      const result = await releaseSignup(signupId);
      if (result.ok) router.refresh();
    });
  }

  return (
    <li className="inline-flex items-center gap-1 rounded-full bg-emerald-100 py-1 pl-3 pr-1 text-sm text-emerald-900">
      <span>{name}</span>
      {group && <span className="text-emerald-600">· {group}</span>}
      <button
        type="button"
        onClick={onRemove}
        disabled={pending}
        aria-label={`Remove ${name}`}
        className="ml-1 rounded-full px-2 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
      >
        ×
      </button>
    </li>
  );
}
```

- [ ] **Step 8: Run Claimant test to verify pass**

Run: `npx vitest run components/Claimant.test.tsx`
Expected: PASS.

- [ ] **Step 9: Run the full test suite**

Run: `npx dotenv -e .env.test -- npx vitest run`
Expected: PASS — all domain, repository, action, and component tests green.

- [ ] **Step 10: Manually verify the full claim/release loop**

Run: `npm run dev`, open http://localhost:3000. Grab a frog on a card, add a name, confirm it appears and the count increments; remove it, confirm it disappears and the count decrements. Stop the server.

- [ ] **Step 11: Commit**

```bash
git add components/ClaimForm.tsx components/ClaimForm.test.tsx components/Claimant.tsx components/Claimant.test.tsx
git commit -m "feat: claim/release interaction with optimistic refresh"
```

---

## Task 11: Deploy to Vercel + Neon

**Files:**
- Create: `README.md` (run/deploy notes)

- [ ] **Step 1: Push the repo to GitHub**

```bash
gh repo create frogboard --private --source=. --remote=origin --push
```

Expected: repo created and pushed.

- [ ] **Step 2: Import into Vercel**

In the Vercel dashboard: New Project → import the `frogboard` repo. Set the `DATABASE_URL` environment variable to your Neon **dev/prod** connection string. Deploy.

- [ ] **Step 3: Apply migrations to the production database**

Run locally against the prod database (replace URL):

```bash
DATABASE_URL="<prod-neon-url>" npx prisma migrate deploy
```

Expected: "All migrations have been successfully applied."

- [ ] **Step 4: Seed the production event (optional for first demo)**

```bash
DATABASE_URL="<prod-neon-url>" npm run db:seed
```

- [ ] **Step 5: Write the README**

Create `README.md`:

```markdown
# Frog Board

Mobile-first volunteer self-organization board. Phase 1: public board + claim/release.

## Develop
1. `npm install`
2. Copy `.env.example` to `.env` and `.env.test`; paste your Neon connection strings.
3. `npm run db:migrate` then `npm run db:seed`
4. `npm run dev`

## Test
`npx dotenv -e .env.test -- npx vitest run`

## Deploy
Vercel + Neon. Set `DATABASE_URL` in Vercel. Run `prisma migrate deploy` against prod.
```

- [ ] **Step 6: Verify the live site**

Open the Vercel URL on a phone. Confirm the board loads and a claim works end-to-end.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs: add run and deploy notes"
git push
```

---

## Definition of Done (Phase 1)

- [ ] All Vitest suites pass: `npx dotenv -e .env.test -- npx vitest run`
- [ ] `npm run build` succeeds with no type errors
- [ ] The deployed board loads on a phone and a scout can claim and release a shift
- [ ] Every claim and release writes an `AuditLog` row (verify in the DB)
