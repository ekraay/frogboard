# Signup Export: One-Click CSV Download

**Design doc for review.** A small organizer feature: download every signup for
an event as a CSV, one click, from the organizer event header. Ships with a
companion rule so the download is useful: adult signups must carry an email or
a phone.

## Goal

The organizer needs the signup list off the site and into a spreadsheet: for
check-in sheets, reminder calls, and day-of coordination. Success is one click
on `/organize/[eventId]` producing a file that opens clean in Excel and Google
Sheets, with a reachable contact on every adult row going forward.

## Scope decisions

- **CSV, not xlsx or Google Drive.** One click, zero dependencies, opens in
  Excel and imports to Sheets. Drive would demand OAuth and consent flows;
  xlsx a library. Neither buys enough.
- **The polish lives on the button, not in the file.** An on-brand button in
  the organizer chrome; the file stays plain data.
- **Adults must give one contact method.** Requiring it at claim time is the
  only way the export reliably carries contacts. Minors stay exempt, keeping
  the existing stance of collecting minimal data from under-18s.

## Unit 1: the export route

`GET /organize/[eventId]/signups.csv`, a route handler beside the organizer
pages.

- **Auth**: the same gate as `/organize/[eventId]/history`: `isValidSession`
  on `SESSION_COOKIE` (`lib/security/session.ts`); unauthenticated requests
  redirect to `/organize`. An unknown event id 404s.
- **Data**: a new repository function `getEventSignups(eventId)` in
  `lib/repository/organize.ts` returns the event (name, slug) and one record
  per signup with its task fields (title, kind, date, startAt, endAt,
  category, position) and signup fields (name, email, phone, group, minor,
  createdAt).
- **Response**: `text/csv; charset=utf-8`, a UTF-8 BOM first so Excel renders
  non-ASCII names correctly, and
  `Content-Disposition: attachment; filename="<slug-or-id>-signups.csv"`.
- AGENTS.md warns this Next.js differs from training data: the implementation
  task verifies route-handler conventions against `node_modules/next/dist/docs/`
  before writing the route.

## Unit 2: the CSV shape (pure domain)

`lib/domain/signupCsv.ts`, two pure functions with no I/O:

- `signupCsvRows(event, records)`: one row per signup, ordered by task date,
  then start time, then board position, then signup `createdAt`. Columns:
  `Task, Kind, Date, Time, Category, Name, Email, Phone, Group, Minor,
  Signed up`.
  - `Kind` uses display words: Shift for `shift`, Task for `errand`.
  - `Date` is `YYYY-MM-DD`; `Time` is the task's start-end range, blank for
    all-day or dateless tasks. Both reuse the existing helpers in
    `lib/domain/time.ts` and `lib/domain/when.ts`, in `EVENT_TZ`.
  - `Minor` is `Yes` or blank. Full names appear as stored: the organizer
    already sees them on the grid; this surface sits behind the session gate.
  - `Signed up` is the signup's date and time in local time, never UTC:
    `EVENT_TZ` (`America/Los_Angeles`, `lib/domain/time.ts`), the timezone
    every other surface formats in. A server-built file cannot read the
    downloader's device timezone, so the org's local time is the rule for
    every time in the file.
  - Tasks with zero signups produce no rows: this is a signup list, not a
    coverage report (the grid shows gaps).
- `toCsv(rows)`: serializes with proper quoting (commas, quotes, newlines)
  and a formula-injection guard: any volunteer-typed cell starting with `=`,
  `+`, `-`, or `@` gets a leading `'` so a spreadsheet treats it as text.
  These are stranger-supplied values opened in Excel; the guard is not
  optional.

## Unit 3: the button

In the organizer event header next to Share: `⬇️ Download signups`, a plain
`<a href>` to the route. Secondary style per the design system (white fill,
lily-line border). No JavaScript; the browser handles the download. Organizer
surface only, so no dead affordance appears for other roles.

## Unit 4: the adult contact rule

- `claimSlot` (`app/actions/signups.ts`) rejects an adult signup carrying
  neither email nor phone with: "Add an email or phone so we can reach you."
  Whitespace-only values count as empty. The minor checkbox exempts the row.
- `ClaimFields` copy changes: the two "(optional)" labels give way to helper
  text saying adults give at least one way to be reached. The existing
  helper line ("We only use your email or phone to remind you about your
  shift.") stays.
- Existing contact-less rows are untouched; they export with blank cells.

## Testing (strict TDD, red-green-refactor)

1. Unit tests first for `signupCsv`: column order, row ordering, quoting,
   formula guard, Minor display, blank contact and time cells, BOM excluded
   (the route adds it), and local-time rendering (a UTC instant lands as its
   Pacific wall-clock time).
2. Unit/action tests for the claim rule: adult with email passes, adult with
   phone passes, adult with neither fails with the exact message, minor with
   neither passes, whitespace-only contact fails.
3. DB tests: `getEventSignups` returns the joined shape and ordering inputs;
   the route 404s on an unknown event, redirects without a session, and
   responds with the right headers and body with one.
4. Component test: the organizer header renders the download link with the
   route href.
5. Full gate: `npm test && npm run test:db && npx tsc --noEmit && npm run lint`.

## Out of scope

- xlsx styling, logos inside the file, or Google Drive/Sheets integration.
- Per-task or filtered exports; the file is the whole event.
- Backfilling contact info onto existing signups.
- RSVP/roster exports (the directory side); this is the signup (task) side.
