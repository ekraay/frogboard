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

**Scout link (youth-first):** the event and one question, "Are you coming?" Big Going / Can't / Maybe. Below, the patrol roster with each member's status, plus a rollup ("Hawks 5 of 8 going"). The peer list is the nudge. Reasons are not peer-visible free text: the peer view shows status only, or an optional preset chip (Sick, Away, Conflict). Any free-text reason stays leader-only. Minors show first-name + last-initial. An under-13's row is **display-only** here; a child sets their RSVP only through the parent link, never on a shared or peer surface.

**Patrol-leader link:** the same page, every row tappable. The PL fills gaps at a meeting and, once the event has passed, marks who came.

**Parent link (under-13):** the child's row is the one they set; the patrol shows as last-initials. The only path for a kid with no device, and it keeps contact adult-side.

The whole surface is that page: status, an optional short reason, a tally. No chat, no comments, no likes, no feed. A tool you open, answer, and close.

## The model

Builds on the shipped schema (`Person`, `Rsvp`, `Lead`, `Organization`, `Event`). Changes are additive. Note the ground truth: these tables are migrated but unreferenced. No code in `app/` or `lib/` reads them yet (migration `20260709040855_add_roster_rsvp`), so this is greenfield behavior on empty tables, not an extension of running code. `Rsvp` uniqueness already ships as partial unique indexes in raw SQL, not in `schema.prisma`: `Rsvp_personId_eventId_wholeEvent_key` on `(personId, eventId) WHERE day IS NULL`, plus a per-day one. That shapes the write path (see below).

### Capability: standing links, one token model

Two token surfaces, resolved so they do not collide:

- **`Person.accessToken` (`/me/<token>`):** a per-person standing link. What it **lets you do** is computed from the roster row, not stored per link. This is also the patrol-leader link: a leader's own `/me/` link opens their patrol ready to edit. Leadership is position-derived (below), so no per-event row is needed.
- **`Event.rsvpToken` (`/rsvp/<token>`):** a new nullable column on `Event`. Today `Event` carries no token, so this is additive. It is the one shared, pasteable link per event.

The shipped `Lead` table does **not** back the PL link: `Lead.eventId` is `NOT NULL`, so a `Lead` row cannot be the standing, event-independent link the spec wants. Leadership comes from `position`, not `Lead`. Drop `Lead` from this feature (or repurpose it later); do not wire both a position-derived mark and a per-event `Lead` row.

What a `/me/` link grants, from the roster row:

- **Anyone (youth 13+ / adult):** set their own RSVP, view their patrol.
- **A leader:** set RSVP and attendance for everyone in their patrol. Same token, wider reach. Lead is a mark, not a title.
- **Under-13:** the link is handed to the parent; the child never holds a self-service link.

The leader mark is derived by an **explicit allowlist**, not a substring guess: `position` in {SPL, ASPL, PL, APL} (and any others we confirm) marks a leader; everything else, including typos and blanks, defaults to non-leader. Unit-test the allowlist; it grants write access to peers' rows.

**The under-13 write invariant (COPPA, enforced in the permission model):** an under-13's RSVP is settable **only** through the parent's `/me/` link. On the shared `/rsvp/` picker and every peer view, under-13 rows are display-only. Under-13 attendance stays adult-observed. This is an enforced invariant on the write path, not a UI nicety; it lands in the permission model before the RSVP-setting endpoint exists.

**Distribution, honest about today's infrastructure:** no email or cron loop exists (the "weekly email" is the Scoutmaster's manual Gmail), so the MVP has one deliverable channel:

- **The shared event link (`/rsvp/<token>`)** is the real MVP distribution: pasted once into the weekly email. It opens to a "find your patrol, tap your name" picker and **remembers you on the device** after the first tap. Honor-system tradeoff, stated plainly: a shared link means a 13+ scout could tap a peer's row; in a troop that is fine. Under-13 rows are display-only on this picker (see the invariant above).
- **Per-person `/me/` delivery is deferred.** Sending each person their own link needs the mail-merge below, which needs infrastructure we have not built. The `/me/` capability model ships; its per-person delivery waits.
- **Mail-merge, deferred:** the organizer view can export name + link so a Google mail-merge sends per-person links. Named, not built in the MVP.

