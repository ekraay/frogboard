# Phase 1 — Foundation & Public Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the MVP volunteer frog board — anyone with the link can see an event's shifts/frogs grouped by day and claim or release **their own** slot, with every change written to an append-only audit log. No final-slot overfill, no removing other people's claims.

**Architecture:** Next.js (App Router) full-stack app. Pure domain functions in `lib/domain/` hold all logic (grouping, slot math, claim/release validation, audit construction) and are unit-tested without a database. A thin repository layer (`lib/repository/`) wraps Prisma in transactions — using `SELECT … FOR UPDATE` row locks to make claiming the last slot safe under concurrency — and is integration-tested. Server Actions call the repository; React Server Components render the board; client components own the claim/release interaction. A `claimToken` capability gives each claimer device-local ownership of their signup.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Tailwind CSS, Prisma ORM, Neon Postgres (prod) / Postgres service container (CI), Vitest + @testing-library/react, Playwright (E2E stretch), GitHub Actions (CI), Vercel (CD).

This is Phase 1 of 5. See the spec at `docs/superpowers/specs/2026-06-09-volunteer-frog-board-design.md`. The Prisma schema here includes fields used by later phases (`status`, `waiting`, `userId`, etc.) so no migration is needed to add them later.

---

## Guiding Principles (ways of working)

These shape *how* every task below is built, not just what it builds.

- **Kent Beck — TDD & simple design.** Red → green → refactor on every task. Make
  it work, then right, then fast. Four rules of simple design, in order: passes
  the tests, reveals intent, no duplication, fewest elements.
- **Ward Cunningham — simplest thing & honest debt.** Build the simplest thing
  that could possibly work; when you take a knowing shortcut, write it down (a
  `Known debt:` line in the commit body) and pay it back deliberately.
- **Bob Martin — clean architecture & boundaries.** Hold the dependency rule:
  `lib/domain/` knows nothing about Prisma, Next, or React; frameworks depend on
  the domain, never the reverse. The repository layer is the only DB seam.
