# Lead Open Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a navigable "Open" link on each lead row in the organize event workspace, pointing to that group's RSVP list at `/lead/<token>`.

**Architecture:** One client component changes: `components/organize/LeadsPanel.tsx` gains a `next/link` anchor per lead row. No server, schema, or route changes; `/lead/[token]` already renders the roster. Spec: `docs/superpowers/specs/2026-07-18-lead-open-link-design.md`.

**Tech Stack:** Next.js App Router, React, Tailwind (Matsuri tokens), Vitest + Testing Library (jsdom).

## Global Constraints

- `next/link`, never a plain `<a>`: a full-document navigation can abort the grid's in-flight blur save on the same page (`OrganizeGrid.persistRow`).
- Per-row accessible name: `aria-label={`Open ${group} RSVP list`}`.
- Style tokens only, no invented colors. The link reuses the Regenerate style: `text-pond underline underline-offset-2`.
- No em dashes in any prose, copy, or commit message.
- Done gates: `npm test`, `npm run test:db`, `npx tsc --noEmit`, `npm run lint` all green.

---

### Task 1: Open link on lead rows

**Files:**
- Modify: `components/organize/LeadsPanel.tsx` (row markup around line 51)
- Test: `components/organize/LeadsPanel.test.tsx`

**Interfaces:**
- Consumes: existing `Lead` prop shape `{ id, group, name, token }` in LeadsPanel; route `/lead/[token]`.
- Produces: nothing consumed by later tasks (single-task plan).

- [ ] **Step 1: Write the failing test**

Add to `components/organize/LeadsPanel.test.tsx`. Two edits.

First, mock `next/link` below the existing mocks at the top (LeadsPanel does not import it yet, and jsdom tests here mock it; see `GardenHome.test.tsx`). Spread the rest props so `aria-label` reaches the anchor:

```tsx
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<"a">) =>
    <a href={href} {...rest}>{children}</a>,
}));
```

Second, append the test:

```tsx
test("links to the group's RSVP list", () => {
  render(<LeadsPanel eventId="e1" groups={["Scouts"]}
    leads={[{ id: "l1", group: "Scouts", name: "Simon", token: "tok" }]} />);
  const link = screen.getByRole("link", { name: "Open Scouts RSVP list" });
  expect(link).toHaveAttribute("href", "/lead/tok");
});
```

- [ ] **Step 2: Run the test, watch it fail for the right reason**

Run: `npx vitest run components/organize/LeadsPanel.test.tsx`
Expected: the new test FAILS with "Unable to find an accessible element with the role \"link\"". The two existing tests still pass.

- [ ] **Step 3: Minimal implementation**

In `components/organize/LeadsPanel.tsx`:

Add the import at the top:

```tsx
import Link from "next/link";
```

In the lead row `<li>`, directly after the name/group `<span>` and before the Copy link button, add:

```tsx
<Link href={`/lead/${l.token}`} aria-label={`Open ${l.group} RSVP list`}
  className="rounded-lg px-3 py-1 text-sm font-bold text-pond underline underline-offset-2">
  Open
</Link>
```

- [ ] **Step 4: Run the test file, watch it pass**

Run: `npx vitest run components/organize/LeadsPanel.test.tsx`
Expected: all 3 tests PASS.

- [ ] **Step 5: Full gates**

Run: `npm test` (expect 55 files, 409+ tests, all pass), `npx tsc --noEmit` (no output), `npm run lint` (no errors), `npm run test:db` (all pass; untouched by this change but part of the done gate).

- [ ] **Step 6: Commit**

```bash
git add components/organize/LeadsPanel.tsx components/organize/LeadsPanel.test.tsx
git commit -m "feat(organize): open link to a group's RSVP list on lead rows

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
