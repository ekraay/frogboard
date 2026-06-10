# Volunteer Frog Board — Design Spec

**Date:** 2026-06-09
**Author:** ekraay (scoutmaster, BCSF)
**Status:** Approved design, pre-implementation

## Purpose

A mobile-first web app for volunteers to self-organize into shifts and tasks
for community events, replacing PrestoGem. Built on the self-organization
principles in Henrik Kniberg's *Self-organizing a 50-person party*: visual
management, grab-a-card, work in pairs, clear definition of done — and Rev
Opel's "frog" idea, where a printed need sits out until someone scoops it up.

First use: the Buddhist Church of San Francisco (BCSF) Ginza Bazaar / Bon Odori.
Designed to be reused for any future event, including scout activities.

### Problems being solved
- **Youth can't/won't sign up** — PrestoGem requires an account + email; youth
  often have neither. → No accounts at all. Type your name like a Google Sheet.
- **Poor transparency** — PrestoGem's UI makes "who signed up for what" hard to
  see. → A clear, mobile-first board where filled/open is obvious at a glance.
- **Reminders** — leaders need to nudge their own people. → Reports sliced by
  group/area/day/person, reviewed in meetings (the reminder backbone).

## Principles
- **Accounts are optional, never required.** Anonymous is the default — open a
  link, type your name, like editing a shared sheet (this is the youth path,
  zero friction). Anyone who wants a stable identity, a "my shifts" view, or
  reminders can *optionally* create a passwordless account. Following the
  Wikipedia model: trust comes from transparency + revert, not gatekeeping.
- **Passwordless auth.** Magic link via email (primary) + optional Google
  one-tap. No passwords. Youth without email simply stay on the anonymous path.
- **Mobile-first is a hard requirement**, not a polish item — single-column,
  thumb-friendly cards, claim in two taps, no pinch-zoom. This is a core reason
  for leaving PrestoGem.
- **YAGNI / DRY / KISS** throughout. One data model, one view engine, fixed
  scope. Defer roles, auth scopes, and automated messaging.
- **Frog theme** — the board is a pond, cards are lily pads, claiming is
  scooping up a frog. Warm and low-pressure, reinforcing "grab a card."

## Tech stack (sensible default, ~$0/month)

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (React + API routes) | One codebase for UI and server logic |
| Auth | Auth.js (NextAuth) + Prisma adapter | Passwordless magic-link + Google; standard, free |
| Hosting | Vercel free tier | Push-to-deploy, $0, custom domain |
| Database | Neon (serverless Postgres) + Prisma ORM | Free tier, relational, clean schema |
| Email | Resend free tier (3k/mo) | Sends magic links (v1); reminders later |
| SMS | Twilio | Only paid piece; deferred to later phase |

Run cost is $0/month until SMS is switched on. Resend's free tier covers
magic-link auth email.

## Data model

Four domain tables (Event, Task, Signup, AuditLog) plus the Auth.js-managed
identity tables (User, Account, Session, VerificationToken — created by the
Prisma adapter, not hand-modeled here). Shifts and frogs are the same entity
with a `kind` flag — they share ~80% of fields, so unifying keeps board,
reports, and revert DRY.

### Event
- `id`
- `name` (e.g. "Ginza Bazaar / Bon Odori 2026")
- `startDate`, `endDate` (overall range)

### Task  (a shift OR a frog)
- `id`, `eventId`
- `kind` — `"shift"` | `"frog"`
- `title` (e.g. "Games", "Bring 50 cups")
- `category` — free-text functional area, autocomplete from existing values in
  the event (e.g. "Bingo", "Food/Kitchen", "Auction"). Keeps reports clean
  without a management screen.
- `requestedGroup` (optional) — affiliate asked to staff it (Scouts, YAO, BWA,
  Taiko, Soko Gakuen, Board). Distinct axis from `category`.
