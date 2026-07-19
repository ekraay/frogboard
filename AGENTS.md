<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Test-driven development is mandatory

Every behavior change follows red → green → refactor: write the failing test
first, run it and watch it fail for the right reason, write the minimal code to
pass, watch it pass, then refactor. No production code without a failing test
first. Exceptions (config files, generated code, pure schema migrations) are
verified by running the full suites instead.

- Unit tests (jsdom): `npm test`
- DB integration tests (`*.db.test.ts`, node env, test database): `npm run test:db`
- Before claiming done: both suites green plus `npx tsc --noEmit` and `npm run lint`.


#Design system — "Matsuri at Dusk" (always use this)
Source of truth for tokens is app/globals.css @theme. Never invent colors or hardcode hexes; use the Tailwind classes those tokens generate (bg-pond, text-ink-soft, border-lily-line, bg-reed, text-lantern-deep, …). Use oklch shifts only if a token genuinely doesn't exist.

Palette: washi #faf3e3, washi-deep #f1e4c8, ink #15302b, ink-soft #46685f, pond #0c7a70, pond-deep #0a4a45, lily #ebfaf2, lily-line #b6e3cf, reed #0e5e36, reed-deep #083d22, lantern #e25325, lantern-deep #b23a16, amber #f0a429.

Type: display = Shippori Mincho B1 (--font-display), UI = Zen Maru Gothic (--font-sans).

#Rules:

Keep it LIGHT. No dark theme (used on phones in afternoon sun).
Primary action = reed-green fill, wording "Hop to it." Festival/marquee CTA = amber. Secondary = white with lily-line border.

Metaphor: frog = the volunteer, lily pad = an open spot/task, pond = a group, garden = the org (BCSF), gathering = an event. Tagline: "Hop to it."

A task is a lily pad, never a "frog."

No dead affordances: if a role can't take an action, omit the control; don't grey it out.

Motion sits behind prefers-reduced-motion; focus ring is 2px pond, 2px offset.

Background is the four-layer washi/pond/lantern paint in globals.css; paper grain stays behind opaque cards, never over text.

Reusable UI (garland, pond card, lily-pad task card, pill, CTA) lives in components/; compose pages from those, don't re-style per page.

Navigation & permissions (don't close doors)
Org is the only true root; a group is a removable lens, never an event's sole parent (Event–Group is many-to-many). Access is three independent switches: board visibility, edit rights, roster visibility. Rosters are private to the group by default (no one outside a group sees its roster) except the org organizer.

#Writing style
No em dashes in any prose or UI copy (use commas, colons, or periods). Strunk and white style.
