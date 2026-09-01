// Gate for the deterministic development sign-in seam.
//
// Kept OUT of `app/signin/actions.ts` deliberately: a "use server" module
// may export only async Server Actions, so a synchronous predicate or an
// error class living there breaks the whole module at build time (Next.js
// reports "The module has no exports at all").
//
// OD-02 (WordPress one-time bridge and safe account linking) is still an
// open hard gate in CLAUDE.md, so the deterministic sign-in must never be
// reachable in a production deployment. `APP_ENV` is reused rather than a
// new flag added - introducing one would mean editing packages/contracts'
// ENV_SPEC plus .env.example, a contract change this slice does not need.

export class DevLoginDisabledError extends Error {
  constructor() {
    super(
      "Deterministic dev sign-in is disabled when APP_ENV=production (the OD-02 bridge is the production path)",
    );
    this.name = "DevLoginDisabledError";
  }
}

export function isDevLoginEnabled(): boolean {
  return process.env["APP_ENV"] !== "production";
}
