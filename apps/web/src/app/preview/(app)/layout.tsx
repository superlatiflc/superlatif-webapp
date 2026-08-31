import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { DEMO_BATCH_SLUG, DEMO_STUDENT_NAME, hasPreviewSession } from "../../../lib/preview-data/index.ts";
import { logoutPreviewAction } from "../actions.ts";

// UI Preview Track shell for every guarded page (dashboard, tryouts,
// player, result, leaderboard). The guard here reads ONLY the demo
// preview-session cookie (lib/preview-data/session.ts) - it is not a real
// authorization check, matching that module's own stated scope.

export default async function PreviewAppLayout({ children }: { children: ReactNode }) {
  if (!(await hasPreviewSession())) {
    redirect("/preview/login");
  }

  return (
    <div>
      <header
        className="slf-page"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          paddingBottom: 0,
        }}
      >
        <div>
          <span className="slf-preview-badge">Mode pratinjau</span>
          <p className="slf-greeting" style={{ marginTop: "0.5rem" }}>
            Halo, {DEMO_STUDENT_NAME}
          </p>
        </div>
        <form action={logoutPreviewAction}>
          <button type="submit" className="slf-button slf-button--secondary">
            Keluar
          </button>
        </form>
      </header>

      {children}

      <nav className="slf-bottom-nav" aria-label="Navigasi pratinjau">
        <a className="slf-bottom-nav__item" href="/preview/dashboard">
          Dashboard
        </a>
        <a className="slf-bottom-nav__item" href="/preview/tryouts">
          Tryout
        </a>
        <a className="slf-bottom-nav__item" href={`/preview/tryouts/${DEMO_BATCH_SLUG}/leaderboard`}>
          Peringkat
        </a>
      </nav>
    </div>
  );
}
