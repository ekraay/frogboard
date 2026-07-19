import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

// eslint-config-next already registers the jsx-a11y plugin; spreading
// flatConfigs.recommended again would trigger "Cannot redefine plugin".
// Instead, add only the rules — the plugin instance stays from Next's config.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { plugins: _a11yPlugins, ...jsxA11yRecommended } = jsxA11y.flatConfigs.recommended;

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  jsxA11yRecommended,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Sibling git worktrees live under .claude/worktrees/; don't lint their
    // source or generated .next output (the nested path escapes ".next/**").
    ".claude/**",
  ]),
]);

export default eslintConfig;
