// Feature-flag convention (GOV-003).
//
// 30_LAUNCH_AND_OPERATIONS_RUNBOOK.md §6 feature-flag rules and
// 27_QA_TESTING_AND_UAT_PLAN.md §4 both state the same invariant: a flag has
// an owner, a safe default, an expiry/removal task, and "server authorization
// remains independent" - a flag decides whether a capability is *offered*,
// never whether an actor is *allowed*.
//
// This module makes the second half of that rule structural, not just
// documented: FeatureFlag.read() returns a plain boolean and nothing else,
// so there is no channel for a flag to carry roles, permissions, or a bypass
// through this type. flags.test.ts proves the point with a directive comment
// that tells the compiler an authorization-shaped field is expected to fail:
// the compiler refuses code that would add one.

import type { ENV_SPEC} from "./env-spec.ts";
import { PRODUCTION_SENSITIVE_FLAG_NAMES, type EnvName } from "./env-spec.ts";
import type { ParsedEnv } from "./env.ts";

export interface FeatureFlag {
  readonly name: FlagName;
  readonly owner: string;
  readonly description: string;
  /** What removes this flag, e.g. a backlog ID or "when OD-04 closes". */
  readonly targetRemoval: string;
  /** The only thing a flag can tell a caller: on, or off. Never a permission. */
  read(): boolean;
}

// The conditional must be distributive over the EnvName union, so the
// checked type has to be the naked type parameter itself (K extends ...),
// not an expression derived from it (which would check the whole union at
// once and collapse to `never`).
type FlagFieldOf<K> = K extends EnvName ? ((typeof ENV_SPEC)[K] extends { type: "boolean" } ? K : never) : never;
export type FlagName = FlagFieldOf<EnvName>;

interface FlagOwnership {
  readonly owner: string;
  readonly description: string;
  readonly targetRemoval: string;
}

/**
 * Every boolean env var must be registered here with a real owner and
 * removal condition (dok 30 §6). flags.test.ts asserts this set matches
 * ENV_SPEC's boolean fields exactly, so a new flag cannot be introduced by
 * only editing env-spec.ts.
 */
const FLAG_OWNERSHIP: Record<FlagName, FlagOwnership> = {
  COMMERCE_RECONCILIATION_ENABLED: {
    owner: "Commerce Ops",
    description: "Enables the commerce reconciliation path.",
    targetRemoval: "COM-005 (reconciliation queue) graduates this out of a flag",
  },
  RATE_LIMIT_ENABLED: {
    owner: "Platform on-call",
    description: "Global rate limiting.",
    targetRemoval: "Removed only if rate limiting becomes mandatory and non-optional",
  },
  DEVICE_LEASE_ENFORCEMENT: {
    owner: "Exam on-call",
    description: "Enforces the exam writer-lease device check.",
    targetRemoval: "ATM-002 (writer lease) graduates this out of a flag",
  },
  FEATURE_COMMERCE_SYNC: {
    owner: "Commerce Owner + Engineering Lead",
    description: "Production commerce normalization path.",
    targetRemoval: "OD-01 and OD-02 evidence closes; Gate A passes",
  },
  FEATURE_LIVE_CLASS: {
    owner: "Live-Class Coordinator",
    description: "Live class scheduling and occurrence surfaces.",
    targetRemoval: "PRG live-class slice reaches Gate B",
  },
  FEATURE_QUESTION_IMPORT: {
    owner: "Academic Admin",
    description: "Bulk question import pipeline.",
    targetRemoval: "QST import slice passes its acceptance suite",
  },
  FEATURE_EXAM_ENGINE: {
    owner: "Academic Admin + Engineering Lead",
    description: "Exam attempt runner.",
    targetRemoval: "Gate C evidence closes",
  },
  FEATURE_LEADERBOARD: {
    owner: "Academic Admin",
    description: "Privacy-safe leaderboard surface.",
    targetRemoval: "SCR ranking slice passes its acceptance suite",
  },
  FEATURE_NOTIFICATIONS: {
    owner: "Operations Admin",
    description: "Outbound notification delivery.",
    targetRemoval: "NTF-001 passes its acceptance suite",
  },
  SKD_PRODUCTION_ACTIVATION: {
    owner: "Academic Owner + Product Owner",
    description: "Ranked SKD production activation.",
    targetRemoval: "OD-04, academic sign-off, Gate C, and OD-08 all close",
  },
  PRODUCTION_WRITES_ENABLED: {
    owner: "Founder + Engineering Lead",
    description: "Master switch for any production-effect write.",
    targetRemoval: "Explicit signed go/no-go per 30_LAUNCH_AND_OPERATIONS_RUNBOOK.md §13",
  },
};

function buildFlag(name: FlagName, env: Pick<ParsedEnv, FlagName>, ownership: FlagOwnership): FeatureFlag {
  return {
    name,
    owner: ownership.owner,
    description: ownership.description,
    targetRemoval: ownership.targetRemoval,
    read: () => env[name],
  };
}

/** Builds the flag registry from a validated env. Never call this on raw process.env. */
export function loadFlags(env: Pick<ParsedEnv, FlagName>): Readonly<Record<FlagName, FeatureFlag>> {
  const flags = {} as Record<FlagName, FeatureFlag>;
  for (const name of Object.keys(FLAG_OWNERSHIP) as FlagName[]) {
    flags[name] = buildFlag(name, env, FLAG_OWNERSHIP[name]);
  }
  return flags;
}

/** Production-sensitive flags: acceptance criterion #2 requires every one of these to default off. */
export const PRODUCTION_SENSITIVE_FLAGS: readonly FlagName[] = PRODUCTION_SENSITIVE_FLAG_NAMES as readonly FlagName[];

export const REGISTERED_FLAG_NAMES: readonly FlagName[] = Object.keys(FLAG_OWNERSHIP) as FlagName[];
