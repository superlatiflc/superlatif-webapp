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
