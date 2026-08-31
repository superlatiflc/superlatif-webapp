// SYNTHETIC preview-only types (UI Preview Track).
//
// Every type here mirrors the SHAPE of a real service-layer return type -
// see each field's own comment for exactly which real function/file it
// stands in for - so a future task can replace the mock functions in this
// directory with real @superlatif/db calls without changing how any page
// component consumes them. This directory is never imported by anything
// outside apps/web/src/app/preview/**, and nothing in it ever claims to be
// production-eligible data (dok 17 §4/§17's own "fixture numbers test the
// engine, never claim regulation" discipline, applied here to UI mock data
// instead of scoring fixtures).

/** Mirrors @superlatif/domain/exam's ResultState (result-lifecycle.ts, SCR-002) - CLAUDE.md canonical. */
export type ResultState = "processing" | "provisional" | "final" | "corrected" | "withheld" | "voided";

/** Mirrors packages/db/src/exam/scoring/result-release-service.ts's own StudentResultView.scoreSummary shape (SCR-002). */
export interface ScoreSummary {
  readonly total: number;
  readonly sectionScores: Record<string, number>;
  readonly sectionMaxScores: Record<string, number>;
  readonly overallPassed: boolean | null;
}

/** Mirrors packages/db/src/exam/scoring/result-release-service.ts's own StudentResultView (SCR-002 getStudentResultView). */
export interface MockStudentResultView {
  readonly state: ResultState;
  readonly resultId: string | null;
  readonly version: number | null;
  readonly scoreSummary: ScoreSummary | null;
  readonly releasedAt: string | null; // ISO instant
}

/** Mirrors @superlatif/domain/exam's LeaderboardWireState (ranking.ts, SCR-003). */
export type LeaderboardWireState =
  "not_released" | "processing" | "provisional" | "final" | "corrected" | "disabled";

/** Mirrors @superlatif/domain/exam's LeaderboardEntryProjection (ranking.ts, SCR-003 projectLeaderboardEntry). */
export interface MockLeaderboardEntry {
  readonly rank: number;
  readonly scoreSummary: ScoreSummary;
  readonly publicOptIn: boolean;
  readonly displayAlias: string | null;
  readonly percentile: number | null;
  readonly isCurrentLearner: boolean;
}

/** Mirrors packages/db/src/exam/scoring/ranking-service.ts's own LeaderboardView (SCR-003 getBatchLeaderboardView). */
export interface MockLeaderboardView {
  readonly state: LeaderboardWireState;
  readonly snapshotVersion: number | null;
  readonly generatedAt: string | null;
  readonly policyVersion: string | null;
  readonly entries: readonly MockLeaderboardEntry[];
  readonly ownEntry: MockLeaderboardEntry | null;
}

/** Mirrors @superlatif/domain/exam's AnswerPayload (answer-payload.ts, ATM-002) - narrowed to the "single_choice" wire kind, the ONLY kind this preview's two question sections (TWK single_choice, TKP weighted_choice) ever produce on the wire (dok 16 §8: weighted_choice's student payload is ALSO wire-shape single_choice). */
export interface SingleChoiceAnswer {
  readonly kind: "single_choice";
  readonly optionCode: string;
}

export type AnswerSlot = SingleChoiceAnswer | null;

export interface PreviewQuestionOption {
  readonly optionCode: string;
  readonly text: string;
}

/** Mirrors the shape ATM-001's assembleAttemptView produces per presented question instance (student-safe: no correct-answer/weight field exists on this type, matching StudentFacingQuestionView's own structural guarantee). */
export interface PreviewQuestion {
  readonly instanceId: string;
  readonly sequence: number;
  readonly sectionCode: "TWK" | "TKP";
  readonly sectionTitle: string;
  readonly stem: string;
  readonly options: readonly PreviewQuestionOption[];
}

export type BatchStatusGroup = "in_progress" | "available" | "upcoming" | "awaiting_result" | "completed";

/** Mirrors what dok 12 S07's own Batch Card needs (EXM-002's exam_batches + batch_windows, projected). */
export interface PreviewBatchSummary {
  readonly batchSlug: string;
  readonly title: string;
  readonly examFamilyLabel: string;
  readonly statusGroup: BatchStatusGroup;
  readonly attemptWindowLabel: string;
  readonly durationLabel: string;
  readonly attemptsUsed: number;
  readonly attemptsAllowed: number;
  readonly resultReleaseLabel: string;
}

/** Mirrors dok 12 E01's own content list. */
export interface PreviewBatchDetail extends PreviewBatchSummary {
  readonly sections: readonly {
    readonly code: string;
    readonly title: string;
    readonly questionCount: number;
    readonly durationLabel: string;
  }[];
  readonly navigationPolicyLabel: string;
  readonly scoringPolicyLabel: string;
  readonly integrityNotice: string;
  readonly deviceNotice: string;
  readonly totalDurationSeconds: number;
}
