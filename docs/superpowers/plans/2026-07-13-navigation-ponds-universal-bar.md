# Navigation: Ponds IA and the Universal Bar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Universal Nav bar that answers "where am I" on every oriented surface, and rename the `TaskKind` "frog" to "quick" so the ponds metaphor (frog = volunteer, lily pad = task) stays clean.

**Architecture:** A pure `lib/domain/nav.ts` computes the breadcrumb segments and the persona's right-cluster actions. A presentational `<SiteNav>` server component renders them from a `NavContext` the page assembles. Pages that want orientation render `<SiteNav>` behind `FLAG_NAV`; the chrome-free youth RSVP surface renders nothing. The rename is a Postgres enum-value rename plus mechanical literal swaps.

**Tech Stack:** Next.js App Router (server components), Prisma 6 + Postgres, Tailwind v4 `@theme` tokens, Vitest + Testing Library.

## Global Constraints

- **Read the Next.js guide before writing route code:** `node_modules/next/dist/docs/`. This is NOT stock Next.js.
- **Strict TDD, red → green → refactor.** No production code without a failing test first. Mechanical renames and pure schema migrations are verified by running the full suites instead.
- **Prisma pinned to v6** (`^6.19.3`). Do not upgrade.
- **Feature flag `FLAG_NAV`**, using the existing `flagEnabled("nav", { cookies })` pattern. Dark in production, on by default outside production.
- **Metaphor vocabulary, verbatim:** frog = volunteer, lily pad = open spot, pond = group, garden = org, gathering = event. Primary CTA everywhere: **"Hop to it."**
- **Never use the em dash** in any copy or comment. Use a comma, colon, parentheses, or two sentences.
- **Verification gate before "done":** `npm test`, `npm run test:db`, `npx tsc --noEmit`, and `npm run lint` all clean.
- **Emoji honesty:** 🐸 means the volunteer (person), never a task. A task marker is 🪷 (quick) or 🎐 (shift).

---

## File Structure

**Rename (Tasks 1-2):**
- Modify `prisma/schema.prisma` — enum `TaskKind { shift quick }`
- Create `prisma/migrations/20260713120000_rename_taskkind_frog_to_quick/migration.sql`
- Modify `lib/domain/types.ts`, `lib/domain/when.ts`, `lib/domain/time.ts`, `lib/domain/gridRow.ts`, `lib/domain/paste.ts`, `lib/domain/import.ts`, `lib/repository/organize.ts`, `prisma/seed.ts` (value literals)
- Modify `components/BoardCard.tsx`, `components/TaskCard.tsx`, `components/ClaimForm.tsx`, `components/Board.tsx`, `components/board/TaskPanel.tsx` (display copy)
- Update the matching `*.test.ts(x)` for every file above

**Universal bar (Tasks 3-8):**
- Create `lib/domain/nav.ts` + `lib/domain/nav.test.ts` — pure breadcrumb + action logic
- Create `components/SiteNav.tsx` + `components/SiteNav.test.tsx` — the bar
- Create `components/ShareButton.tsx` + `components/ShareButton.test.tsx` — organizer copy-link
- Modify `app/[slug]/page.tsx`, `app/b/[slug]/page.tsx` — volunteer boards render the bar
- Modify `app/lead/[token]/page.tsx`, `lib/repository/leads.ts` — lead page renders the bar
- Modify `app/organize/page.tsx`, `app/organize/[eventId]/page.tsx` — organizer renders the bar

---

## Task 1: Rename the TaskKind value frog → quick (schema + domain)

The whole build stays green only if the enum, the migration, every code literal, and every test that hardcodes `"frog"` change together. This is one task.

**Files:**
- Modify: `prisma/schema.prisma:10-13`
- Create: `prisma/migrations/20260713120000_rename_taskkind_frog_to_quick/migration.sql`
- Modify: `lib/domain/types.ts:1`, `lib/domain/when.ts:46-58`, `lib/domain/time.ts:31`, `lib/domain/gridRow.ts:9,25,52,86,93`, `lib/domain/paste.ts:92`, `lib/domain/import.ts:136`, `lib/repository/organize.ts:12,49`, `prisma/seed.ts:49`
- Test: the existing suites plus every `*.test.ts` that hardcodes `kind: "frog"`

**Interfaces:**
- Produces: `TaskKind = "shift" | "quick"` (from `lib/domain/types.ts`), consumed by every later task that touches a task's kind.

- [ ] **Step 1: Update the tests to expect the new value first (red)**

