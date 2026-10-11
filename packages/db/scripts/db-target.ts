// Shared guard for operator scripts that may point at a real database (M2 launch prep).
//
// The Supabase project ref is read from DATABASE_URL (pooler user `postgres.<ref>`
// or host `db.<ref>.supabase.co`) and must equal the ref the operator typed in
// `--expect-ref`. The URL itself is never printed.

export function projectRefOf(databaseUrl: string): string | null {
  const match =
    databaseUrl.match(/postgres\.([a-z0-9]{20})[:@]/) ?? databaseUrl.match(/@db\.([a-z0-9]{20})\./);
  return match?.[1] ?? null;
}

export function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** Exits unless DATABASE_URL is set and points at exactly the expected project. */
export function requireTarget(): { databaseUrl: string; ref: string } {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const expected = argument("expect-ref");
  if (!expected) throw new Error("--expect-ref=<supabase project ref> is required");
  const ref = projectRefOf(databaseUrl);
  if (ref !== expected) {
    throw new Error(
      `DATABASE_URL points at project ${ref ?? "(unrecognised)"}, not --expect-ref=${expected}; refusing`,
    );
  }
  return { databaseUrl, ref };
}
