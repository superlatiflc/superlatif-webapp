// Claim purchases made before the student's first sign-in (M2, ADR-074). Server-only.
//
// Runs on the student landing page (/home) with the SESSION user's own ID, so
// a student can only ever claim orders that name a WordPress account they
// signed in with (packages/db commerce/purchase-claim-service.ts). Idempotent
// and a single cheap query when there is nothing to claim.
//
// Never allowed to break the page: a failure is logged and the page renders
// with whatever access already exists; the next visit tries again. Obeys the
// same switches as the webhook - a production write freeze or
// FEATURE_COMMERCE_SYNC off means no claim.

import { commerce } from "@superlatif/db";
import { getDb, getEffectiveAccessCache } from "../db.ts";
import { createBridgeLogger } from "../bridge/log.ts";
import { commerceWriteBlockReason } from "../write-guard.ts";

export interface ClaimOnLandingDeps {
  readonly blocked: () => boolean;
  readonly claim: (userId: string) => Promise<commerce.ClaimPurchasesOutcome>;
  readonly logger: ReturnType<typeof createBridgeLogger>;
}

export function defaultClaimDeps(): ClaimOnLandingDeps {
  return {
    blocked: () => commerceWriteBlockReason() !== null,
    claim: (userId) => commerce.claimPurchasesForUser(getDb(), getEffectiveAccessCache(), userId, new Date()),
    logger: createBridgeLogger(),
  };
}

export async function claimPurchasesOnLanding(
  userId: string,
  deps: ClaimOnLandingDeps = defaultClaimDeps(),
): Promise<void> {
  if (deps.blocked()) return;
  try {
    const outcome = await deps.claim(userId);
    if (outcome.results.length > 0) {
      deps.logger.info("commerce_claim.completed", {
        bound: outcome.results.filter((r) => r.kind === "bound").length,
        leftForReview: outcome.results.filter((r) => r.kind === "buyer_mismatch").length,
        grantsIssued: outcome.grantsIssued.length,
      });
    }
  } catch (cause) {
    deps.logger.error("commerce_claim.failed", { error: cause instanceof Error ? cause.name : "unknown" });
  }
}
