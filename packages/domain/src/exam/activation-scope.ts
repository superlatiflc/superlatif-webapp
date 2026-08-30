// Activation scope hard gate (EXM-001).
//
// dok 17 §2's own canonical vocabulary: "activationScope=production wajib
// approval status active dan seluruh activation gate lulus" (dok 17 §3:
// regulatory, academic, technical, content, UX, operations evidence). None
// of that evidence exists in this task - OD-04 (official current-year SKD
// rules and academic sign-off) is still open. This function is the
// structural refusal: nothing in this task's own service layer can move an
// activationScope value to "production" at all, regardless of who is
// asking or what their role permits - it is not an authorization check
// (authorize() already ran), it is a hard, code-level ceiling matching
// CLAUDE.md's own hard-gates list ("Do not activate production commerce,
// ranked SKD, or legacy migration merely because code exists").

export type ActivationScope = "draft_only" | "staging" | "production";

export class ProductionActivationNotPermittedError extends Error {
  constructor() {
    super(
      'activationScope cannot be set to "production" by this task\'s code path - OD-04 evidence and every dok 17 §3 activation gate are required first, and none of that evidence exists yet',
    );
    this.name = "ProductionActivationNotPermittedError";
  }
}

export function assertActivationScopeNotProduction(scope: ActivationScope): void {
  if (scope === "production") {
    throw new ProductionActivationNotPermittedError();
  }
}
