# Signup CSV Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-click CSV download of an event's signups from the organizer header, plus a rule that adult signups must carry an email or a phone.

**Architecture:** A pure CSV domain module (`lib/domain/signupCsv.ts`), a repository read (`getEventSignups`), a session-gated route handler at `/organize/[eventId]/signups.csv`, and a plain-link button component. The contact rule lands in the existing pure validator `validateClaim`.

**Tech Stack:** Next.js App Router route handler (Web `Request`/`Response`, `params` is a Promise), Prisma, Vitest, Tailwind v4 tokens.

**Spec:** `docs/superpowers/specs/2026-07-18-signup-export-design.md`

## Global Constraints

- Strict TDD: failing test first, watch it fail, minimal code, watch it pass, refactor. Commit per task.
- Gate before done: `npm test && npm run test:db && npx tsc --noEmit && npm run lint`.
- No em dash anywhere in prose, code comments, or UI copy.
- Styling uses only globals.css tokens via Tailwind classes (`border-lily-line`, `text-pond`, ...); never a raw hex.
- Times: `Task.date` is a calendar day, format with `timeZone: "UTC"` (matches the board). Instants (`startAt`, `endAt`, `createdAt`) format in `EVENT_TZ` (`America/Los_Angeles`) via helpers in `lib/domain/time.ts`. Never UTC for instants.
- The contact-rule error message, exactly: `Add an email or phone so we can reach you.`
- CSV: CRLF line endings, RFC 4180 quoting, UTF-8 BOM added by the route (not by `toCsv`), formula-injection guard on volunteer-typed cells.
- This checkout's branch `groups-membership-foundation` belongs to another session. All work happens in a worktree on a fresh branch off `main`.

---

### Task 1: Worktree, branch, and design docs

**Files:**
- Create: worktree at `.worktrees/signup-export` (or the location `superpowers:using-git-worktrees` picks), branch `signup-export` off `main`
- Create in worktree: `docs/superpowers/specs/2026-07-18-signup-export-design.md`, `docs/superpowers/plans/2026-07-18-signup-export.md`

**Interfaces:**
- Produces: an isolated checkout every later task runs in. Never run builds or tests in the main checkout.

- [ ] **Step 1: Create the worktree** via the `superpowers:using-git-worktrees` skill, branching `signup-export` from `main` (not from the current branch).

- [ ] **Step 2: Copy the untracked design docs and env files from the main checkout**

```bash
cp /Users/ekraay/claude/volunteer/docs/superpowers/specs/2026-07-18-signup-export-design.md docs/superpowers/specs/
cp /Users/ekraay/claude/volunteer/docs/superpowers/plans/2026-07-18-signup-export.md docs/superpowers/plans/
cp /Users/ekraay/claude/volunteer/.env /Users/ekraay/claude/volunteer/.env.test . 2>/dev/null || true
```

- [ ] **Step 3: Install and verify the baseline**

```bash
npm install && npx prisma generate
npm test && npm run test:db
```
Expected: both suites green before any change. If `.env.test` is missing, stop and ask the user.

- [ ] **Step 4: Commit the docs**

```bash
git add docs/superpowers/specs/2026-07-18-signup-export-design.md docs/superpowers/plans/2026-07-18-signup-export.md
git commit -m "docs(spec,plan): signup CSV export and adult contact rule"
```

---

### Task 2: Adult contact rule in `validateClaim`

**Files:**
- Modify: `lib/domain/claim.ts` (rule), `lib/domain/claim.test.ts` (new tests + 3 fixture updates)
- Modify: `lib/repository/signups.db.test.ts`, `app/actions/signups.db.test.ts` (fixtures)
- Modify: `e2e/board.spec.ts`, `e2e/task-board.spec.ts` (claim flows fill an email)

**Interfaces:**
- Consumes: `validateClaim(input: ClaimInput, slot: SlotInfo): Result<ClaimValue>` in `lib/domain/claim.ts`.
- Produces: the same signature; adult inputs with neither email nor phone now return `{ ok: false, error: "Add an email or phone so we can reach you." }`. Rule ordering: honeypot, name checks, slot-full, email/phone/group format checks, then the contact rule. So a full slot or malformed email still reports its own error first.

