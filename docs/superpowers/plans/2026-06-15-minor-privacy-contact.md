# Minor Privacy + Optional Contact — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the public board, under-18 volunteers show with their last name abbreviated to an initial ("Alex Tanaka" → "Alex T."), and the sign-up form gains optional email + phone inputs.

**Architecture:** One pure function (`boardDisplayName`) does the abbreviation; the board repository applies it server-side so a minor's full surname never reaches the browser; the claim form adds two optional inputs whose values the existing `claimSlot` action already stores. No schema migration.

**Tech Stack:** Next.js 16, Prisma 6 / Neon Postgres, Vitest (jsdom unit + `*.db.test.ts` node), Testing Library.

Spec: `docs/superpowers/specs/2026-06-15-minor-privacy-contact-design.md`

---

## File Structure

- `lib/domain/displayName.ts` (new) — pure `boardDisplayName(name, minor)`. One responsibility: derive the public-board name.
- `lib/domain/displayName.test.ts` (new) — unit tests for the rule table.
- `lib/repository/events.ts` (modify) — `getActiveEventBoard` selects `minor` and maps each signup name through `boardDisplayName`; `minor` stays off the payload.
- `lib/repository/events.db.test.ts` (new) — db test proving abbreviation + non-exposure of `minor`.
- `components/ClaimForm.tsx` (modify) — add optional Email + Phone inputs after Group.
- `components/ClaimForm.test.tsx` (modify) — tests that the inputs forward values and are optional.

---

### Task 1: `boardDisplayName` pure function

**Files:**
- Create: `lib/domain/displayName.ts`
- Test: `lib/domain/displayName.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/domain/displayName.test.ts
import { expect, test } from "vitest";
import { boardDisplayName } from "@/lib/domain/displayName";

test("non-minor names are shown in full", () => {
  expect(boardDisplayName("Alex Tanaka", false)).toBe("Alex Tanaka");
  expect(boardDisplayName("Alex Tanaka", null)).toBe("Alex Tanaka");
  expect(boardDisplayName("Alex Tanaka", undefined)).toBe("Alex Tanaka");
});

test("a minor's last word becomes an initial", () => {
  expect(boardDisplayName("Alex Tanaka", true)).toBe("Alex T.");
});

test("a minor with middle words keeps all but the last in full", () => {
  expect(boardDisplayName("mary jane tanaka", true)).toBe("mary jane T.");
});

test("a single-word minor name has no last name to hide", () => {
  expect(boardDisplayName("Kenji", true)).toBe("Kenji");
});

test("surrounding and repeated whitespace is normalized first", () => {
  expect(boardDisplayName("  Alex   Tanaka  ", true)).toBe("Alex T.");
});

test("an empty or blank name stays empty", () => {
  expect(boardDisplayName("", true)).toBe("");
  expect(boardDisplayName("   ", true)).toBe("");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/domain/displayName.test.ts`
Expected: FAIL — `boardDisplayName` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/domain/displayName.ts
/**
 * The name to show on the PUBLIC board. For a volunteer marked under-18, the
 * last whitespace-delimited word is reduced to an initial ("Alex Tanaka" →
 * "Alex T.") so kids aren't fully named in public. A single-word name has no
 * last name to hide; adults are shown in full. Called server-side so a minor's
 * full surname never reaches the browser.
 */
export function boardDisplayName(name: string, minor?: boolean | null): string {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!minor || clean === "") return clean;
  const words = clean.split(" ");
  if (words.length <= 1) return clean;
  words[words.length - 1] = words[words.length - 1][0].toUpperCase() + ".";
  return words.join(" ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/domain/displayName.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/displayName.ts lib/domain/displayName.test.ts
git commit -m "feat: boardDisplayName — abbreviate a minor's last name to an initial"
```

---

### Task 2: Board payload abbreviates server-side

**Files:**
- Modify: `lib/repository/events.ts`
- Test: `lib/repository/events.db.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// lib/repository/events.db.test.ts
// @vitest-environment node
import { afterAll, beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "@/test/db";
import { getActiveEventBoard } from "@/lib/repository/events";

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await prisma.$disconnect(); });

