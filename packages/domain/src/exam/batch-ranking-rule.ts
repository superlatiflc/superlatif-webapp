// Batch ranking-attempt-rule vocabulary (EXM-002).
//
// dok 18 §21 audit resolution RC2 (binding): "Batch adalah satu-satunya
// pemilik `ranking_attempt_rule`; policy product/blueprint tidak
// menimpanya" (batch is the SOLE owner of this field; product/blueprint
// policy never overrides it). dok 18 §15 names the three values in prose
// ("best/first/latest attempt"). Stored as free text on `exam_batches`
// (matching `products.type`'s own "free text, not a Postgres enum" choice,
// COM-001) rather than a pg enum, since this is a policy CHOICE a later
// ATM/SCR-series task will read but never needs to filter/index by - this
// module is only the write-time guard.
//
// Actually computing "which attempt counts" per this rule requires attempt
// data (ATM-series, out of EXM-002's scope per the founder's "Jangan
// bangun attempt engine" instruction) - this module only validates and
// carries the CONFIGURATION value, never applies it.

export const BATCH_RANKING_ATTEMPT_RULES = ["first", "best", "latest"] as const;

export type BatchRankingAttemptRule = (typeof BATCH_RANKING_ATTEMPT_RULES)[number];

export class InvalidBatchRankingAttemptRuleError extends Error {
  constructor(readonly value: string) {
    super(
      `"${value}" is not a valid ranking_attempt_rule - expected one of ${BATCH_RANKING_ATTEMPT_RULES.join(", ")}`,
    );
    this.name = "InvalidBatchRankingAttemptRuleError";
  }
}

export function assertValidBatchRankingAttemptRule(value: string): asserts value is BatchRankingAttemptRule {
  if (!(BATCH_RANKING_ATTEMPT_RULES as readonly string[]).includes(value)) {
    throw new InvalidBatchRankingAttemptRuleError(value);
  }
}
