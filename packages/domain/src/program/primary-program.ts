// Primary program selection (PRG-001).
//
// dok 09 §8.1 (locked, "tidak boleh dibuka ulang tanpa ADR" per §18):
// "Jika hanya ada satu program, program itu dipilih otomatis. Jika ada
// beberapa program dan pengguna sudah memilih program utama, pilihan itu
// dipertahankan. Jika belum ada pilihan, resolver memilih kandidat
// terbaik; aktivitas mendesak dari program lain tampil sebagai banner dan
// tidak mengganti program utama secara diam-diam." Candidates here are
// already-accessible programs (the caller composes ENT-002's
// resolveEffectiveAccess before calling this - this module never decides
// access itself).

export type PrimaryProgramReasonCode = "MANUAL_SELECTION" | "ONLY_PROGRAM" | "MOST_RECENT_ACTIVITY";

export interface ProgramEnrollmentCandidate {
  readonly programId: string;
  /** True for the program the student explicitly chose as primary - wins outright when present, matching the locked UX decision. */
  readonly isPrimary: boolean;
  readonly enrolledAt: Date;
  /** Null if the program has no recorded activity yet. */
  readonly lastActivityAt: Date | null;
}

export interface PrimaryProgramSelection {
  readonly programId: string;
  readonly reasonCode: PrimaryProgramReasonCode;
}

function recencySignal(candidate: ProgramEnrollmentCandidate): Date {
  return candidate.lastActivityAt ?? candidate.enrolledAt;
}

/**
 * Selects the primary program from a student's currently-accessible
 * enrollments. Returns null only when there are no accessible programs at
 * all - the "no active program" empty state.
 */
export function selectPrimaryProgram(
  candidates: readonly ProgramEnrollmentCandidate[],
): PrimaryProgramSelection | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return { programId: candidates[0]!.programId, reasonCode: "ONLY_PROGRAM" };

  const manual = candidates.find((candidate) => candidate.isPrimary);
  if (manual) return { programId: manual.programId, reasonCode: "MANUAL_SELECTION" };

  // No manual choice yet - pick the most recently active program. Tie-break
  // by earliest enrollment (the more established program), then stable ID.
  const sorted = [...candidates].sort((a, b) => {
    const recencyDelta = recencySignal(b).getTime() - recencySignal(a).getTime();
    if (recencyDelta !== 0) return recencyDelta;
    const enrolledDelta = a.enrolledAt.getTime() - b.enrolledAt.getTime();
    if (enrolledDelta !== 0) return enrolledDelta;
    return a.programId < b.programId ? -1 : a.programId > b.programId ? 1 : 0;
  });

  return { programId: sorted[0]!.programId, reasonCode: "MOST_RECENT_ACTIVITY" };
}
