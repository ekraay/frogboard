# Lead Open Link

Date: 2026-07-18. Branch: `lead-open-link`.

## Problem

The only view of a group's RSVP list for an event is the lead page,
`/lead/[token]`. From the organize event workspace, the LeadsPanel offers
just a clipboard "Copy link" button. The organizer cannot click through to
the list.

## Design

Add an "Open" link to each lead row in
`components/organize/LeadsPanel.tsx`, linking to `/lead/<token>`.

- `next/link` with a relative href. No `window.location.origin`. A plain
  `<a>` would do a full-document navigation, which can abort the grid's
  in-flight blur save on the same page (`OrganizeGrid.persistRow`);
  client-side navigation lets that save complete.
- `aria-label={`Open ${group} RSVP list`}`, following the per-item label
  pattern in `EventList.tsx` ("Archive ${name}"). Several rows otherwise
  all announce as "Open".
- Sits beside "Copy link". Copy behavior is unchanged.
- Reuses the secondary text-link style already on "Regenerate":
  `text-pond` with underline.
- Opens in the same tab. The organizer returns with back.
- Rows exist only for assigned leads, so no dead affordance appears for
  groups without one.
- Accepted race: clicking Open between Regenerate and the refresh
  navigates with the dead token to the friendly invalid-link page. Rare,
  self-correcting with back and retry. The anchor stays visible during
  pending transitions; hiding it would shift layout on every action.

No server, schema, or route changes.

## Testing

TDD. One failing jsdom unit test first: a lead row renders a link with
accessible name "Open <group> RSVP list" and `href="/lead/<token>"`.
Then the minimal link to pass.
Done gates: `npm test`, `npm run test:db`, `npx tsc --noEmit`,
`npm run lint`.

## Out of scope

- Per-group RSVP links on the public board pages. Lead tokens grant edit
  rights, so publishing them there leaks write access.
- Anything the youth-led RSVP spec reworks later
  (`2026-07-13-youth-led-rsvp-attendance-design.md`, committed on the
  unmerged branch `rsvp-attendance-spec`). That epic replaces the token
  model; this one link dies gracefully with it.
