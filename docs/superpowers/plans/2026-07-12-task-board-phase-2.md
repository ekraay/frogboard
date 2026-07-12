# Task Board Phase 2 (filter flyout + shareable links) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a filter flyout to the volunteer board whose state rides in the URL, so any filtered view (for example one group's tasks) is a copy-and-send link, plus a chip bar for active filters.

**Architecture:** The page parses the query string into `BoardFilters` and passes them, the full task list, and one server clock (`nowMs`) to the client `TaskBoard`. Filtering runs client-side over data already in the browser (instant), and the client mirrors filter state back into the URL via `history.replaceState`. All filter rules live in one pure, DOM-free unit (`lib/domain/boardFilters.ts`) built on the primitives already in `lib/domain/board.ts`. No schema change; reads still reuse `getEventBoardByParam`.

**Tech Stack:** Next.js App Router (modified; read `node_modules/next/dist/docs/` before changing routes), React client components, Tailwind v4 `@theme` tokens in `app/globals.css`, Vitest (jsdom unit; node `*.db.test.ts`), Playwright + axe (`e2e/`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-12-task-board-phase-2-design.md`.
- Source every color and font from the existing `@theme` tokens in `app/globals.css` ("Matsuri at Dusk"). The board is mobile-first.
- Filter semantics: **OR within a section, AND across sections.** `keyword` is a case-insensitive substring of the title. `group`/`category`/`location` match the task field trimmed and case-insensitively, internal spaces significant (reuse `fieldEq`). `date` matches the task's calendar day (reuse `tzIsoDate`). `dueSoon` keeps tasks whose deadline-or-day is on or before the calendar day three days out, counted in whole days, overdue included. `bigGap` keeps tasks that still need **2 or more** people (`neededCount - signups.length >= 2`).
- **The two derived signals ship as two flyout filters, not a card badge** (decision 2026-07-12). "Most urgent" is the `dueSoon` time filter; "Biggest gap" is the `bigGap` need filter. There is no derived badge and no `mostNeededId`.
- `now` is always passed into domain functions, never read from the clock inside them, so tests are deterministic and SSR/hydration read one instant.
- Query serialization uses **repeated keys, never comma-joined values**, so a value containing a comma (e.g. a category "Food, Drink") round-trips. Keys: `group`, `category`, `location`, `date` (the `date` key is shared with the legacy `/[slug]` board), keyword as `q`, `dueSoon` as `due=soon`, `bigGap` as `gap=big`. `parseBoardFilters` accepts Next's `string | string[]`, never throws, ignores unknown/empty keys, and `filtersToQuery(emptyFilters())` is `""`.
- No schema change. No repository change. No new flag (the route flag is already on in production). `/[slug]` and `/organize` stay unchanged.
- Reuse, do not fork: `partitionByAvailability`, `getSlotInfo`, `facetOptions`, `fieldEq`, `tzIsoDate` all live in `board.ts`; `boardFilters.ts` imports them.
- Before done: `npm test`, `npm run test:db`, `npx tsc --noEmit`, `npm run lint`, and the e2e suite all green.

---

### Task 1: Filter model and matching (`boardFilters.ts` part 1) + export primitives

**Files:**
- Modify: `lib/domain/board.ts` (export the private `fieldEq` and `tzIsoDate`)
- Create: `lib/domain/boardFilters.ts`
- Test: `lib/domain/boardFilters.test.ts`

**Interfaces:**
- Consumes: `fieldEq(actual: string | null, wanted: string): boolean` and `tzIsoDate(d: Date): string` from `board.ts`; `BoardTask` from `lib/domain/types`.
- Produces: `interface BoardFilters { keyword: string; group: string[]; category: string[]; location: string[]; date: string[]; dueSoon: boolean; bigGap: boolean }`; `emptyFilters(): BoardFilters`; `hasAnyFilter(f: BoardFilters): boolean`; `effectiveWhen(task: BoardTask): Date | null`; `isDueSoon(task: BoardTask, now: Date): boolean`; `hasBigGap(task: BoardTask): boolean`; `sortByGap(tasks: BoardTask[]): BoardTask[]`; `applyBoardFilters(tasks: BoardTask[], f: BoardFilters, now: Date): BoardTask[]`.

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
import { expect, test } from "vitest";
import type { BoardTask } from "@/lib/domain/types";
import {
  emptyFilters, hasAnyFilter, effectiveWhen, isDueSoon, hasBigGap, sortByGap, applyBoardFilters,
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
  expect(hasAnyFilter({ ...emptyFilters(), bigGap: true })).toBe(true);
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
  expect(isDueSoon(task({ dueBy: new Date("2026-07-25T23:00:00Z") }), NOW)).toBe(true);
});

test("hasBigGap: needs two or more still-open spots", () => {
  expect(hasBigGap(task({ neededCount: 3, signups: [] }))).toBe(true);              // gap 3
  expect(hasBigGap(task({ neededCount: 2, signups: [{ id: "s", name: "A", group: null }] }))).toBe(false); // gap 1
  expect(hasBigGap(task({ neededCount: 1, signups: [] }))).toBe(false);             // gap 1
  expect(hasBigGap(task({ neededCount: 2, signups: [] }))).toBe(true);              // gap 2
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
  expect(got.map((t) => t.id)).toEqual(["a", "b"]);
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
test("bigGap keeps only tasks still needing two or more", () => {
  const ts = [
    task({ id: "a", neededCount: 3, signups: [] }),
    task({ id: "b", neededCount: 1, signups: [] }),
  ];
  expect(applyBoardFilters(ts, { ...emptyFilters(), bigGap: true }, NOW).map((t) => t.id)).toEqual(["a"]);
});
test("sortByGap orders by the largest unfilled gap first, then position", () => {
  const ts = [
    task({ id: "small", neededCount: 2, signups: [], position: 1 }),        // gap 2
    task({ id: "big", neededCount: 5, signups: [], position: 2 }),          // gap 5
    task({ id: "tie", neededCount: 2, signups: [], position: 0 }),          // gap 2, lower position
  ];
  expect(sortByGap(ts).map((t) => t.id)).toEqual(["big", "tie", "small"]);
});
test("sortByGap does not mutate its input", () => {
  const ts = [task({ id: "a", neededCount: 1 }), task({ id: "b", neededCount: 3 })];
  sortByGap(ts);
  expect(ts.map((t) => t.id)).toEqual(["a", "b"]);
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
  dueSoon: boolean;  // "most urgent" signal
  bigGap: boolean;   // "biggest gap" signal
}

export function emptyFilters(): BoardFilters {
  return { keyword: "", group: [], category: [], location: [], date: [], dueSoon: false, bigGap: false };
}

export function hasAnyFilter(f: BoardFilters): boolean {
  return (
    f.keyword.trim() !== "" || f.group.length > 0 || f.category.length > 0 ||
    f.location.length > 0 || f.date.length > 0 || f.dueSoon || f.bigGap
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

/** True when the task still needs two or more people. */
export function hasBigGap(task: BoardTask): boolean {
  return task.neededCount - task.signups.length >= 2;
}

/** Order tasks by the largest unfilled gap first, then lower position. Pure
 *  (returns a new array). Used to float the biggest needs up when the Biggest
 *  gap filter is on. */
export function sortByGap(tasks: BoardTask[]): BoardTask[] {
  const gap = (t: BoardTask) => t.neededCount - t.signups.length;
  return [...tasks].sort((a, b) => gap(b) - gap(a) || a.position - b.position);
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
    if (f.bigGap && !hasBigGap(t)) return false;
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
git commit -m "feat(board): BoardFilters model + applyBoardFilters (due-soon, big-gap)"
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
test("keyword, dueSoon and bigGap round-trip", () => {
  const f: BoardFilters = { ...emptyFilters(), keyword: "cups", dueSoon: true, bigGap: true };
  expect(filtersToQuery(f)).toContain("q=cups");
  expect(filtersToQuery(f)).toContain("due=soon");
  expect(filtersToQuery(f)).toContain("gap=big");
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
function has(v: string | string[] | undefined, wanted: string): boolean {
  return (Array.isArray(v) ? v : v == null ? [] : [v]).includes(wanted);
}

/** Parse Next's searchParams into filters. Never throws; ignores unknown/empty keys. */
export function parseBoardFilters(sp: RawQuery): BoardFilters {
  return {
    keyword: first(sp.q),
    group: list(sp.group),
    category: list(sp.category),
    location: list(sp.location),
    date: list(sp.date),
    dueSoon: has(sp.due, "soon"),
    bigGap: has(sp.gap, "big"),
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
  if (f.bigGap) p.set("gap", "big");
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

### Task 3: `FilterFlyout` component

**Files:**
- Create: `components/board/FilterFlyout.tsx`
- Test: `components/board/FilterFlyout.test.tsx`

**Interfaces:**
- Consumes: `BoardFilters`, `emptyFilters` (Task 1); `FacetOptions` from `board.ts`.
- Produces: `FilterFlyout` with props `{ facets: FacetOptions; showDueSoon: boolean; showBigGap: boolean; value: BoardFilters; onChange(next: BoardFilters): void; onClose(): void }`. Controlled: renders `value`, holds no filter state.

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
  render(<FilterFlyout facets={facets} showDueSoon showBigGap value={emptyFilters()} onChange={onChange} onClose={vi.fn()} />);
  await user.click(screen.getByLabelText("Scouts"));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ group: ["Scouts"] }));
});
test("unchecking a selected value removes it", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FilterFlyout facets={facets} showDueSoon showBigGap value={{ ...emptyFilters(), group: ["Scouts"] }} onChange={onChange} onClose={vi.fn()} />);
  await user.click(screen.getByLabelText("Scouts"));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ group: [] }));
});
test("the keyword input reports changes", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FilterFlyout facets={facets} showDueSoon showBigGap value={emptyFilters()} onChange={onChange} onClose={vi.fn()} />);
  await user.type(screen.getByLabelText(/keyword/i), "c");
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ keyword: "c" }));
});
test("the Due soon and Biggest gap toggles report changes", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FilterFlyout facets={facets} showDueSoon showBigGap value={emptyFilters()} onChange={onChange} onClose={vi.fn()} />);
  await user.click(screen.getByLabelText(/due soon/i));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dueSoon: true }));
  await user.click(screen.getByLabelText(/biggest gap/i));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ bigGap: true }));
});
test("a section with no values does not render (Location empty)", () => {
  render(<FilterFlyout facets={facets} showDueSoon showBigGap value={emptyFilters()} onChange={vi.fn()} onClose={vi.fn()} />);
  expect(screen.queryByText(/location/i)).not.toBeInTheDocument();
});
test("Due soon hides when showDueSoon is false; Biggest gap hides when showBigGap is false", () => {
  render(<FilterFlyout facets={facets} showDueSoon={false} showBigGap={false} value={emptyFilters()} onChange={vi.fn()} onClose={vi.fn()} />);
  expect(screen.queryByLabelText(/due soon/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/biggest gap/i)).not.toBeInTheDocument();
});
test("Escape closes the flyout", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<FilterFlyout facets={facets} showDueSoon showBigGap value={emptyFilters()} onChange={vi.fn()} onClose={onClose} />);
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalled();
});
test("Show all tasks clears every section", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FilterFlyout facets={facets} showDueSoon showBigGap value={{ ...emptyFilters(), group: ["Scouts"] }} onChange={onChange} onClose={vi.fn()} />);
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
  facets, showDueSoon, showBigGap, value, onChange, onClose,
}: {
  facets: FacetOptions;
  showDueSoon: boolean;
  showBigGap: boolean;
  value: BoardFilters;
  onChange: (next: BoardFilters) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

          {(showDueSoon || showBigGap) && (
            <fieldset className="border-0 p-0">
              <legend className="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-ink-soft">Needs attention</legend>
              <div className="flex flex-col gap-2">
                {showDueSoon && (
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" checked={value.dueSoon} aria-label="Due soon"
                      onChange={(e) => onChange({ ...value, dueSoon: e.target.checked })}
                      className="h-4 w-4 rounded border-lily-line text-reed focus:ring-pond" />
                    ⏰ Due soon
                  </label>
                )}
                {showBigGap && (
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" checked={value.bigGap} aria-label="Biggest gap"
                      onChange={(e) => onChange({ ...value, bigGap: e.target.checked })}
                      className="h-4 w-4 rounded border-lily-line text-reed focus:ring-pond" />
                    🙌 Biggest gap
                  </label>
                )}
              </div>
            </fieldset>
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

(The Day checkboxes show the ISO value as their label; the friendly "Sat Jul 25" label appears on the chip in `ActiveFilterBar`. Keeping ISO here is acceptable; the toggled key is the ISO value either way.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- components/board/FilterFlyout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add components/board/FilterFlyout.tsx components/board/FilterFlyout.test.tsx
git commit -m "feat(board): controlled FilterFlyout (multi-select + due-soon/big-gap, a11y)"
```

---

### Task 4: `ActiveFilterBar` component

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
test("renders one chip per active value, with a friendly day label and the two toggles", () => {
  render(<ActiveFilterBar
    value={{ ...emptyFilters(), group: ["Scouts"], date: ["2026-07-25"], keyword: "cups", dueSoon: true, bigGap: true }}
    facets={facets} onRemove={vi.fn()} onClear={vi.fn()} />);
  expect(screen.getByText(/Scouts/)).toBeInTheDocument();
  expect(screen.getByText(/Sat/i)).toBeInTheDocument();
  expect(screen.getByText(/cups/)).toBeInTheDocument();
  expect(screen.getByText(/due soon/i)).toBeInTheDocument();
  expect(screen.getByText(/biggest gap/i)).toBeInTheDocument();
});
test("removing a chip calls onRemove for just that value", async () => {
  const onRemove = vi.fn();
  const user = userEvent.setup();
  render(<ActiveFilterBar value={{ ...emptyFilters(), group: ["Scouts"] }} facets={facets} onRemove={onRemove} onClear={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: /remove .*scouts/i }));
  expect(onRemove).toHaveBeenCalledWith("group", "Scouts");
});
test("removing the Biggest gap chip targets the bigGap section", async () => {
  const onRemove = vi.fn();
  const user = userEvent.setup();
  render(<ActiveFilterBar value={{ ...emptyFilters(), bigGap: true }} facets={facets} onRemove={onRemove} onClear={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: /remove .*biggest gap/i }));
  expect(onRemove).toHaveBeenCalledWith("bigGap");
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
  if (value.bigGap) out.push({ section: "bigGap", label: "🙌 Biggest gap" });
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

### Task 5: Wire filters into `TaskBoard`

**Files:**
- Modify: `components/board/TaskBoard.tsx`
- Test: `components/board/TaskBoard.test.tsx`

**Interfaces:**
- Consumes: `BoardFilters`, `emptyFilters`, `applyBoardFilters`, `filtersToQuery`, `effectiveWhen`, `sortByGap` (Tasks 1-2); `facetOptions`, `partitionByAvailability` from `board.ts`; `FilterFlyout` (Task 3); `ActiveFilterBar` (Task 4).
- Produces: `TaskBoard` gains props `initialFilters: BoardFilters` and `nowMs: number`.

- [ ] **Step 1: Write the failing tests**

Append to `components/board/TaskBoard.test.tsx`. If the file has no `boardTask()` helper, add the one below near the top. Add:

```tsx
import { emptyFilters } from "@/lib/domain/boardFilters";
import type { BoardTask } from "@/lib/domain/types";

function boardTask(over: Partial<BoardTask>): BoardTask {
  return {
    id: "t1", kind: "shift", title: "Task", category: null, requestedGroup: null,
    neededCount: 3, date: null, startAt: null, endAt: null, dueBy: null,
    pointOfContact: null, location: null, definitionOfDone: null, status: "todo",
    waiting: false, position: 0, signups: [], ...over,
  };
}
const NOW_MS = Date.parse("2026-07-22T12:00:00Z");

test("applying a group filter narrows the visible tasks", () => {
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
    initialFilters={{ ...emptyFilters(), group: ["Scouts", "Parents"], bigGap: true }} nowMs={NOW_MS} />);
  expect(screen.getByRole("button", { name: /filter/i })).toHaveTextContent("3");
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

test("copy-link includes the active filter query (organizer)", async () => {
  const write = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
  render(<TaskBoard event={{ name: "Ginza" }} tasks={[boardTask({ id: "a" })]} isOrganizer
    initialFilters={{ ...emptyFilters(), group: ["Scouts"] }} nowMs={NOW_MS} />);
  await userEvent.setup().click(screen.getByRole("button", { name: /copy public link/i }));
  expect(write).toHaveBeenCalledWith(expect.stringContaining("group=Scouts"));
});

test("empty result shows the clear-all empty state", () => {
  render(<TaskBoard event={{ name: "Ginza" }} tasks={[boardTask({ id: "a", requestedGroup: "Parents" })]} isOrganizer={false}
    initialFilters={{ ...emptyFilters(), group: ["Nobody"] }} nowMs={NOW_MS} />);
  expect(screen.getByText(/no tasks match/i)).toBeInTheDocument();
});

test("with Biggest gap on, the Available column sorts the largest gap first", () => {
  const tasks = [
    boardTask({ id: "small", title: "Small", neededCount: 2, signups: [], position: 0 }), // gap 2
    boardTask({ id: "big", title: "Big", neededCount: 5, signups: [], position: 1 }),      // gap 5
  ];
  render(<TaskBoard event={{ name: "Ginza" }} tasks={tasks} isOrganizer={false}
    initialFilters={{ ...emptyFilters(), bigGap: true }} nowMs={NOW_MS} />);
  const available = screen.getByRole("region", { name: "Available" });
  const titles = [...available.querySelectorAll("p.font-display")].map((p) => p.textContent);
  expect(titles).toEqual(["Big", "Small"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- components/board/TaskBoard.test.tsx`
Expected: FAIL (new props unknown; no Filter button).

- [ ] **Step 3: Implement the wiring**

Rewrite `components/board/TaskBoard.tsx`, keeping the existing `Column`, hash/`openTask`/`closeTask`/panel logic, and adding filters, the Filter button, the flyout, the chip bar, the URL sync, and the query-aware copy-link:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { partitionByAvailability, facetOptions } from "@/lib/domain/board";
import {
  applyBoardFilters, filtersToQuery, effectiveWhen, sortByGap,
  emptyFilters, type BoardFilters,
} from "@/lib/domain/boardFilters";
import type { BoardTask } from "@/lib/domain/types";
import { BoardCard } from "@/components/board/BoardCard";
import { TaskPanel } from "@/components/board/TaskPanel";
import { FilterFlyout } from "@/components/board/FilterFlyout";
import { ActiveFilterBar } from "@/components/board/ActiveFilterBar";

function Column({
  label, dot, tasks, onOpen,
}: {
  label: string; dot: string; tasks: BoardTask[]; onOpen: (id: string) => void;
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-ink-soft">{label}</h2>
        <span className="rounded-full bg-lily px-2 py-0.5 text-xs font-bold text-ink-soft">{tasks.length}</span>
      </div>
      {tasks.map((t) => (
        <BoardCard key={t.id} task={t} onOpen={onOpen} />
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
  const showBigGap = tasks.some((t) => t.neededCount >= 2);

  const visible = applyBoardFilters(tasks, filters, now);
  const { available, claimed } = partitionByAvailability(visible);
  // When the Biggest gap filter is on, float the largest needs to the top of Available.
  const availableOrdered = filters.bigGap ? sortByGap(available) : available;

  const activeCount =
    (filters.keyword.trim() ? 1 : 0) + filters.group.length + filters.category.length +
    filters.location.length + filters.date.length + (filters.dueSoon ? 1 : 0) + (filters.bigGap ? 1 : 0);

  function syncUrl(next: BoardFilters) {
    const q = filtersToQuery(next);
    window.history.replaceState(null, "", window.location.pathname + (q ? `?${q}` : "") + window.location.hash);
  }
  function changeFilters(next: BoardFilters) {
    setFilters(next);
    syncUrl(next);
  }
  function removeFilter(section: keyof BoardFilters, item?: string) {
    if (section === "keyword") return changeFilters({ ...filters, keyword: "" });
    if (section === "dueSoon") return changeFilters({ ...filters, dueSoon: false });
    if (section === "bigGap") return changeFilters({ ...filters, bigGap: false });
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
          <Column label="Available" dot="bg-lantern" tasks={availableOrdered} onOpen={openTask} />
          <Column label="Claimed" dot="bg-reed" tasks={claimed} onOpen={openTask} />
        </div>
      )}

      {flyoutOpen && (
        <FilterFlyout facets={facets} showDueSoon={showDueSoon} showBigGap={showBigGap} value={filters}
          onChange={changeFilters} onClose={() => setFlyoutOpen(false)} />
      )}

      {open && <TaskPanel task={open} onClose={closeTask} />}
    </main>
  );
}
```

(Every import is used: `effectiveWhen` drives `showDueSoon`, `sortByGap` orders Available when `bigGap` is on. `showBigGap` is derived inline from `neededCount`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- components/board/TaskBoard.test.tsx`
Expected: PASS. If the existing Phase 1 `TaskBoard` tests fail for missing `initialFilters`/`nowMs`, update those render calls to pass `initialFilters={emptyFilters()}` and `nowMs={Date.parse("2026-07-22T12:00:00Z")}`.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add components/board/TaskBoard.tsx components/board/TaskBoard.test.tsx
git commit -m "feat(board): filter flyout, chip bar, URL sync, query-aware copy-link"
```

---

### Task 6: Feed filters and the clock from the page

**Files:**
- Modify: `app/b/[slug]/page.tsx`
- Test: `app/b/[slug]/page.test.tsx`

**Interfaces:**
- Consumes: `parseBoardFilters` (Task 2); the extended `TaskBoard` (Task 5).
- Produces: the page passes `initialFilters` and `nowMs` to `TaskBoard`.

- [ ] **Step 1: Write the failing test**

Read `app/b/[slug]/page.test.tsx` first to match its mock style (it already mocks `getEventBoardByParam`, `flagEnabled`, session, and `next/navigation`). Add a test that a `group` query narrows the rendered board, matching the file's existing helpers:

```tsx
test("a group query renders the board filtered to that group", async () => {
  // Match the file's existing arrange helpers for a flag-on, published board.
  mockBoard({
    name: "Ginza",
    tasks: [
      boardTask({ id: "a", title: "Cups", requestedGroup: "Scouts" }),
      boardTask({ id: "b", title: "Grill", requestedGroup: "Parents" }),
    ],
  });
  flagOn();
  const ui = await TaskBoardPage({
    params: Promise.resolve({ slug: "ginza-2026" }),
    searchParams: Promise.resolve({ group: "Scouts" }),
  });
  render(ui);
  expect(screen.getByText("Cups")).toBeInTheDocument();
  expect(screen.queryByText("Grill")).not.toBeInTheDocument();
});
```

(Use the helper names the file already defines. If it renders the server component differently, follow that pattern. The key: `searchParams` flows in and the board renders filtered.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- app/b/[slug]/page.test.tsx`
Expected: FAIL (`searchParams` not accepted; board not filtered).

- [ ] **Step 3: Update the page**

Edit `app/b/[slug]/page.tsx`. Read the App Router page-props guide in `node_modules/next/dist/docs/` first to confirm the `searchParams` promise shape:

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

### Task 7: e2e coverage and final verification

**Files:**
- Modify: `e2e/task-board.spec.ts`

**Interfaces:** none.

- [ ] **Step 1: Add e2e for the group link, flyout, copy-link, and axe**

Read `prisma/seed.ts` to pick a `requestedGroup` value the seed actually carries (the example below assumes "Scouts"; adjust both assertions to a real seeded value). Append to `e2e/task-board.spec.ts`, reusing its `BOARD`/`PREVIEW` constants:

```ts
test("a group query shows the group chip and hides other groups", async ({ page }) => {
  await page.goto(PREVIEW); // opt in via the cookie
  await page.goto(`${BOARD}?group=Scouts`);
  await expect(page.getByRole("button", { name: /remove .*scouts/i })).toBeVisible();
  await expect(page.getByText("👥 Parents")).toHaveCount(0);
});

test("setting a filter in the flyout updates the URL, with no axe violations", async ({ page }) => {
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

- [ ] **Step 2: Run the e2e suite**

Run: the project's Playwright command (check `package.json`; e.g. `npm run test:e2e`).
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
- Filter flyout, multi-select, sections only when values exist → Task 3. ✓
- Availability stays as the two columns, not a filter → Tasks 3/5. ✓
- Active chip bar + count badge → Tasks 4, 5. ✓
- Permanent shareable links (query string, copy-link with query) → Tasks 2, 5, 6. ✓
- Two derived filters (due-soon + big-gap), no badge → Tasks 1, 3, 4, 5 (decision 2026-07-12). ✓
- Biggest-gap sort: when the `bigGap` filter is on, the Available column floats the largest unfilled needs first via `sortByGap` → Tasks 1, 5 (user-requested addition 2026-07-12, beyond the spec). ✓
- One server clock (`nowMs`) for SSR/hydration agreement → Tasks 5, 6. ✓
- `boardFilters.ts` pure, reuses `fieldEq`/`tzIsoDate`/`facetOptions`/`partitionByAvailability` → Tasks 1, 5. ✓
- Repeated-key, comma-safe serialization; `date` key shared with `/[slug]`; `due=soon`, `gap=big`; parse accepts `string|string[]`, never throws, empty → `""` → Task 2. ✓
- `dueSoon` three-calendar-day, overdue included; `bigGap` gap ≥ 2; undated hides Day + Due soon; all-solo hides Biggest gap → Tasks 1, 3, 5. ✓
- Empty result state with clear-all → Task 5. ✓
- No schema, no repository, no new flag; `/[slug]` and `/organize` untouched → whole plan. ✓
- e2e: group link, flyout, URL update, axe → Task 7. ✓

**Placeholder scan:** every code step carries complete code; no TBD/TODO. Task 6's test uses the page test file's existing helper names (`mockBoard`/`flagOn`/`boardTask`); the implementer matches them to the file, which is a fidelity instruction, not a placeholder. ✓

**Type consistency:** `BoardFilters` (with `dueSoon`, `bigGap`), `emptyFilters`, `applyBoardFilters(tasks, f, now)`, `hasBigGap(task)`, `parseBoardFilters(RawQuery)`, `filtersToQuery(f)` names and signatures match across Tasks 1-2, 5, 6. `FilterFlyout` props `{ facets, showDueSoon, showBigGap, value, onChange, onClose }` and `ActiveFilterBar` props `{ value, facets, onRemove, onClear }` match Task 5's usage. `TaskBoard` new props `initialFilters`/`nowMs` match Task 6's page call. No `mostNeededId`, no badge, no `needsMostHelp` prop anywhere. ✓
