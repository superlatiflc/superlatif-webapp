// @superlatif/ui
//
// Shared student/admin design-system primitives and components.
//
// PRG-001 is the first task to populate this package (previously an empty
// boundary placeholder from GOV-001) - tokens transcribed from
// docs/gates/11_DESIGN_SYSTEM.md §3-9, and the student-domain components
// dok 11 §13.1/§13.2 name (Program Card, Next Action Card) plus the global
// state primitives dok 09 §6 requires everywhere (Empty state, Skeleton,
// Status badge). Exam, admin, and the remaining student-domain components
// (Journey Roadmap, Schedule Item, Batch Card, ...) are added by whichever
// task first needs them - not built ahead of a real consumer.

export { EmptyState, type EmptyStateProps } from "./components/EmptyState.tsx";
export { NextActionCard, type NextActionCardProps } from "./components/NextActionCard.tsx";
export { ProgramCard, type ProgramCardProps } from "./components/ProgramCard.tsx";
export {
  QuestionPreviewCard,
  type QuestionPreviewAsset,
  type QuestionPreviewCardProps,
  type QuestionPreviewData,
  type QuestionPreviewOption,
  type QuestionPreviewResponseKind,
  type QuestionPreviewStimulus,
} from "./components/QuestionPreviewCard.tsx";
export { Skeleton, type SkeletonProps } from "./components/Skeleton.tsx";
export { StatusBadge, type StatusBadgeProps, type StatusBadgeVariant } from "./components/StatusBadge.tsx";
export { BatchCard, type BatchCardProps } from "./components/BatchCard.tsx";
export { CountdownTimer, type CountdownTimerProps } from "./components/CountdownTimer.tsx";
export {
  AnswerableQuestion,
  type AnswerableQuestionOption,
  type AnswerableQuestionProps,
} from "./components/AnswerableQuestion.tsx";
export {
  ResultScoreCard,
  type ResultScoreCardProps,
  type ResultSectionScore,
} from "./components/ResultScoreCard.tsx";
export {
  LeaderboardTable,
  type LeaderboardRowData,
  type LeaderboardTableProps,
} from "./components/LeaderboardTable.tsx";
export {
  QuestionReviewCard,
  type QuestionReviewCardProps,
  type QuestionReviewOption,
  type QuestionReviewStatus,
} from "./components/QuestionReviewCard.tsx";
