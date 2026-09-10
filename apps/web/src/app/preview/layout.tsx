import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isPreviewSurfaceEnabled } from "../../lib/preview-gate.ts";

// Segment-root layout for every `/preview/*` page, so one check covers the
// whole synthetic surface - including routes added later. In production it
// renders the ordinary 404 rather than redirecting somewhere: the preview
// track should simply not exist there, not bounce visitors into a real page.
//
// The Server Actions in ./actions.ts carry their own guard: a layout decides
// what renders, but an action can be POSTed directly without rendering it.

export default function PreviewSurfaceLayout({ children }: { readonly children: ReactNode }) {
  if (!isPreviewSurfaceEnabled()) notFound();
  return children;
}
