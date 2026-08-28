import { defineConfig } from "vitest/config";

// Three projects so the CLAUDE.md script contract maps onto real suites:
// `test:unit` runs pure package-level behaviour, `test:integration` runs
// persistence-backed behaviour (IDN-001: pglite-backed real Postgres DDL/
// constraints, no Docker needed - see packages/db/src/test-client.ts),
// `test:contract` runs the checks that 27_QA_TESTING_AND_UAT_PLAN.md §3
// marks mandatory when a contract changes.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          root: import.meta.dirname,
          include: ["packages/*/src/**/*.test.ts"],
          exclude: ["packages/*/src/**/*.integration.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          root: import.meta.dirname,
          include: ["packages/*/src/**/*.integration.test.ts"],
          environment: "node",
          // pglite boots a WASM Postgres + runs migrations in beforeEach for
          // every test (fresh, isolated database per test); this is
          // occasionally slower than vitest's 10s hookTimeout default under
          // load, which is a real defect this exact run caught - hookTimeout
          // is a separate setting from testTimeout and both need raising.
          testTimeout: 20_000,
          hookTimeout: 20_000,
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
