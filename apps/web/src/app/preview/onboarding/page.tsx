import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasPreviewSession } from "../../../lib/preview-data/index.ts";

// UI Preview Track - simplified onboarding (dok 12 C04, lightened for
// preview scope: no goal-selection persistence, no branching - just a
// short, skippable orientation before the dashboard).

export const metadata: Metadata = {
  title: "Selamat datang | Superlatif",
};

export default async function PreviewOnboardingPage() {
  if (!(await hasPreviewSession())) {
    redirect("/preview/login");
  }

  return (
    <main className="slf-page">
      <span className="slf-preview-badge">Mode pratinjau — bukan akun sungguhan</span>
      <h1 className="slf-section-title">Selamat datang di Superlatif</h1>

      <div className="slf-onboarding-steps">
        <section className="slf-onboarding-step">
          <h2 className="slf-batch-card__title">Mindset dulu, baru skillset dan toolset</h2>
          <p className="slf-empty-state__body">
            Superlatif bukan bimbel biasa. Kami membantumu membangun cara berpikir dan strategi belajar yang
            bertahan, bukan sekadar kumpulan latihan soal lepas.
          </p>
        </section>

        <section className="slf-onboarding-step">
          <h2 className="slf-batch-card__title">Satu program, satu perjalanan</h2>
          <p className="slf-empty-state__body">
            Materi, jadwal, dan tryout SKD Kedinasan kamu terhubung dalam satu roadmap. Dashboard selalu
            menunjukkan langkah berikutnya yang paling relevan.
          </p>
        </section>

        <section className="slf-onboarding-step">
          <h2 className="slf-batch-card__title">Jujur soal progres</h2>
          <p className="slf-empty-state__body">
            Skor simulasi di tryout membantumu berlatih, bukan menjanjikan kelulusan. Kami akan selalu jelas
            kapan sebuah angka bersifat estimasi.
          </p>
        </section>
      </div>

      <a className="slf-button slf-button--primary" href="/preview/dashboard">
        Mulai
      </a>
    </main>
  );
}
