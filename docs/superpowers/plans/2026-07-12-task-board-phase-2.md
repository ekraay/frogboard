# Task Board Phase 2 (filter flyout + shareable links) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a filter flyout to the volunteer board whose state rides in the URL, so any filtered view (for example one group's tasks) is a copy-and-send link, plus a chip bar for active filters and a derived "needs most help" badge.

**Architecture:** The page parses the query string into `BoardFilters` and passes them, the full task list, and one server clock (`nowMs`) to the client `TaskBoard`. Filtering runs client-side over data already in the browser (instant), and the client mirrors filter state back into the URL via `history.replaceState`. All filter rules live in one pure, DOM-free unit (`lib/domain/boardFilters.ts`) built on the primitives already in `lib/domain/board.ts`. No schema change; reads still reuse `getEventBoardByParam`.

**Tech Stack:** Next.js App Router (modified; read `node_modules/next/dist/docs/` before changing routes), React client components, Tailwind v4 `@theme` tokens in `app/globals.css`, Vitest (jsdom unit; node `*.db.test.ts`), Playwright + axe (`e2e/`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-12-task-board-phase-2-design.md`.
- Source every color and font from the existing `@theme` tokens in `app/globals.css` ("Matsuri at Dusk"). The board is mobile-first.
- Filter semantics: **OR within a section, AND across sections.** `keyword` is a case-insensitive substring of the title. `group`/`category`/`location` match the task field trimmed and case-insensitively, internal spaces significant (reuse `fieldEq`). `date` matches the task's calendar day (reuse `tzIsoDate`). `dueSoon` keeps tasks whose deadline-or-day is on or before the calendar day three days out, counted in whole days, overdue included.
- `now` is always passed into domain functions, never read from the clock inside them, so tests are deterministic and SSR/hydration read one instant.
- Query serialization uses **repeated keys, never comma-joined values**, so a value containing a comma (e.g. a category "Food, Drink") round-trips. Keys: `group`, `category`, `location`, `date` (the `date` key is shared with the legacy `/[slug]` board), keyword as `q`, `dueSoon` as `due=soon`. `parseBoardFilters` accepts Next's `string | string[]`, never throws, ignores unknown/empty keys, and `filtersToQuery(emptyFilters())` is `""`.
- No schema change. No repository change. No new flag (the route flag is already on in production). `/[slug]` and `/organize` stay unchanged.
- Reuse, do not fork: `partitionByAvailability`, `getSlotInfo`, `facetOptions`, `fieldEq`, `tzIsoDate` all live in `board.ts`; `boardFilters.ts` imports them.
- **OPEN DECISION (provisional in this plan):** the derived badge's meaning ("most urgent" = soonest deadline vs "biggest gap" = largest unfilled need), whether it ships as one badge or two flyout filters, and the exact label. This plan implements `mostNeededId` deadline-first per the spec and labels the badge "⭐ Most urgent", both isolated behind one function and one label constant so a change is small. A human resolves this before Task 6 ships; if the answer changes, only `mostNeededId`'s comparator and the `MOST_NEEDED_LABEL` constant change.
- Before done: `npm test`, `npm run test:db`, `npx tsc --noEmit`, `npm run lint`, and the e2e suite all green.

---

### Task 1: Filter model and matching (`boardFilters.ts` part 1) + export primitives

**Files:**
- Modify: `lib/domain/board.ts` (export the private `fieldEq` and `tzIsoDate`)
- Create: `lib/domain/boardFilters.ts`
- Test: `lib/domain/boardFilters.test.ts`

**Interfaces:**
- Consumes: `fieldEq(actual: string | null, wanted: string): boolean` and `tzIsoDate(d: Date): string` from `board.ts`; `BoardTask` from `lib/domain/types`.
- Produces: `interface BoardFilters { keyword: string; group: string[]; category: string[]; location: string[]; date: string[]; dueSoon: boolean }`; `emptyFilters(): BoardFilters`; `hasAnyFilter(f: BoardFilters): boolean`; `effectiveWhen(task: BoardTask): Date | null`; `isDueSoon(task: BoardTask, now: Date): boolean`; `applyBoardFilters(tasks: BoardTask[], f: BoardFilters, now: Date): BoardTask[]`.

- [ ] **Step 1: Export the two primitives from `board.ts`**

In `lib/domain/board.ts`, add `export` to the two currently-private function declarations (no other change):

```ts
export function fieldEq(actual: string | null, wanted: string): boolean {
  return (actual ?? "").trim().toLowerCase() === wanted.trim().toLowerCase();
}
```

```ts
export function tzIsoDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}
```

- [ ] **Step 2: Write the failing tests**

Create `lib/domain/boardFilters.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { BoardTask } from "@/lib/domain/types";
import {
  emptyFilters, hasAnyFilter, effectiveWhen, isDueSoon, applyBoardFilters,
} from "@/lib/domain/boardFilters";

function task(over: Partial<BoardTask>): BoardTask {
  return {
    id: "t1", kind: "shift", title: "Games", category: null, requestedGroup: null,
    neededCount: 3, date: null, startAt: null, endAt: null, dueBy: null,
    pointOfContact: null, location: null, definitionOfDone: null, status: "todo",
    waiting: false, position: 0, signups: [], ...over,
  };
}
const NOW = new Date("2026-07-22T12:00:00Z"); // Wednesday

test("emptyFilters has no active filter", () => {
  expect(hasAnyFilter(emptyFilters())).toBe(false);
});
test("any populated section is an active filter", () => {
  expect(hasAnyFilter({ ...emptyFilters(), group: ["Scouts"] })).toBe(true);
  expect(hasAnyFilter({ ...emptyFilters(), keyword: "cup" })).toBe(true);
  expect(hasAnyFilter({ ...emptyFilters(), dueSoon: true })).toBe(true);
});

test("effectiveWhen prefers a deadline, then the day, else null", () => {
  const d = new Date("2026-07-25T00:00:00Z");
  const due = new Date("2026-07-23T17:00:00Z");
  expect(effectiveWhen(task({ date: d, dueBy: due }))?.toISOString()).toBe(due.toISOString());
  expect(effectiveWhen(task({ date: d, dueBy: null }))?.toISOString()).toBe(d.toISOString());
  expect(effectiveWhen(task({ date: null, dueBy: null }))).toBeNull();
});

