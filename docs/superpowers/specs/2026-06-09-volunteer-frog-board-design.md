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
- **No accounts** for volunteers. Open a link, type your name. Email/phone
  optional, exactly like editing a shared sheet.
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
| Hosting | Vercel free tier | Push-to-deploy, $0, custom domain |
| Database | Neon (serverless Postgres) + Prisma ORM | Free tier, relational, clean schema |
| Email | Resend free tier (3k/mo) | Simple API; deferred to later phase |
| SMS | Twilio | Only paid piece; deferred to later phase |

Run cost is $0/month until SMS is switched on.

## Data model

Four tables. Shifts and frogs are the same entity with a `kind` flag — they
share ~80% of fields, so unifying keeps board, reports, and revert DRY.

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
- `definitionOfDone` (optional) — short note: when is this task complete.

### Signup
- `id`, `taskId`
- `name` (required)
- `email` (optional), `phone` (optional)
- `group` (optional) — asked at claim time via dropdown, so reports can slice by
  who actually signed up.
- `createdAt`

### AuditLog (append-only)
- `id`, `taskId`
- `action` — `"claim"` | `"release"` | `"edit"`
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

### Physical frog QR codes
- Every card has a stable URL. Admin can print a QR per card — the physical
  frogs. Scan → land on that card's page → read details → tap to claim.

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
- **By person** → an individual's personal schedule.

All lenses are on-screen + printable for meetings.

- **Area-manager access (v1):** read-only printable per-area view. No per-area
  login scopes (YAGNI). Editing uses the shared admin link.
- Email/SMS delivery of these reports is deferred; the reports are exactly what
  those future messages will contain.

## Out of scope (v1 — deferred)
- Automated email/SMS reminders (Resend/Twilio wired later).
- Per-area / per-role login scopes and permissions.
- A dedicated category-management screen (autocomplete instead).
- An Organization entity above Event (reuse for scouts = just make an event).
- Recurrence / auto-splitting of long shifts (admin creates multiple rows).
