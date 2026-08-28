import { defineConfig } from "vitest/config";

// Two projects so the CLAUDE.md script contract maps onto real suites:
// `test:unit` runs package-level behaviour, `test:contract` runs the checks
// that 27_QA_TESTING_AND_UAT_PLAN.md §3 marks mandatory when a contract changes.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          root: import.meta.dirname,
          include: ["packages/*/src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "contract",
          root: import.meta.dirname,
          include: ["test/contract/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