test("isDueSoon: within three calendar days, overdue included, undated never", () => {
  expect(isDueSoon(task({ date: new Date("2026-07-25T00:00:00Z") }), NOW)).toBe(true); // now+3
  expect(isDueSoon(task({ date: new Date("2026-07-26T00:00:00Z") }), NOW)).toBe(false); // now+4
  expect(isDueSoon(task({ date: new Date("2026-07-20T00:00:00Z") }), NOW)).toBe(true); // overdue
  expect(isDueSoon(task({ date: null, dueBy: null }), NOW)).toBe(false);
});
test("isDueSoon counts a dueBy by its calendar day", () => {
  // 2026-07-25 late evening UTC is still the 25th by UTC calendar => within now+3
  expect(isDueSoon(task({ dueBy: new Date("2026-07-25T23:00:00Z") }), NOW)).toBe(true);
});

test("applyBoardFilters: empty filters return all", () => {
  const ts = [task({ id: "a" }), task({ id: "b" })];
  expect(applyBoardFilters(ts, emptyFilters(), NOW).map((t) => t.id)).toEqual(["a", "b"]);
});
test("keyword is a case-insensitive substring of the title", () => {
  const ts = [task({ id: "a", title: "Cup washing" }), task({ id: "b", title: "Games" })];
  expect(applyBoardFilters(ts, { ...emptyFilters(), keyword: "CUP" }, NOW).map((t) => t.id)).toEqual(["a"]);
});
test("group matches trimmed and case-insensitive, internal spaces significant (OR within)", () => {
  const ts = [
    task({ id: "a", requestedGroup: "Troop 29" }),
    task({ id: "b", requestedGroup: "YAO" }),
    task({ id: "c", requestedGroup: "Troop29" }),
  ];
  const got = applyBoardFilters(ts, { ...emptyFilters(), group: [" troop 29 ", "yao"] }, NOW);
  expect(got.map((t) => t.id)).toEqual(["a", "b"]); // "Troop29" excluded: internal space matters
});
test("date matches the task calendar day; AND across sections", () => {
  const ts = [
    task({ id: "a", category: "Food", date: new Date("2026-07-25T00:00:00Z") }),
    task({ id: "b", category: "Food", date: new Date("2026-07-26T00:00:00Z") }),
  ];
  const f = { ...emptyFilters(), category: ["Food"], date: ["2026-07-25"] };
  expect(applyBoardFilters(ts, f, NOW).map((t) => t.id)).toEqual(["a"]);
});
test("dueSoon keeps only tasks due within three days", () => {
  const ts = [
    task({ id: "a", date: new Date("2026-07-24T00:00:00Z") }),
    task({ id: "b", date: new Date("2026-07-30T00:00:00Z") }),
  ];
  expect(applyBoardFilters(ts, { ...emptyFilters(), dueSoon: true }, NOW).map((t) => t.id)).toEqual(["a"]);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- lib/domain/boardFilters.test.ts`
Expected: FAIL (module `@/lib/domain/boardFilters` not found).

- [ ] **Step 4: Implement `boardFilters.ts` part 1**

Create `lib/domain/boardFilters.ts`:

```ts
import type { BoardTask } from "@/lib/domain/types";
import { fieldEq, tzIsoDate } from "@/lib/domain/board";

export interface BoardFilters {
  keyword: string;   // "" means no keyword
  group: string[];   // requestedGroup values (OR within)
  category: string[];
  location: string[];
  date: string[];    // ISO calendar days (YYYY-MM-DD)
  dueSoon: boolean;
}

export function emptyFilters(): BoardFilters {
  return { keyword: "", group: [], category: [], location: [], date: [], dueSoon: false };
}

export function hasAnyFilter(f: BoardFilters): boolean {
  return (
    f.keyword.trim() !== "" || f.group.length > 0 || f.category.length > 0 ||
    f.location.length > 0 || f.date.length > 0 || f.dueSoon
  );
}

/** The urgency date: a frog's deadline, else its calendar day, else none. */
export function effectiveWhen(task: BoardTask): Date | null {
  return task.dueBy ?? task.date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when the task's deadline-or-day is on or before the calendar day three
 *  days after `now`. Compared on UTC calendar-day strings, so the window is a
 *  whole-day count and overdue tasks (any earlier day) count as due soon. */
export function isDueSoon(task: BoardTask, now: Date): boolean {
  const when = effectiveWhen(task);
  if (!when) return false;
  const cutoff = tzIsoDate(new Date(now.getTime() + 3 * DAY_MS));
  return tzIsoDate(when) <= cutoff;
}

/** AND across sections, OR within a multi-select section. `now` is passed in. */
export function applyBoardFilters(tasks: BoardTask[], f: BoardFilters, now: Date): BoardTask[] {
  const kw = f.keyword.trim().toLowerCase();
  return tasks.filter((t) => {
    if (kw && !t.title.toLowerCase().includes(kw)) return false;
    if (f.group.length && !f.group.some((g) => fieldEq(t.requestedGroup, g))) return false;
    if (f.category.length && !f.category.some((c) => fieldEq(t.category, c))) return false;
    if (f.location.length && !f.location.some((l) => fieldEq(t.location, l))) return false;
    if (f.date.length && !(t.date && f.date.includes(tzIsoDate(t.date)))) return false;
    if (f.dueSoon && !isDueSoon(t, now)) return false;
    return true;
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- lib/domain/boardFilters.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/board.ts lib/domain/boardFilters.ts lib/domain/boardFilters.test.ts
git commit -m "feat(board): BoardFilters model + applyBoardFilters, reusing board primitives"
```

---

### Task 2: Query serialization (`parseBoardFilters` / `filtersToQuery`)

**Files:**
- Modify: `lib/domain/boardFilters.ts`
- Test: `lib/domain/boardFilters.test.ts`

**Interfaces:**
- Consumes: `BoardFilters`, `emptyFilters` (Task 1).
- Produces: `type RawQuery = Record<string, string | string[] | undefined>`; `parseBoardFilters(sp: RawQuery): BoardFilters`; `filtersToQuery(f: BoardFilters): string`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/domain/boardFilters.test.ts`:

```ts
import { parseBoardFilters, filtersToQuery, type BoardFilters } from "@/lib/domain/boardFilters";

// Turn a query string into the object shape Next hands a page (repeated keys -> array).
function record(query: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of new URLSearchParams(query)) {
    const prev = out[k];
    if (prev === undefined) out[k] = v;
    else out[k] = Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return out;
}
function roundTrip(f: BoardFilters): BoardFilters {
  return parseBoardFilters(record(filtersToQuery(f)));
}

test("empty filters serialize to an empty string and round-trip", () => {
  expect(filtersToQuery(emptyFilters())).toBe("");
  expect(roundTrip(emptyFilters())).toEqual(emptyFilters());
});
test("multi-select uses repeated keys and round-trips", () => {
  const f: BoardFilters = { ...emptyFilters(), group: ["Scouts", "Parents"], date: ["2026-07-25"] };
  expect(filtersToQuery(f)).toContain("group=Scouts");
  expect(filtersToQuery(f)).toContain("group=Parents");
  expect(roundTrip(f)).toEqual(f);
});
test("a value containing a comma survives (repeated keys, not comma-join)", () => {
  const f: BoardFilters = { ...emptyFilters(), category: ["Food, Drink", "Games"] };
  expect(roundTrip(f)).toEqual(f);
});
test("keyword and dueSoon round-trip", () => {
  const f: BoardFilters = { ...emptyFilters(), keyword: "cups", dueSoon: true };
  expect(filtersToQuery(f)).toContain("q=cups");
  expect(filtersToQuery(f)).toContain("due=soon");
  expect(roundTrip(f)).toEqual(f);
});
test("parse accepts a bare string or an array and ignores unknown/empty keys", () => {
  expect(parseBoardFilters({ group: "Scouts", junk: "x", category: "" })).toEqual({
    ...emptyFilters(), group: ["Scouts"],
  });
  expect(parseBoardFilters({ group: ["A", "B"] }).group).toEqual(["A", "B"]);
});
test("parse never throws on odd input", () => {
  expect(() => parseBoardFilters({ due: ["soon", "soon"], date: [] })).not.toThrow();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/domain/boardFilters.test.ts`
Expected: FAIL (`parseBoardFilters`/`filtersToQuery` not exported).

- [ ] **Step 3: Implement the serialization**

Append to `lib/domain/boardFilters.ts`:

```ts
export type RawQuery = Record<string, string | string[] | undefined>;

function list(v: string | string[] | undefined): string[] {
  if (v == null) return [];
  return (Array.isArray(v) ? v : [v]).map((s) => s.trim()).filter((s) => s !== "");
}
function first(v: string | string[] | undefined): string {
  if (v == null) return "";
  return (Array.isArray(v) ? v[0] ?? "" : v).trim();
}

/** Parse Next's searchParams into filters. Never throws; ignores unknown/empty keys. */
export function parseBoardFilters(sp: RawQuery): BoardFilters {
  const due = Array.isArray(sp.due) ? sp.due : sp.due == null ? [] : [sp.due];
  return {
    keyword: first(sp.q),
    group: list(sp.group),
    category: list(sp.category),
    location: list(sp.location),
    date: list(sp.date),
    dueSoon: due.includes("soon"),
  };
}

/** Serialize filters to a query string, one repeated key per multi-select value
 *  (so a comma inside a value survives). Order within a section is preserved. */
export function filtersToQuery(f: BoardFilters): string {
  const p = new URLSearchParams();
  if (f.keyword.trim()) p.set("q", f.keyword.trim());
  for (const g of f.group) p.append("group", g);
  for (const c of f.category) p.append("category", c);
  for (const l of f.location) p.append("location", l);
  for (const d of f.date) p.append("date", d);
  if (f.dueSoon) p.set("due", "soon");
  return p.toString();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/domain/boardFilters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/boardFilters.ts lib/domain/boardFilters.test.ts
git commit -m "feat(board): URL round-trip for board filters (repeated keys, comma-safe)"
```

---

### Task 3: Derived "needs most help" ranking (`mostNeededId`)

**Files:**
- Modify: `lib/domain/boardFilters.ts`
- Test: `lib/domain/boardFilters.test.ts`

**Interfaces:**
- Consumes: `getSlotInfo` from `board.ts`; `effectiveWhen` (Task 1).
- Produces: `mostNeededId(tasks: BoardTask[], now: Date): string | null`.

**Note (open decision):** the comparator below is deadline-first per the spec. It is the single place the "most urgent vs biggest gap" decision changes. Keep it and its tests structured so swapping the order, or splitting into two signals, is a small edit.

- [ ] **Step 1: Write the failing tests**

Append to `lib/domain/boardFilters.test.ts`:

```ts
import { mostNeededId } from "@/lib/domain/boardFilters";

test("mostNeededId: nearest deadline wins", () => {
  const ts = [
    task({ id: "far", date: new Date("2026-07-30T00:00:00Z") }),
    task({ id: "near", date: new Date("2026-07-24T00:00:00Z") }),
  ];
  expect(mostNeededId(ts, NOW)).toBe("near");
});
test("mostNeededId: a larger gap breaks a deadline tie", () => {
  const day = new Date("2026-07-24T00:00:00Z");
  const ts = [
    task({ id: "small", date: day, neededCount: 2, signups: [{ id: "s", name: "A", group: null }] }), // gap 1
    task({ id: "big", date: day, neededCount: 3, signups: [] }), // gap 3
  ];
  expect(mostNeededId(ts, NOW)).toBe("big");
});
test("mostNeededId: undated ranks last", () => {
  const ts = [
    task({ id: "undated", date: null, dueBy: null }),
    task({ id: "dated", date: new Date("2026-08-01T00:00:00Z") }),
  ];
  expect(mostNeededId(ts, NOW)).toBe("dated");
});
test("mostNeededId: full tasks are skipped; all-full or empty is null", () => {
  const full = task({ id: "f", neededCount: 1, signups: [{ id: "s", name: "A", group: null }] });
  expect(mostNeededId([full], NOW)).toBeNull();
  expect(mostNeededId([], NOW)).toBeNull();
  const ts = [full, task({ id: "open", date: new Date("2026-07-24T00:00:00Z") })];
  expect(mostNeededId(ts, NOW)).toBe("open");
});
test("mostNeededId: lower position breaks a full tie", () => {
  const day = new Date("2026-07-24T00:00:00Z");
  const ts = [
    task({ id: "b", date: day, neededCount: 2, signups: [], position: 5 }),
    task({ id: "a", date: day, neededCount: 2, signups: [], position: 1 }),
  ];
  expect(mostNeededId(ts, NOW)).toBe("a");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/domain/boardFilters.test.ts`
Expected: FAIL (`mostNeededId` not exported).

- [ ] **Step 3: Implement `mostNeededId`**

Add `getSlotInfo` to the existing `board.ts` import at the top of `lib/domain/boardFilters.ts`:

```ts
import { fieldEq, tzIsoDate, getSlotInfo } from "@/lib/domain/board";
```

Append:

```ts
/** The id of the not-full task most needing attention, or null when none is open.
 *  Total order (OPEN DECISION lives here): dated before undated, then earlier
 *  deadline/day, then larger unfilled gap, then lower position. */
export function mostNeededId(tasks: BoardTask[], _now: Date): string | null {
  const open = tasks.filter((t) => !getSlotInfo(t).isFull);
  if (open.length === 0) return null;
  const gap = (t: BoardTask) => t.neededCount - t.signups.length;
  const ranked = [...open].sort((a, b) => {
    const wa = effectiveWhen(a), wb = effectiveWhen(b);
    if (wa && !wb) return -1;
    if (!wa && wb) return 1;
    if (wa && wb && wa.getTime() !== wb.getTime()) return wa.getTime() - wb.getTime();
    if (gap(a) !== gap(b)) return gap(b) - gap(a);
    return a.position - b.position;
  });
  return ranked[0].id;
}
```

(The `_now` parameter is part of the interface for future rankings that weight recency; it is intentionally unused today.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/domain/boardFilters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/boardFilters.ts lib/domain/boardFilters.test.ts
git commit -m "feat(board): mostNeededId derived ranking (deadline-first, provisional)"
```

---

### Task 4: `FilterFlyout` component

**Files:**
- Create: `components/board/FilterFlyout.tsx`
- Test: `components/board/FilterFlyout.test.tsx`

**Interfaces:**
- Consumes: `BoardFilters` (Task 1); `FacetOptions` from `board.ts`.
- Produces: `FilterFlyout` with props `{ facets: FacetOptions; showDueSoon: boolean; value: BoardFilters; onChange(next: BoardFilters): void; onClose(): void }`. Controlled: renders `value`, holds no filter state.

- [ ] **Step 1: Write the failing tests**

Create `components/board/FilterFlyout.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { FilterFlyout } from "@/components/board/FilterFlyout";
import { emptyFilters } from "@/lib/domain/boardFilters";
import type { FacetOptions } from "@/lib/domain/board";

const facets: FacetOptions = {
  date: [{ value: "2026-07-25", label: "Saturday, Jul 25" }],
  group: ["Scouts", "Parents"], category: ["Food"], location: [],
};

test("checking a group value calls onChange with it added", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FilterFlyout facets={facets} showDueSoon value={emptyFilters()} onChange={onChange} onClose={vi.fn()} />);
  await user.click(screen.getByLabelText("Scouts"));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ group: ["Scouts"] }));
});
test("unchecking a selected value removes it", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FilterFlyout facets={facets} showDueSoon value={{ ...emptyFilters(), group: ["Scouts"] }} onChange={onChange} onClose={vi.fn()} />);
  await user.click(screen.getByLabelText("Scouts"));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ group: [] }));
});
test("the keyword input reports changes", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FilterFlyout facets={facets} showDueSoon value={emptyFilters()} onChange={onChange} onClose={vi.fn()} />);
  await user.type(screen.getByLabelText(/keyword/i), "c");
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ keyword: "c" }));
});
test("a section with no values does not render (Location empty)", () => {
  render(<FilterFlyout facets={facets} showDueSoon value={emptyFilters()} onChange={vi.fn()} onClose={vi.fn()} />);
  expect(screen.queryByText(/location/i)).not.toBeInTheDocument();
});
test("Due soon is hidden when showDueSoon is false", () => {
  render(<FilterFlyout facets={facets} showDueSoon={false} value={emptyFilters()} onChange={vi.fn()} onClose={vi.fn()} />);
  expect(screen.queryByLabelText(/due soon/i)).not.toBeInTheDocument();
});
test("Escape closes the flyout", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<FilterFlyout facets={facets} showDueSoon value={emptyFilters()} onChange={vi.fn()} onClose={onClose} />);
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalled();
});
test("Show all tasks clears every section", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FilterFlyout facets={facets} showDueSoon value={{ ...emptyFilters(), group: ["Scouts"] }} onChange={onChange} onClose={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: /show all tasks/i }));
  expect(onChange).toHaveBeenCalledWith(emptyFilters());
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- components/board/FilterFlyout.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `FilterFlyout`**

