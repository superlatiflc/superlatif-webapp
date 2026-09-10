// Production gate for the UI Preview Track (`/preview/*`).
//
// The preview routes serve entirely synthetic fixture data behind a demo
// cookie that is explicitly "NOT authentication" (lib/preview-data/session.ts).
// They are useful in development and staging and they hold no real data, but
// the production bring-up found them publicly reachable on the real
// production URL - a fake product surface next to the real one. This gate
// keeps them out of production without deleting them.
//
// Deliberately the same shape as dev-login.ts's isDevLoginEnabled(): a raw
// APP_ENV check, not parseEnv. `/preview/login` is statically prerendered, so
// this runs during `next build`; CI builds carry no APP_ENV at all, and a
// full parseEnv there would fail the build for an unrelated reason.

type Env = Readonly<Record<string, string | undefined>>;

export function isPreviewSurfaceEnabled(env: Env = process.env): boolean {
  return env["APP_ENV"] !== "production";
}
