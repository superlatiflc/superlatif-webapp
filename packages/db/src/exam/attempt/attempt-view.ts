// Attempt view assembly (ATM-001) - the shared read projection both the
// start response and the resume response return.
//
// dok 16 §11 "Resume mengembalikan": attempt state; server time, deadline,
// cutoff; writer lease status; presented sections/questions/order; current
// answers and revisions; flagged questions; current question; submission/
// result state; incident/accommodation state; permitted actions. "Resume
// payload menggunakan student serializer dan tidak menyertakan scoring
// secret."
//
// `answers`/`flags` are always empty here and `submissionState` is always
// `not_submitted`/`ready` - this task builds no answer-save/submit path,
// so there is nothing yet to report; the FIELDS still exist (matching
// contracts/openapi.yaml's own `Attempt` shape) so a later task extends
// this same view rather than building a second, competing one.
//
// Per-instance content reuses `assembleStudentFacingQuestionView`
// (question-preview-service.ts) - see that file's own module doc for why
// it is now permission-agnostic and shared between the admin preview path
// and this student path. `instances[]` here is `AttemptQuestionInstanceView`
// (this file's own name), NOT byte-identical to contracts/openapi.yaml's
// `StudentQuestionInstance` (which requires pre-rendered `StudentRichContent`
// - `renderedHtml`/`plainText` - an HTML-rendering layer that does not
// exist anywhere in this codebase yet, QST-001 included). This is a
// deliberate, documented "structural conformance now, byte-identical API
// projection later" decision, the same class EXM-002's own batch
// publication validator already made being partial rather than complete.

import {
  computePermittedActions,
  computeInitialSectionNavigationStates,
  deriveWriterLeaseState,
  type AttemptPermittedAction,
  type AttemptStatus,
  type SectionNavigationState,
  type StudentFacingQuestionView,
  type WriterLeaseState,
} from "@superlatif/domain/exam";
import type { Queryable, Schema } from "../../db-types.ts";
import { assembleStudentFacingQuestionView } from "../question-preview-service.ts";
import type { AttemptRow } from "./attempt-repository.ts";
import { listPresentedInstances } from "./attempt-question-instance-repository.ts";
import { findActiveLease, type AttemptWriterLeaseRow } from "./attempt-writer-lease-repository.ts";

export interface AttemptInstanceView {
  readonly instanceId: string;
  readonly sequence: number;
  readonly sectionCode: string;
  readonly questionVersionId: string;
  readonly presentedOptionOrder: readonly string[] | null;
  readonly content: StudentFacingQuestionView;
}

export interface AttemptSectionView {
  readonly code: string;
  readonly navigationState: SectionNavigationState;
}

export interface AttemptView {
  readonly id: string;
  readonly batchId: string;
  readonly status: AttemptStatus;
  readonly serverNow: Date;
  readonly remainingSeconds: number;
  readonly attemptRevision: number;
  readonly startedAt: Date;
  readonly deadlineAt: Date;
  readonly lateSyncCutoffAt: Date;
  readonly submittedAt: Date | null;
  readonly sections: readonly AttemptSectionView[];
  readonly instances: readonly AttemptInstanceView[];
  readonly currentInstanceId: string | null;
  /** Always empty - answer-save is not built by this task. See module doc. */
  readonly answers: readonly never[];
  readonly flags: readonly never[];
  readonly submissionState: "not_submitted";
  readonly permittedActions: readonly AttemptPermittedAction[];
  readonly writerLease: {
    readonly state: WriterLeaseState;
    /** Only ever populated in the START response for the device that just received it - a resume/view call never re-reveals a token it did not itself just mint (matching "writer lease token hanya disimpan hash di server"). */
    readonly leaseToken: string | null;
    readonly expiresAt: Date;
  };
}

export interface AssembleAttemptViewInput {
  readonly attempt: AttemptRow;
  readonly now: Date;
  readonly sections: readonly { code: string; order: number }[];
  readonly sectionLockMode: string;
  /** The token the CURRENT caller presented (from their own request), if any - used only to distinguish `held_here` from `held_elsewhere`; never persisted or logged here. */
  readonly requestingLeaseTokenHash: string | null;
  /** Set only immediately after `issueLease` mints a brand-new token for THIS caller (the start response) - see `writerLease.leaseToken`'s own doc. */
  readonly justIssuedLeaseToken?: string | null;
}

function remainingSeconds(deadlineAt: Date, now: Date): number {
  return Math.max(0, Math.round((deadlineAt.getTime() - now.getTime()) / 1000));
}

export async function assembleAttemptView(
  db: Queryable<Schema>,
  input: AssembleAttemptViewInput,
): Promise<AttemptView> {
  const { attempt, now } = input;

  const instanceRows = await listPresentedInstances(db, attempt.id);
  const instances: AttemptInstanceView[] = [];
  for (const row of instanceRows) {
    const content = await assembleStudentFacingQuestionView(db, row.questionVersionId);
    instances.push({
      instanceId: row.id,
      sequence: row.sequence,
      sectionCode: row.sectionCode,
      questionVersionId: row.questionVersionId,
      presentedOptionOrder: row.presentedOptionOrder,
      content,
    });
  }

  const activeLease: AttemptWriterLeaseRow | null = await findActiveLease(db, attempt.id);
  const writerLeaseState = deriveWriterLeaseState(
    activeLease ? { tokenHash: activeLease.tokenHash, expiresAt: activeLease.expiresAt } : null,
    input.requestingLeaseTokenHash,
    now,
  );

  const sections = computeInitialSectionNavigationStates(input.sections, input.sectionLockMode);
  const permittedActions = computePermittedActions(attempt.status, writerLeaseState);

  return {
    id: attempt.id,
    batchId: attempt.batchId,
    status: attempt.status,
    serverNow: now,
    remainingSeconds: remainingSeconds(attempt.deadlineAt, now),
    attemptRevision: attempt.attemptRevision,
    startedAt: attempt.startedAt,
    deadlineAt: attempt.deadlineAt,
    lateSyncCutoffAt: attempt.lateSyncCutoffAt,
    submittedAt: attempt.submittedAt,
    sections,
    instances,
    currentInstanceId: instances[0]?.instanceId ?? null,
    answers: [],
    flags: [],
    submissionState: "not_submitted",
    permittedActions,
    writerLease: {
      state: writerLeaseState,
      leaseToken: input.justIssuedLeaseToken ?? null,
      expiresAt: activeLease?.expiresAt ?? now,
    },
  };
}
