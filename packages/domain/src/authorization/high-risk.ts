// High-risk workflow vocabulary (IDN-004).
//
// dok 24 §7: these action types "Require reason + preview + audit; peer
// approval when marked." `authorize()` (authorize.ts) treats this list as a
// STRUCTURAL gate, not a logging convention: a high-risk action without a
// non-empty `reason`, `correlationId`, and `actorId` cannot be authorized at
// all, regardless of role/permission - "Privileged mutations include actor,
// reason, and correlation ID" (IDN-004 acceptance) is enforced by refusing
// the decision itself, so there is no code path that lets an admin action
// bypass the audit trail by simply omitting those fields.

export const HIGH_RISK_ACTION_TYPES = [
  "identity_merge_override",
  "manual_grant_revoke_extension",
  "role_change",
  "blueprint_scoring_publish",
  "active_batch_time_change",
  "result_correction",
  "export_pii_or_secrets",
  "bridge_key_rotation",
] as const;

export type HighRiskActionType = (typeof HIGH_RISK_ACTION_TYPES)[number];

export function isHighRiskActionType(value: string): value is HighRiskActionType {
  return (HIGH_RISK_ACTION_TYPES as readonly string[]).includes(value);
}
