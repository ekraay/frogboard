# Phase 2 — Organizer Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared-password `/organize` area where an organizer creates events, edits tasks in a spreadsheet-style autosaving grid (paste from Sheets, drag to reorder, expanding rows for prose), and flips an event live with "Open sign-ups".

**Architecture:** Pure domain parsers (`lib/domain/`) → repository write seam (`lib/repository/organize.ts`, transactional, audit-logged) → server actions (`app/actions/organize.ts`, cookie-gated) → client grid components (`components/organize/`). The public board gains a `published` filter and position-based within-day ordering. Spec: `docs/superpowers/specs/2026-06-11-phase-2-organizer-grid-design.md`.

**Scope clarifications (hardened after external review):**
- **Reordering = per-row Move up/down buttons + Alt+↑/↓.** Pointer drag-and-drop is NOT in Phase 2.
- **Delete is deferred, not immediate:** the server delete fires only when the 10 s undo window closes; Undo cancels it and restores the row intact (task id, signups, claim tokens — lossless).
- **Delete-audit rows must outlive their task:** `AuditLog.taskId` becomes nullable with `onDelete: SetNull` (Task 7 Step 0) — the current Cascade would delete the delete-snapshot with the task.
- **Pasted rows autosave:** valid pasted rows persist immediately; unparseable ones stay flagged until fixed.
- **Unsaved rows can be reordered:** their position reconciles on first save (the grid persists the visual order after a create).

**Tech Stack:** Next.js 16 App Router (READ `node_modules/next/dist/docs/` guides before framework code — breaking changes vs training data), Prisma 6 (pinned), Vitest 4 (unit jsdom / `*.db.test.ts` node via `vitest.db.config.ts`), Playwright + @axe-core/playwright, Tailwind v4 Matsuri tokens, eslint-plugin-jsx-a11y.

**Conventions (from Phase 1 — follow exactly):**
- TDD: failing test → verify RED → minimal code → verify GREEN → commit.
- DB tests are `*.db.test.ts`, run `npm run test:db -- <file>`; unit tests run `npx vitest run <file>`.
- Branch: create `phase-2-organizer-grid` off `main`; PR at the end; CI must be green.
- `resetDb()` guard requires a DATABASE_URL containing "test".
- Time: `EVENT_TZ = "America/Los_Angeles"`; `Task.date` is a calendar day stored as UTC midnight; `formatTime` normalizes U+202F to a space.

---

### Task 1: Migration — Event.status, Task.description/position, AuditAction create/delete, backfill, seed

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_phase2_organizer/migration.sql` (generated, then edited)
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull && git checkout -b phase-2-organizer-grid
```

- [ ] **Step 2: Edit the schema**

In `prisma/schema.prisma`, add after the `AuditAction` enum:

```prisma
enum EventStatus {
  draft
  published
}
```

Change the `AuditAction` enum to:

```prisma
enum AuditAction {
  claim
  release
  create
  edit
  move
  delete
  flag
}
```

In `model Event`, add after `endDate DateTime`:

```prisma
  status    EventStatus @default(draft)
```

In `model Task`, add after `definitionOfDone String?`:

```prisma
  description      String?
  position         Int         @default(0)
```

- [ ] **Step 3: Generate the migration without applying, then add backfill SQL**

```bash
npx prisma migrate dev --create-only --name phase2_organizer
```

Open the generated `prisma/migrations/*_phase2_organizer/migration.sql` and append:

```sql
-- Backfill: the live Phase 1 event stays visible on the public board.
UPDATE "Event" SET "status" = 'published';

-- Backfill: positions follow the board's previous chronological order.
UPDATE "Task" t SET "position" = sub.rn * 1024
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "eventId"
    ORDER BY "date" ASC NULLS LAST, "startAt" ASC NULLS LAST, "title" ASC
  ) AS rn
  FROM "Task"
) sub
WHERE t.id = sub.id;
```

- [ ] **Step 4: Apply to dev and test databases**

```bash
npx prisma migrate dev
npm run db:migrate:test
```

Expected: migration applied to both; client regenerated.

- [ ] **Step 5: Update the seed with status + positions**

In `prisma/seed.ts`, change the event create to include `status: "published"`, and add `position` to each task (Games `1024`, Bingo `2048`, Food Service `3072`, paper cups `4096`). Reseed dev:

```bash
npm run db:seed
```

Expected: "Seeded event … with 4 tasks."

- [ ] **Step 6: Verify suites still green, commit**

```bash
npm test && npm run test:db && npx tsc --noEmit
git add prisma && git commit -m "feat: phase 2 schema (event status, task description/position, audit create/delete)"
```

---

### Task 2: Session security — shared-password tokens

**Files:**
- Create: `lib/security/session.ts`
- Test: `lib/security/session.test.ts`
- Modify: `.env.example`, `.env` (local only, gitignored)

- [ ] **Step 1: Write the failing test**

```typescript
// lib/security/session.test.ts
import { afterEach, describe, expect, test, vi } from "vitest";
import { passwordMatches, sessionToken, isValidSession } from "@/lib/security/session";

afterEach(() => vi.unstubAllEnvs());

describe("passwordMatches", () => {
  test("accepts the configured password", () => {
    vi.stubEnv("ORGANIZER_PASSWORD", "lily-pad-42");
    expect(passwordMatches("lily-pad-42")).toBe(true);
  });
  test("rejects a wrong password (any length)", () => {
    vi.stubEnv("ORGANIZER_PASSWORD", "lily-pad-42");
    expect(passwordMatches("nope")).toBe(false);
    expect(passwordMatches("lily-pad-42-but-longer")).toBe(false);
  });
  test("throws when ORGANIZER_PASSWORD is unset", () => {
    vi.stubEnv("ORGANIZER_PASSWORD", "");
    expect(() => passwordMatches("x")).toThrow(/ORGANIZER_PASSWORD/);
  });
});

describe("session tokens", () => {
  test("round-trips and rejects tampering", () => {
    vi.stubEnv("ORGANIZER_PASSWORD", "lily-pad-42");
    const token = sessionToken();
    expect(isValidSession(token)).toBe(true);
    expect(isValidSession(token + "x")).toBe(false);
    expect(isValidSession(undefined)).toBe(false);
  });
  test("rotating the password invalidates old tokens", () => {
    vi.stubEnv("ORGANIZER_PASSWORD", "old");
    const token = sessionToken();
    vi.stubEnv("ORGANIZER_PASSWORD", "new");
    expect(isValidSession(token)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/security/session.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/security/session.ts
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_MESSAGE = "frogboard-organizer-session-v1";

function secret(): string {
  const pw = process.env.ORGANIZER_PASSWORD;
  if (!pw) throw new Error("ORGANIZER_PASSWORD is not set");
  return pw;
}

/** Constant-time compare via fixed-length digests (handles unequal lengths). */
function digestEqual(a: string, b: string): boolean {
  const da = createHash("sha256").update(a).digest();
  const db = createHash("sha256").update(b).digest();
  return timingSafeEqual(da, db);
}

export function passwordMatches(candidate: string): boolean {
  return digestEqual(candidate, secret());
}

/** Deterministic per password — rotating the password signs everyone out. */
export function sessionToken(): string {
  return createHmac("sha256", secret()).update(TOKEN_MESSAGE).digest("hex");
}

export function isValidSession(token: string | undefined): boolean {
  if (!token) return false;
  return digestEqual(token, sessionToken());
}

export const SESSION_COOKIE = "frog_organizer";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // ~30 days
```

- [ ] **Step 4: Verify pass; add env entries; commit**

Run: `npx vitest run lib/security/session.test.ts` → PASS.

Append to `.env.example`:

```
ORGANIZER_PASSWORD="choose-a-strong-shared-password"
```

Append a real value to your local `.env` (gitignored): `ORGANIZER_PASSWORD="local-dev-password"`.

```bash
git add lib/security/session.ts lib/security/session.test.ts .env.example
git commit -m "feat: shared-password session tokens (constant-time, rotation-invalidating)"
```

---

### Task 3: Cell parsers — date, time/range/due-by, need

**Files:**
- Create: `lib/domain/cells.ts`
- Test: `lib/domain/cells.test.ts`

- [ ] **Step 1: Write the failing tests** (dialects come from the three real sheets)

```typescript
// lib/domain/cells.test.ts
import { describe, expect, test } from "vitest";
import { parseDateCell, parseTimeCell, parseNeedCell, type EventCtx } from "@/lib/domain/cells";

const ctx: EventCtx = {
  year: 2026,
  start: { year: 2026, month: 7, day: 24 },
  end: { year: 2026, month: 7, day: 26 },
};

describe("parseDateCell", () => {
  test.each([
    ["7/25", { year: 2026, month: 7, day: 25 }],
    ["7/25/2026", { year: 2026, month: 7, day: 25 }],
    ["Jul 25", { year: 2026, month: 7, day: 25 }],
    ["July 25", { year: 2026, month: 7, day: 25 }],
    ["Sat Jul 25", { year: 2026, month: 7, day: 25 }],
    ["Saturday, July 25", { year: 2026, month: 7, day: 25 }],
  ])("%s", (input, expected) => {
    expect(parseDateCell(input, ctx)).toEqual({ ok: true, value: expected });
  });
  test("weekday alone resolves within the event window", () => {
    // Sat within Jul 24–26 2026 is Jul 25
    expect(parseDateCell("Sat", ctx)).toEqual({ ok: true, value: { year: 2026, month: 7, day: 25 } });
  });
  test("blank is ok-null (undated)", () => {
    expect(parseDateCell("", ctx)).toEqual({ ok: true, value: null });
  });
  test("gibberish fails gently", () => {
    const r = parseDateCell("banana", ctx);
    expect(r.ok).toBe(false);
  });
});

describe("parseTimeCell", () => {
  test("blank → none", () => {
    expect(parseTimeCell("")).toEqual({ ok: true, value: { kind: "none" } });
  });
  test.each([
    ["8:00 AM - 11:00 AM", 480, 660],
    ["8-11am", 480, 660],
    ["10:30 AM- 2:00 PM", 630, 840],
    ["6:30 AM - 3:00 PM", 390, 900],
    ["1:00 PM - 3:00 PM", 780, 900],
  ])("range %s", (input, start, end) => {
    expect(parseTimeCell(input)).toEqual({ ok: true, value: { kind: "range", start, end } });
  });
  test("range infers start meridiem so start precedes end (10-1pm)", () => {
    expect(parseTimeCell("10-1pm")).toEqual({ ok: true, value: { kind: "range", start: 600, end: 780 } });
  });
  test.each([
    ["by 3:00 PM", null, 900],
    ["by 10am", null, 600],
    ["by Sat 10am", "Sat", 600],
    ["by 7/25 10:00 AM", "7/25", 600],
    ["by Sat", "Sat", null],
  ])("due-by %s", (input, dateText, time) => {
    expect(parseTimeCell(input)).toEqual({ ok: true, value: { kind: "dueBy", dateText, time } });
  });
  test("gibberish fails gently", () => {
    expect(parseTimeCell("whenever").ok).toBe(false);
  });
});

describe("parseNeedCell", () => {
  test("blank defaults to 1", () => expect(parseNeedCell("")).toEqual({ ok: true, value: 1 }));
  test("parses integers", () => expect(parseNeedCell(" 4 ")).toEqual({ ok: true, value: 4 }));
  test("rejects zero, negatives, non-numbers", () => {
    expect(parseNeedCell("0").ok).toBe(false);
    expect(parseNeedCell("-2").ok).toBe(false);
    expect(parseNeedCell("four").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/domain/cells.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/domain/cells.ts
// Pure cell parsers for the organizer grid. Dialects observed in real BCSF /
// community sheets. No I/O, no timezone math here (see when.ts).

export interface DateParts { year: number; month: number; day: number }
export interface EventCtx { year: number; start: DateParts; end: DateParts }
export type CellResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type TimeCellValue =
  | { kind: "none" }
  | { kind: "range"; start: number; end: number } // minutes since midnight, wall clock
  | { kind: "start"; start: number }
  | { kind: "dueBy"; dateText: string | null; time: number | null };

const MONTH_NAMES = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
const WEEKDAY_NAMES = ["sun","mon","tue","wed","thu","fri","sat"];

function monthIndex(word: string): number {
  const w = word.toLowerCase().replace(/\.$/, "");
  return MONTH_NAMES.findIndex((m) => w.startsWith(m));
}
function weekdayIndex(word: string): number {
  const w = word.toLowerCase().replace(/[.,]$/, "");
  return WEEKDAY_NAMES.findIndex((d) => w.startsWith(d) && w.length >= 3);
}
function weekdayOf(d: DateParts): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
}
function addDays(d: DateParts, n: number): DateParts {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day) + n * 86_400_000);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}
function validDate(d: DateParts): boolean {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day));
  return t.getUTCMonth() + 1 === d.month && t.getUTCDate() === d.day;
}

export function parseDateCell(text: string, ctx: EventCtx): CellResult<DateParts | null> {
  let t = text.trim();
  if (t === "") return { ok: true, value: null };

  // Strip a leading weekday ("Sat", "Saturday,") when more follows.
  const lead = /^([A-Za-z]+),?\s+(.+)$/.exec(t);
  if (lead && weekdayIndex(lead[1]) >= 0) t = lead[2];

  // m/d or m/d/y
  const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(t);
  if (slash) {
    const year = slash[3] ? (slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3])) : ctx.year;
    const d = { year, month: Number(slash[1]), day: Number(slash[2]) };
    return validDate(d) ? { ok: true, value: d } : { ok: false, error: "That date doesn't exist." };
  }

  // Month-name day ("Jul 25", "July 25")
  const monthDay = /^([A-Za-z]+)\.?\s+(\d{1,2})$/.exec(t);
  if (monthDay) {
    const mi = monthIndex(monthDay[1]);
    if (mi >= 0) {
      const d = { year: ctx.year, month: mi + 1, day: Number(monthDay[2]) };
      return validDate(d) ? { ok: true, value: d } : { ok: false, error: "That date doesn't exist." };
    }
  }

  // Weekday alone → first match inside the event window
  const wi = weekdayIndex(t);
  if (wi >= 0 && !/\s/.test(t)) {
    for (let d = ctx.start, i = 0; i < 60; d = addDays(d, 1), i++) {
      if (weekdayOf(d) === wi) return { ok: true, value: d };
      if (d.year === ctx.end.year && d.month === ctx.end.month && d.day === ctx.end.day) break;
    }
    return { ok: false, error: `No ${t} inside this event's dates.` };
  }

  return { ok: false, error: "Try a date like 'Jul 25' or '7/25'." };
}

