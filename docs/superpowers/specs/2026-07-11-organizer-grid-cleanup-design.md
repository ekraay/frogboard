# Organizer Task-Grid Cleanup: Design Spec

**Sub-project of the organizer experience.**
Reclaim the organizer event page (`/organize/[eventId]`) so the task grid is the star:
fold sharing into the status banner, filter and search a long grid, reorder rows by
dragging, and replace placeholder ghost text with type-ahead autocomplete.

---

## Why (the live pain)

The event page has accreted chrome above the grid: a full-width "Public link" card, the
Live banner, and now the Group rollups and Leads panels. The actual work surface, the task
grid, starts far down the page. Inside the grid, a real event runs to dozens of rows of
repeated values (every row "Shift", "Gym", "Scouts, YAO"), with no way to narrow to the few
you want. Reordering is a pair of tiny up/down arrows on every row. And every empty cell
shows placeholder text ("Food, Games, Setup…") that reads like real data, so a blank grid
looks half-filled.

## Goal

1. **Sharing lives in the status banner.** Remove the Public link card and the header's
   "View signup page" link; the banner carries the URL, open, copy, and edit.
2. **Filter and search the grid.** Facet dropdowns plus a title search narrow a long grid,
   as a non-destructive view.
3. **Drag-and-drop reordering** replaces the up/down arrows.
4. **Type-ahead autocomplete** on the repeated text columns, with no ghost-text values.

## North star

The grid is the tool; everything else is trim. Cut the trim, and make the grid quick to
navigate at 60 rows, not just 6. Reuse the app's existing patterns and "Matsuri at Dusk"
identity; add no new visual vocabulary.

---

## Architecture

Pure view-layer work. No schema, repository, or data-model change. Touched files:

- `components/organize/OrganizeGrid.tsx` (the banner, the filter bar, the drag model, the
  datalists)
- `components/organize/GridRow.tsx` (drag handle instead of arrows; datalist + no-placeholder
  on text columns)
- `components/organize/SlugEditor.tsx` (refactor from a full card into a compact inline editor
  the banner reveals)
- `app/organize/[eventId]/page.tsx` (drop the "View signup page" header link and the standalone
  SlugEditor block)
- New pure helper `lib/domain/gridFilter.ts` (+ test) for filtering grid rows
- Reused as-is: `reorderTasks` (persist order), `gridSort` (`reorderDisabled` precedent),
  the "Matsuri at Dusk" Tailwind tokens.

The existing public-board filter (`filterTasks` / `facetOptions` in `lib/domain/board.ts`)
operates on `BoardTask`. The grid holds `RowState.cells` (`RawCells`), a different shape, so
the grid gets its own small, tested filter helper rather than contorting the board's.

---

## Design details

### 1. Status banner absorbs sharing

The Live/Draft banner already announces state and holds the publish toggle. It becomes the
single home for state plus sharing:

```
🏮 Live at frogboard.vercel.app/ginza-2026 ↗   [Copy link] [Edit link]      [Close sign-ups]
```

- The URL (and its ↗) is a link that opens the public board in a new tab, replacing the old
  header "View signup page" link with no loss of function.
- **Copy link** copies the URL. On success the button label confirms in place ("Copied ✓")
  for a moment, then reverts.
- **Edit link** reveals the slug editor inline (the refactored `SlugEditor`); saving hides it
  again. `SlugEditor` keeps its current validation and server action; only its shell changes
  from a card to an inline form.
- **Draft state** shows the eventual URL ("Draft · will publish to frogboard.vercel.app/…")
  so the organizer can copy or set the slug before opening sign-ups.
- The standalone "Public link" card and the header link are deleted. The header keeps only
  **History** and **← All events**.

### 2. Filter and search bar

A compact bar sits between the grid toolbar (Paste / Add row / Duplicate) and the table.

- **Facets:** Category, Group, Date, Location, Kind. Each dropdown's options are the distinct
  non-empty values present in the current rows (so it always reflects real content). Facets
  combine with AND.
- **Search:** a text box matching the Title (case- and space-insensitive substring).
- **Non-destructive:** filtering hides non-matching rows; it never edits or deletes. A summary
  line reads "Showing 8 of 47 · Clear filters". **Clear filters** resets all facets and the
  search.
- **Empty result:** "No tasks match. Clear a filter to see more." (directive, not a dead end).
- **Interaction with reorder and sort:** while any filter, search, or column-sort is active,
  drag-reordering is disabled, extending the existing `reorderDisabled` rule. You cannot
  hand-order a partial or re-sorted view.
- **Logic:** a new pure `gridFilter.ts` exposes `filterRows(rows, facets, search)` and
  `gridFacetOptions(rows)`, unit-tested, mirroring the board's approach on the grid's cell
  shape.

### 3. Drag-and-drop reordering

- Replace the two ↑/↓ buttons in the first column with a single **drag handle** (a grip
  glyph). Dragging a row to a new position reorders the grid and persists via the existing
  `reorderTasks(eventId, orderedIds)` action, exactly as the arrows do today.
