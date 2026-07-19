# Archive Ongoing Boards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give ongoing (standing) boards the same Archive / Restore / Delete lifecycle dated events already have, through one shared control component.

**Architecture:** Extract the archive controls from `EventList` into a new client component `ArchiveControls.tsx` (two exports: `ArchiveButton`, `ArchivedSection`). Refactor `EventList` to consume it (it becomes a server component), then add the same controls to `StandingBoardList`. No schema, repo, or action changes: `setEventStatusAction` and `deleteEventAction` already operate on any Event row, and every public read query already filters `status: "published"`.

**Tech Stack:** Next.js App Router, React server/client components, Vitest + Testing Library (jsdom), Tailwind with the Matsuri at Dusk tokens.

**Spec:** `docs/superpowers/specs/2026-07-18-archive-ongoing-boards-design.md`

## Global Constraints

- TDD: failing test first, watch it fail, minimal code, watch it pass.
- Design tokens only (`text-ink-soft`, `border-lily-line`, `bg-lily`, `text-pond`, `text-lantern-deep`, `hover:bg-lantern/10`); never hardcode hexes.
- No em dashes in any prose or UI copy.
- Transition granularity (pinned by spec): each `ArchiveButton` owns one transition; each archived row owns one transition shared by its Restore and Delete pair. Per-row pending replaces the old page-wide disable, deliberately.
- Restore sets status to `draft`, never `published`.
- Delete confirm wording, verbatim (curly quotes included): `` Permanently delete “${name}” and all its tasks and signups? This can't be undone. ``
- Aria labels: `Archive <name>`, `Restore <name>`, `Delete <name>`.
- Done means: `npm test`, `npm run test:db`, `npx tsc --noEmit`, `npm run lint` all green.

**Branch:** create `archive-ongoing-boards` from `main` before Task 1 (`git checkout main && git pull && git checkout -b archive-ongoing-boards`). The spec and this plan live on `groups-membership-foundation`; copy them over if the execution worktree starts from main without them (they carry no code).

---

### Task 1: ArchiveControls component

**Files:**
- Create: `components/organize/ArchiveControls.tsx`
- Test: `components/organize/ArchiveControls.test.tsx`

**Interfaces:**
- Consumes: `setEventStatusAction(eventId: string, status: EventStatus)` and `deleteEventAction(eventId: string)` from `@/app/actions/organize` (both exist).
- Produces: `ArchiveButton({ id, name }: { id: string; name: string })` and `ArchivedSection({ items }: { items: { id: string; name: string }[] })`, both client components. Tasks 2 and 3 import exactly these.

- [ ] **Step 1: Write the failing tests**

Create `components/organize/ArchiveControls.test.tsx` (mock pattern copied from `EventList.test.tsx`, which mocks the actions module and `useRouter`):

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const setEventStatusAction = vi.fn();
const deleteEventAction = vi.fn();
vi.mock("@/app/actions/organize", () => ({
  setEventStatusAction: (id: string, s: string) => setEventStatusAction(id, s),
  deleteEventAction: (id: string) => deleteEventAction(id),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ArchiveButton, ArchivedSection } from "@/components/organize/ArchiveControls";

beforeEach(() => {
  setEventStatusAction.mockReset(); deleteEventAction.mockReset();
  setEventStatusAction.mockResolvedValue({ ok: true });
  deleteEventAction.mockResolvedValue({ ok: true });
});

test("ArchiveButton archives its item", async () => {
  const user = userEvent.setup();
  render(<ArchiveButton id="b1" name="Temple Needs" />);
  await user.click(screen.getByRole("button", { name: /archive temple needs/i }));
  expect(setEventStatusAction).toHaveBeenCalledWith("b1", "archived");
});

test("ArchivedSection shows the count and restores to draft", async () => {
  const user = userEvent.setup();
  render(<ArchivedSection items={[{ id: "a", name: "Old Board" }]} />);
  expect(screen.getByText(/archived \(1\)/i)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /restore old board/i }));
  expect(setEventStatusAction).toHaveBeenCalledWith("a", "draft");
});

test("deleting asks for confirmation first", async () => {
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  const user = userEvent.setup();
  render(<ArchivedSection items={[{ id: "a", name: "Old Board" }]} />);
  await user.click(screen.getByRole("button", { name: /delete old board/i }));
  expect(confirmSpy).toHaveBeenCalled();
  expect(deleteEventAction).toHaveBeenCalledWith("a");
  confirmSpy.mockRestore();
});

