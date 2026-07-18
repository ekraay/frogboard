# Lead Open Link

Date: 2026-07-18. Branch: `lead-open-link`.

## Problem

The only view of a group's RSVP list for an event is the lead page,
`/lead/[token]`. From the organize event workspace, the LeadsPanel offers
just a clipboard "Copy link" button. The organizer cannot click through to
the list.

## Design

Add an "Open" anchor to each lead row in
`components/organize/LeadsPanel.tsx`, linking to `/lead/<token>`.

- Plain relative `<a href>`. No `window.location.origin`.
- Sits beside "Copy link". Copy behavior is unchanged.
- Reuses the secondary text-link style already on "Regenerate":
  `text-pond` with underline.
- Opens in the same tab. The organizer returns with back.
- Rows exist only for assigned leads, so no dead affordance appears for
  groups without one.

No server, schema, or route changes.

## Testing

TDD. One failing jsdom unit test first: a lead row renders a link named
"Open" with `href="/lead/<token>"`. Then the minimal anchor to pass.
Done gates: `npm test`, `npm run test:db`, `npx tsc --noEmit`,
`npm run lint`.

## Out of scope

- Per-group RSVP links on the public board pages. Lead tokens grant edit
  rights, so publishing them there leaks write access.
- Anything the youth-led RSVP spec
  (`2026-07-13-youth-led-rsvp-attendance-design.md`) reworks later. That
  epic replaces the token model; this one anchor dies gracefully with it.