### Attendance rides on the RSVP row

`Rsvp` today is `(person, event, day, status, reason)`. Two changes:

- Add `attended` (present / absent).
- Relax `status` to optional, so a **walk-in** (came, never RSVP'd) still gets a row, and a **no-show** (said yes, absent) is visible as exactly that.

One row per (person, event) carries both intent and fact. That pairing is the accountability record.

**Write the row with raw `INSERT ... ON CONFLICT`, not `prisma.rsvp.upsert`.** The uniqueness is a partial index (`(personId, eventId) WHERE day IS NULL`) that Prisma v6 cannot model, so the typed upsert will not compile against it. Target that conflict key directly. Relaxing `status` to nullable and adding walk-in and no-show rows still route through the same conflict target.

Attendance is **observed, not self-reported.** A no-show never taps "I didn't come." So attendance is a leader/organizer action, surfaced only when the event is today or past, and never shown to a youth's self-view.

### Meetings are attendance-only occurrences

A weekly troop meeting is an `Event` marked as a meeting: no RSVP blast, just roll call. Reuse the patrol page in "mark who's here" mode, one column of the user's existing attendance grid. Add `Event.isMeeting` (boolean). Recurring auto-creation is deferred; for the MVP the Scoutmaster adds the occurrence and takes roll.

### Age tiers, leader-toggled

Tier decides who may self-manage. No stored birthday drives a live age gate; a leader flips a scout to self-management the week they turn 13. Two nullable fields on `Person`: `birthYear` for the default, and `tierOverride` a leader sets on the roster row. Tier is a pure function, and the override wins:

```
tierFor(person, today):
  if person.tierOverride: return person.tierOverride     // leader-set: 'child' | 'youth' | 'adult'
  if person.birthYear == null: return 'child'            // conservative default
  const age = today.year - person.birthYear              // coarse
  if age <= 13: return 'child'                           // parent-mediated (COPPA line)
  if age <= 18: return 'youth'                           // own link, last-initial
  return 'adult'
```

- **Child (under 13):** parent-mediated only. No self-RSVP, no direct contact, no PII. The leader sets `tierOverride = 'youth'` the week the scout turns 13.
- **Youth (13-17):** own `/me/` link, last-initial.
- **Adult (18+):** full access.

`minor` (under 18, drives last-name hiding) derives from the resolved tier, child or youth. The 13 line gates self-management only; last-name hiding runs to 18 regardless. Keep `tierFor` a pure, unit-tested function so storage stays swappable. This replaces the earlier conservative-rounding idea; do not do both.

**Later: Google login authenticates, it does not outsource COPPA.** A future slice adds Google Sign-In. Resolve `tierFor` from an ordered signal list, first hit wins: `tierOverride`, then verified-13+ (Google, later), then the `birthYear` default, then `child`. A present, valid consumer Google account is a positive 13+ signal (Google age-gates at 13); its absence is not a signal, since an adult may never sign in. Under-13 is unchanged: consumer Google will not create their accounts, so parent-mediated stays. Adding Google is one more signal, not a caller change, and it changes nothing about stored PII or the `/privacy` promise.

## Patrol standings

A team-based, aggregate view derived from attendance:

- **Per-event turnout:** "Hawks brought 7 of 8 (88%)."
- **Term tally:** accumulates across events into a standing ("Hawks lead attendance this term").

Team recognition, Patrol Method. **Individual ranking is out**, by design; it is the individual social comparison Haidt warns against. The standing is **pull, not push**: something you see when you open the page, never a streak or notification engineered to pull a kid back.

## The Scoutmaster attention report

Private to the Scoutmaster (later, group leads for their own patrol). One dataset, three readings, over the **current term** (court of honor to court of honor, roughly 4-6 months). Store the term start as `Organization.termStart` (a date the Scoutmaster sets and can adjust); the report has nowhere to scope from without it. An occurrence counts toward the term when its date is on or after `termStart` (start-date inclusive).

The buckets are pinned math, not adjectives, because a wrong bucket drives a real call to a family. `pct` = occurrences attended / occurrences held in the term. `recent` = the last 3 occurrences held. The plan locks these values and tests each boundary:

- **No data** (0 occurrences held in the term, or the scout joined after every occurrence): shown as "No term data yet," never "reach out." Guard the divide-by-zero explicitly.
- **Attending regularly** (`pct >= 50%` and not flagged drifting): Active for advancement.
- **Needs encouragement** (`30% <= pct < 50%`, or `pct >= 50%` but drifting, where drifting = attended at most 1 of the last 3 occurrences): near the line or thinning lately. The recent-window signal catches drift before the term percentage does.
- **Reach out** (`pct < 30%`, or 3 or more consecutive absences): a real stretch of absences; the parent contact surfaces so the Scoutmaster can call.

- **One-scout view, for the Scoutmaster conference:** pull up a single scout live and see their term at a glance: occurrences attended and missed, `pct` against the 50% line, recent trend, parent contact. It turns "I feel like you've missed a few" into "here's your term, let's talk."

Active flag = attended / total across events **and** meetings, within the term, meetings and events weighted equally, each occurrence counting once.

## The privacy commitment

Ships as a real, plain-English policy plus the guardrails that make it true.

**The promise:** *"We don't collect information from your child. Adults keep a minimal roster so scouts earn advancement; your child never makes an account, enters data, or is tracked."*

The contrast that becomes the promise:

| BAND for Kids | Frog Board |
| --- | --- |
| Child creates an account | No child accounts, ever; youth act via links |
| Verifiable parental consent (credit card) | None needed; no personal info collected from a child |
| Chat/posts/photos; admins download chat history | No chat, no photos, no feed; nothing to surveil |
| DOB, gender, device IDs, cookies, analytics | Adult-maintained roster: name, patrol, birth year, attendance history, parent contact; no child accounts, no tracking |
| 5-year retention | Reasons purge on a short clock; attendance persists as minimal counts |
| Data on NAVER's servers, third-party SMS/analytics | Your own records; Google Workspace later |

The left column names specific BAND practices (credit-card consent, chat-history download, five-year retention, NAVER servers). Before publishing, verify each against BAND's current policy, or soften to categories. Publishing named, specific claims about a competitor invites dispute.

Guardrails, enforced in the architecture:

- **No child PII, by construction.** Names and ages are entered by adults or imported from the Scout roster, never typed by a kid at a signup screen. Under-13 shows first-name + last-initial, contact routes to a parent.
- **Under-13 cannot self-RSVP.** A child's RSVP is settable only through the parent's `/me/` link; the shared picker and peer views render under-13 rows display-only. Enforced on the write path, not just the UI (see the capability section).
- **Reasons are not peer-visible free text.** The peer roster shows status or an optional preset chip; free-text reasons stay leader-only, then purge on a short clock.
- **Closed, not lived in.** No chat, comments, photos, feed, streaks, or notifications aimed at a kid's phone. Haidt norms 1 and 2, honored in the design.
- **Team competition, not individual ranking.**
- **Short retention, stated truthfully.** Reasons purge on a short clock after the event. Attendance persists as minimal counts, because it is the advancement record. Keep the count, not the story.
- **One source of truth for `minor`.** The resolved tier decides last-name hiding; the stored `Person.minor` column is retired or kept in sync, never a second authority.
- **Tokens can be rotated and revoked.** `accessToken` is a standing capability for a minor's row; a rotate/revoke path exists so a forwarded or leaked link does not expose the row and roster indefinitely.
- **`externalIdHash` is a dedup key, not privacy.** A Scout ID is low-entropy and brute-forceable, so salt it and treat it as an idempotency key. Do not market it as de-identification.

**What ships:** a `/privacy` page in this voice, and a short "how your info is handled" note on the RSVP page itself, so a parent sees it at the moment it matters.

## Import mapping (from the real sheet)

The BCSF roster sheet is the source of truth for the standing directory:

- **Scout ID** -> `Person.externalIdHash`, a **salted** hash used only as a dedup/idempotency key, not as de-identification.
- **First/Last Name** -> `name`, with last-initial privacy applied for minors on display.
- **Patrol** (Eagle, Fox, Hawk, King Cobra, Raccoon) -> `subGroup`; group is "Scouts."
- **Position** (SPL/ASPL/PL/APL and others) -> `position`; the leader mark derives from the **explicit allowlist**, not a substring match.
- **Contact** -> for an under-13, the stored contact is the **parent's**, held in a field distinct from any child contact, so "contact routes to a parent" holds by construction. Never import a child's own contact into the routing field.
- **Inactive section** (Patrol "ZZZ Inactive") -> `active = false`.
- **Attendance tab** date columns -> historical attendance rows per (person, meeting occurrence), so the active report has real history on day one.
- Health-form dates (Form AB/C) are out of scope. Notes map to a private note or an RSVP reason.

## Testing and rollout

- **Strict TDD, red-green-refactor.** Domain logic (capability resolution, attendance rollups, active/attention buckets, patrol standings) lives in pure functions in `lib/domain/` with unit tests. DB paths get `*.db.test.ts` against the test database.
- **Behind a feature flag** (`FLAG_RSVP`, same pattern as `FLAG_TASK_BOARD`), dark by default, previewable on prod before flipping.
- **Riskiest-assumption test (Lean):** for one real event, the Scoutmaster pastes a link into the weekly email, a scout and a PL record RSVP, attendance is marked at the next meeting, and the attention report names who to reach out to. That end-to-end thread is the acceptance test.
- **"Done" for the branch:** both suites green, `npx tsc --noEmit` clean, `npm run lint` clean, and the end-to-end thread demonstrated.

## For the implementation plan

This spec folds in the adversarial review in `docs/handoff-rsvp-review.md` (2026-07-14). The plan inherits these.

**Schema deltas (all additive):**

- `Person.birthYear` (nullable int), `Person.tierOverride` (nullable, `child` | `youth` | `adult`).
- `Person` parent-contact field distinct from any child contact.
- `Event.rsvpToken` (nullable, unique), `Event.isMeeting` (boolean).
- `Organization.termStart` (nullable date).
- `Rsvp.attended` (present/absent), `Rsvp.status` relaxed to nullable.
- Drop or repurpose `Lead` for this feature; leadership is position-derived.
- `accessToken` gains a rotate/revoke path.

**Front-load these two (they gate the earliest tasks):**

1. **The under-13 write invariant** goes into the permission model before the RSVP-setting endpoint. Test that a child's RSVP is unsettable on the shared picker and peer views, settable only via the parent `/me/` link.
2. **The token architecture:** `Event.rsvpToken` for the shared link, `Person.accessToken` for `/me/` and the PL link, `Lead` dropped. Early tasks bake this in; later tasks depend on it.

**Confirm and lock in the plan:**

- The attention-report cutoffs above (50% / 30% / last-3 drift / 3-consecutive / no-data). Unit-test each boundary and the divide-by-zero.
- `tierFor` as a pure, unit-tested function with the ordered-signal seam for later Google login.
- Youth-leader reach and the PL edit view's name display: full names to disambiguate two "Jack S.", or the last-initial rule. Decide before building the PL surface.
- Verify or soften the named BAND claims on `/privacy`.

## Relationship to prior specs

This reworks and grounds the roster/RSVP and delegate-per-group direction with a privacy-first, capability-link frame. It coexists with the Groups epic (`2026-07-11-groups-epic-design.md`): this MVP reads patrol from `subGroup` and group from the free-text field as they stand today; the Groups epic's normalization can re-point those reads later without changing this feature's behavior.