test("declining the delete confirm does nothing", async () => {
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  const user = userEvent.setup();
  render(<ArchivedSection items={[{ id: "a", name: "Old Board" }]} />);
  await user.click(screen.getByRole("button", { name: /delete old board/i }));
  expect(deleteEventAction).not.toHaveBeenCalled();
  confirmSpy.mockRestore();
});

test("ArchivedSection renders nothing when empty", () => {
  const { container } = render(<ArchivedSection items={[]} />);
  expect(container).toBeEmptyDOMElement();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- ArchiveControls`
Expected: FAIL, cannot resolve `@/components/organize/ArchiveControls`.

- [ ] **Step 3: Implement ArchiveControls**

Create `components/organize/ArchiveControls.tsx`. All styling is lifted verbatim from `EventList.tsx`; only the transition scope changes (per button / per row instead of page-wide):

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setEventStatusAction, deleteEventAction } from "@/app/actions/organize";

// Shared archive lifecycle controls for /organize lists (dated events and
// ongoing boards). Each button or row owns its own transition, so acting on
// one item leaves the rest of the page clickable.
export function ArchiveButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Archive ${name}`}
      onClick={() => startTransition(async () => {
        await setEventStatusAction(id, "archived");
        router.refresh();
      })}
      className="rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition hover:bg-lily disabled:opacity-50"
    >
      Archive
    </button>
  );
}

export function ArchivedSection({ items }: { items: { id: string; name: string }[] }) {
  if (items.length === 0) return null;
  return (
    <details className="mt-6">
      <summary className="cursor-pointer text-sm font-semibold text-ink-soft hover:text-ink">
        Archived ({items.length})
      </summary>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <ArchivedRow key={item.id} id={item.id} name={item.name} />
        ))}
      </ul>
    </details>
  );
}