Global-replace the value literal in the domain and repository test files. These are exact-string edits from `"frog"` to `"quick"`:

```bash
cd /Users/ekraay/claude/volunteer
grep -rl '"frog"' lib | grep '\.test\.' | xargs sed -i '' 's/"frog"/"quick"/g'
grep -rl '"frog"' lib/repository/signups.db.test.ts | xargs sed -i '' 's/"frog"/"quick"/g'
```

Also update the `combineWhen(...)` first argument in `lib/domain/when.test.ts` (it passes the literal `"frog"` positionally — the sed above already covers `"frog"`).

- [ ] **Step 2: Run the unit suite to watch it fail**

Run: `npm test`
Expected: FAIL. Type errors where tests pass `"quick"` to functions still typed `"shift" | "frog"`, and assertion failures.

- [ ] **Step 3: Rename the Prisma enum value**

In `prisma/schema.prisma`, change the enum body:

```prisma
enum TaskKind {
  shift
  quick
}
```

- [ ] **Step 4: Write the migration by hand (preserves data)**

A Postgres enum value renames in place; do not let Prisma drop and recreate it. Create `prisma/migrations/20260713120000_rename_taskkind_frog_to_quick/migration.sql`:

```sql
ALTER TYPE "TaskKind" RENAME VALUE 'frog' TO 'quick';
```

- [ ] **Step 5: Apply the migration to the test DB and regenerate the client**

Run: `npm run db:migrate:test && npx prisma generate`
Expected: migration applies clean; client types regenerate with `quick`.

- [ ] **Step 6: Swap the value literal in domain and repository code**

Update `lib/domain/types.ts:1`:

```ts
export type TaskKind = "shift" | "quick";
```

In `lib/domain/when.ts`, change the parameter type and the comparison, and reword the two error strings so no user-facing text says "frog":

```ts
export function combineWhen(
  kind: "shift" | "quick",
  date: DateParts | null,
  time: TimeCellValue,
  ctx: EventCtx,
): WhenResult {
  if (kind === "quick") {
    if (time.kind === "range") {
      return { ok: false, field: "time", error: "A quick task takes a deadline, not a time range. Try 'by 5pm' or a due date." };
    }
```

In `lib/domain/time.ts:31`, change `if (task.kind === "frog")` to `if (task.kind === "quick")`.

In `lib/domain/gridRow.ts`, update the comment on line 9 to read `"shift" | "quick"`, the two union types (lines 25, 86) to `"shift" | "quick"`, the comparison on line 52 to `cells.kind === "quick" ? "quick" : "shift"`, and line 93 to `t.kind === "quick" && t.dueBy`.

In `lib/repository/organize.ts`, update the union on line 49 to `kind: "shift" | "quick"` and reword the line 12 comment to `An evergreen board of quick tasks:`.

In `prisma/seed.ts:49`, change `kind: "frog"` to `kind: "quick"`.

- [ ] **Step 7: Keep paste/import accepting legacy "frog" input, storing "quick"**

Pasted sheets may still say "frog". Map both spellings to the stored value. In `lib/domain/paste.ts:92`:

```ts
field === "kind" ? (/frog|quick/i.test(value) ? "quick" : "shift") : value.trim();
```

In `lib/domain/import.ts:136`:

```ts
cells[f] = f === "kind" ? (/frog|quick/i.test(v) ? "quick" : "shift") : v;
```

- [ ] **Step 8: Run all suites to reach green**

Run: `npm test && npm run test:db && npx tsc --noEmit && npm run lint`
Expected: all pass. (Component copy still says "Grab a frog"; that is Task 2. No test asserts that copy after Step 1, so the suites are green.)

- [ ] **Step 9: Commit**

```bash
git add prisma lib
git commit -m "refactor: rename TaskKind value frog to quick"
```

---

## Task 2: Rename the display copy to "Hop to it"

Mechanical value rename is done; this task changes only what a person reads, so a reviewer can judge the wording independently. The task marker emoji 🐸 becomes 🪷 (a task is a lily pad, not a frog).

**Files:**
- Modify: `components/BoardCard.tsx:7-11,19,41-43,80-83`
- Modify: `components/board/TaskPanel.tsx:28,52,74-75`
- Modify: `components/ClaimForm.tsx:6,19-20`
- Modify: `components/Board.tsx:35,38-45`
- Modify: `components/TaskCard.tsx` (the 🐸 kind marker)
- Test: `components/BoardCard.test.tsx`, `components/board/TaskPanel.test.tsx`, `components/ClaimForm.test.tsx`, `components/ClaimFields.test.tsx`, `components/Board.test.tsx`, `components/TaskCard.test.tsx`

