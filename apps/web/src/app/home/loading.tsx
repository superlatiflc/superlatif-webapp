import { Skeleton } from "@superlatif/ui";

// dok 09 §6.1: "Gunakan skeleton yang menyerupai struktur akhir, bukan
// spinner satu halaman." Next.js renders this automatically while
// HomePage's async data fetch is in flight.

export default function HomeLoading() {
  return (
    <main className="slf-page" aria-busy="true">
      <Skeleton height={20} width="40%" label="Memuat sapaan" />
      <div>
        <Skeleton height={24} width="30%" label="Memuat judul" />
        <Skeleton height={160} label="Memuat program utama" />
      </div>
      <div>
        <Skeleton height={24} width="30%" label="Memuat judul" />
        <Skeleton height={120} label="Memuat aktivitas berikutnya" />
      </div>
    </main>
  );
}
