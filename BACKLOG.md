# Frog Board — Product Backlog

Lightweight cards, not specs. Keep each terse: the intent + the open questions.
Status buckets: **In flight → Next → Explore/design → Explore later → Shipped.**
Pull a card up when it's ready; design only the ones that need it.

---

## Lead priority — the value drivers (next, needs design)

Strategic read (2026-06-16): we've already won the hard adoption feature
(**no-account signup**, now with captured email) and most "refinements"
(self-enforcing slot caps, edit-your-own via claim tokens, coordinator grid).
The thing that turns this from "just a form" into a product the coordinator keeps
using is the **reminder loop** — and the thing that beats the incumbents is
**cross-event volunteer history**. Both ride the same email-as-identity plumbing,
so design them together.

- **1. Reminder loop (THE value driver).** Once a slot/frog is claimed, the app
  automatically emails the volunteer reminders before the shift — the coordinator
  never chases anyone. "Offloading the nagging is the real product."
  - Already have: no-account signup, **captured email**, device-local claim
    tokens, and the schedule data (`date` / `startAt` / `dueBy`).
  - Needs (the work): email infra (**Resend**), a **scheduler** (cron/queue),
    templates, unsubscribe + deliverability, and **minor safety** — remind the
    **parent**, not the kid (we already hide minors' last names).
  - Highest value AND highest effort; wants a real design pass.

- **2. Cross-event volunteer history (the moat).** Identify a volunteer across
  events (email-as-identity; `Signup.userId` is reserved for this) and answer
  *"who has and hasn't helped this year?"* across Ginza Bazaar, Bon Odori, and
  troop events. Incumbents (SignUpGenius) handle recurring/rotating needs and
  cross-event history poorly — this fits BCSF's reality exactly. Shares the
  email-as-identity plumbing with the reminder loop. Privacy: cross-event tracking
  of people (esp. minors) needs care.

## Explore / design first

- **Single-card create view**: a focused one-card form to add a task/frog, instead
  of adding rows in the spreadsheet grid. The grid stays the power tool for bulk
  **edit / delete / archive**; the card is the quick "add one thing" path (title,
  kind, area, need, when). Open Q: entry point (a "+ New task" button on the event
  page? the board?), and whether the card also edits a single existing task or stays
  create-only.

- **Friendly page for an unopened board.** A draft event's public link returns a bare
  404, so an organizer previewing the link before opening sign-ups sees a dead end. Show
  a "this event isn't open yet" page instead, like the lead page's friendly invalid state.
  Open Q: should the organizer see a preview of their own draft board while signed in?

- **Full undo/redo history** — v1 ships single-level undo (last delete/clear via
  ⟲ button + Cmd/Ctrl+Z). A bigger card: multi-step history, **redo** (↷ /
  Cmd+Shift+Z), and undo of **cell edits** and **row reorders**. Hard because the
  grid autosaves to the server, so each step needs a compensating server action.
  (The "Phase 4: session Ctrl+Z" item.)

- **Need = range (2–3) + "TBD"** — `Task.neededCount` is a single int today.
  Ranges and an unknown state change the data model *and* the board's
  "X of N filled / full" + claim/full logic. (Absorbs the earlier "count = TBD".)
- **Time = TBD** — explicit "time TBD" label on the board for tasks with no clock.
- **Kanban "flex to the need" board (Phase 3 — now the lead direction).** Replace
  the flat list with Trello-style **cards** so the biggest gaps are obvious and
  volunteers flow to them instead of camping on the comfortable task. Two lenses
  on the same cards ("renderings of the same data"):
  - **Volunteer "flex" lens** — columns by urgency/time (**Now / Next / Later**,
    or by day/time block). Unclaimed/understaffed cards float to the top; urgent
    ones get a **red decoration**; a **"Needed by"** badge can also auto-bucket
    cards. This is the behavior-changing view.
  - **Organizer tracking lens** — **To Do / WIP / Done** (existing
    `TaskStatus = todo|in_progress|review|done`).
  - **Drag/drop** to promote a card up / across columns (writes `position` /
    status). ⚠️ Touch DnD is the hard part — Phase 2 deliberately avoided pointer
    DnD for mobile/a11y; needs a tap-to-move fallback, not drag-only.
  - Supersedes the old "drag-handle reorder + multi-column sort" card. Insight:
    the org wants to move *away* from rigid shifts toward flexible, pick-up frogs
    that flow to where the need is — which lowers the priority of Need=range/TBD.

## In flight

(nothing right now)

## Explore later (epic)

- **In-app feedback** — a lightweight way for volunteers and organizers to send
  feedback from inside the app (a "Tell us what's confusing" link to a form or
  mailto), so we capture reactions while testing instead of chasing replies.
- **AI agents for organizers** — explore agents that draft a task list from a
  plain description, suggest where help is needed, or write reminder messages.
  Intent is still loose; define the first concrete job before building.
- **Passwordless accounts (magic links + SMS).** When real accounts arrive, make
  sign-in passwordless and modern: email **magic links** and **SMS** one-time codes/
  links, no passwords to remember. Fits the no-friction ethos that won adoption, and
  reuses the reserved email-as-identity plumbing (`Signup.userId`). Needs: an email
  sender (**Resend**, shared with the reminder loop) and an **SMS provider** (Twilio?
  cost per message). Minor safety: text the **parent**, not the kid. Open Q: which
  role gets accounts first (organizers, then volunteers?), and session/link expiry.
  Underpins **Avatars** and the roster/RSVP identity work below.

- **Avatars** — show people's avatars on the board and in history once real
  accounts exist (depends on the accounts/identity work; not possible with the
  current no-account, name-only model).
- **Generalized facet filters** — extend the `?group=` board filter to
  `?location=`, `?category=`, `?date=` and combinations (and faceted "chips" UI).
  Same mechanism as the group filter; build when more than one facet is wanted.
- **Normalized Group entity + group-organizer role** — promote free-text
  `requestedGroup` to a real Group (patrol / troop / YAO / church group) with a
  controlled vocabulary, and a logged-in **group-organizer** with a special view
  (their group's coverage, manage their roster). Accounts + permissions → part of
  the roster/RSVP epic below. Free-text Group is enough until then.
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

- **Revert from history** (branch `revert-from-history`, built + green). A
  "Revert" button on delete and edit rows undoes the change: it recreates a
  deleted task with its signups (claim tokens snapshotted, so restores are
  lossless) or restores an edit's prior values. The undo is itself an audit row,
  stamped to the organizer. Move/claim/release revert deferred. Time-of-day
  shown in the viewer's own timezone.
- **Event history viewer + soft identity** (branch `event-history`, in prod).
  Read-only `/organize/[eventId]/history` shows who changed what, when, newest
  first, built on the `AuditLog`. Organizers enter a name at sign-in; it stamps
  `actorName` on every audit row (`actorId` reserved for real accounts, C).
  Linked from the grid header.
- **Phase 1** public board; **Phase 2** organizer grid + "Matsuri at Dusk"
  redesign (live in prod).
- **Clear all tasks** (undoable) and **Minor privacy + optional email/phone**
  (pushed to prod 2026-06-16). See git history / memory for detail.
- **Organizer-grid polish batch** (branch `clear-undo-banner`): persistent
  Clear-all **undo banner**; **help "?" popovers** (Paste a list, Kind);
  **fill-down fills only empty cells** below (non-destructive, ⤓ handle);
  **undo v1** (⟲ toolbar + Cmd/Ctrl+Z for last delete/clear); fixed a StrictMode
  duplicate-key bug in undo.
- **Group-filtered shareable board** (live in prod, commit `4e84da4`):
  `/?group=Scouts` shows only that group's tasks + a coverage header
  ("Showing Scouts tasks — 7 of 9 covered") + "see the whole event" link.
  `filterTasksByGroup` / `coverageFor` in `lib/domain/board.ts`. This is the
  public **recruit / self-sign-up** front door per group. It shows counts, not
  names (public, so minor-safe). The private named-roster view for an appointed
  lead is the delegate report (see the delegate-per-group spec). Query-param so it
  generalizes to other facets later (see Explore-later "Generalized facet filters").
