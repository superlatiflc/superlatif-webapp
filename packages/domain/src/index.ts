// @superlatif/domain
//
// Pure domain modules: identity, commerce, access, programs, content,
// schedules, questions, exams, attempts, results, notifications. No UI, no
// vendor SDK - node: builtins are fine (see identity/session.ts), a package
// from npm is not.
//
// Owning backlog task per subdomain; behaviour is added only by the task
// that owns it. identity/ is owned by IDN-001 onward, access/ by ENT-001
// onward.

export * as identity from "./identity/index.ts";
export * as access from "./access/index.ts";
