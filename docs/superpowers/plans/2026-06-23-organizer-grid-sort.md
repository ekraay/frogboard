# Organizer Grid Column Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **TDD is mandatory.** Every task uses superpowers:test-driven-development: write the failing test first, run it and watch it fail for the right reason, write the minimal code to pass, watch it pass, then refactor. No production code without a failing test first. Before any "done": `npm test`, `npm run test:db`, `npx tsc --noEmit`, and `npm run lint` all green.

**Goal:** Make each organizer-grid column header sort the rows as a non-destructive view, with a "Manual order" control to return to the saved drag order.

**Architecture:** A pure `lib/domain/gridSort.ts` produces an ordered list of row keys from the rows' raw cells (parsing date/time/need for correct ordering). `OrganizeGrid` holds the sort state, renders rows in that order, disables reordering while sorted, and clears the sort when a row is added. No schema, repository, or server-action changes.

**Tech Stack:** Next.js (App Router), React client component, Vitest + Testing Library (jsdom), the existing cell parsers in `lib/domain/cells.ts`.

Spec: `docs/superpowers/specs/2026-06-23-organizer-grid-sort-design.md`.

---

## File Structure

- **Create** `lib/domain/gridSort.ts` — pure `SortColumn`, `sortValue`, `sortRowKeys`. One responsibility: ordering.
- **Create** `lib/domain/gridSort.test.ts` — unit tests.
- **Modify** `components/organize/GridRow.tsx` — accept a `reorderDisabled` prop that disables the move buttons + drag handle.
- **Modify** `components/organize/OrganizeGrid.tsx` — sort state, sortable header buttons, "Manual order" toggle, ordered rendering, clear-on-add.
- **Modify** `components/organize/OrganizeGrid.test.tsx` — component tests for sorting (follow the existing mock setup at the top of that file).

---

### Task 1: Pure sort domain

**Files:**
- Create: `lib/domain/gridSort.ts`
- Test: `lib/domain/gridSort.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/domain/gridSort.test.ts
import { describe, expect, test } from "vitest";
import { sortValue, sortRowKeys, type SortRow } from "@/lib/domain/gridSort";
import { emptyCells, type RawCells } from "@/lib/domain/gridRow";
import type { EventCtx } from "@/lib/domain/cells";

const ctx: EventCtx = {
  year: 2026,
  start: { year: 2026, month: 7, day: 24 },
  end: { year: 2026, month: 7, day: 26 },
};
function row(key: string, over: Partial<RawCells>): SortRow {
  return { key, cells: { ...emptyCells(), ...over } };
}

describe("sortValue", () => {
  test("strings are lowercased; blanks are null", () => {
    expect(sortValue({ ...emptyCells(), title: "Games" }, "title", ctx)).toBe("games");
    expect(sortValue(emptyCells(), "title", ctx)).toBeNull();
  });
  test("need is numeric; blank is null (not the default 1)", () => {
    expect(sortValue({ ...emptyCells(), need: "5" }, "need", ctx)).toBe(5);
    expect(sortValue(emptyCells(), "need", ctx)).toBeNull();
  });
  test("date parses to an ISO day; blank/garbage is null", () => {
    expect(sortValue({ ...emptyCells(), date: "Jul 25" }, "date", ctx)).toBe("2026-07-25");
    expect(sortValue({ ...emptyCells(), date: "nonsense" }, "date", ctx)).toBeNull();
  });
  test("time parses to start minutes; a frog without a clock is null", () => {
    expect(sortValue({ ...emptyCells(), time: "10:00 AM - 1:00 PM" }, "time", ctx)).toBe(600);
    expect(sortValue({ ...emptyCells(), time: "by Sat" }, "time", ctx)).toBeNull();
  });
});

describe("sortRowKeys", () => {
  test("ascending then descending by title, blanks always last", () => {
    const rows = [row("a", { title: "Setup" }), row("b", { title: "Bingo" }), row("c", {})];
    expect(sortRowKeys(rows, "title", 1, ctx)).toEqual(["b", "a", "c"]);
    expect(sortRowKeys(rows, "title", -1, ctx)).toEqual(["a", "b", "c"]);
  });
  test("numeric ordering for need, not lexical", () => {
    const rows = [row("a", { need: "10" }), row("b", { need: "2" })];
    expect(sortRowKeys(rows, "need", 1, ctx)).toEqual(["b", "a"]);
  });
  test("chronological ordering for date", () => {
    const rows = [row("a", { date: "Jul 26" }), row("b", { date: "Jul 25" })];
    expect(sortRowKeys(rows, "date", 1, ctx)).toEqual(["b", "a"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- gridSort.test`
Expected: FAIL — `Cannot find module '@/lib/domain/gridSort'`.

- [ ] **Step 3: Implement the domain module**