interface LooseClock { minutes: number; meridiem: "am" | "pm" | null }

function parseClockLoose(text: string): LooseClock | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/i.exec(text.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  const mer = m[3] ? (m[3].toLowerCase().startsWith("p") ? "pm" : "am") : null;
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  return { minutes: h * 60 + min, meridiem: mer };
}

/** "3:00 PM" → 900; null when unparseable. */
function parseClock(text: string): number | null {
  const c = parseClockLoose(text);
  return c ? c.minutes : null;
}

export function parseTimeCell(text: string): CellResult<TimeCellValue> {
  const t = text.trim();
  if (t === "") return { ok: true, value: { kind: "none" } };

  const by = /^by\s+(.+)$/i.exec(t);
  if (by) {
    const rest = by[1].trim();
    const whole = parseClock(rest);
    if (whole !== null) return { ok: true, value: { kind: "dueBy", dateText: null, time: whole } };
    const words = rest.split(/\s+/);
    for (let i = words.length - 1; i >= 1; i--) {
      const time = parseClock(words.slice(i).join(" "));
      if (time !== null) {
        return { ok: true, value: { kind: "dueBy", dateText: words.slice(0, i).join(" "), time } };
      }
    }
    return { ok: true, value: { kind: "dueBy", dateText: rest, time: null } };
  }

  const range = /^(.+?)\s*[-–—]\s*(.+)$/.exec(t);
  if (range) {
    const a = parseClockLoose(range[1]);
    const b = parseClockLoose(range[2]);
    if (a && b) {
      let start = a.minutes;
      const end = b.minutes;
      // "8-11am": start lacks a meridiem — borrow the end's; if that puts the
      // start at/after the end ("10-1pm"), fall back to the opposite half-day
      // so the shift runs forward (10 AM–1 PM).
      if (a.meridiem === null && b.meridiem !== null) {
        const borrowed = b.meridiem === "pm" && a.minutes < 720 ? a.minutes + 720 : a.minutes;
        start = borrowed < end ? borrowed : a.minutes;
      }
      if (start >= end) return { ok: false, error: "End time must be after start." };
      return { ok: true, value: { kind: "range", start, end } };
    }
  }

  const single = parseClock(t);
  if (single !== null) return { ok: true, value: { kind: "start", start: single } };

  return { ok: false, error: "Try a time like '10:00 AM–1:00 PM' or 'by Sat 10am'." };
}

