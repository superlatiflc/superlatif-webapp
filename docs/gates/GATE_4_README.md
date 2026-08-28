# Gate 4 — Build Readiness Package

**Produk:** Superlatif Web App  
**Versi:** 1.0-RC1  
**Tanggal:** 28 Agustus 2026  
**Input:** Gates 1–3 RC2 dan `RC2_AUDIT_CLOSURE_REPORT.md`  
**Keputusan paket:** `READY_FOR_IMPLEMENTATION_PLANNING`  
**Batas:** bukan izin production activation

## 1. Tujuan

Gate 4 mengubah kontrak produk, UX, data, API, dan arsitektur menjadi sistem eksekusi yang dapat dipakai tim manusia maupun Claude Code. Paket ini menjawab lima pertanyaan:

1. Bagaimana kualitas dibuktikan sebelum rilis?
2. Dalam urutan apa sistem dibangun tanpa memperbesar risiko?
3. Bagaimana Claude Code menerima task yang kecil, terlacak, dan aman?
4. Bagaimana aplikasi diluncurkan, dipantau, dipulihkan, dan dihentikan bila bermasalah?
5. Bukti apa yang wajib tersedia sebelum setiap production gate dibuka?

## 2. Isi paket

| File/folder | Fungsi |
|---|---|
| `27_QA_TESTING_AND_UAT_PLAN.md` | Strategi test, UAT, security, accessibility, load, recovery, migration, dan exit criteria |
| `28_IMPLEMENTATION_ROADMAP.md` | Urutan fase, workstream, dependency, milestone, staffing reference, dan definition of done |
| `29_CLAUDE_CODE_EXECUTION_PLAN.md` | Cara memecah backlog menjadi task Claude Code dengan read-set, write-set, test, dan stop condition |
| `30_LAUNCH_AND_OPERATIONS_RUNBOOK.md` | Deployment, monitoring, incident response, rollback, restore, support, dan launch control |
| `GATE_4_READINESS_REGISTER.md` | Status internal readiness dan external hard gate |
| `GATE_4_VALIDATION_REPORT.md` | Hasil audit struktural, traceability, konsistensi gate, dan residual risk |
| `CLAUDE.md` | Project memory dan aturan kerja persistent untuk Claude Code |
| `.claude/skills/` | Empat project skill yang dimuat hanya ketika domainnya relevan |
| `planning/implementation-backlog.json` | Backlog machine-readable dengan dependency dan gate |
| `planning/release-gates.json` | Evidence contract untuk keputusan go/no-go |
| `test/fixtures/contracts/` | Kasus domain canonical untuk contract/integration test |
| `.env.example` | Nama konfigurasi yang diperlukan tanpa credential nyata |
| `scripts/validate-starter.mjs` | Pemeriksaan deterministik struktur, JSON, fixture, dan guardrail bundle |

## 3. Cara menggunakan

### Founder/Product

Review `GATE_4_READINESS_REGISTER.md`, urutan milestone pada dokumen 28, dan owner pada release gate. Jangan menyetujui tanggal produksi hanya berdasarkan completion backlog; periksa evidence gate.

### Engineering lead

Gunakan dokumen 28 sebagai sequence, `implementation-backlog.json` sebagai task inventory, dan dokumen 27 sebagai quality contract. Provider/tooling provisional dikunci melalui ADR kickoff sebelum kode bergantung kepadanya.

### Claude Code

Letakkan `CLAUDE.md` dan folder `.claude/` pada root repository. Claude Code membaca `CLAUDE.md` sebagai project memory dan menemukan project skills di `.claude/skills/<name>/SKILL.md`. Skill dapat dipilih otomatis ketika relevan atau dipanggil langsung dengan `/skill-name` sesuai dokumentasi resmi Claude Code.

### QA/UAT/Operations

Gunakan dokumen 27 untuk evidence test dan dokumen 30 untuk rehearsal, launch command, incident log, rollback, serta handover.

Referensi resmi struktur Claude Code:

- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/claude-directory

## 4. Source of truth

Urutan tetap mengikuti Gates 1–3:

1. keputusan founder yang eksplisit dan tercatat;
2. Gate 1 product/domain contract;
3. Gate 2 UX/screen contract;
4. Gate 3 PRD dan technical contract;
5. machine-readable artifacts;
6. Gate 4 plan, backlog, fixture, dan runbook;
7. kode dan infrastructure configuration.

Gate 4 tidak boleh mengoreksi requirement tingkat atas secara diam-diam. Bila implementasi menemukan konflik, task berhenti, issue ditulis, dokumen induk diperbaiki, dan ADR dibuat sebelum kode dilanjutkan.

## 5. Status jalur

| Jalur | Planning/build non-production | Production activation |
|---|---|---|
| Program/LMS/live class | Diizinkan setelah bootstrap checks | Setelah Gate B, security/accessibility/UAT |
| Question bank/import | Diizinkan dengan synthetic media | Setelah moderation dan malware/storage controls lulus |
| Ranked exam/SKD | Diizinkan dengan blueprint staging | Ditahan OD-04, academic sign-off, Gate C, OD-07, OD-08 |
| Commerce/checkout/access sync | Adapter dan synthetic contract diizinkan | Ditahan OD-01 dan OD-02 staging evidence |
| Migration | Profiler/dry-run synthetic diizinkan | Ditahan source evidence, 05A, rehearsal, sign-off |
| Family selain SKD Kedinasan | Authoring `draft_only` | Ditahan family-specific activation gate |

## 6. Gate 4 exit criteria

Gate 4 dinyatakan selesai sebagai build-readiness package bila:

- setiap P0 requirement memiliki minimal satu test implication atau backlog task;
- setiap backlog task memiliki dependency, acceptance, test, dan gate impact;
- `CLAUDE.md` menunjuk dokumen/skill yang benar dan tidak menyimpan rahasia;
- empat skill lulus structural validation;
- seluruh JSON dan fixture lulus validator;
- runbook mempunyai owner role, trigger, diagnosis, mitigation, recovery, dan evidence;
- external hard gate tetap `OPEN/BLOCKED`, bukan ditutup dengan asumsi;
- paket dapat diekstrak tanpa file hilang atau path ambigu.

## 7. Putusan yang tidak diberikan paket ini

Paket ini tidak menetapkan harga, tanggal launch, passing grade, formula resmi pemerintah, vendor final, signature Sejoli, dasar hukum consent/retention, atau kapasitas nyata sebelum evidence tersedia.
