# Frog Marketplace (standing board) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a coordinator post ongoing temple needs as frogs on an evergreen board that volunteers grab from a public URL, reusing the existing frog, board, and claim machinery.

**Architecture:** A standing board is an `Event` with `standing = true` and no dates. Frogs are `Task`s with `kind = "frog"`; an area is the existing `category`. One boolean plus nullable dates on `Event`; the rest is reuse. The clean layering holds: pure domain (`lib/domain`) → repository (`lib/repository`) → server actions (`app/actions`) → pages/components.

**Tech Stack:** Next.js App Router (read guides in `node_modules/next/dist/docs/` before writing routes), Prisma v6 + Postgres, React, Vitest (jsdom unit; node `*.db.test.ts`), Tailwind ("Matsuri at Dusk" tokens in `app/globals.css`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-11-frog-marketplace-design.md`.
- Invariant, enforced at the event write boundary: `standing = false` → both dates present; `standing = true` → both dates absent.
- Standing boards never appear in `listEvents` or `listPublishedEvents` (filter `standing: false`). A standing board is reached only by its slug.
- Standing boards hold frogs only: the task write path rejects `kind = "shift"` when the board is `standing`.
- One `Organization` (`id = 'org_bcsf'`). New events/boards use `orgId: "org_bcsf"` (reuse `createEvent`'s pattern). Slugs pass through `generateUniqueSlug` / `RESERVED_SLUGS`.
- Prisma pinned to v6; `DATABASE_URL` stays in `schema.prisma`.
- Writing style (repo CLAUDE.md): omit needless words, active voice, no em dash. Applies to comments and commit messages.
- Before done: `npm test` and `npm run test:db` green, plus `npx tsc --noEmit` and `npm run lint`. New/changed public pages pass the repo axe check with zero violations.
- Strict TDD: red → green → refactor. Schema/migration is the documented exception, verified by running the suites.

---

### Task 1: Schema, migration, nullable-date readers, list filtering

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_standing_board/migration.sql` (generated)
- Modify: `lib/repository/organize.ts` (`EventListItem`, `listEvents`, `getEventGrid`)
- Modify: `lib/repository/events.ts` (`PublishedEventSummary`, `listPublishedEvents`)
- Modify: `app/actions/organize.ts` (`eventCtx` null-safety)
- Modify: `components/organize/OrganizeGrid.tsx` (ctx null-safety), `app/organize/[eventId]/page.tsx` (pass `standing`)
- Test: `lib/repository/organize.db.test.ts` (add a filtering block)

**Interfaces:**
- Produces: `Event.standing: boolean`; `Event.startDate`/`endDate` become `DateTime?`. `EventListItem` and `getEventGrid`'s event dates become `Date | null`; `getEventGrid` also returns `standing: boolean`. `listEvents` and `listPublishedEvents` exclude standing boards.

The schema change is the TDD exception (verified by client regen, both DBs applied, and a green `tsc`). The list-filtering behavior gets a failing test first.

- [ ] **Step 1: Edit `prisma/schema.prisma`**

In the `Event` model, change the date lines and add the flag. Current lines:

```prisma
  slug      String? // human-readable URL, e.g. "ginza-2026"; null until set
  startDate DateTime
  endDate   DateTime
  status    EventStatus @default(draft)
```

Replace with:

```prisma
  slug      String? // human-readable URL, e.g. "ginza-2026"; null until set
  startDate DateTime? // null on a standing (evergreen) board
  endDate   DateTime? // null on a standing (evergreen) board
  standing  Boolean     @default(false) // an evergreen board of frogs, no dates
  status    EventStatus @default(draft)
```

- [ ] **Step 2: Generate and apply the migration (dev), regenerating the client**

Run: `npm run db:migrate -- --name add_standing_board`
Expected: a new `prisma/migrations/<ts>_add_standing_board/migration.sql` containing `ALTER TABLE "Event" ADD COLUMN "standing" BOOLEAN NOT NULL DEFAULT false;` and two `ALTER COLUMN ... DROP NOT NULL;` statements. Ends with "Your database is now in sync" and runs `prisma generate`.

- [ ] **Step 3: Apply the migration to the test database**

Run: `npm run db:migrate:test`
Expected: the migration applies cleanly.

- [ ] **Step 4: Write the failing filtering test**

Append to `lib/repository/organize.db.test.ts`. Add the import if missing (`listEvents`) and a block:

```ts
import { listEvents } from "@/lib/repository/organize";
import { listPublishedEvents } from "@/lib/repository/events";

describe("standing boards stay out of the event lists", () => {
  test("listEvents and listPublishedEvents exclude standing boards", async () => {
    await prisma.event.create({
      data: { name: "Ginza", orgId: "org_bcsf", startDate: new Date(), endDate: new Date(), status: "published" },
    });
    await prisma.event.create({
      data: { name: "Temple needs", orgId: "org_bcsf", standing: true, status: "published" },
    });
    expect((await listEvents()).map((e) => e.name)).toEqual(["Ginza"]);
    expect((await listPublishedEvents()).map((e) => e.name)).toEqual(["Ginza"]);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm run test:db -- lib/repository/organize.db.test.ts`
Expected: FAIL, the standing board appears in the lists (and `tsc`-level date-type errors may also surface once the client is regenerated).

- [ ] **Step 6: Fix `lib/repository/organize.ts` (types + filter)**

Change `EventListItem` dates to nullable and filter `listEvents`:

```ts
export interface EventListItem {
  id: string; name: string; startDate: Date | null; endDate: Date | null;
  status: EventStatus; taskCount: number;
}

export async function listEvents(): Promise<EventListItem[]> {
  const events = await prisma.event.findMany({
    where: { standing: false },
    // id tiebreak keeps the order deterministic for same-instant creations
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { _count: { select: { tasks: true } } },
  });
  return events.map((e) => ({
    id: e.id, name: e.name, startDate: e.startDate, endDate: e.endDate,
    status: e.status, taskCount: e._count.tasks,
  }));
}
```

In `getEventGrid`, widen the return type and carry `standing`. Change the signature line and the returned object:

```ts
export async function getEventGrid(eventId: string): Promise<
  { id: string; name: string; slug: string | null; startDate: Date | null; endDate: Date | null; standing: boolean; status: EventStatus; tasks: GridTask[] } | null
> {
```

and the returned object's scalar line:

```ts
    id: event.id, name: event.name, slug: event.slug, startDate: event.startDate, endDate: event.endDate, standing: event.standing, status: event.status,
```

- [ ] **Step 7: Fix `lib/repository/events.ts` (types + filter)**

Change `PublishedEventSummary` dates to nullable and filter `listPublishedEvents`:

```ts
export interface PublishedEventSummary {
  id: string; name: string; slug: string | null; startDate: Date | null; endDate: Date | null;
  covered: number; total: number;
}
```

```ts
  const events = await prisma.event.findMany({
    where: { status: "published", standing: false },
    // id tiebreak keeps the order deterministic for same-instant creations
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { tasks: { select: { neededCount: true, _count: { select: { signups: true } } } } },
  });
```

- [ ] **Step 8: Make the save-path context null-safe in `app/actions/organize.ts`**

`eventCtx` dereferences `event.startDate`, which is now nullable. Replace the function so a dateless board yields a harmless calendar-year context (a standing board's frogs carry no date range):

```ts
async function eventCtx(eventId: string): Promise<EventCtx | null> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return null;
  if (!event.startDate || !event.endDate) {
    const year = new Date().getUTCFullYear();
    return { year, start: { year, month: 1, day: 1 }, end: { year, month: 12, day: 31 } };
  }
  return { year: event.startDate.getUTCFullYear(), start: toParts(event.startDate), end: toParts(event.endDate) };
}
```

- [ ] **Step 9: Make the grid context null-safe in `components/organize/OrganizeGrid.tsx`**

Widen `GridEvent` and guard the inline `ctx`. Change the interface:

```ts
interface GridEvent {
  id: string; name: string; status: "draft" | "published" | "archived";
  startDate: Date | null; endDate: Date | null; standing: boolean;
}
```

Replace the `const ctx: EventCtx = {...}` block with:

```ts
  const ctx: EventCtx = event.startDate && event.endDate
    ? { year: event.startDate.getUTCFullYear(), start: toParts(event.startDate), end: toParts(event.endDate) }
    : (() => { const year = new Date().getUTCFullYear();
        return { year, start: { year, month: 1, day: 1 }, end: { year, month: 12, day: 31 } }; })();
```

- [ ] **Step 10: Pass `standing` from the organizer page in `app/organize/[eventId]/page.tsx`**

Change the `<OrganizeGrid ... event={...} />` props to include `standing`:

```tsx
      <OrganizeGrid
        event={{ id: grid.id, name: grid.name, status: grid.status, startDate: grid.startDate, endDate: grid.endDate, standing: grid.standing }}
        initialTasks={grid.tasks}
      />
```

- [ ] **Step 11: Run the DB test and the full type-check**

Run: `npm run test:db -- lib/repository/organize.db.test.ts && npx tsc --noEmit`
Expected: the filtering test PASSES; `tsc` reports no errors.

- [ ] **Step 12: Run both suites to confirm nothing regressed**

Run: `npm test && npm run test:db`
Expected: green.

- [ ] **Step 13: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/repository/organize.ts lib/repository/events.ts app/actions/organize.ts components/organize/OrganizeGrid.tsx "app/organize/[eventId]/page.tsx" lib/repository/organize.db.test.ts
git commit -m "feat: Event.standing flag, nullable dates, standing boards out of event lists"
```

---

### Task 2: Create-a-standing-board (repository + action)

**Files:**
- Modify: `lib/repository/organize.ts` (add `createStandingBoard`)
- Modify: `app/actions/organize.ts` (add `createStandingBoardAction`)
- Test: `lib/repository/organize.db.test.ts`, `app/actions/organize.db.test.ts`

**Interfaces:**
- Consumes: `generateUniqueSlug` (already imported in `organize.ts`); `requireOrganizer` (already in `organize.ts` actions).
- Produces:
  - `createStandingBoard(name: string): Promise<Event>` (sets `standing: true`, no dates, a unique slug, `orgId: "org_bcsf"`, `status: "draft"`).
  - `createStandingBoardAction(formData: FormData): Promise<{ ok: true; eventId: string } | { ok: false; error: string; field?: string }>`.

- [ ] **Step 1: Write the failing repository test**

Append to `lib/repository/organize.db.test.ts` (extend the import to include `createStandingBoard`):

```ts
import { createStandingBoard } from "@/lib/repository/organize";

describe("createStandingBoard", () => {
  test("creates an evergreen board with a slug and no dates", async () => {
    const board = await createStandingBoard("Temple needs");
    expect(board.standing).toBe(true);
    expect(board.startDate).toBeNull();
    expect(board.endDate).toBeNull();
    expect(board.slug).toBeTruthy();
    expect(board.status).toBe("draft");
    expect(board.orgId).toBe("org_bcsf");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db -- lib/repository/organize.db.test.ts`
Expected: FAIL, `createStandingBoard` is not exported.

- [ ] **Step 3: Implement `createStandingBoard`**

Add near `createEvent` in `lib/repository/organize.ts`:

```ts
/** An evergreen board of frogs: no dates, drafted until the organizer publishes it. */
export async function createStandingBoard(name: string): Promise<Event> {
  const slug = await generateUniqueSlug(name);
  return prisma.event.create({ data: { name, slug, standing: true, orgId: "org_bcsf" } });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:db -- lib/repository/organize.db.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing action test**

Append to `app/actions/organize.db.test.ts`. It already mocks `next/headers` cookies and `next/cache`; reuse its `authenticate()` helper and `SESSION_COOKIE`/`sessionToken` imports. Add:

```ts
import { createStandingBoardAction } from "@/app/actions/organize";

describe("createStandingBoardAction", () => {
  test("rejects a signed-out caller", async () => {
    const fd = new FormData(); fd.set("name", "Temple needs");
    expect(await createStandingBoardAction(fd)).toEqual({ ok: false, error: "Please sign in." });
  });
  test("creates a standing board when signed in", async () => {
    authenticate();
    const fd = new FormData(); fd.set("name", "Temple needs");
    const r = await createStandingBoardAction(fd);
    expect(r.ok).toBe(true);
    expect(await prisma.event.count({ where: { standing: true } })).toBe(1);
  });
  test("requires a name", async () => {
    authenticate();
    const fd = new FormData(); fd.set("name", "  ");
    expect(await createStandingBoardAction(fd)).toEqual({ ok: false, error: "Give the board a name." });
  });
});
```

If `app/actions/organize.db.test.ts` does not already define `authenticate()`/import the session helpers, add at the top (matching the roster action tests):

```ts
import { sessionToken, SESSION_COOKIE } from "@/lib/security/session";
function authenticate() { cookieJar.set(SESSION_COOKIE, sessionToken()); }
```

(Reuse the existing `cookieJar` the file's `next/headers` mock already declares. If the file also needs `ORGANIZER_PASSWORD` for `sessionToken`, add `vi.stubEnv("ORGANIZER_PASSWORD", "lily-pad-42")` in its `beforeEach`, as the roster tests do.)

- [ ] **Step 6: Run it to verify it fails**

Run: `npm run test:db -- app/actions/organize.db.test.ts`
Expected: FAIL, `createStandingBoardAction` is not exported.

- [ ] **Step 7: Implement `createStandingBoardAction`**

In `app/actions/organize.ts`, add `createStandingBoard` to the `@/lib/repository/organize` import, then add:

```ts
export async function createStandingBoardAction(
  formData: FormData,
): Promise<{ ok: true; eventId: string } | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Give the board a name." };
  const board = await createStandingBoard(name);
  revalidatePath("/organize");
  return { ok: true, eventId: board.id };
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npm run test:db -- app/actions/organize.db.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/repository/organize.ts app/actions/organize.ts lib/repository/organize.db.test.ts app/actions/organize.db.test.ts
git commit -m "feat: createStandingBoard repo + organizer-gated action"
```

---

### Task 3: Frog-only guard and frog-default on standing boards

**Files:**
- Modify: `app/actions/organize.ts` (`saveTask` rejects `shift` on a standing board)
- Modify: `components/organize/OrganizeGrid.tsx` (new rows default to frog when standing)
- Test: `app/actions/organize.db.test.ts`

**Interfaces:**
- Consumes: `saveTask` (existing); `getEventGrid`/`prisma` for the board's `standing`.
- Produces: `saveTask` returns `{ ok: false, error: "Standing boards hold frogs only." }` when the parsed kind is `shift` and the board is standing.

- [ ] **Step 1: Write the failing guard test**

Append to `app/actions/organize.db.test.ts`:

```ts
import { saveTask } from "@/app/actions/organize";
import { emptyCells } from "@/lib/domain/gridRow";

describe("saveTask frog-only guard on standing boards", () => {
  test("rejects a shift on a standing board", async () => {
    authenticate();
    const board = await prisma.event.create({ data: { name: "Temple", orgId: "org_bcsf", standing: true } });
    const cells = { ...emptyCells(), title: "Trim hedges", kind: "shift" };
    expect(await saveTask({ eventId: board.id, taskId: null, cells }))
      .toEqual({ ok: false, error: "Standing boards hold frogs only." });
    expect(await prisma.task.count({ where: { eventId: board.id } })).toBe(0);
  });
  test("accepts a frog on a standing board", async () => {
    authenticate();
    const board = await prisma.event.create({ data: { name: "Temple", orgId: "org_bcsf", standing: true } });
    const cells = { ...emptyCells(), title: "Trim hedges", kind: "frog" };
    const r = await saveTask({ eventId: board.id, taskId: null, cells });
    expect(r.ok).toBe(true);
    expect(await prisma.task.count({ where: { eventId: board.id, kind: "frog" } })).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db -- app/actions/organize.db.test.ts`
Expected: FAIL, the shift is saved instead of rejected.

- [ ] **Step 3: Add the guard in `saveTask`**

In `app/actions/organize.ts`, `saveTask` already fetches `ctx` and calls `parseRow`. After `parsed` succeeds, look up the board's `standing` and reject a shift. Replace the body from the `parseRow` call onward:

```ts
  const parsed = parseRow(input.cells, ctx);
  if (!parsed.ok) return { ok: false, error: parsed.error, field: parsed.field };
  const board = await prisma.event.findUnique({ where: { id: input.eventId }, select: { standing: true } });
  if (board?.standing && parsed.value.kind === "shift") {
    return { ok: false, error: "Standing boards hold frogs only." };
  }
  const result = await upsertTaskWithAudit(input.eventId, input.taskId, parsed.value, await organizerName());
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:db -- app/actions/organize.db.test.ts`
Expected: PASS.

- [ ] **Step 5: Default new grid rows to frog on a standing board**

In `components/organize/OrganizeGrid.tsx`, add a helper after `ctx` is defined:

```ts
  const newCells = () => ({ ...emptyCells(), kind: event.standing ? "frog" : "shift" });
```

Then, in `addRow`, replace its `cells: emptyCells(),` with `cells: newCells(),`. That is the only brand-new blank row. Leave `duplicateRow` (copies the last row), `addManyTasks` (cells come from the paste dialog), and `applyPaste`'s `emptyCells` argument as-is; a pasted `shift` row on a standing board is caught by the server guard from Step 3.

- [ ] **Step 6: Type-check and run the unit suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; unit tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/actions/organize.ts components/organize/OrganizeGrid.tsx app/actions/organize.db.test.ts
git commit -m "feat: standing boards hold frogs only (guard + grid default)"
```

---

### Task 4: Public board carries `standing` and drops the date furniture

**Files:**
- Modify: `lib/repository/events.ts` (`getEventBoardByParam` returns `standing`)
- Modify: `app/[slug]/page.tsx` (pass `standing` to `Board`)
- Modify: `components/Board.tsx` (suppress the day header when standing)
- Test: `components/Board.test.tsx`

**Interfaces:**
- Produces: `getEventBoardByParam` returns `{ id; name; standing: boolean; tasks: BoardTask[] }`. `Board` accepts `standing?: boolean`; when true it renders tasks without per-day `<h2>` headers.

- [ ] **Step 1: Write the failing board test**

Append to `components/Board.test.tsx` (reuse its existing `task()` helper if present; otherwise this inline one):

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Board } from "@/components/Board";
import type { BoardTask } from "@/lib/domain/types";

function frog(over: Partial<BoardTask> = {}): BoardTask {
  return {
    id: "f1", kind: "frog", title: "Trim hedges", category: "Grounds", requestedGroup: null,
    neededCount: 1, date: null, startAt: null, endAt: null, dueBy: null,
    pointOfContact: null, location: null, definitionOfDone: null,
    position: 0, status: "todo", waiting: false, signups: [], ...over,
  };
}

test("a standing board shows the frog without a 'No set date' header", () => {
  render(<Board eventName="Temple needs" tasks={[frog()]} standing />);
  expect(screen.getByRole("heading", { level: 3, name: "Trim hedges" })).toBeInTheDocument();
  expect(screen.queryByText("No set date")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- components/Board.test.tsx`
Expected: FAIL, `standing` is not a prop and the "No set date" header renders.

- [ ] **Step 3: Add the `standing` prop to `Board`**

In `components/Board.tsx`, extend the props and branch the group rendering. Change the signature:

```tsx
export function Board({
  eventName, tasks, filter, standing = false,
}: {
  eventName: string;
  tasks: BoardTask[];
  filter?: { options: FacetOptions; activeLabels: string[]; covered: number; total: number };
  standing?: boolean;
}) {
```

Replace the `{groups.map((g) => ( ... ))}` block with one that hides the header when standing:

```tsx
      {groups.map((g) => (
        <section key={g.key} className="mb-10">
          {!standing && (
            <h2 className="mb-4 flex items-center justify-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-lantern-deep">
              <span aria-hidden className="h-px w-10 bg-gradient-to-r from-transparent to-lantern/50" />
              <span aria-hidden className="text-[0.7rem]">🏮</span>
              {g.label}
              <span aria-hidden className="text-[0.7rem]">🏮</span>
              <span aria-hidden className="h-px w-10 bg-gradient-to-l from-transparent to-lantern/50" />
            </h2>
          )}
          <div className="space-y-4">
            {g.tasks.map((t) => (
              <TaskCard key={t.id} task={t} index={cardIndex++} />
            ))}
          </div>
        </section>
      ))}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- components/Board.test.tsx`
Expected: PASS.

- [ ] **Step 5: Return `standing` from `getEventBoardByParam`**

In `lib/repository/events.ts`, widen the return type and read `standing`. Change the signature and the two returns for `getEventBoardByParam`:

```ts
export async function getEventBoardByParam(param: string): Promise<
  { id: string; name: string; standing: boolean; tasks: BoardTask[] } | null
> {
```

The Prisma `findFirst` already selects the whole event via `include`; change the final return to:

```ts
  return { id: event.id, name: event.name, standing: event.standing, tasks: toBoardTasks(event.tasks) };
```

- [ ] **Step 6: Pass `standing` to `Board` in `app/[slug]/page.tsx`**

Change the final return to forward the flag:

```tsx
  return <Board eventName={board.name} tasks={tasks} standing={board.standing} filter={{ options, activeLabels, covered, total }} />;
```

- [ ] **Step 7: Type-check and run the unit suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; unit tests pass.

- [ ] **Step 8: Commit**

```bash
git add lib/repository/events.ts "app/[slug]/page.tsx" components/Board.tsx components/Board.test.tsx
git commit -m "feat: public board drops date headers on a standing board"
```

---

### Task 5: Organizer clear-claim (reopen an abandoned frog)

**Files:**
- Create: `lib/repository/signups.ts` addition `deleteSignupAsOrganizer` (same file)
- Modify: `app/actions/signups.ts` (add `organizerReleaseSignup`)
- Modify: `app/[slug]/page.tsx` (read the session, pass `isOrganizer`), `components/Board.tsx`, `components/TaskCard.tsx`, `components/Claimant.tsx`
- Test: `lib/repository/signups.db.test.ts`, `components/Claimant.test.tsx`

**Interfaces:**
- Consumes: `prisma`; `releaseAuditDetails` from `@/lib/domain/audit`; `isValidSession`, `SESSION_COOKIE` from `@/lib/security/session`.
- Produces:
  - `deleteSignupAsOrganizer(signupId: string): Promise<{ ok: true } | { ok: false; error: string }>` (removes a signup without a claim token, audited as a release).
  - `organizerReleaseSignup(signupId: string): Promise<{ ok: true } | { ok: false; error: string }>` (organizer-gated).
  - `Board`, `TaskCard`, `Claimant` accept `isOrganizer?: boolean`; an organizer sees a remove control on any claimant.

- [ ] **Step 1: Write the failing repository test**

Append to `lib/repository/signups.db.test.ts` (create the file if absent, mirroring the roster db tests' header). Add:

```ts
import { deleteSignupAsOrganizer } from "@/lib/repository/signups";

test("deleteSignupAsOrganizer removes a claim without a token and reopens the frog", async () => {
  const event = await prisma.event.create({ data: { name: "Temple", orgId: "org_bcsf", standing: true } });
  const task = await prisma.task.create({ data: { eventId: event.id, kind: "frog", title: "Trim hedges", neededCount: 1, position: 1024 } });
  const signup = await prisma.signup.create({ data: { taskId: task.id, name: "Sam", claimToken: "device-token" } });

  expect(await deleteSignupAsOrganizer(signup.id)).toEqual({ ok: true });
  expect(await prisma.signup.count({ where: { taskId: task.id } })).toBe(0);
  expect(await prisma.auditLog.count({ where: { taskId: task.id, action: "release" } })).toBe(1);
  expect(await deleteSignupAsOrganizer("missing")).toEqual({ ok: false, error: "That signup is no longer here." });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db -- lib/repository/signups.db.test.ts`
Expected: FAIL, `deleteSignupAsOrganizer` is not exported.

- [ ] **Step 3: Implement `deleteSignupAsOrganizer`**

Append to `lib/repository/signups.ts` (it already imports `releaseAuditDetails`):

```ts
/** Organizer override: remove a signup without the volunteer's token, so an
 *  abandoned frog on an evergreen board can be reopened. Audited as a release. */
export async function deleteSignupAsOrganizer(signupId: string): Promise<VoidResult> {
  return prisma.$transaction(async (tx) => {
    const signup = await tx.signup.findUnique({
      where: { id: signupId },
      include: { task: { select: { eventId: true } } },
    });
    if (!signup) return { ok: false as const, error: "That signup is no longer here." };
    await tx.auditLog.create({
      data: {
        eventId: signup.task.eventId, taskId: signup.taskId, action: "release", actorName: signup.name,
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

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:db -- lib/repository/signups.db.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the organizer-gated action**

In `app/actions/signups.ts`, add the imports and the action:

```ts
import { cookies } from "next/headers";
import { isValidSession, SESSION_COOKIE } from "@/lib/security/session";
import { createSignupWithAudit, deleteSignupWithAudit, deleteSignupAsOrganizer } from "@/lib/repository/signups";
```

```ts
/** Organizer-only: clear any claim and reopen the frog. */
export async function organizerReleaseSignup(signupId: string): Promise<ReleaseActionResult> {
  const jar = await cookies();
  if (!isValidSession(jar.get(SESSION_COOKIE)?.value)) return { ok: false, error: "Please sign in." };
  const result = await deleteSignupAsOrganizer(signupId);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/");
  return { ok: true };
}
```

- [ ] **Step 6: Write the failing Claimant test**

Append to `components/Claimant.test.tsx`:

```tsx
import { vi } from "vitest";
vi.mock("@/app/actions/signups", () => ({
  releaseSignup: vi.fn(), organizerReleaseSignup: vi.fn(),
}));

test("an organizer sees a remove control on a claim they do not own", () => {
  render(<Claimant signupId="s1" name="Sam" group={null} isOrganizer />);
  expect(screen.getByRole("button", { name: /remove sam/i })).toBeInTheDocument();
});
```

(If the file already mocks `@/app/actions/signups`, add `organizerReleaseSignup` to that mock instead of adding a second `vi.mock`.)

- [ ] **Step 7: Run it to verify it fails**

Run: `npm test -- components/Claimant.test.tsx`
Expected: FAIL, no remove button appears for a non-owned claim.

- [ ] **Step 8: Add `isOrganizer` to `Claimant`**

In `components/Claimant.tsx`, import the action, add the prop, and show a remove control for organizers. Change the import line:

```ts
import { releaseSignup, organizerReleaseSignup } from "@/app/actions/signups";
```

Add `isOrganizer = false` to the props (and its type). Replace `onRemove` and the `owned && (...)` button so an organizer without the device token can still remove:

```tsx
  function onRemove() {
    startTransition(async () => {
      const result = owned
        ? await releaseSignup(signupId, token)
        : await organizerReleaseSignup(signupId);
      if (result.ok) {
        if (owned) forgetClaim(signupId);
        router.refresh();
      }
    });
  }
```

```tsx
      {(owned || isOrganizer) && (
        <button
          type="button"
          onClick={onRemove}
          disabled={pending}
          aria-label={`Remove ${name}`}
          className="ml-0.5 grid h-5 w-5 place-items-center rounded-full text-reed-deep transition hover:bg-reed/20 disabled:opacity-50"
        >
          ×
        </button>
      )}
```

- [ ] **Step 9: Thread `isOrganizer` through `TaskCard` and `Board`**

In `components/TaskCard.tsx`, add `isOrganizer = false` to the props and pass it to each `Claimant`:

```tsx
export function TaskCard({ task, index = 0, isOrganizer = false }: { task: BoardTask; index?: number; isOrganizer?: boolean }) {
```

```tsx
              <Claimant key={s.id} signupId={s.id} name={s.name} group={s.group} isOrganizer={isOrganizer} />
```

In `components/Board.tsx`, add `isOrganizer = false` to the props/type and pass it to each `TaskCard`:

```tsx
              <TaskCard key={t.id} task={t} index={cardIndex++} isOrganizer={isOrganizer} />
```

- [ ] **Step 10: Read the session on the public board and pass it down**

In `app/[slug]/page.tsx`, read the organizer session and forward it. Add imports:

```tsx
import { cookies } from "next/headers";
import { isValidSession, SESSION_COOKIE } from "@/lib/security/session";
```

Before the final return, compute the flag:

```tsx
  const isOrganizer = isValidSession((await cookies()).get(SESSION_COOKIE)?.value);
```

Change the final return to include it:

```tsx
  return <Board eventName={board.name} tasks={tasks} standing={board.standing} isOrganizer={isOrganizer} filter={{ options, activeLabels, covered, total }} />;
```

- [ ] **Step 11: Run the tests and type-check**

Run: `npm test -- components/Claimant.test.tsx && npx tsc --noEmit && npm test`
Expected: the Claimant test PASSES; no type errors; unit suite green.

- [ ] **Step 12: Commit**

```bash
git add lib/repository/signups.ts app/actions/signups.ts components/Claimant.tsx components/TaskCard.tsx components/Board.tsx "app/[slug]/page.tsx" lib/repository/signups.db.test.ts components/Claimant.test.tsx
git commit -m "feat: organizer clear-claim to reopen an abandoned frog"
```

---

### Task 6: "New ongoing board" form on the organizer home

**Files:**
- Create: `components/organize/NewOngoingBoardForm.tsx`
- Modify: `app/organize/page.tsx` (render it beside `NewEventForm`)
- Test: `components/organize/NewOngoingBoardForm.test.tsx`

**Interfaces:**
- Consumes: `createStandingBoardAction` from `@/app/actions/organize`; `useRouter` from `next/navigation`.
- Produces: `NewOngoingBoardForm(): JSX.Element` (name input + submit; on success routes to `/organize/<id>`).

- [ ] **Step 1: Write the failing component test**

Create `components/organize/NewOngoingBoardForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { NewOngoingBoardForm } from "@/components/organize/NewOngoingBoardForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/app/actions/organize", () => ({ createStandingBoardAction: vi.fn() }));

test("renders a name field and a create button", () => {
  render(<NewOngoingBoardForm />);
  expect(screen.getByRole("heading", { name: /ongoing board/i })).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/temple needs/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /create board/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- components/organize/NewOngoingBoardForm.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the form**

Create `components/organize/NewOngoingBoardForm.tsx` (mirrors `NewEventForm`, minus the dates):

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStandingBoardAction } from "@/app/actions/organize";

export function NewOngoingBoardForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createStandingBoardAction(formData);
      if (result.ok) router.push(`/organize/${result.eventId}`);
      else setError(result.error);
    });
  }

  const input = "mt-1 w-full rounded-xl border border-lily-line bg-white px-3 py-2 text-ink outline-none transition focus:border-reed focus:ring-2 focus:ring-reed/30";
  return (
    <form action={onSubmit} className="mt-4 space-y-3 rounded-2xl border border-lily-line bg-lily/40 p-4">
      <h2 className="font-display text-lg font-bold text-ink">New ongoing board</h2>
      <p className="text-xs text-ink-soft">An evergreen list of frogs (chores, supplies) with no dates.</p>
      <label className="block text-sm font-bold text-ink">Board name
        <input name="name" className={input} placeholder="Temple needs" />
      </label>
      {error && <p role="alert" className="text-sm font-medium text-lantern-deep">{error}</p>}
      <button type="submit" disabled={pending}
        className="rounded-xl bg-reed px-4 py-2 font-bold text-white transition hover:bg-reed-deep disabled:opacity-60">
        {pending ? "Creating…" : "Create board"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- components/organize/NewOngoingBoardForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Render it on the organizer home**

In `app/organize/page.tsx`, add the import and render it under `NewEventForm`:

```tsx
import { NewOngoingBoardForm } from "@/components/organize/NewOngoingBoardForm";
```

```tsx
      <EventList events={events} />
      <NewEventForm />
      <NewOngoingBoardForm />
```

- [ ] **Step 6: Type-check and run the unit suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; unit tests pass.

- [ ] **Step 7: Commit**

```bash
git add components/organize/NewOngoingBoardForm.tsx components/organize/NewOngoingBoardForm.test.tsx app/organize/page.tsx
git commit -m "feat: 'New ongoing board' form on the organizer home"
```

---

### Task 7: Suggest existing areas in the grid's Category cell

**Files:**
- Modify: `components/organize/GridRow.tsx` (a `<datalist>` on the Category input)
- Modify: `components/organize/OrganizeGrid.tsx` (compute the area list, pass it down)
- Test: `components/organize/OrganizeGrid.test.tsx`

**Interfaces:**
- Produces: `GridRow` accepts `categorySuggestions?: string[]` and wires the Category `<input>` to a shared `<datalist>`.

- [ ] **Step 1: Write the failing test**

Append to `components/organize/OrganizeGrid.test.tsx` (a render test asserting an existing category becomes a suggestion). If the file mocks the server actions, keep those mocks. Add:

```tsx
test("offers existing categories as datalist suggestions", () => {
  render(<OrganizeGrid
    event={{ id: "e1", name: "Temple", status: "draft", startDate: null, endDate: null, standing: true }}
    initialTasks={[{ id: "t1", kind: "frog", title: "Trim hedges", category: "Grounds", requestedGroup: null,
      neededCount: 1, date: null, startAt: null, endAt: null, dueBy: null, location: null, description: null,
      definitionOfDone: null, pointOfContact: null, position: 1024, signupCount: 0 }]} />);
  const option = document.querySelector('datalist option[value="Grounds"]');
  expect(option).not.toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- components/organize/OrganizeGrid.test.tsx`
Expected: FAIL, no datalist option exists.

- [ ] **Step 3: Add the datalist to `GridRow`**

In `components/organize/GridRow.tsx`, add `categorySuggestions = []` to the props (and its type `categorySuggestions?: string[]`). Give the shared list a stable id and attach it to the Category input. At the top of the returned fragment (before `<tr>`), render the datalist once per row is wasteful; instead render it in `OrganizeGrid` (Step 4) and reference it by id. In `GridRow`, add `list={field === "category" ? "grid-areas" : undefined}` to the cell `<input>`:

```tsx
                <input
                  data-rowkey={row.key}
                  data-field={field}
                  aria-label={`${label}, row ${index + 1}`}
                  aria-invalid={invalid(field) || undefined}
                  aria-describedby={invalid(field) ? `row-problem-${row.key}` : undefined}
                  placeholder={placeholder}
                  list={field === "category" ? "grid-areas" : undefined}
                  value={row.cells[field]}
                  onChange={(e) => onCell(row.key, field, e.target.value)}
                  onKeyDown={onKeyDown}
                  className={`${cellInput} pr-5 ${invalid(field) ? "border-b-2 border-amber" : ""}`}
                />
```

(`categorySuggestions` on `GridRow` is unused after this simplification; drop it from the props and let `OrganizeGrid` own the datalist. Keep `GridRow`'s prop list unchanged.)

- [ ] **Step 4: Render the datalist in `OrganizeGrid`**

In `components/organize/OrganizeGrid.tsx`, compute the distinct categories from current rows and render one datalist with id `grid-areas`. Add, just inside the top-level `<div onPaste={onPaste}>`:

```tsx
      <datalist id="grid-areas">
        {[...new Set(rows.map((r) => r.cells.category.trim()).filter(Boolean))].map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test -- components/organize/OrganizeGrid.test.tsx`
Expected: PASS.

- [ ] **Step 6: Type-check and run the unit suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; unit tests pass.

- [ ] **Step 7: Commit**

```bash
git add components/organize/GridRow.tsx components/organize/OrganizeGrid.tsx components/organize/OrganizeGrid.test.tsx
git commit -m "feat: suggest existing areas in the grid Category cell"
```

---

### Task 8: Due-by render check and final verification

**Files:**
- Test: `lib/domain/time.test.ts` (add a frog `dueBy` assertion if absent)
- No production change expected (verification task).

**Interfaces:** none.

- [ ] **Step 1: Add a due-by rendering test**

`formatWhen` already renders a frog's deadline. Lock it in. Append to `lib/domain/time.test.ts` (reuse the file's task helper; inline shown for clarity):

```ts
import { formatWhen } from "@/lib/domain/time";
import type { BoardTask } from "@/lib/domain/types";

function frogTask(dueBy: Date | null): BoardTask {
  return {
    id: "f", kind: "frog", title: "Printer paper", category: "Office", requestedGroup: null,
    neededCount: 1, date: null, startAt: null, endAt: null, dueBy,
    pointOfContact: null, location: null, definitionOfDone: null,
    position: 0, status: "todo", waiting: false, signups: [],
  };
}

test("a frog shows its deadline, or 'Anytime' when it has none", () => {
  expect(formatWhen(frogTask(new Date("2026-07-25T12:00:00Z")))).toMatch(/^By /);
  expect(formatWhen(frogTask(null))).toBe("Anytime");
});
```

- [ ] **Step 2: Run it**

Run: `npm test -- lib/domain/time.test.ts`
Expected: PASS (behavior already exists; the test documents it).

- [ ] **Step 3: Run both suites, type-check, and lint**

Run: `npm test && npm run test:db && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 4: Axe-check the public board**

Run the repo axe check (`node axe-check.mjs` or the project's documented command) against a published standing board's `/<slug>`.
Expected: zero violations.

- [ ] **Step 5: Manual smoke (record the result)**

Start the app (`npm run dev`), then: at `/organize`, create an ongoing board named "Temple needs"; add a frog "Pick up printer paper" (area "Office", due "by Fri") and "Trim hedges" (area "Grounds"); confirm the Kind cell defaults to Frog and a Shift is rejected; open sign-ups (publish); open `/temple` in a private window and confirm both frogs show with no day header, the area filter works, and `dueBy` reads correctly; grab a frog as a volunteer; back in the organizer's own browser, open `/temple` signed in and clear that claim, confirming the frog reopens.

- [ ] **Step 6: Commit any smoke-driven fixes**

Only if the smoke test surfaced a defect: write the failing test first (return to the relevant task's pattern), then fix, then commit.

- [ ] **Step 7: Commit the verification test**

```bash
git add lib/domain/time.test.ts
git commit -m "test: a frog card shows its due-by deadline"
```

---

## Self-Review

**Spec coverage:**
- `Event.standing` flag + optional dates + migration → Task 1. ✓
- Invariant enforced at the write boundary → Task 1 (nullable schema) + Task 2 (`createStandingBoard` sets no dates; `createEvent` still requires both). ✓
- Standing boards filtered from `listEvents` / `listPublishedEvents` → Task 1. ✓
- Create-a-standing-board action + organizer-home form → Tasks 2, 6. ✓
- New tasks default to frog; shift rejected on a standing board → Task 3. ✓
- Public board hides date furniture and renders undated frogs when `standing` → Task 4 (undated rendering already works via `groupTasksByDay`; header suppression added). ✓
- `dueBy` and area exposed and rendered; create form suggests existing areas → Task 7 (areas) + Task 8 (`dueBy` render, already via `formatWhen`). ✓
- Organizer-gated release to clear an abandoned claim → Task 5. ✓
- Testing: invariant/frog-guard/list-filtering/clear-claim DB tests, undated-render unit test, form component test, axe → Tasks 1, 3, 4, 5, 6, 8. ✓
- Deferred (QR frogs, per-area leads) and Out (fundraising, quantity split, multi-view, toggles, new role/tenant): not built. ✓

**Placeholder scan:** every code step carries complete code; no TBD/TODO. ✓

**Type consistency:** `getEventGrid` returns `standing` (Task 1), consumed by the organizer page → `OrganizeGrid` `GridEvent.standing` (Tasks 1, 3). `getEventBoardByParam` returns `standing` (Task 4), consumed by `app/[slug]/page.tsx` → `Board.standing` (Task 4). `isOrganizer` flows page → `Board` → `TaskCard` → `Claimant` (Task 5) with the same name throughout. `createStandingBoard` (repo) / `createStandingBoardAction` (action) names match across Tasks 2 and 6. `deleteSignupAsOrganizer` (repo) / `organizerReleaseSignup` (action) match across Task 5. ✓

**Deliberate note:** Task 1 bundles the schema change with its nullable-date reader fixes so the task lands with a green `tsc`; a reviewer would not accept the schema while rejecting its mechanical fallout.