export function parseNeedCell(text: string): CellResult<number> {
  const t = text.trim();
  if (t === "") return { ok: true, value: 1 };
  if (!/^\d+$/.test(t)) return { ok: false, error: "Needed is a whole number." };
  const n = Number(t);
  if (n < 1 || n > 999) return { ok: false, error: "Needed must be between 1 and 999." };
  return { ok: true, value: n };
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run lib/domain/cells.test.ts`. If the meridiem-inference cases fail, fix the inference block until all listed cases pass (the test matrix is the contract).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/cells.ts lib/domain/cells.test.ts
git commit -m "feat: forgiving cell parsers (date dialects, time ranges, due-by, need)"
```

---

### Task 4: Pacific→UTC combiner

**Files:**
- Create: `lib/domain/when.ts`
- Test: `lib/domain/when.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/domain/when.test.ts
import { describe, expect, test } from "vitest";
import { pacificToUtc, utcMidnight, combineWhen } from "@/lib/domain/when";
import type { EventCtx } from "@/lib/domain/cells";

const ctx: EventCtx = { year: 2026, start: { year: 2026, month: 7, day: 24 }, end: { year: 2026, month: 7, day: 26 } };

describe("pacificToUtc", () => {
  test("PDT: Jul 25 2026 10:00 → 17:00Z", () => {
    expect(pacificToUtc({ year: 2026, month: 7, day: 25 }, 600).toISOString()).toBe("2026-07-25T17:00:00.000Z");
  });
  test("PST: Jan 15 2026 10:00 → 18:00Z", () => {
    expect(pacificToUtc({ year: 2026, month: 1, day: 15 }, 600).toISOString()).toBe("2026-01-15T18:00:00.000Z");
  });
  test("spring-forward gap resolves without crashing (Mar 8 2026 02:30)", () => {
    const d = pacificToUtc({ year: 2026, month: 3, day: 8 }, 150);
    expect(d.toISOString()).toMatch(/^2026-03-08T(09|10):30/);
  });
});

describe("combineWhen", () => {
  test("shift with date + range derives all three timestamps", () => {
    const r = combineWhen("shift", { year: 2026, month: 7, day: 25 }, { kind: "range", start: 600, end: 780 }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.date?.toISOString()).toBe("2026-07-25T00:00:00.000Z");
    expect(r.value.startAt?.toISOString()).toBe("2026-07-25T17:00:00.000Z");
    expect(r.value.endAt?.toISOString()).toBe("2026-07-25T20:00:00.000Z");
    expect(r.value.dueBy).toBeNull();
  });
  test("shift with date only is all-day", () => {
    const r = combineWhen("shift", { year: 2026, month: 7, day: 25 }, { kind: "none" }, ctx);
    expect(r.ok && r.value.startAt === null && r.value.date !== null).toBe(true);
  });
  test("shift with time but no date is an error", () => {
    const r = combineWhen("shift", null, { kind: "range", start: 600, end: 780 }, ctx);
    expect(r).toEqual({ ok: false, field: "date", error: "A timed shift needs a date." });
  });
  test("frog 'by Sat 10am' resolves the weekday inside the event window", () => {
    const r = combineWhen("frog", null, { kind: "dueBy", dateText: "Sat", time: 600 }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.dueBy?.toISOString()).toBe("2026-07-25T17:00:00.000Z");
    expect(r.value.date).toBeNull();
  });
  test("frog 'by 3:00 PM' without a date uses the event's first day", () => {
    const r = combineWhen("frog", null, { kind: "dueBy", dateText: null, time: 900 }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.dueBy?.toISOString()).toBe("2026-07-24T22:00:00.000Z");
  });
  test("frog with a plain range is an error (frogs take deadlines)", () => {
    const r = combineWhen("frog", null, { kind: "range", start: 600, end: 780 }, ctx);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run lib/domain/when.test.ts` → module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/domain/when.ts
// Combines a calendar day + wall-clock Pacific times into stored UTC instants.
// This is the Phase 2 timezone rule: date and times come from the same row, so
// the board's day header can never disagree with the displayed time.
import { EVENT_TZ } from "@/lib/domain/time";
import { parseDateCell, type DateParts, type EventCtx, type TimeCellValue } from "@/lib/domain/cells";

function tzOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

export function pacificToUtc(d: DateParts, minutesSinceMidnight: number): Date {
  const naive = Date.UTC(d.year, d.month - 1, d.day) + minutesSinceMidnight * 60_000;
  let guess = new Date(naive - tzOffsetMinutes(new Date(naive)) * 60_000);
  const second = tzOffsetMinutes(guess);
  if (naive - second * 60_000 !== guess.getTime()) guess = new Date(naive - second * 60_000);
  return guess;
}

export function utcMidnight(d: DateParts): Date {
  return new Date(Date.UTC(d.year, d.month - 1, d.day));
}

export interface TaskWhen {
  date: Date | null;
  startAt: Date | null;
  endAt: Date | null;
  dueBy: Date | null;
}
export type WhenResult =
  | { ok: true; value: TaskWhen }
  | { ok: false; field: "date" | "time"; error: string };

export function combineWhen(
  kind: "shift" | "frog",
  date: DateParts | null,
  time: TimeCellValue,
  ctx: EventCtx,
): WhenResult {
  if (kind === "frog") {
    if (time.kind === "range" || time.kind === "start") {
      return { ok: false, field: "time", error: "Frogs take a deadline — try 'by Sat 10am'." };
    }
    if (time.kind === "none") {
      return { ok: true, value: { date: null, startAt: null, endAt: null, dueBy: null } };
    }
    let day: DateParts | null = date;
    if (time.dateText) {
      const parsed = parseDateCell(time.dateText, ctx);
      if (!parsed.ok || parsed.value === null) {
        return { ok: false, field: "time", error: parsed.ok ? "Missing due date." : parsed.error };
      }
      day = parsed.value;
    }
    if (!day) day = ctx.start;
    const minutes = time.time ?? 23 * 60 + 59; // date-only deadline = end of that day
    return { ok: true, value: { date: null, startAt: null, endAt: null, dueBy: pacificToUtc(day, minutes) } };
  }

  // shift
  if (time.kind === "dueBy") {
    return { ok: false, field: "time", error: "Shifts take a time range — 'by …' is for frogs." };
  }
  if (time.kind !== "none" && !date) {
    return { ok: false, field: "date", error: "A timed shift needs a date." };
  }
  const value: TaskWhen = { date: date ? utcMidnight(date) : null, startAt: null, endAt: null, dueBy: null };
  if (date && time.kind === "range") {
    value.startAt = pacificToUtc(date, time.start);
    value.endAt = pacificToUtc(date, time.end);
  } else if (date && time.kind === "start") {
    value.startAt = pacificToUtc(date, time.start);
  }
  return { ok: true, value };
}
```

- [ ] **Step 4: Verify pass** — `npx vitest run lib/domain/when.test.ts` → PASS (all DST cases).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/when.ts lib/domain/when.test.ts
git commit -m "feat: Pacific wall-clock to UTC combiner (timezone rule by construction)"
```

---

### Task 5: Row mapping + paste utilities

**Files:**
- Create: `lib/domain/gridRow.ts`, `lib/domain/paste.ts`
- Test: `lib/domain/gridRow.test.ts`, `lib/domain/paste.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/domain/gridRow.test.ts
import { describe, expect, test } from "vitest";
import { parseRow, taskToCells, emptyCells, type RawCells } from "@/lib/domain/gridRow";
import type { EventCtx } from "@/lib/domain/cells";

const ctx: EventCtx = { year: 2026, start: { year: 2026, month: 7, day: 24 }, end: { year: 2026, month: 7, day: 26 } };

function cells(overrides: Partial<RawCells>): RawCells {
  return { ...emptyCells(), ...overrides };
}

describe("parseRow", () => {
  test("full shift row parses to repository fields", () => {
    const r = parseRow(cells({
      title: "Games", kind: "shift", date: "Jul 25", need: "5",
      time: "10:00 AM - 1:00 PM", category: "Games", group: "Scouts",
      location: "Inside Gym", description: "Run the booth", definitionOfDone: "Tidy at handover",
      pointOfContact: "Yumi",
    }), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      title: "Games", kind: "shift", neededCount: 5, category: "Games",
      requestedGroup: "Scouts", location: "Inside Gym", description: "Run the booth",
    });
    expect(r.value.startAt?.toISOString()).toBe("2026-07-25T17:00:00.000Z");
  });
  test("empty title is invalid", () => {
    const r = parseRow(cells({ title: "  " }), ctx);
    expect(r).toEqual({ ok: false, field: "title", error: "Every task needs a title." });
  });
  test("bad need reports its field", () => {
    const r = parseRow(cells({ title: "X", need: "lots" }), ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.field).toBe("need");
  });
  test("blank optionals become null", () => {
    const r = parseRow(cells({ title: "X" }), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.category).toBeNull();
    expect(r.value.date).toBeNull();
  });
});

describe("taskToCells round-trip", () => {
  test("a stored shift renders back to editable strings that re-parse identically", () => {
    const stored = {
      title: "Games", kind: "shift" as const, category: "Games", requestedGroup: "Scouts",
      neededCount: 5, date: new Date("2026-07-25T00:00:00Z"),
      startAt: new Date("2026-07-25T17:00:00Z"), endAt: new Date("2026-07-25T20:00:00Z"),
      dueBy: null, location: "Inside Gym", description: null, definitionOfDone: null, pointOfContact: null,
    };
    const c = taskToCells(stored);
    expect(c.date).toBe("Jul 25");
    expect(c.time).toBe("10:00 AM–1:00 PM");
    const r = parseRow(c, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.startAt?.toISOString()).toBe("2026-07-25T17:00:00.000Z");
    expect(r.value.endAt?.toISOString()).toBe("2026-07-25T20:00:00.000Z");
  });
  test("a stored frog renders a 'by …' cell", () => {
    const c = taskToCells({
      title: "Cups", kind: "frog", category: null, requestedGroup: null, neededCount: 1,
      date: null, startAt: null, endAt: null, dueBy: new Date("2026-07-25T17:00:00Z"),
      location: null, description: null, definitionOfDone: null, pointOfContact: null,
    });
    expect(c.time).toBe("by Jul 25 10:00 AM");
  });
});
```

```typescript
// lib/domain/paste.test.ts
import { describe, expect, test } from "vitest";
import { parseTsv, carryForwardColumn } from "@/lib/domain/paste";

describe("parseTsv", () => {
  test("splits rows and cells, dropping a trailing newline", () => {
    expect(parseTsv("a\tb\nc\td\n")).toEqual([["a", "b"], ["c", "d"]]);
  });
  test("handles CRLF", () => {
    expect(parseTsv("a\tb\r\nc\td")).toEqual([["a", "b"], ["c", "d"]]);
  });
});

describe("carryForwardColumn", () => {
  test("fills blank cells from the row above (the sheets' date convention)", () => {
    const rows = [["Sat Jul 25", "Games"], ["", "Bingo"], ["", "Food"], ["Sun Jul 26", "Rice"]];
    expect(carryForwardColumn(rows, 0)).toEqual([
      ["Sat Jul 25", "Games"], ["Sat Jul 25", "Bingo"], ["Sat Jul 25", "Food"], ["Sun Jul 26", "Rice"],
    ]);
  });
  test("leading blanks stay blank", () => {
    expect(carryForwardColumn([["", "a"], ["7/25", "b"]], 0)).toEqual([["", "a"], ["7/25", "b"]]);
  });
});
```

- [ ] **Step 2: Verify failure** — `npx vitest run lib/domain/gridRow.test.ts lib/domain/paste.test.ts` → modules not found.

- [ ] **Step 3: Implement**

```typescript
// lib/domain/gridRow.ts
// Maps raw grid cell strings ⇄ repository task fields. Pure; shared by the
// client grid (instant validation) and the server action (authoritative).
import { parseDateCell, parseNeedCell, parseTimeCell, type EventCtx } from "@/lib/domain/cells";
import { combineWhen } from "@/lib/domain/when";
import { EVENT_TZ, formatTime } from "@/lib/domain/time";

export interface RawCells {
  title: string; kind: string; date: string; need: string; time: string;
  category: string; group: string; location: string;
  description: string; definitionOfDone: string; pointOfContact: string;
}

export function emptyCells(): RawCells {
  return {
    title: "", kind: "shift", date: "", need: "", time: "",
    category: "", group: "", location: "",
    description: "", definitionOfDone: "", pointOfContact: "",
  };
}

export interface ParsedTaskFields {
  title: string; kind: "shift" | "frog";
  category: string | null; requestedGroup: string | null; neededCount: number;
  date: Date | null; startAt: Date | null; endAt: Date | null; dueBy: Date | null;
  location: string | null; description: string | null;
  definitionOfDone: string | null; pointOfContact: string | null;
}

export type RowResult =
  | { ok: true; value: ParsedTaskFields }
  | { ok: false; field: keyof RawCells; error: string };

const nullIfBlank = (s: string) => (s.trim() === "" ? null : s.trim());

export function parseRow(cells: RawCells, ctx: EventCtx): RowResult {
  const title = cells.title.trim();
  if (title === "") return { ok: false, field: "title", error: "Every task needs a title." };
  const kind = cells.kind === "frog" ? "frog" : "shift";

  const need = parseNeedCell(cells.need);
  if (!need.ok) return { ok: false, field: "need", error: need.error };

  const date = parseDateCell(cells.date, ctx);
  if (!date.ok) return { ok: false, field: "date", error: date.error };

  const time = parseTimeCell(cells.time);
  if (!time.ok) return { ok: false, field: "time", error: time.error };

  const when = combineWhen(kind, date.value, time.value, ctx);
  if (!when.ok) return { ok: false, field: when.field, error: when.error };

  return {
    ok: true,
    value: {
      title, kind, neededCount: need.value,
      category: nullIfBlank(cells.category), requestedGroup: nullIfBlank(cells.group),
      location: nullIfBlank(cells.location), description: nullIfBlank(cells.description),
      definitionOfDone: nullIfBlank(cells.definitionOfDone), pointOfContact: nullIfBlank(cells.pointOfContact),
      ...when.value,
    },
  };
}

function monthDayUtc(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
}
function monthDayPacific(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: EVENT_TZ }).format(d);
}

export interface StoredTaskShape {
  title: string; kind: "shift" | "frog"; category: string | null; requestedGroup: string | null;
  neededCount: number; date: Date | null; startAt: Date | null; endAt: Date | null; dueBy: Date | null;
  location: string | null; description: string | null; definitionOfDone: string | null; pointOfContact: string | null;
}

export function taskToCells(t: StoredTaskShape): RawCells {
  let time = "";
  if (t.kind === "frog" && t.dueBy) time = `by ${monthDayPacific(t.dueBy)} ${formatTime(t.dueBy)}`;
  else if (t.startAt && t.endAt) time = `${formatTime(t.startAt)}–${formatTime(t.endAt)}`;
  else if (t.startAt) time = formatTime(t.startAt);
  return {
    title: t.title, kind: t.kind,
    date: t.date ? monthDayUtc(t.date) : "",
    need: String(t.neededCount), time,
    category: t.category ?? "", group: t.requestedGroup ?? "", location: t.location ?? "",
    description: t.description ?? "", definitionOfDone: t.definitionOfDone ?? "",
    pointOfContact: t.pointOfContact ?? "",
  };
}
```

```typescript
// lib/domain/paste.ts
/** Clipboard TSV → rows of cells. The whole "import" is these two functions. */
export function parseTsv(text: string): string[][] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.map((l) => l.split("\t"));
}

/** Sheets convention: a date typed once governs the blank rows beneath it. */
export function carryForwardColumn(rows: string[][], col: number): string[][] {
  let last = "";
  return rows.map((row) => {
    const copy = [...row];
    if ((copy[col] ?? "").trim() === "") {
      if (last !== "") copy[col] = last;
    } else {
      last = copy[col];
    }
    return copy;
  });
}
```

- [ ] **Step 4: Verify pass** — `npx vitest run lib/domain/gridRow.test.ts lib/domain/paste.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/gridRow.ts lib/domain/paste.ts lib/domain/gridRow.test.ts lib/domain/paste.test.ts
git commit -m "feat: row cell mapping (round-trip) and paste utilities (TSV, carry-forward)"
```

---

### Task 6: Repository — organize events

**Files:**
- Create: `lib/repository/organize.ts`
- Test: `lib/repository/organize.db.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/repository/organize.db.test.ts
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import {
  createEvent, listEvents, setEventStatus, getEventGrid,
} from "@/lib/repository/organize";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

describe("events", () => {
  test("createEvent starts as draft", async () => {
    const e = await createEvent("Ginza 2027", new Date("2027-07-24"), new Date("2027-07-26"));
    expect(e.status).toBe("draft");
    expect(e.name).toBe("Ginza 2027");
  });
  test("listEvents returns newest first with task counts", async () => {
    const a = await createEvent("A", new Date(), new Date());
    await prisma.task.create({ data: { eventId: a.id, title: "T", position: 1024 } });
    await createEvent("B", new Date(), new Date());
    const list = await listEvents();
    expect(list.map((e) => e.name)).toEqual(["B", "A"]);
    expect(list[1].taskCount).toBe(1);
  });
  test("setEventStatus flips visibility", async () => {
    const e = await createEvent("A", new Date(), new Date());
    await setEventStatus(e.id, "published");
    expect((await prisma.event.findUnique({ where: { id: e.id } }))!.status).toBe("published");
  });
  test("getEventGrid returns tasks in position order with signup counts", async () => {
    const e = await createEvent("A", new Date("2026-07-24"), new Date("2026-07-26"));
    const t2 = await prisma.task.create({ data: { eventId: e.id, title: "Second", position: 2048 } });
    await prisma.task.create({ data: { eventId: e.id, title: "First", position: 1024 } });
    await prisma.signup.create({ data: { taskId: t2.id, name: "Kenji", claimToken: "tok" } });
    const grid = await getEventGrid(e.id);
    expect(grid!.tasks.map((t) => t.title)).toEqual(["First", "Second"]);
    expect(grid!.tasks[1].signupCount).toBe(1);
  });
});
```

- [ ] **Step 2: Verify failure** — `npm run test:db -- lib/repository/organize.db.test.ts` → module not found.

- [ ] **Step 3: Implement** (task functions arrive in Task 7 — keep this file events-only for now)

```typescript
// lib/repository/organize.ts
import { prisma } from "@/lib/db";
import type { EventStatus } from "@prisma/client";

export async function createEvent(name: string, startDate: Date, endDate: Date) {
  return prisma.event.create({ data: { name, startDate, endDate } });
}

export async function listEvents() {
  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { tasks: true } } },
  });
  return events.map((e) => ({
    id: e.id, name: e.name, startDate: e.startDate, endDate: e.endDate,
    status: e.status, taskCount: e._count.tasks,
  }));
}

export async function setEventStatus(eventId: string, status: EventStatus) {
  return prisma.event.update({ where: { id: eventId }, data: { status } });
}

export interface GridTask {
  id: string; kind: "shift" | "frog"; title: string;
  category: string | null; requestedGroup: string | null; neededCount: number;
  date: Date | null; startAt: Date | null; endAt: Date | null; dueBy: Date | null;
  location: string | null; description: string | null;
  definitionOfDone: string | null; pointOfContact: string | null;
  position: number; signupCount: number;
}

export async function getEventGrid(eventId: string): Promise<
  { id: string; name: string; startDate: Date; endDate: Date; status: EventStatus; tasks: GridTask[] } | null
> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      tasks: {
        orderBy: { position: "asc" },
        include: { _count: { select: { signups: true } } },
      },
    },
  });
  if (!event) return null;
  return {
    id: event.id, name: event.name, startDate: event.startDate, endDate: event.endDate, status: event.status,
    tasks: event.tasks.map((t) => ({
      id: t.id, kind: t.kind, title: t.title, category: t.category,
      requestedGroup: t.requestedGroup, neededCount: t.neededCount,
      date: t.date, startAt: t.startAt, endAt: t.endAt, dueBy: t.dueBy,
      location: t.location, description: t.description,
      definitionOfDone: t.definitionOfDone, pointOfContact: t.pointOfContact,
      position: t.position, signupCount: t._count.signups,
    })),
  };
}
```

- [ ] **Step 4: Verify pass** — `npm run test:db -- lib/repository/organize.db.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/repository/organize.ts lib/repository/organize.db.test.ts
git commit -m "feat: organize repository — event create/list/status, grid read"
```

---

### Task 7: Repository — task upsert/delete/reorder with audit

**Files:**
- Modify: `prisma/schema.prisma` (+ new migration)
- Modify: `lib/repository/organize.ts`
- Modify (tests): `lib/repository/organize.db.test.ts`

- [ ] **Step 0: Make delete-audit rows outlive their task (schema fix)**

The current `AuditLog.taskId` relation is `onDelete: Cascade` — deleting a task
would cascade-delete its own delete snapshot, defeating the audit trail. In
`prisma/schema.prisma`, change the AuditLog task relation to:

```prisma
  taskId    String?
  task      Task?       @relation(fields: [taskId], references: [id], onDelete: SetNull)
```

(Indexes referencing `taskId` stay as they are; existing Phase 1 writes always
set `taskId`, which a nullable column accepts.) Then:

```bash
npx prisma migrate dev --name audit_survives_task_delete
npm run db:migrate:test
npm test && npm run test:db && npx tsc --noEmit
git add prisma && git commit -m "fix: audit logs survive task deletion (taskId SetNull, not Cascade)"
```

- [ ] **Step 1: Add the failing tests** (append to `organize.db.test.ts`)

```typescript
import {
  upsertTaskWithAudit, deleteTaskWithAudit, renumberTasks,
} from "@/lib/repository/organize";
import type { ParsedTaskFields } from "@/lib/domain/gridRow";

function fields(overrides: Partial<ParsedTaskFields>): ParsedTaskFields {
  return {
    title: "Games", kind: "shift", category: null, requestedGroup: null, neededCount: 2,
    date: null, startAt: null, endAt: null, dueBy: null,
    location: null, description: null, definitionOfDone: null, pointOfContact: null,
    ...overrides,
  };
}

describe("upsertTaskWithAudit", () => {
  test("create assigns a position after the last and logs 'create'", async () => {
    const e = await createEvent("A", new Date(), new Date());
    await prisma.task.create({ data: { eventId: e.id, title: "Existing", position: 1024 } });
    const r = await upsertTaskWithAudit(e.id, null, fields({ title: "New" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const task = await prisma.task.findUnique({ where: { id: r.taskId } });
    expect(task!.position).toBe(2048);
    const audit = await prisma.auditLog.findFirst({ where: { taskId: r.taskId } });
    expect(audit!.action).toBe("create");
  });
  test("update preserves signups and logs before/after", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const r = await upsertTaskWithAudit(e.id, null, fields({ title: "Old title" }));
    if (!r.ok) throw new Error("setup");
    await prisma.signup.create({ data: { taskId: r.taskId, name: "Kenji", claimToken: "tok" } });
    const r2 = await upsertTaskWithAudit(e.id, r.taskId, fields({ title: "New title" }));
    expect(r2.ok).toBe(true);
    expect(await prisma.signup.count({ where: { taskId: r.taskId } })).toBe(1);
    const edit = await prisma.auditLog.findFirst({ where: { taskId: r.taskId, action: "edit" } });
    expect((edit!.details as { before: { title: string } }).before.title).toBe("Old title");
  });
  test("refuses to drop needed below current signups", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const r = await upsertTaskWithAudit(e.id, null, fields({ neededCount: 2 }));
    if (!r.ok) throw new Error("setup");
    await prisma.signup.createMany({ data: [
      { taskId: r.taskId, name: "A", claimToken: "t1" },
      { taskId: r.taskId, name: "B", claimToken: "t2" },
    ]});
    const r2 = await upsertTaskWithAudit(e.id, r.taskId, fields({ neededCount: 1 }));
    expect(r2).toEqual({ ok: false, field: "need", error: "2 already signed up — needed can't go below that." });
  });
});

describe("deleteTaskWithAudit", () => {
  test("deletes and snapshots the task including its signups", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const r = await upsertTaskWithAudit(e.id, null, fields({ title: "Doomed" }));
    if (!r.ok) throw new Error("setup");
    await prisma.signup.create({ data: { taskId: r.taskId, name: "Kenji", claimToken: "tok" } });
    const del = await deleteTaskWithAudit(r.taskId);
    expect(del).toEqual({ ok: true });
    expect(await prisma.task.count()).toBe(0);
    const log = await prisma.auditLog.findFirst({ where: { action: "delete" } });
    const details = log!.details as { task: { title: string }; signups: { name: string }[] };
    expect(details.task.title).toBe("Doomed");
    expect(details.signups.map((s) => s.name)).toEqual(["Kenji"]);
  });
  test("the delete audit row outlives the task (SetNull, not Cascade)", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const r = await upsertTaskWithAudit(e.id, null, fields({ title: "Doomed" }));
    if (!r.ok) throw new Error("setup");
    await deleteTaskWithAudit(r.taskId);
    // ALL audit rows for the deleted task survive, detached from it:
    const logs = await prisma.auditLog.findMany({ where: { eventId: e.id } });
    expect(logs.map((l) => l.action).sort()).toEqual(["create", "delete"]);
    expect(logs.every((l) => l.taskId === null)).toBe(true);
    expect(logs.every((l) => l.eventId === e.id)).toBe(true);
  });
});

describe("renumberTasks", () => {
  test("applies the given order as 1024-spaced positions and logs moves", async () => {
    const e = await createEvent("A", new Date(), new Date());
    const a = await prisma.task.create({ data: { eventId: e.id, title: "A", position: 1024 } });
    const b = await prisma.task.create({ data: { eventId: e.id, title: "B", position: 2048 } });
    const r = await renumberTasks(e.id, [b.id, a.id]);
    expect(r.ok).toBe(true);
    expect((await prisma.task.findUnique({ where: { id: b.id } }))!.position).toBe(1024);
    expect((await prisma.task.findUnique({ where: { id: a.id } }))!.position).toBe(2048);
    expect(await prisma.auditLog.count({ where: { action: "move" } })).toBe(2);
  });
});
```

- [ ] **Step 2: Verify failure** — `npm run test:db -- lib/repository/organize.db.test.ts` → new tests FAIL (functions not exported).

- [ ] **Step 3: Implement** (append to `lib/repository/organize.ts`)

```typescript
import type { ParsedTaskFields } from "@/lib/domain/gridRow";

const POSITION_GAP = 1024;

export type UpsertResult =
  | { ok: true; taskId: string }
  | { ok: false; field?: string; error: string };

export async function upsertTaskWithAudit(
  eventId: string,
  taskId: string | null,
  fields: ParsedTaskFields,
): Promise<UpsertResult> {
  return prisma.$transaction(async (tx) => {
    if (taskId === null) {
      const last = await tx.task.aggregate({ where: { eventId }, _max: { position: true } });
      const position = (last._max.position ?? 0) + POSITION_GAP;
      const task = await tx.task.create({ data: { eventId, position, ...fields } });
      await tx.auditLog.create({
        data: { eventId, taskId: task.id, action: "create", details: { after: { ...fields, position } } },
      });
      return { ok: true as const, taskId: task.id };
    }

    const before = await tx.task.findUnique({
      where: { id: taskId },
      include: { _count: { select: { signups: true } } },
    });
    if (!before || before.eventId !== eventId) {
      return { ok: false as const, error: "That task no longer exists." };
    }
    if (fields.neededCount < before._count.signups) {
      return {
        ok: false as const, field: "need",
        error: `${before._count.signups} already signed up — needed can't go below that.`,
      };
    }
    await tx.task.update({ where: { id: taskId }, data: { ...fields } });
    await tx.auditLog.create({
      data: {
        eventId, taskId, action: "edit",
        details: {
          before: {
            title: before.title, kind: before.kind, category: before.category,
            requestedGroup: before.requestedGroup, neededCount: before.neededCount,
            date: before.date, startAt: before.startAt, endAt: before.endAt, dueBy: before.dueBy,
            location: before.location, description: before.description,
            definitionOfDone: before.definitionOfDone, pointOfContact: before.pointOfContact,
          },
          after: { ...fields },
        },
      },
    });
    return { ok: true as const, taskId };
  });
}

