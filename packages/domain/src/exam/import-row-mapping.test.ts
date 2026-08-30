import { describe, expect, it } from "vitest";
import {
  mapWorkbookAssetRole,
  mapWorkbookQuestionType,
  UnknownWorkbookQuestionTypeError,
  UnsupportedWorkbookAssetRoleError,
} from "./import-row-mapping.ts";

describe("mapWorkbookQuestionType", () => {
  it("maps statement_true_false to the schema's true_false", () => {
    expect(mapWorkbookQuestionType("statement_true_false")).toBe("true_false");
  });

  it("passes every other documented type through unchanged", () => {
    expect(mapWorkbookQuestionType("single_choice")).toBe("single_choice");
    expect(mapWorkbookQuestionType("weighted_choice")).toBe("weighted_choice");
    expect(mapWorkbookQuestionType("multiple_choice")).toBe("multiple_choice");
    expect(mapWorkbookQuestionType("numeric")).toBe("numeric");
  });

  it("rejects an unknown type", () => {
    expect(() => mapWorkbookQuestionType("essay")).toThrow(UnknownWorkbookQuestionTypeError);
  });
});

describe("mapWorkbookAssetRole", () => {
  it("maps passage to the schema's stimulus_body", () => {
    expect(mapWorkbookAssetRole("passage")).toBe("stimulus_body");
  });

  it("passes stem/option/explanation through unchanged", () => {
    expect(mapWorkbookAssetRole("stem")).toBe("stem");
    expect(mapWorkbookAssetRole("option")).toBe("option");
    expect(mapWorkbookAssetRole("explanation")).toBe("explanation");
  });

  it("rejects other - there is no owner column to attach it to", () => {
    expect(() => mapWorkbookAssetRole("other")).toThrow(UnsupportedWorkbookAssetRoleError);
  });
});
