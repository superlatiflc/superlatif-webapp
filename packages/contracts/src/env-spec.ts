// Environment variable contract (GOV-003).
//
// One entry per variable in .env.example - env.test.ts asserts the two lists
// are identical, so this file cannot silently drift from the template that
// ships as source of truth. Read-set: .env.example,
// 24_AUTH_RBAC_SECURITY_AND_PRIVACY.md §12/§17, 30_LAUNCH_AND_OPERATIONS_RUNBOOK.md §3/§6.
//
// requirement tiers:
//   "required"           - no safe guess exists; missing or invalid fails startup.
//   "optional-default"   - absent is safe and uses `defaultValue`, coded here.
//   "optional-no-default" - absent is safe because nothing consumes it yet
//                           (secret or undecided provider config); no
//                           fallback value is ever coded for these.
//
// Invariant (checked by env.test.ts, not just by convention): an entry marked
// secret:true never carries a defaultValue. A secret must never have a
// source-controlled fallback - that would just be a committed secret with
// extra steps.

export type EnvType = "string" | "url" | "boolean" | "integer" | "enum";

interface BaseField {
  readonly type: EnvType;
  readonly secret: boolean;
  readonly description: string;
  readonly enumValues?: readonly string[];
  readonly minLength?: number;
}

export type EnvField =
  | (BaseField & { readonly requirement: "required" })
  | (BaseField & { readonly requirement: "optional-default"; readonly defaultValue: string })
  | (BaseField & { readonly requirement: "optional-no-default" });