export async function deleteTaskWithAudit(taskId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id: taskId }, include: { signups: true } });
    if (!task) return { ok: false as const, error: "That task is already gone." };
    await tx.auditLog.create({
      data: {
        eventId: task.eventId, taskId, action: "delete",
        details: {
          task: {
            title: task.title, kind: task.kind, category: task.category,
            requestedGroup: task.requestedGroup, neededCount: task.neededCount,
            date: task.date, startAt: task.startAt, endAt: task.endAt, dueBy: task.dueBy,
            location: task.location, description: task.description,
            definitionOfDone: task.definitionOfDone, pointOfContact: task.pointOfContact,
            position: task.position,
          },
          signups: task.signups.map((s) => ({
            name: s.name, email: s.email, phone: s.phone, group: s.group, minor: s.minor,
          })),
        },
      },
    });
    await tx.task.delete({ where: { id: taskId } });
    return { ok: true as const };
  });
}

export async function renumberTasks(
  eventId: string,
  orderedIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  return prisma.$transaction(async (tx) => {
    const tasks = await tx.task.findMany({ where: { eventId }, select: { id: true, position: true } });
    const known = new Map(tasks.map((t) => [t.id, t.position]));
    if (orderedIds.length !== tasks.length || orderedIds.some((id) => !known.has(id))) {
      return { ok: false as const, error: "The order didn't match this event's tasks — refresh and retry." };
    }
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      const position = (i + 1) * POSITION_GAP;
      if (known.get(id) !== position) {
        await tx.task.update({ where: { id }, data: { position } });
        await tx.auditLog.create({
          data: { eventId, taskId: id, action: "move", details: { from: known.get(id), to: position } },
        });
      }
    }
    return { ok: true as const };
  });
}
```

Note on the audit `details` JSON: Prisma accepts `Date` objects inside Json writes by serializing to ISO strings — if the type-checker complains, wrap the payload in `JSON.parse(JSON.stringify(payload))`.

- [ ] **Step 4: Verify pass** — `npm run test:db -- lib/repository/organize.db.test.ts` → ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/repository/organize.ts lib/repository/organize.db.test.ts
git commit -m "feat: signup-safe task upsert/delete/reorder with audit snapshots"
```

---

### Task 8: Public board — published filter + position ordering

**Files:**
- Modify: `lib/domain/types.ts` (BoardTask gains `position`)
- Modify: `lib/domain/board.ts` (within-day sort by position)
- Modify: `lib/repository/events.ts` (status filter + position select)
- Modify (tests/fixtures): `lib/domain/board.test.ts`, `lib/domain/time.test.ts`, `components/TaskCard.test.tsx`, `components/Board.test.tsx`

- [ ] **Step 1: Update the board domain test first** — in `lib/domain/board.test.ts`, add `position: 0` to the `task()` fixture defaults, REPLACE the test named "sorts tasks within a day by startAt, timed before all-day" with:

```typescript
  test("sorts tasks within a day by position — the organizer's order is the order", () => {
    const [group] = groupTasksByDay([
      task({ id: "third", position: 3072, startAt: new Date("2026-07-25T15:00:00Z") }),
      task({ id: "first", position: 1024, startAt: new Date("2026-07-25T21:00:00Z") }),
      task({ id: "second", position: 2048, startAt: null }),
    ]);
    expect(group.tasks.map((t) => t.id)).toEqual(["first", "second", "third"]);
  });
```

Also update the characterization test from the exploratory charter if its fixture now requires `position` (add `position: 0`).

- [ ] **Step 2: Verify RED** — `npx vitest run lib/domain/board.test.ts` → the new ordering test FAILS (still sorted by startAt); fixture type errors surface everywhere `BoardTask` is built.

- [ ] **Step 3: Implement**

In `lib/domain/types.ts`, add to `BoardTask`:

```typescript
  position: number;
```

In `lib/domain/board.ts`, replace the `startKey` function and within-group sort with:

```typescript
  for (const g of groups.values()) {
    g.tasks.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  }
```

(Delete the now-unused `startKey`.)

In `lib/repository/events.ts`: add `status: "published"` to the `findFirst` `where`, order tasks by position, and map `position`:

```typescript
  const event = await prisma.event.findFirst({
    where: { status: "published" },
    orderBy: { createdAt: "desc" },
    include: {
      tasks: {
        orderBy: { position: "asc" },
        include: {
          signups: {
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, group: true, minor: true },
          },
        },
      },
    },
  });
```

…and add `position: t.position,` to the task mapping.

- [ ] **Step 4: Fix remaining fixtures** — add `position: 0,` to the `task()` helpers in `lib/domain/time.test.ts`, `components/TaskCard.test.tsx`, `components/Board.test.tsx`.

- [ ] **Step 5: Verify everything green**

```bash
npx tsc --noEmit && npm test && npm run test:db
```

