// @superlatif/domain
//
// Pure domain modules: identity, commerce, access, programs, content,
// schedules, questions, exams, attempts, results, notifications. No UI, no
// vendor SDK - node: builtins are fine (see identity/session.ts), a package
// from npm is not.
//
// Owning backlog task per subdomain; behaviour is added only by the task
// that owns it. identity/ is owned by IDN-001 onward, access/ by ENT-001
// onward, commerce/ by COM-001 onward, authorization/ by IDN-004 onward.
// shared/ holds cross-domain-area pure helpers (currently: the
// canonical-JSON checksum both access/ and commerce/ use for their
// version-not-mutate discipline).

export * as identity from "./identity/index.ts";
export * as access from "./access/index.ts";
export * as commerce from "./commerce/index.ts";
export * as authorization from "./authorization/index.ts";
export * as program from "./program/index.ts";
export * as exam from "./exam/index.ts";
export * as shared from "./shared/index.ts";
