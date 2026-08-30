// Bulk import limits and closed vocabularies (QST-002).
//
// dok 15A §1 "Input dan batas awal", transcribed verbatim. dok 15A's own
// text flags these numbers explicitly: "Nilai ini wajib diuji dengan load
// test sebelum produksi" - these are synthetic, code-enforced bounds for
// this task, NOT evidence that the platform has been load-tested at these
// sizes. Do not read their presence here as a load-test result.

/** dok 15A §1: one workbook ≤ 20 MB. */
export const MAX_WORKBOOK_BYTES = 20 * 1024 * 1024;

/** dok 15A §1: one media ZIP ≤ 250 MB. */
export const MAX_ZIP_BYTES = 250 * 1024 * 1024;

/** dok 15A §1: ≤ 5,000 questions per job. */
export const MAX_QUESTIONS_PER_JOB = 5_000;

/** dok 15A §1: ≤ 25,000 options/statements per job. */
export const MAX_OPTIONS_PER_JOB = 25_000;

/** dok 15A §1: ≤ 5 MB per individual asset. */
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;

/**
 * dok 15A §1: "Format gambar MVP: PNG, JPEG, dan WebP. SVG ditolak sampai
 * sanitizer disetujui." SVG is deliberately absent - it is XML and can
 * carry embedded script, and dok 15A explicitly withholds it pending a
 * sanitizer this task does not build.
 */
export const ALLOWED_IMAGE_MIME_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/webp"];

export const ALLOWED_IMAGE_EXTENSIONS: readonly string[] = [".png", ".jpg", ".jpeg", ".webp"];

/** dok 15A §1: "`template_version` wajib; artefak RC2 memakai versi `2.1` dan job ditolak jika versi tidak didukung." */
export const SUPPORTED_TEMPLATE_VERSIONS: readonly string[] = ["2.1"];

export class UnsupportedTemplateVersionError extends Error {
  constructor(readonly templateVersion: string | undefined) {
    super(
      `Unsupported template_version "${templateVersion ?? "(missing)"}" - supported: ${SUPPORTED_TEMPLATE_VERSIONS.join(", ")}`,
    );
    this.name = "UnsupportedTemplateVersionError";
  }
}

export function assertSupportedTemplateVersion(templateVersion: string | undefined): void {
  if (!templateVersion || !SUPPORTED_TEMPLATE_VERSIONS.includes(templateVersion)) {
    throw new UnsupportedTemplateVersionError(templateVersion);
  }
}
