// XLSX workbook parsing for bulk question import (QST-002).
//
// dok 15A §3's sheet contract, read by HEADER NAME (row 1) rather than
// fixed column position, so column reordering within a sheet does not
// silently misparse a workbook. Every row-shape type here is the raw,
// UNVALIDATED workbook content - business-rule validation (per-type answer
// completeness, path safety, cross-sheet asset references) happens in
// question-import-service.ts, reusing @superlatif/domain/exam's existing
// validators rather than duplicating them here. This module's only job is
// "bytes in, plain rows out."

import ExcelJS from "exceljs";
import { MAX_WORKBOOK_BYTES } from "@superlatif/domain/exam";

export class WorkbookTooLargeError extends Error {
  constructor(readonly sizeBytes: number) {
    super(`Workbook is ${sizeBytes} bytes, exceeding the ${MAX_WORKBOOK_BYTES}-byte limit`);
    this.name = "WorkbookTooLargeError";
  }
}

export class MissingRequiredSheetError extends Error {
  constructor(readonly sheetName: string) {
    super(`Workbook is missing the required sheet "${sheetName}"`);
    this.name = "MissingRequiredSheetError";
  }
}

export interface ParsedQuestionRow {
  readonly rowNumber: number;
  readonly questionCode: string;
  readonly questionType: string;
  readonly status: string;
  readonly classification: Record<string, unknown>;
  readonly stemText: string;
  readonly explanationText: string | null;
  readonly passageCode: string | null;
  readonly stemImagePath: string | null;
  readonly stemImageAltText: string | null;
  readonly stemImagePurpose: string;
  readonly partialScorePolicy: string | null;
}

export interface ParsedOptionRow {
  readonly rowNumber: number;
  readonly questionCode: string;
  readonly optionCode: string;
  readonly order: number;
  readonly contentText: string;
  readonly imagePath: string | null;
  readonly imageAltText: string | null;
  readonly imagePurpose: string;
  readonly isCorrect: boolean | null;
  readonly weight: number | null;
}

export interface ParsedStatementRow {
  readonly rowNumber: number;
  readonly questionCode: string;
  readonly statementCode: string;
  readonly contentText: string;
  readonly expected: boolean;
}

export interface ParsedNumericAnswerRow {
  readonly rowNumber: number;
  readonly questionCode: string;
  readonly acceptedValue: number | null;
  readonly min: number | null;
  readonly max: number | null;
  readonly tolerance: number | null;
  readonly unit: string | null;
}

export interface ParsedPassageRow {
  readonly rowNumber: number;
  readonly passageCode: string;
  readonly bodyText: string;
  readonly imagePath: string | null;
  readonly imageAltText: string | null;
  readonly imagePurpose: string;
}

export interface ParsedAssetManifestRow {
  readonly rowNumber: number;
  readonly filePath: string;
  readonly ownerCode: string;
  readonly assetRole: string;
  readonly optionCode: string | null;
  readonly imagePurpose: string;
  readonly altText: string | null;
}

export interface ParsedWorkbook {
  readonly templateVersion: string;
  readonly questions: readonly ParsedQuestionRow[];
  readonly options: readonly ParsedOptionRow[];
  readonly statements: readonly ParsedStatementRow[];
  readonly numericAnswers: readonly ParsedNumericAnswerRow[];
  readonly passages: readonly ParsedPassageRow[];
  readonly assets: readonly ParsedAssetManifestRow[];
}

function cellToPrimitive(value: ExcelJS.CellValue): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "richText" in value) {
    return (value.richText as { text: string }[]).map((part) => part.text).join("");
  }
  if (typeof value === "object" && "result" in value) {
    return cellToPrimitive((value as { result: ExcelJS.CellValue }).result);
  }
  return String(value);
}

function cellToText(value: ExcelJS.CellValue): string | null {
  const primitive = cellToPrimitive(value);
  if (primitive === null) return null;
  const text = String(primitive).trim();
  return text.length === 0 ? null : text;
}

function cellToNumber(value: ExcelJS.CellValue): number | null {
  const primitive = cellToPrimitive(value);
  if (primitive === null) return null;
  const num = typeof primitive === "number" ? primitive : Number(primitive);
  return Number.isFinite(num) ? num : null;
}

function cellToBoolean(value: ExcelJS.CellValue): boolean | null {
  const primitive = cellToPrimitive(value);
  if (primitive === null) return null;
  if (typeof primitive === "boolean") return primitive;
  const text = String(primitive).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(text)) return true;
  if (["false", "0", "no", "n"].includes(text)) return false;
  return null;
}

/** Reads sheet rows keyed by header name (row 1), tolerant of column order. Rows after the header with an entirely empty first cell are skipped. */
function readSheetRows(worksheet: ExcelJS.Worksheet): Record<string, string | number | boolean | null>[] {
  const headerRow = worksheet.getRow(1);
  const headers: Record<number, string> = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = cellToText(cell.value);
    if (header) headers[colNumber] = header;
  });

  const rows: Record<string, string | number | boolean | null>[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string | number | boolean | null> = {};
    let hasAnyValue = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;
      record[header] = cellToPrimitive(cell.value);
      hasAnyValue = true;
    });
    if (hasAnyValue) {
      record.__rowNumber = rowNumber;
      rows.push(record);
    }
  });
  return rows;
}

