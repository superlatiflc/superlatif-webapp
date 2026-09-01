import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState } from "@superlatif/ui";
import { getSessionUserId } from "../../lib/session.ts";
import { signOutAction } from "../signin/actions.ts";

export const metadata: Metadata = {
  title: "Tryout | Superlatif",
};

// Production tryout entry point. A batch catalogue/listing service does not
// exist yet (EXM-002 built batch persistence + server-derived state, but no
// "which batches may this learner see" query) - building one would be a new
// domain capability, out of this slice's scope. This page therefore only
// routes a learner to a batch they already know the code of, via
// /tryouts/[batchCode], and says so honestly rather than rendering an empty
// list that looks broken.

export default async function TryoutsPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/signin");

  return (
    <main className="slf-page">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <h1 className="slf-section-title" style={{ margin: 0 }}>
          Tryout
        </h1>
        <form action={signOutAction}>
          <button type="submit" className="slf-button slf-button--secondary">
            Keluar
          </button>
        </form>
      </header>

      <EmptyState
        title="Katalog tryout belum tersedia"
        body="Daftar tryout yang bisa kamu ikuti akan muncul di sini. Untuk saat ini, buka tryout lewat tautan yang diberikan pengajarmu."
      />
    </main>
  );
}