- `neededCount` — how many people are wanted
- `date` (optional)
- `startTime`, `endTime` (optional) — for `kind: shift`. Both blank = "All day".
- `dueBy` (optional) — for `kind: frog`, a "done by" deadline.
- `pointOfContact` (optional) — name + optional phone/email of who can explain
  the job.
- `location` (optional) — where to meet for this task (e.g. "Inside Gym",
  "Octavia St in front of gym"). Shows on every view.
- `definitionOfDone` (optional) — short note: when is this task complete.
- `status` — `"todo"` | `"in_progress"` | `"review"` | `"done"`. Default
  `todo`. Drives the Kanban view; shown as a badge in every other view.
- `waiting` (boolean, default false) — a decoration/flag on the card,
  independent of its column. Signals the card is stuck/blocked and needs
  attention (waiting on a person, delivery, decision). Visible in all views.

### Signup
- `id`, `taskId`
- `name` (required) — single free-text field (KISS: preserves "type your name";
  youth often go by first name only). Table view shows one "Name" column.
- `email` (optional), `phone` (optional)
- `group` (optional) — asked at claim time via dropdown, so reports can slice by
  who actually signed up.
- `minor` (optional yes/no) — whether the volunteer is under 18; one optional
  checkbox at claim time, surfaced for youth-protection counts and the table.
- `userId` (nullable) — set when a logged-in user claims (links to Auth.js
  `User`); null for anonymous signups. Powers the "my shifts" view and reminders.
- `createdAt`

### AuditLog (append-only)
- `id`, `taskId`
- `action` — `"claim"` | `"release"` | `"edit"` | `"move"` (status change) |
  `"flag"` (waiting toggle)
- `details` — enough to render "who did what when" and to revert
- `createdAt`

**Two independent tag axes**, deliberately separate:
- `category` = functional area → for **area managers**.
- `requestedGroup` / signup `group` = affiliate → for **affiliate leaders**.

## Surfaces

### Public board (no login, shared by link/QR)
- Pick an event → see its tasks grouped by date.
- Each card shows: title, time ("Sat 10 AM–1 PM"), or "needed by Sat noon" for a
  frog, or "All day"; category; requested group if any; **slots as "2 of 5
  filled"** with the claimant names (the transparency fix); point of contact;
  definition of done.
- Open vs. full is obvious at a glance; full cards recede.
- Frogs and shifts sit together as cards (lily pads); same scoop-it-up gesture.

### Claiming
- Tap an open card → type name (email, phone, group all optional) → claimed;
  your name appears on the card.
- Seeing who's already on a card is how **pairing** happens — join your buddy.
- **Release:** tap your own name → "remove me." Anyone *can* edit/remove (it's
  the open whiteboard), but every change is logged and revertible.

### Kanban / progress view
- A second view of the same tasks, grouped into four columns: **To Do →
  In Progress → Review → Done**. One more lens on the view engine (group-by
  `status`), not a parallel system.
- **Move a card** to change its status. Mobile-first: primary interaction is
  **tap card → "move to →"** menu; drag-and-drop is a desktop nicety. (Mobile is
  the baseline, not drag.)
- **Waiting** is a flag toggled on a card (see model) — a "stuck / needs
  attention" decoration shown in any column, not its own column. Surfaces what
  Kniberg calls people getting stuck.
- **Review** column ties to definition of done: a doer moves their card here to
  signal "meets the DoD, please verify"; the point of contact (natural reviewer,
  not enforced) moves it to Done.
- Status and waiting changes are **logged in the audit log and revertible**, like
  claims. Open whiteboard — anyone can move a card.
- Status also shows as a badge in the by-day / category / group / person views.

### Table / roster view
- A third rendering of the same data (alongside board and Kanban), grouped by
  shift or category — the format BCSF already lives in (see the existing
  roster sheets).
- Each shift renders its header (job, date, time, location, contact, definition
  of done) then a **numbered roster** of signups — with **empty slots shown up to
  the needed count** (the "Count 1–6" pattern), so gaps are obvious.
