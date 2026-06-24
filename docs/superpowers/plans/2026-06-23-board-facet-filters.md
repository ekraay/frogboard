# Board Facet Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **TDD is mandatory.** Every task uses superpowers:test-driven-development: write the failing test first, run it and watch it fail for the right reason, write the minimal code to pass, watch it pass, then refactor. No production code without a failing test first. Before any "done": `npm test`, `npm run test:db`, `npx tsc --noEmit`, and `npm run lint` all green.

**Goal:** Filter the public board by combinable facets (date, group, category, location) through an on-page filter bar that drives shareable URL params, generalizing today's single `?group=` filter.

**Architecture:** Pure `filterTasks` + `facetOptions` join the work in `lib/domain/board.ts`. A client `FilterBar` reads/writes the URL via `next/navigation`. The board page (`app/[slug]/page.tsx`) reads the facet params, filters, and passes the options + coverage to a generalized `Board`. No schema, repository, or server-action changes.

**Tech Stack:** Next.js App Router (`useSearchParams`/`usePathname`/`useRouter`), React, Vitest + Testing Library (jsdom), Playwright (e2e).

Spec: `docs/superpowers/specs/2026-06-23-board-facet-filters-design.md`.

---

## File Structure

- **Modify** `lib/domain/board.ts` — add `Facets`, `FacetOptions`, `filterTasks`, `facetOptions`; reimplement `filterTasksByGroup` as a wrapper.
- **Modify** `lib/domain/board.test.ts` — unit tests for the new functions.
- **Create** `components/FilterBar.tsx` — client filter controls that drive the URL.
- **Create** `components/FilterBar.test.tsx` — unit tests.
- **Modify** `components/Board.tsx` — generalized `filter` prop: options + active facets + coverage; renders `FilterBar`, the coverage header, and the empty state.
- **Modify** `app/[slug]/page.tsx` — read all facet params, filter, pass options + coverage.
- **Modify** `e2e/slug.spec.ts` — assert a combined filter narrows the board.

---

### Task 1: Domain — filterTasks + facetOptions

**Files:**
- Modify: `lib/domain/board.ts`
- Test: `lib/domain/board.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// add to lib/domain/board.test.ts
import { filterTasks, facetOptions } from "@/lib/domain/board";
import type { BoardTask } from "@/lib/domain/types";

function task(over: Partial<BoardTask>): BoardTask {
  return {
    id: over.id ?? "t", kind: "shift", title: "T", category: null, requestedGroup: null,
    neededCount: 1, date: null, startAt: null, endAt: null, dueBy: null, pointOfContact: null,
    location: null, definitionOfDone: null, position: 0, status: "todo", waiting: false,
    signups: [], ...over,
  };
}

describe("filterTasks", () => {
  const tasks = [
    task({ id: "a", requestedGroup: "Scouts", category: "Games", location: "Gym", date: new Date("2026-07-25") }),
    task({ id: "b", requestedGroup: "YAO", category: "Games", location: "Stage", date: new Date("2026-07-26") }),
    task({ id: "c", requestedGroup: "Scouts", category: "Food", location: "Gym", date: new Date("2026-07-25") }),
  ];
  test("an empty facet set returns everything", () => {
    expect(filterTasks(tasks, {}).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });
  test("AND across facets (Saturday + Scouts + Games)", () => {
    expect(filterTasks(tasks, { date: "2026-07-25", group: "scouts", category: "Games" }).map((t) => t.id))
      .toEqual(["a"]);
  });
  test("group match is case- and space-insensitive", () => {
    expect(filterTasks(tasks, { group: "  SCOUTS " }).map((t) => t.id)).toEqual(["a", "c"]);
  });
  test("date matches the calendar day", () => {
    expect(filterTasks(tasks, { date: "2026-07-26" }).map((t) => t.id)).toEqual(["b"]);
  });
});

describe("facetOptions", () => {
  test("distinct, sorted, labeled values; blanks ignored", () => {
    const opts = facetOptions([
      task({ requestedGroup: "Scouts", category: "Games", location: "Gym", date: new Date("2026-07-26") }),
      task({ requestedGroup: "BWA", category: "Games", location: "", date: new Date("2026-07-25") }),
      task({ requestedGroup: "", category: null }),
    ]);
    expect(opts.group).toEqual(["BWA", "Scouts"]);
    expect(opts.category).toEqual(["Games"]);
    expect(opts.location).toEqual(["Gym"]);
    expect(opts.date.map((d) => d.value)).toEqual(["2026-07-25", "2026-07-26"]);
    expect(opts.date[0].label).toMatch(/Jul 25/);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npm test -- board.test`
Expected: FAIL — `filterTasks`/`facetOptions` not exported.

- [ ] **Step 3: Implement in `lib/domain/board.ts`**

Add (the file already has private `tzIsoDate` and `dayLabel`, reuse them):