- [ ] **Step 1: Write the failing tests** in `lib/domain/claim.test.ts` (inside the existing `describe("validateClaim")`, reusing its `open` slot fixture):

```ts
test("rejects an adult with neither email nor phone", () => {
  expect(validateClaim({ name: "Kenji" }, open)).toEqual({
    ok: false, error: "Add an email or phone so we can reach you.",
  });
});

test("whitespace-only contact counts as none", () => {
  expect(validateClaim({ name: "Kenji", email: "  ", phone: " " }, open)).toEqual({
    ok: false, error: "Add an email or phone so we can reach you.",
  });
});

test("accepts an adult with only a phone", () => {
  const result = validateClaim({ name: "Kenji", phone: "555-0100" }, open);
  expect(result.ok).toBe(true);
});

test("accepts a minor with no contact info", () => {
  const result = validateClaim({ name: "Alex", minor: true }, open);
  expect(result).toEqual({
    ok: true,
    value: { name: "Alex", email: null, phone: null, group: null, minor: true },
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run lib/domain/claim.test.ts`
Expected: the two reject tests FAIL (they currently return ok), the two accept tests pass.

- [ ] **Step 3: Implement the rule** in `lib/domain/claim.ts`, immediately before the final `return { ok: true, ... }`:

```ts
  if (!input.minor && !email && !phone) {
    return { ok: false, error: "Add an email or phone so we can reach you." };
  }
```

(`email` and `phone` are already trimmed to null by `nullIfBlank`, so whitespace-only is covered.)

- [ ] **Step 4: Fix the three now-stale fixtures in `claim.test.ts`**
  - "accepts a trimmed name and normalizes optional fields": add `phone: "555-0100"` to the input and expect `phone: "555-0100"` in the value.
  - The emoji-name test (`"🐸 Kenji 山田"`): add `email: "k@x.com"` to the input.
  - "coerces empty optional strings to null": add `minor: true` to the input (the coercion behavior it covers is unchanged; the minor path keeps it reachable) and expect `minor: true`.

