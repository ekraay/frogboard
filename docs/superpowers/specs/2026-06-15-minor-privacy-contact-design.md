# Minor name privacy + optional contact — Design

**Goal:** On the public board, a volunteer marked "Under 18" shows with their last
name abbreviated to an initial ("Alex Tanaka" → "Alex T."), so kids aren't fully
named in public. Separately, add optional **email** and **phone** inputs to the
sign-up form (the columns and the action already store them — only the form
inputs are missing).

## Current state (what already exists)

- `Signup` already has `name`, `email?`, `phone?`, `group?`, `minor?` columns —
  **no migration needed.**
- `claimSlot` (`app/actions/signups.ts`) **already reads and stores** `email`,
  `phone`, and `minor` from the submitted form.
- `ClaimForm` (`components/ClaimForm.tsx`) collects name, optional group, and an
  "Under 18" checkbox (`minor`) — but **no email/phone inputs**.
- The public board payload is built in `getActiveEventBoard`
  (`lib/repository/events.ts`); its signup `select` is `{ id, name, group }`.
  `minor` is **deliberately not sent** to the board (existing kids'-privacy
  decision). The board currently renders the **full typed name**.

## Design

Three small, independently-testable units. No schema change.

### Unit 1 — pure: `boardDisplayName(name, minor)`

- **File:** `lib/domain/displayName.ts` (new)
- **Signature:** `export function boardDisplayName(name: string, minor?: boolean | null): string`
- **Rules:**
  1. Trim, then collapse internal runs of whitespace to single spaces.
  2. If **not** `minor` → return the cleaned name unchanged.
  3. If `minor`:
     - Split on spaces. If **≤ 1 word**, return as-is (no last name to hide).
     - Otherwise replace the **last word** with its first character
       **uppercased** + `"."`.
  4. Empty / whitespace-only name → `""` (defensive).
- **Examples:**
  | input name | minor | output |
  |---|---|---|
  | `Alex Tanaka` | true | `Alex T.` |
  | `mary jane tanaka` | true | `mary jane T.` |
  | `Kenji` | true | `Kenji` |
  | `  Alex   Tanaka  ` | true | `Alex T.` |
  | `Alex Tanaka` | false | `Alex Tanaka` |
  | `Alex Tanaka` | null/undefined | `Alex Tanaka` |
  | `` | true | `` |

### Unit 2 — board payload abbreviates server-side

- **File:** `lib/repository/events.ts` (`getActiveEventBoard`)
- Add `minor: true` to the signup `select`.
- Map each signup to `{ id: s.id, name: boardDisplayName(s.name, s.minor), group: s.group }`.
- **`minor` is NOT added to `BoardSignup`** — the payload shape stays
  `{ id, name, group }`, so a minor's **full last name never leaves the server**.
  Organizers still see the full name in their own tools/audit (unchanged).

### Unit 3 — `ClaimForm` collects email + phone (optional)

- **File:** `components/ClaimForm.tsx`
- After the **Group** field, add two optional inputs (same label/markup pattern):
  - **Email (optional)** — `name="email"`, `type="email"`, `maxLength={120}`,
    `autoComplete="email"`.
  - **Phone (optional)** — `name="phone"`, `type="tel"`, `maxLength={30}`,
    `autoComplete="tel"`.
- No action/repository change — `claimSlot` already forwards `email`/`phone`.

## Out of scope (explicitly)

- An organizer-facing **roster** to *view* collected email/phone. There is no
  roster today (the grid shows only a signup count); building one is Phase 3.
  This feature **collects** contact info; surfacing it is separate work.
- No change to how organizers see names (they keep the full name).
- No schema migration.

## Testing (TDD)

- **`lib/domain/displayName.test.ts`** (jsdom unit) — the example table above,
  including the single-word, multi-word, whitespace, and non-minor cases.
- **`lib/repository/events.db.test.ts`** (new, node/db) — a published event with a
  task and two signups: a minor `Alex Tanaka` and a non-minor `Mary Jones`;
  assert `getActiveEventBoard` returns names `Alex T.` and `Mary Jones`, and that
  the returned signup objects have **no `minor` key**.
- **`components/ClaimForm.test.tsx`** (jsdom) — the form renders Email and Phone
  inputs; submitting with them filled forwards `email`/`phone` in the FormData;
  submitting with them blank still succeeds (both optional).

## Accessibility

- New inputs use the existing `<label>`-wraps-`<input>` pattern, with
  `type="email"` / `type="tel"` for correct mobile keyboards. The WCAG axe E2E
  scan over the board/sign-in flow must stay at 0 violations.
