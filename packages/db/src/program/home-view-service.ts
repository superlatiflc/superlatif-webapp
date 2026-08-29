// Home page view model (PRG-001).
//
// dok 07 §4 "Struktur Beranda" / dok 09 §8.1: orchestrates
// listAccessibleProgramsForUser (ENT-002-backed, deduplicated),
// syncProgramEnrollments, selectPrimaryProgram, and resolveNextAction into
// one server-side view model - no HTML here, apps/web renders this.
//
// Only "program utama dan next action" (dok 07 §4 item 1) and "program lain
// yang dimiliki" (item 5) are populated. Jadwal terdekat (item 2, needs
// SCH-001), perjalanan roadmap (item 3, needs PRG-002), aktivitas terbaru
// (item 4, needs LRN series), and rekomendasi offer (item 6, needs a
// catalogue-browsing surface) are omitted rather than faked - "Jangan
// bangun seluruh LMS dulu" (founder instruction). See ADR-052.

import type { EffectiveAccessCache } from "@superlatif/domain/access";
import { resolveNextAction, selectPrimaryProgram, type ResolvedNextAction } from "@superlatif/domain/program";
import type { Queryable, Schema } from "../db-types.ts";
import { listAccessibleProgramsForUser, syncProgramEnrollments } from "./enrollment-service.ts";
import type { ProgramRow } from "./program-repository.ts";

export interface HomeViewModel {
  readonly status: "no_program" | "ready";
  readonly primaryProgram: (ProgramRow & { readonly primaryReasonCode: string }) | null;
  /** dok 07 §4 item 5 - only meaningful (and only ever shown by the UI) when there is more than one accessible program. */
  readonly otherPrograms: readonly ProgramRow[];
  /** Always null until a task that owns a real candidate source (SCH-001, EXM series, PRG-002, LRN, result-correction) exists - see the module doc. */
  readonly nextAction: ResolvedNextAction | null;
}

export async function buildHomeViewModel(
  db: Queryable<Schema>,
  cache: EffectiveAccessCache,
  userId: string,
  now: Date,
): Promise<HomeViewModel> {
  const accessiblePrograms = await listAccessibleProgramsForUser(db, cache, userId, now);
  const enrollments = await syncProgramEnrollments(db, cache, userId, now);

  if (accessiblePrograms.length === 0) {
    return { status: "no_program", primaryProgram: null, otherPrograms: [], nextAction: null };
  }

  const byProgramId = new Map(accessiblePrograms.map((program) => [program.id, program]));
  const selection = selectPrimaryProgram(
    enrollments.map((enrollment) => ({
      programId: enrollment.programId,
      isPrimary: enrollment.isPrimary,
      enrolledAt: enrollment.enrolledAt,
      lastActivityAt: enrollment.lastActivityAt,
    })),
  );

  // selection is non-null whenever accessiblePrograms is non-empty, since
  // syncProgramEnrollments guarantees one enrollment row per accessible
  // program - this branch only exists to satisfy the type checker.
  if (!selection) {
    return { status: "no_program", primaryProgram: null, otherPrograms: [], nextAction: null };
  }

  const primary = byProgramId.get(selection.programId);
  if (!primary) {
    return { status: "no_program", primaryProgram: null, otherPrograms: [], nextAction: null };
  }

  return {
    status: "ready",
    primaryProgram: { ...primary, primaryReasonCode: selection.reasonCode },
    otherPrograms: accessiblePrograms.filter((program) => program.id !== primary.id),
    // No candidate source is wired yet - resolveNextAction([]) is always
    // null, which is the correct, honest "no next action yet" result for
    // this task's scope (dok 09 §5's own fallback: show achieved
    // milestones and a light continuation option instead).
    nextAction: resolveNextAction([]),
  };
}
