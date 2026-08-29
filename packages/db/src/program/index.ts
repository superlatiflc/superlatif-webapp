export {
  createProgram,
  findProgramByCode,
  listPrograms,
  programTargetRef,
  type CreateProgramInput,
  type ProgramRow,
} from "./program-repository.ts";

export {
  ProgramNotEnrolledError,
  assertProgramAccess,
  listAccessibleProgramsForUser,
  setPrimaryProgram,
  syncProgramEnrollments,
  type EnrollmentRow,
} from "./enrollment-service.ts";

export { buildHomeViewModel, type HomeViewModel } from "./home-view-service.ts";

export {
  CircularPrerequisiteError,
  ModuleAlreadyArchivedError,
  ModuleNotFoundError,
  ProgramVersionLockedError,
  ProgramVersionNotFoundError,
  ResourceVersionNotFoundError,
  ResourceVersionNotPublishedError,
  archiveModule,
  createModule,
  createProgramVersionDraft,
  createResource,
  createResourcePlacement,
  createResourceVersion,
  createRoadmapStage,
  createTrack,
  findCurrentPublishedProgramVersion,
  findProgramVersionById,
  findResourceByCode,
  listModulesForProgramVersion,
  publishProgramVersion,
  publishResourceVersion,
  type CreateModuleInput,
  type CreateProgramVersionDraftInput,
  type CreateResourcePlacementInput,
  type CreateResourceVersionInput,
  type CreateRoadmapStageInput,
  type CreateTrackInput,
  type ModuleRow,
  type ProgramVersionRow,
  type ResourcePlacementRow,
  type ResourceRow,
  type ResourceVersionRow,
  type RoadmapStageRow,
  type TrackRow,
} from "./curriculum-repository.ts";

export {
  getProgramCurriculum,
  type CurriculumAccessResult,
  type CurriculumModuleView,
  type ProgramCurriculumView,
} from "./curriculum-service.ts";