- Columns: count, name, email, group, minor. Status/waiting shown as badges.
- **CSV export**, so a roster drops straight into the Google Sheets the org
  already trusts. This is a rendering of the view engine, not a separate system.

### Physical frog QR codes
- Every card has a stable URL. Admin can print a QR per card — the physical
  frogs. Scan → land on that card's page → read details → tap to claim.

### Optional accounts (passwordless)
- A "Sign in" affordance, never blocking — the board and claiming work fully
  without it.
- **Magic link via email** (primary) + **Google one-tap** (optional). No
  passwords. Youth without email stay anonymous; nothing changes for them.
- When signed in: name + email **prefilled** on claim (`userId` attached), and a
  **"My shifts"** view lists everything that account has claimed across events —
  the self-serve personal schedule.
- An account is just a stable identity + contact info. No roles or admin powers
  attach to it (admin stays the shared-password area).

### Admin (one shared password, unlisted URL)
- Create/edit events and their tasks (shifts and frogs).
- **Bulk import** — paste rows from the existing Google Sheet so 60+ tasks
  aren't hand-entered.
- **Edit/revert** — view the audit log, undo any bad change (graffiti
  insurance).
- Print QR codes for cards.

## Reports — one view engine, four lenses

Reports are grouped/filtered views of the same Task + Signup data, each with the
filled/needed gap overlay. Not four separate code paths.

- **By day** → overall schedule, time-ordered (the timeline view).
- **By category/area** → an area manager's own view (e.g. Kitchen, with gaps).
- **By group** → an affiliate leader's roster (reminder backbone).
- **By person** → an individual's personal schedule (admin can pull any; account
  holders see their own self-serve via "My shifts").

All lenses are on-screen + printable for meetings.

- **Area-manager access (v1):** read-only printable per-area view. No per-area
  login scopes (YAGNI). Editing uses the shared admin link.
- Email/SMS delivery of these reports is deferred; the reports are exactly what
  those future messages will contain.

## Out of scope (v1 — deferred)
- Automated email/SMS reminders (Resend/Twilio wired later). Accounts make these
  a clean fast-follow, but v1 reminders stay leader-relayed via reports.
- SMS / phone-based login (magic link is email-only in v1; youth use anonymous).
- Per-area / per-role login scopes and permissions.
- A dedicated category-management screen (autocomplete instead).
- An Organization entity above Event (reuse for scouts = just make an event).
- Recurrence / auto-splitting of long shifts (admin creates multiple rows).

## Reversibility notes (one-way vs two-way doors)

Where to spend caution. Two-way doors are cheap to add later; build them only
when needed. One-way doors are sticky; design for them now.

**Organization above Event — two-way door.** Adding it later is a routine
additive migration: create `Organization`, add a nullable `organizationId` to
`Event`, backfill existing events to a default org. No rewrite, because all core
logic already hangs off `eventId`. Deferred per YAGNI. Mild caveat: global
surfaces (single admin password, "all events" list) accumulate until then and
must be partitioned when orgs arrive — moderate, not a one-way door.

**Volunteer identity (optional accounts) — built on the Wikipedia model.**
Anonymous participation is the default (type a name, like an IP-attributed
edit); trust comes from full history + cheap revert (the audit log). Optional
passwordless accounts layer on top for anyone who wants a stable identity, a
"my shifts" view, or (later) reminders — never required, so youth friction stays
zero. `Signup.userId` is nullable: anonymous signups leave it null, signed-in
claims link to a `User`. This keeps anonymous and account paths independent, so
either can evolve without breaking the other.

**Task `kind` unification — merge-easy, split-hard.** Shifts and frogs share one
table. Splitting later touches every query, so unifying is the safe default.

**Audit log completeness — log generously.** You can only revert what you
logged; under-logging can't be fixed retroactively.