Expected: all green (the repository db tests don't assert board internals; the seeded dev event is already published).

- [ ] **Step 6: Commit**

```bash
git add lib/domain lib/repository/events.ts components
git commit -m "feat: board shows published events; within-day order follows organizer positions"
```

---

### Task 9: Server actions — auth + organize

**Files:**
- Create: `app/actions/organize.ts`
- Test: `app/actions/organize.db.test.ts`

- [ ] **Step 0: Read the framework docs** (AGENTS.md requirement)

Read `node_modules/next/dist/docs/01-app/02-guides/authentication.md` (cookies + server actions sections) — confirm `cookies()` from `next/headers` is async in this Next version and how `set`/`delete` work inside server actions. Adjust the code below if the API differs.

- [ ] **Step 1: Write the failing tests**

```typescript
// app/actions/organize.db.test.ts
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
import {
  signIn, signOut, createEventAction, setEventStatusAction, saveTask, deleteTask, reorderTasks,
} from "@/app/actions/organize";
import { emptyCells } from "@/lib/domain/gridRow";

beforeEach(async () => {
  await resetDb();
  cookieJar.clear();
  vi.stubEnv("ORGANIZER_PASSWORD", "lily-pad-42");
});
afterAll(async () => { await prisma.$disconnect(); });

function authenticate() { cookieJar.set(SESSION_COOKIE, sessionToken()); }

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("signIn", () => {
  test("sets the session cookie on the right password", async () => {
    const r = await signIn(fd({ password: "lily-pad-42" }));
    expect(r).toEqual({ ok: true });
    expect(cookieJar.get(SESSION_COOKIE)).toBe(sessionToken());
  });
  test("rejects a wrong password without setting a cookie", async () => {
    const r = await signIn(fd({ password: "wrong" }));
    expect(r).toEqual({ ok: false, error: "That password doesn't match." });
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });
});

describe("auth gate", () => {
  test("organize actions refuse without a session", async () => {
    const r = await createEventAction(fd({ name: "X", startDate: "2026-08-01", endDate: "2026-08-02" }));
    expect(r).toEqual({ ok: false, error: "Please sign in." });
  });
});

describe("createEventAction + setEventStatusAction", () => {
  test("creates a draft then opens sign-ups", async () => {
    authenticate();
    const r = await createEventAction(fd({ name: "Crab Feed", startDate: "2027-02-01", endDate: "2027-02-01" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const open = await setEventStatusAction(r.eventId, "published");
    expect(open).toEqual({ ok: true });
    expect((await prisma.event.findUnique({ where: { id: r.eventId } }))!.status).toBe("published");
  });
  test("rejects a blank name", async () => {
    authenticate();
    const r = await createEventAction(fd({ name: "  ", startDate: "2027-02-01", endDate: "2027-02-01" }));
    expect(r).toEqual({ ok: false, error: "Give the event a name." });
  });
});

describe("saveTask", () => {
  test("creates a task from raw cells (server-side authoritative parse)", async () => {
    authenticate();
    const e = await prisma.event.create({
      data: { name: "E", startDate: new Date("2026-07-24"), endDate: new Date("2026-07-26") },
    });
    const r = await saveTask({
      eventId: e.id, taskId: null,
      cells: { ...emptyCells(), title: "Games", date: "Jul 25", time: "10:00 AM - 1:00 PM", need: "5" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const task = await prisma.task.findUnique({ where: { id: r.taskId } });
    expect(task!.startAt!.toISOString()).toBe("2026-07-25T17:00:00.000Z");
    expect(task!.neededCount).toBe(5);
  });
  test("returns the parse problem and its field", async () => {
    authenticate();
    const e = await prisma.event.create({
      data: { name: "E", startDate: new Date("2026-07-24"), endDate: new Date("2026-07-26") },
    });
    const r = await saveTask({ eventId: e.id, taskId: null, cells: { ...emptyCells(), title: "X", need: "lots" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.field).toBe("need");
  });
});

describe("deleteTask + reorderTasks", () => {
  test("full lifecycle", async () => {
    authenticate();
    const e = await prisma.event.create({
      data: { name: "E", startDate: new Date("2026-07-24"), endDate: new Date("2026-07-26") },
    });
    const a = await saveTask({ eventId: e.id, taskId: null, cells: { ...emptyCells(), title: "A" } });
    const b = await saveTask({ eventId: e.id, taskId: null, cells: { ...emptyCells(), title: "B" } });
    if (!a.ok || !b.ok) throw new Error("setup");
    expect(await reorderTasks(e.id, [b.taskId, a.taskId])).toEqual({ ok: true });
    expect(await deleteTask(a.taskId)).toEqual({ ok: true });
    expect(await prisma.task.count()).toBe(1);
  });
});
```

- [ ] **Step 2: Verify failure** — `npm run test:db -- app/actions/organize.db.test.ts` → module not found.

- [ ] **Step 3: Implement**

```typescript
// app/actions/organize.ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  passwordMatches, sessionToken, isValidSession, SESSION_COOKIE, SESSION_MAX_AGE,
} from "@/lib/security/session";
import {
  createEvent, setEventStatus, upsertTaskWithAudit, deleteTaskWithAudit, renumberTasks,
} from "@/lib/repository/organize";
import { prisma } from "@/lib/db";
import { parseRow, type RawCells } from "@/lib/domain/gridRow";
import type { DateParts, EventCtx } from "@/lib/domain/cells";

type Ok = { ok: true };
type Err = { ok: false; error: string; field?: string };

async function requireOrganizer(): Promise<Ok | Err> {
  const jar = await cookies();
  if (!isValidSession(jar.get(SESSION_COOKIE)?.value)) return { ok: false, error: "Please sign in." };
  return { ok: true };
}

export async function signIn(formData: FormData): Promise<Ok | Err> {
  const password = String(formData.get("password") ?? "");
  if (!passwordMatches(password)) return { ok: false, error: "That password doesn't match." };
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionToken(), {
    httpOnly: true, sameSite: "lax", path: "/",
    maxAge: SESSION_MAX_AGE, secure: process.env.NODE_ENV === "production",
  });
  return { ok: true };
}

export async function signOut(): Promise<Ok> {
  (await cookies()).delete(SESSION_COOKIE);
  return { ok: true };
}

export async function createEventAction(
  formData: FormData,
): Promise<{ ok: true; eventId: string } | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Give the event a name." };
  const startDate = new Date(String(formData.get("startDate") ?? ""));
  const endDate = new Date(String(formData.get("endDate") ?? ""));
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
    return { ok: false, error: "Check the first and last days." };
  }
  const event = await createEvent(name, startDate, endDate);
  revalidatePath("/organize");
  return { ok: true, eventId: event.id };
}

export async function setEventStatusAction(
  eventId: string,
  status: "draft" | "published",
): Promise<Ok | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  // setEventStatus returns false when the event no longer exists
  const changed = await setEventStatus(eventId, status);
  if (!changed) return { ok: false, error: "That event no longer exists." };
  revalidatePath("/");
  revalidatePath("/organize");
  return { ok: true };
}

function toParts(d: Date): DateParts {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

async function eventCtx(eventId: string): Promise<EventCtx | null> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return null;
  return { year: event.startDate.getUTCFullYear(), start: toParts(event.startDate), end: toParts(event.endDate) };
}

export interface SaveTaskInput { eventId: string; taskId: string | null; cells: RawCells }
export type SaveTaskResult = { ok: true; taskId: string } | Err;

export async function saveTask(input: SaveTaskInput): Promise<SaveTaskResult> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  const ctx = await eventCtx(input.eventId);
  if (!ctx) return { ok: false, error: "That event no longer exists." };
  const parsed = parseRow(input.cells, ctx);
  if (!parsed.ok) return { ok: false, error: parsed.error, field: parsed.field };
  const result = await upsertTaskWithAudit(input.eventId, input.taskId, parsed.value);
  if (!result.ok) return { ok: false, error: result.error, field: result.field };
  revalidatePath("/");
  return { ok: true, taskId: result.taskId };
}

export async function deleteTask(taskId: string): Promise<Ok | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  const result = await deleteTaskWithAudit(taskId);
  if (!result.ok) return result;
  revalidatePath("/");
  return { ok: true };
}

export async function reorderTasks(eventId: string, orderedIds: string[]): Promise<Ok | Err> {
  const gate = await requireOrganizer();
  if (!gate.ok) return gate;
  const result = await renumberTasks(eventId, orderedIds);
  if (!result.ok) return result;
  revalidatePath("/");
  return { ok: true };
}
```

- [ ] **Step 4: Verify pass** — `npm run test:db -- app/actions/organize.db.test.ts` → PASS. Then full suites: `npm test && npm run test:db && npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add app/actions/organize.ts app/actions/organize.db.test.ts
git commit -m "feat: organize server actions — sign-in/out, events, authoritative task save"
```

---

### Task 10: Sign-in + events list screens

**Files:**
- Create: `app/organize/page.tsx`, `components/organize/SignInForm.tsx`, `components/organize/NewEventForm.tsx`
- Test: `components/organize/SignInForm.test.tsx`, `components/organize/NewEventForm.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// components/organize/SignInForm.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const signIn = vi.fn();
vi.mock("@/app/actions/organize", () => ({ signIn: (fd: FormData) => signIn(fd) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { SignInForm } from "@/components/organize/SignInForm";

beforeEach(() => { signIn.mockReset(); refresh.mockReset(); });

test("submits the password and refreshes on success", async () => {
  signIn.mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  render(<SignInForm />);
  await user.type(screen.getByLabelText(/password/i), "lily-pad-42");
  await user.click(screen.getByRole("button", { name: /sign in/i }));
  expect(signIn).toHaveBeenCalledOnce();
  expect(refresh).toHaveBeenCalled();
});

test("shows the error on a wrong password", async () => {
  signIn.mockResolvedValue({ ok: false, error: "That password doesn't match." });
  const user = userEvent.setup();
  render(<SignInForm />);
  await user.type(screen.getByLabelText(/password/i), "nope");
  await user.click(screen.getByRole("button", { name: /sign in/i }));
  expect(await screen.findByText("That password doesn't match.")).toBeInTheDocument();
});
```

```typescript
// components/organize/NewEventForm.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const createEventAction = vi.fn();
vi.mock("@/app/actions/organize", () => ({ createEventAction: (fd: FormData) => createEventAction(fd) }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { NewEventForm } from "@/components/organize/NewEventForm";

beforeEach(() => { createEventAction.mockReset(); push.mockReset(); });

test("creates an event and navigates to its grid", async () => {
  createEventAction.mockResolvedValue({ ok: true, eventId: "e1" });
  const user = userEvent.setup();
  render(<NewEventForm />);
  await user.type(screen.getByLabelText(/event name/i), "Crab Feed 2027");
  await user.type(screen.getByLabelText(/first day/i), "2027-02-01");
  await user.type(screen.getByLabelText(/last day/i), "2027-02-01");
  await user.click(screen.getByRole("button", { name: /create event/i }));
  expect(createEventAction).toHaveBeenCalledOnce();
  expect(push).toHaveBeenCalledWith("/organize/e1");
});
```

- [ ] **Step 2: Verify failure** — `npx vitest run components/organize` → modules not found.

- [ ] **Step 3: Implement the components**

```tsx
// components/organize/SignInForm.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/app/actions/organize";

export function SignInForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await signIn(formData);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <form action={onSubmit} className="mx-auto mt-16 max-w-sm space-y-4 rounded-3xl border border-lily-line bg-white p-6 shadow-sm">
      <h1 className="font-display text-2xl font-bold text-ink">🐸 Organizers</h1>
      <label className="block text-sm font-bold text-ink">
        Password
        <input
          type="password" name="password" autoFocus autoComplete="current-password"
          className="mt-1 w-full rounded-xl border border-lily-line bg-white px-3 py-2.5 text-ink outline-none transition focus:border-reed focus:ring-2 focus:ring-reed/30"
        />
      </label>
      {error && <p role="alert" className="rounded-lg bg-lantern/10 px-3 py-2 text-sm font-medium text-lantern">{error}</p>}
      <button type="submit" disabled={pending}
        className="w-full rounded-xl bg-reed py-2.5 font-bold text-white transition hover:bg-reed-deep disabled:opacity-60">
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
```

```tsx
// components/organize/NewEventForm.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEventAction } from "@/app/actions/organize";

export function NewEventForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createEventAction(formData);
      if (result.ok) router.push(`/organize/${result.eventId}`);
      else setError(result.error);
    });
  }

  const input = "mt-1 w-full rounded-xl border border-lily-line bg-white px-3 py-2 text-ink outline-none transition focus:border-reed focus:ring-2 focus:ring-reed/30";
  return (
    <form action={onSubmit} className="space-y-3 rounded-2xl border border-lily-line bg-lily/40 p-4">
      <h2 className="font-display text-lg font-bold text-ink">New event</h2>
      <label className="block text-sm font-bold text-ink">Event name
        <input name="name" className={input} placeholder="Ginza Bazaar 2027" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-ink-soft">First day
          <input type="date" name="startDate" className={input} />
        </label>
        <label className="block text-sm font-medium text-ink-soft">Last day
          <input type="date" name="endDate" className={input} />
        </label>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-lantern">{error}</p>}
      <button type="submit" disabled={pending}
        className="rounded-xl bg-reed px-4 py-2 font-bold text-white transition hover:bg-reed-deep disabled:opacity-60">
        {pending ? "Creating…" : "Create event"}
      </button>
    </form>
  );
}
```

```tsx
// app/organize/page.tsx
import { cookies } from "next/headers";
import Link from "next/link";
import { isValidSession, SESSION_COOKIE } from "@/lib/security/session";
import { listEvents } from "@/lib/repository/organize";
import { SignInForm } from "@/components/organize/SignInForm";
import { NewEventForm } from "@/components/organize/NewEventForm";

export const dynamic = "force-dynamic";

export default async function OrganizePage() {
  const jar = await cookies();
  if (!isValidSession(jar.get(SESSION_COOKIE)?.value)) {
    return <main className="px-4"><SignInForm /></main>;
  }
  const events = await listEvents();
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-extrabold text-ink">🐸 Your events</h1>
        <form action={async () => { "use server"; const { signOut } = await import("@/app/actions/organize"); await signOut(); }}>
          <button type="submit" className="text-sm font-medium text-pond underline-offset-2 hover:underline">
            Sign out
          </button>
        </form>
      </div>
      <ul className="mb-8 space-y-3">
        {events.map((e) => (
          <li key={e.id}>
            <Link href={`/organize/${e.id}`}
              className="flex items-center justify-between rounded-2xl border border-lily-line bg-white p-4 shadow-sm transition hover:border-reed">
              <span className="font-bold text-ink">{e.name}</span>
              <span className="flex items-center gap-3 text-sm">
                <span className="text-ink-soft">{e.taskCount} tasks</span>
                {e.status === "published"
                  ? <span className="rounded-full bg-amber/20 px-3 py-1 font-bold text-lantern">🏮 Sign-ups open</span>
                  : <span className="rounded-full bg-lily px-3 py-1 font-bold text-ink-soft">🌱 Draft</span>}
              </span>
            </Link>
          </li>
        ))}
        {events.length === 0 && <li className="text-ink-soft">No events yet — create the first one below.</li>}
      </ul>
      <NewEventForm />
    </main>
  );
}
```

- [ ] **Step 4: Verify** — `npx vitest run components/organize` → PASS; `npx tsc --noEmit` clean. Manual spot-check: `npm run dev`, open `/organize`, sign in with your local password, create a throwaway event.

- [ ] **Step 5: Commit**

```bash
git add app/organize components/organize
git commit -m "feat: organizer sign-in and events list (status chips, inline create)"
```

---

### Task 11: Grid core — render, edit, autosave, expanding row

**Files:**
- Create: `components/organize/OrganizeGrid.tsx`, `components/organize/GridRow.tsx`
- Test: `components/organize/OrganizeGrid.test.tsx`

The grid is a client component owning row state. Row shape:

```typescript
interface RowState {
  key: string;            // stable client key (crypto.randomUUID())
  taskId: string | null;  // null until first successful save
  cells: RawCells;
  signupCount: number;
  state: "saved" | "dirty" | "saving" | "invalid" | "error";
  problem: { field: keyof RawCells; error: string } | null;
  expanded: boolean;
}
```

Column definitions (order from the spec): title, kind (select shift/frog), date, need, time, category, group, location. Prose fields (description, definitionOfDone, pointOfContact) live in the expanding panel. Every input gets `aria-label={`${columnLabel}, row ${index + 1}`}`. Honest `<table>` semantics with `<th scope="col">`.

- [ ] **Step 1: Write the failing tests**

```typescript
// components/organize/OrganizeGrid.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const saveTask = vi.fn();
const deleteTaskAction = vi.fn();
const reorderTasksAction = vi.fn();
const setEventStatusAction = vi.fn();
vi.mock("@/app/actions/organize", () => ({
  saveTask: (i: unknown) => saveTask(i),
  deleteTask: (id: string) => deleteTaskAction(id),
  reorderTasks: (e: string, ids: string[]) => reorderTasksAction(e, ids),
  setEventStatusAction: (e: string, s: string) => setEventStatusAction(e, s),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { OrganizeGrid } from "@/components/organize/OrganizeGrid";
import type { GridTask } from "@/lib/repository/organize";

const event = {
  id: "e1", name: "Ginza", status: "draft" as const,
  startDate: new Date("2026-07-24T00:00:00Z"), endDate: new Date("2026-07-26T00:00:00Z"),
};

function gridTask(overrides: Partial<GridTask>): GridTask {
  return {
    id: "t1", kind: "shift", title: "Games", category: null, requestedGroup: null,
    neededCount: 5, date: new Date("2026-07-25T00:00:00Z"),
    startAt: new Date("2026-07-25T17:00:00Z"), endAt: new Date("2026-07-25T20:00:00Z"),
    dueBy: null, location: null, description: null, definitionOfDone: null,
    pointOfContact: null, position: 1024, signupCount: 0, ...overrides,
  };
}

beforeEach(() => {
  saveTask.mockReset(); deleteTaskAction.mockReset(); reorderTasksAction.mockReset();
});

test("renders tasks as rows with readable cells", () => {
  render(<OrganizeGrid event={event} initialTasks={[gridTask({})]} />);
  expect(screen.getByLabelText("Title, row 1")).toHaveValue("Games");
  expect(screen.getByLabelText("Time, row 1")).toHaveValue("10:00 AM–1:00 PM");
  expect(screen.getByLabelText("Date, row 1")).toHaveValue("Jul 25");
});

test("editing a cell and leaving the row autosaves it", async () => {
  saveTask.mockResolvedValue({ ok: true, taskId: "t1" });
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[gridTask({})]} />);
  const title = screen.getByLabelText("Title, row 1");
  await user.clear(title);
  await user.type(title, "Games Booth");
  await user.click(document.body); // leave the row
  await screen.findByText(/saved/i);
  expect(saveTask).toHaveBeenCalledOnce();
  const input = saveTask.mock.calls[0][0] as { taskId: string; cells: { title: string } };
  expect(input.taskId).toBe("t1");
  expect(input.cells.title).toBe("Games Booth");
});

test("an unparseable cell marks the row and pauses its saving", async () => {
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[gridTask({})]} />);
  const need = screen.getByLabelText("Need, row 1");
  await user.clear(need);
  await user.type(need, "lots");
  await user.click(document.body);
  expect(await screen.findByText(/needs attention/i)).toBeInTheDocument();
  expect(saveTask).not.toHaveBeenCalled();
});

test("expanding a row reveals the prose fields with their question prompts", async () => {
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[gridTask({})]} />);
  const expander = screen.getByRole("button", { name: /details, row 1/i });
  expect(expander).toHaveAttribute("aria-expanded", "false");
  await user.click(expander);
  expect(expander).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByPlaceholderText("What is this about? Why is it important?")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("What does done look like?")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Who can help?")).toBeInTheDocument();
});
```

- [ ] **Step 2: Verify failure** — `npx vitest run components/organize/OrganizeGrid.test.tsx` → module not found.

- [ ] **Step 3: Implement**

```tsx
// components/organize/GridRow.tsx
"use client";

import type { RawCells } from "@/lib/domain/gridRow";

export interface RowState {
  key: string;
  taskId: string | null;
  cells: RawCells;
  signupCount: number;
  state: "saved" | "dirty" | "saving" | "invalid" | "error";
  problem: { field: keyof RawCells; error: string } | null;
  expanded: boolean;
}

export const GRID_COLUMNS: { field: keyof RawCells; label: string; width: string }[] = [
  { field: "title", label: "Title", width: "w-48" },
  { field: "kind", label: "Kind", width: "w-24" },
  { field: "date", label: "Date", width: "w-28" },
  { field: "need", label: "Need", width: "w-16" },
  { field: "time", label: "Time", width: "w-40" },
  { field: "category", label: "Category", width: "w-28" },
  { field: "group", label: "Group", width: "w-28" },
  { field: "location", label: "Location", width: "w-32" },
];

const PROSE_FIELDS: { field: keyof RawCells; label: string; placeholder: string }[] = [
  { field: "description", label: "Description", placeholder: "What is this about? Why is it important?" },
  { field: "definitionOfDone", label: "Definition of done", placeholder: "What does done look like?" },
  { field: "pointOfContact", label: "Point of contact", placeholder: "Who can help?" },
];

export function GridRow({
  row, index, onCell, onToggle, onDelete, onMove, onBlurRow, onFillDown,
}: {
  row: RowState;
  index: number;
  onCell: (key: string, field: keyof RawCells, value: string) => void;
  onToggle: (key: string) => void;
  onDelete: (key: string) => void;
  onMove: (key: string, delta: -1 | 1) => void;
  onBlurRow: (key: string) => void;
  onFillDown: (key: string, field: keyof RawCells) => void;
}) {
  const cellInput =
    "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-ink outline-none transition focus:border-reed focus:ring-1 focus:ring-reed/40";
  const invalid = (field: keyof RawCells) => row.problem?.field === field;

  function onKeyDown(e: React.KeyboardEvent, field: keyof RawCells) {
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      onMove(row.key, e.key === "ArrowUp" ? -1 : 1);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      onFillDown(row.key, field);
    }
  }

  return (
    <>
      <tr
        className={row.state === "invalid" || row.state === "error" ? "bg-amber/10" : undefined}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) onBlurRow(row.key);
        }}
      >
        <td className="whitespace-nowrap px-1 text-center align-middle">
          <button type="button" aria-label={`Move up, row ${index + 1}`}
            onClick={() => onMove(row.key, -1)}
            className="rounded p-0.5 text-ink-soft transition hover:bg-lily">↑</button>
          <button type="button" aria-label={`Move down, row ${index + 1}`}
            onClick={() => onMove(row.key, 1)}
            className="rounded p-0.5 text-ink-soft transition hover:bg-lily">↓</button>
        </td>
        <td className="px-1">
          <button
            type="button"
            aria-expanded={row.expanded}
            aria-controls={`row-details-${row.key}`}
            aria-label={`Details, row ${index + 1}`}
            onClick={() => onToggle(row.key)}
            className="rounded p-1 text-ink-soft transition hover:bg-lily"
          >
            {row.expanded ? "▾" : "▸"}
          </button>
        </td>
        {GRID_COLUMNS.map(({ field, label, width }) =>
          field === "kind" ? (
            <td key={field} className={width}>
              <select
                aria-label={`${label}, row ${index + 1}`}
                value={row.cells.kind}
                onChange={(e) => onCell(row.key, "kind", e.target.value)}
                onKeyDown={(e) => onKeyDown(e, field)}
                className={cellInput}
              >
                <option value="shift">Shift</option>
                <option value="frog">🐸 Frog</option>
              </select>
            </td>
          ) : (
            <td key={field} className={width}>
              <input
                aria-label={`${label}, row ${index + 1}`}
                aria-invalid={invalid(field) || undefined}
                aria-describedby={invalid(field) ? `row-problem-${row.key}` : undefined}
                value={row.cells[field]}
                onChange={(e) => onCell(row.key, field, e.target.value)}
                onKeyDown={(e) => onKeyDown(e, field)}
                className={`${cellInput} ${invalid(field) ? "border-b-2 border-amber" : ""}`}
              />
            </td>
          ),
        )}
        <td className="px-1 text-right text-xs text-ink-soft">
          {row.signupCount > 0 && <span title="signups">👥 {row.signupCount}</span>}
        </td>
        <td className="px-1">
          <button type="button" aria-label={`Delete, row ${index + 1}`} onClick={() => onDelete(row.key)}
            className="rounded p-1 text-ink-soft transition hover:bg-lantern/15 hover:text-lantern">×</button>
        </td>
      </tr>
      {row.problem && (
        <tr><td colSpan={12} id={`row-problem-${row.key}`} className="px-10 pb-1 text-xs font-medium text-lantern">
          ⚠ {row.problem.error}
        </td></tr>
      )}
      {row.expanded && (
        <tr id={`row-details-${row.key}`}>
          <td colSpan={12} className="bg-lily/30 px-10 py-3">
            <div className="grid gap-3 md:grid-cols-3">
              {PROSE_FIELDS.map(({ field, label, placeholder }) => (
                <label key={field} className="block text-xs font-bold text-ink">
                  {label}
                  <textarea
                    rows={3}
                    placeholder={placeholder}
                    value={row.cells[field]}
                    onChange={(e) => onCell(row.key, field, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") onToggle(row.key); }}
                    className="mt-1 w-full rounded-xl border border-lily-line bg-white px-3 py-2 text-sm font-normal text-ink outline-none transition focus:border-reed focus:ring-2 focus:ring-reed/30"
                  />
                </label>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
```

```tsx
// components/organize/OrganizeGrid.tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveTask, deleteTask, reorderTasks, setEventStatusAction } from "@/app/actions/organize";
import { parseRow, taskToCells, emptyCells, type RawCells } from "@/lib/domain/gridRow";
import type { EventCtx } from "@/lib/domain/cells";
import type { GridTask } from "@/lib/repository/organize";
import { parseTsv, carryForwardColumn } from "@/lib/domain/paste";
import { GridRow, GRID_COLUMNS, type RowState } from "@/components/organize/GridRow";

interface GridEvent {
  id: string; name: string; status: "draft" | "published"; startDate: Date; endDate: Date;
}

function toParts(d: Date) {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function OrganizeGrid({ event, initialTasks }: { event: GridEvent; initialTasks: GridTask[] }) {
  const ctx: EventCtx = {
    year: event.startDate.getUTCFullYear(),
    start: toParts(event.startDate), end: toParts(event.endDate),
  };
  const [rows, setRows] = useState<RowState[]>(() =>
    initialTasks.map((t) => ({
      key: crypto.randomUUID(), taskId: t.id, cells: taskToCells(t),
      signupCount: t.signupCount, state: "saved", problem: null, expanded: false,
    })),
  );
  const [status, setStatus] = useState(event.status);
  const [deleted, setDeleted] = useState<
    { row: RowState; index: number; timer: ReturnType<typeof setTimeout> } | null
  >(null);
  const router = useRouter();
  // Always-current rows for async callbacks (order reconciliation after saves).
  const rowsRef = useRef<RowState[]>([]);
  rowsRef.current = rows;

  const update = (key: string, fn: (r: RowState) => RowState) =>
    setRows((rs) => rs.map((r) => (r.key === key ? fn(r) : r)));

  function onCell(key: string, field: keyof RawCells, value: string) {
    update(key, (r) => ({ ...r, cells: { ...r.cells, [field]: value }, state: "dirty", problem: null }));
  }

  function onToggle(key: string) {
    update(key, (r) => ({ ...r, expanded: !r.expanded }));
  }

  async function persistRow(row: RowState) {
    const parsed = parseRow(row.cells, ctx);
    if (!parsed.ok) {
      update(row.key, (r) => ({ ...r, state: "invalid", problem: { field: parsed.field, error: parsed.error } }));
      return;
    }
    update(row.key, (r) => ({ ...r, state: "saving" }));
    const result = await saveTask({ eventId: event.id, taskId: row.taskId, cells: row.cells });
    if (result.ok) {
      update(row.key, (r) => ({ ...r, taskId: result.taskId, state: "saved", problem: null }));
      // A brand-new task is created at the end server-side. If its row isn't
      // last in the grid (it was reordered before saving), persist the visual
      // order so the board reflects where the organizer put it.
      if (row.taskId === null) {
        const order = rowsRef.current
          .map((r) => (r.key === row.key ? result.taskId : r.taskId))
          .filter((id): id is string => id !== null);
        if (order[order.length - 1] !== result.taskId) void reorderTasks(event.id, order);
      }
    } else {
      update(row.key, (r) => ({
        ...r, state: "error",
        problem: { field: (result.field as keyof RawCells) ?? "title", error: result.error },
      }));
    }
  }

  function onBlurRow(key: string) {
    const row = rows.find((r) => r.key === key);
    if (row && row.state === "dirty") void persistRow(row);
  }

  function addRow() {
    setRows((rs) => [...rs, {
      key: crypto.randomUUID(), taskId: null, cells: emptyCells(),
      signupCount: 0, state: "dirty", problem: null, expanded: false,
    }]);
  }

  function duplicateRow() {
    setRows((rs) => {
      const last = rs[rs.length - 1];
      if (!last) return rs;
      return [...rs, {
        key: crypto.randomUUID(), taskId: null, cells: { ...last.cells },
        signupCount: 0, state: "dirty", problem: null, expanded: false,
      }];
    });
  }

  function onFillDown(key: string, field: keyof RawCells) {
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key);
      if (i < 1) return rs;
      const above = rs[i - 1].cells[field];
      return rs.map((r, j) =>
        j === i ? { ...r, cells: { ...r.cells, [field]: above }, state: "dirty", problem: null } : r,
      );
    });
  }

  /** A prior pending delete commits now — one undo window at a time. */
  function flushPendingDelete() {
    setDeleted((d) => {
      if (d) {
        clearTimeout(d.timer);
        if (d.row.taskId) void deleteTask(d.row.taskId);
      }
      return null;
    });
  }

  function onDelete(key: string) {
    const index = rows.findIndex((r) => r.key === key);
    const row = rows[index];
    if (!row) return;
    if (row.signupCount > 0 &&
        !window.confirm(`"${row.cells.title}" has ${row.signupCount} signup(s). Delete it anyway?`)) {
      return;
    }
    flushPendingDelete();
    setRows((rs) => rs.filter((r) => r.key !== key));
    // The server delete is DEFERRED until the undo window closes, so Undo can
    // restore the row intact — task id, signups, claim tokens, everything.
    // (If the tab closes mid-window the delete never fires; the task survives
    // on reload — the safe failure.)
    const timer = setTimeout(() => {
      if (row.taskId) void deleteTask(row.taskId);
      setDeleted(null);
    }, 10_000);
    setDeleted({ row, index, timer });
  }

  function onUndoDelete() {
    setDeleted((d) => {
      if (!d) return null;
      clearTimeout(d.timer);
      setRows((rs) => {
        const copy = [...rs];
        copy.splice(Math.min(d.index, copy.length), 0, d.row);
        return copy;
      });
      return null;
    });
  }

  function onMove(key: string, delta: -1 | 1) {
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= rs.length) return rs;
      const copy = [...rs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      const ids = copy.map((r) => r.taskId).filter((id): id is string => id !== null);
      void reorderTasks(event.id, ids);
      return copy;
    });
  }

  function onPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return; // single-cell paste: default behavior
    e.preventDefault();
    // Pasted blocks map left-to-right onto the grid columns (title, kind,
    // date, need, time, …). Sheets rarely match exactly; cells stay editable.
    const dateCol = GRID_COLUMNS.findIndex((c) => c.field === "date");
    const parsed = carryForwardColumn(parseTsv(text), dateCol);
    const newRows: RowState[] = parsed
      .filter((cells) => cells.some((c) => c.trim() !== ""))
      .map((cells) => {
        const raw = emptyCells();
        GRID_COLUMNS.forEach((col, i) => { if (cells[i] !== undefined) raw[col.field] = cells[i].trim(); });
        if (raw.kind !== "frog") raw.kind = "shift";
        return {
          key: crypto.randomUUID(), taskId: null, cells: raw,
          signupCount: 0, state: "dirty" as const, problem: null, expanded: false,
        };
      });
    setRows((rs) => [...rs, ...newRows]);
    // Pasted rows autosave like typed ones: valid rows persist immediately
    // (sequentially, preserving order); unparseable rows are marked "needs
    // attention" by persistRow and wait for a fix.
    void (async () => {
      for (const r of newRows) await persistRow(r);
    })();
  }

  async function toggleStatus() {
    const next = status === "published" ? "draft" : "published";
    const result = await setEventStatusAction(event.id, next);
    if (result.ok) { setStatus(next); router.refresh(); }
  }

  const saving = rows.some((r) => r.state === "saving");
  const attention = rows.filter((r) => r.state === "invalid" || r.state === "error").length;
  const chip = saving ? "Saving…" : attention > 0
    ? `${attention} row${attention > 1 ? "s" : ""} need${attention === 1 ? "s" : ""} attention`
    : "Saved ✓";

  return (
    <div onPaste={onPaste}>
      <div className={`mb-4 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
        status === "published" ? "border-amber/50 bg-amber/10" : "border-lily-line bg-lily/50"
      }`}>
        <p className="text-sm text-ink">
          {status === "published"
            ? <><strong>🏮 Live</strong> — volunteers see changes as you make them.</>
            : <><strong>🌱 Draft</strong> — only organizers can see this.</>}
        </p>
        <div className="flex items-center gap-3">
          <span aria-live="polite" className="text-sm text-ink-soft">{chip}</span>
          <button type="button" onClick={toggleStatus}
            className="rounded-xl bg-reed px-4 py-2 text-sm font-bold text-white transition hover:bg-reed-deep">
            {status === "published" ? "Close sign-ups" : "Open sign-ups"}
          </button>
        </div>
      </div>

      <div className="mb-2 flex gap-2 text-sm">
        <button type="button" onClick={addRow}
          className="rounded-lg border border-lily-line bg-white px-3 py-1.5 transition hover:border-reed">+ Add row</button>
        <button type="button" onClick={duplicateRow}
          className="rounded-lg border border-lily-line bg-white px-3 py-1.5 transition hover:border-reed">⧉ Duplicate last</button>
        <span className="self-center text-xs text-ink-soft">…or paste rows from your sheet (Ctrl/⌘-D fills a cell down)</span>
      </div>

      <table className="w-full border-separate border-spacing-0 rounded-2xl border border-lily-line bg-white text-left">
        <caption className="sr-only">Tasks for {event.name}</caption>
        <thead>
          <tr className="bg-lily text-xs font-bold uppercase tracking-wide text-ink">
            <th scope="col" className="w-6 rounded-tl-2xl p-2"><span className="sr-only">Reorder</span></th>
            <th scope="col" className="w-8 p-2"><span className="sr-only">Details</span></th>
            {GRID_COLUMNS.map((c) => <th key={c.field} scope="col" className="p-2">{c.label}</th>)}
            <th scope="col" className="p-2"><span className="sr-only">Signups</span></th>
            <th scope="col" className="rounded-tr-2xl p-2"><span className="sr-only">Delete</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <GridRow key={row.key} row={row} index={i}
              onCell={onCell} onToggle={onToggle} onDelete={onDelete}
              onMove={onMove} onBlurRow={onBlurRow} onFillDown={onFillDown} />
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={12} className="p-6 text-center text-sm text-ink-soft">
              Add your tasks — type or paste from your sheet.
            </td></tr>
          )}
        </tbody>
      </table>

      {deleted && (
        <div role="status"
          className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-ink px-4 py-2.5 text-sm text-white shadow-lg">
          Row deleted —
          <button type="button" onClick={onUndoDelete} className="font-bold text-reed underline-offset-2 hover:underline">
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify pass** — `npx vitest run components/organize/OrganizeGrid.test.tsx` → PASS; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add components/organize
git commit -m "feat: organizer grid — autosaving rows, expanding prose, validation states"
```

