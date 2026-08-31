import type { Metadata } from "next";
import { PREVIEW_BATCH_DETAIL } from "../../../../../../lib/preview-data/index.ts";
import { AttemptPlayer } from "./AttemptPlayer.tsx";

export const metadata: Metadata = {
  title: "Mengerjakan Tryout | Superlatif",
};

interface PageProps {
  readonly params: Promise<{ readonly batchSlug: string }>;
}

export default async function PreviewAttemptPage({ params }: PageProps) {
  const { batchSlug } = await params;
  return (
    <AttemptPlayer batchSlug={batchSlug} totalDurationSeconds={PREVIEW_BATCH_DETAIL.totalDurationSeconds} />
  );
}
