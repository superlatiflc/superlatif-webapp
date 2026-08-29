// Curriculum release rules and content visibility (PRG-002).
//
// dok 14 §6 "Release rules MVP" names exactly five kinds: immediate, fixed
// datetime, relative to enrollment/activation, after prerequisite
// placement/stage, and manual release by admin. This module models that
// vocabulary as a pure, injected-clock function - no wall-clock reads, no
// database access, matching every other domain-layer resolver in this
// codebase (ENT-002's getEffectiveAccess, PRG-001's resolveNextAction).
//
// "scheduled release" (founder instruction) = the `fixed_datetime` rule.
// "drip" = `relative_to_enrollment` (each learner's own release date shifts
// with when THEY enrolled, the classic drip-feed pattern). "locked" is the
// resolved state before a rule's condition is met - never a rule kind
// itself. "published"/"archived" are a MODULE's own lifecycle state
// (curriculum.ts's `modules.status`), a different axis entirely: a
// published module can still be locked (release condition unmet) or
// released (condition met); an archived module is hidden regardless of what
// its release rule would otherwise say.

export type ReleaseRule =
  | { readonly mode: "immediate" }
  | { readonly mode: "fixed_datetime"; readonly releaseAt: string }
  | { readonly mode: "relative_to_enrollment"; readonly offsetDays: number }
  | { readonly mode: "after_prerequisite"; readonly prerequisitePlacementIds: readonly string[] }
  | { readonly mode: "manual"; readonly released: boolean };

export type ReleaseState = "locked" | "released";

export interface ReleaseContext {
  readonly now: Date;
  /** Null when the placement/module is evaluated outside any specific learner's enrollment (e.g. an admin preview) - `relative_to_enrollment` cannot resolve without it, so it stays locked. */
  readonly enrolledAt: Date | null;
  /** Placement IDs this learner has completed - used only by `after_prerequisite`. Always empty until a progress-tracking task (LRN series) exists; an honest empty set keeps every `after_prerequisite` placement locked rather than guessing completion. */
  readonly completedPlacementIds: ReadonlySet<string>;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Resolves ONE release rule against a point-in-time learner context. Pure - same inputs, same output, always. */
export function resolveReleaseState(rule: ReleaseRule, context: ReleaseContext): ReleaseState {
  switch (rule.mode) {
    case "immediate":
      return "released";
    case "fixed_datetime":
      return context.now.getTime() >= Date.parse(rule.releaseAt) ? "released" : "locked";
    case "relative_to_enrollment": {
      if (!context.enrolledAt) return "locked";
      const releaseAt = context.enrolledAt.getTime() + rule.offsetDays * MS_PER_DAY;
      return context.now.getTime() >= releaseAt ? "released" : "locked";
    }
    case "after_prerequisite":
      return rule.prerequisitePlacementIds.every((id) => context.completedPlacementIds.has(id))
        ? "released"
        : "locked";
    case "manual":
      return rule.released ? "released" : "locked";
  }
}

export type ModuleLifecycleStatus =
  "draft" | "in_review" | "changes_requested" | "approved" | "published" | "archived";

export type ContentVisibility = "hidden_archived" | "hidden_unpublished" | "locked" | "released";

/**
 * Combines a module's own lifecycle status with its release rule to decide
 * what a specific learner sees. Archived always wins - "archived module
 * hidden" (founder instruction) is unconditional, not subject to any
 * release rule that might otherwise say "released". A module that is not
 * yet published (still draft/in_review/etc - no admin publish workflow
 * exists to reach those states in this task, but the type stays honest
 * about the full record_status vocabulary) is equally hidden, distinctly
 * reason-coded so a caller can tell "not ready yet" apart from an admin
 * having retired the module.
 */
export function resolveModuleVisibility(
  moduleStatus: ModuleLifecycleStatus,
  rule: ReleaseRule,
  context: ReleaseContext,
): ContentVisibility {
  if (moduleStatus === "archived") return "hidden_archived";
  if (moduleStatus !== "published") return "hidden_unpublished";
  return resolveReleaseState(rule, context);
}

export interface PrerequisiteEdge {
  readonly placementId: string;
  readonly prerequisitePlacementIds: readonly string[];
}

/**
 * dok 14 §6: "Circular dependency ditolak saat publish." Detects a cycle in
 * the prerequisite graph across every placement in a program version (not
 * just one module - a prerequisite can point anywhere in the same version).
 * Pure graph traversal (DFS with a recursion stack), no I/O.
 */
export function findCircularPrerequisite(edges: readonly PrerequisiteEdge[]): string[] | null {
  const byId = new Map(edges.map((edge) => [edge.placementId, edge.prerequisitePlacementIds]));
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function visit(id: string): string[] | null {
    if (stack.has(id)) return [...path.slice(path.indexOf(id)), id];
    if (visited.has(id)) return null;
    visited.add(id);
    stack.add(id);
    path.push(id);
    for (const prerequisiteId of byId.get(id) ?? []) {
      const cycle = visit(prerequisiteId);
      if (cycle) return cycle;
    }
    stack.delete(id);
    path.pop();
    return null;
  }

  for (const edge of edges) {
    const cycle = visit(edge.placementId);
    if (cycle) return cycle;
  }
  return null;
}