export const ENV_SPEC = {
  // --- Runtime ---
  APP_ENV: {
    type: "enum",
    enumValues: ["development", "staging", "production", "test"],
    requirement: "required",
    secret: false,
    description: "Deployment environment. No safe guess exists for which one this process is.",
  },
  APP_BASE_URL: {
    type: "url",
    requirement: "required",
    secret: false,
    description: "Public origin of the student/admin web app.",
  },
  ADMIN_BASE_URL: {
    type: "url",
    requirement: "required",
    secret: false,
    description: "Public origin of the admin surface.",
  },
  API_BASE_URL: {
    type: "url",
    requirement: "required",
    secret: false,
    description: "Public origin of the API/BFF.",
  },
  WORKER_CONCURRENCY: {
    type: "integer",
    requirement: "required",
    secret: false,
    description: "Background worker concurrency.",
  },
  LOG_LEVEL: {
    type: "enum",
    enumValues: ["fatal", "error", "warn", "info", "debug", "trace"],
    requirement: "required",
    secret: false,
    description: "Structured log verbosity.",
  },

  // --- Database and cache (unused until P1; ADR-011/BD-05) ---
  DATABASE_URL: {
    type: "url",
    requirement: "optional-no-default",
    secret: true,
    description:
      "PostgreSQL connection string. Carries credentials. Consumed by @superlatif/db's " +
      "createDatabaseClient (IDN-001) and by db:migrate; still not required for apps/web or " +
      "apps/worker to start, since no HTTP route or job calls the database client yet.",
  },
  DATABASE_READ_URL: {
    type: "url",
    requirement: "optional-no-default",
    secret: true,
    description: "Read-replica connection string.",
  },
  REDIS_URL: {
    type: "url",
    requirement: "optional-no-default",
    secret: true,
    description: "Redis/Valkey-compatible connection string.",
  },
  DB_STATEMENT_TIMEOUT_MS: {
    type: "integer",
    requirement: "optional-default",
    defaultValue: "10000",
    secret: false,
    description: "Statement timeout applied once a database connection exists.",
  },

  // --- Object storage (unused until an import/asset task exists) ---
  OBJECT_STORAGE_ENDPOINT: {
    type: "url",
    requirement: "optional-no-default",
    secret: false,
    description: "S3-compatible endpoint.",
  },
  OBJECT_STORAGE_REGION: {
    type: "string",
    requirement: "optional-no-default",
    secret: false,
    description: "Object storage region.",
  },
  OBJECT_STORAGE_BUCKET: {
    type: "string",
    requirement: "optional-no-default",
    secret: false,
    description: "Bucket name; not a credential.",
  },
  OBJECT_STORAGE_ACCESS_KEY_ID: {
    type: "string",
    requirement: "optional-no-default",
    secret: true,
    description: "Object storage access key ID.",
  },
  OBJECT_STORAGE_SECRET_ACCESS_KEY: {
    type: "string",
    requirement: "optional-no-default",
    secret: true,
    minLength: 16,
    description: "Object storage secret access key.",
  },
  ASSET_SIGNING_SECRET: {
    type: "string",
    requirement: "optional-no-default",
    secret: true,
    minLength: 16,
    description: "Signs short-lived protected-asset URLs.",
  },
  ASSET_URL_TTL_SECONDS: {
    type: "integer",
    requirement: "optional-default",
    defaultValue: "900",
    secret: false,
    description: "Signed asset URL lifetime.",
  },

  // --- Application authentication (unused until IDN-001) ---
  SESSION_SIGNING_SECRET: {
    type: "string",
    requirement: "optional-no-default",
    secret: true,
    minLength: 16,
    description: "Signs the session cookie.",
  },
  SESSION_ENCRYPTION_SECRET: {
    type: "string",
    requirement: "optional-no-default",
    secret: true,
    minLength: 16,
    description: "Encrypts session cookie contents.",
  },
  SESSION_TTL_SECONDS: {
    type: "integer",
    requirement: "optional-default",
    defaultValue: "43200",
    secret: false,
    description:
      "Session absolute lifetime, in seconds. Consumed by " +
      "@superlatif/db's performDeterministicLogin (IDN-001) via DeterministicLoginDeps.sessionTtlSeconds.",
  },
  PASSWORD_RESET_TTL_SECONDS: {
    type: "integer",
    requirement: "optional-default",
    defaultValue: "1800",
    secret: false,
    description: "Password reset token lifetime.",
  },

  // --- WordPress/Sejoli bridge - production use requires OD-01/OD-02 evidence ---
  WP_BRIDGE_BASE_URL: {
    type: "url",
    requirement: "optional-no-default",
    secret: false,
    description: "WordPress bridge base URL.",
  },
  WP_BRIDGE_CLIENT_ID: {
    type: "string",
    requirement: "optional-no-default",
    secret: false,
    description: "Bridge client ID; not a credential.",
  },
  WP_BRIDGE_CLIENT_SECRET: {
    type: "string",
    requirement: "optional-no-default",
    secret: true,
    minLength: 16,
    description: "Bridge client secret.",
  },
  SEJOLI_WEBHOOK_SIGNING_SECRET: {
    type: "string",
    requirement: "optional-no-default",
    secret: true,
    minLength: 16,
    description: "Verifies Sejoli webhook signature bytes.",
  },
  SEJOLI_CHECKOUT_BASE_URL: {
    type: "url",
    requirement: "optional-no-default",
    secret: false,
    description: "Branded Sejoli checkout handoff URL.",
  },
  COMMERCE_RECONCILIATION_ENABLED: {
    type: "boolean",
    requirement: "optional-default",
    defaultValue: "false",
    secret: false,
    description: "Enables the commerce reconciliation path. Production-sensitive: defaults off.",
  },

  // --- Messaging providers (undecided; OD-03) ---
  EMAIL_PROVIDER_API_KEY: {
    type: "string",
    requirement: "optional-no-default",
    secret: true,
    minLength: 16,
    description: "Transactional email provider API key.",
  },
  EMAIL_FROM_ADDRESS: {
    type: "string",
    requirement: "optional-no-default",
    secret: false,
    description: "Sender address for transactional email.",
  },
  WHATSAPP_PROVIDER_BASE_URL: {
    type: "url",
    requirement: "optional-no-default",
    secret: false,
    description: "WhatsApp provider base URL.",
  },
  WHATSAPP_PROVIDER_API_KEY: {
    type: "string",
    requirement: "optional-no-default",
    secret: true,
    minLength: 16,
    description: "WhatsApp provider API key.",
  },
  WHATSAPP_SENDER_ID: {
    type: "string",
    requirement: "optional-no-default",
    secret: false,
    description: "WhatsApp sender identifier.",
  },

  // --- Observability (vendor undecided; OD-03; GOV-004 wires the client) ---
  OTEL_EXPORTER_OTLP_ENDPOINT: {
    type: "url",
    requirement: "optional-no-default",
    secret: false,
    description: "OTLP collector endpoint. Left unset until OD-03.",
  },
  OTEL_SERVICE_NAME: {
    type: "string",
    requirement: "optional-default",
    defaultValue: "superlatif-webapp",
    secret: false,
    description: "Service name attached to traces/metrics/logs.",
  },
  ERROR_TRACKING_DSN: {
    type: "url",
    requirement: "optional-no-default",
    secret: true,
    description: "Error-tracking provider DSN. Left unset until OD-03.",
  },
  METRICS_EXPORTER_ENDPOINT: {
    type: "url",
    requirement: "optional-no-default",
    secret: false,
    description: "Metrics exporter endpoint. Left unset until OD-03.",
  },

  // --- Security and abuse controls ---
  PII_HASHING_SECRET: {
    type: "string",
    requirement: "optional-no-default",
    secret: true,
    minLength: 16,
    description: "Keys pseudonymous/hashed PII lookups.",
  },
  AUDIT_LOG_SIGNING_SECRET: {
    type: "string",
    requirement: "optional-no-default",
    secret: true,
    minLength: 16,
    description: "Signs audit log entries.",
  },
  RATE_LIMIT_ENABLED: {
    type: "boolean",
    requirement: "optional-default",
    defaultValue: "true",
    secret: false,
    description: "Rate limiting. Safe default is on, not off.",
  },
  DEVICE_LEASE_ENFORCEMENT: {
    type: "boolean",
    requirement: "optional-default",
    defaultValue: "false",
    secret: false,
    description: "Exam writer-lease device enforcement; no exam engine exists yet.",
  },

  // --- Release controls - fail closed by default ---
  FEATURE_COMMERCE_SYNC: {
    type: "boolean",
    requirement: "optional-default",
    defaultValue: "false",
    secret: false,
    description: "Production-sensitive capability flag; must default off.",
  },
  FEATURE_LIVE_CLASS: {
    type: "boolean",
    requirement: "optional-default",
    defaultValue: "false",
    secret: false,
    description: "Production-sensitive capability flag; must default off.",
  },
  FEATURE_QUESTION_IMPORT: {
    type: "boolean",
    requirement: "optional-default",
    defaultValue: "false",
    secret: false,
    description: "Production-sensitive capability flag; must default off.",
  },
  FEATURE_EXAM_ENGINE: {
    type: "boolean",
    requirement: "optional-default",
    defaultValue: "false",
    secret: false,
    description: "Production-sensitive capability flag; must default off.",
  },
  FEATURE_LEADERBOARD: {
    type: "boolean",
    requirement: "optional-default",
    defaultValue: "false",
    secret: false,
    description: "Production-sensitive capability flag; must default off.",
  },
  FEATURE_NOTIFICATIONS: {
    type: "boolean",
    requirement: "optional-default",
    defaultValue: "false",
    secret: false,
    description: "Production-sensitive capability flag; must default off.",
  },
  SKD_PRODUCTION_ACTIVATION: {
    type: "boolean",
    requirement: "optional-default",
    defaultValue: "false",
    secret: false,
    description: "Ranked SKD production activation. Blocked by OD-04/OD-07/OD-08 until closed.",
  },
  PRODUCTION_WRITES_ENABLED: {
    type: "boolean",
    requirement: "optional-default",
    defaultValue: "false",
    secret: false,
    description: "Master switch for production-effect writes.",
  },

  // --- Test-only ---
  TEST_FIXTURE_SEED: {
    type: "string",
    requirement: "optional-default",
    defaultValue: "superlatif-synthetic-v1",
    secret: false,
    description: "Deterministic fixture seed. Never a production secret by contract.",
  },
} as const satisfies Record<string, EnvField>;

export type EnvName = keyof typeof ENV_SPEC;

/** Variable names whose value must never reach a client bundle or a log line. */
export const SECRET_ENV_NAMES: readonly EnvName[] = (Object.keys(ENV_SPEC) as EnvName[]).filter(
  (name) => ENV_SPEC[name].secret,
);

/** Production-sensitive capability flags that acceptance criterion #2 covers. */
export const PRODUCTION_SENSITIVE_FLAG_NAMES: readonly EnvName[] = [
  "FEATURE_COMMERCE_SYNC",
  "FEATURE_LIVE_CLASS",
  "FEATURE_QUESTION_IMPORT",
  "FEATURE_EXAM_ENGINE",
  "FEATURE_LEADERBOARD",
  "FEATURE_NOTIFICATIONS",
  "SKD_PRODUCTION_ACTIVATION",
  "PRODUCTION_WRITES_ENABLED",
];
