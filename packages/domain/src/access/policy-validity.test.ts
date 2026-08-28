import { describe, expect, it } from "vitest";
import {
  InvalidValidityConfigError,
  computeValidityWindow,
  resolveActivatedWindow,
} from "./policy-validity.ts";

const ISSUED_AT = new Date("2026-08-01T00:00:00.000Z");

describe("fixed_window", () => {
  it("uses the exact configured start/end", () => {
    const window = computeValidityWindow(
      { mode: "fixed_window", startsAt: "2026-08-01T00:00:00Z", endsAt: "2026-12-31T23:59:59Z" },
      { issuedAt: ISSUED_AT },
    );
    expect(window.validFrom?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(window.validTo?.toISOString()).toBe("2026-12-31T23:59:59.000Z");
    expect(window.pendingActivation).toBe(false);
  });

  it("rejects a missing startsAt/endsAt", () => {
    expect(() => computeValidityWindow({ mode: "fixed_window" }, { issuedAt: ISSUED_AT })).toThrow(
      InvalidValidityConfigError,
    );
  });

  it("rejects endsAt at or before startsAt", () => {
    expect(() =>
      computeValidityWindow(
        { mode: "fixed_window", startsAt: "2026-08-01T00:00:00Z", endsAt: "2026-08-01T00:00:00Z" },
        { issuedAt: ISSUED_AT },
      ),
    ).toThrow(/endsAt must be after/);
  });
});

describe("duration_after_purchase", () => {
  it("starts at issuance and ends durationDays later", () => {
    const window = computeValidityWindow(
      { mode: "duration_after_purchase", durationDays: 30 },
      { issuedAt: ISSUED_AT },
    );
    expect(window.validFrom?.toISOString()).toBe(ISSUED_AT.toISOString());
    expect(window.validTo?.toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });

  it("rejects a missing or non-positive durationDays", () => {
    expect(() => computeValidityWindow({ mode: "duration_after_purchase" }, { issuedAt: ISSUED_AT })).toThrow(
      InvalidValidityConfigError,
    );
    expect(() =>
      computeValidityWindow({ mode: "duration_after_purchase", durationDays: 0 }, { issuedAt: ISSUED_AT }),
    ).toThrow(InvalidValidityConfigError);
  });
});

describe("duration_after_activation", () => {
  it("has no window yet at issuance - pendingActivation is true", () => {
    const window = computeValidityWindow(
      { mode: "duration_after_activation", durationDays: 14 },
      { issuedAt: ISSUED_AT },
    );
    expect(window.validFrom).toBeNull();
    expect(window.validTo).toBeNull();
    expect(window.pendingActivation).toBe(true);
  });

  it("still validates durationDays eagerly, so a bad policy fails at publish time", () => {
    expect(() =>
      computeValidityWindow({ mode: "duration_after_activation" }, { issuedAt: ISSUED_AT }),
    ).toThrow(InvalidValidityConfigError);
  });

  it("resolveActivatedWindow anchors the window to the activation instant", () => {
    const activatedAt = new Date("2026-09-01T00:00:00.000Z");
    const window = resolveActivatedWindow(
      { mode: "duration_after_activation", durationDays: 14 },
      activatedAt,
    );
    expect(window.validFrom?.toISOString()).toBe(activatedAt.toISOString());
    expect(window.validTo?.toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });

  it("resolveActivatedWindow rejects a mismatched mode", () => {
    expect(() => resolveActivatedWindow({ mode: "lifetime" }, ISSUED_AT)).toThrow(/only applies to/);
  });
});

describe("through_program_or_batch_end", () => {
  it("requires an explicit lifecycleEndsAt (no program/batch table exists yet)", () => {
    expect(() =>
      computeValidityWindow({ mode: "through_program_or_batch_end" }, { issuedAt: ISSUED_AT }),
    ).toThrow(/lifecycleEndsAt is required/);
  });

  it("uses the supplied lifecycle end when present", () => {
    const lifecycleEndsAt = new Date("2027-06-30T00:00:00.000Z");
    const window = computeValidityWindow(
      { mode: "through_program_or_batch_end" },
      { issuedAt: ISSUED_AT, lifecycleEndsAt },
    );
    expect(window.validFrom?.toISOString()).toBe(ISSUED_AT.toISOString());
    expect(window.validTo?.toISOString()).toBe(lifecycleEndsAt.toISOString());
  });
});

describe("lifetime", () => {
  it("starts at issuance and never ends", () => {
    const window = computeValidityWindow({ mode: "lifetime" }, { issuedAt: ISSUED_AT });
    expect(window.validFrom?.toISOString()).toBe(ISSUED_AT.toISOString());
    expect(window.validTo).toBeNull();
  });
});

describe("manual", () => {
  it("defaults start to issuance and end to open-ended when not supplied", () => {
    const window = computeValidityWindow({ mode: "manual" }, { issuedAt: ISSUED_AT });
    expect(window.validFrom?.toISOString()).toBe(ISSUED_AT.toISOString());
    expect(window.validTo).toBeNull();
  });

  it("honors an explicit manual start/end", () => {
    const manualStartsAt = new Date("2026-09-01T00:00:00.000Z");
    const manualEndsAt = new Date("2026-10-01T00:00:00.000Z");
    const window = computeValidityWindow(
      { mode: "manual" },
      { issuedAt: ISSUED_AT, manualStartsAt, manualEndsAt },
    );
    expect(window.validFrom?.toISOString()).toBe(manualStartsAt.toISOString());
    expect(window.validTo?.toISOString()).toBe(manualEndsAt.toISOString());
  });

  it("rejects a manual end at or before manual start", () => {
    const instant = new Date("2026-09-01T00:00:00.000Z");
    expect(() =>
      computeValidityWindow(
        { mode: "manual" },
        { issuedAt: ISSUED_AT, manualStartsAt: instant, manualEndsAt: instant },
      ),
    ).toThrow(/endsAt must be after/);
  });
});