- [ ] **Step 1: Update the tests to expect "Hop to it" and "Quick" (red)**

In `components/BoardCard.test.tsx`, replace assertions matching `/grab a frog/i` with `/hop to it/i`. Replace the test titled `"a solo frog reads 'Grab a frog'"` body and name to expect `Hop to it`. Example for the solo case:

```tsx
test("a solo pad reads 'Hop to it'", () => {
  render(<BoardCard task={task({ kind: "quick", neededCount: 1 })} onOpen={vi.fn()} />);
  expect(screen.getByText(/hop to it/i)).toBeInTheDocument();
});
```

In `components/ClaimForm.test.tsx` and `components/ClaimFields.test.tsx`, replace every `{ name: /grab a frog/i }` with `{ name: /hop to it/i }`.

In `components/board/TaskPanel.test.tsx`, replace any assertion on `Grab this frog` with `Hop to it`, and any `Frog` kind-label assertion with `Quick`.

- [ ] **Step 2: Run the component suite to watch it fail**

Run: `npm test -- components`
Expected: FAIL. Buttons still read "Grab a frog".

- [ ] **Step 3: Update BoardCard copy and marker**

In `components/BoardCard.tsx`, rewrite `ctaLabel` so every task hops, keeping the pair variant:

```tsx
/** The claim CTA wording: every task is a pad you hop to. */
function ctaLabel(task: BoardTask): string {
  if (task.neededCount >= 2) return "👥 Hop to it together";
  return "🐸 Hop to it";
}
```

Change the kind comparison and header marker. Line 19 becomes `const isQuick = task.kind === "quick";`. In the header (lines 41-43) use the lily-pad marker and the word "Quick":

```tsx
<span aria-hidden className="mr-1">{isQuick ? "🪷" : "🎐"}</span>
{isQuick ? "Quick" : "Shift"}
```

Update the accent that referenced `isFrog` on line 20 to `isQuick`.

- [ ] **Step 4: Update TaskPanel copy and marker**

In `components/board/TaskPanel.tsx`, line 28 becomes `const isQuick = task.kind === "quick";`. Line 52 becomes:

```tsx
const claimVerb = "Hop to it";
```

Lines 74-75 become:

```tsx
<span aria-hidden className="mr-1">{isQuick ? "🪷" : "🎐"}</span>
{isQuick ? "Quick" : "Shift"}
```

- [ ] **Step 5: Update ClaimForm button**

In `components/ClaimForm.tsx`, update the comment on line 6 to `a "Hop to it" button` and the button (lines 19-20):

```tsx
<span aria-hidden className="text-lg transition group-hover:-translate-y-0.5">🐸</span>
Hop to it
```

- [ ] **Step 6: Update Board intro copy**

In `components/Board.tsx`, line 35 becomes:

```tsx
Tap a lily pad to hop to it. No account needed, just add your name.
```

Rewrite the `<details>` help (lines 38-45) to explain the pad, and give the summary an id the bar can target:

```tsx
<summary id="whats-a-pad" className="inline-flex cursor-pointer list-none items-center gap-1 font-semibold text-pond underline-offset-4 hover:underline">
  🪷 What&apos;s a lily pad?
  <span aria-hidden className="text-xs transition group-open:rotate-180">▾</span>
</summary>
<p className="mt-2 leading-relaxed text-ink-soft">
  A <strong className="text-ink">lily pad</strong> is an open spot to help. A{" "}
  <strong className="text-ink">quick</strong> pad is a one-off (bring 50 cups, hang the banner by 4 PM); a{" "}
  <strong className="text-ink">shift</strong> is a scheduled time slot at a booth. See one, hop to it, it&apos;s yours.
</p>
```

- [ ] **Step 7: Update the TaskCard marker**

In `components/TaskCard.tsx`, rename `isFrog` to `isQuick` (comparison `task.kind === "quick"`) and change the edge-sliver gradient branch that keyed on `isFrog` to key on `isQuick`. The 🐸 kind marker, if present, becomes 🪷.

- [ ] **Step 8: Run the component suite to reach green**

