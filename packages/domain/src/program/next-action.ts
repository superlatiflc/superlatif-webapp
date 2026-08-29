// Next-action resolver (PRG-001).
//
// dok 09 §5 "Penentuan 'aktivitas berikutnya'": "Dashboard dan program hub
// memakai resolver yang sama" - one priority table and tie-break, used
// everywhere "next action" is shown (UX invariant #12: "Satu resolver, satu
// vocabulary"). This module is that resolver, and only that: a pure
// function over whatever candidates the caller can currently produce.
//
// Most candidate types (LIVE_NOW needs live sessions, DEADLINE_SOON/
// REQUIRED_WITHIN_24H need batches, RESUME_IN_PROGRESS needs attempts/
// resource progress, ROADMAP_NEXT needs published roadmap stages,
// RESULT_REMEDIATION needs results) depend on schema no merged task has
// built yet (SCH-001, EXM series, PRG-002, LRN series, result-correction
// tasks). This task deliberately does not fabricate any of them - it ships
// the full, tested PRIORITY CONTRACT so those tasks only need to produce
// `NextActionCandidate` values, never re-derive ordering or reason codes.
// See ADR-052.

export type NextActionReasonCode =
  | "LIVE_NOW"
  | "DEADLINE_SOON"
  | "RESUME_IN_PROGRESS"
  | "REQUIRED_WITHIN_24H"
  | "ROADMAP_NEXT"
  | "RESULT_REMEDIATION"
  | "OPTIONAL_RECOMMENDATION";

const PRIORITY_ORDER: readonly NextActionReasonCode[] = [
  "LIVE_NOW",
  "DEADLINE_SOON",
  "RESUME_IN_PROGRESS",
  "REQUIRED_WITHIN_24H",
  "ROADMAP_NEXT",
  "RESULT_REMEDIATION",
  "OPTIONAL_RECOMMENDATION",
];

export interface NextActionCandidate {
  readonly id: string;
  readonly reasonCode: NextActionReasonCode;
  readonly title: string;
  readonly programId: string;
  /** Deadline or start time this candidate is racing against, if any - used for the same-priority tie-break. */
  readonly deadlineOrStartAt: Date | null;
  /** True for a required (non-optional) activity - the second tie-break after nearest deadline/start. */
  readonly isRequired: boolean;
  /** Position in the roadmap/curriculum order, if known - the third tie-break. Null sorts last. */
  readonly roadmapOrder: number | null;
}

export interface ResolvedNextAction {
  readonly candidate: NextActionCandidate;
  readonly reasonCode: NextActionReasonCode;
}

function priorityIndex(reasonCode: NextActionReasonCode): number {
  return PRIORITY_ORDER.indexOf(reasonCode);
}

function compareWithinPriority(a: NextActionCandidate, b: NextActionCandidate): number {
  // 1. Nearest deadline/start first; a candidate with no deadline sorts after one that has one.
  if (a.deadlineOrStartAt !== b.deadlineOrStartAt) {
    if (a.deadlineOrStartAt === null) return 1;
    if (b.deadlineOrStartAt === null) return -1;
    const delta = a.deadlineOrStartAt.getTime() - b.deadlineOrStartAt.getTime();
    if (delta !== 0) return delta;
  }
  // 2. Required beats optional.
  if (a.isRequired !== b.isRequired) return a.isRequired ? -1 : 1;
  // 3. Roadmap order ascending; null (unknown) sorts last.
  if (a.roadmapOrder !== b.roadmapOrder) {
    if (a.roadmapOrder === null) return 1;
    if (b.roadmapOrder === null) return -1;
    if (a.roadmapOrder !== b.roadmapOrder) return a.roadmapOrder - b.roadmapOrder;
  }
  // 4. Stable ID ascending.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Picks the single next-action candidate to show, per dok 09 §5's priority
 * table and tie-break. Candidates the caller has already excluded as
 * inaccessible or unreleased must never be passed in - this function trusts
 * its input is already eligible.
 */
export function resolveNextAction(candidates: readonly NextActionCandidate[]): ResolvedNextAction | null {
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    const priorityDelta = priorityIndex(a.reasonCode) - priorityIndex(b.reasonCode);
    if (priorityDelta !== 0) return priorityDelta;
    return compareWithinPriority(a, b);
  });

  const winner = sorted[0]!;
  return { candidate: winner, reasonCode: winner.reasonCode };
}
