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
          testTimeout: 30_000,
          hookTimeout: 30_000,
          // ENT-001 added a second and third integration test file alongside
          // IDN-001's; running them in parallel worker processes made every
          // file boot its own PGlite/WASM instance simultaneously, causing
          // CPU contention severe enough to blow past hookTimeout in
          // beforeEach (observed: 3/3 files affected in one run). Integration
          // suites are DB-boot-bound, not CPU-parallelism-bound, so running
          // the files sequentially in one worker is strictly faster and
          // reliable rather than trying to outrun contention with a bigger
          // timeout.
          fileParallelism: false,
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
