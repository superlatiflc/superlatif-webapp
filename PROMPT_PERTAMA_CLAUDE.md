# Prompt Pertama untuk Claude Code

Salin seluruh prompt berikut ke sesi Claude Code dalam Plan Mode:

```text
Anda sedang berada di root repository Superlatif Web App.

Baca terlebih dahulu:
- README.md
- START_HERE.md
- CLAUDE.md
- docs/gates/00_MASTER_README.md
- docs/gates/GATE_4_READINESS_REGISTER.md
- docs/gates/28_IMPLEMENTATION_ROADMAP.md
- docs/gates/29_CLAUDE_CODE_EXECUTION_PLAN.md
- planning/implementation-backlog.json
- planning/release-gates.json

Kemudian inspeksi struktur docs/gates, contracts, planning, test/fixtures/contracts, dan .claude/skills tanpa mengubah file.

Tujuan sesi ini hanya menyiapkan rencana Phase P0.

Kerjakan:
1. Konfirmasi urutan source of truth dan status paket.
2. Audit apakah seluruh file yang dibutuhkan untuk GOV-001 sampai GOV-004 tersedia.
3. Jalankan node scripts/validate-starter.mjs dan laporkan hasilnya.
4. Usulkan keputusan BD-01 sampai BD-06 beserta alternatif, alasan, risiko, dan lock point.
5. Susun rencana atomik untuk GOV-001, GOV-002, GOV-003, dan GOV-004.
6. Untuk setiap task, tampilkan requirement/read-set, dependency, write-set yang diperkirakan, acceptance criteria, test, dan stop condition.
7. Identifikasi keputusan yang benar-benar membutuhkan persetujuan founder/engineering lead.
8. Jangan membuat atau mengubah application source code pada sesi ini.
9. Jangan menghubungkan provider/credential/data production.
10. Jangan menutup OD-01, OD-02, OD-03, OD-04, OD-07, OD-08, atau legacy-promise gate berdasarkan asumsi.

Berhenti setelah menyampaikan rencana dan pertanyaan keputusan yang diperlukan. Tunggu persetujuan saya sebelum implementasi GOV-001.
```

Setelah rencana disetujui, gunakan prompt lanjutan:

```text
Rencana Phase P0 disetujui dengan keputusan yang sudah dicatat.

Implementasikan hanya GOV-001 dari planning/implementation-backlog.json.
Ikuti CLAUDE.md dan project skill yang relevan. Jangan mengerjakan GOV-002.

Sebelum selesai:
- penuhi seluruh acceptance criteria GOV-001;
- tambahkan dan jalankan test/validation yang relevan;
- periksa diff dan perubahan yang tidak terkait;
- catat keputusan material sebagai ADR;
- laporkan file yang berubah, test evidence, risiko, dan gate yang tetap terbuka.

Jangan melakukan deployment atau menggunakan credential/data production.
```