---

### Task 12: Grid ops — paste, undo, reorder (component tests)

**Files:**
- Modify (tests): `components/organize/OrganizeGrid.test.tsx`

The implementations landed in Task 11; this task locks the behaviors with tests (red first where possible — if a test passes immediately, inspect why and strengthen it until it would catch a regression).

- [ ] **Step 1: Append the tests**

```typescript
test("pasting TSV appends rows with dates carried forward", async () => {
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[]} />);
  await user.click(screen.getByRole("button", { name: /add row/i })); // focus target
  const tsv = "Rice cooking\tshift\tSat Jul 25\t2\t6:30 AM - 3:00 PM\nGrilling\tshift\t\t4\t8-11am";
  const title = screen.getByLabelText("Title, row 1");
  await user.click(title);
  await user.paste(tsv);
  // appended after the manual row: rows 2 and 3
  expect(screen.getByLabelText("Title, row 2")).toHaveValue("Rice cooking");
  expect(screen.getByLabelText("Title, row 3")).toHaveValue("Grilling");
  expect(screen.getByLabelText("Date, row 3")).toHaveValue("Sat Jul 25"); // carried forward
});

test("delete is deferred; undo cancels it and restores the row intact (signups included)", async () => {
  vi.useFakeTimers();
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  render(<OrganizeGrid event={event} initialTasks={[gridTask({})]} />);
  await user.click(screen.getByRole("button", { name: /delete, row 1/i }));
  expect(screen.queryByLabelText("Title, row 1")).toBeNull();
  expect(deleteTaskAction).not.toHaveBeenCalled(); // deferred — nothing destroyed yet
  await user.click(screen.getByRole("button", { name: /undo/i }));
  expect(screen.getByLabelText("Title, row 1")).toHaveValue("Games");
  expect(saveTask).not.toHaveBeenCalled(); // same task id — no re-create needed
  vi.runOnlyPendingTimers();
  expect(deleteTaskAction).not.toHaveBeenCalled(); // undo cancelled the timer
  vi.useRealTimers();
});

test("without undo, the server delete fires when the window closes", async () => {
  vi.useFakeTimers();
  deleteTaskAction.mockResolvedValue({ ok: true });
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  render(<OrganizeGrid event={event} initialTasks={[gridTask({})]} />);
  await user.click(screen.getByRole("button", { name: /delete, row 1/i }));
  expect(deleteTaskAction).not.toHaveBeenCalled();
  vi.advanceTimersByTime(10_000);
  expect(deleteTaskAction).toHaveBeenCalledWith("t1");
  vi.useRealTimers();
});

test("valid pasted rows persist immediately; unparseable ones wait flagged", async () => {
  saveTask.mockResolvedValue({ ok: true, taskId: "t-pasted" });
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[]} />);
  await user.click(screen.getByRole("button", { name: /add row/i }));
  const title = screen.getByLabelText("Title, row 1");
  await user.click(title);
  await user.paste("Rice cooking\tshift\tSat Jul 25\t2\t6:30 AM - 3:00 PM\nMystery\tshift\tJul 25\tlots\t");
  await screen.findByText(/needs attention/i); // the 'lots' row is flagged
  expect(saveTask).toHaveBeenCalledTimes(1); // only the valid pasted row saved
  const input = saveTask.mock.calls[0][0] as { cells: { title: string } };
  expect(input.cells.title).toBe("Rice cooking");
});

test("an unsaved row moved between saved rows lands there when it saves", async () => {
  saveTask.mockResolvedValue({ ok: true, taskId: "t-new" });
  reorderTasksAction.mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[
    gridTask({ id: "t1", title: "First", position: 1024 }),
    gridTask({ id: "t2", title: "Second", position: 2048 }),
  ]} />);
  await user.click(screen.getByRole("button", { name: /add row/i })); // row 3, unsaved
  await user.type(screen.getByLabelText("Title, row 3"), "Middle");
  await user.click(screen.getByRole("button", { name: /move up, row 3/i })); // now row 2
  expect(screen.getByLabelText("Title, row 2")).toHaveValue("Middle");
  await user.click(document.body); // blur → the new row saves
  await screen.findByText(/saved/i);
  // after the create, the grid reconciles the visual order with the server
  expect(reorderTasksAction).toHaveBeenLastCalledWith("e1", ["t1", "t-new", "t2"]);
});

test("deleting a row with signups asks for confirmation first", async () => {
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[gridTask({ signupCount: 2 })]} />);
  await user.click(screen.getByRole("button", { name: /delete, row 1/i }));
  expect(confirmSpy).toHaveBeenCalled();
  expect(screen.getByLabelText("Title, row 1")).toBeInTheDocument(); // declined → stays
  confirmSpy.mockRestore();
});

test("Alt+ArrowUp moves a row and persists the new order", async () => {
  reorderTasksAction.mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[
    gridTask({ id: "t1", title: "First", position: 1024 }),
    gridTask({ id: "t2", title: "Second", position: 2048 }),
  ]} />);
  const second = screen.getByLabelText("Title, row 2");
  await user.click(second);
  await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
  expect(screen.getByLabelText("Title, row 1")).toHaveValue("Second");
  expect(reorderTasksAction).toHaveBeenCalledWith("e1", ["t2", "t1"]);
});

test("Open sign-ups flips the banner to Live", async () => {
  setEventStatusAction.mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[]} />);
  expect(screen.getByText(/draft/i)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /open sign-ups/i }));
  expect(await screen.findByText(/live/i)).toBeInTheDocument();
  expect(setEventStatusAction).toHaveBeenCalledWith("e1", "published");
  expect(screen.getByRole("button", { name: /close sign-ups/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run, fix any gaps** — `npx vitest run components/organize/OrganizeGrid.test.tsx`. Behaviors that fail reveal bugs in Task 11's implementation; fix the component (not the test) until green. Note: `user.paste()` requires the clipboard target to be focused — keep the `await user.click(title)` line.

- [ ] **Step 3: Full unit suite + typecheck** — `npm test && npx tsc --noEmit` → green.

- [ ] **Step 4: Commit**

```bash
git add components/organize/OrganizeGrid.test.tsx components/organize
git commit -m "test: grid ops — paste carry-forward, undo restore, confirm-with-signups, reorder, open sign-ups"
```

---

### Task 13: Grid page wiring

**Files:**
- Create: `app/organize/[eventId]/page.tsx`

- [ ] **Step 1: Implement** (composition only — pieces are individually tested; E2E covers the journey)

```tsx
// app/organize/[eventId]/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isValidSession, SESSION_COOKIE } from "@/lib/security/session";
import { getEventGrid } from "@/lib/repository/organize";
import { OrganizeGrid } from "@/components/organize/OrganizeGrid";