Run: `npm test -- components`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add components
git commit -m "feat: rename claim CTA to 'Hop to it', task marker to lily pad"
```

---

## Task 3: Pure nav logic (breadcrumb + actions)

**Files:**
- Create: `lib/domain/nav.ts`
- Test: `lib/domain/nav.test.ts`

**Interfaces:**
- Produces: `NavContext`, `Persona`, `Segments`, `Crumb`, `NavAction`, `groupChip()`, `breadcrumbSegments()`, `navActions()` — consumed by `components/SiteNav.tsx` (Task 4) and every wiring task.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/domain/nav.test.ts
import { describe, expect, test } from "vitest";
import { breadcrumbSegments, groupChip, navActions, type NavContext } from "@/lib/domain/nav";

const base: NavContext = {
  org: "BCSF", orgHref: "/", event: null, view: "Organize",
  persona: "organizer", groups: [], allGroups: false, boardHref: null, shareUrl: null,
};

describe("groupChip", () => {
  test("no groups → no chip", () => expect(groupChip([], false)).toBeNull());
  test("one group → a lens chip", () => expect(groupChip(["Scouts"], false)).toBe("👥 Scouts"));
  test("many groups → a count chip", () => expect(groupChip(["Scouts", "Taiko", "YAO"], false)).toBe("👥 3 groups"));
  test("all groups → an all-groups note", () => expect(groupChip([], true)).toBe("All groups"));
});

describe("breadcrumbSegments", () => {
  test("org home: brand, one crumb, no event", () => {
    const s = breadcrumbSegments({ ...base, event: null });
    expect(s.brand).toBe("Frog Board");
    expect(s.crumbs).toEqual([{ label: "BCSF", href: "/" }]);
  });
  test("event surface: org crumb links, event crumb is current", () => {
    const s = breadcrumbSegments({ ...base, event: "Bon Odori 2026" });
    expect(s.crumbs).toEqual([{ label: "BCSF", href: "/" }, { label: "Bon Odori 2026", href: null }]);
  });
  test("carries the view label and the chip", () => {
    const s = breadcrumbSegments({ ...base, view: "Sign up", groups: ["Scouts"] });
    expect(s.view).toBe("Sign up");
    expect(s.chip).toBe("👥 Scouts");
  });
});

describe("navActions", () => {
  test("volunteer: a help link and one Hop to it CTA", () => {
    const a = navActions({ ...base, persona: "volunteer" });
    expect(a.map((x) => x.key)).toEqual(["help", "hop"]);
    expect(a.find((x) => x.key === "hop")?.variant).toBe("cta");
  });
  test("lead with a board link: one View public board link", () => {
    const a = navActions({ ...base, persona: "lead", boardHref: "/bon-odori" });
    expect(a).toEqual([{ key: "board", label: "View public board", href: "/bon-odori", variant: "link" }]);
  });
  test("lead without a board link: no dead affordance", () => {
    expect(navActions({ ...base, persona: "lead", boardHref: null })).toEqual([]);
  });
  test("organizer on an event: board, roster, settings, share", () => {
    const a = navActions({ ...base, persona: "organizer", event: "Bon Odori 2026", boardHref: "/bon-odori", shareUrl: "https://x/bon-odori" });
    expect(a.map((x) => x.key)).toEqual(["board", "roster", "settings", "share"]);
  });
  test("organizer index (no event): roster and settings are not offered", () => {
    const a = navActions({ ...base, persona: "organizer", event: null, boardHref: null, shareUrl: null });
    expect(a.map((x) => x.key)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- nav.test`
Expected: FAIL with "Cannot find module '@/lib/domain/nav'".

- [ ] **Step 3: Write the implementation**

