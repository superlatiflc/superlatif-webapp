import { describe, expect, it } from "vitest";
import {
  assertSupportedPresentationPolicy,
  buildPresentedInstances,
  UnsupportedOptionOrderPolicyError,
  type FormItemInput,
} from "./attempt-presentation.ts";

describe("assertSupportedPresentationPolicy", () => {
  it("accepts questionOrder=fixed + optionOrder=fixed (the only synthetic fixture shape used anywhere in this codebase)", () => {
    expect(() =>
      assertSupportedPresentationPolicy({ questionOrder: "fixed", optionOrder: "fixed" }),
    ).not.toThrow();
  });

  it("fails closed on optionOrder=question_policy - no per-question shuffle shape is defined anywhere", () => {
    expect(() =>
      assertSupportedPresentationPolicy({ questionOrder: "fixed", optionOrder: "question_policy" }),
    ).toThrow(UnsupportedOptionOrderPolicyError);
  });

  it("fails closed on any non-fixed questionOrder (the contract itself only allows the const 'fixed')", () => {
    expect(() =>
      assertSupportedPresentationPolicy({ questionOrder: "pool", optionOrder: "fixed" }),
    ).toThrow();
  });
});

describe("buildPresentedInstances", () => {
  const items: FormItemInput[] = [
    { sectionCode: "TKP", order: 1, questionVersionId: "q-tkp-1" },
    { sectionCode: "TWK", order: 2, questionVersionId: "q-twk-2" },
    { sectionCode: "TWK", order: 1, questionVersionId: "q-twk-1" },
  ];
  const sectionOrder = ["TWK", "TKP"];
  const codes = new Map<string, readonly string[] | null>([
    ["q-twk-1", ["A", "B", "C"]],
    ["q-twk-2", ["A", "B"]],
    ["q-tkp-1", null],
  ]);

  it("orders by the BLUEPRINT's section sequence, then by item order within each section - not alphabetically", () => {
    const instances = buildPresentedInstances(items, sectionOrder, codes);
    expect(instances.map((instance) => instance.questionVersionId)).toEqual([
      "q-twk-1",
      "q-twk-2",
      "q-tkp-1",
    ]);
    expect(instances.map((instance) => instance.sequence)).toEqual([1, 2, 3]);
  });

  it("attaches each question's presented option order from the supplied map, null when absent (numeric)", () => {
    const instances = buildPresentedInstances(items, sectionOrder, codes);
    expect(
      instances.find((instance) => instance.questionVersionId === "q-twk-1")?.presentedOptionOrder,
    ).toEqual(["A", "B", "C"]);
    expect(
      instances.find((instance) => instance.questionVersionId === "q-tkp-1")?.presentedOptionOrder,
    ).toBeNull();
  });

  it("is deterministic - repeated calls on the same input produce byte-identical output", () => {
    const first = buildPresentedInstances(items, sectionOrder, codes);
    const second = buildPresentedInstances(items, sectionOrder, codes);
    expect(second).toEqual(first);
  });

  it("puts a section not present in sectionCodesInOrder last, rather than throwing", () => {
    const withUnknownSection: FormItemInput[] = [
      ...items,
      { sectionCode: "BONUS", order: 1, questionVersionId: "q-bonus-1" },
    ];
    const instances = buildPresentedInstances(withUnknownSection, sectionOrder, codes);
    expect(instances[instances.length - 1]?.questionVersionId).toBe("q-bonus-1");
  });
});
