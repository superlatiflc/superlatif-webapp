import type { Metadata } from "next";
import { demoLoginAction } from "../actions.ts";

// UI Preview Track - demo login (dok 07 has no canonical /login route yet;
// this is a preview-only placeholder, see lib/preview-data/session.ts).
// The form fields below are decorative - no identity is checked or stored,
// only a fixed "demo" session cookie is set. This is honest about what it
// is ("Mode pratinjau — bukan akun sungguhan"), not a bypass of any real
// control, because no real control exists yet for this flow to bypass.

export const metadata: Metadata = {
  title: "Masuk (Mode Pratinjau) | Superlatif",
};

export default function PreviewLoginPage() {
  return (
    <main className="slf-page">
      <span className="slf-preview-badge">Mode pratinjau — bukan akun sungguhan</span>
      <h1 className="slf-section-title">Masuk sebagai siswa demo</h1>
      <p className="slf-empty-state__body">
        Halaman ini menunjukkan pengalaman siswa Superlatif memakai data simulasi. Tidak ada akun sungguhan
        yang dibuat dan tidak ada data pribadi yang disimpan.
      </p>

      <form action={demoLoginAction} className="slf-onboarding-step" style={{ gap: "1rem" }}>
        <div className="slf-form-field">
          <label htmlFor="preview-name">Nama (opsional, hanya untuk sapaan)</label>
          <input id="preview-name" name="name" type="text" placeholder="Calon Siswa" autoComplete="off" />
        </div>
        <div className="slf-form-field">
          <label htmlFor="preview-email">Email (opsional, tidak disimpan)</label>
          <input
            id="preview-email"
            name="email"
            type="email"
            placeholder="nama@contoh.com"
            autoComplete="off"
          />
        </div>
        <button type="submit" className="slf-button slf-button--primary">
          Masuk (mode pratinjau)
        </button>
      </form>
    </main>
  );
}
