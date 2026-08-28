// ESLint flat config (GOV-002).
//
// Scope is deliberately narrow at P0: correctness rules for TypeScript, plus
// eslint-config-prettier so formatting is owned by Prettier alone and never
// argued about in review. React, accessibility, and Next.js rule sets arrive
// with the first real UI surface in P2, where they have something to check.

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "contracts/**",
      "scripts/validate-starter.mjs",
      "docs/**",
      "planning/**",
      "test/fixtures/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Everything here runs on Node; the browser bundle is the exception, not
    // the rule, and gets its globals with the first real UI surface in P2.
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["**/*.{ts,tsx,mts}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // Governance scripts are command-line tools; printing a report is the point.
    files: ["scripts/**/*.mjs", "**/*.config.mjs", "**/*.config.mts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["**/*.test.ts", "test/**/*.ts"],
    rules: { "no-console": "off" },
  },
  prettier,
);
