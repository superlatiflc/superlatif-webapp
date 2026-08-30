// Safe asset path validation for ZIP media (QST-002).
//
// dok 15A §1: "Semua nama file bersifat relatif, case-sensitive, tanpa
// `..`, path absolut, executable, atau symlink." dok 15A §2: asset
// references always live under `images/<placement>/`. This module is pure
// string validation - it never touches a filesystem or archive reader, so
// it is reusable from both the ZIP-entry reader (packages/db/src/exam/
// import) and any future caller that just has a path string. The archive
// reader treats a SINGLE unsafe entry as poisoning the WHOLE archive - see
// zip-reader.ts's own module doc - so this function is deliberately an
// assertion (throw), not a boolean predicate a caller could accidentally
// ignore.

/** dok 15A §2's ZIP layout: `images/<placement>/<file>`. */
export const ASSET_PLACEMENT_DIRECTORIES: readonly string[] = [
  "questions",
  "options",
  "passages",
  "explanations",
];

/** Extensions dok 15A §1 explicitly calls out as never permitted, regardless of declared MIME type. */
const DISALLOWED_EXTENSION_PATTERN = /\.(exe|sh|bat|cmd|ps1|dll|so|dylib|jar|msi|com|scr|vbs|js|svg)$/i;

export type UnsafeAssetPathReason =
  | "absolute_path"
  | "path_traversal"
  | "backslash_path"
  | "null_byte"
  | "not_under_images"
  | "unknown_placement"
  | "disallowed_extension"
  | "empty_path";

export class UnsafeAssetPathError extends Error {
  constructor(
    readonly path: string,
    readonly reason: UnsafeAssetPathReason,
  ) {
    super(`Unsafe asset path "${path}": ${reason}`);
    this.name = "UnsafeAssetPathError";
  }
}

/**
 * Validates one ZIP entry path against dok 15A §1/§2's rules and returns it
 * split into `{ placement, fileName }`. Throws `UnsafeAssetPathError` on any
 * violation - absolute path, `..` traversal (checked on both `/`- and
 * `\`-separated forms so a Windows-style path cannot smuggle a traversal
 * past a POSIX-only check), a literal backslash anywhere (dok 15A requires
 * relative POSIX-style paths only), an embedded NUL byte, a path not under
 * `images/<placement>/`, an unrecognized placement directory, or a
 * disallowed/executable extension. This function is a pure string check -
 * it never opens the entry, follows a symlink, or touches a real
 * filesystem; symlink-flag detection is the archive reader's own job
 * (POSIX file-mode bits are a property of the ZIP entry, not of the path
 * string).
 */
export function assertSafeAssetPath(rawPath: string): { placement: string; fileName: string } {
  if (!rawPath) throw new UnsafeAssetPathError(rawPath, "empty_path");
  if (rawPath.includes("\u0000")) throw new UnsafeAssetPathError(rawPath, "null_byte");
  if (rawPath.includes("\\")) throw new UnsafeAssetPathError(rawPath, "backslash_path");
  if (rawPath.startsWith("/")) throw new UnsafeAssetPathError(rawPath, "absolute_path");
  // Windows-style drive-letter absolute path (`C:\...` already caught by
  // the backslash check above; `C:/...` is caught here).
  if (/^[a-zA-Z]:/.test(rawPath)) throw new UnsafeAssetPathError(rawPath, "absolute_path");

  const segments = rawPath.split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new UnsafeAssetPathError(rawPath, "path_traversal");
  }

  if (segments[0] !== "images" || segments.length < 3) {
    throw new UnsafeAssetPathError(rawPath, "not_under_images");
  }
  const placement = segments[1];
  if (placement === undefined || !ASSET_PLACEMENT_DIRECTORIES.includes(placement)) {
    throw new UnsafeAssetPathError(rawPath, "unknown_placement");
  }

  const fileName = segments.slice(2).join("/");
  if (DISALLOWED_EXTENSION_PATTERN.test(fileName)) {
    throw new UnsafeAssetPathError(rawPath, "disallowed_extension");
  }

  return { placement, fileName };
}
