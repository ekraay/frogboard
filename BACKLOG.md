# Frog Board — Product Backlog

Lightweight cards, not specs. Keep each terse: the intent + the open questions.
Status buckets: **In flight → Next → Explore/design → Explore later → Shipped.**
Pull a card up when it's ready; design only the ones that need it.

---

## In flight

- **Undo banner for "Clear all"** — replace the fading bottom-corner toast with a
  persistent inline banner that stays until you Undo or take the next action
  (add/paste commits the delete). Code done on branch `clear-undo-banner`, tests
  written, not yet committed.

## Next (quick, no design)

- **Help "?" popovers** — hide the verbose grid-toolbar tip behind tap/click
  popovers next to "Paste a list" and "Kind". Mobile-first → click, not hover.
- **Fill-down** for Location / Group / etc. — extend the grid's existing
  fill-down to more columns.

## Explore / design first

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
