// QST-002 integration tests - exercises the bulk import pipeline against a
// real (pglite-backed) Postgres schema with REAL XLSX/ZIP bytes (built with
// exceljs/jszip's own writer APIs, not hand-rolled binary fixtures),
// covering every case the founder instruction named explicitly: valid bulk
// import, missing image report, path traversal rejection, and replay
// idempotency.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { createUser } from "../../identity/repository.ts";
import { assignRole, seedCanonicalRoles } from "../../authorization/index.ts";
import { createTestDatabase, type TestDatabaseHandle } from "../../test-client.ts";
import {
  findQuestionByCode,
  findLatestQuestionVersion,
  listQuestionOptions,
} from "../question-repository.ts";
import { findQuestionVersionSecret } from "../question-secret-repository.ts";
import { QuestionActionNotAuthorizedError } from "../question-service.ts";
import { runQuestionImportJob } from "./question-import-service.ts";

let handle: TestDatabaseHandle;
let writerId: string;

beforeEach(async () => {
  handle = await createTestDatabase();
  await seedCanonicalRoles(handle.db);
  const writer = await createUser(handle.db, { emailNormalized: "importer@superlatif.id", phoneE164: null });
  writerId = writer.userId;
  await assignRole(handle.db, {
    userId: writerId,
    role: "tutor_writer",
    grantedByUserId: writerId,
    grantedReason: "test setup",
  });
});

afterEach(async () => {
  await handle.close();
});

type SheetRow = Record<string, string | number | boolean>;

function addSheet(workbook: ExcelJS.Workbook, name: string, rows: SheetRow[]) {
  if (rows.length === 0) return;
  const keys = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) keys.add(key);
  const worksheet = workbook.addWorksheet(name);
  worksheet.columns = [...keys].map((key) => ({ header: key, key }));
  for (const row of rows) worksheet.addRow(row);
}

interface WorkbookSheets {
  templateVersion?: string;
  questions: SheetRow[];
  options?: SheetRow[];
  statements?: SheetRow[];
  numericAnswers?: SheetRow[];
  passages?: SheetRow[];
  assets?: SheetRow[];
}

async function buildWorkbookBuffer(data: WorkbookSheets): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  addSheet(workbook, "Instructions", [{ field: "template_version", value: data.templateVersion ?? "2.1" }]);
  addSheet(workbook, "Questions", data.questions);
  addSheet(workbook, "Options", data.options ?? []);
  addSheet(workbook, "Statements", data.statements ?? []);
  addSheet(workbook, "NumericAnswers", data.numericAnswers ?? []);
  addSheet(workbook, "Passages", data.passages ?? []);
  addSheet(workbook, "Assets", data.assets ?? []);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function buildZipBuffer(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return buffer;
}

