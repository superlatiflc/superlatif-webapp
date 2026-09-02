// Root route destination - pure decision, no Next.js APIs.
//
// Kept separate from apps/app/page.tsx (which calls next/navigation's
// redirect()) so the actual DECISION - "where does this session go" - is
// unit-testable without a Next.js request context. `redirect()` throws a
// framework-internal control-flow signal that only works inside a real
// request; this function has none of that, it is a plain string mapping.
//
// `/home` is the pre-existing canonical dashboard route (dok 07 §4 -
// buildHomeViewModel, ProgramCard/NextActionCard) - this does not invent a
// new destination, it only decides WHICH of the two already-existing
// entry points (`/home` vs `/signin`) an unauthenticated-vs-authenticated
// visitor to `/` should land on.

export function resolveRootDestination(userId: string | null): "/home" | "/signin" {
  return userId ? "/home" : "/signin";
}
