# Board Facet Filters — Design Spec

Let the public board filter its tasks by combinable facets (day, group,
category, location) through an on-page filter bar that drives shareable URL
params. Generalizes today's single `?group=` filter.

Visual reference: `docs/design/grid-sort-and-filters-review.html`.

## Goal

A volunteer narrows the board to the shifts that fit them by stacking facets:
"Saturday + Scouts + Food". The selection lives in the URL, so the link is
shareable, and the coverage header reflects the filtered set.

## Principles

- **Self-service.** Volunteers pick filters on the page; no organizer needed.
- **Shareable.** Every filter state is a URL: `/ginza-2026?day=2026-07-25&group=Scouts`.
- **Combinable (AND).** Each added facet narrows further.
- **Mobile-first, non-destructive.** A view over the data; "Clear" resets.

## Behavior

- Facets: **day** (calendar date), **group** (`requestedGroup`), **category**,
  **location**. Combined with AND.
- URL params: `?day=YYYY-MM-DD&group=…&category=…&location=…`. The `day` value is
  the ISO calendar day (via the existing `tzIsoDate`). **Back-compat:** `?group=`
  keeps working (it is simply the group facet).
- **Filter bar:** one control per facet. Options are the event's distinct,
  non-empty values for that facet, derived from its tasks; `day` options carry the
  friendly weekday label. Each control has an "Any …" unset option. Selecting a
  value navigates to the updated URL (preserving the other facets); a **Clear
  filters** control resets all. Active facets are visually marked.
- **Coverage header** reflects the filtered set: "Showing <facet values joined by
  ·> — X of Y covered", reusing `coverageFor`. With no facets active, the board
  renders normally (no header), matching today.
- Results still group by day (`groupTasksByDay`). A friendly **empty state**
  shows when nothing matches, with a way to clear.

## Architecture

### Domain (pure, unit-tested) — `lib/domain/board.ts`
```
export interface Facets { day?: string; group?: string; category?: string; location?: string }

// AND across the provided facets; case/space-insensitive on group/category/location;
// day matches tzIsoDate(task.date) === facets.day. Absent/blank facet = no constraint.
export function filterTasks(tasks: BoardTask[], facets: Facets): BoardTask[];

// Distinct non-empty values present in the tasks, for building the bar.
export function facetOptions(tasks: BoardTask[]): {
  day: { value: string; label: string }[];   // value = ISO day, label = weekday
  group: string[]; category: string[]; location: string[];
};
```
- `filterTasksByGroup` is reimplemented as `filterTasks(tasks, { group })` (or kept
  as a thin wrapper) so the existing `?group=` path is unchanged.
- `facetOptions` returns days sorted chronologically; group/category/location
  sorted case-insensitively.

### Page — `app/[slug]/page.tsx`
- Read `day`, `group`, `category`, `location` from `searchParams` (first value if
  an array). Build a `Facets`.
- `const tasks = filterTasks(board.tasks, facets)`,
  `const options = facetOptions(board.tasks)`.
- Pass to `Board`: the filtered `tasks`, the active `facets`, the `options`, and
  `coverageFor(tasks)`.

### Components
- **`components/FilterBar.tsx`** (client): renders a control per facet from
  `options` and the current `facets`; on change, builds the next query string
  (preserving the slug and other facets) and navigates with the router. A Clear
  control removes all facet params. Selected controls are marked.
- **`components/Board.tsx`**: accept a generalized `filter` summary (the active
  facet labels + `covered`/`total`) plus the `FilterBar`. Render the coverage
  header, the bar, and the empty state. The previous single-`group` header
  collapses into this generalized header.

No schema, repository, or server-action changes.

## Edge cases

- A facet value not in the options (stale link) filters to empty → empty state.
- A param given multiple times → take the first.
- Free-text group/category/location from the grid feed the options as-is.

## Testing (TDD)

- **Domain unit (`board.test.ts`):** `filterTasks` AND logic per facet and in
  combination; case/space-insensitivity on group/category/location; `day` matches
  by calendar day; absent facets pass through. `facetOptions` returns distinct,
  sorted, labeled values; ignores blanks.
- **Component unit:** `FilterBar` renders options from data, marks active facets,
  navigates with the combined query on change, and Clear removes the params;
  `Board` renders the coverage header for the filtered set and the empty state.
- **E2E (extend `e2e/slug.spec.ts`):** `/<slug>?day=…&group=Scouts` narrows the
  list and the coverage header reflects it.

## Out of scope

A time facet, free-text search, per-option result counts, multi-select within a
single facet, and persistence beyond the URL.