```ts
// lib/domain/gridSort.ts
import type { RawCells } from "@/lib/domain/gridRow";
import type { EventCtx } from "@/lib/domain/cells";
import { parseDateCell, parseTimeCell, parseNeedCell } from "@/lib/domain/cells";

export type SortColumn =
  | "title" | "kind" | "date" | "need" | "time" | "category" | "group" | "location";

export interface SortRow { key: string; cells: RawCells }

/** Comparable value for one row + column. Blank/unparseable → null (sorts last). */
export function sortValue(cells: RawCells, column: SortColumn, ctx: EventCtx): string | number | null {
  switch (column) {
    case "title": case "kind": case "category": case "group": case "location": {
      const s = cells[column].trim().toLowerCase();
      return s === "" ? null : s;
    }
    case "need": {
      if (cells.need.trim() === "") return null;
      const r = parseNeedCell(cells.need);
      return r.ok ? r.value : null;
    }
    case "date": {
      const r = parseDateCell(cells.date, ctx);
      if (!r.ok || r.value === null) return null;
      const { year, month, day } = r.value;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    case "time": {
      const r = parseTimeCell(cells.time);
      if (!r.ok) return null;
      const v = r.value;
      if (v.kind === "range" || v.kind === "start") return v.start;
      if (v.kind === "dueBy") return v.time; // may be null
      return null;
    }
  }
}

function compare(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/** Ordered row keys for a column + direction (1 asc, -1 desc). Nulls always last. */
export function sortRowKeys(rows: SortRow[], column: SortColumn, dir: 1 | -1, ctx: EventCtx): string[] {
  const tagged = rows.map((r, i) => ({ key: r.key, i, v: sortValue(r.cells, column, ctx) }));
  const valued = tagged.filter((x) => x.v !== null);
  const nulls = tagged.filter((x) => x.v === null);
  valued.sort((a, b) => {
    const c = compare(a.v as string | number, b.v as string | number);
    return c !== 0 ? c * dir : a.i - b.i; // stable on ties
  });
  return [...valued, ...nulls].map((x) => x.key);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npm test -- gridSort.test`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/gridSort.ts lib/domain/gridSort.test.ts
git commit -m "feat: pure grid sort ordering (type-aware, blanks last)"
```

---

### Task 2: GridRow — disable reordering when sorted

**Files:**
- Modify: `components/organize/GridRow.tsx`

`GridRow` renders the per-row move buttons (`aria-label="Move up, row N"` / `"Move down, row N"`) and the drag handle. Add an optional `reorderDisabled` prop (default `false`) and apply `disabled={reorderDisabled}` to both move buttons plus `aria-disabled` on the handle.

- [ ] **Step 1: Add the prop to the component's props type**

Find the `GridRow` props interface and add:

```ts
  reorderDisabled?: boolean;
```

- [ ] **Step 2: Disable the move buttons**

On each move `<button>` (the "Move up" and "Move down" buttons), add `disabled={reorderDisabled}` and a `disabled:opacity-40 disabled:cursor-not-allowed` class. On the drag-handle element add `aria-disabled={reorderDisabled}` and the same dimming classes when disabled.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (the prop is optional, so existing call sites still compile).

- [ ] **Step 4: Commit**

```bash
git add components/organize/GridRow.tsx
git commit -m "feat: GridRow can disable reordering (for sorted view)"
```

---

### Task 3: OrganizeGrid — sortable headers + manual toggle

**Files:**
- Modify: `components/organize/OrganizeGrid.tsx`
- Test: `components/organize/OrganizeGrid.test.tsx`

- [ ] **Step 1: Write the failing component test**

Add to `OrganizeGrid.test.tsx` (follow the existing mock setup already at the top of that file — it mocks `@/app/actions/organize` and `next/navigation`). `GRID_COLUMNS` labels render as buttons after this task.

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrganizeGrid } from "@/components/organize/OrganizeGrid";
import type { GridTask } from "@/lib/repository/organize";

const baseTask = (over: Partial<GridTask>): GridTask => ({
  id: over.id ?? "t", kind: "shift", title: "T", category: null, requestedGroup: null,
  neededCount: 1, date: null, startAt: null, endAt: null, dueBy: null, location: null,
  description: null, definitionOfDone: null, pointOfContact: null,
  position: over.position ?? 1024, signupCount: 0, ...over,
});
const event = {
  id: "e1", name: "E", status: "draft" as const,
  startDate: new Date("2026-07-24"), endDate: new Date("2026-07-26"),
};

function titlesInOrder(): string[] {
  return screen.getAllByLabelText(/^Title, row/i).map((el) => (el as HTMLInputElement).value);
}

test("clicking a column header sorts the rows; Manual order restores them", async () => {
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[
    baseTask({ id: "a", title: "Setup", position: 1024 }),
    baseTask({ id: "b", title: "Bingo", position: 2048 }),
  ]} />);
  expect(titlesInOrder()).toEqual(["Setup", "Bingo"]);

  await user.click(screen.getByRole("button", { name: /sort by title/i }));
  expect(titlesInOrder()).toEqual(["Bingo", "Setup"]);

  await user.click(screen.getByRole("button", { name: /manual order/i }));
  expect(titlesInOrder()).toEqual(["Setup", "Bingo"]);
});

test("reorder buttons disable while sorted", async () => {
  const user = userEvent.setup();
  render(<OrganizeGrid event={event} initialTasks={[
    baseTask({ id: "a", title: "Setup" }), baseTask({ id: "b", title: "Bingo", position: 2048 }),
  ]} />);
  await user.click(screen.getByRole("button", { name: /sort by title/i }));
  expect(screen.getAllByRole("button", { name: /move up/i })[0]).toBeDisabled();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- OrganizeGrid`
