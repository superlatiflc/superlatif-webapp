# 17 — Exam Blueprints dan Scoring Policies

**Versi:** 1.0-RC2  
**Status:** Domain contract; hanya SKD Kedinasan ditargetkan production-ready pada MVP  
**Regulatory cut-off:** 27 Agustus 2026

## 1. Prinsip

Satu core exam engine mendukung banyak blueprint. Blueprint bukan enum sederhana dan tidak menyatakan seluruh exam family memiliki format sama.

1. Setiap blueprint memiliki stable code dan immutable version.
2. Aturan tahun/institusi/kategori tidak di-hardcode ke core.
3. Source regulasi, review date, reviewer, dan evidence disimpan.
4. Hasil historis selalu memakai snapshot aturan saat attempt.
5. Dukungan schema tidak berarti sebuah family boleh dipasarkan/diaktifkan.
6. Skor simulasi tidak diklaim identik dengan skor resmi bila formula tidak dipublikasikan.

## 2. Blueprint schema konseptual

### Identity

- code, family, version, status;
- title, year, institution/scope;
- language/timezone;
- regulatory source references;
- academic and technical approval.

### Structure

- sections/subtests and order;
- question count/composition constraints;
- allowed question types;
- shared stimuli;
- section/global timing;
- navigation and review rules;
- break/transition policy.

### Presentation

- fixed question order dari immutable form pada ranked MVP;
- option order `fixed` atau `question_policy`; urutan yang benar-benar disajikan selalu dipersist;
- calculator/reference policy;
- media/formula capability;
- accessibility accommodations.

### Kosakata artefak kanonik

| Field/nilai | Arti |
|---|---|
| `activationScope=draft_only` | Boleh diauthor/import, tidak dapat dipublish ke staging/production. |
| `activationScope=staging` | Boleh dipakai pada environment non-production untuk fixture/UAT. |
| `activationScope=production` | Hanya sah bila approval status `active` dan seluruh activation gate lulus. |
| `presentation.questionOrder=fixed` | Form menentukan urutan soal; tidak ada pool selection/random per attempt pada MVP. |
| `presentation.optionOrder=question_policy` | Setiap question version menentukan apakah opsi aman diacak; hasil order dipersist. |
| `persistPresentedOrder=true` | Resume/re-score membaca urutan tersimpan, bukan menghitung ulang. |
| `watermarkMode` | `none`, `learner_id`, atau `session_code`; tidak boleh menutupi stem/opsi atau menjadi satu-satunya kontrol kebocoran. |
| `timing.policyPrecedence` | `attempt_accommodation`, lalu `batch_attempt_policy`, lalu `blueprint_default`. |

Semantic validator publication wajib menegakkan: bila `timing.mode=per_section`, setiap section mempunyai `durationSeconds` dan jumlah seluruh durasi section sama dengan `timing.totalDurationSeconds`. Standard JSON Schema tidak dapat membandingkan jumlah array secara portabel, sehingga invariant ini dijalankan validator domain dan contract test, bukan dibiarkan sebagai asumsi.

### Scoring

- scoring policy version;
- scorer per section/question type;
- maximum/minimum;
- unanswered/invalid handling;
- threshold/category rules;
- total aggregation;
- tie-break/ranking;
- score display/disclaimer.

### Result

- provisional/final/review release;
- section/total display;
- explanation policy;
- interpretation and remediation mapping.

## 3. Activation gate

| Gate | Evidence |
|---|---|
| Regulatory | Source resmi dan tanggal review |
| Academic | Owner menyetujui structure, taxonomy, dan scoring fixtures |
| Technical | JSON schema, serializer, scorer, and E2E tests pass |
| Content | Form composition dan moderation complete |
| UX | Mobile, accessibility, timer/navigation UAT |
| Operations | Load test, monitoring, support/correction runbook |

## 4. SKD Sekolah Kedinasan

### Status 2026

BKN telah mengumumkan jadwal SKD CAT BKN Sekolah Kedinasan 2026 pada 22 September–7 Oktober 2026. Pada regulatory cut-off dokumen ini, nilai ambang batas 2026 belum boleh diasumsikan dari tahun sebelumnya. Sumber resmi yang harus dipantau: BKN/SSCASN dan JDIH Kementerian PANRB.

