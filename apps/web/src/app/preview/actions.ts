"use server";

import { redirect } from "next/navigation";
import { clearPreviewSession, setPreviewSession } from "../../lib/preview-data/index.ts";

// Server Actions backing the UI Preview Track's demo session (see
// lib/preview-data/session.ts's own module doc: NOT authentication, a
// clearly-labeled placeholder mirroring ADR-052's `?userId=` dev seam).

export async function demoLoginAction(): Promise<void> {
  await setPreviewSession();
  redirect("/preview/onboarding");
}

export async function logoutPreviewAction(): Promise<void> {
  await clearPreviewSession();
  redirect("/preview/login");
}
