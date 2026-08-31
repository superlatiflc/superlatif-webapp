// Result version schema (SCR-001).
//
// dok 21 §10 `result_versions`: "Attempt/submission, version, state,
// scores JSON, evaluation, scoring engine/policy, input checksum,
// released/corrected timestamps; one current pointer." Named
// `result_versions` (the ERD's own LOGICAL name) rather than the RC2
// "collapsed physical" suggestion `results` (dok 21 §18's mapping table) -
// EXM-001 already diverged from that same collapse suggestion for
// `exam_blueprints`/`scoring_policies`/`exam_forms` (each stayed a real
// parent+version pair rather than collapsing), so this table follows the
// codebase's own established, more recent precedent instead of the
// older suggested mapping. See the SCR-001 ADR for the explicit note.
//
// Key constraint #11 (dok 21 §13): "Result version unique by attempt +
// version; one current." Two indexes enforce this at the database, the
// same class of guarantee `attempts_user_batch_active_uq` (ATM-001) and
// `attempt_writer_lease_active_uq` (ATM-001) already established for
// their own "exactly one active X" invariants:
//   - unique (attempt_id, version) - no duplicate version numbers;
//   - unique (attempt_id) WHERE is_current = true - a real partial
//     index on a boolean flag, NOT a predicate on now() (dok 21 §12's
//     own RC2 physical invariant: "dijamin partial unique index berbasis
//     boolean state, bukan predicate now()").
//
// `state` is set to the literal "provisional" once by scoring-service.ts
// and never transitioned by any code in this task - dok 16 §16's
// `processing -> provisional -> final` lifecycle continues at
// "provisional" (scored, not yet reviewed/released). `released_at` and
// `corrected_at` exist NOW (matching this table's own canonical ERD
// shape) so SCR-002 ("Create result release, immutable history, and
// correction workflow") does not need an ALTER TABLE later - the exact
// same "surface exists without this task depending on it" pattern
// ATM-001 used for `attempts.attempt_revision` - but neither column is
// ever written by anything this task ships.
//
// No per-question breakdown/computation-trace column exists here
// deliberately - "Component, total, threshold, and rank inputs are
// separately recorded" (SCR-001 acceptance) is satisfied by the
// aggregate `scores`/`evaluation` JSON and the hoisted `total_score`/
// `overall_passed` scalars, without ever persisting which SPECIFIC
// option a student picked per question - that is pembahasan/explanation
// territory (dok 16 §16, explicitly out of this task's scope) and stays
// unbuilt rather than accidentally created as a side effect of "record
// the score".

import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { attempts } from "./attempts.ts";
import { attemptSubmissions } from "./submissions.ts";
import { scoringPolicyVersions } from "./exam-config.ts";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const resultVersions = pgTable(
  "result_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id),
    /** Which finalization this score was computed from - pins the exact frozen answer snapshot (ATM-003's own `answerSetChecksum`). */
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => attemptSubmissions.id),
    /** The scoring policy version PINNED on the attempt at start time (ATM-001), never "current" - "Recompute stays pinned to snapshot policy" (required test). */
    scoringPolicyVersionId: uuid("scoring_policy_version_id")
      .notNull()
      .references(() => scoringPolicyVersions.id),
    /** 1 for every result this task ever creates - correction (SCR-002) is what increments this for a given attempt. */
    version: integer("version").notNull().default(1),
    isCurrent: boolean("is_current").notNull().default(true),
    /** "processing" | "provisional" | "final" | "corrected" | "withheld" | "voided" (dok 16 §16, CLAUDE.md canonical) - this task only ever writes "provisional". */
    state: text("state").notNull(),
    /** {sectionScores, sectionMaxScores, unansweredCount, invalidCount} - see score-calculation.ts's own ScoreComputationResult. */
    scores: jsonb("scores").$type<Record<string, unknown>>().notNull(),
    /** {thresholdResults} - the per-rule pass/fail map from score-calculation.ts. */
    evaluation: jsonb("evaluation").$type<Record<string, unknown>>().notNull(),
    /** Hoisted out of `scores` JSON deliberately - a future ranking feature (SCR-003, not built here) will want to ORDER BY this directly rather than JSON-path into every row. */
    totalScore: doublePrecision("total_score").notNull(),
    /** null when every threshold rule is no_threshold (not applicable) - never coerced to false. */
    overallPassed: boolean("overall_passed"),
    /** Stable identifier for THIS scorer implementation (dok 16 §14 "scoring engine version") - see score-calculation.ts's SCORING_ENGINE_VERSION-equivalent constant in scoring-service.ts. */
    scoringEngineVersion: text("scoring_engine_version").notNull(),
    /** Checksum of {submissionId, answerSetChecksum, scoringPolicyVersionId, scoringEngineVersion} - "Same snapshot and answers always produce same score" (acceptance) is the property this checksum lets a caller VERIFY without recomputing. */
    inputChecksum: text("input_checksum").notNull(),
    /** Never set by this task - SCR-002's own release workflow owns this transition. */
    releasedAt: timestamp("released_at", { withTimezone: true }),
    /** Never set by this task - SCR-002's own correction workflow owns this transition. */
    correctedAt: timestamp("corrected_at", { withTimezone: true }),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("result_version_attempt_version_uq").on(table.attemptId, table.version),
    uniqueIndex("result_version_attempt_current_uq")
      .on(table.attemptId)
      .where(sql`${table.isCurrent} = true`),
  ],
);