describe("valid bulk import", () => {
  it("creates single_choice, multiple_choice, weighted_choice, true_false, and numeric questions in one job", async () => {
    const workbookBytes = await buildWorkbookBuffer({
      questions: [
        {
          question_code: "Q-SC-001",
          question_type: "single_choice",
          status: "draft",
          stem_text: "Ibu kota Indonesia adalah?",
          stem_image_path: "images/questions/Q-SC-001-stem.png",
        },
        {
          question_code: "Q-MC-001",
          question_type: "multiple_choice",
          status: "draft",
          stem_text: "Pilih semua yang benar.",
          partial_score_policy: "proportional",
        },
        {
          question_code: "Q-WC-001",
          question_type: "weighted_choice",
          status: "in_review",
          stem_text: "Pilih jawaban dengan bobot tertinggi.",
        },
        {
          question_code: "Q-TF-001",
          question_type: "statement_true_false",
          status: "draft",
          stem_text: "Tentukan benar/salah untuk setiap pernyataan.",
        },
        {
          question_code: "Q-NUM-001",
          question_type: "numeric",
          status: "draft",
          stem_text: "Berapa hasil dari 6 x 7?",
        },
      ],
      options: [
        { question_code: "Q-SC-001", option_code: "A", order: 1, content_text: "Jakarta", is_correct: true },
        { question_code: "Q-SC-001", option_code: "B", order: 2, content_text: "Bandung", is_correct: false },
        { question_code: "Q-MC-001", option_code: "A", order: 1, content_text: "Benar 1", is_correct: true },
        { question_code: "Q-MC-001", option_code: "B", order: 2, content_text: "Salah 1", is_correct: false },
        { question_code: "Q-MC-001", option_code: "C", order: 3, content_text: "Benar 2", is_correct: true },
        { question_code: "Q-WC-001", option_code: "A", order: 1, content_text: "Opsi A", weight: 1 },
        { question_code: "Q-WC-001", option_code: "B", order: 2, content_text: "Opsi B", weight: 0.25 },
      ],
      statements: [
        {
          question_code: "Q-TF-001",
          statement_code: "S1",
          content_text: "Air mendidih pada 100 C",
          expected: true,
        },
        {
          question_code: "Q-TF-001",
          statement_code: "S2",
          content_text: "Matahari terbit di barat",
          expected: false,
        },
      ],
      numericAnswers: [{ question_code: "Q-NUM-001", accepted_value: 42, tolerance: 0 }],
    });
    const zipBytes = await buildZipBuffer({ "images/questions/Q-SC-001-stem.png": "fake-png-bytes" });

    const result = await runQuestionImportJob(handle.db, writerId, {
      workbookBytes,
      zipBytes,
      jobMode: "update_draft",
    });

    expect(result.status).toBe("completed");
    expect(result.replay).toBe(false);
    expect(result.summary.created).toBe(5);
    expect(result.summary.failed).toBe(0);
    expect([...result.summary.createdCodes].sort()).toEqual(
      ["Q-MC-001", "Q-NUM-001", "Q-SC-001", "Q-TF-001", "Q-WC-001"].sort(),
    );

    const scQuestion = await findQuestionByCode(handle.db, "Q-SC-001");
    expect(scQuestion).not.toBeNull();
    const scVersion = await findLatestQuestionVersion(handle.db, scQuestion!.id);
    expect(scVersion?.type).toBe("single_choice");
    const scOptions = await listQuestionOptions(handle.db, scVersion!.id);
    expect(scOptions).toHaveLength(2);

    // weighted_choice: the secret table carries the weights, never the
    // question_versions row itself - same boundary QST-001 already proved.
    const wcQuestion = await findQuestionByCode(handle.db, "Q-WC-001");
    const wcVersion = await findLatestQuestionVersion(handle.db, wcQuestion!.id);
    const wcSecret = await findQuestionVersionSecret(handle.db, wcVersion!.id);
    expect(wcSecret).toEqual({ kind: "weighted_choice", optionWeights: { A: 1, B: 0.25 } });
  });
});

describe("missing image report", () => {
  it("fails the whole job and reports every referenced image that is not in the ZIP", async () => {
    const workbookBytes = await buildWorkbookBuffer({
      questions: [
        {
          question_code: "Q-IMG-MISSING",
          question_type: "single_choice",
          status: "draft",
          stem_text: "Soal dengan gambar yang hilang.",
          stem_image_path: "images/questions/Q-IMG-MISSING-stem.png",
        },
      ],
      options: [
        {
          question_code: "Q-IMG-MISSING",
          option_code: "A",
          order: 1,
          content_text: "Opsi A",
          is_correct: true,
        },
        {
          question_code: "Q-IMG-MISSING",
          option_code: "B",
          order: 2,
          content_text: "Opsi B",
          is_correct: false,
        },
      ],
    });
    // ZIP provided, but does NOT contain the referenced stem image.
    const zipBytes = await buildZipBuffer({ "images/questions/unrelated.png": "unrelated" });

    const result = await runQuestionImportJob(handle.db, writerId, {
      workbookBytes,
      zipBytes,
      jobMode: "update_draft",
    });

    expect(result.status).toBe("failed");
    expect(result.summary.created).toBe(0);
    expect(result.summary.issues.some((issue) => issue.code === "missing_image")).toBe(true);

    // Nothing was committed - the atomic "rollback on any error" guarantee.
    const question = await findQuestionByCode(handle.db, "Q-IMG-MISSING");
    expect(question).toBeNull();
  });
});