- **Touch: tap-to-move, not drag-only.** The app is mobile-first, and pointer drag on a
  touch spreadsheet is unreliable. So the handle supports a **tap-to-move** path: tap the
  handle to "pick up" the row (it highlights and shows "Tap where it goes"), then tap another
  row's handle to drop it there; tap the picked-up handle again to cancel. This is the primary
  touch interaction; mouse users get pointer drag; both persist through the same
  `reorderTasks`. The backlog flagged this explicitly: Phase 2 avoided pointer-only DnD for
  mobile/a11y and wants a tap-to-move fallback.
- **Keyboard accessibility is preserved:** the current Alt+ArrowUp / Alt+ArrowDown move stays,
  bound to the focusable handle, so reordering never requires a mouse. The handle carries an
  `aria-label` describing the move and its picked-up state (`aria-pressed`).
- **No new dependency.** Native pointer/drag plus the tap-to-move state covers a single-list
  reorder; dnd-kit is the documented alternative if robustness later demands it, but the
  recommendation is to avoid the dependency now.
- **Reduced motion:** row-shift transitions respect `prefers-reduced-motion`.
- Disabled (with the handle dimmed) while a filter, search, or sort is active, matching §2.

### 4. Type-ahead autocomplete, no ghost values

- **Category, Group, Location** inputs gain a `<datalist>` of the distinct values already in
  the grid (one shared datalist per column, computed from current rows). Typing suggests and
  completes; the coordinator reuses "Grounds" instead of retyping it.
- Their **placeholder ghost text is removed**, so an empty cell reads as empty.
- **Date, Need, Time** keep their short format hints ("Jul 25", "#", "10am–1pm"): those teach
  syntax, not fake values, and are the format guidance the parsers depend on.

---

## Frontend-design check

Run against the frontend-design skill. This is a refinement inside an established identity, so
the skill's "invent a distinctive new visual language" guidance does not apply; its quality,
writing, and restraint principles do.

- **Identity reuse:** no new palette or type. Every color and control reuses the existing
  "Matsuri at Dusk" tokens (`reed`, `lantern`, `ink`, `lily`, `pond`) and the current
  component styles. The banner, filter bar, and handle look like the app, not a bolt-on.
- **Restraint ("remove one accessory"):** the defining move is subtraction. Deleting the
  Public link card and a redundant header link is the cleanup; nothing decorative is added.
- **Quality floor:** reorder works by mouse (drag), touch (**tap-to-move**), and keyboard
  (Alt+Arrow retained), so it is never drag-only; visible focus on the new handle, filter
  controls, and inline slug editor; `prefers-reduced-motion` respected on drag; the bar and
  banner wrap on mobile. Verified by the axe check.
- **Writing as design material:** active-voice, sentence-case, end-user vocabulary, consistent
  through each flow.
  - Buttons name the result: **Copy link** → "Copied ✓"; **Edit link** reveals the editor;
    **Clear filters** clears them.
  - The summary states fact, not mood: "Showing 8 of 47".
  - The empty state directs: "No tasks match. Clear a filter to see more."
  - Vocabulary stays consistent with the app ("link", "sign-ups", "Live"); no new synonyms.
- **Structure is information:** the filter bar and the "Showing X of Y" count encode real
  state (what's hidden); the drag handle affords a real action. No decorative numbering or
  dividers added.

---

## Testing

TDD, matching the repo: red → green → refactor.

- **Domain unit tests** (`lib/domain/gridFilter.test.ts`): `filterRows` narrows by each facet,
  combines facets with AND, matches the title search case-insensitively, and returns all rows
  when empty; `gridFacetOptions` lists distinct non-empty values per column.
- **Component tests** (`components/organize/OrganizeGrid.test.tsx`, `GridRow.test.tsx`):
  - The banner shows the URL link, Copy link, and Edit link; Edit reveals the slug editor.
  - A facet and the search each narrow the visible rows; "Showing X of Y" and Clear appear;
    the empty state shows its message.
  - Reordering persists a new order (asserting `reorderTasks` is called with the new ids) via
    pointer drag, **tap-to-move** (tap a handle to pick up, tap another to drop), and Alt+Arrow;
    all three are disabled while a filter/search/sort is active.
  - Category/Group/Location render a datalist of existing values and carry no placeholder;
    Date/Need/Time keep their format hints.
- **Accessibility:** the page passes the repo axe check with zero violations, including
  keyboard reorder and focus states.
- Before done: `npm test` and `npm run test:db` green, plus `npx tsc --noEmit` and
  `npm run lint`.

## Scope

**In:** the four changes above, on the organizer event page and its grid components.

**Out (no evidence of need):**
- The organizer **home** event list (its own filtering is a separate idea, not this spec).
- The public board, the data model, and the server/repository layer (untouched).
- The Group rollups and Leads panels (they also add page height; a separate cleanup if wanted).
- A drag-and-drop **library**; multi-select or bulk row operations; saved filter presets.

## Writing style

Repo CLAUDE.md: omit needless words, active voice, no em dash. Applies to code comments and
commit messages.