Run: `npx vitest run lib/domain/claim.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Fix the db-test fixtures** (adults claiming without contact):
  - `lib/repository/signups.db.test.ts`: add `phone: "555-0100"` to every `createSignupWithAudit` input at lines 23, 40, 41, 49, 50, 78, 91 (e.g. `{ name: "Kenji", group: "Scouts", phone: "555-0100" }`). The direct `prisma.signup.create` at line 105 bypasses validation; leave it.
  - `app/actions/signups.db.test.ts`: add `fd.set("phone", "555-0100");` to the FormData in "claimSlot persists a signup..." and "releaseSignup removes a signup...". The blank-name and honeypot tests fail earlier than the contact rule; leave them.

Run: `npm run test:db`
Expected: PASS.

- [ ] **Step 6: Keep e2e honest** (they run against the dev DB, so just update the flows, do not run them here):
  - `e2e/board.spec.ts` after `getByLabel(/your name/i).fill("E2E Tester")`: add `await firstCard.getByLabel(/email/i).fill("e2e@example.com");`
  - `e2e/task-board.spec.ts` after the name fill at line 29: add `await dialog.getByLabel(/email/i).fill("e2e@example.com");`

- [ ] **Step 7: Full unit suite, then commit**

```bash
npm test
git add lib/domain/claim.ts lib/domain/claim.test.ts lib/repository/signups.db.test.ts app/actions/signups.db.test.ts e2e/board.spec.ts e2e/task-board.spec.ts
git commit -m "feat(claim): require an email or phone from adult signups"
```

---

### Task 3: Claim form copy

**Files:**
- Modify: `components/ClaimFields.tsx:81-103`, `components/ClaimFields.test.tsx`

**Interfaces:**
- Consumes: the rendered `ClaimFields` form; no signature changes.
- Produces: labels `Email` and `Phone` without "(optional)", one helper line explaining the adult rule.

- [ ] **Step 1: Write the failing test** in `components/ClaimFields.test.tsx`, following the file's existing render helpers:

```tsx
test("asks adults for one way to be reached", () => {
  render(<ClaimFields taskId="t1" />);
  expect(screen.getByText(/add an email or a phone so we can reach you/i)).toBeInTheDocument();
  // Email and Phone labels drop "(optional)"; Group keeps its own.
  expect(screen.getByLabelText("Email")).toBeInTheDocument();
  expect(screen.getByLabelText("Phone")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run components/ClaimFields.test.tsx`
Expected: FAIL, helper text not found.

- [ ] **Step 3: Change the copy** in `components/ClaimFields.tsx`:
  - `Email <span className="font-normal">(optional)</span>` becomes `Email`.
  - `Phone <span className="font-normal">(optional)</span>` becomes `Phone`.
  - The helper line becomes:

```tsx
<p className="text-xs text-ink-soft">Adults: add an email or a phone so we can reach you. We only use it to remind you about your shift.</p>
```

- [ ] **Step 4: Run tests, then commit**

Run: `npx vitest run components/ClaimFields.test.tsx` then `npm test`
Expected: PASS.

```bash
git add components/ClaimFields.tsx components/ClaimFields.test.tsx
git commit -m "feat(claim): form copy asks adults for one contact method"
```

---

### Task 4: CSV domain module

**Files:**
- Create: `lib/domain/signupCsv.ts`, `lib/domain/signupCsv.test.ts`

**Interfaces:**
- Consumes: `formatTime(d: Date): string` and `EVENT_TZ` from `lib/domain/time.ts`; `TaskKind` is the Prisma union `"shift" | "errand"`.
- Produces (Task 6 and 7 rely on these exact names):

```ts
export interface SignupExportRecord {
  taskTitle: string;
  taskKind: "shift" | "errand";
  taskDate: Date | null;
  startAt: Date | null;
  endAt: Date | null;
  category: string | null;
  position: number;
  name: string;
  email: string | null;
  phone: string | null;
  group: string | null;
  minor: boolean | null;
  createdAt: Date;
}
export function signupCsvRows(records: SignupExportRecord[]): string[][]; // header row first
export function toCsv(rows: string[][]): string; // CRLF, RFC 4180, no BOM
```

- [ ] **Step 1: Write the failing tests** in `lib/domain/signupCsv.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { signupCsvRows, toCsv, type SignupExportRecord } from "@/lib/domain/signupCsv";

const base: SignupExportRecord = {
  taskTitle: "Games booth", taskKind: "shift",
  taskDate: new Date("2026-07-25T00:00:00Z"),
  startAt: new Date("2026-07-25T20:00:00Z"), // 1:00 PM PDT
  endAt: new Date("2026-07-25T23:00:00Z"),   // 4:00 PM PDT
  category: "Games", position: 0,
  name: "Kenji Sato", email: "k@x.com", phone: null, group: "Scouts",
  minor: null, createdAt: new Date("2026-07-18T22:30:00Z"), // 3:30 PM PDT
};

describe("signupCsvRows", () => {
  test("header row first, then one row per signup", () => {
    const rows = signupCsvRows([base]);
    expect(rows[0]).toEqual(["Task", "Kind", "Date", "Time", "Category", "Name", "Email", "Phone", "Group", "Minor", "Signed up"]);
    expect(rows).toHaveLength(2);
  });

  test("calendar day stays the stored day; instants render in Pacific local time", () => {
    const [, row] = signupCsvRows([base]);
    expect(row[2]).toBe("2026-07-25");           // UTC calendar day, not shifted to 07-24
    expect(row[3]).toBe("1:00 PM–4:00 PM");      // EVENT_TZ wall clock
    expect(row[10]).toBe("2026-07-18 3:30 PM");  // EVENT_TZ wall clock
  });

  test("kind uses display words and minor shows Yes or blank", () => {
    const rows = signupCsvRows([
      { ...base, taskKind: "errand", minor: true },
      { ...base, name: "Adult", minor: null },
    ]);
    expect(rows[1][1]).toBe("Task");
    expect(rows[1][9]).toBe("Yes");
    expect(rows[2][9]).toBe("");
  });

  test("dateless and timeless tasks leave Date and Time blank", () => {
    const [, row] = signupCsvRows([{ ...base, taskDate: null, startAt: null, endAt: null }]);
    expect(row[2]).toBe("");
    expect(row[3]).toBe("");
  });

  test("orders by task date, start, position, then signup time; dateless tasks last", () => {
    const early = { ...base, name: "A", position: 1 };
    const laterDay = { ...base, name: "B", taskDate: new Date("2026-07-26T00:00:00Z") };
    const standing = { ...base, name: "C", taskDate: null, startAt: null, endAt: null };
    const sameTaskLater = { ...base, name: "D", position: 1, createdAt: new Date("2026-07-19T01:00:00Z") };
    const firstPosition = { ...base, name: "E", position: 0 };
    const names = signupCsvRows([standing, laterDay, sameTaskLater, early, firstPosition]).slice(1).map((r) => r[5]);
    expect(names).toEqual(["E", "A", "D", "B", "C"]);
  });

  test("guards volunteer-typed cells against formula injection", () => {
    const [, row] = signupCsvRows([{ ...base, name: "=HYPERLINK(1)", group: "+Scouts" }]);
    expect(row[5]).toBe("'=HYPERLINK(1)");
    expect(row[8]).toBe("'+Scouts");
    expect(row[0]).toBe("Games booth"); // organizer-typed title untouched
  });
});

describe("toCsv", () => {
  test("quotes cells with commas, quotes, and newlines; joins with CRLF", () => {
    expect(toCsv([["a", "b,c"], ['say "hi"', "x\ny"]])).toBe('a,"b,c"\r\n"say ""hi""","x\ny"');
  });

  test("adds no BOM", () => {
    expect(toCsv([["a"]]).charCodeAt(0)).toBe(97);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run lib/domain/signupCsv.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `lib/domain/signupCsv.ts`:

```ts
import { EVENT_TZ, formatTime } from "@/lib/domain/time";

export interface SignupExportRecord {
  taskTitle: string;
  taskKind: "shift" | "errand";
  taskDate: Date | null;
  startAt: Date | null;
  endAt: Date | null;
  category: string | null;
  position: number;
  name: string;
  email: string | null;
  phone: string | null;
  group: string | null;
  minor: boolean | null;
  createdAt: Date;
}

const HEADER = ["Task", "Kind", "Date", "Time", "Category", "Name", "Email", "Phone", "Group", "Minor", "Signed up"];

// Task.date is a stored calendar day: format in UTC, as the board does.
const DAY_UTC = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" });
// createdAt is an instant: render its local (event-timezone) wall-clock day.
const DAY_LOCAL = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: EVENT_TZ });

const KIND_LABEL = { shift: "Shift", errand: "Task" } as const;

/** Volunteer-typed text opened in spreadsheets: neutralize leading formula triggers. */
function guard(v: string): string {
  return /^[=+\-@]/.test(v) ? `'${v}` : v;
}

function timeRange(startAt: Date | null, endAt: Date | null): string {
  return startAt && endAt ? `${formatTime(startAt)}–${formatTime(endAt)}` : "";
}

function byTaskThenSignup(a: SignupExportRecord, b: SignupExportRecord): number {
  const date = (a.taskDate?.getTime() ?? Infinity) - (b.taskDate?.getTime() ?? Infinity);
  if (date) return date;
  const start = (a.startAt?.getTime() ?? Infinity) - (b.startAt?.getTime() ?? Infinity);
  if (start) return start;
  return a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime();
}

export function signupCsvRows(records: SignupExportRecord[]): string[][] {
  const rows = [...records].sort(byTaskThenSignup).map((r) => [
    r.taskTitle,
    KIND_LABEL[r.taskKind],
    r.taskDate ? DAY_UTC.format(r.taskDate) : "",
    timeRange(r.startAt, r.endAt),
    r.category ?? "",
    guard(r.name),
    guard(r.email ?? ""),
    guard(r.phone ?? ""),
    guard(r.group ?? ""),
    r.minor ? "Yes" : "",
    `${DAY_LOCAL.format(r.createdAt)} ${formatTime(r.createdAt)}`,
  ]);
  return [HEADER, ...rows];
}

function cell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
```
Note on the sort: `Infinity - Infinity` is `NaN`, which sorts as 0 here; two dateless tasks fall through to `startAt` (same NaN-as-0 behavior) and then `position`. If the ordering test fails on this, replace the subtraction lines with explicit null-last compares.

- [ ] **Step 4: Run tests, then commit**

Run: `npx vitest run lib/domain/signupCsv.test.ts` then `npm test`
Expected: PASS. If the `NaN` sort note bites, fix per the note and re-run.

```bash
git add lib/domain/signupCsv.ts lib/domain/signupCsv.test.ts
git commit -m "feat(export): pure CSV rows and serializer for signups"
```

---

### Task 5: Repository read `getEventSignups`

**Files:**
- Modify: `lib/repository/organize.ts` (append the function)
- Test: `lib/repository/organize.db.test.ts` (append tests)

**Interfaces:**
- Consumes: `SignupExportRecord` from `lib/domain/signupCsv.ts`; `prisma` from `@/lib/db`.
- Produces (Task 6 relies on this exact shape):

```ts
export async function getEventSignups(eventId: string): Promise<
  { event: { name: string; slug: string | null }; signups: SignupExportRecord[] } | null
>;
```

- [ ] **Step 1: Write the failing tests**, appended to `lib/repository/organize.db.test.ts` following its existing fixtures (org `org_bcsf`, `resetDb()` in `beforeEach`):

```ts
test("getEventSignups returns null for an unknown event", async () => {
  expect(await getEventSignups("nope")).toBeNull();
});

test("getEventSignups flattens signups with their task fields, this event only", async () => {
  const event = await prisma.event.create({
    data: { name: "Obon", slug: "obon-2026", orgId: "org_bcsf", startDate: new Date(), endDate: new Date() },
  });
  const other = await prisma.event.create({
    data: { name: "Other", orgId: "org_bcsf", startDate: new Date(), endDate: new Date() },
  });
  const task = await prisma.task.create({
    data: {
      eventId: event.id, title: "Games booth", kind: "shift", category: "Games",
      date: new Date("2026-07-25T00:00:00Z"), startAt: new Date("2026-07-25T20:00:00Z"),
      endAt: new Date("2026-07-25T23:00:00Z"), neededCount: 2, position: 3,
    },
  });
  const otherTask = await prisma.task.create({ data: { eventId: other.id, title: "Elsewhere" } });
  await prisma.signup.create({
    data: { taskId: task.id, name: "Kenji", email: "k@x.com", group: "Scouts", minor: true, claimToken: "t1" },
  });
  await prisma.signup.create({ data: { taskId: otherTask.id, name: "Stranger", claimToken: "t2" } });

  const result = await getEventSignups(event.id);
  expect(result).not.toBeNull();
  expect(result!.event).toEqual({ name: "Obon", slug: "obon-2026" });
  expect(result!.signups).toHaveLength(1);
  expect(result!.signups[0]).toMatchObject({
    taskTitle: "Games booth", taskKind: "shift", category: "Games", position: 3,
    name: "Kenji", email: "k@x.com", phone: null, group: "Scouts", minor: true,
  });
  expect(result!.signups[0].createdAt).toBeInstanceOf(Date);
});
```
Add `getEventSignups` to the file's import from `@/lib/repository/organize`.

- [ ] **Step 2: Run and watch them fail**

Run: `npm run test:db -- lib/repository/organize.db.test.ts`
Expected: FAIL, `getEventSignups` is not exported.

- [ ] **Step 3: Implement**, appended to `lib/repository/organize.ts`:

```ts
import type { SignupExportRecord } from "@/lib/domain/signupCsv";

/** Every signup for an event with its task fields, flat, for the CSV export. */
export async function getEventSignups(eventId: string): Promise<
  { event: { name: string; slug: string | null }; signups: SignupExportRecord[] } | null
> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { name: true, slug: true } });
  if (!event) return null;
  const rows = await prisma.signup.findMany({
    where: { task: { eventId } },
    select: {
      name: true, email: true, phone: true, group: true, minor: true, createdAt: true,
      task: { select: { title: true, kind: true, date: true, startAt: true, endAt: true, category: true, position: true } },
    },
  });
  const signups = rows.map((s) => ({
    taskTitle: s.task.title, taskKind: s.task.kind, taskDate: s.task.date,
    startAt: s.task.startAt, endAt: s.task.endAt, category: s.task.category, position: s.task.position,
    name: s.name, email: s.email, phone: s.phone, group: s.group, minor: s.minor, createdAt: s.createdAt,
  }));
  return { event, signups };
}
```
(The `import type` line joins the existing imports at the top of the file; ordering is left to the pure function, so no `orderBy` here.)

- [ ] **Step 4: Run tests, then commit**

Run: `npm run test:db`
Expected: PASS.

```bash
git add lib/repository/organize.ts lib/repository/organize.db.test.ts
git commit -m "feat(export): getEventSignups repository read"
```

---

### Task 6: The route handler

**Files:**
- Create: `app/organize/[eventId]/signups.csv/route.ts`
- Test: `app/organize/[eventId]/signups.csv/route.db.test.ts`

**Interfaces:**
- Consumes: `getEventSignups` (Task 5), `signupCsvRows`/`toCsv` (Task 4), `isValidSession`/`sessionToken`/`SESSION_COOKIE` from `lib/security/session.ts`.
- Produces: `GET /organize/<eventId>/signups.csv`: 200 CSV with BOM for a valid session, redirect to `/organize` without one, 404 for an unknown event.

- [ ] **Step 1: Write the failing tests** in `app/organize/[eventId]/signups.csv/route.db.test.ts`:

```ts
// @vitest-environment node
import { afterAll, beforeEach, expect, test } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";

process.env.ORGANIZER_PASSWORD ??= "test-password";
const { GET } = await import("@/app/organize/[eventId]/signups.csv/route");
const { sessionToken, SESSION_COOKIE } = await import("@/lib/security/session");

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

function request(eventId: string, cookie?: string): [NextRequest, { params: Promise<{ eventId: string }> }] {
  const req = new NextRequest(`http://localhost/organize/${eventId}/signups.csv`, {
    headers: cookie ? { cookie } : {},
  });
  return [req, { params: Promise.resolve({ eventId }) }];
}

test("redirects to /organize without a valid session", async () => {
  const res = await GET(...request("whatever"));
  expect(res.status).toBeGreaterThanOrEqual(300);
  expect(res.status).toBeLessThan(400);
  expect(res.headers.get("location")).toBe("http://localhost/organize");
});

test("404s on an unknown event with a valid session", async () => {
  const res = await GET(...request("nope", `${SESSION_COOKIE}=${sessionToken()}`));
  expect(res.status).toBe(404);
});

test("streams the CSV with BOM, headers, and a data row", async () => {
  const event = await prisma.event.create({
    data: { name: "Obon", slug: "obon-2026", orgId: "org_bcsf", startDate: new Date(), endDate: new Date() },
  });
  const task = await prisma.task.create({ data: { eventId: event.id, title: "Games booth" } });
  await prisma.signup.create({
    data: { taskId: task.id, name: "Kenji", phone: "555-0100", claimToken: "t1" },
  });

  const res = await GET(...request(event.id, `${SESSION_COOKIE}=${sessionToken()}`));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
  expect(res.headers.get("content-disposition")).toBe('attachment; filename="obon-2026-signups.csv"');
  const body = await res.text();
  expect(body.charCodeAt(0)).toBe(0xfeff);
  expect(body).toContain("Task,Kind,Date,Time,Category,Name,Email,Phone,Group,Minor,Signed up");
  expect(body).toContain("Kenji");
  expect(body).toContain("555-0100");
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm run test:db -- app/organize`
Expected: FAIL, route module not found.

- [ ] **Step 3: Implement** `app/organize/[eventId]/signups.csv/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/security/session";
import { getEventSignups } from "@/lib/repository/organize";
import { signupCsvRows, toCsv } from "@/lib/domain/signupCsv";

/** Organizer-only CSV download of every signup for the event. */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ eventId: string }> },
) {
  if (!isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.redirect(new URL("/organize", request.url));
  }
  const { eventId } = await ctx.params;
  const data = await getEventSignups(eventId);
  if (!data) return new NextResponse("Not found", { status: 404 });

  const csv = "\uFEFF" + toCsv(signupCsvRows(data.signups));
  const base = (data.event.slug ?? eventId).replace(/[^a-zA-Z0-9_-]/g, "");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}-signups.csv"`,
    },
  });
}
```

- [ ] **Step 4: Run tests, then commit**

Run: `npm run test:db`
Expected: PASS.

```bash
git add "app/organize/[eventId]/signups.csv"
git commit -m "feat(export): session-gated CSV route for an event's signups"
```

---

### Task 7: The download button in the organizer header

**Files:**
- Create: `components/organize/DownloadSignupsButton.tsx`, `components/organize/DownloadSignupsButton.test.tsx`
- Modify: `app/organize/[eventId]/page.tsx:51-56` (the header row)

**Interfaces:**
- Consumes: the route from Task 6.
- Produces: `DownloadSignupsButton({ eventId }: { eventId: string })`, a plain anchor.

- [ ] **Step 1: Write the failing test** in `components/organize/DownloadSignupsButton.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { DownloadSignupsButton } from "@/components/organize/DownloadSignupsButton";