Create `components/board/FilterFlyout.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import type { FacetOptions } from "@/lib/domain/board";
import { emptyFilters, type BoardFilters } from "@/lib/domain/boardFilters";

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function CheckList({
  legend, options, selected, onToggle,
}: {
  legend: string; options: string[]; selected: string[]; onToggle: (v: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-ink-soft">{legend}</legend>
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={selected.includes(o)}
              onChange={() => onToggle(o)}
              className="h-4 w-4 rounded border-lily-line text-reed focus:ring-pond"
            />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// A controlled filter panel: it renders `value` and reports every change through
// `onChange`, holding no state of its own. Sections with no values do not render.
export function FilterFlyout({
  facets, showDueSoon, value, onChange, onClose,
}: {
  facets: FacetOptions;
  showDueSoon: boolean;
  value: BoardFilters;
  onChange: (next: BoardFilters) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dayLabels = new Map(facets.date.map((d) => [d.value, d.label]));

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center sm:items-center">
      <button type="button" aria-label="Close filters" onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm" />
      <div role="dialog" aria-modal="true" aria-label="Filter tasks"
        className="relative z-10 m-4 w-full max-w-md rounded-3xl border border-lily-line bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">Filter tasks</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="rounded-full px-2 text-lg text-ink-soft hover:text-ink">✕</button>
        </div>

        <div className="flex flex-col gap-5">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-bold uppercase tracking-[0.15em] text-ink-soft">Keyword</span>
            <input
              type="text"
              value={value.keyword}
              onChange={(e) => onChange({ ...value, keyword: e.target.value })}
              placeholder="Search titles"
              aria-label="Keyword"
              className="rounded-xl border border-lily-line bg-white px-3 py-2 text-ink focus:border-reed focus:outline-none focus:ring-2 focus:ring-pond/30"
            />
          </label>

          <CheckList legend="Requested group" options={facets.group} selected={value.group}
            onToggle={(v) => onChange({ ...value, group: toggle(value.group, v) })} />
          <CheckList legend="Category" options={facets.category} selected={value.category}
            onToggle={(v) => onChange({ ...value, category: toggle(value.category, v) })} />
          <CheckList legend="Location" options={facets.location} selected={value.location}
            onToggle={(v) => onChange({ ...value, location: toggle(value.location, v) })} />
          <CheckList legend="Day" options={facets.date.map((d) => d.value)} selected={value.date}
            onToggle={(v) => onChange({ ...value, date: toggle(value.date, v) })} />

          {showDueSoon && (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={value.dueSoon}
                onChange={(e) => onChange({ ...value, dueSoon: e.target.checked })}
                aria-label="Due soon"
                className="h-4 w-4 rounded border-lily-line text-reed focus:ring-pond"
              />
              ⏰ Due soon
            </label>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button type="button" onClick={() => onChange(emptyFilters())}
            className="rounded-full bg-lily px-4 py-2 text-sm font-semibold text-pond-deep hover:bg-lily-line">
            Show all tasks
          </button>
        </div>
      </div>
    </div>
  );
}
```

