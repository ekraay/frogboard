# Reminder Loop — decisions banked (sub-project 2)

Running decision log for the reminder loop, the second sub-project of Delegated
Organizing. Not yet a formal spec. The UX prototype lives at
`docs/design/reminder-loop.html`. Depends on sub-project 1
(`docs/superpowers/specs/2026-06-22-delegate-per-group-design.md`): reminders
fire within a lead's group scope, and a decline notifies that group's delegate.

## Decisions

- **Channel: text-first, email fallback.** Youth read texts, not email. Text
  anyone with an opted-in phone; email the rest. Texting needs Twilio, US A2P
  10DLC registration, and explicit SMS opt-in consent (TCPA).

- **Anti-spam by consolidation.** One message per person per send, a digest of
  all their shifts, never one per shift. Cadence is per event, not per shift.
  Confirming silences later nudges. Quiet hours, plus a one-message-per-person-
  per-day cap.

- **v1 scope: one reminder.** A single well-timed reminder plus the one-tap
  "decline reopens the slot and notifies the group's lead" loop. The full
  confirm/prepare/nudge ladder is later.

- **Tiered minor routing.** Scouts 13+ can get their own reminder; younger route
  to a parent. The last name stays private either way. Routing voice (direct vs
  parent) follows whose inbox the contact is.

- **Tone: brief the intent.** Mission-command voice: state `definitionOfDone`
  and name the lead, not a checklist. Reinforces the Kniberg north star.

- **Name-only signups are never reminded.** A signup with no contact channel
  (no opted-in phone, no email) is counted for coverage but never messaged. The
  explicit, tested rule is **no contact channel -> no reminder.** This supports a
  patrol leader pre-filling roster names ("Scout A", "Scout B") and rallying them
  in person, the Patrol Method way.
  - Future, YAGNI now: an explicit "remind: off" toggle for a signup that *has* a
    contact on file but should still be silenced (e.g. a scout the lead handles
    directly).

## Out of scope until specced

Email/SMS provider wiring, the scheduler (Vercel Cron), unsubscribe mechanics,
deliverability, the confirm/decline landing pages' server actions, frogs
(deadline) vs shifts handling.