```ts
export interface Facets { date?: string; group?: string; category?: string; location?: string }
export interface FacetOptions {
  date: { value: string; label: string }[];
  group: string[]; category: string[]; location: string[];
}

function fieldEq(actual: string | null, wanted: string): boolean {
  return (actual ?? "").trim().toLowerCase() === wanted.trim().toLowerCase();
}

/** Tasks matching every provided facet (AND). A blank/absent facet adds no constraint. */
export function filterTasks(tasks: BoardTask[], facets: Facets): BoardTask[] {
  return tasks.filter((t) => {
    if (facets.group?.trim() && !fieldEq(t.requestedGroup, facets.group)) return false;
    if (facets.category?.trim() && !fieldEq(t.category, facets.category)) return false;
    if (facets.location?.trim() && !fieldEq(t.location, facets.location)) return false;
    if (facets.date?.trim() && (!t.date || tzIsoDate(t.date) !== facets.date)) return false;
    return true;
  });
}

/** Distinct, non-empty values present in the tasks, for building the filter bar. */
export function facetOptions(tasks: BoardTask[]): FacetOptions {
  const dates = new Map<string, string>(); // iso -> weekday label
  const group = new Set<string>(), category = new Set<string>(), location = new Set<string>();
  for (const t of tasks) {
    if (t.date) dates.set(tzIsoDate(t.date), dayLabel(t.date));
    if (t.requestedGroup?.trim()) group.add(t.requestedGroup.trim());
    if (t.category?.trim()) category.add(t.category.trim());
    if (t.location?.trim()) location.add(t.location.trim());
  }
  const alpha = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
  return {
    date: [...dates.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([value, label]) => ({ value, label })),
    group: alpha(group), category: alpha(category), location: alpha(location),
  };
}
```

Then reimplement the existing group filter as a wrapper (replace its body):

```ts
export function filterTasksByGroup(tasks: BoardTask[], group: string): BoardTask[] {
  return filterTasks(tasks, { group });
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npm test -- board.test`
Expected: PASS, including the pre-existing `filterTasksByGroup` tests (behavior unchanged: a blank group returns everything).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/board.ts lib/domain/board.test.ts
git commit -m "feat: combinable board facet filtering (filterTasks + facetOptions)"
```

---

### Task 2: FilterBar client component

**Files:**
- Create: `components/FilterBar.tsx`
- Test: `components/FilterBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// components/FilterBar.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const push = vi.fn();
let params = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/ginza-2026",
  useSearchParams: () => params,
}));

import { FilterBar } from "@/components/FilterBar";

const options = {
  date: [{ value: "2026-07-25", label: "Saturday, Jul 25" }],
  group: ["Scouts", "YAO"], category: ["Games"], location: ["Gym"],
};

beforeEach(() => { push.mockReset(); params = new URLSearchParams(); });

test("choosing a group pushes the filtered URL", async () => {
  const user = userEvent.setup();
  render(<FilterBar options={options} />);
  await user.selectOptions(screen.getByLabelText(/group/i), "Scouts");
  expect(push).toHaveBeenCalledWith("/ginza-2026?group=Scouts");
});

