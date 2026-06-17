# Frog Board — Product Backlog

Lightweight cards, not specs. Keep each terse: the intent + the open questions.
Status buckets: **In flight → Next → Explore/design → Explore later → Shipped.**
Pull a card up when it's ready; design only the ones that need it.

---

## Next (quick, no design)

- _(cleared — see Shipped)_

## Explore / design first

- **Full undo/redo history** — v1 ships single-level undo (last delete/clear via
  ⟲ button + Cmd/Ctrl+Z). A bigger card: multi-step history, **redo** (↷ /
  Cmd+Shift+Z), and undo of **cell edits** and **row reorders**. Hard because the
  grid autosaves to the server, so each step needs a compensating server action.
  (The "Phase 4: session Ctrl+Z" item.)

- **Need = range (2–3) + "TBD"** — `Task.neededCount` is a single int today.
  Ranges and an unknown state change the data model *and* the board's
  "X of N filled / full" + claim/full logic. (Absorbs the earlier "count = TBD".)
- **Time = TBD** — explicit "time TBD" label on the board for tasks with no clock.
- **Drag-handle reorder + multi-column sort** (date/time/category/group/location)
  — replaces the up/down arrows. ⚠️ Reverses Phase 2's deliberate "no pointer
  drag-and-drop" choice (made for mobile + a11y), so weigh that first.

## Explore later (epic)

- **Group organizer view + rosters + RSVP + social proof.** Let a *group*
  organizer (Scouts, YAO, BWA…) see the events/tasks requested of their group,
  share a filtered link, and drive sign-ups from their own roster.
  - **Group lens (closest to today):** filter the board to a group's shifts/frogs.
    Data is partly here already — `Task.requestedGroup` and `Signup.group` exist.
  - **Addressable / deep links:** stable URLs to a single shift, a single frog,
    or a group lens (e.g. `/g/scouts`, `/t/<id>`) so it drops into a weekly email.
  - **Roster upload:** import ~40 names (scouts + parents) so emailing events is
    one click. New infra: storing rosters (⚠️ scales the kids'-privacy concern),
    + email sending (Resend/SES — not in the stack yet).
  - **RSVP from an emailed link:** per-person tokenized link → identity without a
    login. Open Q: RSVP = "I'll attend the event" vs "I'll take *these* shifts" —
    or RSVP-yes then pick shifts?
  - **Social proof / peer pressure:** show "12 of 40 responded" / "5 yes" to nudge
    sign-ups. Open Q: counts only, or names? (privacy, esp. minors).
  - Likely Phase 3/4. Biggest unknowns: identity-via-email, email infra, and the
    privacy model for rosters that include minors.

## Shipped

- **Phase 1** public board; **Phase 2** organizer grid + "Matsuri at Dusk"
  redesign (live in prod).
- **Clear all tasks** (undoable) and **Minor privacy + optional email/phone**
  (pushed to prod 2026-06-16). See git history / memory for detail.
- **Organizer-grid polish batch** (branch `clear-undo-banner`): persistent
  Clear-all **undo banner**; **help "?" popovers** (Paste a list, Kind);
  **fill-down fills only empty cells** below (non-destructive, ⤓ handle);
  **undo v1** (⟲ toolbar + Cmd/Ctrl+Z for last delete/clear); fixed a StrictMode
  duplicate-key bug in undo.
