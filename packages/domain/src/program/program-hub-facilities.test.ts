import { describe, expect, it } from "vitest";
import { NO_FACILITIES, resolveProgramHubTabs } from "./program-hub-facilities.ts";

describe("resolveProgramHubTabs - dok 07 §6 'Tidak ada tab kosong'", () => {
  it("shows only Ringkasan when no facility exists yet - true for this task, since no roadmap/schedule/batch/resource/community/progress schema exists", () => {
    expect(resolveProgramHubTabs(NO_FACILITIES)).toEqual(["ringkasan"]);
  });

  it("adds a tab only when its own facility flag is true, in dok 07 §6's table order", () => {
    expect(resolveProgramHubTabs({ ...NO_FACILITIES, hasRoadmap: true })).toEqual(["ringkasan", "roadmap"]);
    expect(resolveProgramHubTabs({ ...NO_FACILITIES, hasSchedule: true })).toEqual(["ringkasan", "jadwal"]);
    expect(resolveProgramHubTabs({ ...NO_FACILITIES, hasCommunity: true })).toEqual([
      "ringkasan",
      "komunitas",
    ]);
  });

  it("shows every tab when every facility is present, in the canonical order", () => {
    expect(
      resolveProgramHubTabs({
        hasRoadmap: true,
        hasSchedule: true,
        hasBatchOrAttempt: true,
        hasResource: true,
        hasCommunity: true,
        hasProgressOrResult: true,
      }),
    ).toEqual(["ringkasan", "roadmap", "jadwal", "tryout", "materi", "komunitas", "progres"]);
  });
});