test("Clear appears when a facet is set and resets the path", async () => {
  params = new URLSearchParams("group=Scouts");
  const user = userEvent.setup();
  render(<FilterBar options={options} />);
  await user.click(screen.getByRole("button", { name: /clear/i }));
  expect(push).toHaveBeenCalledWith("/ginza-2026");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- FilterBar`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/FilterBar.tsx`**

```tsx
"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import type { FacetOptions } from "@/lib/domain/board";

const FACETS = [
  { key: "date", label: "Day" },
  { key: "group", label: "Group" },
  { key: "category", label: "Category" },
  { key: "location", label: "Location" },
] as const;

export function FilterBar({ options }: { options: FacetOptions }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();

  function choose(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const anyActive = FACETS.some((f) => params.get(f.key));

  return (
    <div className="mx-auto mb-6 flex max-w-xl flex-wrap items-end justify-center gap-2">
      {FACETS.map((f) => {
        const current = params.get(f.key) ?? "";
        const opts = f.key === "date"
          ? options.date
          : (options[f.key] as string[]).map((v) => ({ value: v, label: v }));
        return (
          <label key={f.key} className="text-xs font-bold text-ink-soft">
            <span className="ml-1 block">{f.label}</span>
            <select aria-label={f.label} value={current}
              onChange={(e) => choose(f.key, e.target.value)}
              className={`mt-1 rounded-xl border bg-white px-3 py-2 text-sm font-bold text-ink outline-none transition focus:border-reed focus:ring-2 focus:ring-reed/30 ${current ? "border-lantern bg-lantern/5 text-lantern-deep" : "border-lily-line"}`}>
              <option value="">Any {f.label.toLowerCase()}</option>
              {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        );
      })}
      {anyActive && (
        <button type="button" onClick={() => router.push(pathname)}
          className="mb-1 rounded-xl px-3 py-2 text-sm font-bold text-lantern-deep underline underline-offset-4">
          Clear filters
        </button>
      )}
    </div>
  );
}
```

(The duplicated `values` line above is a copy/paste artifact — delete the unused `const values = …` line; the inline expression in the `.map` is what renders.)

- [ ] **Step 4: Run it and watch it pass**

Run: `npm test -- FilterBar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/FilterBar.tsx components/FilterBar.test.tsx
git commit -m "feat: board FilterBar drives shareable facet URLs"
```

---

### Task 3: Generalize Board + wire the page

**Files:**
- Modify: `components/Board.tsx`
- Modify: `app/[slug]/page.tsx`
- Modify (if it exists): `components/Board.test.tsx`

- [ ] **Step 1: Generalize the `Board` filter prop**

Replace the `filter` prop type and its rendering. New prop:

```tsx
import { groupTasksByDay } from "@/lib/domain/board";
import type { FacetOptions } from "@/lib/domain/board";
import { FilterBar } from "@/components/FilterBar";

export function Board({
  eventName, tasks, filter,
}: {
  eventName: string;
  tasks: BoardTask[];
  filter?: { options: FacetOptions; activeLabels: string[]; covered: number; total: number };
}) {
  const groups = groupTasksByDay(tasks);
  let cardIndex = 0;
  // ...header unchanged (garland, title, "what's a frog")...
```

Replace the old `{filter && (...group header...)}` and empty-state blocks with:

```tsx
      {filter && <FilterBar options={filter.options} />}

      {filter && filter.activeLabels.length > 0 && (
        <div className="mx-auto mb-8 max-w-sm rounded-2xl border border-amber/50 bg-amber/10 px-4 py-3 text-center">
          <p className="text-sm font-bold text-lantern-deep">
            {`Showing ${filter.activeLabels.join(" · ")} — ${filter.covered} of ${filter.total} covered`}
          </p>
        </div>
      )}

      {filter && filter.activeLabels.length > 0 && tasks.length === 0 && (
        <p className="mx-auto max-w-sm text-center text-sm text-ink-soft">
          No matching shifts — loosen a filter above to see more.
        </p>
      )}
```

(The "See the whole event" link is replaced by the FilterBar's "Clear filters".)

- [ ] **Step 2: Wire `app/[slug]/page.tsx`**

Replace the `?group=` block with the full facet read:

```tsx
import { filterTasks, facetOptions, coverageFor } from "@/lib/domain/board";
// ...
  const sp = await searchParams;
  const pick = (k: string) => {
    const v = (sp as Record<string, string | string[] | undefined>)[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };
  const facets = { date: pick("date"), group: pick("group"), category: pick("category"), location: pick("location") };
  const tasks = filterTasks(board.tasks, facets);
  const options = facetOptions(board.tasks);
  const activeLabels = [
    facets.date ? (options.date.find((d) => d.value === facets.date)?.label ?? facets.date) : "",
    facets.group, facets.category, facets.location,
  ].filter((s) => s !== "");
  const { covered, total } = coverageFor(tasks);
  return <Board eventName={board.name} tasks={tasks} filter={{ options, activeLabels, covered, total }} />;
```

Update the page's `searchParams` type to `Promise<{ date?: string|string[]; group?: string|string[]; category?: string|string[]; location?: string|string[] }>`.

- [ ] **Step 3: Update `Board.test.tsx` if it exists**

If `components/Board.test.tsx` references the old `filter={{ group, covered, total }}` shape, change those usages to the new `{ options, activeLabels, covered, total }` shape (an empty `options` of `{date:[],group:[],category:[],location:[]}` and `activeLabels: []` for the no-filter cases) and mock `next/navigation` (FilterBar now renders inside Board). Run `npm test -- Board` to confirm.

- [ ] **Step 4: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add components/Board.tsx app/[slug]/page.tsx components/Board.test.tsx
git commit -m "feat: board renders a facet filter bar; page reads combinable facets"
```

---

### Task 4: E2E coverage

**Files:**
- Modify: `e2e/slug.spec.ts`

The seed publishes "Ginza Bazaar / Bon Odori 2026" (slug `ginza-2026`) with tasks whose groups include "Scouts" and dates Jul 25–26.

- [ ] **Step 1: Add an e2e test**

```ts
test("combined facet filter narrows the board and updates coverage", async ({ page }) => {
  await page.goto("/ginza-2026?date=2026-07-25&group=Scouts");
  await expect(page.getByText(/showing .*scouts/i)).toBeVisible();
  // every visible card belongs to the Scouts group on Saturday — at least one shows
  await expect(page.locator("article").first()).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `npm run db:seed && npm run build && npx playwright test e2e/slug.spec.ts`
Expected: PASS (start a clean server; stop any stale one on :3000 first).

- [ ] **Step 3: Commit**

```bash
git add e2e/slug.spec.ts
git commit -m "test(e2e): combined board facet filter narrows results"
```

---

## Notes for the implementer

- `tzIsoDate` and `dayLabel` are private in `board.ts`; `filterTasks`/`facetOptions` live in the same file, so call them directly — do not export them.
- The date facet's URL param is `date` (the control is labeled "Day").
- `filterTasksByGroup` must remain exported and behavior-identical (a blank group returns everything) so the existing `?group=` links keep working.
- `Board` is rendered only by `app/[slug]/page.tsx`; there are no other call sites to update.
