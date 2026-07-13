# Youth-Led RSVP and Attendance

**MVP spec.** The first slice of turning Frog Board into the troop's event-RSVP hub, alongside its volunteer marketplace. It ships youth-led RSVP, leader-recorded attendance (events and meetings), patrol standings, and a Scoutmaster attention report, on a privacy stance built to beat BAND. This is one shippable spec, not the whole vision. Google Workspace integration, automated reminders, and richer gamification are named as deferred sub-projects, not built here.

## Why

Today the Scoutmaster runs RSVP on a clipboard, then retypes it into a Google Sheet. Two tabs carry the reality:

- **RSVP tab:** a single "Attending?" column (Yes/No/Maybe/blank), overwritten every event. Last event's answers vanish the moment the next event is typed in. On a live snapshot: 5 Yes, 4 No, 44 blank.
- **Attendance tab:** a scout by meeting-date checkbox grid (2/6, 2/13, 2/20, ...). Present or absent, per meeting.

The clipboard-to-sheet loop is manual, and the RSVP has no memory. The sheet also cannot answer the question the Scoutmaster most needs for advancement: *who is active this term?* That is the gap this MVP fills.

The strategic frame: RSVP, roster, and reminders all pull toward collecting identity, especially from kids, which is exactly where BAND gets heavy (accounts, verifiable parental consent, chat surveillance, five-year retention) and where COPPA gets sharp. We make the constraint the product. We collect the least possible, mediate minors through an adult, prefer tokenized links to accounts, and purge on a short clock. That stance is the cheapest thing that could work and the hardest for BAND to copy, because it is a values commitment, not a feature.

## Goals

- A scout, patrol leader, or parent records RSVP for an event from one pasteable link, no account.
- Peers see who is going and why, so social proof drives attendance.
- A leader records attendance (present/absent) for events and meetings, on the same surface.
- Patrols compete on turnout; individuals are never ranked against each other.
- The Scoutmaster sees who is active this term (attended >= 50%), who is drifting, and who to reach out to, including a per-scout view for Scoutmaster conferences.
- The app collects no personal information from a child.

## Non-goals (deferred, named on purpose)

- Google Workspace integration (Sign-In for adults, Calendar sync, Sheet import automation, Gmail-sent reminders).
- Automated reminders / the email-and-cron loop.
- Per-day RSVP for multi-day events (the `Rsvp.day` field stays, unused; `day = null` means the whole event).
- Recurring-meeting auto-creation ("every Tuesday").
- Badges, trophies, season-long individual leaderboards.
- Real accounts for youth. Ever.

## The experience

Every link opens the same **patrol page**, scoped by what the link grants. No login.

**Scout link (youth-first):** the event and one question, "Are you coming?" Big Going / Can't / Maybe. Below, the patrol roster with each member's status and reason, plus a rollup ("Hawks 5 of 8 going"). The peer list is the nudge; reasons show, for accountability. Minors show first-name + last-initial.

**Patrol-leader link:** the same page, every row tappable. The PL fills gaps at a meeting and, once the event has passed, marks who came.

**Parent link (under-13):** the child's row is the one they set; the patrol shows as last-initials. The only path for a kid with no device, and it keeps contact adult-side.

The whole surface is that page: status, an optional short reason, a tally. No chat, no comments, no likes, no feed. A tool you open, answer, and close.

## The model

Builds on the shipped schema (`Person`, `Rsvp`, `Lead`, `Organization`, `Event`). Changes are additive.

### Capability: one standing link per person

Add a unique `accessToken` to `Person`. The weekly email carries each person's link (`/me/<token>`); the page shows whatever event is open. What the link **lets you do** is computed from the roster row, not stored per link:

- **Anyone:** set their own RSVP, view their patrol.
- **A leader** (a mark on the roster row, seeded from Scout position SPL/ASPL/PL/APL at import): set RSVP and attendance for everyone in their patrol. Same token, wider reach. Lead is a mark, not a title.
- **Under-13:** the same link, handed to the parent.

One nullable column; capability derived from fields already present (`subGroup`, `position`). No new join table.

**Distribution fits the existing weekly email with zero new infrastructure:**

- **Primary: one event link.** An unguessable per-event RSVP link (`/rsvp/<token>`), pasted once into the weekly email. It opens to a "find your patrol, tap your name" picker and **remembers you on the device** after the first tap, so next week it opens to your row. Honor-system tradeoff, stated plainly: a shared link means a kid could tap a peer's row; in a troop that is fine, and visible reasons keep accountability.
- **PL link:** each patrol leader gets one standing personal link that opens their patrol ready to edit. Handed out once, reused every event. This is the one place a per-patrol link earns its keep.
- **Mail-merge, optional:** the organizer view can export name + link, so a Google mail-merge can send each person their own link. Not required.

### Attendance rides on the RSVP row

`Rsvp` today is `(person, event, day, status, reason)`. Two changes:

