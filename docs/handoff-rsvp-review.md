# Handoff: RSVP/Attendance spec revisions

You've done the spec, the plan, and started executing (task 1 nearly done). **Don't
restart.** These are amendments to fold into your plan, ordered by how early they
must land. One age-tier decision is already resolved and ready to build.
Everything traces to an adversarial review of
`docs/superpowers/specs/2026-07-13-youth-led-rsvp-attendance-design.md` on branch
`rsvp-attendance-spec`.

---

## Grounding facts (verified against the repo, so you don't rediscover them)

- **The "shipped schema" is migrated but unused.** `Person`, `Rsvp`, `Lead`
  tables exist (migration `20260709040855_add_roster_rsvp`), but no code in
  `app/` or `lib/` references them. This is greenfield behavior on empty tables.
- **`Rsvp` uniqueness already exists** as *partial* indexes in raw SQL, not in
  `schema.prisma`: `Rsvp_personId_eventId_wholeEvent_key` on
  `(personId, eventId) WHERE day IS NULL`, plus a per-day one. See the
  "ON CONFLICT" item below.
- **No email, cron, or reminder infrastructure exists.** "The weekly email"
  means the Scoutmaster's manual Gmail.
- **Flag pattern:** `flagEnabled("rsvp")` in code, env var `FLAG_RSVP`, matching
  `task_board`.

---

## Resolved decision: age tiers (settled, build this)

Replace the spec's "Age tiers, roster-borne" rule with a leader-toggle model.
**No birthday is stored.** A leader flips a scout to self-management the week they
turn 13.

> Add nullable `birthYear` to `Person` for the default tier, and a nullable
> **`tierOverride`** a leader sets on the roster row. Tier is a pure function; the
> override wins.
>
> ```
> tierFor(person, today):
>   if person.tierOverride: return person.tierOverride     // leader-set: 'child' | 'youth' | 'adult'
>   if person.birthYear == null: return 'child'            // conservative default
>   const age = today.year - person.birthYear             // coarse
>   if age <= 13: return 'child'                           // parent-mediated (COPPA line)
>   if age <= 18: return 'youth'                           // own link, last-initial
>   return 'adult'
> ```
>
> - **child (<13):** parent-mediated only; leader sets `tierOverride = 'youth'`
>   when the scout turns 13.
> - **youth (13-17):** own `/me/` link, last-initial.
> - **adult (18+):** full access.
>
> `minor` (under-18, last-name hiding) derives from the resolved tier (child or
> youth). The 13 line gates **self-management only**; last-name hiding continues
> to 18 regardless.

Keep `tierFor` a pure, unit-tested function so storage stays swappable. This
**supersedes** the review's earlier "conservative rounding" item; do not do both.

**Later: Google login and age tiers (design the seam now, build it later).**

> A future slice adds Google Sign-In. It authenticates people; it does not
> outsource COPPA.
> - Adults and youth 13-17: Google login can replace the token link. A valid
>   consumer Google account is a positive "13+" signal (Google age-gates at 13).
> - Under-13: unchanged. Consumer Google won't create their accounts;
>   parent-mediated stays.
> - **Seam:** resolve `tierFor` from an ordered signal list, first hit wins:
>   `tierOverride` -> verified-13+ (Google, later) -> `birthYear` default ->
>   `child`. Adding Google is one more signal, not a caller change.
> - Absence of a Google account is not a signal (an adult may never sign in).
>   Only a *present, valid* account counts as 13+.
> - Google is auth, not consent, and changes nothing about stored PII or the
>   `/privacy` promise.

---

## Must change (COPPA-critical, blocking)

**1. Under-13 cannot self-RSVP on the shared link.** The spec makes
`/rsvp/<token>` primary: a picker where anyone taps any name, honor-system. That
lets a 12-year-old set their own status online, which is collection *from a child*
under COPPA, and you have actual knowledge of who is under 13. Fix: on the shared
picker and every peer view, **under-13 rows are display-only**. An under-13's RSVP
is set **only** through the parent's `/me/<token>` link. Under-13 attendance stays
adult-observed. This is an enforced invariant on the write path, not a UI nicety.
**Bake it into the permission model before the RSVP-setting endpoint exists.**