test("a minor's last name is abbreviated on the board; the minor flag is never exposed", async () => {
  const e = await prisma.event.create({
    data: {
      name: "Ginza", status: "published",
      startDate: new Date("2026-07-24"), endDate: new Date("2026-07-26"),
    },
  });
  const t = await prisma.task.create({ data: { eventId: e.id, title: "Games", position: 1024 } });
  await prisma.signup.create({ data: { taskId: t.id, name: "Alex Tanaka", minor: true, claimToken: "a" } });
  await prisma.signup.create({ data: { taskId: t.id, name: "Mary Jones", minor: false, claimToken: "b" } });

  const board = await getActiveEventBoard();
  const names = board!.tasks[0].signups.map((s) => s.name);
  expect(names).toContain("Alex T.");       // minor abbreviated
  expect(names).toContain("Mary Jones");    // adult in full
  expect(names).not.toContain("Alex Tanaka"); // full surname never sent
  // the board payload never carries the minor flag
  expect(board!.tasks[0].signups.every((s) => !("minor" in s))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- lib/repository/events.db.test.ts`
Expected: FAIL — board returns the full name "Alex Tanaka", so `not.toContain("Alex Tanaka")` fails.

- [ ] **Step 3: Write minimal implementation**

In `lib/repository/events.ts`, add the import at the top (after the existing imports):

```ts
import { boardDisplayName } from "@/lib/domain/displayName";
```

Change the signup `select` to also read `minor`:

```ts
          signups: {
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, group: true, minor: true },
          },
```

Change the signup mapping (inside `tasks: event.tasks.map((t) => ({ ... }))`) from `signups: t.signups` to:

```ts
      signups: t.signups.map((s) => ({
        id: s.id, name: boardDisplayName(s.name, s.minor), group: s.group,
      })),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:db -- lib/repository/events.db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/repository/events.ts lib/repository/events.db.test.ts
git commit -m "feat: board abbreviates a minor's last name server-side"
```

---

### Task 3: ClaimForm collects optional email + phone

**Files:**
- Modify: `components/ClaimForm.tsx`
- Test: `components/ClaimForm.test.tsx`

- [ ] **Step 1: Write the failing tests** (append to `components/ClaimForm.test.tsx`)

```ts
test("forwards optional email and phone when provided", async () => {
  claimSlot.mockResolvedValue({ ok: true, signupId: "s1", claimToken: "tok-1" });
  const user = userEvent.setup();
  render(<ClaimForm taskId="t1" />);

  await user.click(screen.getByRole("button", { name: /grab a frog/i }));
  await user.type(screen.getByLabelText(/your name/i), "Kenji");
  await user.type(screen.getByLabelText(/email/i), "kenji@example.com");
  await user.type(screen.getByLabelText(/phone/i), "555-1234");
  await user.click(screen.getByRole("button", { name: /^add me$/i }));

  const fd = claimSlot.mock.calls[0][0] as FormData;
  expect(fd.get("email")).toBe("kenji@example.com");
  expect(fd.get("phone")).toBe("555-1234");
});

test("email and phone are optional — submitting blank still works", async () => {
  claimSlot.mockResolvedValue({ ok: true, signupId: "s1", claimToken: "tok-1" });
  const user = userEvent.setup();
  render(<ClaimForm taskId="t1" />);

  await user.click(screen.getByRole("button", { name: /grab a frog/i }));
  await user.type(screen.getByLabelText(/your name/i), "Kenji");
  await user.click(screen.getByRole("button", { name: /^add me$/i }));

  expect(claimSlot).toHaveBeenCalledOnce();
  const fd = claimSlot.mock.calls[0][0] as FormData;
  expect(fd.get("email")).toBe("");
  expect(fd.get("phone")).toBe("");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- components/ClaimForm.test.tsx`
Expected: FAIL — `getByLabelText(/email/i)` / `/phone/i` find no element (inputs don't exist yet).

- [ ] **Step 3: Write minimal implementation**

In `components/ClaimForm.tsx`, immediately after the closing `</label>` of the **Group** field (the `<input name="group" .../>` block) and before the `minor` checkbox `<label>`, insert:

```tsx
      <label className="block text-sm font-medium text-ink-soft">
        Email <span className="font-normal">(optional)</span>
        <input
          name="email"
          type="email"
          maxLength={120}
          autoComplete="email"
          placeholder="you@example.com"
          className="mt-1 w-full rounded-xl border border-lily-line bg-white px-3 py-2.5 text-ink outline-none transition focus:border-reed focus:ring-2 focus:ring-reed/30"
        />
      </label>
      <label className="block text-sm font-medium text-ink-soft">
        Phone <span className="font-normal">(optional)</span>
        <input
          name="phone"
          type="tel"
          maxLength={30}
          autoComplete="tel"
          placeholder="(555) 555-1234"
          className="mt-1 w-full rounded-xl border border-lily-line bg-white px-3 py-2.5 text-ink outline-none transition focus:border-reed focus:ring-2 focus:ring-reed/30"
        />
      </label>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- components/ClaimForm.test.tsx`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add components/ClaimForm.tsx components/ClaimForm.test.tsx
git commit -m "feat: optional email + phone on the sign-up form"
```

---

### Task 4: Full-gate verification

**Files:** none (verification only)

- [ ] **Step 1: Run the unit suite**

Run: `npm test`
Expected: PASS (all files; +8 new tests from Tasks 1 & 3).

- [ ] **Step 2: Run the db suite**

Run: `npm run test:db`
Expected: PASS (+1 new file from Task 2).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: clean (no errors). The new inputs are `<label>`-wrapped with `type="email"`/`type="tel"`, so jsx-a11y stays satisfied; the CI axe E2E scan over the board/sign-in flow should remain at 0 violations.

- [ ] **Step 5: (no commit)** — verification task; nothing to commit.

---

## Self-Review

- **Spec coverage:** Unit 1 → Task 1; Unit 2 → Task 2; Unit 3 → Task 3; testing/a11y → Tasks across + Task 4. "Out of scope" items (organizer roster, schema migration) are intentionally absent. ✓
- **Placeholder scan:** no TBD/TODO/"handle edge cases" — every step has real code/commands. ✓
- **Type consistency:** `boardDisplayName(name: string, minor?: boolean | null)` is defined in Task 1 and called identically in Task 2; Prisma `select` includes `minor`, which the function accepts as `boolean | null`. Form field names `email`/`phone` match what `claimSlot` reads. ✓
