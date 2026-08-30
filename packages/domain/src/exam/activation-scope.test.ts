import { describe, expect, it } from "vitest";
import {
  assertActivationScopeNotProduction,
  ProductionActivationNotPermittedError,
} from "./activation-scope.ts";

describe("assertActivationScopeNotProduction - the hard OD-04 gate", () => {
  it("allows draft_only and staging", () => {
    expect(() => assertActivationScopeNotProduction("draft_only")).not.toThrow();
    expect(() => assertActivationScopeNotProduction("staging")).not.toThrow();
  });

  it("refuses production unconditionally", () => {
    expect(() => assertActivationScopeNotProduction("production")).toThrow(
      ProductionActivationNotPermittedError,
    );
  });
});