// One transition per row: Restore and Delete disable together, so the same
// row can never run both at once.
function ArchivedRow({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run(fn: () => Promise<unknown>) {
    startTransition(async () => { await fn(); router.refresh(); });
  }
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-lily-line bg-lily/30 px-4 py-2 text-sm">
      <span className="min-w-0 truncate font-medium text-ink-soft">{name}</span>
      <span className="flex shrink-0 gap-1">
        <button
          type="button"
          disabled={pending}
          aria-label={`Restore ${name}`}
          onClick={() => run(() => setEventStatusAction(id, "draft"))}
          className="rounded-lg px-3 py-1.5 font-semibold text-pond transition hover:bg-white disabled:opacity-50"
        >
          Restore
        </button>
        <button
          type="button"
          disabled={pending}
          aria-label={`Delete ${name}`}
          onClick={() => {
            if (window.confirm(`Permanently delete “${name}” and all its tasks and signups? This can't be undone.`)) {
              run(() => deleteEventAction(id));
            }
          }}
          className="rounded-lg px-3 py-1.5 font-semibold text-lantern-deep transition hover:bg-lantern/10 disabled:opacity-50"
        >
          Delete
        </button>
      </span>
    </li>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- ArchiveControls`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/organize/ArchiveControls.tsx components/organize/ArchiveControls.test.tsx
git commit -m "feat(organize): shared ArchiveControls (ArchiveButton + ArchivedSection)"
```

---

### Task 2: Refactor EventList onto ArchiveControls

**Files:**
- Modify: `components/organize/EventList.tsx` (full rewrite below)
- Test: `components/organize/EventList.test.tsx` (existing tests are the safety net; no edits expected)

**Interfaces:**
- Consumes: `ArchiveButton`, `ArchivedSection` from Task 1.
- Produces: `EventList({ events }: { events: EventListItem[] })`, now a server component. `app/organize/page.tsx` needs no change.

This is a refactor: the existing four tests define the behavior. Red is "tests green before", proof is "tests still green after".

- [ ] **Step 1: Confirm the existing tests pass before touching anything**

Run: `npm test -- EventList`
Expected: 4 tests PASS.

- [ ] **Step 2: Rewrite EventList**

Replace the whole of `components/organize/EventList.tsx` with:

```tsx
import Link from "next/link";
import { ArchiveButton, ArchivedSection } from "@/components/organize/ArchiveControls";
import type { EventListItem } from "@/lib/repository/organize";

export function EventList({ events }: { events: EventListItem[] }) {
  const active = events.filter((e) => e.status !== "archived");
  const archived = events.filter((e) => e.status === "archived");

  return (
    <div className="mb-8">
      <ul className="space-y-3">
        {active.map((e) => (
          <li
            key={e.id}
            className="flex items-center gap-1 rounded-2xl border border-lily-line bg-white pr-2 shadow-sm transition hover:border-reed"
          >
            <Link href={`/organize/${e.id}`} className="flex flex-1 items-center justify-between gap-3 p-4">
              <span className="font-bold text-ink">{e.name}</span>
              <span className="flex items-center gap-3 text-sm">
                <span className="text-ink-soft">{e.taskCount} tasks</span>
                {e.status === "published"
                  ? <span className="rounded-full bg-amber/20 px-3 py-1 font-bold text-lantern-deep">🏮 Sign-ups open</span>
                  : <span className="rounded-full bg-lily px-3 py-1 font-bold text-ink-soft">🌱 Draft</span>}
              </span>
            </Link>
            <ArchiveButton id={e.id} name={e.name} />
          </li>
        ))}
        {active.length === 0 && (
          <li className="text-ink-soft">No events yet. Create the first one below.</li>
        )}
      </ul>
      <ArchivedSection items={archived} />
    </div>
  );
}
```

Notes: the `"use client"` directive, `useTransition`, `useRouter`, and action imports are gone; the client bits live in `ArchiveControls`. The empty-state copy drops its em dash (AGENTS.md forbids em dashes in UI copy; the old line violated it).

- [ ] **Step 3: Run the EventList tests to verify the refactor holds**

Run: `npm test -- EventList`
Expected: 4 tests PASS, unchanged.

- [ ] **Step 4: Run the full unit suite**

Run: `npm test`
Expected: PASS (catches any other consumer of EventList).

- [ ] **Step 5: Commit**

```bash
git add components/organize/EventList.tsx
git commit -m "refactor(organize): EventList consumes ArchiveControls, becomes a server component"
```

---

### Task 3: Archive controls on StandingBoardList

**Files:**
- Modify: `components/organize/StandingBoardList.tsx` (full rewrite below)
- Test: `components/organize/StandingBoardList.test.tsx` (extend; existing three tests keep passing)

**Interfaces:**
- Consumes: `ArchiveButton`, `ArchivedSection` from Task 1; `StandingBoardItem` from `@/lib/repository/organize` (unchanged: `{ id, name, slug, status, taskCount }`).
- Produces: `StandingBoardList({ boards }: { boards: StandingBoardItem[] })`, same signature as today. `app/organize/page.tsx` needs no change.

- [ ] **Step 1: Add the failing tests**

Append to `components/organize/StandingBoardList.test.tsx`, and add the mocks the new controls need at the top of the file (before the component import, mirroring `EventList.test.tsx`):

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const setEventStatusAction = vi.fn();
const deleteEventAction = vi.fn();
vi.mock("@/app/actions/organize", () => ({
  setEventStatusAction: (id: string, s: string) => setEventStatusAction(id, s),
  deleteEventAction: (id: string) => deleteEventAction(id),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { StandingBoardList } from "@/components/organize/StandingBoardList";
import type { StandingBoardItem } from "@/lib/repository/organize";

function board(overrides: Partial<StandingBoardItem> = {}): StandingBoardItem {
  return { id: "b1", name: "Temple needs", slug: "temple-needs", status: "draft", taskCount: 3, ...overrides };
}

beforeEach(() => {
  setEventStatusAction.mockReset(); deleteEventAction.mockReset();
  setEventStatusAction.mockResolvedValue({ ok: true });
  deleteEventAction.mockResolvedValue({ ok: true });
});
```

(The three existing tests stay as they are.) New tests:

```tsx
test("an active board can be archived", async () => {
  const user = userEvent.setup();
  render(<StandingBoardList boards={[board()]} />);
  await user.click(screen.getByRole("button", { name: /archive temple needs/i }));
  expect(setEventStatusAction).toHaveBeenCalledWith("b1", "archived");
});

test("archived boards move to the Archived section", () => {
  render(<StandingBoardList boards={[board(), board({ id: "b2", name: "Old Temple", status: "archived" })]} />);
  expect(screen.getByText(/archived \(1\)/i)).toBeInTheDocument();
  // the archived board is out of the active list: no workspace link
  expect(screen.queryByRole("link", { name: /old temple/i })).toBeNull();
  expect(screen.getByRole("button", { name: /restore old temple/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /delete old temple/i })).toBeInTheDocument();
});

test("an all-archived list keeps the section and says so", () => {
  render(<StandingBoardList boards={[board({ status: "archived" })]} />);
  expect(screen.getByText(/ongoing boards/i)).toBeInTheDocument();
  expect(screen.getByText(/all ongoing boards are archived\./i)).toBeInTheDocument();
  expect(screen.getByText(/archived \(1\)/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm test -- StandingBoardList`
Expected: 3 existing tests PASS, 3 new tests FAIL (no archive button, no Archived section, no empty-state line).

- [ ] **Step 3: Rewrite StandingBoardList**

Replace the whole of `components/organize/StandingBoardList.tsx` with:

```tsx
import Link from "next/link";
import { ArchiveButton, ArchivedSection } from "@/components/organize/ArchiveControls";
import type { StandingBoardItem } from "@/lib/repository/organize";

// Ongoing (evergreen) boards live outside the dated-event list, so the
// organizer index surfaces them here with a link back to each workspace.
export function StandingBoardList({ boards }: { boards: StandingBoardItem[] }) {
  if (boards.length === 0) return null;
  const active = boards.filter((b) => b.status !== "archived");
  const archived = boards.filter((b) => b.status === "archived");
  return (
    <div className="mb-8">
      <h2 className="mb-3 font-display text-lg font-bold text-ink">Ongoing boards</h2>
      <ul className="space-y-3">
        {active.map((b) => (
          <li
            key={b.id}
            className="flex items-center gap-1 rounded-2xl border border-lily-line bg-white pr-2 shadow-sm transition hover:border-reed"
          >
            <Link href={`/organize/${b.id}`} className="flex flex-1 items-center justify-between gap-3 p-4">
              <span className="font-bold text-ink">🪷 {b.name}</span>
              <span className="flex items-center gap-3 text-sm">
                <span className="text-ink-soft">{b.taskCount} tasks</span>
                {b.status === "published"
                  ? <span className="rounded-full bg-amber/20 px-3 py-1 font-bold text-lantern-deep">🏮 Live</span>
                  : <span className="rounded-full bg-lily px-3 py-1 font-bold text-ink-soft">🌱 Draft</span>}
              </span>
            </Link>
            {b.slug && (
              <Link
                href={`/${b.slug}`}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-pond transition hover:bg-lily"
              >
                View board
              </Link>
            )}
            <ArchiveButton id={b.id} name={b.name} />
          </li>
        ))}
        {active.length === 0 && (
          <li className="text-ink-soft">All ongoing boards are archived.</li>
        )}
      </ul>
      <ArchivedSection items={archived} />
    </div>
  );
}
```

Note the early `return null` stays keyed on the full `boards` list (spec: an all-archived list still renders the section; the "renders nothing" test covers the truly empty case).

- [ ] **Step 4: Run the tests to verify all pass**

Run: `npm test -- StandingBoardList`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/organize/StandingBoardList.tsx components/organize/StandingBoardList.test.tsx
git commit -m "feat(organize): archive, restore, and delete for ongoing boards"
```

---

### Task 4: Full verification

**Files:** none new; this is the done-check the AGENTS.md contract requires.

- [ ] **Step 1: Run every suite**

```bash
npm test && npm run test:db && npx tsc --noEmit && npm run lint
```

Expected: all four green. `test:db` is untouched by this change but guards the repo layer (`setEventStatus`, `deleteEvent`).

- [ ] **Step 2: Verify in the running app**

Start the dev server (`npm run dev`) and on `/organize`:
- The Temple Needs ongoing board row shows an Archive button; clicking it moves the board into "Archived (1)".
- The garden home `/` no longer lists it; `/temple-needs` returns the not-found page.
- Restore brings it back as Draft; the public page stays 404 until republished (correct: restore lands in draft).
- Dated events still archive, restore, and delete exactly as before.

- [ ] **Step 3: Commit anything outstanding and hand off**

If verification changed nothing, there is nothing to commit. Follow superpowers:finishing-a-development-branch for merge/PR.