export const dynamic = "force-dynamic";

export default async function OrganizeEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const jar = await cookies();
  if (!isValidSession(jar.get(SESSION_COOKIE)?.value)) redirect("/organize");
  const { eventId } = await params;
  const grid = await getEventGrid(eventId);
  if (!grid) redirect("/organize");

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-extrabold text-ink">🐸 {grid.name}</h1>
        <Link href="/organize" className="text-sm font-medium text-pond underline-offset-2 hover:underline">
          ← All events
        </Link>
      </div>
      <OrganizeGrid
        event={{ id: grid.id, name: grid.name, status: grid.status, startDate: grid.startDate, endDate: grid.endDate }}
        initialTasks={grid.tasks}
      />
    </main>
  );
}
```

Check `node_modules/next/dist/docs/` for the current `params` shape (async `Promise` params shown here is the Next 15+/16 convention — verify).

- [ ] **Step 2: Manual verification**

```bash
npm run build && npm run dev
```

Open `/organize` → sign in → click the seeded Ginza event → grid renders 4 tasks in position order → edit a title, tab away, chip says Saved → check `/` shows the change.

- [ ] **Step 3: Full gates + commit**

```bash
npm test && npm run test:db && npx tsc --noEmit && npm run lint && npm run build
git add app/organize
git commit -m "feat: grid page wiring under the shared-password gate"
```

---

### Task 14: Accessibility enforcement + E2E journey + CI

**Files:**
- Modify: `eslint.config.mjs`, `playwright.config.ts`, `.github/workflows/ci.yml`
- Create: `e2e/organize.spec.ts`
- Modify: `e2e/board.spec.ts` (add an axe scan)

- [ ] **Step 1: Install tooling**

```bash
npm install -D eslint-plugin-jsx-a11y @axe-core/playwright
```

- [ ] **Step 2: Wire jsx-a11y into the flat eslint config**

In `eslint.config.mjs`, add:

```javascript
import jsxA11y from "eslint-plugin-jsx-a11y";
```

…and append `jsxA11y.flatConfigs.recommended` to the exported config array (before any overrides). Run `npm run lint`; fix every violation it reports in `app/` and `components/` (typical: missing labels, redundant roles). Do not disable rules — fix the markup.

- [ ] **Step 3: Add the axe scan to the existing board E2E**

In `e2e/board.spec.ts`, add:

```typescript
import AxeBuilder from "@axe-core/playwright";