(The `dayLabels` map is used by the Day options' visible labels in a later refinement; the checkbox list currently shows the ISO value. If you prefer the friendly label on the Day checkboxes, map `facets.date` to `{value,label}` and render the label. Keep the ISO value as the toggled key either way. This is a presentation choice, not a behavior change; leaving ISO labels is acceptable for this task since `ActiveFilterBar` shows the friendly label.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- components/board/FilterFlyout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add components/board/FilterFlyout.tsx components/board/FilterFlyout.test.tsx
git commit -m "feat(board): controlled FilterFlyout (multi-select sections, a11y)"
```

---

### Task 5: `ActiveFilterBar` component

**Files:**
- Create: `components/board/ActiveFilterBar.tsx`
- Test: `components/board/ActiveFilterBar.test.tsx`

**Interfaces:**
- Consumes: `BoardFilters`, `hasAnyFilter` (Task 1); `FacetOptions` from `board.ts`.
- Produces: `ActiveFilterBar` with props `{ value: BoardFilters; facets: FacetOptions; onRemove(section: keyof BoardFilters, item?: string): void; onClear(): void }`.

- [ ] **Step 1: Write the failing tests**

Create `components/board/ActiveFilterBar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ActiveFilterBar } from "@/components/board/ActiveFilterBar";
import { emptyFilters } from "@/lib/domain/boardFilters";
import type { FacetOptions } from "@/lib/domain/board";