describe("path traversal rejection", () => {
  it("rejects a ZIP containing a path-traversal entry before any content is imported", async () => {
    const workbookBytes = await buildWorkbookBuffer({
      questions: [
        {
          question_code: "Q-TRAVERSAL",
          question_type: "single_choice",
          status: "draft",
          stem_text: "Soal biasa.",
        },
      ],
      options: [
        {
          question_code: "Q-TRAVERSAL",
          option_code: "A",
          order: 1,
          content_text: "Opsi A",
          is_correct: true,
        },
      ],
    });
    const zip = new JSZip();
    zip.file("../../../etc/passwd", "evil");
    const zipBytes = await zip.generateAsync({ type: "nodebuffer" });

    const result = await runQuestionImportJob(handle.db, writerId, {
      workbookBytes,
      zipBytes,
      jobMode: "update_draft",
    });

    expect(result.status).toBe("failed");
    expect(result.summary.issues[0]?.code).toBe("UnsafeAssetPathError");
    expect(result.summary.issues[0]?.message).toContain("path_traversal");

    const question = await findQuestionByCode(handle.db, "Q-TRAVERSAL");
    expect(question).toBeNull();
  });

  it("rejects an absolute path entry the same way", async () => {
    const workbookBytes = await buildWorkbookBuffer({
      questions: [
        { question_code: "Q-ABS", question_type: "single_choice", status: "draft", stem_text: "..." },
      ],
      options: [{ question_code: "Q-ABS", option_code: "A", order: 1, content_text: "A", is_correct: true }],
    });
    const zip = new JSZip();
    zip.file("/etc/passwd", "evil");
    const zipBytes = await zip.generateAsync({ type: "nodebuffer" });

    const result = await runQuestionImportJob(handle.db, writerId, {
      workbookBytes,
      zipBytes,
      jobMode: "update_draft",
    });
    expect(result.status).toBe("failed");
  });

  it("rejects a disallowed media type (SVG) inside the ZIP", async () => {
    const workbookBytes = await buildWorkbookBuffer({
      questions: [
        { question_code: "Q-SVG", question_type: "single_choice", status: "draft", stem_text: "..." },
      ],
      options: [{ question_code: "Q-SVG", option_code: "A", order: 1, content_text: "A", is_correct: true }],
    });
    const zip = new JSZip();
    zip.file("images/questions/evil.svg", "<svg onload=alert(1)>");
    const zipBytes = await zip.generateAsync({ type: "nodebuffer" });

    const result = await runQuestionImportJob(handle.db, writerId, {
      workbookBytes,
      zipBytes,
      jobMode: "update_draft",
    });
    expect(result.status).toBe("failed");
  });
});

