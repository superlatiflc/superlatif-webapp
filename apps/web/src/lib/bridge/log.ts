// Structured log lines for the bridge sign-in path (ADR-072). Server-only.
//
// WHY NOT @superlatif/observability's createLogger: importing that package
// evaluates its redaction module, which reads
// `contracts/analytics-event-catalog.json` from disk at module load, resolved
// relative to its own compiled location. Inside a Next.js server bundle on
// Vercel that path does not exist, so the whole route module failed to load
// and /auth/bridge/callback answered 500 in production - even with student
// sign-in disabled, before its own 404 gate could run. This path has no
// file-system dependency at all.
//
// Same record shape as the shared logger ({level, message, timestamp,
// fields}), so log queries do not care which one wrote a line. No redaction
// layer is needed here because nothing sensitive is ever passed in: every
// caller logs fixed reason labels and internal IDs only, never the code,
// state, WordPress subject, or any secret (sign-in.test.ts asserts this).

type Fields = Record<string, unknown>;
type Level = "info" | "warn" | "error";

export interface BridgeLogger {
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields): void;
}

export function createBridgeLogger(
  write: (level: Level, line: string) => void = (level, line) => {
    (level === "info" ? process.stdout : process.stderr).write(`${line}\n`);
  },
  now: () => Date = () => new Date(),
): BridgeLogger {
  const log = (level: Level, message: string, fields?: Fields) =>
    write(level, JSON.stringify({ level, message, timestamp: now().toISOString(), fields: fields ?? {} }));
  return {
    info: (message, fields) => log("info", message, fields),
    warn: (message, fields) => log("warn", message, fields),
    error: (message, fields) => log("error", message, fields),
  };
}
