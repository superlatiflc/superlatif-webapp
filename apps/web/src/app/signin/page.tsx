import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState } from "@superlatif/ui";
import { getSessionUserId } from "../../lib/session.ts";
import { isDevLoginEnabled } from "../../lib/dev-login.ts";
import { isStudentLoginAvailable, wordpressLostPasswordUrl } from "../../lib/bridge/config.ts";
import { sanitizeReturnPath } from "../../lib/bridge/return-path.ts";
import { devSignInAction } from "./actions.ts";

export const metadata: Metadata = {
  title: "Masuk | Superlatif",
};

const ERROR_COPY: Record<string, string> = {
  handle: "Masukkan nama pengguna yang valid (maksimal 64 karakter).",
  conflict:
    "Identitas ini cocok dengan lebih dari satu akun, jadi kami tidak menautkannya otomatis. Hubungi tim dukungan untuk penyelesaian.",
  // Deliberately says nothing about which limit was reached, how many
  // attempts remain, or whether this nama pengguna exists - a throttle
  // message must not become a user-existence oracle (P0-3).
  rate_limited: "Terlalu banyak percobaan. Coba lagi beberapa saat.",
  // One message for every code problem (unknown, expired, reused, wrong
  // state): distinguishing them would only help someone probing codes.
  bridge: "Proses masuk tidak selesai atau sudah kedaluwarsa. Silakan masuk lagi.",
  bridge_unavailable:
    "Layanan akun Superlatif sedang tidak dapat dihubungi. Progres dan akses kamu tetap aman - coba lagi beberapa saat lagi.",
};

interface PageProps {
  readonly searchParams: Promise<{ readonly error?: string; readonly next?: string }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  if (await getSessionUserId()) redirect("/tryouts");

  const { error, next } = await searchParams;
  const studentLogin = isStudentLoginAvailable();
  const devLogin = isDevLoginEnabled();

  if (!studentLogin && !devLogin) {
    return (
      <main className="slf-page">
        <EmptyState
          title="Masuk belum tersedia"
          body="Jalur masuk akun produksi sedang disiapkan. Progres dan akses kamu tetap aman; coba lagi nanti atau hubungi tim dukungan."
        />
      </main>
    );
  }

  const startHref = `/auth/bridge/start?next=${encodeURIComponent(sanitizeReturnPath(next))}`;
  const lostPasswordUrl = studentLogin ? wordpressLostPasswordUrl() : null;

  return (
    <main className="slf-page">
      {devLogin ? <span className="slf-preview-badge">Lingkungan pengembangan</span> : null}
      <h1 className="slf-section-title">Masuk</h1>

      {error && ERROR_COPY[error] ? (
        <p className="slf-empty-state__body" role="alert">
          {ERROR_COPY[error]}
        </p>
      ) : null}

      {studentLogin ? (
        <section className="slf-onboarding-step" style={{ gap: "1rem" }} aria-labelledby="signin-account">
          <h2 id="signin-account" className="slf-empty-state__title">
            Akun Superlatif
          </h2>
          <p className="slf-empty-state__body">
            Gunakan akun yang sama dengan yang kamu pakai di superlatif.id. Kamu akan diarahkan ke halaman
            masuk Superlatif, lalu kembali ke sini secara otomatis.
          </p>
          {/* A plain link, not next/link: a prefetch must never start a sign-in attempt. */}
          <a className="slf-button slf-button--primary" href={startHref}>
            Masuk dengan akun Superlatif
          </a>
          {lostPasswordUrl ? (
            <p className="slf-empty-state__body">
              Lupa kata sandi? <a href={lostPasswordUrl}>Atur ulang di superlatif.id</a>.
            </p>
          ) : null}
        </section>
      ) : null}

      {devLogin ? (
        <section className="slf-onboarding-step" style={{ gap: "1rem" }} aria-labelledby="signin-dev">
          <h2 id="signin-dev" className="slf-empty-state__title">
            Masuk pengembangan
          </h2>
          <p className="slf-empty-state__body">
            Masuk dengan nama pengguna untuk melanjutkan ke tryout. Sesi ini nyata dan tersimpan di server,
            tetapi jalur ini tidak pernah tersedia di produksi.
          </p>
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
        </section>
      ) : null}
    </main>
  );
}
