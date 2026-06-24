# Organizer Grid Column Sort — Design Spec

Make each grid column header sortable. Sorting is a **non-destructive view**:
it reorders what the organizer sees without touching the saved `position`. A
"Manual order" control returns to the hand-tuned drag order.

Visual reference: `docs/design/grid-sort-and-filters-review.html`.

## Goal

An organizer clicks a column header to sort the grid by that column (ascending),
clicks again to reverse, and clicks "Manual order" to return to their saved drag
sequence. The saved order is never altered.

## Principles

- **Non-destructive.** Sorting never writes `position`; no server call, no undo
  needed.
- **Stable while editing.** Clicking a header snapshots the order. Editing a
  cell does not make its row jump; sort again to re-apply.
- **Type-aware.** Date and time sort chronologically, Need numerically, the rest
  alphabetically. Blank cells sort last in both directions.
- **Coherent with reordering.** Drag and up/down reorder are meaningful only in
  manual order, so they disable while a sort is active.

## Behavior

- Sortable columns: `title, kind, date, need, time, category, group, location`.
- Click an inactive header → ascending. Click the active header → toggle to
  descending, then ascending. "Manual order" → clear the sort.
- The active header shows a `▲`/`▼` arrow and `aria-sort`; "Manual order" is
  highlighted when no sort is active.
- **Snapshot order:** clicking a header computes an ordered array of row keys
  from the current rows and renders in that order. Editing a cell updates the
  row's data but not the snapshot (the row stays put). Adding a row clears the
  sort (returns to manual) so the new blank row lands at the end. Deleting a row
  drops its key from the snapshot.
- Sort is client-only and resets to manual on reload.

## Architecture

### Domain (pure, unit-tested) — `lib/domain/gridSort.ts`
```
export type SortColumn =
  | "title" | "kind" | "date" | "need" | "time" | "category" | "group" | "location";

// Comparable value for one row+column. null/blank → sorts last.
export function sortValue(row: GridSortRow, column: SortColumn): string | number | null;

// Ordered row keys for a column+direction (1 asc, -1 desc); blanks always last.
export function sortRowKeys(rows: GridSortRow[], column: SortColumn, dir: 1 | -1): string[];
```
- `GridSortRow` is the minimal shape the comparator needs: the row `key` plus
  the underlying values. Saved rows carry typed fields (`date: Date | null`,
  `neededCount: number`, `startAt: Date | null`, and the strings); unsaved rows
  fall back to their raw cell text. `sortValue` extracts:
  - `title/kind/category/group/location` → lowercased trimmed string (blank → null).
  - `need` → number (blank → null).
  - `date` → the calendar day as an ISO string (unset → null).
  - `time` → `startAt` minutes-from-midnight; a frog/`dueBy` or unset → null (last).
- `sortRowKeys` sorts non-null values by `dir`, then appends null-valued rows in
  their existing relative order.

### Component — `components/organize/OrganizeGrid.tsx`
- New state: `sort: { column: SortColumn; dir: 1 | -1 } | null` and
  `sortedKeys: string[] | null`.
- Each column `<th>` becomes a `<button>`; clicking updates `sort` and
  recomputes `sortedKeys` via `sortRowKeys`. Set `aria-sort` on the active `<th>`.
- Display order: `sortedKeys` present → render rows in that key order; else the
  manual `rows` order. Add/delete update `sortedKeys` per the snapshot rules.
- Disable the drag handle and up/down buttons (and the fill-down handle's
  reorder implications stay unaffected) while sorted; re-enable in manual order.
- A "Manual order" toggle button clears `sort`/`sortedKeys`.

No schema, repository, or server-action changes.

## Accessibility

- Header sort triggers are real buttons, keyboard-operable.
- `aria-sort="ascending" | "descending" | "none"` on each column header.
- The existing grid a11y (row/cell labels) is unchanged.

## Testing (TDD)

- **Domain unit (`gridSort.test.ts`):** `sortValue` per column type; `sortRowKeys`
  ascending/descending for string, number, date, and time columns; blanks always
  last; a stable snapshot for equal keys.
- **Component unit (`OrganizeGrid` tests):** clicking a header orders the visible
  rows; clicking again reverses; "Manual order" restores the original order; the
  drag handle is disabled while sorted; adding a row returns to manual order.

## Out of scope

Persisting the sort across reloads (sticky), multi-column sort, and any sort that
renumbers `position`.