test("public board has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
```

Run `npm run db:seed && npm run build && npm run test:e2e`. **If axe reports contrast violations in the Matsuri palette, adjust the offending token values in `app/globals.css`** (darken `--color-ink-soft` / `--color-lantern` as needed to reach 4.5:1) and re-run until clean — keep the hue, fix the lightness.

- [ ] **Step 4: Write the organizer E2E journey**

```typescript
// e2e/organize.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PASSWORD = process.env.ORGANIZER_PASSWORD ?? "test-organizer-pw";

test("organizer sets up an event and opens sign-ups", async ({ page }) => {
  await page.goto("/organize");
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.getByLabel(/event name/i).fill("E2E Matsuri");
  await page.getByLabel(/first day/i).fill("2026-08-01");
  await page.getByLabel(/last day/i).fill("2026-08-02");
  await page.getByRole("button", { name: /create event/i }).click();

  await expect(page.getByText(/draft — only organizers/i)).toBeVisible();

  await page.getByRole("button", { name: /add row/i }).click();
  await page.getByLabel("Title, row 1").fill("Lantern setup");
  await page.getByLabel("Date, row 1").fill("Aug 1");
  await page.getByLabel("Time, row 1").fill("9:00 AM - 11:00 AM");
  await page.getByLabel("Need, row 1").fill("3");
  // Click outside the row to blur it → autosave. (Tabbing isn't enough: the
  // next focusable element is the row's own delete button, still inside it.)
  await page.getByRole("heading", { name: /E2E Matsuri/ }).click();
  await expect(page.getByText("Saved ✓")).toBeVisible();

  // a11y scan of the grid while we're here
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);

  await page.getByRole("button", { name: /open sign-ups/i }).click();
  await expect(page.getByText(/live — volunteers/i)).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("E2E Matsuri")).toBeVisible();
  await expect(page.getByText("Lantern setup")).toBeVisible();

  // close sign-ups → the board falls back to the seeded published event
  await page.goto("/organize");
  await page.getByRole("link", { name: /E2E Matsuri/ }).click();
  await page.getByRole("button", { name: /close sign-ups/i }).click();
  await page.goto("/");
  await expect(page.getByText("E2E Matsuri")).not.toBeVisible();
});
```

- [ ] **Step 5: Playwright + CI env**

In `playwright.config.ts`, give the web server the password:

```typescript
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...process.env, ORGANIZER_PASSWORD: process.env.ORGANIZER_PASSWORD ?? "test-organizer-pw" },
  },
```

In `.github/workflows/ci.yml`, add to the **e2e job's** `env:` block:

```yaml
      ORGANIZER_PASSWORD: test-organizer-pw
```

- [ ] **Step 6: Run the full local gate**

```bash
npm run db:seed && npm run build && npm run test:e2e
npm test && npm run test:db && npm run lint && npx tsc --noEmit
```

All green. (The E2E run leaves an "E2E Matsuri" draft event in the dev DB — `npm run db:seed` wipes it whenever you want a clean slate.)

- [ ] **Step 7: Commit, push, PR**

```bash
git add eslint.config.mjs playwright.config.ts .github/workflows/ci.yml e2e package.json package-lock.json app components
git commit -m "feat: a11y enforcement (jsx-a11y + axe) and organizer E2E journey"
git push -u origin phase-2-organizer-grid
gh pr create --base main --title "Phase 2: organizer grid, events, open sign-ups" --body "Spec: docs/superpowers/specs/2026-06-11-phase-2-organizer-grid-design.md"
gh run watch --exit-status
```

CI green → merge (merge commit, per repo convention). **Manual post-merge step for the user:** add `ORGANIZER_PASSWORD` to Vercel's Production env vars before using `/organize` in production.

---

## Definition of Done (Phase 2)

- [ ] CI green on `main` (lint incl. jsx-a11y + unit + integration + build + E2E incl. axe)
- [ ] `/organize` rejects without the password; grid unreachable signed-out
- [ ] Public board shows only published events; closing sign-ups hides the event
- [ ] A row autosaves on blur; chip reflects Saving/Saved/attention; failed saves keep text
- [ ] Pasting a Ginza-style block appends rows with dates carried forward; valid pasted rows reach the DB with no further interaction, invalid ones are flagged
- [ ] Reordering (Move buttons + Alt+↑/↓) persists and the public board renders the organizer's within-day order; a row reordered before its first save lands in the right position once saved
- [ ] Editing a task with signups preserves them; needed cannot drop below signups; delete with signups confirms and audit-snapshots
- [ ] The delete-audit row outlives its task (`AuditLog.taskId` SetNull — verified by a DB test)
- [ ] Timed tasks can never show a day header that disagrees with their times (date derived from the same row)
- [ ] Undo restores a deleted row intact — signups and claim tokens included — because the server delete fires only after the ~10 s window closes
- [ ] axe reports zero WCAG 2.1 A/AA violations on board, sign-in, events, and grid pages

## Known debt carried forward

- Session Ctrl+Z undo stack and audit-log revert UI → Phase 4 (per spec).
- Pointer drag-and-drop reordering — explicitly NOT in Phase 2; Move up/down buttons + Alt+↑/↓ ship now. Add DnD when an organizer asks.
- A deferred delete is dropped by a hard navigation mid-window (the task survives on reload — the safe failure). Acceptable; revisit only if organizers report confusion.
- `beforeunload` warning for a dirty focused row — future polish.
- Kanban / roster / report lenses / CSV → Phase 3.