**2. Make the privacy promise truthful.** You hold a roster of minors: name,
patrol, `birthYear`, multi-term attendance, parent contact. Reword "there's
nothing to consent to, because there's nothing to give up" to something honest,
e.g. *"We don't collect information from your child. Adults keep a minimal roster
so scouts earn advancement; your child never makes an account, enters data, or is
tracked."* Fix the comparison-table row that claims only "name + last initial" to
state what the roster actually holds.

---

## Decide before you build the write path and links (architecture/schema)

**3. Reconcile three token schemes.** `Person.accessToken` (`/me/`), the primary
`/rsvp/<token>` which has **no backing column** (`Event` carries no token), and
the shipped per-event `Lead` table (unique `token`) now orphaned by
position-derived leadership. `Lead.eventId` is `NOT NULL`, so a `Lead` row cannot
be the standing PL link the spec wants. Pick one PL mechanism, add the
`Event`-level RSVP token, and drop or repurpose `Lead`. **Most likely source of
rework, settle it now.**

**4. Write RSVP rows with raw `INSERT ... ON CONFLICT`, not
`prisma.rsvp.upsert`.** The uniqueness is a *partial* index Prisma v6 cannot
model, so the typed upsert won't compile against it. Target
`(personId, eventId) WHERE day IS NULL`. Relaxing `status` to nullable and adding
walk-in/no-show rows still hit that conflict key.

**5. Add a term-start field** (e.g. `Organization.termStart`). The attention
report is term-scoped and nothing stores the date.

**6. Distribution reality.** No email/cron infra exists. Only the single shared
`/rsvp/` link is deliverable in the MVP; per-person `/me/` links need the deferred
mail-merge. Treat the shared link as the real MVP distribution and set
expectations accordingly.

---

## Absorb as you reach them (localized, low rework)

- **Reasons leader-only or preset chips**, never free-text minor reasons shown to
  peers.
- **Pin the attention-report math:** exact cutoffs for regular /
  needs-encouragement / reach-out; the recent-window length and "trending down"
  threshold; a zero-occurrence "no data" state (never "reach out");
  term-boundary inclusivity. Test each boundary; it drives real calls to families.
- **Truthful retention wording:** reasons purge on a short clock, attendance
  persists as minimal counts. (The comparison table currently oversells "short,
  event-scoped retention.")
- **`position` is free text;** map an explicit leader allowlist (SPL/ASPL/PL/APL
  and any others), default everything else to non-leader, and test it. It grants
  write access to peers' rows.
- **Capture parent contact explicitly** for under-13s; the schema doesn't
  distinguish child vs parent contact, and "contact routes to a parent" depends
  on it.
- **One source of truth for `minor`:** let the resolved tier win; retire or sync
  the stored `Person.minor` column.
- **Rotate/revoke `accessToken`;** a permanent minor token otherwise exposes the
  row and roster indefinitely if forwarded.
- **Don't market `externalIdHash` as privacy;** a Scout ID is low-entropy and
  brute-forceable. Salt it, treat it as a dedup key.
- **Confirm youth-leader reach and PL name display** (full names to disambiguate,
  or last-initial).
- **Verify or soften the named BAND claims** on `/privacy` (credit-card consent,
  chat-history download, five-year retention, NAVER servers).

---

## Verdict: proceed, front-load two things

Keep going; restarting is an overreaction. Most items are localized or belong to
slices not yet built. Two things gate task 1 and its neighbors:

- **The under-13 enforcement invariant (Must-change 1)** goes into the permission
  model before the RSVP-setting endpoint.
- **The token/`Lead` architecture (Decide 3)** is what early tasks bake in and
  later tasks depend on.

If task 1 is schema/import plumbing, finish it, and while you're in the migration
add `tierOverride`, `Organization.termStart`, the `Event` RSVP token, and settle
the `Lead` question. If task 1 already committed to the spec's token model or a
Prisma upsert for RSVP, expect a small refactor from items 3 and 4.