test("links straight to the event's CSV route", () => {
  render(<DownloadSignupsButton eventId="e1" />);
  const link = screen.getByRole("link", { name: /download signups/i });
  expect(link).toHaveAttribute("href", "/organize/e1/signups.csv");
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run components/organize/DownloadSignupsButton.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `components/organize/DownloadSignupsButton.tsx` (secondary style per the design system: white fill, lily-line border; a plain link so the browser handles the download):

```tsx
export function DownloadSignupsButton({ eventId }: { eventId: string }) {
  return (
    <a
      href={`/organize/${eventId}/signups.csv`}
      className="inline-flex items-center gap-1.5 rounded-xl border border-lily-line bg-white px-3 py-1.5 text-sm font-bold text-pond transition hover:border-reed hover:text-pond-deep"
    >
      <span aria-hidden>⬇️</span> Download signups
    </a>
  );
}
```

- [ ] **Step 4: Wire it into the header** in `app/organize/[eventId]/page.tsx`. Replace the History link's spot with a right-side cluster:

```tsx
<div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
  <h1 className="font-display text-2xl font-extrabold text-ink">🐸 {grid.name}</h1>
  <div className="flex items-center gap-4">
    <DownloadSignupsButton eventId={grid.id} />
    <Link href={`/organize/${grid.id}/history`} className="text-sm font-medium text-pond underline-offset-2 hover:underline">
      History
    </Link>
  </div>
</div>
```
Add the import: `import { DownloadSignupsButton } from "@/components/organize/DownloadSignupsButton";`

- [ ] **Step 5: Run tests, then commit**

Run: `npm test`
Expected: PASS.

```bash
git add components/organize/DownloadSignupsButton.tsx components/organize/DownloadSignupsButton.test.tsx "app/organize/[eventId]/page.tsx"
git commit -m "feat(export): download-signups button in the organizer header"
```

---

### Task 8: Gate, live verification, and finish

**Files:** none new.

- [ ] **Step 1: Full gate**

```bash
npm test && npm run test:db && npx tsc --noEmit && npm run lint
```
Expected: all green. Fix anything that is not before proceeding.

- [ ] **Step 2: Verify the real flow** (the `verify` skill applies): start `npm run dev`, sign in at `/organize`, open an event, click "Download signups", and confirm the file downloads, opens with correct columns, local times, and the BOM renders non-ASCII names. Also confirm an adult claim without contact is rejected on the public board with the exact message, and a minor claim without contact still succeeds.

- [ ] **Step 3: Finish the branch** via the `superpowers:finishing-a-development-branch` skill (PR to `main`). PR title: "Signup CSV export and adult contact rule".
