// Safe ZIP media reading for bulk question import (QST-002).
//
// Deliberately never writes an entry to a real filesystem - every entry is
// read straight into an in-memory Buffer and later handed to
// question-asset-repository.ts as an opaque `storageRef` (a content-hash
// string, see question-import-service.ts). This eliminates the classic
// zip-slip failure mode STRUCTURALLY, not just by validation: there is no
// `fs.writeFile(entryControlledPath, ...)` call anywhere in this module for
// a malicious path to reach, the same "structural, not conventional"
// security pattern QST-001 used for its own secret boundary.
//
// jszip normalizes `..`-bearing entry names into `entry.name` and exposes
// the ORIGINAL, unsafe name separately as `entry.unsafeOriginalName` (see
// jszip's own type comment: "May contain '..' path components that could
// result in a zip-slip attack"). This module validates the RAW name
// (`unsafeOriginalName ?? name`), not the already-sanitized one - checking
// only the sanitized name would make the traversal check unable to ever
// see the attack it exists to catch.
//
// A single unsafe entry poisons the WHOLE archive: this function throws on
// the first violation rather than silently skipping the bad entry and
// importing the rest, so a crafted ZIP can never partially succeed its way
// past validation.
//
// Disclosed limitation, not a hidden gap: `MAX_ASSET_BYTES` is checked
// AFTER `entry.async("nodebuffer")` fully decompresses one entry into
// memory - jszip's public API does not expose a per-entry uncompressed-size
// hint before decompression, so a single maliciously crafted entry (tiny
// compressed size, huge decompressed size - a "zip bomb") can still spike
// memory for the duration of that one entry's decompression before this
// module rejects it. A streaming, bounded-read ZIP reader would close this
// gap; dok 15A §1 itself flags its own size limits as "wajib diuji dengan
// load test sebelum produksi" - full zip-bomb hardening is left to that
// pre-production work, not silently assumed solved here.

import JSZip from "jszip";
import {
  ALLOWED_IMAGE_EXTENSIONS,
  assertSafeAssetPath,
  MAX_ASSET_BYTES,
  MAX_ZIP_BYTES,
} from "@superlatif/domain/exam";

export interface ZipAssetEntry {
  readonly path: string;
  readonly placement: string;
  readonly fileName: string;
  readonly buffer: Buffer;
  readonly sizeBytes: number;
}

export class ZipTooLargeError extends Error {
  constructor(readonly sizeBytes: number) {
    super(`ZIP is ${sizeBytes} bytes, exceeding the ${MAX_ZIP_BYTES}-byte limit`);
    this.name = "ZipTooLargeError";
  }
}

export class ZipAssetTooLargeError extends Error {
  constructor(
    readonly entryPath: string,
    readonly sizeBytes: number,
  ) {
    super(
      `Asset "${entryPath}" is ${sizeBytes} bytes, exceeding the ${MAX_ASSET_BYTES}-byte per-asset limit`,
    );
    this.name = "ZipAssetTooLargeError";
  }
}

export class UnsafeZipEntryError extends Error {
  constructor(
    readonly entryPath: string,
    readonly reason: "symlink",
  ) {
    super(`ZIP entry "${entryPath}" is unsafe: ${reason}`);
    this.name = "UnsafeZipEntryError";
  }
}

export class DisallowedMediaTypeError extends Error {
  constructor(readonly entryPath: string) {
    super(`ZIP entry "${entryPath}" is not an allowed image type (PNG, JPEG, WebP only)`);
    this.name = "DisallowedMediaTypeError";
  }
}

export class DuplicateAssetBasenameError extends Error {
  constructor(readonly basename: string) {
    super(
      `ZIP contains duplicate asset basename "${basename}" - basenames must be unique to avoid ambiguous matching`,
    );
    this.name = "DuplicateAssetBasenameError";
  }
}

const S_IFMT = 0xf000;
const S_IFLNK = 0xa000;

/** Best-effort: jszip's public API only exposes `unixPermissions` as `number | string | null`, so a string form (rare, some archivers) is not checked here - the structural "never write to a real path" guarantee is the primary defense, this is defense in depth on top of it. */
function isSymlinkEntry(unixPermissions: number | string | null): boolean {
  if (typeof unixPermissions !== "number") return false;
  return (unixPermissions & S_IFMT) === S_IFLNK;
}

export async function readQuestionImportZip(zipBytes: Buffer): Promise<readonly ZipAssetEntry[]> {
  if (zipBytes.length > MAX_ZIP_BYTES) throw new ZipTooLargeError(zipBytes.length);

  const zip = await JSZip.loadAsync(zipBytes);
  const entries: ZipAssetEntry[] = [];
  const seenBasenames = new Set<string>();

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    if (isSymlinkEntry(entry.unixPermissions)) {
      throw new UnsafeZipEntryError(entry.name, "symlink");
    }

    const rawPath = entry.unsafeOriginalName ?? entry.name;
    const { placement, fileName } = assertSafeAssetPath(rawPath);

    const basename = fileName.split("/").pop() ?? fileName;
    if (seenBasenames.has(basename)) throw new DuplicateAssetBasenameError(basename);
    seenBasenames.add(basename);

    if (!ALLOWED_IMAGE_EXTENSIONS.some((extension) => fileName.toLowerCase().endsWith(extension))) {
      throw new DisallowedMediaTypeError(rawPath);
    }

    const buffer = await entry.async("nodebuffer");
    if (buffer.length > MAX_ASSET_BYTES) throw new ZipAssetTooLargeError(rawPath, buffer.length);

    entries.push({ path: rawPath, placement, fileName, buffer, sizeBytes: buffer.length });
  }

  return entries;
}
