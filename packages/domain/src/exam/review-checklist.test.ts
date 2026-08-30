import { describe, expect, it } from "vitest";
import {
  assertReviewChecklistComplete,
  isReviewChecklistComplete,
  ReviewChecklistIncompleteError,
  type ReviewChecklist,
} from "./review-checklist.ts";

const COMPLETE_CHECKLIST: ReviewChecklist = {
  classificationCorrect: true,
  stemClear: true,
  optionsComplete: true,
  answerScoringCorrect: true,
  explanationAdequate: true,
  mediaReadable: true,
  sourceAndRightsOk: true,
  accessibilityMetadataOk: true,
  notDuplicate: true,
};

describe("isReviewChecklistComplete", () => {
  it("is true only when every one of dok 12 §31's nine items is checked", () => {
    expect(isReviewChecklistComplete(COMPLETE_CHECKLIST)).toBe(true);
  });

  it("is false when any single item is unchecked", () => {
    for (const key of Object.keys(COMPLETE_CHECKLIST) as (keyof ReviewChecklist)[]) {
      expect(isReviewChecklistComplete({ ...COMPLETE_CHECKLIST, [key]: false })).toBe(false);
    }
  });
});

describe("assertReviewChecklistComplete", () => {
  it("does not throw for a complete checklist", () => {
    expect(() => assertReviewChecklistComplete(COMPLETE_CHECKLIST)).not.toThrow();
  });

  it("throws ReviewChecklistIncompleteError naming every incomplete item", () => {
    const checklist = { ...COMPLETE_CHECKLIST, stemClear: false, mediaReadable: false };
    try {
      assertReviewChecklistComplete(checklist);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ReviewChecklistIncompleteError);
      expect((error as ReviewChecklistIncompleteError).incompleteItems).toEqual([
        "stemClear",
        "mediaReadable",
      ]);
    }
  });
});
