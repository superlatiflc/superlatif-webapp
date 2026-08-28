# Superlatif Web App — Claude Code Starter

**Versi:** Gates 1–4 Build-Ready RC1  
**Status:** `READY_FOR_IMPLEMENTATION_PLANNING`  
**Produksi:** `NO_GO` sampai release dan external gates lulus

Repository starter ini berisi source of truth produk, UX, arsitektur, kontrak machine-readable, backlog, fixture sintetis, project instructions, dan project skills untuk memulai implementasi Superlatif Web App menggunakan Claude Code.

Belum ada application source code. Claude harus memulai dari Phase P0 dan membuat fondasi repository secara terkontrol.

## Mulai

1. Baca `START_HERE.md`.
2. Jalankan validasi starter.
3. Inisialisasi Git jika folder belum menjadi repository.
4. Buka Claude Code dari root folder ini dalam Plan Mode.
5. Gunakan isi `PROMPT_PERTAMA_CLAUDE.md`.

## Struktur

| Path | Fungsi |
|---|---|
| `CLAUDE.md` | Instruksi persistent yang dibaca Claude Code |
| `.claude/skills/` | Empat skill domain Superlatif |
| `docs/gates/` | Dokumen canonical Gates 1–4 |
| `docs/audit/` | Findings dan audit closure dari Claude |
| `docs/source/` | Instruksi awal dan deck brand Superlatif |
| `contracts/` | OpenAPI, schema, template import, dan kontrak Gate 3 |
| `planning/` | Backlog implementasi dan release-gate evidence contract |
| `test/fixtures/contracts/` | Fixture sintetis untuk contract/integration tests |
| `scripts/validate-starter.mjs` | Pemeriksaan bundle sebelum coding |
| `STARTER_VALIDATION.md` | Ringkasan pemeriksaan bundle yang dikirim |
| `.env.example` | Kontrak konfigurasi tanpa credential |

## Batas keselamatan

- Jangan mengaktifkan commerce production tanpa OD-01 dan OD-02.
- Jangan mengaktifkan ranked SKD production tanpa OD-04, academic sign-off, Gate C, dan OD-08.
- Jangan menjalankan production migration tanpa legacy evidence, rehearsal, reconciliation, dan Gate D.
- Semua fixture dalam bundle adalah sintetis dan tidak menggantikan bukti resmi/provider.