describe("replay idempotency", () => {
  it("a byte-identical resubmission returns the same job and never creates a duplicate question", async () => {
    const workbookBytes = await buildWorkbookBuffer({
      questions: [
        {
          question_code: "Q-REPLAY",
          question_type: "single_choice",
          status: "draft",
          stem_text: "Soal replay.",
        },
      ],
      options: [
        { question_code: "Q-REPLAY", option_code: "A", order: 1, content_text: "Opsi A", is_correct: true },
        { question_code: "Q-REPLAY", option_code: "B", order: 2, content_text: "Opsi B", is_correct: false },
      ],
    });

    const first = await runQuestionImportJob(handle.db, writerId, {
      workbookBytes,
      zipBytes: null,
      jobMode: "update_draft",
    });
    expect(first.status).toBe("completed");
    expect(first.replay).toBe(false);
    expect(first.summary.created).toBe(1);

    const second = await runQuestionImportJob(handle.db, writerId, {
      workbookBytes,
      zipBytes: null,
      jobMode: "update_draft",
    });
    expect(second.jobId).toBe(first.jobId);
    expect(second.replay).toBe(true);
    expect(second.summary.created).toBe(1);

    // Only ONE question_versions row exists for this code, not two - the
    // replay did not reprocess and did not create a second draft version.
    const question = await findQuestionByCode(handle.db, "Q-REPLAY");
    const latestVersion = await findLatestQuestionVersion(handle.db, question!.id);
    expect(latestVersion?.version).toBe(1);
  });

  it("a byte-different resubmission (even a single changed cell) is treated as a new job", async () => {
    const first = await buildWorkbookBuffer({
      questions: [
        {
          question_code: "Q-DIFF",
          question_type: "single_choice",
          status: "draft",
          stem_text: "Versi pertama.",
        },
      ],
      options: [{ question_code: "Q-DIFF", option_code: "A", order: 1, content_text: "A", is_correct: true }],
    });
    const second = await buildWorkbookBuffer({
      questions: [
        {
          question_code: "Q-DIFF",
          question_type: "single_choice",
          status: "draft",
          stem_text: "Versi KEDUA.",
        },
      ],
      options: [{ question_code: "Q-DIFF", option_code: "A", order: 1, content_text: "A", is_correct: true }],
    });

    const firstResult = await runQuestionImportJob(handle.db, writerId, {
      workbookBytes: first,
      zipBytes: null,
      jobMode: "update_draft",
    });
    const secondResult = await runQuestionImportJob(handle.db, writerId, {
      workbookBytes: second,
      zipBytes: null,
      jobMode: "update_draft",
    });

    expect(firstResult.jobId).not.toBe(secondResult.jobId);
    expect(secondResult.replay).toBe(false);
    // Same code, still draft -> update_draft mode updates the SAME version
    // in place (QST-001's own mutability rule), not a duplicate.
    expect(secondResult.summary.updated).toBe(1);
  });
});

describe("authorization", () => {
  it("denies a plain student (no role) from running an import job", async () => {
    const student = await createUser(handle.db, {
      emailNormalized: "student@superlatif.id",
      phoneE164: null,
    });
    const workbookBytes = await buildWorkbookBuffer({
      questions: [
        { question_code: "Q-DENIED", question_type: "single_choice", status: "draft", stem_text: "..." },
      ],
      options: [
        { question_code: "Q-DENIED", option_code: "A", order: 1, content_text: "A", is_correct: true },
      ],
    });

    await expect(
      runQuestionImportJob(handle.db, student.userId, {
        workbookBytes,
        zipBytes: null,
        jobMode: "update_draft",
      }),
    ).rejects.toThrow(QuestionActionNotAuthorizedError);
  });
});

describe("invalid answer key rows", () => {
  it("fails the job when a single_choice question has zero correct options marked", async () => {
    const workbookBytes = await buildWorkbookBuffer({
      questions: [
        { question_code: "Q-NOCORRECT", question_type: "single_choice", status: "draft", stem_text: "..." },
      ],
      options: [
        { question_code: "Q-NOCORRECT", option_code: "A", order: 1, content_text: "A", is_correct: false },
        { question_code: "Q-NOCORRECT", option_code: "B", order: 2, content_text: "B", is_correct: false },
      ],
    });

    const result = await runQuestionImportJob(handle.db, writerId, {
      workbookBytes,
      zipBytes: null,
      jobMode: "update_draft",
    });
    expect(result.status).toBe("failed");
    expect(result.summary.issues.some((issue) => issue.code === "single_choice_requires_one_correct")).toBe(
      true,
    );
  });
});
