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
