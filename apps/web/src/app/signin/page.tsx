import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState } from "@superlatif/ui";
import { getSessionUserId } from "../../lib/session.ts";
import { isDevLoginEnabled } from "../../lib/dev-login.ts";
import { devSignInAction } from "./actions.ts";

export const metadata: Metadata = {
  title: "Masuk | Superlatif",
};

const ERROR_COPY: Record<string, string> = {
  handle: "Masukkan nama pengguna yang valid (maksimal 64 karakter).",
  conflict:
    "Identitas ini cocok dengan lebih dari satu akun, jadi kami tidak menautkannya otomatis. Hubungi tim dukungan untuk penyelesaian.",
};

interface PageProps {
  readonly searchParams: Promise<{ readonly error?: string }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  if (await getSessionUserId()) redirect("/tryouts");

  const { error } = await searchParams;

  if (!isDevLoginEnabled()) {
    return (
      <main className="slf-page">
        <EmptyState
          title="Masuk belum tersedia"
          body="Jalur masuk akun produksi sedang disiapkan. Progres dan akses kamu tetap aman; coba lagi nanti atau hubungi tim dukungan."
        />
      </main>
    );
  }

  return (
    <main className="slf-page">
      <span className="slf-preview-badge">Lingkungan pengembangan</span>
      <h1 className="slf-section-title">Masuk</h1>
      <p className="slf-empty-state__body">
        Masuk dengan nama pengguna untuk melanjutkan ke tryout. Sesi ini nyata dan tersimpan di server - jalur
        masuk lewat akun WordPress akan menggantikan halaman ini.
      </p>

      {error && ERROR_COPY[error] ? (
        <p className="slf-empty-state__body" role="alert">
          {ERROR_COPY[error]}
        </p>
      ) : null}

      <form action={devSignInAction} className="slf-onboarding-step" style={{ gap: "1rem" }}>
        <div className="slf-form-field">
          <label htmlFor="signin-handle">Nama pengguna</label>
          <input
            id="signin-handle"
            name="handle"
            type="text"
            required
            maxLength={64}
            autoComplete="username"
            placeholder="siswa-01"
          />
        </div>
        <button type="submit" className="slf-button slf-button--primary">
          Masuk
        </button>
      </form>
    </main>
  );
}
