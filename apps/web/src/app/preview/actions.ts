"use server";

import { notFound, redirect } from "next/navigation";
import { clearPreviewSession, setPreviewSession } from "../../lib/preview-data/index.ts";
import { isPreviewSurfaceEnabled } from "../../lib/preview-gate.ts";

// Server Actions backing the UI Preview Track's demo session (see
// lib/preview-data/session.ts's own module doc: NOT authentication, a
// clearly-labeled placeholder mirroring ADR-052's `?userId=` dev seam).
//
// Each action checks the production gate itself, before touching the demo
// cookie. The preview layout hides the pages, but an action is reachable by a
// direct POST whether or not its page ever rendered.

export async function demoLoginAction(): Promise<void> {
  if (!isPreviewSurfaceEnabled()) notFound();
  await setPreviewSession();
  redirect("/preview/onboarding");
}

export async function logoutPreviewAction(): Promise<void> {
  if (!isPreviewSurfaceEnabled()) notFound();
  await clearPreviewSession();
  redirect("/preview/login");
}
