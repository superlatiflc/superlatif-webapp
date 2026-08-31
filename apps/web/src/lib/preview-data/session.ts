// Demo session cookie (UI Preview Track) - NOT authentication.
//
// This is a clearly-labeled placeholder, the same "development/demo seam,
// clearly named so nobody mistakes it for one" discipline `/home`'s own
// `?userId=` dev seam already established (ADR-052) - it does not decide
// or gate anything a real session would; it only remembers that the demo
// login form was submitted, so /preview/* pages can greet "Calon Siswa"
// and redirect an unauthenticated visitor back to /preview/login. No
// credential is checked, no password is stored, no real user account is
// involved - this cookie carries a fixed, non-secret literal value only.
//
// Real replacement, once auth exists (IDN-002 bridge, still blocked):
// a real session cookie set by the actual login/bridge-exchange flow,
// read by real middleware/route handlers - not this file.

import { cookies } from "next/headers";

const PREVIEW_SESSION_COOKIE = "slf_preview_session";

export async function hasPreviewSession(): Promise<boolean> {
  const store = await cookies();
  return store.get(PREVIEW_SESSION_COOKIE)?.value === "demo";
}

export async function setPreviewSession(): Promise<void> {
  const store = await cookies();
  store.set(PREVIEW_SESSION_COOKIE, "demo", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4, // 4 hours - a preview session, not a real one
  });
}

export async function clearPreviewSession(): Promise<void> {
  const store = await cookies();
  store.delete(PREVIEW_SESSION_COOKIE);
}