Expected: FAIL — no "Sort by Title" button (headers are plain text today).

- [ ] **Step 3: Add sort state and helpers**

Near the other `useState` calls in `OrganizeGrid`, add (import `sortRowKeys`, `type SortColumn` from `@/lib/domain/gridSort`):

```tsx
const [sort, setSort] = useState<{ column: SortColumn; dir: 1 | -1 } | null>(null);
const [sortedKeys, setSortedKeys] = useState<string[] | null>(null);

function onSort(column: SortColumn) {
  const dir: 1 | -1 = sort && sort.column === column ? (sort.dir === 1 ? -1 : 1) : 1;
  setSort({ column, dir });
  setSortedKeys(sortRowKeys(rows.map((r) => ({ key: r.key, cells: r.cells })), column, dir, ctx));
}
function toManual() { setSort(null); setSortedKeys(null); }

const displayedRows = sortedKeys
  ? sortedKeys.map((k) => rows.find((r) => r.key === k)).filter((r): r is RowState => !!r)
  : rows;
```

- [ ] **Step 4: Clear the sort when a row is added**

In `addRow`, `duplicateRow`, and `addManyTasks`, add `toManual();` as the first line (so a new blank row is visible at the end in manual order).

- [ ] **Step 5: Make the headers sort buttons with an indicator**

Replace the `GRID_COLUMNS.map(...)` header cell body with a button:

```tsx
{GRID_COLUMNS.map((c) => {
  const active = sort?.column === c.field;
  return (
    <th key={c.field} scope="col" className="p-2"
      aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(c.field as SortColumn)}
        className="inline-flex items-center gap-1 hover:text-lantern-deep"
        aria-label={`Sort by ${c.label}`}>
        {c.label}
        <span aria-hidden className={active ? "text-lantern" : "opacity-0"}>
          {active && sort!.dir === -1 ? "▼" : "▲"}
        </span>
      </button>
      {c.field === "kind" && (
        <> <HelpPopover label="Shift vs Frog">
          A <span className="font-semibold">Shift</span> is a scheduled time slot. A{" "}
          <span className="font-semibold">🐸 Frog</span> is a one-off need volunteers grab —
          it can take a “by” deadline instead of a time.
        </HelpPopover></>
      )}
    </th>
  );
})}
```

- [ ] **Step 6: Add the "Manual order" toggle button**

In the toolbar row (next to "+ Add row"), add — shown only when a sort is active:

```tsx
{sortedKeys && (
  <button type="button" onClick={toManual}
    className="rounded-lg border border-reed/40 bg-reed/5 px-3 py-1.5 font-semibold text-reed-deep transition hover:bg-reed/15">
    ↕ Manual order
  </button>
)}
```

- [ ] **Step 7: Render `displayedRows` and disable reorder while sorted**

Change the body map from `rows.map((row, i) => ...)` to `displayedRows.map((row, i) => ...)` and pass the new prop:

```tsx
{displayedRows.map((row, i) => (
  <GridRow key={row.key} row={row} index={i}
    onCell={onCell} onToggle={onToggle} onDelete={onDelete}
    onMove={onMove} onBlurRow={onBlurRow} onFillDown={onFillDown}
    reorderDisabled={sortedKeys !== null} />
))}
```

- [ ] **Step 8: Run the tests and watch them pass**

Run: `npm test -- OrganizeGrid gridSort.test`
Expected: PASS.

- [ ] **Step 9: Full verification**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add components/organize/OrganizeGrid.tsx components/organize/OrganizeGrid.test.tsx components/organize/GridRow.tsx
git commit -m "feat: sort the organizer grid by any column (non-destructive view)"
```

---

## Notes for the implementer

- `ctx` already exists in `OrganizeGrid` (built from the event's start/end dates) — reuse it for `sortRowKeys`.
- Sorting is a pure view: never call `reorderTasks` or change `position` from the sort path.
- Editing a cell mutates `rows` but not `sortedKeys`, so the row keeps its slot until the next header click — this is the desired "stable while editing" behavior, achieved for free because `displayedRows` orders by the frozen `sortedKeys`.
- Deleting a row removes it from `rows`; `displayedRows` filters out the now-missing key, so no extra bookkeeping is needed.
