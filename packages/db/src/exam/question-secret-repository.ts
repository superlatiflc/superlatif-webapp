// question_version_secrets persistence (QST-001).
//
// THE security boundary module. This file is the only place in
// packages/db/src/exam that ever reads or writes an answer key - no
// question-service.ts function that returns a student-facing shape imports
// anything from here (see student-view.ts's own module doc for the other
// structural half of that guarantee). `upsertQuestionVersionSecret`
// validates the answer key against the version's OWN actual option codes
// via @superlatif/domain/exam's assertValidAnswerKey before writing -
// "invalid option key" required test exercises exactly this call.

import { eq } from "drizzle-orm";
import { assertQuestionVersionMutable, assertValidAnswerKey, type AnswerKey } from "@superlatif/domain/exam";
import { computeChecksum, type JsonValue } from "@superlatif/domain/shared";
import type { Queryable, Schema } from "../db-types.ts";
import { questionVersionSecrets, questionVersions } from "../schema/index.ts";
import { listQuestionOptions } from "./question-repository.ts";

export class QuestionVersionSecretNotFoundError extends Error {
  constructor(versionId: string) {
    super(`Question version ${versionId} has no answer key set`);
    this.name = "QuestionVersionSecretNotFoundError";
  }
}

export class QuestionVersionNotFoundForSecretError extends Error {
  constructor(versionId: string) {
    super(`Question version ${versionId} not found`);
    this.name = "QuestionVersionNotFoundForSecretError";
  }
}

/**
 * Inserts or replaces the ONE secret row for a question version (1:1).
 * Refuses once the version is locked (assertQuestionVersionMutable, same
 * gate as the version's own content) and refuses if `answerKey` references
 * an option code that does not exist on this version's own
 * `question_options` rows.
 */
export async function upsertQuestionVersionSecret(
  db: Queryable<Schema>,
  versionId: string,
  answerKey: AnswerKey,
): Promise<void> {
  const [version] = await db
    .select({ status: questionVersions.status, type: questionVersions.type })
    .from(questionVersions)
    .where(eq(questionVersions.id, versionId))
    .limit(1);
  if (!version) throw new QuestionVersionNotFoundForSecretError(versionId);
  assertQuestionVersionMutable(version.status);

  const options = await listQuestionOptions(db, versionId);
  assertValidAnswerKey(
    version.type,
    answerKey,
    options.map((option) => option.optionCode),
  );

  const checksum = computeChecksum(answerKey as unknown as JsonValue);
  const [existing] = await db
    .select({ id: questionVersionSecrets.id })
    .from(questionVersionSecrets)
    .where(eq(questionVersionSecrets.questionVersionId, versionId))
    .limit(1);

  if (existing) {
    await db
      .update(questionVersionSecrets)
      .set({ answerKey: answerKey as unknown as Record<string, unknown>, checksum })
      .where(eq(questionVersionSecrets.questionVersionId, versionId));
  } else {
    await db.insert(questionVersionSecrets).values({
      questionVersionId: versionId,
      answerKey: answerKey as unknown as Record<string, unknown>,
      checksum,
    });
  }
}

/**
 * Reads the answer key back - INTERNAL/scoring use only. No exported
 * question-service.ts function forwards this return value into any
 * student-facing/serializer path; the only caller in this task's test
 * suite is the "no answer leak" test itself, asserting the OPPOSITE
 * function (toStudentFacingQuestionView) never produces this shape.
 */
export async function findQuestionVersionSecret(
  db: Queryable<Schema>,
  versionId: string,
): Promise<AnswerKey | null> {
  const [row] = await db
    .select({ answerKey: questionVersionSecrets.answerKey })
    .from(questionVersionSecrets)
    .where(eq(questionVersionSecrets.questionVersionId, versionId))
    .limit(1);
  return row ? (row.answerKey as unknown as AnswerKey) : null;
}

export async function requireQuestionVersionSecret(
  db: Queryable<Schema>,
  versionId: string,
): Promise<AnswerKey> {
  const answerKey = await findQuestionVersionSecret(db, versionId);
  if (!answerKey) throw new QuestionVersionSecretNotFoundError(versionId);
  return answerKey;
}