References:

- https://www.bkn.go.id/kepala-bkn-pantau-jadwalnya-pendaftaran-seleksi-sekolah-kedinasan-tahun-2026-dimulai-18-agustus/
- https://sscasn.bkn.go.id/
- https://jdih.menpan.go.id/

### Draft section model

| Section | Question style | Scorer capability |
|---|---|---|
| TWK | Single choice | Binary/correct score configurable |
| TIU | Single choice, image/formula possible | Binary/correct score configurable |
| TKP | Situational weighted option | Per-option integer/decimal weight configurable |

Question count, duration, correct score, maximum, and threshold belong to blueprint/scoring version. Nilai maksimum historis bukan passing grade.

### Category rules

Policy harus dapat mewakili:

- general category;
- affirmation/special categories;
- per-section threshold;
- total threshold;
- minimum selected section;
- ranked quota setelah threshold;
- no-threshold/simulation mode.

### SKD scoring fixture examples

Fixture tidak memakai angka regulasi 2026 sebelum terbit.

```json
{
  "fixture": "weighted-and-binary-smoke-test",
  "inputs": {
    "TWK-001": "B",
    "TIU-001": "A",
    "TKP-001": "D"
  },
  "questionScoring": {
    "TWK-001": {"correctOption": "B", "correctScore": 5, "incorrectScore": 0},
    "TIU-001": {"correctOption": "C", "correctScore": 5, "incorrectScore": 0},
    "TKP-001": {"weights": {"A": 1, "B": 2, "C": 4, "D": 5, "E": 3}}
  },
  "expected": {"TWK": 5, "TIU": 0, "TKP": 5, "total": 10}
}
```

Angka fixture menguji engine, bukan mengklaim regulasi.

## 5. CPNS SKD

- Blueprint terpisah dari Sekolah Kedinasan meski sama-sama dapat memakai CAT BKN dan TWK/TIU/TKP.
- Category dan threshold mengikuti keputusan resmi tahun pengadaan.
- Form, interpretation, and catalogue tidak memakai label `ASN universal`.
- Production activation menunggu campaign/business scope dan regulatory review.

## 6. PPPK

PPPK tidak dimodelkan sebagai satu blueprint generik. Dibutuhkan scope per jenis seleksi/jabatan dan tahun.

Capabilities:

- competency sections configurable;
- weighted/scaled scoring adapter;
- situational items;
- category and threshold policy;
- institutional interpretation.

Status MVP: schema-ready, feature disabled.

## 7. TPA dan TBI Kedinasan

- Satu blueprint per institusi/tahun bila format berbeda.
- Target seperti `400` disimpan sebagai target program Superlatif kecuali ada source resmi sebagai threshold.
- Scoring adapter dapat mendukung raw score, scaled estimate, negative marking, and section threshold.
- Label student menjelaskan bila skor adalah simulasi.

## 8. UTBK–SNBT

Framework resmi SNPMB 2026 memisahkan Tes Potensi Skolastik dan Tes Literasi dengan subtes yang dipublikasikan pada situs resmi SNPMB.

Reference: https://snpmb.id/fr/

Capabilities yang diperlukan:

- ordered subtests;
- section timer dan transition policy;
- shared passages;
- single/complex response bila relevan;
- section score dan total estimate;
- percentile by Superlatif cohort;
- disclaimer `Skor estimasi/simulasi Superlatif`.

Formula resmi yang tidak dipublikasikan tidak direkayasa seolah sama dengan UTBK resmi. Status MVP: design-ready, disabled.

## 9. TKA SMA/MA/SMK

Sumber resmi menyatakan TKA adalah asesmen akademik dengan kerangka per mata pelajaran. Untuk jenjang SMA/sederajat, program onboarding perlu mengakomodasi mata pelajaran wajib dan pilihan sesuai ketentuan yang berlaku.

References:

- https://pusmendik.kemendikdasmen.go.id/tka/
- https://pusmendik.kemendikdasmen.go.id/tka/page/download
- https://pusatinformasi.rumahpendidikan.kemendikdasmen.go.id/hc/id/articles/52474902769689-Kenali-Tes-Kemampuan-Akademik-TKA

Capabilities:

- subject-level blueprint;
- required and elective subject selection;
- single choice and complex choice;
- true/false categories if source framework requires;
- score per subject;
- competency analytics;
- source/version by official framework.

Status MVP: import/schema-ready; student type UI dan scoring fixtures harus lulus gate sebelum activation.

## 10. Ujian Mandiri PTN

Setiap institusi/tahun adalah blueprint tersendiri. Capability:

- custom sections;
- global/section timer;
- negative/no-negative scoring;
- navigation restrictions;
- form composition;
- institution-specific disclaimer.

Tidak ada `Mandiri PTN universal` di catalogue atau code.

## 11. Scorer types

| Scorer | Input | Output |
|---|---|---|
| Binary choice | selected/correct option, scores | question score |
| Weighted option | selected option → weight | question score |
| Multiple response | selected set, exact/partial policy | question score |
| True/false matrix | statement responses | per-item/aggregate |
| Numeric | value, tolerance/range/unit | question score |
| Negative marking | correct/incorrect/unanswered weights | question score |
| External scaled estimate | raw subscores + versioned transform | labeled estimate |

Scorer registry memakai stable identifiers; implementation version dan policy config ikut checksum result.

## 12. Threshold engine

Threshold expression MVP mendukung:

- section score `>=` value;
- total score `>=` value;
- selected section minimum;
- AND/OR kelompok terbatas;
- category-specific rule;
- effective date/version;
- no threshold.

Rule divalidasi terhadap section IDs dan maximum scores. UI tidak menginterpretasi threshold sendiri.

## 13. Interpretation dan remediation

Interpretation dipisahkan dari score:

- official pass evaluation, jika source dan version valid;
- Superlatif learning target;
- cohort percentile;
- topic mastery heuristic;
- recommended resource/track.

Tidak ada diagnosis psikologis otomatis dari TKP atau situational items.

## 14. Blueprint publish checklist

- [ ] Stable code/year/scope benar.
- [ ] Official sources dan review date tersedia.
- [ ] Sections, counts, timing, navigation lengkap.
- [ ] Question types supported di runner/import.
- [ ] Scoring policy dan maximum consistent.
- [ ] Threshold categories and labels reviewed.
- [ ] Student disclaimer correct.
- [ ] Fixtures boundary/empty/perfect/weighted pass.
- [ ] Form composition validation pass.
- [ ] Academic and technical approvals recorded.

## 15. Required test fixtures

- unanswered all;
- all correct/max;
- all lowest weighted;
- mixed sections;
- threshold exactly at/below/above;
- category override;
- invalid answer payload;
- corrected question weight;
- deterministic re-score;
- disclaimer/display serialization.

## 16. Regulatory update workflow

1. Monitor official source.
2. Capture source URL/document/checksum/date.
3. Academic review and compare with current version.
4. Create new blueprint/scoring version.
5. Run fixtures/UAT.
6. Assign only future forms/batches unless correction is formally approved.
7. Notify stakeholders and document ADR/change log.

## 17. Prohibited implementation

- Hardcode passing grade in UI.
- Reuse previous-year threshold automatically.
- Edit blueprint snapshot attached to attempts.
- Call raw score an official score without proof.
- Activate family because enums/types compile.
- Expose TKP weights before review release.

## 18. Open decisions

### Audit resolution RC2

Ranked blueprint hanya menerima fixed question order dari immutable form. Pool/selection rule dan `random_per_attempt` tidak ada pada kontrak MVP. Ranking memaksa `scheduled_after_review|manual`, human review, serta attempt rule dari batch. Exam family code extensible, tetapi `activation_scope` mencegah family draft menjadi production-active. Kunci/pembahasan default tertutup.

- Official 2026 SKD threshold and category source when published.
- First institution-specific TPA/TBI blueprint.
- TKA activation phase and elective change policy.
- SNBT estimated scoring methodology, only after research/validation.