- Add `attended` (present / absent).
- Relax `status` to optional, so a **walk-in** (came, never RSVP'd) still gets a row, and a **no-show** (said yes, absent) is visible as exactly that.

One row per (person, event) carries both intent and fact. That pairing is the accountability record.

Attendance is **observed, not self-reported.** A no-show never taps "I didn't come." So attendance is a leader/organizer action, surfaced only when the event is today or past, and never shown to a youth's self-view.

### Meetings are attendance-only occurrences

A weekly troop meeting is an `Event` marked as a meeting: no RSVP blast, just roll call. Reuse the patrol page in "mark who's here" mode, one column of the user's existing attendance grid. Add `Event.isMeeting` (boolean). Recurring auto-creation is deferred; for the MVP the Scoutmaster adds the occurrence and takes roll.

### Age tiers, roster-borne

Add nullable `birthYear` to `Person`, entered by a leader or carried from the Scout ID import. Tier is computed, so it stays correct as kids age:

- **Child (under 13):** link to the parent, last-initial, no direct contact, no PII. COPPA sidestepped.
- **Youth (13-17):** own link, last-initial, no email required or collected.
- **Adult (18+):** full access; Google Sign-In in a later slice.

`minor` (under 18, drives last-name hiding) derives from the same number. Missing `birthYear` defaults conservatively to parent-mediated.

## Patrol standings

A team-based, aggregate view derived from attendance:

- **Per-event turnout:** "Hawks brought 7 of 8 (88%)."
- **Term tally:** accumulates across events into a standing ("Hawks lead attendance this term").

Team recognition, Patrol Method. **Individual ranking is out**, by design; it is the individual social comparison Haidt warns against. The standing is **pull, not push**: something you see when you open the page, never a streak or notification engineered to pull a kid back.

## The Scoutmaster attention report

Private to the Scoutmaster (later, group leads for their own patrol). One dataset, three readings, over the **current term** (court of honor to court of honor, roughly 4-6 months), defined by a term-start date the Scoutmaster sets and can adjust.

- **Roster overview**, sorting scouts into:
  - **Attending regularly** — comfortably above the 50% line; Active for advancement.
  - **Needs encouragement** — near the line, or trending down (fine last spring, thinning lately). A short recent-window signal catches drift before the term percentage does.
  - **Reach out** — a real stretch of absences; the parent contact surfaces so the Scoutmaster can call.
- **One-scout view, for the Scoutmaster conference:** pull up a single scout live and see their term at a glance, occurrences attended and missed, percent against the 50% line, recent trend, parent contact. It turns "I feel like you've missed a few" into "here's your term, let's talk."

Active flag = attended / total across events **and** meetings, within the term, meetings and events weighted equally, each occurrence counting once.

## The privacy commitment

Ships as a real, plain-English policy plus the guardrails that make it true.

**The promise:** *"We don't collect personal information from children. Adults keep a roster; kids just tap a link. There's nothing to consent to, because there's nothing to give up."*

The contrast that becomes the promise:

| BAND for Kids | Frog Board |
| --- | --- |
| Child creates an account | No child accounts, ever; youth act via links |
| Verifiable parental consent (credit card) | None needed; no personal info collected from a child |
| Chat/posts/photos; admins download chat history | No chat, no photos, no feed; nothing to surveil |
| DOB, gender, device IDs, cookies, analytics | Name + last initial, adult-maintained; no tracking |
| 5-year retention | Short, event-scoped retention |
| Data on NAVER's servers, third-party SMS/analytics | Your own records; Google Workspace later |

Guardrails, enforced in the architecture:

- **No child PII, by construction.** Names and ages are entered by adults or imported from the Scout roster, never typed by a kid at a signup screen. Under-13 shows first-name + last-initial, contact routes to a parent.
- **Closed, not lived in.** No chat, comments, photos, feed, streaks, or notifications aimed at a kid's phone. Haidt norms 1 and 2, honored in the design.
- **Team competition, not individual ranking.**
- **Short retention.** Attendance rows persist for history; free-text reasons purge on a short clock after the event. Keep the count, not the story.

**What ships:** a `/privacy` page in this voice, and a short "how your info is handled" note on the RSVP page itself, so a parent sees it at the moment it matters.

## Import mapping (from the real sheet)

The BCSF roster sheet is the source of truth for the standing directory:

- **Scout ID** -> `Person.externalIdHash` (stable key; hashed).
- **First/Last Name** -> `name`, with last-initial privacy applied for minors on display.
- **Patrol** (Eagle, Fox, Hawk, King Cobra, Raccoon) -> `subGroup`; group is "Scouts."
- **Position** (SPL/ASPL/PL/APL and others) -> `position`, and derives the leader mark.
- **Inactive section** (Patrol "ZZZ Inactive") -> `active = false`.
- **Attendance tab** date columns -> historical attendance rows per (person, meeting occurrence), so the active report has real history on day one.
- Health-form dates (Form AB/C) are out of scope. Notes map to a private note or an RSVP reason.

## Testing and rollout

- **Strict TDD, red-green-refactor.** Domain logic (capability resolution, attendance rollups, active/attention buckets, patrol standings) lives in pure functions in `lib/domain/` with unit tests. DB paths get `*.db.test.ts` against the test database.
- **Behind a feature flag** (`FLAG_RSVP`, same pattern as `FLAG_TASK_BOARD`), dark by default, previewable on prod before flipping.
- **Riskiest-assumption test (Lean):** for one real event, the Scoutmaster pastes a link into the weekly email, a scout and a PL record RSVP, attendance is marked at the next meeting, and the attention report names who to reach out to. That end-to-end thread is the acceptance test.
- **"Done" for the branch:** both suites green, `npx tsc --noEmit` clean, `npm run lint` clean, and the end-to-end thread demonstrated.

## Relationship to prior specs

This reworks and grounds the roster/RSVP and delegate-per-group direction with a privacy-first, capability-link frame. It coexists with the Groups epic (`2026-07-11-groups-epic-design.md`): this MVP reads patrol from `subGroup` and group from the free-text field as they stand today; the Groups epic's normalization can re-point those reads later without changing this feature's behavior.
