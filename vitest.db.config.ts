import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration tests that hit a real Postgres test database. Run via `npm run
// test:db`, which loads .env.test (a database whose name contains "test", so
// the resetDb() guard permits wiping it). Node environment — no DOM, no React.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.db.test.ts"],
    // `.claude/**` keeps sibling git worktrees under .claude/worktrees/ from
    // being cross-collected into this project's run.
    exclude: ["node_modules/**", ".next/**", ".claude/**"],
    // One DB, no cross-test isolation between files sharing tables: run serially.
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
