import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    globals: true,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // DB integration tests (*.db.test.ts) run separately via vitest.db.config.ts
    // against the test database; excluded here so `npm test` stays pure + fast.
    exclude: ["e2e/**", "node_modules/**", ".next/**", "**/*.db.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
