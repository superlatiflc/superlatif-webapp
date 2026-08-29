// Per-learner curriculum read model (PRG-002).
//
// Composes assertProgramAccess (ENT-002/IDN-004, unchanged - "Gunakan ENT-002
// effective-access resolver dan IDN-004 authorize(), jangan bikin aturan
// akses baru" carries over from PRG-001) with the pinned program version and
// @superlatif/domain/program's resolveModuleVisibility. No HTML, no route -
// "Jangan bangun full LMS player dulu" (founder instruction). This is the
// read model a future roadmap/Hub page (PRG-003+) would call, not that page
// itself.

import { and, eq } from "drizzle-orm";
import type { EffectiveAccessCache } from "@superlatif/domain/access";
import {
  resolveModuleVisibility,
  type ContentVisibility,
  type ModuleLifecycleStatus,
  type ReleaseRule,
} from "@superlatif/domain/program";
import type { Queryable, Schema } from "../db-types.ts";
import { programEnrollments } from "../schema/index.ts";
import { findProgramByCode } from "./program-repository.ts";
import { assertProgramAccess } from "./enrollment-service.ts";
import { listModulesForProgramVersion } from "./curriculum-repository.ts";

export interface CurriculumModuleView {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly position: number;
  readonly trackCode: string;
  readonly stageCode: string;
  readonly visibility: ContentVisibility;
}

export interface ProgramCurriculumView {
  readonly programVersionId: string;
  /** Only modules whose resolved visibility is "locked" or "released" - archived and unpublished modules are never returned (dok 09 UX invariant, "archived module hidden" acceptance). Callers that need to distinguish locked-vs-released render both, styled differently - a locked module is still a real roadmap item the learner can see is coming. */
  readonly modules: readonly CurriculumModuleView[];
}

export type CurriculumAccessResult =
  | { readonly kind: "denied"; readonly reasonCode: string }
  | { readonly kind: "no_published_version" }
  | { readonly kind: "ready"; readonly curriculum: ProgramCurriculumView };

const RELEASE_RULE_MODES = new Set([
  "immediate",
  "fixed_datetime",
  "relative_to_enrollment",
  "after_prerequisite",
  "manual",
]);

function isReleaseRuleShape(value: unknown): value is ReleaseRule {
  return (
    typeof value === "object" &&
    value !== null &&
    "mode" in value &&
    RELEASE_RULE_MODES.has((value as { mode: unknown }).mode as string)
  );
}

/** `modules.releaseConfig` is untyped JSONB at the storage boundary - parsed here rather than trusted, per CLAUDE.md "parse/validate all external input at the boundary." An empty/unset config (`{}`, the column default) is treated as `immediate` - a module created without an explicit release rule is visible as soon as it is published, not silently locked forever. */
function parseReleaseRule(config: Record<string, unknown>): ReleaseRule {
  return isReleaseRuleShape(config) ? config : { mode: "immediate" };
}

/**
 * Resolves what one learner currently sees of one program's curriculum.
 * Denies exactly the way assertProgramAccess already does (menu visibility
 * is never authorization - dok 24 §5) - `no_published_version` is a
 * SEPARATE, non-denial state: the learner has real access to the program,
 * there is simply nothing published yet (dok 09 §6.2 empty state, not a
 * denied state).
 */
export async function getProgramCurriculum(
  db: Queryable<Schema>,
  cache: EffectiveAccessCache,
  userId: string,
  programCode: string,
  now: Date,
): Promise<CurriculumAccessResult> {
  const decision = await assertProgramAccess(db, cache, userId, programCode, now);
  if (!decision.allowed) {
    return { kind: "denied", reasonCode: decision.reasonCode };
  }

  const program = await findProgramByCode(db, programCode);
  if (!program) return { kind: "denied", reasonCode: "OBJECT_NOT_FOUND" };

  const [enrollmentForProgram] = await db
    .select({
      pinnedProgramVersionId: programEnrollments.pinnedProgramVersionId,
      enrolledAt: programEnrollments.enrolledAt,
    })
    .from(programEnrollments)
    .where(and(eq(programEnrollments.userId, userId), eq(programEnrollments.programId, program.id)))
    .limit(1);

  if (!enrollmentForProgram?.pinnedProgramVersionId) {
    return { kind: "no_published_version" };
  }

  const rows = await listModulesForProgramVersion(db, enrollmentForProgram.pinnedProgramVersionId);
  const context = {
    now,
    enrolledAt: enrollmentForProgram.enrolledAt,
    completedPlacementIds: new Set<string>(),
  };

  const modulesView: CurriculumModuleView[] = [];
  for (const row of rows) {
    const rule = parseReleaseRule(row.moduleReleaseConfig);
    const visibility = resolveModuleVisibility(row.moduleStatus as ModuleLifecycleStatus, rule, context);
    if (visibility === "hidden_archived" || visibility === "hidden_unpublished") continue;
    modulesView.push({
      id: row.moduleId,
      code: row.moduleCode,
      title: row.moduleTitle,
      position: row.modulePosition,
      trackCode: row.trackCode,
      stageCode: row.stageCode,
      visibility,
    });
  }
  modulesView.sort((a, b) => a.position - b.position);

  return {
    kind: "ready",
    curriculum: { programVersionId: enrollmentForProgram.pinnedProgramVersionId, modules: modulesView },
  };
}