function findSheet(workbook: ExcelJS.Workbook, name: string, required: boolean): ExcelJS.Worksheet | null {
  const sheet = workbook.getWorksheet(name);
  if (!sheet && required) throw new MissingRequiredSheetError(name);
  return sheet ?? null;
}

export async function parseQuestionImportWorkbook(workbookBytes: Buffer): Promise<ParsedWorkbook> {
  if (workbookBytes.length > MAX_WORKBOOK_BYTES) throw new WorkbookTooLargeError(workbookBytes.length);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(workbookBytes as unknown as ExcelJS.Buffer);

  // dok 15A §3: the Instructions sheet is a simple field/value table
  // ("Versi, format, delimiter rumus, dan aturan status"); this parser
  // reads only the one field it needs to enforce, `template_version`.
  const instructions = findSheet(workbook, "Instructions", true);
  const instructionRows = instructions ? readSheetRows(instructions) : [];
  const templateVersionRow = instructionRows.find((row) => row.field === "template_version");
  const templateVersion = String(templateVersionRow?.value ?? "");

  const questionsSheet = findSheet(workbook, "Questions", true);
  const questions: ParsedQuestionRow[] = readSheetRows(questionsSheet!).map((row) => ({
    rowNumber: row.__rowNumber as unknown as number,
    questionCode: String(row.question_code ?? ""),
    questionType: String(row.question_type ?? ""),
    status: String(row.status ?? "draft"),
    classification: {
      examFamily: row.exam_family ?? null,
      subject: row.subject ?? null,
      topic: row.topic ?? null,
      subtopic: row.subtopic ?? null,
      competencyCode: row.competency_code ?? null,
      difficulty: row.difficulty ?? null,
      source: row.source ?? null,
      year: row.year ?? null,
      language: row.language ?? null,
    },
    stemText: String(row.stem_text ?? ""),
    explanationText: (row.explanation_text as string | null) ?? null,
    passageCode: (row.passage_code as string | null) ?? null,
    stemImagePath: (row.stem_image_path as string | null) ?? null,
    stemImageAltText: (row.stem_image_alt_text as string | null) ?? null,
    stemImagePurpose: String(row.stem_image_purpose ?? "informative"),
    partialScorePolicy: (row.partial_score_policy as string | null) ?? null,
  }));

  const optionsSheet = findSheet(workbook, "Options", false);
  const options: ParsedOptionRow[] = optionsSheet
    ? readSheetRows(optionsSheet).map((row) => ({
        rowNumber: row.__rowNumber as unknown as number,
        questionCode: String(row.question_code ?? ""),
        optionCode: String(row.option_code ?? ""),
        order: Number(row.order ?? 0),
        contentText: String(row.content_text ?? ""),
        imagePath: (row.image_path as string | null) ?? null,
        imageAltText: (row.image_alt_text as string | null) ?? null,
        imagePurpose: String(row.image_purpose ?? "informative"),
        isCorrect: cellToBoolean(row.is_correct as ExcelJS.CellValue),
        weight: cellToNumber(row.weight as ExcelJS.CellValue),
      }))
    : [];

  const statementsSheet = findSheet(workbook, "Statements", false);
  const statements: ParsedStatementRow[] = statementsSheet
    ? readSheetRows(statementsSheet).map((row) => ({
        rowNumber: row.__rowNumber as unknown as number,
        questionCode: String(row.question_code ?? ""),
        statementCode: String(row.statement_code ?? ""),
        contentText: String(row.content_text ?? ""),
        expected: cellToBoolean(row.expected as ExcelJS.CellValue) ?? false,
      }))
    : [];

  const numericSheet = findSheet(workbook, "NumericAnswers", false);
  const numericAnswers: ParsedNumericAnswerRow[] = numericSheet
    ? readSheetRows(numericSheet).map((row) => ({
        rowNumber: row.__rowNumber as unknown as number,
        questionCode: String(row.question_code ?? ""),
        acceptedValue: cellToNumber(row.accepted_value as ExcelJS.CellValue),
        min: cellToNumber(row.min as ExcelJS.CellValue),
        max: cellToNumber(row.max as ExcelJS.CellValue),
        tolerance: cellToNumber(row.tolerance as ExcelJS.CellValue),
        unit: (row.unit as string | null) ?? null,
      }))
    : [];

  const passagesSheet = findSheet(workbook, "Passages", false);
  const passages: ParsedPassageRow[] = passagesSheet
    ? readSheetRows(passagesSheet).map((row) => ({
        rowNumber: row.__rowNumber as unknown as number,
        passageCode: String(row.passage_code ?? ""),
        bodyText: String(row.body_text ?? ""),
        imagePath: (row.image_path as string | null) ?? null,
        imageAltText: (row.image_alt_text as string | null) ?? null,
        imagePurpose: String(row.image_purpose ?? "informative"),
      }))
    : [];

  const assetsSheet = findSheet(workbook, "Assets", false);
  const assets: ParsedAssetManifestRow[] = assetsSheet
    ? readSheetRows(assetsSheet).map((row) => ({
        rowNumber: row.__rowNumber as unknown as number,
        filePath: String(row.file_name ?? ""),
        ownerCode: String(row.owner_code ?? ""),
        assetRole: String(row.asset_role ?? ""),
        optionCode: (row.option_code as string | null) ?? null,
        imagePurpose: String(row.image_purpose ?? "informative"),
        altText: (row.alt_text as string | null) ?? null,
      }))
    : [];

  return { templateVersion, questions, options, statements, numericAnswers, passages, assets };
}