```ts
// lib/domain/nav.ts
// Pure navigation logic: what the bar shows and which moves it offers. No I/O.
// The breadcrumb roots at the org and treats a group as a removable lens, so it
// stays reversible against the Groups epic's many-to-many model.

export type Persona = "volunteer" | "lead" | "organizer";

export interface NavContext {
  org: string;
  orgHref: string;
  event: string | null;
  view: string;
  persona: Persona;
  groups: string[];
  allGroups: boolean;
  boardHref: string | null;
  shareUrl: string | null;
}

export interface Crumb {
  label: string;
  href: string | null;
}

export interface Segments {
  brand: string;
  brandHref: string;
  crumbs: Crumb[];
  view: string;
  chip: string | null;
}

export interface NavAction {
  key: string;
  label: string;
  href: string | null;
  variant: "cta" | "link" | "share";
}

/** A group is a lens: one shows its name, many show a count, org-wide shows all. */
export function groupChip(groups: string[], allGroups: boolean): string | null {
  if (allGroups) return "All groups";
  if (groups.length === 0) return null;
  if (groups.length === 1) return `👥 ${groups[0]}`;
  return `👥 ${groups.length} groups`;
}

export function breadcrumbSegments(ctx: NavContext): Segments {
  const crumbs: Crumb[] = [{ label: ctx.org, href: ctx.orgHref }];
  if (ctx.event) crumbs.push({ label: ctx.event, href: null });
  return {
    brand: "Frog Board",
    brandHref: ctx.orgHref,
    crumbs,
    view: ctx.view,
    chip: groupChip(ctx.groups, ctx.allGroups),
  };
}

/** Only in-reach moves: an action appears only when its prerequisite exists. */
export function navActions(ctx: NavContext): NavAction[] {
  if (ctx.persona === "volunteer") {
    return [
      { key: "help", label: "What's a pad?", href: "#whats-a-pad", variant: "link" },
      { key: "hop", label: "🐸 Hop to it", href: "#board", variant: "cta" },
    ];
  }
  if (ctx.persona === "lead") {
    return ctx.boardHref
      ? [{ key: "board", label: "View public board", href: ctx.boardHref, variant: "link" }]
      : [];
  }
  const acts: NavAction[] = [];
  if (ctx.boardHref) acts.push({ key: "board", label: "Board", href: ctx.boardHref, variant: "link" });
  if (ctx.event) {
    acts.push({ key: "roster", label: "Roster", href: "#roster", variant: "link" });
    acts.push({ key: "settings", label: "Settings", href: "#settings", variant: "link" });
  }
  if (ctx.shareUrl) acts.push({ key: "share", label: "🔗 Share", href: null, variant: "share" });
  return acts;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- nav.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/nav.ts lib/domain/nav.test.ts
git commit -m "feat: pure nav logic for breadcrumb and persona actions"
```

---

## Task 4: The SiteNav component

**Files:**
- Create: `components/SiteNav.tsx`
- Test: `components/SiteNav.test.tsx`

**Interfaces:**
- Consumes: `NavContext`, `breadcrumbSegments`, `navActions` from `lib/domain/nav.ts`; `ShareButton` from `components/ShareButton.tsx` (Task 5).
- Produces: `<SiteNav ctx={NavContext} />` — rendered by every wiring task.

Note: Task 5 creates `ShareButton`. To keep this task green on its own, render the share action as a placeholder button here and swap in `ShareButton` in Task 5. The test below does not assert clipboard behavior.

- [ ] **Step 1: Write the failing test**

```tsx
// components/SiteNav.test.tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { SiteNav } from "@/components/SiteNav";
import type { NavContext } from "@/lib/domain/nav";

const ctx = (over: Partial<NavContext> = {}): NavContext => ({
  org: "BCSF", orgHref: "/", event: "Bon Odori 2026", view: "Sign up",
  persona: "volunteer", groups: [], allGroups: false, boardHref: null, shareUrl: null, ...over,
});

test("shows brand, org, event, and view", () => {
  render(<SiteNav ctx={ctx()} />);
  expect(screen.getByText("Frog Board")).toBeInTheDocument();
  expect(screen.getByText("BCSF")).toBeInTheDocument();
  expect(screen.getByText("Bon Odori 2026")).toBeInTheDocument();
  expect(screen.getByText(/Sign up/)).toBeInTheDocument();
});

test("brand links to org home", () => {
  render(<SiteNav ctx={ctx()} />);
  expect(screen.getByRole("link", { name: /Frog Board/ })).toHaveAttribute("href", "/");
});

test("volunteer sees the Hop to it CTA", () => {
  render(<SiteNav ctx={ctx({ persona: "volunteer" })} />);
  expect(screen.getByRole("link", { name: /hop to it/i })).toHaveAttribute("href", "#board");
});

test("lead sees the group chip and the board link", () => {
  render(<SiteNav ctx={ctx({ persona: "lead", view: "Group lead", groups: ["Scouts"], boardHref: "/bon-odori" })} />);
  expect(screen.getByText("👥 Scouts")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /view public board/i })).toHaveAttribute("href", "/bon-odori");
});

test("organizer without an event offers no roster link", () => {
  render(<SiteNav ctx={ctx({ persona: "organizer", event: null, view: "Organize" })} />);
  expect(screen.queryByRole("link", { name: /roster/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- SiteNav`
Expected: FAIL with "Cannot find module '@/components/SiteNav'".

- [ ] **Step 3: Write the component**

