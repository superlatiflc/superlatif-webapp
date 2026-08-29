// Program Hub tab visibility (PRG-001, PRG-004).
//
// dok 07 §6 "Tab kontekstual": "Tidak ada tab kosong." Ringkasan always
// shows; every other tab is conditional on a real facility existing. This
// task builds no facility data itself (no roadmap/track, schedule, batch,
// resource, community, or progress schema exists in any merged task yet) -
// every flag here defaults to false/absent until the task that owns that
// facility (PRG-002 roadmap, SCH-001 schedule, EXM-002 batches, LRN
// resources, a future community task, a future progress task) supplies a
// real value. With every flag false, this function correctly returns only
// "ringkasan" - which is the literal, provable form of "empty tabs are
// hidden" this task can demonstrate today.

export type ProgramHubTab =
  "ringkasan" | "roadmap" | "jadwal" | "tryout" | "materi" | "komunitas" | "progres";

export interface ProgramFacilities {
  readonly hasRoadmap: boolean;
  readonly hasSchedule: boolean;
  readonly hasBatchOrAttempt: boolean;
  readonly hasResource: boolean;
  readonly hasCommunity: boolean;
  readonly hasProgressOrResult: boolean;
}

export const NO_FACILITIES: ProgramFacilities = {
  hasRoadmap: false,
  hasSchedule: false,
  hasBatchOrAttempt: false,
  hasResource: false,
  hasCommunity: false,
  hasProgressOrResult: false,
};

/** Ringkasan is always first and always present; the rest follow dok 07 §6's table order, shown only when their facility flag is true. */
export function resolveProgramHubTabs(facilities: ProgramFacilities): ProgramHubTab[] {
  const tabs: ProgramHubTab[] = ["ringkasan"];
  if (facilities.hasRoadmap) tabs.push("roadmap");
  if (facilities.hasSchedule) tabs.push("jadwal");
  if (facilities.hasBatchOrAttempt) tabs.push("tryout");
  if (facilities.hasResource) tabs.push("materi");
  if (facilities.hasCommunity) tabs.push("komunitas");
  if (facilities.hasProgressOrResult) tabs.push("progres");
  return tabs;
}