- **Elizabeth Hendrickson — exploratory testing.** After each phase, run a
  timeboxed charter (e.g. "claim the last slot from two phones at once; weird
  names, double-taps, back-button") and turn anything found into a test.
- **Henrik Kniberg — self-organization, visual management, definition of done.**
  Honor each task's DoD; visualize work; prefer pull over push.
- **Don Reinertsen — flow & small batches.** Thin vertical slices; one task = one
  commit; limit WIP; sequence by cost of delay (the no-login board first).
- **John Cutler — outcomes over output.** Success = scouts sign up and gaps
  close, not features shipped. Each phase must earn the next.
- **Esther Derby — retrospect & improve the system.** A short retro after each
  phase; one adjustment to the next plan. Improve the system, not the people.
- **Jez Humble — continuous delivery.** Keep `main` always releasable behind a
  deployment pipeline (Task 2). Trunk-based development with small, frequent
  commits; every commit runs the full test suite in CI before deploy. Build once,
  promote the same artifact; database migrations run automatically in the
  pipeline (`prisma migrate deploy`), never by hand against prod. If a step
  hurts, automate it and do it more often. Incomplete later-phase features hide
  behind flags rather than living on a long-lived branch.

---

## User Experience & Mental Models

UI tasks (Task 11 here; the organizer view in Phase 2) must be built with the
**`frontend-design` skill** — not just to look good, but to match how each user
already thinks. Invoke it when implementing components and hold to these models.

**Volunteer mental model — "grab a task like taking a flyer off a board."**
- A card is a *physical object you pick up*. Claiming is one confident action
  ("Grab a frog" → name → done), never a multi-screen form. The frog/lily-pad
  metaphor reinforces "pick it up and it's yours."
- Make state instantly legible *before* reading: open vs. full readable by color
  and weight at a glance; "2 of 5 filled" as a glanceable ratio, not fine print.
- Show who's already on a task — that's the social cue that drives pairing
  ("join your buddy"), straight from Kniberg.
- Respect the device: thumb-sized targets, single column, no zoom, no horizontal
  scroll. The remove "×" appears only on *your* signups, so the board never feels
  like something you could break by tapping.
- Feedback is immediate: a pending "Adding…" state, then the name appears. Errors
  speak plainly ("This task is already full") next to the action, not in a toast
  that vanishes.

**Organizer mental model — "I think in spreadsheet rows" (Phase 2, captured now).**
- Their source of truth is a Google Sheet of shifts. The add-tasks experience
  should feel like *editing a sheet*: a row-based grid where you add many rows
  fast, Tab between cells, fill-down repeating values, and **paste a block
  straight from Google Sheets** — not a fussy one-record-at-a-time modal.
- Sensible defaults (carry the last date/category forward), inline validation,
  and a live preview of how a row becomes a card — so the organizer sees the
  volunteer's view as they build it.
- This is built in Phase 2 (admin/import) with the `frontend-design` skill; it is
  listed here so Phase 1's data model and components don't foreclose it. They
  don't — `Task` already carries the fields a sheet row maps onto.

## File Structure

```
.github/workflows/ci.yml     # CD pipeline: test on every push, gate main
prisma/
  schema.prisma              # data model: Event, Task, Signup, AuditLog + enums + indexes
  seed.ts                    # loads one real event for local dev
lib/
  db.ts                      # singleton Prisma client
  domain/
    types.ts                 # plain TS types used by domain + UI (no Prisma imports)
    time.ts                  # EVENT_TZ, formatTime, formatWhen (timezone-aware)
    board.ts                 # groupTasksByDay, getSlotInfo
    claim.ts                 # validateClaim (limits + honeypot), validateRelease (token)
    audit.ts                 # claimAuditDetails, releaseAuditDetails
  security/
    tokens.ts                # newClaimToken()
  repository/
    signups.ts               # createSignupWithAudit (FOR UPDATE), deleteSignupWithAudit
    events.ts                # getActiveEventBoard
app/
  actions/signups.ts         # claimSlot, releaseSignup server actions
  page.tsx                   # home: render active event's board
  layout.tsx                 # root layout (pond theme shell)
  globals.css                # Tailwind + theme tokens
components/
  Board.tsx                  # server component: day groups -> TaskCard list
  TaskCard.tsx               # server component: one shift/frog card
  ClaimForm.tsx              # client: claim a slot (honeypot, stores claimToken)
  Claimant.tsx               # client: a claimed name + device-owned remove button
lib/client/
  ownership.ts               # localStorage helpers: rememberClaim/getClaimToken/forgetClaim
test/
  setup.ts                   # RTL/jsdom setup
  db.ts                      # test-db helpers: resetDb() with safety guard
e2e/
  board.spec.ts              # Playwright E2E (stretch, Task 13)
playwright.config.ts         # Playwright config (stretch)
```

**Responsibility boundaries:**
- `lib/domain/*` — pure, deterministic, no I/O. Heavily unit-tested.
- `lib/repository/*` — the only place Prisma is touched for writes; transactional and concurrency-safe; integration-tested.
- `app/actions/*` — glue: validate via domain, persist via repository, `revalidatePath`.
- `components/*` + `lib/client/*` — rendering and device-local ownership only.

---

## Prerequisites (one-time, before Task 1)

You need: a GitHub repo (created in Task 2), a Neon account (free) with two databases — `frogboard` (dev) and `frogboard_test` (local tests) — and a Vercel account. CI uses its own throwaway Postgres container, so no Neon secret is needed for tests in CI. Copy the two Neon connection strings; you'll paste them into `.env` and `.env.test` in Task 3.

---

## Task 1: Scaffold the Next.js app with testing

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `test/setup.ts`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `postcss.config.mjs`, `tailwind.config.ts`
- Test: `test/smoke.test.ts`

- [ ] **Step 1: Scaffold with create-next-app**

Run from `/Users/ekraay/claude/volunteer`. The directory already contains `docs/`, so move it aside first:

```bash
mv docs ../_docs_tmp && npx create-next-app@latest . --typescript --tailwind --app --eslint --no-src-dir --import-alias "@/*" --use-npm --yes && mv ../_docs_tmp docs
```

Expected: Next.js project files created; `docs/` restored.

- [ ] **Step 2: Install test tooling**

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

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
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
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

- [ ] **Step 5: Add scripts to package.json**

In `"scripts"`:

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

- [ ] **Step 7: Run the smoke test**

Run: `npm test`
Expected: PASS — 1 passed.

- [ ] **Step 8: Verify the build**

Run: `npm run build`
Expected: build completes, no type errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest"
```

---

## Task 2: Continuous delivery pipeline (set this up early)

Per Jez Humble: build the pipeline before piling on features, so every commit is validated and `main` stays releasable. CI runs unit + integration tests against a disposable Postgres container.

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Push the repo to GitHub**

```bash
gh repo create frogboard --private --source=. --remote=origin --push
```

Expected: repo created and the current `main` pushed.

- [ ] **Step 2: Write the CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: frogboard_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/frogboard_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npm run lint
      - run: npx vitest run
      - run: npm run build
```

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add deployment pipeline (test + build on every push)"
git push
```

- [ ] **Step 4: Verify the pipeline runs**

Run: `gh run watch` (or check the Actions tab).
Expected: the workflow runs. The `migrate deploy` and `vitest` steps may be no-ops until Task 3 adds the schema/tests — that's fine; the lint and build steps should pass. CI must stay green from here on.

> **Note:** Vercel CD is connected in Task 12 (after there's something worth deploying). From then on, pushing to `main` auto-deploys, and migrations run in the Vercel build command — no manual prod migrations.

---

## Task 3: Data model with Prisma and Neon

**Files:**
- Create: `prisma/schema.prisma`, `lib/db.ts`, `.env`, `.env.test`, `.env.example`

- [ ] **Step 1: Install Prisma**

```bash
npm install -D prisma
npm install @prisma/client
```

- [ ] **Step 2: Write the schema (with indexes)**

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
  auditLogs AuditLog[]
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
  date             DateTime?   // calendar day; drives grouping; set for scheduled tasks
  startAt          DateTime?   // exact start when known; null + date set = all-day
  endAt            DateTime?
  dueBy            DateTime?   // frog deadline
  pointOfContact   String?
  location         String?
  definitionOfDone String?
  status           TaskStatus  @default(todo)
  waiting          Boolean     @default(false)
  signups          Signup[]
  auditLogs        AuditLog[]
  createdAt        DateTime    @default(now())

  @@index([eventId, date])
}

model Signup {
  id         String   @id @default(cuid())
  taskId     String
  task       Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  name       String
  email      String?
  phone      String?
  group      String?
  minor      Boolean?
  claimToken String   // capability token for device-local ownership of this signup
  userId     String?  // reserved for Phase 4 optional accounts
  createdAt  DateTime @default(now())

  @@index([taskId, createdAt])
}

model AuditLog {
  id        String      @id @default(cuid())
  eventId   String
  event     Event       @relation(fields: [eventId], references: [id], onDelete: Cascade)
  taskId    String
  task      Task        @relation(fields: [taskId], references: [id], onDelete: Cascade)
  action    AuditAction
  details   Json
  createdAt DateTime    @default(now())

  @@index([eventId, createdAt])
  @@index([taskId, createdAt])
}
```

- [ ] **Step 3: Create env files**

Create `.env` (Neon dev string):

```
DATABASE_URL="postgresql://USER:PASS@HOST/frogboard?sslmode=require"
```

Create `.env.test` (Neon test string — note the database name contains `test`, which the reset guard in Task 7 requires):

```
DATABASE_URL="postgresql://USER:PASS@HOST/frogboard_test?sslmode=require"
```

Create `.env.example` (committed, no secrets):

```
DATABASE_URL="postgresql://USER:PASS@HOST/DBNAME?sslmode=require"
```

- [ ] **Step 4: Add Prisma scripts**

In `"scripts"`:

```json
"db:migrate": "prisma migrate dev",
"db:migrate:test": "dotenv -e .env.test -- prisma migrate deploy",
"db:seed": "prisma db seed",
"test:db": "dotenv -e .env.test -- vitest run"
```

Install dotenv-cli:

```bash
npm install -D dotenv-cli
```

- [ ] **Step 5: Run the first migration (dev)**

Run: `npx prisma migrate dev --name init`
Expected: creates `prisma/migrations/`, applies to the dev DB, generates the client.

- [ ] **Step 6: Apply migrations to the local test database**

Run: `npm run db:migrate:test`
Expected: "All migrations have been successfully applied."

- [ ] **Step 7: Create the Prisma client singleton**

Create `lib/db.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 8: Connection smoke test**

Create `test/db-connection.test.ts`:

```typescript
import { expect, test } from "vitest";
import { prisma } from "@/lib/db";

test("can reach the database", async () => {
  const result = await prisma.$queryRaw`SELECT 1 as ok`;
  expect(result).toEqual([{ ok: 1 }]);
});
```

- [ ] **Step 9: Run the connection test**

Run: `npm run test:db -- test/db-connection.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit and push (CI must go green)**

```bash
git add -A
git commit -m "feat: Prisma schema with indexes, audit eventId, and Neon connection"
git push
```

Expected: `gh run watch` shows CI green.

---

## Task 4: Domain types and timezone-aware formatting

**Files:**
- Create: `lib/domain/types.ts`, `lib/domain/time.ts`
- Test: `lib/domain/time.test.ts`

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
  startAt: Date | null;
  endAt: Date | null;
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
  /** ISO date (YYYY-MM-DD) in the event timezone, or "all-day" for undated tasks */
  key: string;
  label: string;
  tasks: BoardTask[];
}
```

- [ ] **Step 2: Write failing tests for time formatting**

Create `lib/domain/time.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { formatTime, formatWhen } from "@/lib/domain/time";
import type { BoardTask } from "@/lib/domain/types";