```tsx
// components/SiteNav.tsx
import Link from "next/link";
import { breadcrumbSegments, navActions, type NavContext } from "@/lib/domain/nav";

// The one bar that answers "where am I". Left cluster is identical everywhere;
// the right cluster carries only the moves in reach for this persona. A server
// component: the page computes the context, this only renders it.
export function SiteNav({ ctx }: { ctx: NavContext }) {
  const seg = breadcrumbSegments(ctx);
  const actions = navActions(ctx);

  return (
    <nav
      aria-label="Site"
      className="sticky top-0 z-30 flex items-center gap-3 border-b border-washi-deep bg-washi/90 px-4 py-2.5 backdrop-blur"
    >
      <Link href={seg.brandHref} className="flex items-center gap-2 font-display text-lg font-extrabold text-ink">
        <span aria-hidden className="text-xl">🐸</span>
        <span className="hidden sm:inline">{seg.brand}</span>
      </Link>

      {seg.crumbs.map((c) => (
        <span key={c.label} className="flex items-center gap-3 min-w-0">
          <span aria-hidden className="text-lily-line">/</span>
          {c.href ? (
            <Link href={c.href} className="truncate font-bold text-ink hover:text-pond">{c.label}</Link>
          ) : (
            <span className="truncate font-bold text-ink">{c.label}</span>
          )}
        </span>
      ))}

      <span className="whitespace-nowrap text-sm font-semibold text-ink-soft">· {seg.view}</span>

      <div className="ml-auto flex items-center gap-2">
        {seg.chip && (
          <span className="whitespace-nowrap rounded-full bg-pond/10 px-2.5 py-1 text-xs font-bold text-pond-deep">
            {seg.chip}
          </span>
        )}
        {actions.map((a) => {
          if (a.variant === "share") {
            return (
              <button
                key={a.key}
                type="button"
                className="whitespace-nowrap rounded-lg bg-reed px-3 py-2 text-sm font-bold text-white"
              >
                {a.label}
              </button>
            );
          }
          const cls =
            a.variant === "cta"
              ? "whitespace-nowrap rounded-lg bg-reed px-3 py-2 text-sm font-bold text-white"
              : "whitespace-nowrap text-sm font-bold text-pond hover:text-pond-deep";
          return (
            <Link key={a.key} href={a.href ?? "#"} className={cls}>{a.label}</Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- SiteNav`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/SiteNav.tsx components/SiteNav.test.tsx
git commit -m "feat: SiteNav universal bar component"
```

---

## Task 5: The organizer Share button

**Files:**
- Create: `components/ShareButton.tsx`
- Modify: `components/SiteNav.tsx` (swap the placeholder for `ShareButton`)
- Test: `components/ShareButton.test.tsx`

**Interfaces:**
- Consumes: nothing beyond React.
- Produces: `<ShareButton url={string} />` — rendered by `SiteNav` for the `share` action.

- [ ] **Step 1: Write the failing test**

```tsx
// components/ShareButton.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ShareButton } from "@/components/ShareButton";

