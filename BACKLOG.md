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

- **Garden home / workspace hub (Trello-style)**: the brand (🐸 Frog Board)
  eventually opens a hub listing your **gardens** (orgs/workspaces you can
  reach), **ponds** (groups), **gatherings** (events), and **standing boards**,
  like Trello's boards-and-workspaces home. Multi-tenant home screen. It grows
  out of the minimal single-org "BCSF garden home" shipped on the nav branch
  (public landing at `/`, Gatherings + Ongoing boards). Belongs with
  multi-tenant / the [[groups-epic]]. Open questions: per-user access scoping,
  recents/starred, and where a signed-in organizer view diverges from the
  public volunteer view.

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

- **Add one person without a spreadsheet paste.** Adding a single person to a roster
  today forces the bulk importer: it needs a **header row** plus a **tab-separated**
  data row, so a typed name shows "0 people detected" and saves nothing. The
  **group vs patrol** split also trips people up (the group is e.g. `Troop 29`; the
  patrol is the `Patrol`/sub-group column, not the group). Want a one-line "add a
  person" field on the roster panel: name + patrol (+ optional Scout ID), calling the
  same `importPeople` under the hood so privacy invariants hold. This is the concrete
  quick-add slice of the planned **groups directory** (add/remove/edit a person
  directly), referenced in the email-as-identity card below. Open Q: also inline
  edit/remove a person, and does this live in `LeadsPanel` or a small roster view?

- **Non-blocking filter panel (see the board while filtering).** The `FilterFlyout`
  is a **center-aligned** modal over a **blurred** backdrop (`bg-ink/40` +
  `backdrop-blur-sm`), so you cannot see the cards it is filtering. Filtering is
  already live (each toggle re-renders the board instantly); the overlay just hides
  and blurs it. Want a non-blocking panel so the
  board stays visible: a side drawer on desktop, a bottom sheet on mobile that leaves
  the cards above it visible. Revisit the a11y bits that assumed a modal: drop
  `aria-modal`/focus-trap for a non-modal panel, keep Escape-to-close, and rethink the
  focus-on-open added in Phase 2 (grabbing focus into a non-modal panel may be wrong).
  Open Q: desktop drawer vs. an inline filter bar, and whether the panel stays pinned
  open while you work the board.

- **Non-prod database wiring (Preview builds + local e2e).** Two related gaps, both
  about which DB the non-production environments use:
  - **Vercel Preview deploys fail.** The Preview `DATABASE_URL` is pinned to a single
    git branch (`grid-column-aware-paste`), so a preview build on any other branch has
    no URL and `prisma migrate deploy` fails (PR #7 saw this). Fix: add a Preview
    `DATABASE_URL` with **no branch filter**, pointing at a **non-prod** database (a
    dedicated Neon preview branch or a plain separate DB), plus `FLAG_TASK_BOARD` if
    previews should show flagged work. Seed that DB once so preview boards have data.
    Lock-in note: branching is Neon-specific convenience; the app/schema/migrations are
    plain Postgres, so a plain separate database is the most portable option.
  - **Local `npm run test:e2e` writes to the dev DB.** Playwright's `webServer` runs
    `npm run start`, which loads `.env` (`frogboard`), not `.env.test` (`frogboard_test`).
    So local e2e reads/writes the shared dev DB, and `organize.spec.ts` leaves an
    "E2E Matsuri" event behind each run (later runs then hit strict-mode dup errors). CI
    is safe (its own throwaway Postgres). Fix: give the `webServer` a `.env.test`
    `DATABASE_URL` so local e2e uses `frogboard_test`, mirroring CI.

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
- **Customizable labels per org.** The ponds metaphor (frog / lily pad / Shift /
  Task) needs explaining, which is friction. Let each org pick its own vocabulary:
  plain "Shift / Task," or full themed language, so the label carries itself
  without a "what's this?" explainer. A troop that wants frogs keeps frogs; one
  that wants plain words gets them. Ties to the naming work on the nav-ponds branch
  (kind stored as `errand`, shown as "Task").
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
- **Participation tracking across events (needs the groups epic).** Once people
  persist in the org roster (`2026-07-11-groups-epic-design.md`), join a person's
  answers across the year's events to see who volunteers and who does not.
  - **Reliability report:** "Alex: 5 of 6 events; Bo: 0 of 6." Surfaces reliable
    people, ghosts, and families carrying every event (fairness).
  - **Scout service-hour tally:** count each scout's events (later, hours) across
    the year. A concrete deliverable for the scoutmaster.
  - **Feeds targeted reminders:** the reminder loop nudges exactly the people who
    never respond.
- **Attendance check-in (RSVP intent vs actual show).** RSVP and task sign-ups
  record intent and claims, not whether someone showed up. Add a lightweight
  "did it" / check-in mark at the event so participation reports reflect reality.
  Separate from RSVP; builds on the persistent roster.
- **Email as identity, not as a dedup fix.** Import dedups by hashed Scout ID;
  people without one (adults/parents) do not dedup and duplicate on re-import.
  Do not add email just to fix that: scouts already have IDs, and the groups
  directory (add/remove/edit a person directly) removes the re-paste workflow
  that makes dedup hurt. Email earns its place with the reminder loop and
  passwordless accounts, so introduce it there, not here. Privacy weight is real:
  storing minors' contact info is the escalation this app deliberately avoided
  (youth protection). If ID-less dedup is needed sooner, store an optional
  `emailHash` as a secondary match key (no raw address); keep raw email only for
  people you actually message.
- **Callable API layer (external integrations).** Expose a thin HTTP API over the
  existing repository layer so scripts can populate events and rosters, not just
  the browser. The layering already supports it: a Route Handler
  (`app/api/v1/.../route.ts`) validates input, authenticates, then calls the same
  `createEvent` / `createStandingBoard` / `importPeople` functions the server
  actions call, so the privacy invariants (hashed Scout IDs, abbreviated minors)
  come for free.
  - **Auth:** per-integration API keys (random token, stored hashed via the
    existing HMAC util, `Authorization: Bearer`), scoped to the org, separate from
    the browser session.
  - **Validation + idempotency:** zod at the edge; a stable per-org `externalRef`
    on events so re-syncs update instead of duplicating (people already dedup by
    hashed Scout ID).
  - **First integrations:** Google Calendar → events (real API but needs OAuth; a
    cheap v1 is `POST /api/v1/events/import` fed by a connector script); Scoutbook
    → roster (no open API, so a CSV-export script POSTs to
    `/api/v1/rosters/import`). Open Q: which integration first, and whether to do
    full Google OAuth or start with the script-fed import endpoint.
- **Trello-style agnostic columns (Task Board Status grouping).** The Task Board
  redesign (`2026-07-11-task-board-phase-1-design.md`) defaults to Availability
  grouping and defers Status. When Status grouping lands (Phase 2), decide the
  model: keep a fixed status spine (Backlog / Next / In process / Waiting / Done)
  or go Trello-agnostic with **user-defined columns** per board (a `Column`
  entity with a name + order; a card belongs to a column). The user prefers the
  agnostic model. Bigger schema, but the board's grouping is already pluggable,
  so custom columns become one more grouping dimension. Decide at Phase 2, not
  before.

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
