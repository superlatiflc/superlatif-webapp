// Access policy validity computation (ENT-001).
//
// 05_PRODUCT_CATALOG_AND_ENTITLEMENT.md §8.3 and the reviewed
// contracts/entitlement-policy.schema.json "validity" def name six modes.
// This computes the grant's validFrom/validTo window at ISSUANCE time for
// every mode except duration_after_activation, whose start anchors to a
// separate "activated" event recorded later (packages/db/src/access -
// nothing here reads a database).
//
// through_program_or_batch_end needs an actual program/batch lifecycle
// table this repository does not have yet (PRG/EXM series). Rather than
// fabricate one, this mode requires the caller to supply the resolved
// lifecycle end explicitly (`lifecycleEndsAt`) - see ADR-047.

export type ValidityMode =
  | "fixed_window"
  | "duration_after_purchase"
  | "duration_after_activation"
  | "through_program_or_batch_end"
  | "lifetime"
  | "manual";

export interface ValidityConfig {
  readonly mode: ValidityMode;
  readonly startsAt?: string | null;
  readonly endsAt?: string | null;
  readonly durationDays?: number | null;
}

export interface ValidityContext {
  /** Server time the grant is being issued at. */
  readonly issuedAt: Date;
  /** Required only for through_program_or_batch_end (see module doc). */
  readonly lifecycleEndsAt?: Date | null;
  /** Required only for manual mode. */
  readonly manualStartsAt?: Date | null;
  readonly manualEndsAt?: Date | null;
}

export interface ValidityWindow {
  /** Null means the window has no fixed start yet (duration_after_activation, pending first use). */
  readonly validFrom: Date | null;
  /** Null means open-ended (lifetime, or an unbounded manual/fixed window). */
  readonly validTo: Date | null;
  /** True only for duration_after_activation before an "activated" event exists. */
  readonly pendingActivation: boolean;
}

export class InvalidValidityConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidValidityConfigError";
  }
}

function addDays(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * 86_400_000);
}

function parseRequiredDate(value: string | null | undefined, fieldName: string): Date {
  if (value === null || value === undefined) {
    throw new InvalidValidityConfigError(`${fieldName} is required for this validity mode`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidValidityConfigError(`${fieldName} is not a valid date-time: ${value}`);
  }
  return parsed;
}

function requiredDurationDays(config: ValidityConfig): number {
  if (config.durationDays === null || config.durationDays === undefined || config.durationDays <= 0) {
    throw new InvalidValidityConfigError(
      "durationDays is required and must be positive for this validity mode",
    );
  }
  return config.durationDays;
}

/** Computes the grant's validity window at issuance time. Pure: no clock read, no I/O. */
export function computeValidityWindow(config: ValidityConfig, context: ValidityContext): ValidityWindow {
  switch (config.mode) {
    case "fixed_window": {
      const validFrom = parseRequiredDate(config.startsAt, "validity.startsAt");
      const validTo = parseRequiredDate(config.endsAt, "validity.endsAt");
      if (validTo.getTime() <= validFrom.getTime()) {
        throw new InvalidValidityConfigError("validity.endsAt must be after validity.startsAt");
      }
      return { validFrom, validTo, pendingActivation: false };
    }

    case "duration_after_purchase": {
      const days = requiredDurationDays(config);
      return {
        validFrom: context.issuedAt,
        validTo: addDays(context.issuedAt, days),
        pendingActivation: false,
      };
    }

    case "duration_after_activation": {
      // Anchor is unknown until an "activated" event exists - see
      // packages/db/src/access/grant-status.ts's deriveGrantStatus, which
      // treats a grant in this mode with no activation event as scheduled.
      requiredDurationDays(config); // validate now so a bad policy fails at publish, not at first activation
      return { validFrom: null, validTo: null, pendingActivation: true };
    }

    case "through_program_or_batch_end": {
      if (!context.lifecycleEndsAt) {
        throw new InvalidValidityConfigError(
          "context.lifecycleEndsAt is required for through_program_or_batch_end " +
            "(no program/batch lifecycle table exists yet - see ADR-047)",
        );
      }
      return { validFrom: context.issuedAt, validTo: context.lifecycleEndsAt, pendingActivation: false };
    }

    case "lifetime": {
      return { validFrom: context.issuedAt, validTo: null, pendingActivation: false };
    }

    case "manual": {
      const validFrom = context.manualStartsAt ?? context.issuedAt;
      const validTo = context.manualEndsAt ?? null;
      if (validTo && validTo.getTime() <= validFrom.getTime()) {
        throw new InvalidValidityConfigError("manual endsAt must be after manual startsAt");
      }
      return { validFrom, validTo, pendingActivation: false };
    }
  }
}

/** Resolves the effective validFrom once an activation event exists, for duration_after_activation mode. */
export function resolveActivatedWindow(config: ValidityConfig, activatedAt: Date): ValidityWindow {
  if (config.mode !== "duration_after_activation") {
    throw new InvalidValidityConfigError("resolveActivatedWindow only applies to duration_after_activation");
  }
  const days = requiredDurationDays(config);
  return { validFrom: activatedAt, validTo: addDays(activatedAt, days), pendingActivation: false };
}