test("copies the url and confirms", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  const user = userEvent.setup();
  render(<ShareButton url="https://frogboard.vercel.app/bon-odori" />);
  await user.click(screen.getByRole("button", { name: /share/i }));
  expect(writeText).toHaveBeenCalledWith("https://frogboard.vercel.app/bon-odori");
  expect(await screen.findByText(/copied/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- ShareButton`
Expected: FAIL with "Cannot find module '@/components/ShareButton'".

- [ ] **Step 3: Write the component**

```tsx
// components/ShareButton.tsx
"use client";

import { useState } from "react";

// Copies the public board URL so the organizer can paste it into an email.
export function ShareButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }}
      className="whitespace-nowrap rounded-lg bg-reed px-3 py-2 text-sm font-bold text-white"
    >
      {copied ? "✓ Copied" : "🔗 Share"}
    </button>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- ShareButton`
Expected: PASS.

- [ ] **Step 5: Use ShareButton inside SiteNav**

In `components/SiteNav.tsx`, add the import and replace the placeholder `share` button branch:

```tsx
import { ShareButton } from "@/components/ShareButton";
```

```tsx
if (a.variant === "share") {
  return ctx.shareUrl ? <ShareButton key={a.key} url={ctx.shareUrl} /> : null;
}
```

- [ ] **Step 6: Run the nav suites to confirm nothing broke**

Run: `npm test -- SiteNav ShareButton`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/ShareButton.tsx components/ShareButton.test.tsx components/SiteNav.tsx
git commit -m "feat: organizer Share copies the public board link"
```

---

## Task 6: Render the bar on the volunteer boards

**Files:**
- Modify: `app/[slug]/page.tsx:35-36`
- Modify: `app/b/[slug]/page.tsx`
- Modify: `components/Board.tsx` (add `id="board"` to the tasks container)

**Interfaces:**
- Consumes: `SiteNav`, `NavContext`, `flagEnabled`.

- [ ] **Step 1: Add the anchor the CTA targets**

In `components/Board.tsx`, add `id="board"` to the element that wraps the task cards (the grid/list container that follows the header and filter). This is the scroll target for the bar's "Hop to it".

- [ ] **Step 2: Render SiteNav on the canonical board**

In `app/[slug]/page.tsx`, import the bar and flag, then wrap the return. Replace lines 35-36:

```tsx
import { flagEnabled } from "@/lib/flags";
import { SiteNav } from "@/components/SiteNav";
import type { NavContext } from "@/lib/domain/nav";
```

```tsx
  const jar = await cookies();
  const isOrganizer = isValidSession(jar.get(SESSION_COOKIE)?.value);
  const showNav = flagEnabled("nav", { cookies: jar });
  const navCtx: NavContext = {
    org: "BCSF", orgHref: "/", event: board.name, view: "Sign up",
    persona: "volunteer", groups: [], allGroups: false, boardHref: null, shareUrl: null,
  };
  return (
    <>
      {showNav && <SiteNav ctx={navCtx} />}
      <Board eventName={board.name} tasks={tasks} standing={board.standing} isOrganizer={isOrganizer} filter={{ options, activeLabels, covered, total }} />
    </>
  );
```

- [ ] **Step 3: Render SiteNav on the redesigned TaskBoard**

In `app/b/[slug]/page.tsx`, after the board is resolved, compute the same `showNav` and a `NavContext` with `event: <board name>`, `view: "Sign up"`, `persona: "volunteer"`, and render `{showNav && <SiteNav ctx={navCtx} />}` above the `<TaskBoard .../>` inside a fragment. Reuse the `cookies()` jar the page already reads.

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`, open `/<a seeded event slug>`. Expected: the bar shows `🐸 Frog Board / BCSF / <event> · Sign up`, brand links home, "Hop to it" scrolls to the tasks. The `/b/<slug>` board shows the same bar.

- [ ] **Step 5: Run suites and commit**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS.

```bash
git add app/\[slug\]/page.tsx app/b/\[slug\]/page.tsx components/Board.tsx
git commit -m "feat: show the universal bar on the volunteer boards"
```

---

## Task 7: Render the bar on the lead page

**Files:**
- Modify: `lib/repository/leads.ts:49-77` (add the board param to the chase view)
- Modify: `app/lead/[token]/page.tsx`
- Test: `lib/repository/leads.db.test.ts` (extend the chase-view assertion if one exists; otherwise add a focused case)

**Interfaces:**
- Consumes: `getLeadChaseView` now returns `boardParam: string`.
- Produces: the lead surface renders `<SiteNav>` with `persona: "lead"`, the group chip, and the board link.

- [ ] **Step 1: Write the failing repository test**

Add to `lib/repository/leads.db.test.ts` a case asserting the chase view exposes the event's board param (slug when set, else id). Follow the file's existing setup for creating an org, event, person, and lead. The assertion:

```ts
const view = await getLeadChaseView(token);
expect(view?.boardParam).toBe(event.slug ?? event.id);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:db -- leads`
Expected: FAIL. `boardParam` is undefined.

- [ ] **Step 3: Return the board param from the repository**

In `lib/repository/leads.ts`, widen the event select and the return type. Update the `select` on line 54 to `event: { select: { name: true, slug: true, id: true } }`, extend the return type on line 51 with `boardParam: string`, and add to the returned object:

```ts
    boardParam: lead.event.slug ?? lead.event.id,
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:db -- leads`
Expected: PASS.

- [ ] **Step 5: Render SiteNav on the lead page**

In `app/lead/[token]/page.tsx`, after fetching `view`, render the bar above `ChaseView` (only on the valid-view branch, so the invalid-token state stays a bare friendly page). Assemble the context from the view:

```tsx
import { cookies } from "next/headers";
import { flagEnabled } from "@/lib/flags";
import { SiteNav } from "@/components/SiteNav";
import type { NavContext } from "@/lib/domain/nav";
```

```tsx
  const showNav = flagEnabled("nav", { cookies: await cookies() });
  const navCtx: NavContext = {
    org: "BCSF", orgHref: "/", event: view.eventName, view: "Group lead",
    persona: "lead", groups: [view.group], allGroups: false,
    boardHref: `/${view.boardParam}`, shareUrl: null,
  };
  return (
    <>
      {showNav && <SiteNav ctx={navCtx} />}
      <ChaseView token={token} group={view.group} eventName={view.eventName} counts={view.counts} chase={view.chase} />
    </>
  );
```

- [ ] **Step 6: Verify in the browser**

Open a valid `/lead/<token>`. Expected: bar reads `🐸 Frog Board / BCSF / <event> · Group lead` with a `👥 <group>` chip and a "View public board" link. An invalid token still shows the bare friendly page, no bar.

- [ ] **Step 7: Run suites and commit**

Run: `npm test && npm run test:db && npx tsc --noEmit && npm run lint`
Expected: PASS.

```bash
git add lib/repository/leads.ts lib/repository/leads.db.test.ts app/lead/\[token\]/page.tsx
git commit -m "feat: show the universal bar on the lead page"
```

---

## Task 8: Render the bar on the organizer workspace

**Files:**
- Modify: `app/organize/page.tsx` (index: bar with no event)
- Modify: `app/organize/[eventId]/page.tsx` (event workspace: full right cluster, section anchors)

**Interfaces:**
- Consumes: `SiteNav`, `NavContext`, `flagEnabled`.

- [ ] **Step 1: Render the bar on the organize index**

In `app/organize/page.tsx`, in the signed-in branch (after `isValidSession` passes), render the bar with no event. Wrap the existing `<main>` in a fragment:

```tsx
import { flagEnabled } from "@/lib/flags";
import { SiteNav } from "@/components/SiteNav";
import type { NavContext } from "@/lib/domain/nav";
```

```tsx
  const showNav = flagEnabled("nav", { cookies: jar });
  const navCtx: NavContext = {
    org: "BCSF", orgHref: "/", event: null, view: "Organize",
    persona: "organizer", groups: [], allGroups: false, boardHref: null, shareUrl: null,
  };
```

Return `<>{showNav && <SiteNav ctx={navCtx} />}<main ...>...</main></>`.

- [ ] **Step 2: Add section anchors on the event workspace**

In `app/organize/[eventId]/page.tsx`, wrap the rollups block so the bar's "Roster" link resolves, and give the grid a settings anchor. Add `id="roster"` to the `<div className="mb-4 space-y-4">` on line 45, and add `id="settings"` to a wrapper around `<OrganizeGrid .../>` (or to the grid's own container).

- [ ] **Step 3: Render the bar on the event workspace**

In `app/organize/[eventId]/page.tsx`, compute the share URL from the request host and the board param, then render the bar. Add the imports (as in Step 1) and:

```tsx
import { headers } from "next/headers";
```

```tsx
  const boardParam = grid.slug ?? grid.id;
  const host = (await headers()).get("host") ?? "";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const showNav = flagEnabled("nav", { cookies: jar });
  const navCtx: NavContext = {
    org: "BCSF", orgHref: "/", event: grid.name, view: "Organize",
    persona: "organizer", groups: [], allGroups: false,
    boardHref: `/${boardParam}`, shareUrl: `${proto}://${host}/${boardParam}`,
  };
```

Wrap the returned `<main>` in a fragment with `{showNav && <SiteNav ctx={navCtx} />}` above it.

- [ ] **Step 4: Verify in the browser**

Sign in at `/organize`, open an event. Expected: the bar reads `🐸 Frog Board / BCSF / <event> · Organize` with Board, Roster (scrolls to rollups), Settings (scrolls to the grid), and a Share button that copies the public board URL. The index shows the bar with just `BCSF · Organize`.

- [ ] **Step 5: Run every suite and the full gate**

Run: `npm test && npm run test:db && npx tsc --noEmit && npm run lint`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add app/organize/page.tsx app/organize/\[eventId\]/page.tsx
git commit -m "feat: show the universal bar across the organizer workspace"
```

---

## Self-Review notes

- **Spec coverage:** metaphor + rename (Tasks 1-2), Universal bar anatomy and persona right clusters (Tasks 3-8), breadcrumb reversibility and group chip (Task 3 `groupChip` + `breadcrumbSegments`), permission "no dead affordances" (Task 3 `navActions` gating), youth surface opt-out (no youth page renders `SiteNav`; documented, nothing to build), `FLAG_NAV` rollout (every wiring task gates on it), TDD throughout.
- **Deferred, correctly absent:** garden and pond home screens, group switcher, the full see/edit/roster teeth (they resolve to today's session/token personas here, per the spec's "encode the model, wire what exists").
- **Type consistency:** `NavContext`, `Persona`, `NavAction`, `Segments` are defined once in Task 3 and consumed unchanged in Tasks 4-8. `TaskKind = "shift" | "quick"` from Task 1 flows through Task 2's component edits.
