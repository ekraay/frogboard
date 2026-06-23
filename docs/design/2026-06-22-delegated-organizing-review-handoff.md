# Frog Board — Delegated Organizing: adversarial review handoff

For: Claude Code (implementation context)
From: design review, 2026-06-22
Status: design decision changed mid-review. **Read the "Decision changed" section first — it alters the schema.**

---

## TL;DR for implementation

The original spec delegated **per category** (`Delegate.category`, `@@unique([eventId, category])`). After review, the delegation spine is changing to **per group** (`requestedGroup`). One group owns a task; a task is never co-owned. Build around the group spine, not the category spine. Details below.

---

## Design north star (don't lose this)

The model is Henrik Kniberg's *Self-organizing a 50-person party*, not top-down mission command. Core principles to preserve:

- **No bottleneck.** The organizer must not be the coordination chokepoint. Volunteers self-select; they are not assigned.
- **Self-selection over assignment.** In the party, you became the Grillmeister by *grabbing the card*. Signups stay volunteer-driven. Do not turn any field into "assigned to."
- **Brief the intent, show what Done looks like.** Every party card showed an illustration of done. `definitionOfDone` already exists on `Task` and must surface in the lead's report.
- **High-level plan, room to improvise.** Reports show coverage and gaps, not micromanaged steps.

The one *conscious* departure from Kniberg: leads are **appointed**, not claimed. A patrol leader is elected then handed their patch; we don't want "whoever opens the link first" to own it. This top-down appointment is justified by scouting's accountability needs, not by it being easier to build. Note it as a deliberate decision so it doesn't read as a contradiction of the self-organizing ethos.

---

## Decision changed: delegation spine is GROUP, not CATEGORY

### Why
The troop has standing sub-units (patrols) that the party did not. Kniberg used categories because his guests were strangers grabbing cards. We have Hawks, Racoon, King Cobra, Eagle — plus external partner groups (YAO, Buddhist Women's Association) at BCSF events. The Patrol Method delegates to *the patrol*, not to "whoever's on salad duty." So the lead should own a **group's slice of the roster**, not a category of work.

`requestedGroup` already carries this. It was an earmark hint ("Hawks, come help"). It now becomes the delegation key. **It stays an invitation, not an assignment** — signups within a group's tasks are still self-selected.

### Confirmed constraint
One group per task. A task is owned by exactly one `requestedGroup`. No task is co-owned across groups. This is what makes the group spine clean.

### Schema implication
- Delegate attaches to `(eventId, requestedGroup)`, not `(eventId, category)`.
- `@@unique([eventId, requestedGroup])` — one lead per group per event.
- A lead's report = all tasks where `task.requestedGroup == delegate.requestedGroup`, gaps-first, with `definitionOfDone` shown.
- `category` survives only as free-text grouping *within* a report. Not the delegation spine.

---

## Open issues from review that still apply under the group spine

These were raised against the original spec; re-checked against the new model. Each is a present-tense problem, not a YAGNI future-proofing exercise.

1. **`requestedGroup` is free text and now load-bearing.** Same brittleness the category join had: rename "Scouts - Hawk" to "Hawks" and the delegate silently detaches; coverage drops to zero with no error. The join must not lie. Normalize the group value (or at minimum constrain it) before making it the foreign key. You do not need a full taxonomy — you need the join to be stable.

2. **Mixed group types.** Patrols (internal, youth PL, minor-routing applies) and partner orgs (external, adult contact, no minors) are different relationships flattened into one string. **YAGNI for this slice** — a flat group list is fine now — but know the distinction is coming, and don't build anything that assumes all groups behave like patrols.

3. **Token revocation, not expiry.** No-expiry is defensible under the no-accounts ethos. *No way to revoke* is not — a lead leaves the troop and the link is a permanent unauthenticated window into minor data. Revocation is nearly free: the token lives in a row you can delete/regenerate. `removeDelegate` + token regen covers it. Build it in this slice.

4. **Surface `definitionOfDone` in the report.** This is the Kniberg principle most likely to get dropped. A patrol leader looking at "Games: 7 of 9" needs to know what good looks like, exactly as the Dessert meister needed the picture. The field exists on `Task` already. Show it.

5. **Migration of existing `pointOfContact`.** Decide explicitly what happens to existing per-task contact values when a group gets a delegate. The resolution rule `contact = task.pointOfContact ?? delegate-for(...)` returns nobody when both are null, and shadows the delegate when pointOfContact is populated. Define the migration behavior; don't leave it undefined.

---

## What was withdrawn (don't action these)

These were raised in review and then dropped as either premature or wrong given the Kniberg framing:

- Forcing first-class "areas" / multi-category leads now — YAGNI, one report link per group covers it.
- Patrol-based delegation as a *future* concern — it's now the actual model, resolved above.
- Minor-name abbreviation as the whole privacy story — fine for this slice given revocation is added.

---

## Suggested build order (unchanged in shape, re-keyed to group)

1. Migration: `Delegate` on `(eventId, requestedGroup)`, unique per group per event, with token.
2. Domain: `resolveContact`, group-by-`requestedGroup`, reuse existing coverage helpers.
3. Repository: `upsertDelegate` (mints token, enforces one-per-group), `removeDelegate` (this is also your revocation path), `getEventDelegates`, `getDelegatePatch(token)`.
4. Actions (organizer-gated): `saveDelegate`, `removeDelegate`.
5. UI: Leads panel keyed by group; `/lead/[token]` report, gaps-first, **with `definitionOfDone`**.
6. Strict TDD throughout — but confirm the spine decision is locked before writing tests, since tests will cement it.