const facets: FacetOptions = {
  date: [{ value: "2026-07-25", label: "Saturday, Jul 25" }],
  group: ["Scouts"], category: ["Food"], location: [],
};

test("renders nothing when no filter is active", () => {
  const { container } = render(
    <ActiveFilterBar value={emptyFilters()} facets={facets} onRemove={vi.fn()} onClear={vi.fn()} />
  );
  expect(container).toBeEmptyDOMElement();
});
test("renders one chip per active value with a friendly day label", () => {
  render(<ActiveFilterBar
    value={{ ...emptyFilters(), group: ["Scouts"], date: ["2026-07-25"], keyword: "cups", dueSoon: true }}
    facets={facets} onRemove={vi.fn()} onClear={vi.fn()} />);
  expect(screen.getByText(/Scouts/)).toBeInTheDocument();
  expect(screen.getByText(/Sat/i)).toBeInTheDocument(); // friendly day label, not the ISO
  expect(screen.getByText(/cups/)).toBeInTheDocument();
  expect(screen.getByText(/due soon/i)).toBeInTheDocument();
});
test("removing a chip calls onRemove for just that value", async () => {
  const onRemove = vi.fn();
  const user = userEvent.setup();
  render(<ActiveFilterBar value={{ ...emptyFilters(), group: ["Scouts"] }} facets={facets} onRemove={onRemove} onClear={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: /remove .*scouts/i }));
  expect(onRemove).toHaveBeenCalledWith("group", "Scouts");
});
test("a filtered day missing from facets falls back to the ISO value and still clears", async () => {
  const onRemove = vi.fn();
  const user = userEvent.setup();
  render(<ActiveFilterBar value={{ ...emptyFilters(), date: ["2026-09-09"] }} facets={facets} onRemove={onRemove} onClear={vi.fn()} />);
  expect(screen.getByText(/2026-09-09/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /remove/i }));
  expect(onRemove).toHaveBeenCalledWith("date", "2026-09-09");
});
test("Show all tasks calls onClear", async () => {
  const onClear = vi.fn();
  const user = userEvent.setup();
  render(<ActiveFilterBar value={{ ...emptyFilters(), keyword: "x" }} facets={facets} onRemove={vi.fn()} onClear={onClear} />);
  await user.click(screen.getByRole("button", { name: /show all tasks/i }));
  expect(onClear).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- components/board/ActiveFilterBar.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `ActiveFilterBar`**

Create `components/board/ActiveFilterBar.tsx`:

```tsx
"use client";

import type { FacetOptions } from "@/lib/domain/board";
import { hasAnyFilter, type BoardFilters } from "@/lib/domain/boardFilters";

type Chip = { section: keyof BoardFilters; item?: string; label: string };

function chips(value: BoardFilters, facets: FacetOptions): Chip[] {
  const dayLabel = new Map(facets.date.map((d) => [d.value, d.label]));
  const out: Chip[] = [];
  if (value.keyword.trim()) out.push({ section: "keyword", label: `"${value.keyword.trim()}"` });
  for (const g of value.group) out.push({ section: "group", item: g, label: `👥 ${g}` });
  for (const c of value.category) out.push({ section: "category", item: c, label: `🏷️ ${c}` });
  for (const l of value.location) out.push({ section: "location", item: l, label: `📍 ${l}` });
  for (const d of value.date) out.push({ section: "date", item: d, label: `📅 ${dayLabel.get(d) ?? d}` });
  if (value.dueSoon) out.push({ section: "dueSoon", label: "⏰ Due soon" });
  return out;
}

// The visible signal for hidden filters: one removable chip per active value plus
// a clear-all. Also the context banner for a shared group link.
export function ActiveFilterBar({
  value, facets, onRemove, onClear,
}: {
  value: BoardFilters;
  facets: FacetOptions;
  onRemove: (section: keyof BoardFilters, item?: string) => void;
  onClear: () => void;
}) {
  if (!hasAnyFilter(value)) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {chips(value, facets).map((c) => (
        <button
          key={`${c.section}:${c.item ?? ""}`}
          type="button"
          onClick={() => onRemove(c.section, c.item)}
          aria-label={`Remove ${c.label}`}
          className="flex items-center gap-1 rounded-full bg-lily px-3 py-1 text-xs font-semibold text-ink hover:bg-lily-line"
        >
          {c.label} <span aria-hidden>✕</span>
        </button>
      ))}
      <button type="button" onClick={onClear}
        className="rounded-full px-3 py-1 text-xs font-semibold text-pond underline-offset-2 hover:underline">
        Show all tasks
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- components/board/ActiveFilterBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/board/ActiveFilterBar.tsx components/board/ActiveFilterBar.test.tsx
git commit -m "feat(board): ActiveFilterBar removable chips + clear-all"
```

---

### Task 6: `BoardCard` "needs most help" badge

**Files:**
- Modify: `components/board/BoardCard.tsx`
- Test: `components/board/BoardCard.test.tsx`

**Interfaces:**
- Consumes: existing `BoardCard` props.
- Produces: `BoardCard` gains an optional prop `needsMostHelp?: boolean`.

**Note (open decision):** `MOST_NEEDED_LABEL` is the single label constant. It is provisional ("⭐ Most urgent"); a human may change it. Keep it one constant.

- [ ] **Step 1: Write the failing tests**

Append to `components/board/BoardCard.test.tsx` (the file already has the `task()` helper):

```tsx
test("shows the needs-most-help badge only when flagged", () => {
  const { rerender } = render(<BoardCard task={task({})} onOpen={vi.fn()} needsMostHelp />);
  expect(screen.getByText(/most urgent/i)).toBeInTheDocument();
  rerender(<BoardCard task={task({})} onOpen={vi.fn()} />);
  expect(screen.queryByText(/most urgent/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- components/board/BoardCard.test.tsx`
Expected: FAIL (`needsMostHelp` unknown / badge not rendered).

- [ ] **Step 3: Add the badge**

In `components/board/BoardCard.tsx`, add the constant near the top (after the imports):

```ts
// Provisional label; the "most urgent vs biggest gap" decision is open (see the
// Phase 2 spec). Change this one string if the decision lands differently.
const MOST_NEEDED_LABEL = "⭐ Most urgent";
```

Change the component signature to accept the prop:

```tsx
export function BoardCard({ task, onOpen, needsMostHelp = false }: { task: BoardTask; onOpen: (id: string) => void; needsMostHelp?: boolean }) {
```

Inside the `<header>`, in the left `<div className="min-w-0">`, render the badge above the kind line when flagged:

```tsx
        <div className="min-w-0">
          {needsMostHelp && (
            <p className="mb-1 inline-block rounded-full bg-lantern/20 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-lantern-deep">
              {MOST_NEEDED_LABEL}
            </p>
          )}
          <p className="mb-0.5 text-[0.7rem] font-bold uppercase tracking-[0.15em] text-ink-soft">
```

(Leave the rest of the header unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- components/board/BoardCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/board/BoardCard.tsx components/board/BoardCard.test.tsx
git commit -m "feat(board): needs-most-help badge on BoardCard (provisional label)"
```

---

### Task 7: Wire filters into `TaskBoard`

**Files:**
- Modify: `components/board/TaskBoard.tsx`
- Test: `components/board/TaskBoard.test.tsx`

**Interfaces:**
- Consumes: `BoardFilters`, `emptyFilters`, `applyBoardFilters`, `mostNeededId`, `filtersToQuery`, `effectiveWhen` (Tasks 1-3); `facetOptions` from `board.ts`; `FilterFlyout` (Task 4); `ActiveFilterBar` (Task 5); `BoardCard` `needsMostHelp` (Task 6).
- Produces: `TaskBoard` gains props `initialFilters: BoardFilters` and `nowMs: number`.

- [ ] **Step 1: Write the failing tests**

Append to `components/board/TaskBoard.test.tsx`. Reuse the file's existing task fixture/import style; if it lacks a fixture helper, add one mirroring `BoardCard.test.tsx`. Add near the top of the file a `history.replaceState` spy setup inside these tests. Add:

```tsx
import { emptyFilters } from "@/lib/domain/boardFilters";

const NOW_MS = Date.parse("2026-07-22T12:00:00Z");

test("applying a group filter narrows the visible tasks", async () => {
  const user = userEvent.setup();
  const tasks = [
    boardTask({ id: "a", title: "Cups", requestedGroup: "Scouts" }),
    boardTask({ id: "b", title: "Grill", requestedGroup: "Parents" }),
  ];
  render(<TaskBoard event={{ name: "Ginza" }} tasks={tasks} isOrganizer={false}
    initialFilters={{ ...emptyFilters(), group: ["Scouts"] }} nowMs={NOW_MS} />);
  expect(screen.getByText("Cups")).toBeInTheDocument();
  expect(screen.queryByText("Grill")).not.toBeInTheDocument();
});

test("the Filter button shows the active-value count", () => {
  render(<TaskBoard event={{ name: "Ginza" }} tasks={[boardTask({ id: "a" })]} isOrganizer={false}
    initialFilters={{ ...emptyFilters(), group: ["Scouts", "Parents"] }} nowMs={NOW_MS} />);
  expect(screen.getByRole("button", { name: /filter/i })).toHaveTextContent("2");
});

test("a filter change writes the query to the URL", async () => {
  const spy = vi.spyOn(window.history, "replaceState");
  const user = userEvent.setup();
  render(<TaskBoard event={{ name: "Ginza" }}
    tasks={[boardTask({ id: "a", requestedGroup: "Scouts" })]} isOrganizer={false}
    initialFilters={emptyFilters()} nowMs={NOW_MS} />);
  await user.click(screen.getByRole("button", { name: /filter/i }));
  await user.click(screen.getByLabelText("Scouts"));
  expect(spy).toHaveBeenCalledWith(null, "", expect.stringContaining("group=Scouts"));
  spy.mockRestore();
});

test("the most-needed available task renders first with the badge", () => {
  const tasks = [
    boardTask({ id: "far", title: "Later", date: new Date("2026-07-30T00:00:00Z") }),
    boardTask({ id: "near", title: "Sooner", date: new Date("2026-07-24T00:00:00Z") }),
  ];
  render(<TaskBoard event={{ name: "Ginza" }} tasks={tasks} isOrganizer={false}
    initialFilters={emptyFilters()} nowMs={NOW_MS} />);
  const available = screen.getByRole("region", { name: "Available" });
  const titles = [...available.querySelectorAll("p.font-display")].map((p) => p.textContent);
  expect(titles[0]).toBe("Sooner");
  expect(screen.getByText(/most urgent/i)).toBeInTheDocument();
});

test("copy-link includes the active filter query (organizer)", async () => {
  const write = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
  render(<TaskBoard event={{ name: "Ginza" }} tasks={[boardTask({ id: "a" })]} isOrganizer
    initialFilters={{ ...emptyFilters(), group: ["Scouts"] }} nowMs={NOW_MS} />);
  await userEvent.setup().click(screen.getByRole("button", { name: /copy public link/i }));
  expect(write).toHaveBeenCalledWith(expect.stringContaining("group=Scouts"));
});
```

If `TaskBoard.test.tsx` has no `boardTask()` helper, add this near the top:

```tsx
import type { BoardTask } from "@/lib/domain/types";
function boardTask(over: Partial<BoardTask>): BoardTask {
  return {
    id: "t1", kind: "shift", title: "Task", category: null, requestedGroup: null,
    neededCount: 3, date: null, startAt: null, endAt: null, dueBy: null,
    pointOfContact: null, location: null, definitionOfDone: null, status: "todo",
    waiting: false, position: 0, signups: [], ...over,
  };
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- components/board/TaskBoard.test.tsx`
Expected: FAIL (new props unknown; no Filter button; no badge ordering).

- [ ] **Step 3: Implement the wiring**

Rewrite `components/board/TaskBoard.tsx`. Keep the existing `Column`, hash/`openTask`/`closeTask`/panel logic; add filters, the controls row, the flyout, the chip bar, the most-needed-first ordering, and the URL sync. The `Column` now takes an optional `mostId` to flag the first card:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { partitionByAvailability, facetOptions } from "@/lib/domain/board";
import {
  applyBoardFilters, mostNeededId, filtersToQuery, effectiveWhen,
  hasAnyFilter, emptyFilters, type BoardFilters,
} from "@/lib/domain/boardFilters";
import type { BoardTask } from "@/lib/domain/types";
import { BoardCard } from "@/components/board/BoardCard";
import { TaskPanel } from "@/components/board/TaskPanel";
import { FilterFlyout } from "@/components/board/FilterFlyout";
import { ActiveFilterBar } from "@/components/board/ActiveFilterBar";

function Column({
  label, dot, tasks, onOpen, mostId,
}: {
  label: string; dot: string; tasks: BoardTask[]; onOpen: (id: string) => void; mostId: string | null;
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-ink-soft">{label}</h2>
        <span className="rounded-full bg-lily px-2 py-0.5 text-xs font-bold text-ink-soft">{tasks.length}</span>
      </div>
      {tasks.map((t) => (
        <BoardCard key={t.id} task={t} onOpen={onOpen} needsMostHelp={t.id === mostId} />
      ))}
    </section>
  );
}

export function TaskBoard({
  event, tasks, isOrganizer, initialFilters, nowMs,
}: {
  event: { name: string };
  tasks: BoardTask[];
  isOrganizer: boolean;
  initialFilters: BoardFilters;
  nowMs: number;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [filters, setFilters] = useState<BoardFilters>(initialFilters);
  const [flyoutOpen, setFlyoutOpen] = useState(false);

  const now = new Date(nowMs); // one clock: SSR and hydration agree
  const facets = facetOptions(tasks);
  const showDueSoon = tasks.some((t) => effectiveWhen(t) !== null);

  const visible = applyBoardFilters(tasks, filters, now);
  const mostId = mostNeededId(visible, now);
  const { available, claimed } = partitionByAvailability(visible);
  // The most-needed task leads its Available column.
  const orderedAvailable = mostId
    ? [available.find((t) => t.id === mostId), ...available.filter((t) => t.id !== mostId)].filter(Boolean) as BoardTask[]
    : available;

  const activeCount =
    (filters.keyword.trim() ? 1 : 0) + filters.group.length + filters.category.length +
    filters.location.length + filters.date.length + (filters.dueSoon ? 1 : 0);

  // Mirror filter state into the URL for sharing, preserving any #task hash.
  function syncUrl(next: BoardFilters) {
    const q = filtersToQuery(next);
    const url = window.location.pathname + (q ? `?${q}` : "") + window.location.hash;
    window.history.replaceState(null, "", url);
  }
  function changeFilters(next: BoardFilters) {
    setFilters(next);
    syncUrl(next);
  }
  function removeFilter(section: keyof BoardFilters, item?: string) {
    if (section === "keyword") return changeFilters({ ...filters, keyword: "" });
    if (section === "dueSoon") return changeFilters({ ...filters, dueSoon: false });
    const list = filters[section] as string[];
    changeFilters({ ...filters, [section]: list.filter((v) => v !== item) });
  }

  useEffect(() => {
    const ids = new Set(tasks.map((t) => t.id));
    const read = () => {
      const m = window.location.hash.match(/^#task-(.+)$/);
      setOpenId(m && ids.has(m[1]) ? m[1] : null);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [tasks]);

  function openTask(id: string) {
    setOpenId(id);
    if (window.location.hash !== `#task-${id}`) window.location.hash = `task-${id}`;
  }
  function closeTask() {
    setOpenId(null);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  function copyLink() {
    const q = filtersToQuery(filters);
    void navigator.clipboard.writeText(window.location.origin + window.location.pathname + (q ? `?${q}` : ""));
    setCopied(true);
  }

  const open = openId ? tasks.find((t) => t.id === openId) : undefined;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">
            <span aria-hidden className="mr-2">🐸</span>
            {event.name}
          </h1>
          <p className="mt-1 text-ink-soft">Grab a task to help out.</p>
        </div>
        {isOrganizer ? (
          <div className="flex items-center gap-3">
            <button type="button" onClick={copyLink}
              className="rounded-full bg-lily px-4 py-2 text-sm font-semibold text-pond-deep transition hover:bg-lily-line">
              {copied ? "Copied ✓" : "🔗 Copy public link"}
            </button>
            <span className="rounded-full bg-reed/10 px-3 py-2 text-sm font-bold text-reed-deep">
              Live · {tasks.length} tasks
            </span>
          </div>
        ) : (
          <Link href="/organize"
            className="text-sm font-medium text-ink-soft underline-offset-2 transition hover:text-pond hover:underline">
            Organizer sign-in
          </Link>
        )}
      </header>

      <div className="mb-4">
        <button type="button" onClick={() => setFlyoutOpen(true)}
          className="rounded-full border border-lily-line bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm hover:border-pond">
          ⚙ Filter{activeCount > 0 ? ` · ${activeCount}` : ""}
        </button>
      </div>

      <ActiveFilterBar value={filters} facets={facets} onRemove={removeFilter} onClear={() => changeFilters(emptyFilters())} />

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-lily-line bg-white p-8 text-center text-ink-soft">
          No tasks match.{" "}
          <button type="button" onClick={() => changeFilters(emptyFilters())} className="font-semibold text-pond hover:underline">
            Show all tasks
          </button>
        </p>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2">
          <Column label="Available" dot="bg-lantern" tasks={orderedAvailable} onOpen={openTask} mostId={mostId} />
          <Column label="Claimed" dot="bg-reed" tasks={claimed} onOpen={openTask} mostId={null} />
        </div>
      )}

      {flyoutOpen && (
        <FilterFlyout facets={facets} showDueSoon={showDueSoon} value={filters}
          onChange={changeFilters} onClose={() => setFlyoutOpen(false)} />
      )}

      {open && <TaskPanel task={open} onClose={closeTask} />}
    </main>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- components/board/TaskBoard.test.tsx`
Expected: PASS. (If the existing Phase 1 `TaskBoard` tests now fail for missing `initialFilters`/`nowMs`, update those render calls to pass `initialFilters={emptyFilters()}` and `nowMs={Date.parse("2026-07-22T12:00:00Z")}`.)

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add components/board/TaskBoard.tsx components/board/TaskBoard.test.tsx
git commit -m "feat(board): filter flyout, chip bar, URL sync, most-needed-first"
```

---

### Task 8: Feed filters and the clock from the page

**Files:**
- Modify: `app/b/[slug]/page.tsx`
- Test: `app/b/[slug]/page.test.tsx`

**Interfaces:**
- Consumes: `parseBoardFilters` (Task 2); the extended `TaskBoard` (Task 7).
- Produces: the page passes `initialFilters` and `nowMs` to `TaskBoard`.

- [ ] **Step 1: Write the failing test**

Read `app/b/[slug]/page.test.tsx` first to match its mock style (it already mocks `getEventBoardByParam`, `flagEnabled`, session, and `next/navigation`). Add a test that a `group` query narrows what the board renders. Append:

```tsx
test("a group query renders the board filtered to that group", async () => {
  // arrange: two tasks, one Scouts one Parents (match the file's existing mock setup)
  mockBoard({
    name: "Ginza",
    tasks: [
      boardTask({ id: "a", title: "Cups", requestedGroup: "Scouts" }),
      boardTask({ id: "b", title: "Grill", requestedGroup: "Parents" }),
    ],
  });
  flagOn(); // however the file enables the flag in its passing tests
  const ui = await TaskBoardPage({
    params: Promise.resolve({ slug: "ginza-2026" }),
    searchParams: Promise.resolve({ group: "Scouts" }),
  });
  render(ui);
  expect(screen.getByText("Cups")).toBeInTheDocument();
  expect(screen.queryByText("Grill")).not.toBeInTheDocument();
});
```

(Match the helper names the file already uses. If it renders the returned server component another way, follow that pattern. The key assertions: `searchParams` flows in and the board renders filtered.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- app/b/[slug]/page.test.tsx`
Expected: FAIL (`searchParams` not accepted; board not filtered).

- [ ] **Step 3: Update the page**

Edit `app/b/[slug]/page.tsx` to accept `searchParams`, parse filters, and pass the clock. Read the relevant App Router page-props guide in `node_modules/next/dist/docs/` first to confirm the `searchParams` promise shape:

```tsx
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getEventBoardByParam } from "@/lib/repository/events";
import { isValidSession, SESSION_COOKIE } from "@/lib/security/session";
import { flagEnabled } from "@/lib/flags";
import { parseBoardFilters } from "@/lib/domain/boardFilters";
import { TaskBoard } from "@/components/board/TaskBoard";

export const dynamic = "force-dynamic";

export default async function TaskBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const cookieStore = await cookies();

  if (!flagEnabled("task_board", { cookies: cookieStore })) notFound();

  const board = await getEventBoardByParam(slug);
  if (!board) notFound();

  const initialFilters = parseBoardFilters(await searchParams);
  const nowMs = Date.now();
  const isOrganizer = isValidSession(cookieStore.get(SESSION_COOKIE)?.value);
  return (
    <TaskBoard
      event={{ name: board.name }}
      tasks={board.tasks}
      isOrganizer={isOrganizer}
      initialFilters={initialFilters}
      nowMs={nowMs}
    />
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- app/b/[slug]/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full type-check and commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add "app/b/[slug]/page.tsx" "app/b/[slug]/page.test.tsx"
git commit -m "feat(board): page parses filters from the query and hands one clock"
```

---

### Task 9: e2e coverage and final verification

**Files:**
- Modify: `e2e/task-board.spec.ts`

**Interfaces:** none.

- [ ] **Step 1: Add e2e for the group link, flyout, copy-link, and axe**

Append to `e2e/task-board.spec.ts` (reuse its `BOARD`/`PREVIEW` constants and the seeded event; the seed's tasks carry `requestedGroup` values, confirm one exists, e.g. by reading the seed):

```ts
test("a group query shows the group chip and only that group's tasks", async ({ page }) => {
  await page.goto(PREVIEW);            // opt in via the cookie
  await page.goto(`${BOARD}?group=Scouts`);
  await expect(page.getByRole("button", { name: /remove .*scouts/i })).toBeVisible();
  // Every visible requested-group chip on a card reads Scouts (no Parents-only task shows).
  await expect(page.getByText("👥 Parents")).toHaveCount(0);
});

test("setting a filter in the flyout updates the URL and copy-link", async ({ page }) => {
  await page.goto(PREVIEW);
  await page.getByRole("button", { name: /^⚙ Filter/ }).click();
  const dialog = page.getByRole("dialog", { name: /filter tasks/i });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Scouts").check();
  await expect(page).toHaveURL(/group=Scouts/);

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations).toEqual([]);
});
```

(If the seed has no `Scouts` requested-group, use a value the seed does carry; read `prisma/seed.ts` to pick one and adjust both assertions.)

- [ ] **Step 2: Run the e2e suite**

Run: `npm run test:e2e` (or the project's documented Playwright command; check `package.json`).
Expected: PASS, zero axe violations.

- [ ] **Step 3: Run all four gates**

Run: `npm test && npm run test:db && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add e2e/task-board.spec.ts
git commit -m "test(board): e2e for group link, flyout filter, copy-link, and axe"
```

---

## Self-Review

**Spec coverage:**
- Filter flyout, multi-select, sections only when values exist → Task 4. ✓
- Availability out of the filter (columns keep splitting it) → not added as a filter; Tasks 4/7 keep the two columns. ✓
- Active chip bar + count badge → Tasks 5, 7. ✓
- Permanent shareable links (query string, copy-link with query) → Tasks 2, 7, 8. ✓
- Derived "needs most help" badge, first in its column → Tasks 3, 6, 7. ✓
- One server clock (`nowMs`) for SSR/hydration agreement → Tasks 7, 8. ✓
- `boardFilters.ts` pure, reuses `fieldEq`/`tzIsoDate`/`getSlotInfo`/`facetOptions` → Tasks 1, 3, 7. ✓
- Repeated-key, comma-safe serialization; `date` key shared with `/[slug]`; parse accepts `string|string[]`, never throws, empty → `""` → Task 2. ✓
- `dueSoon` three-calendar-day, overdue included; undated hides Day + Due soon → Tasks 1, 4, 7. ✓
- Empty result state with clear-all → Task 7. ✓
- No schema, no repository, no new flag; `/[slug]` and `/organize` untouched → whole plan. ✓
- e2e: group link, flyout, URL update, axe → Task 9. ✓

**Placeholder scan:** every code step carries complete code; no TBD/TODO. The one deliberate variability is the OPEN DECISION (badge label + `mostNeededId` order), isolated to one comparator and one constant and called out in Global Constraints and Tasks 3/6. ✓

**Type consistency:** `BoardFilters`, `emptyFilters`, `applyBoardFilters(tasks, f, now)`, `mostNeededId(tasks, now)`, `parseBoardFilters(RawQuery)`, `filtersToQuery(f)` names and signatures match across Tasks 1-3, 7, 8. `FilterFlyout` props `{ facets, showDueSoon, value, onChange, onClose }` and `ActiveFilterBar` props `{ value, facets, onRemove, onClear }` match their consumers in Task 7. `BoardCard` `needsMostHelp?: boolean` matches Task 7's usage. `TaskBoard` new props `initialFilters`/`nowMs` match Task 8's page call. ✓
