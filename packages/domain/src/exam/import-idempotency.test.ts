import { describe, expect, it } from "vitest";
import { resolveImportRowIntent } from "./import-idempotency.ts";

describe("resolveImportRowIntent", () => {
  it("a brand new question_code always creates", () => {
    expect(resolveImportRowIntent({ existingLatestVersionStatus: null, jobMode: "update_draft" })).toEqual({
      kind: "create",
    });
    expect(resolveImportRowIntent({ existingLatestVersionStatus: null, jobMode: "create_revision" })).toEqual(
      {
        kind: "create",
      },
    );
  });

  it("an existing draft/changes_requested code updates in place only under update_draft mode", () => {
    expect(resolveImportRowIntent({ existingLatestVersionStatus: "draft", jobMode: "update_draft" })).toEqual(
      {
        kind: "update_draft",
      },
    );
    expect(
      resolveImportRowIntent({ existingLatestVersionStatus: "changes_requested", jobMode: "update_draft" }),
    ).toEqual({ kind: "update_draft" });
  });

  it("an existing unlocked code under create_revision mode is skipped, not silently mutated", () => {
    expect(
      resolveImportRowIntent({ existingLatestVersionStatus: "draft", jobMode: "create_revision" }),
    ).toEqual({
      kind: "skip",
      reasonCode: "unlocked_requires_update_draft",
    });
  });

  it("a locked (approved/published/archived) code is never overwritten - only create_revision", () => {
    for (const status of ["approved", "published", "archived"] as const) {
      expect(
        resolveImportRowIntent({ existingLatestVersionStatus: status, jobMode: "create_revision" }),
      ).toEqual({
        kind: "create_revision",
      });
      expect(
        resolveImportRowIntent({ existingLatestVersionStatus: status, jobMode: "update_draft" }),
      ).toEqual({
        kind: "skip",
        reasonCode: "locked_requires_create_revision",
      });
    }
  });
});
