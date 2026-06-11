# Frog Board 🐸

Mobile-first volunteer self-organization board. Volunteers grab a "frog" (a task
or shift) by adding their name — no account needed. Phase 1: public board with
claim/release.

## Develop

1. `npm install`
2. Copy `.env.example` to `.env` and `.env.test`; paste your Neon connection
   strings (the **test** DB name must contain "test", or the reset guard refuses
   to run).
3. `npm run db:migrate` then `npm run db:seed`
4. `npm run dev` → http://localhost:3000

## Test

- Unit (no DB, jsdom): `npm test`
- Integration (real test DB): `npm run test:db`

Integration tests are named `*.db.test.ts`, run in a Node environment via
`vitest.db.config.ts`, and are excluded from the default unit run.

## CI/CD (Jez Humble style)

- **GitHub Actions** runs lint + unit + integration + build on every push and PR,
  against a throwaway `postgres:16` container, so `main` stays releasable.
- **Vercel** auto-deploys `main`. Migrations run in the build via
  `prisma migrate deploy` — never migrate prod by hand.

## Architecture

Pure domain (`lib/domain`, no I/O) → repository (`lib/repository`, the only DB
write seam, transactional with `SELECT … FOR UPDATE` to prevent overfill) →
server actions (`app/actions`) → components (`components`). Ownership of a signup
is a device-local capability token in `localStorage` (anti-graffiti, not a
credential).
