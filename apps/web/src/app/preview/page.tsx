import { redirect } from "next/navigation";
import { hasPreviewSession } from "../../lib/preview-data/index.ts";

// Entry point for the UI Preview Track - routes straight to the dashboard
// if a demo session already exists, otherwise to the demo login.

export default async function PreviewIndexPage() {
  redirect((await hasPreviewSession()) ? "/preview/dashboard" : "/preview/login");
}