function task(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "t1", kind: "shift", title: "Games", category: null,
    requestedGroup: null, neededCount: 3, date: new Date("2026-07-25T00:00:00Z"),
    startAt: null, endAt: null, dueBy: null, pointOfContact: null,
    location: null, definitionOfDone: null, status: "todo", waiting: false,
    signups: [], ...overrides,
  };
}

describe("formatTime (America/Los_Angeles)", () => {
  test("17:00 UTC renders as 10:00 AM PDT", () => {
    expect(formatTime(new Date("2026-07-25T17:00:00Z"))).toBe("10:00 AM");
  });
  test("20:00 UTC renders as 1:00 PM PDT", () => {
    expect(formatTime(new Date("2026-07-25T20:00:00Z"))).toBe("1:00 PM");
  });
});

describe("formatWhen", () => {
  test("shift with start and end", () => {
    expect(
      formatWhen(task({
        startAt: new Date("2026-07-25T17:00:00Z"),
        endAt: new Date("2026-07-25T20:00:00Z"),
      })),
    ).toBe("10:00 AM–1:00 PM");
  });
  test("shift with a date but no times is all day", () => {
    expect(formatWhen(task({ startAt: null, endAt: null }))).toBe("All day");
  });
  test("frog with a deadline", () => {
    expect(
      formatWhen(task({ kind: "frog", date: null, dueBy: new Date("2026-07-25T17:00:00Z") })),
    ).toBe("By Jul 25");
  });
  test("frog with no deadline is anytime", () => {
    expect(
      formatWhen(task({ kind: "frog", date: null, dueBy: null })),
    ).toBe("Anytime");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run lib/domain/time.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement timezone-aware formatting**

Create `lib/domain/time.ts`:

```typescript
import type { BoardTask } from "@/lib/domain/types";

/** Fixed event timezone for Phase 1 (BCSF). Per-event timezone is a later enhancement. */
export const EVENT_TZ = "America/Los_Angeles";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatTime(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: EVENT_TZ,
  }).format(d);
}

function monthDay(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: EVENT_TZ,
  }).formatToParts(d);
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${month} ${day}`;
}

export function formatWhen(task: BoardTask): string {
  if (task.kind === "frog") {
    return task.dueBy ? `By ${monthDay(task.dueBy)}` : "Anytime";
  }
  if (task.startAt && task.endAt) {
    return `${formatTime(task.startAt)}–${formatTime(task.endAt)}`;
  }
  if (task.startAt) return `From ${formatTime(task.startAt)}`;
  return "All day";
}

export { MONTHS };
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run lib/domain/time.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit and push**

```bash
git add lib/domain/types.ts lib/domain/time.ts lib/domain/time.test.ts
git commit -m "feat: domain types and timezone-aware time formatting"
git push
```

---

## Task 5: Board grouping and slot info

**Files:**
- Create: `lib/domain/board.ts`
- Test: `lib/domain/board.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/domain/board.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { getSlotInfo, groupTasksByDay } from "@/lib/domain/board";
import type { BoardTask } from "@/lib/domain/types";

function task(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "t1", kind: "shift", title: "Games", category: null,
    requestedGroup: null, neededCount: 3, date: new Date("2026-07-25T00:00:00Z"),
    startAt: null, endAt: null, dueBy: null, pointOfContact: null,
    location: null, definitionOfDone: null, status: "todo", waiting: false,
    signups: [], ...overrides,
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

describe("groupTasksByDay", () => {
  test("groups by date, sorts days ascending, all-day group last", () => {
    const result = groupTasksByDay([
      task({ id: "b", date: new Date("2026-07-26T00:00:00Z") }),
      task({ id: "a", date: new Date("2026-07-25T00:00:00Z") }),
      task({ id: "c", date: null }),
    ]);
    expect(result.map((g) => g.key)).toEqual(["2026-07-25", "2026-07-26", "all-day"]);
  });
  test("sorts tasks within a day by startAt, timed before all-day", () => {
    const [group] = groupTasksByDay([
      task({ id: "allday", startAt: null }),
      task({ id: "late", startAt: new Date("2026-07-25T21:00:00Z") }),
      task({ id: "early", startAt: new Date("2026-07-25T17:00:00Z") }),
    ]);
    expect(group.tasks.map((t) => t.id)).toEqual(["early", "late", "allday"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/domain/board.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement board grouping**

Create `lib/domain/board.ts`:

```typescript
import type { BoardTask, DayGroup, SlotInfo } from "@/lib/domain/types";
import { EVENT_TZ } from "@/lib/domain/time";

export function getSlotInfo(task: BoardTask): SlotInfo {
  const filled = task.signups.length;
  const needed = task.neededCount;
  return { filled, needed, isFull: filled >= needed };
}

/** ISO date (YYYY-MM-DD) of a Date in the event timezone. */
function tzIsoDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: EVENT_TZ,
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

function dayLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "short", day: "numeric", timeZone: EVENT_TZ,
  }).format(d);
}

/** Sort key: timed tasks by startAt ascending, all-day (no startAt) last. */
function startKey(t: BoardTask): number {
  return t.startAt ? t.startAt.getTime() : Number.MAX_SAFE_INTEGER;
}

