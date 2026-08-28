// Role assignment status derivation (IDN-004).
//
// Same "compute, don't store" discipline as ENT-001's deriveGrantStatus: a
// `user_roles` row is immutable once created (packages/db/src/schema/
// authorization.ts), and whether it is currently active is derived from the
// most recent `role_assignment_events` row, never stored as a column.

export type RoleAssignmentEventType = "revoked" | "reinstated";

export interface RoleAssignmentEvent {
  readonly eventType: RoleAssignmentEventType;
  readonly occurredAt: Date;
}

/** Active unless the most recently occurred event is "revoked". No events at all means active (the grant itself, never revoked). */
export function isRoleAssignmentActive(events: readonly RoleAssignmentEvent[]): boolean {
  const last = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()).at(-1);
  return last?.eventType !== "revoked";
}