export function groupTasksByDay(tasks: BoardTask[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();

  for (const t of tasks) {
    const key = t.date ? tzIsoDate(t.date) : "all-day";
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
      const ka = startKey(a);
      const kb = startKey(b);
      if (ka !== kb) return ka - kb;
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

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/domain/board.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```bash
git add lib/domain/board.ts lib/domain/board.test.ts
git commit -m "feat: board grouping and slot-info domain logic"
git push
```

---

## Task 6: Claim/release validation (limits, honeypot, token)

**Files:**
- Create: `lib/domain/claim.ts`
- Test: `lib/domain/claim.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/domain/claim.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { validateClaim, validateRelease, LIMITS } from "@/lib/domain/claim";
import type { SlotInfo } from "@/lib/domain/types";

const open: SlotInfo = { filled: 0, needed: 2, isFull: false };
const full: SlotInfo = { filled: 1, needed: 1, isFull: true };

describe("validateClaim", () => {
  test("accepts a trimmed name and normalizes optional fields", () => {
    const result = validateClaim({ name: "  Kenji  ", group: "Scouts" }, open);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        name: "Kenji", email: null, phone: null, group: "Scouts", minor: null,
      });
    }
  });
  test("rejects an empty name", () => {
    expect(validateClaim({ name: "   " }, open)).toEqual({
      ok: false, error: "Please enter a name.",
    });
  });
  test("rejects when the task is already full", () => {
    expect(validateClaim({ name: "Kenji" }, full)).toEqual({
      ok: false, error: "This task is already full.",
    });
  });
  test("rejects when the honeypot is filled (bot)", () => {
    expect(validateClaim({ name: "Kenji", honeypot: "anything" }, open)).toEqual({
      ok: false, error: "Could not submit. Please try again.",
    });
  });
  test("rejects a name over the max length", () => {
    const longName = "x".repeat(LIMITS.name + 1);
    expect(validateClaim({ name: longName }, open)).toEqual({
      ok: false, error: "Name is too long.",
    });
  });
  test("rejects a malformed email", () => {
    expect(validateClaim({ name: "Kenji", email: "not-an-email" }, open)).toEqual({
      ok: false, error: "That email doesn't look right.",
    });
  });
  test("coerces empty optional strings to null", () => {
    const result = validateClaim({ name: "Kenji", email: "", phone: "" }, open);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBeNull();
      expect(result.value.phone).toBeNull();
    }
  });
});

describe("validateRelease", () => {
  test("accepts when the token matches", () => {
    expect(validateRelease({ claimToken: "abc" }, "abc")).toEqual({ ok: true });
  });
  test("rejects when the token is missing", () => {
    expect(validateRelease({ claimToken: "abc" }, null)).toEqual({
      ok: false, error: "You can only remove your own signup.",
    });
  });
  test("rejects when the token does not match", () => {
    expect(validateRelease({ claimToken: "abc" }, "xyz")).toEqual({
      ok: false, error: "You can only remove your own signup.",
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
import type { SlotInfo } from "@/lib/domain/types";

export const LIMITS = { name: 80, group: 40, email: 120, phone: 40 } as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ClaimInput {
  name: string;
  email?: string;
  phone?: string;
  group?: string;
  minor?: boolean;
  /** Hidden form field; bots fill it, humans never see it. */
  honeypot?: string;
}

export interface ClaimValue {
  name: string;
  email: string | null;
  phone: string | null;
  group: string | null;
  minor: boolean | null;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export type VoidResult = { ok: true } | { ok: false; error: string };

function nullIfBlank(v: string | undefined): string | null {
  const trimmed = (v ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export function validateClaim(input: ClaimInput, slot: SlotInfo): Result<ClaimValue> {
  // Honeypot: a filled hidden field means a bot. Fail generically.
  if ((input.honeypot ?? "").trim() !== "") {
    return { ok: false, error: "Could not submit. Please try again." };
  }

  const name = (input.name ?? "").trim();
  if (name === "") return { ok: false, error: "Please enter a name." };
  if (name.length > LIMITS.name) return { ok: false, error: "Name is too long." };
  if (slot.isFull) return { ok: false, error: "This task is already full." };

  const email = nullIfBlank(input.email);
  if (email && email.length > LIMITS.email) return { ok: false, error: "Email is too long." };
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: "That email doesn't look right." };

  const phone = nullIfBlank(input.phone);
  if (phone && phone.length > LIMITS.phone) return { ok: false, error: "Phone is too long." };

  const group = nullIfBlank(input.group);
  if (group && group.length > LIMITS.group) return { ok: false, error: "Group is too long." };

  return {
    ok: true,
    value: { name, email, phone, group, minor: input.minor ?? null },
  };
}

export function validateRelease(
  signup: { claimToken: string | null },
  providedToken: string | null,
): VoidResult {
  if (!signup.claimToken || !providedToken || signup.claimToken !== providedToken) {
    return { ok: false, error: "You can only remove your own signup." };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/domain/claim.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```bash
git add lib/domain/claim.ts lib/domain/claim.test.ts
git commit -m "feat: claim validation (limits, honeypot) and token-checked release"
git push
```

---

## Task 7: Audit construction, token generation, test-db guard

**Files:**
- Create: `lib/domain/audit.ts`, `lib/security/tokens.ts`, `test/db.ts`
- Test: `lib/domain/audit.test.ts`

- [ ] **Step 1: Write failing audit tests**

Create `lib/domain/audit.test.ts`:

```typescript
import { expect, test } from "vitest";
import { claimAuditDetails, releaseAuditDetails } from "@/lib/domain/audit";

test("claimAuditDetails records who joined", () => {
  expect(claimAuditDetails({ signupId: "s1", name: "Kenji", group: "Scouts" })).toEqual({
    summary: "Kenji claimed a slot", signupId: "s1", name: "Kenji", group: "Scouts",
  });
});

test("releaseAuditDetails snapshots the removed signup for revert", () => {
  expect(
    releaseAuditDetails({
      signupId: "s1", name: "Kenji", group: null,
      email: "k@x.com", phone: null, minor: true,
    }),
  ).toEqual({
    summary: "Kenji was removed", signupId: "s1", name: "Kenji", group: null,
    email: "k@x.com", phone: null, minor: true,
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

- [ ] **Step 5: Implement the token generator**

Create `lib/security/tokens.ts`:

```typescript
import { randomUUID } from "node:crypto";

/** Opaque capability token proving a device owns a signup. Not a security secret. */
export function newClaimToken(): string {
  return randomUUID();
}
```

- [ ] **Step 6: Implement the test-db reset helper WITH a safety guard**

Create `test/db.ts`:

```typescript
import { prisma } from "@/lib/db";

/**
 * Wipes all rows. Refuses to run unless DATABASE_URL clearly points at a test
 * database, so production/dev data can never be destroyed by a stray test run.
 */
export async function resetDb() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/test/i.test(url)) {
    throw new Error(
      `resetDb() refused: DATABASE_URL does not look like a test database (${url || "unset"}).`,
    );
  }
  await prisma.auditLog.deleteMany();
  await prisma.signup.deleteMany();
  await prisma.task.deleteMany();
  await prisma.event.deleteMany();
}
```

- [ ] **Step 7: Commit and push**

```bash
git add lib/domain/audit.ts lib/domain/audit.test.ts lib/security/tokens.ts test/db.ts
git commit -m "feat: audit construction, claim-token generator, guarded test reset"
git push
```

---

## Task 8: Repository — concurrency-safe claim/release

**Files:**
- Create: `lib/repository/signups.ts`, `lib/repository/events.ts`
- Test: `lib/repository/signups.test.ts`

- [ ] **Step 1: Create the board-read repository**

Create `lib/repository/events.ts`:

```typescript
import { prisma } from "@/lib/db";
import type { BoardTask } from "@/lib/domain/types";

/** Most-recently-created event plus its tasks, mapped to BoardTask. */
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
      id: t.id, kind: t.kind, title: t.title, category: t.category,
      requestedGroup: t.requestedGroup, neededCount: t.neededCount, date: t.date,
      startAt: t.startAt, endAt: t.endAt, dueBy: t.dueBy,
      pointOfContact: t.pointOfContact, location: t.location,
      definitionOfDone: t.definitionOfDone, status: t.status, waiting: t.waiting,
      signups: t.signups,
    })),
  };
}
```

- [ ] **Step 2: Write failing repository tests (including a concurrency test)**

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

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("createSignupWithAudit", () => {
  test("creates a signup + claim audit (with eventId) and returns a token", async () => {
    const taskId = await makeTaskNeeding(2);
    const result = await createSignupWithAudit(taskId, { name: "Kenji", group: "Scouts" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claimToken).toMatch(/[0-9a-f-]{36}/);

    const signups = await prisma.signup.findMany({ where: { taskId } });
    const audits = await prisma.auditLog.findMany({ where: { taskId } });
    expect(signups).toHaveLength(1);
    expect(signups[0].claimToken).toBe(result.claimToken);
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("claim");
    expect(audits[0].eventId).toBeTruthy();
  });

  test("refuses to overfill a task", async () => {
    const taskId = await makeTaskNeeding(1);
    await createSignupWithAudit(taskId, { name: "Ann" });
    const result = await createSignupWithAudit(taskId, { name: "Bob" });
    expect(result).toEqual({ ok: false, error: "This task is already full." });
    expect(await prisma.signup.count({ where: { taskId } })).toBe(1);
  });

  test("two simultaneous claims for the last slot do not overfill", async () => {
    const taskId = await makeTaskNeeding(1);
    const [a, b] = await Promise.allSettled([
      createSignupWithAudit(taskId, { name: "Ann" }),
      createSignupWithAudit(taskId, { name: "Bob" }),
    ]);
    const oks = [a, b].filter(
      (r) => r.status === "fulfilled" && r.value.ok,
    ).length;
    expect(oks).toBe(1);
    expect(await prisma.signup.count({ where: { taskId } })).toBe(1);
  });
});

describe("deleteSignupWithAudit", () => {
  test("removes the signup and writes a release snapshot when the token matches", async () => {
    const taskId = await makeTaskNeeding(2);
    const created = await createSignupWithAudit(taskId, { name: "Kenji", email: "k@x.com" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await deleteSignupWithAudit(created.signupId, created.claimToken);
    expect(result).toEqual({ ok: true });

    expect(await prisma.signup.count({ where: { taskId } })).toBe(0);
    const release = await prisma.auditLog.findFirst({ where: { taskId, action: "release" } });
    expect(release).not.toBeNull();
    expect((release!.details as { name: string }).name).toBe("Kenji");
  });

  test("refuses to remove a signup when the token is wrong", async () => {
    const taskId = await makeTaskNeeding(2);
    const created = await createSignupWithAudit(taskId, { name: "Kenji" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await deleteSignupWithAudit(created.signupId, "wrong-token");
    expect(result).toEqual({ ok: false, error: "You can only remove your own signup." });
    expect(await prisma.signup.count({ where: { taskId } })).toBe(1);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm run test:db -- lib/repository/signups.test.ts`
Expected: FAIL — `createSignupWithAudit` not found.

- [ ] **Step 4: Implement the concurrency-safe repository**

Create `lib/repository/signups.ts`:

```typescript
import { prisma } from "@/lib/db";
import { validateClaim, validateRelease, type ClaimInput } from "@/lib/domain/claim";
import { claimAuditDetails, releaseAuditDetails } from "@/lib/domain/audit";
import { newClaimToken } from "@/lib/security/tokens";
import type { SlotInfo } from "@/lib/domain/types";

type CreateResult =
  | { ok: true; signupId: string; claimToken: string }
  | { ok: false; error: string };
type VoidResult = { ok: true } | { ok: false; error: string };

export async function createSignupWithAudit(
  taskId: string,
  input: ClaimInput,
): Promise<CreateResult> {
  return prisma.$transaction(async (tx) => {
    // Lock the task row so concurrent claims serialize here — prevents overfill.
    const locked = await tx.$queryRaw<{ id: string; eventId: string; neededCount: number }[]>`
      SELECT "id", "eventId", "neededCount" FROM "Task" WHERE "id" = ${taskId} FOR UPDATE
    `;
    if (locked.length === 0) {
      return { ok: false as const, error: "That task no longer exists." };
    }
    const { eventId, neededCount } = locked[0];

    const filled = await tx.signup.count({ where: { taskId } });
    const slot: SlotInfo = { filled, needed: neededCount, isFull: filled >= neededCount };

    const check = validateClaim(input, slot);
    if (!check.ok) return { ok: false as const, error: check.error };

    const claimToken = newClaimToken();
    const signup = await tx.signup.create({
      data: {
        taskId,
        name: check.value.name,
        email: check.value.email,
        phone: check.value.phone,
        group: check.value.group,
        minor: check.value.minor,
        claimToken,
      },
    });
    await tx.auditLog.create({
      data: {
        eventId,
        taskId,
        action: "claim",
        details: claimAuditDetails({
          signupId: signup.id, name: check.value.name, group: check.value.group,
        }),
      },
    });
    return { ok: true as const, signupId: signup.id, claimToken };
  });
}

export async function deleteSignupWithAudit(
  signupId: string,
  providedToken: string | null,
): Promise<VoidResult> {
  return prisma.$transaction(async (tx) => {
    const signup = await tx.signup.findUnique({
      where: { id: signupId },
      include: { task: { select: { eventId: true } } },
    });
    if (!signup) return { ok: false as const, error: "That signup is no longer here." };

    const check = validateRelease({ claimToken: signup.claimToken }, providedToken);
    if (!check.ok) return check;

    await tx.auditLog.create({
      data: {
        eventId: signup.task.eventId,
        taskId: signup.taskId,
        action: "release",
        details: releaseAuditDetails({
          signupId: signup.id, name: signup.name, group: signup.group,
          email: signup.email, phone: signup.phone, minor: signup.minor,
        }),
      },
    });
    await tx.signup.delete({ where: { id: signupId } });
    return { ok: true as const };
  });
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm run test:db -- lib/repository/signups.test.ts`
Expected: PASS — including the concurrency test (exactly one of two simultaneous last-slot claims succeeds).

- [ ] **Step 6: Commit and push**

```bash
git add lib/repository
git commit -m "feat: concurrency-safe claim/release repository (FOR UPDATE) with audit"
git push
```

---

## Task 9: Seed a real event

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (`prisma.seed` config)

- [ ] **Step 1: Add seed config + tsx**

Add a top-level `"prisma"` key in `package.json`:

```json
"prisma": {
  "seed": "npx tsx prisma/seed.ts"
}
```

```bash
npm install -D tsx
```

- [ ] **Step 2: Write the seed (times in UTC, commented with Pacific)**

Create `prisma/seed.ts`:

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
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

  // PDT is UTC-7: 10:00 AM PDT = 17:00Z, 1:00 PM PDT = 20:00Z, etc.
  await prisma.task.createMany({
    data: [
      {
        eventId: event.id, kind: "shift", title: "Games", category: "Games",
        requestedGroup: "Scouts", neededCount: 5,
        date: new Date("2026-07-25T00:00:00Z"),
        startAt: new Date("2026-07-25T17:00:00Z"), endAt: new Date("2026-07-25T20:00:00Z"),
        location: "Inside Gym", pointOfContact: "Yumi 415-370-1477",
        definitionOfDone: "Booth staffed and tidy at handover.",
      },
      {
        eventId: event.id, kind: "shift", title: "Bingo", category: "Bingo",
        neededCount: 3, date: new Date("2026-07-25T00:00:00Z"),
        startAt: new Date("2026-07-25T20:00:00Z"), endAt: new Date("2026-07-25T23:00:00Z"),
        location: "Inside Gym",
      },
      {
        eventId: event.id, kind: "shift", title: "Food Service", category: "Food/Kitchen",
        requestedGroup: "Scouts", neededCount: 3,
        date: new Date("2026-07-25T00:00:00Z"),
        // all-day: date set, no startAt/endAt
      },
      {
        eventId: event.id, kind: "frog", title: "Bring 50 paper cups",
        category: "Supplies", neededCount: 1,
        dueBy: new Date("2026-07-25T17:00:00Z"),
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

> **Known debt:** seed has tasks only, no signups yet.

- [ ] **Step 3: Seed the dev database**

Run: `npm run db:seed`
Expected: "Seeded event ... with 4 tasks."

- [ ] **Step 4: Commit and push**

```bash
git add prisma/seed.ts package.json
git commit -m "feat: seed Ginza Bazaar event for local dev"
git push
```

---

## Task 10: Server actions for claim and release

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

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

async function seedTask(): Promise<string> {
  const event = await prisma.event.create({
    data: { name: "E", startDate: new Date(), endDate: new Date() },
  });
  const task = await prisma.task.create({
    data: { eventId: event.id, title: "Games", neededCount: 2 },
  });
  return task.id;
}

test("claimSlot persists a signup and returns its token", async () => {
  const taskId = await seedTask();
  const fd = new FormData();
  fd.set("taskId", taskId);
  fd.set("name", "Kenji");
  fd.set("group", "Scouts");

  const result = await claimSlot(fd);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.signupId).toBeTruthy();
  expect(result.claimToken).toBeTruthy();
  const signups = await prisma.signup.findMany({ where: { taskId } });
  expect(signups.map((s) => s.name)).toEqual(["Kenji"]);
});

test("claimSlot returns an error for a blank name", async () => {
  const taskId = await seedTask();
  const fd = new FormData();
  fd.set("taskId", taskId);
  fd.set("name", "   ");
  expect(await claimSlot(fd)).toEqual({ ok: false, error: "Please enter a name." });
});

test("claimSlot silently rejects a filled honeypot", async () => {
  const taskId = await seedTask();
  const fd = new FormData();
  fd.set("taskId", taskId);
  fd.set("name", "Kenji");
  fd.set("website", "http://spam.example"); // honeypot field
  expect(await claimSlot(fd)).toEqual({ ok: false, error: "Could not submit. Please try again." });
  expect(await prisma.signup.count({ where: { taskId } })).toBe(0);
});

test("releaseSignup removes a signup when the token matches", async () => {
  const taskId = await seedTask();
  const fd = new FormData();
  fd.set("taskId", taskId);
  fd.set("name", "Kenji");
  const claim = await claimSlot(fd);
  expect(claim.ok).toBe(true);
  if (!claim.ok) return;

  const result = await releaseSignup(claim.signupId, claim.claimToken);
  expect(result).toEqual({ ok: true });
  expect(await prisma.signup.count({ where: { taskId } })).toBe(0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:db -- app/actions/signups.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the server actions**

Create `app/actions/signups.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createSignupWithAudit, deleteSignupWithAudit } from "@/lib/repository/signups";

export type ClaimActionResult =
  | { ok: true; signupId: string; claimToken: string }
  | { ok: false; error: string };
export type ReleaseActionResult = { ok: true } | { ok: false; error: string };

export async function claimSlot(formData: FormData): Promise<ClaimActionResult> {
  const taskId = String(formData.get("taskId") ?? "");
  if (!taskId) return { ok: false, error: "Missing task." };

  const result = await createSignupWithAudit(taskId, {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    group: String(formData.get("group") ?? ""),
    minor: formData.get("minor") === "on" ? true : undefined,
    honeypot: String(formData.get("website") ?? ""), // hidden field named "website"
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/");
  return { ok: true, signupId: result.signupId, claimToken: result.claimToken };
}

export async function releaseSignup(
  signupId: string,
  claimToken: string | null,
): Promise<ReleaseActionResult> {
  const result = await deleteSignupWithAudit(signupId, claimToken);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/");
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test:db -- app/actions/signups.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit and push**

```bash
git add app/actions/signups.ts app/actions/signups.test.ts
git commit -m "feat: claim/release server actions with honeypot and token"
git push
```

---

## Task 11: Board UI and the claim/release interaction

> **Use the `frontend-design` skill for this task.** The code below is a correct,
> tested baseline; treat it as the structure and behavior contract, then apply the
> skill to elevate visual craft and honor the volunteer mental model in
> "User Experience & Mental Models" above. Keep the test selectors (roles, labels,
> text) intact so the tests still pass.

**Files:**
- Create: `components/Board.tsx`, `components/TaskCard.tsx`, `components/ClaimForm.tsx`, `components/Claimant.tsx`, `lib/client/ownership.ts`
- Modify: `app/page.tsx`
- Test: `components/TaskCard.test.tsx`, `components/ClaimForm.test.tsx`, `components/Claimant.test.tsx`

- [ ] **Step 1: Implement device-local ownership helpers**

Create `lib/client/ownership.ts`:

```typescript
"use client";

const KEY = "frogboard.claims";

function readMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function rememberClaim(signupId: string, token: string) {
  const map = readMap();
  map[signupId] = token;
  window.localStorage.setItem(KEY, JSON.stringify(map));
}

export function getClaimToken(signupId: string): string | null {
  return readMap()[signupId] ?? null;
}

export function forgetClaim(signupId: string) {
  const map = readMap();
  delete map[signupId];
  window.localStorage.setItem(KEY, JSON.stringify(map));
}
```

- [ ] **Step 2: Write a failing render test for TaskCard**

Create `components/TaskCard.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TaskCard } from "@/components/TaskCard";
import type { BoardTask } from "@/lib/domain/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/signups", () => ({ claimSlot: vi.fn(), releaseSignup: vi.fn() }));

function task(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "t1", kind: "shift", title: "Games", category: "Games",
    requestedGroup: "Scouts", neededCount: 3, date: new Date("2026-07-25T00:00:00Z"),
    startAt: new Date("2026-07-25T17:00:00Z"), endAt: new Date("2026-07-25T20:00:00Z"),
    dueBy: null, pointOfContact: "Yumi 415-370-1477", location: "Inside Gym",
    definitionOfDone: "Booth tidy at handover.", status: "todo", waiting: false,
    signups: [], ...overrides,
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
  render(<TaskCard task={task({ signups: [{ id: "s1", name: "Kenji", group: "Scouts", minor: null }] })} />);
  expect(screen.getByText("Kenji")).toBeInTheDocument();
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run components/TaskCard.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement ClaimForm (client, honeypot, stores token)**

Create `components/ClaimForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimSlot } from "@/app/actions/signups";
import { rememberClaim } from "@/lib/client/ownership";

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

  function onSubmit(formData: FormData) {
    setError(null);
    formData.set("taskId", taskId);
    startTransition(async () => {
      const result = await claimSlot(formData);
      if (result.ok) {
        rememberClaim(result.signupId, result.claimToken);
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form action={onSubmit} className="mt-3 space-y-2">
      {/* Honeypot: hidden from humans; bots fill it and get rejected. */}
      <input
        type="text" name="website" tabIndex={-1} autoComplete="off"
        className="hidden" aria-hidden="true"
      />
      <label className="block text-sm font-medium text-emerald-900">
        Your name
        <input name="name" autoFocus maxLength={80}
          className="mt-1 w-full rounded-lg border border-emerald-300 px-3 py-2" />
      </label>
      <label className="block text-sm text-emerald-800">
        Group (optional)
        <input name="group" maxLength={40}
          className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-2" />
      </label>
      <label className="flex items-center gap-2 text-sm text-emerald-800">
        <input type="checkbox" name="minor" /> Under 18
      </label>
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending}
          className="flex-1 rounded-xl bg-emerald-600 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
          {pending ? "Adding…" : "Add me"}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="rounded-xl border border-emerald-300 px-4 py-2 text-emerald-800">
          Cancel
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Implement Claimant (client, device-owned remove)**

Create `components/Claimant.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { releaseSignup } from "@/app/actions/signups";
import { getClaimToken, forgetClaim } from "@/lib/client/ownership";

export function Claimant({
  signupId, name, group,
}: {
  signupId: string;
  name: string;
  group: string | null;
}) {
  const [owned, setOwned] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Only the device that made the claim shows a remove control.
  useEffect(() => {
    setOwned(getClaimToken(signupId) !== null);
  }, [signupId]);

  function onRemove() {
    const token = getClaimToken(signupId);
    startTransition(async () => {
      const result = await releaseSignup(signupId, token);
      if (result.ok) {
        forgetClaim(signupId);
        router.refresh();
      }
    });
  }

  return (
    <li className="inline-flex items-center gap-1 rounded-full bg-emerald-100 py-1 pl-3 pr-2 text-sm text-emerald-900">
      <span>{name}</span>
      {group && <span className="text-emerald-600">· {group}</span>}
      {owned && (
        <button type="button" onClick={onRemove} disabled={pending}
          aria-label={`Remove ${name}`}
          className="ml-1 rounded-full px-2 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50">
          ×
        </button>
      )}
    </li>
  );
}
```

- [ ] **Step 6: Implement TaskCard**

Create `components/TaskCard.tsx`:

```tsx
import { getSlotInfo } from "@/lib/domain/board";
import { formatWhen } from "@/lib/domain/time";
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

- [ ] **Step 7: Run TaskCard test to verify pass**

Run: `npx vitest run components/TaskCard.test.tsx`
Expected: PASS.

- [ ] **Step 8: Write and pass the ClaimForm interaction test**

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
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ClaimForm } from "@/components/ClaimForm";

beforeEach(() => {
  claimSlot.mockReset();
  window.localStorage.clear();
});

test("submits a name, calls the action, and stores the returned token", async () => {
  claimSlot.mockResolvedValue({ ok: true, signupId: "s1", claimToken: "tok-1" });
  const user = userEvent.setup();
  render(<ClaimForm taskId="t1" />);

  await user.click(screen.getByRole("button", { name: /grab a frog/i }));
  await user.type(screen.getByLabelText(/your name/i), "Kenji");
  await user.click(screen.getByRole("button", { name: /^add me$/i }));

  expect(claimSlot).toHaveBeenCalledOnce();
  const fd = claimSlot.mock.calls[0][0] as FormData;
  expect(fd.get("name")).toBe("Kenji");
  expect(fd.get("taskId")).toBe("t1");
  expect(JSON.parse(window.localStorage.getItem("frogboard.claims")!)).toEqual({ s1: "tok-1" });
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

Run: `npx vitest run components/ClaimForm.test.tsx`
Expected: PASS.

- [ ] **Step 9: Write and pass the Claimant ownership test**

Create `components/Claimant.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi, beforeEach } from "vitest";

const releaseSignup = vi.fn();
vi.mock("@/app/actions/signups", () => ({
  releaseSignup: (id: string, token: string | null) => releaseSignup(id, token),
  claimSlot: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { Claimant } from "@/components/Claimant";

beforeEach(() => {
  releaseSignup.mockReset();
  window.localStorage.clear();
});

test("hides remove when this device does not own the signup", () => {
  render(<Claimant signupId="s1" name="Kenji" group="Scouts" />);
  expect(screen.queryByRole("button", { name: /remove kenji/i })).toBeNull();
});

test("shows remove and passes the stored token when this device owns the signup", async () => {
  window.localStorage.setItem("frogboard.claims", JSON.stringify({ s1: "tok-1" }));
  releaseSignup.mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  render(<Claimant signupId="s1" name="Kenji" group="Scouts" />);

  await user.click(screen.getByRole("button", { name: /remove kenji/i }));
  expect(releaseSignup).toHaveBeenCalledWith("s1", "tok-1");
});
```

Run: `npx vitest run components/Claimant.test.tsx`
Expected: PASS.

- [ ] **Step 10: Implement Board and wire the home page**

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

- [ ] **Step 11: Build and manually verify the full loop**

Run: `npm run build` (expected: no type errors), then `npm run dev` and open http://localhost:3000. Grab a frog, add a name → it appears, count increments, and a remove "×" shows for *you*. Open the same board in a private window → no remove button on your signup. Remove it in your first window → it disappears. Stop the server.

- [ ] **Step 12: Commit and push**

```bash
git add components lib/client app/page.tsx
git commit -m "feat: board UI, claim form (honeypot+token), device-owned release"
git push
```

---

## Task 12: Connect Vercel CD and verify production

**Files:**
- Create: `README.md`
- Modify: `package.json` (build runs migrations)

- [ ] **Step 1: Make the build run migrations (build-once, migrate-in-pipeline)**

In `package.json`, change the build script:

```json
"build": "prisma generate && prisma migrate deploy && next build"
```

- [ ] **Step 2: Connect Vercel**

In the Vercel dashboard: New Project → import the `frogboard` repo. Set the `DATABASE_URL` environment variable to your Neon **prod** connection string (Production scope). Deploy. From now on, every push to `main` auto-deploys and runs `prisma migrate deploy` in the build — no manual prod migrations.

- [ ] **Step 3: Seed the production event (one-time, for the first demo)**

```bash
DATABASE_URL="<prod-neon-url>" npm run db:seed
```

- [ ] **Step 4: Write the README**

Create `README.md`:

```markdown
# Frog Board

Mobile-first volunteer self-organization board. Phase 1: public board + claim/release.

## Develop
1. `npm install`
2. Copy `.env.example` to `.env` and `.env.test`; paste your Neon connection strings
   (the test DB name must contain "test").
3. `npm run db:migrate` then `npm run db:seed`
4. `npm run dev`

## Test
- Unit (no DB): `npm test`
- Integration (test DB): `npm run test:db`

## CI/CD (Jez Humble style)
- GitHub Actions runs lint + tests + build on every push against a throwaway
  Postgres container; `main` stays releasable.
- Vercel auto-deploys `main`. Migrations run in the build via `prisma migrate deploy`.
  Never migrate prod by hand.
```

- [ ] **Step 5: Verify the live site on a phone**

Open the Vercel URL on a phone. Confirm the board loads and a claim/release works end-to-end.

- [ ] **Step 6: Commit and push**

```bash
git add README.md package.json
git commit -m "ci: run migrations in build; docs: run/deploy notes"
git push
```

---

## Task 13 (stretch): Playwright end-to-end test

A browser-level test of the real claim/release loop. Stretch because it needs a running app + DB; keep it out of the default unit run.

**Files:**
- Create: `playwright.config.ts`, `e2e/board.spec.ts`
- Modify: `package.json` (`test:e2e` script), `.github/workflows/ci.yml` (optional e2e job)

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

- [ ] **Step 2: Configure Playwright**

Create `playwright.config.ts`:

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

Add to `"scripts"`:

```json
"test:e2e": "playwright test"
```

- [ ] **Step 3: Write the E2E spec**

Create `e2e/board.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test("claim and release a slot end-to-end", async ({ page }) => {
  await page.goto("/");

  const firstCard = page.locator("article").first();
  await expect(firstCard).toContainText("filled");

  await firstCard.getByRole("button", { name: /grab a frog/i }).click();
  await firstCard.getByLabel(/your name/i).fill("E2E Tester");
  await firstCard.getByRole("button", { name: /^add me$/i }).click();

  await expect(firstCard).toContainText("E2E Tester");

  await firstCard.getByRole("button", { name: /remove e2e tester/i }).click();
  await expect(firstCard).not.toContainText("E2E Tester");
});
```

- [ ] **Step 4: Run the E2E test against a seeded local build**

```bash
npm run db:seed
npm run build
npm run test:e2e
```

Expected: PASS — the claim appears, then the release removes it.

- [ ] **Step 5: Commit and push**

```bash
git add playwright.config.ts e2e package.json
git commit -m "test: Playwright end-to-end claim/release flow"
git push
```

---

## Definition of Done (Phase 1)

- [ ] CI is green on `main` (lint + unit + integration + build)
- [ ] Two simultaneous claims for the last slot yield exactly one signup (concurrency test passes)
- [ ] A signup's "remove" control appears only on the claiming device; a wrong/missing token is rejected
- [ ] Honeypot and input-limit validations reject bad input; every claim/release writes an `AuditLog` row carrying `eventId`
- [ ] `resetDb()` refuses to run against a non-test `DATABASE_URL`
- [ ] The deployed board loads on a phone; a scout can claim and release a shift
- [ ] (Stretch) Playwright E2E passes

## Exploratory testing charter (run after the tasks, per Hendrickson)

Timebox 30 minutes. Explore: two phones racing for the last slot; very long and emoji names; double-tapping "Add me"; browser back/forward after claiming; clearing localStorage then trying to remove; a frog with no date; daylight-time boundaries. Turn any surprise into a new automated test.

## Known debt carried into later phases

- Rate limiting is not yet implemented (needs a KV store). **Placeholder:** add Upstash/Vercel KV + a per-IP limiter on `claimSlot` in a later phase. Honeypot + length limits are the interim guard.
- Interaction is pending-state + `router.refresh()`, not true optimistic UI. Tracked enhancement: adopt `useOptimistic` for instant claim/remove rendering.
- `claimToken` is stored plaintext (capability token, not a credential). Acceptable for anti-graffiti; revisit if it ever guards anything sensitive.
- Per-event timezone is fixed to `America/Los_Angeles`. Add `Event.timezone` when scouts use it elsewhere.
