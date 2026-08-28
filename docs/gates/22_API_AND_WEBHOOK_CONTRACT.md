# 22 — API dan Webhook Contract

**Versi:** 1.0-RC2  
**Base:** `/api/v1`  
**Machine-readable subset:** `contracts/openapi.yaml`

## 1. Principles

- REST/JSON untuk browser dan integration boundary.
- Same-origin secure session untuk app; scoped service credential untuk bridge.
- Stable IDs/codes; human labels bukan identifier.
- Command yang dapat diulang memakai idempotency.
- Server time authoritative.
- Error code stabil dan terpisah dari translated message.
- Student/admin serializers terpisah.
- Pagination cursor untuk collection besar.

## 2. Common headers

### Request

- `X-Request-ID` optional; server membuat bila tidak ada.
- `Idempotency-Key` required pada command yang ditandai.
- `If-Match` untuk optimistic concurrency/version commands tertentu.
- `Content-Type: application/json`.

### Response

- `X-Request-ID`.
- `X-Server-Time` ISO 8601 untuk exam-sensitive responses.
- `ETag` pada immutable/cacheable resources bila relevan.
- `Retry-After` pada rate limit/degraded retry.

## 3. Success and error envelope

Single resource dapat dikirim langsung atau dalam:

```json
{
  "data": {},
  "meta": {"requestId": "uuid", "serverTime": "2026-08-27T10:00:00Z"}
}
```

Error:

```json
{
  "error": {
    "code": "ANSWER_REVISION_CONFLICT",
    "message": "Jawaban di server sudah berubah.",
    "requestId": "uuid",
    "fieldErrors": [],
    "recovery": {"action": "refresh_attempt"}
  }
}
```

HTTP status mengikuti semantics; business code tetap stabil.

## 4. Pagination/filter

- `limit` max configurable, default 20/50.
- `cursor` opaque.
- `sort` allowlist.
- filters explicit, not arbitrary SQL.
- response meta: `nextCursor`, optional estimated/total count only when affordable.

## 5. Authentication/session endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/bridge/exchange` | Tukar one-time WordPress bridge code |
| POST | `/auth/logout` | Revoke current session |
| GET | `/me` | Current profile/permissions summary |
| GET | `/me/sessions` | List device sessions |
| DELETE | `/me/sessions/{id}` | Revoke session |

Bridge exchange idempotent by code identifier; replay after success returns same safe outcome only within policy, tidak membuat link baru.

## 6. Student home/program endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/home` | Home projection + next action |
| GET | `/me/programs` | Enrollments/program cards |
| GET | `/programs/{programId}` | Program overview and tabs |
| GET | `/programs/{programId}/roadmap` | Tracks/stages/modules summary |
| GET | `/programs/{programId}/resources` | Filtered resources |
| GET | `/resources/{placementId}` | Gated resource detail |
| PUT | `/resources/{placementId}/progress` | Idempotent/sequence progress update |
| GET | `/programs/{programId}/progress` | Program aggregates |
| GET/PUT | `/programs/{programId}/onboarding` | Read/update onboarding |

`GET /home` returns reason code/projection time. It does not return inaccessible private URLs.

## 7. Schedule/live endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/schedule` | Global schedule |
| GET | `/programs/{id}/schedule` | Program schedule |
| GET | `/live-sessions/{id}` | Gated session detail |
| POST | `/live-sessions/{id}/join` | Create gated redirect/join intent |

Join response short-lived and `Cache-Control: no-store`.

## 8. Catalogue/purchase/access endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/catalogue/offers` | Visible offers personalized lightly |
| GET | `/catalogue/offers/{code}` | Offer detail + ownership/overlap |
| POST | `/checkout-intents` | Idempotent checkout intent |
| GET | `/purchases/{id}` | Purchase projection/status |
| GET | `/me/access/explain` | Explain target/action access |

Checkout intent response berisi checkout URL/redirect token yang aman dan expiry.

## 9. Batch and exam endpoints

| Method | Path | Idempotency | Purpose |
|---|---|---:|---|
| GET | `/batches` | — | Gated/visible batch list |
| GET | `/batches/{id}` | — | Batch detail/state/instructions |
| GET | `/batches/{id}/leaderboard` | — | Privacy-safe current ranking snapshot |
| POST | `/batches/{id}/attempts` | Required | Start/resume attempt |
| GET | `/attempts/{id}` | — | Resume state |
| POST | `/attempts/{id}/writer-lease/renew` | Required | Renew lease |
| POST | `/attempts/{id}/writer-lease/takeover` | Required | Explicit takeover |
| PUT | `/attempts/{id}/answers/{instanceId}` | client mutation ID | Save answer |
| PUT | `/attempts/{id}/flags/{instanceId}` | mutation ID | Set flagged state |
| GET | `/attempts/{id}/submit-summary` | — | Server counts/state |
| POST | `/attempts/{id}/submit` | Required | Finalize |
| GET | `/attempts/{id}/result` | — | Result state/current version |
| GET | `/attempts/{id}/review` | — | Released explanation payload |
| POST | `/attempts/{id}/question-reports` | Required | Report question issue without answer/key disclosure |

Answer save uses expected revision and writer lease. `409` includes safe current answer state.

## 10. Notification/account/support endpoints

| Method | Path | Purpose |
|---|---|---|
| GET/PATCH | `/me/notification-preferences` | Preferences |
| GET | `/notifications` | In-app notifications |
| POST | `/notifications/{id}/read` | Mark read |
| POST | `/support/cases` | Contextual support case |
| GET | `/support/cases/{id}` | Case status |

## 11. Admin catalogue/program endpoints

- `/admin/products`, `/admin/product-versions`
- `/admin/offers`, `/admin/external-sku-mappings`
- `/admin/programs`, `/admin/program-versions`
- `/admin/resources`, `/admin/assets/upload-intents`
- `/admin/schedule-items`, `/admin/live-sessions`

Patterns:

- POST create draft;
- PATCH draft with `If-Match`/version;
- POST `/{id}/validate`;
- POST `/{id}/publish` idempotent;
- GET `/{id}/audit`.

## 12. Admin question/import endpoints

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/admin/questions` | Search/create stable question |
| GET/PATCH | `/admin/question-versions/{id}` | Read/edit draft |
| POST | `/admin/question-versions/{id}/submit-review` | Transition |
| POST | `/admin/question-versions/{id}/review` | Approve/request changes |
| POST | `/admin/question-imports` | Create upload intents/job |
| POST | `/admin/question-imports/{id}/validate` | Start validation |
| GET | `/admin/question-imports/{id}` | Job/summary |
| GET | `/admin/question-imports/{id}/issues` | Paginated issues |
| POST | `/admin/question-imports/{id}/commit` | Import valid/all per policy |
| GET | `/admin/question-imports/{id}/report` | Export report intent |

Upload uses direct object storage signed intents, finalize verifies checksum/size.

## 12A. Admin accommodation dan notification endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/admin/attempts/{attemptId}/accommodations` | Create request + impact preview |
| POST | `/admin/attempts/{attemptId}/accommodations/{id}/approve` | Apply with distinct approver |
| POST | `/admin/attempts/{attemptId}/accommodations/{id}/revoke` | Controlled revoke with reason |
| POST | `/admin/notification-jobs` | Create draft audience/template job |
| POST | `/admin/notification-jobs/{id}/validate` | Consent, suppression, cost, and audience preview |
| POST | `/admin/notification-jobs/{id}/schedule` | Lock versions and schedule idempotently |
| POST | `/admin/notification-jobs/{id}/cancel` | Cancel undispatched deliveries |

Semua mutasi memakai CSRF untuk browser cookie auth, idempotency key, permission eksplisit, audit, dan actor separation bila approval diperlukan.

## 13. Admin exam/access endpoints

- blueprint/scoring/form/batch draft/validate/publish endpoints;
- `/admin/batches/{id}/live-ops`;
- `/admin/access/search`;
- `/admin/access/change-requests` dry-run/approve/commit;
- `/admin/reconciliation-cases`;
- `/admin/purchase-events/{id}/reprocess`;
- `/admin/corrections` preview/approve/publish.

No answer-edit endpoint.

## 14. Idempotency contract

- Key scope: authenticated actor + method + route/aggregate.
- Request hash stored.
- Same key + same hash returns recorded outcome.
- Same key + different hash returns `409 IDEMPOTENCY_KEY_REUSED`.
- In-progress key returns `409/202` with status reference.
- Retention exceeds realistic retry window; critical commerce/exam keys retained with domain records.

## 15. Optimistic concurrency

- Draft resources use version number/ETag.
- `If-Match` mismatch returns `409 VERSION_CONFLICT` plus current version metadata.
- Attempt answer uses explicit answer revision, not generic ETag.
- Immutable published resources do not accept PATCH.

## 16. Webhook ingress

### Path

`POST /api/v1/integrations/commerce/{provider}/events`

### Ingress rules

1. Read raw bytes before JSON parsing if signature requires.
2. Enforce body size/content type.
3. Verify signature/shared secret/IP only as documented; IP is supplemental.
4. Derive provider event key or deterministic fallback checksum.
5. Persist envelope idempotently.
6. Return fast acknowledgement after durable receipt.
7. Process normalization asynchronously.

### Response

- `202 Accepted` for durable new event;
- `200/202` for verified duplicate;
- `400` malformed;
- `401/403` verification failure;
- never expose internal mapping details.

## 17. Canonical commerce event

```json
{
  "provider": "sejoli_bridge",
  "site": "superlatif.id",
  "eventKey": "external-stable-id",
  "type": "purchase.status_changed",
  "occurredAt": "2026-08-27T10:00:00Z",
  "order": {
    "externalId": "...",
    "status": "paid",
    "currency": "IDR",
    "amountMinor": 199000,
    "externalUserId": "...",
    "externalSkuId": "..."
  },
  "schemaVersion": 1
}
```

Canonical event bukan raw payload; adapter menyimpan link/checksum ke raw envelope.

## 18. Purchase transition rules

Allowed normalized states:

`pending`, `paid`, `failed`, `expired`, `cancelled`, `refunded_partial`, `refunded_full`, `chargeback`.

- Out-of-order event tidak otomatis menurunkan state tanpa transition policy/evidence.
- Paid → pending replay diabaikan/flagged.
- `refunded_partial` hanya digunakan jika provider memberi nominal/line-item semantics yang dapat diverifikasi; `refunded_full` membuat source-grant revocation event sesuai policy.
- `chargeback` membuat review/suspension event sesuai policy dan tidak otomatis menuduh siswa melakukan kecurangan.
- Unknown/ambiguous event creates reconciliation case.

## 19. Outbound webhook/provider callbacks

Messaging delivery callbacks:

- verify provider;
- idempotent provider message/event key;
- map accepted/delivered/read/failed;
- do not trust callback to change access.

Future outbound webhooks require signing, retries, delivery log, and secret rotation.

## 20. Rate limiting

| Route group | Policy shape |
|---|---|
| Auth | IP/device/account, conservative |
| Student reads | user + burst |
| Answer save | attempt/user high-frequency, no harmful false positive |
| Start/submit | user/attempt strict idempotency |
| Admin search/export | user/role/cost |
| Webhook | provider/site + verification and burst |

429 response has retry guidance. Exam incident caused by limiter is monitored.

## 21. Versioning and deprecation

- Path major version `/v1`.
- Additive fields allowed; clients ignore unknown fields.
- Breaking semantics require new version or explicit capability version.
- Error codes remain stable within major.
- Deprecation notice and telemetry before removal.
- Blueprint/scoring versioning is domain versioning, separate from API version.

## 22. Webhook spike checklist

Sebelum Sejoli contract freeze, capture:

- actual order IDs and stability;
- user/product/variant identifiers;
- status values/transitions;
- signature/auth capability;
- retry behavior and duplicate IDs;
- refund/cancel events;
- timestamps/timezone;
- payload size and PII;
- how plugin custom status changes propagate;
- reconciliation read capability.

## 23. Contract tests

- OpenAPI validates.
- Examples conform schemas.
- Student serializer secret scan.
- Idempotency same/different payload.
- Concurrency/version conflict.
- Webhook duplicate/out-of-order/invalid signature.
- Paid/refund access transition.
- Attempt answer conflict/takeover/deadline.
- Authorization matrix.

## 24. Open decisions

### Audit resolution RC2

- Cookie-authenticated command membawa `X-CSRF-Token`; idempotency tidak menggantikan CSRF.
- Webhook wajib membawa provider event ID, timestamp anti-replay, key ID, dan signature atas canonical bytes; body mengikuti canonical commerce event. `401` untuk signature invalid dan `403` untuk key/provider yang tidak diizinkan.
- Resume mengembalikan server time, remaining seconds, attempt revision, deadline, late-sync cutoff, immutable instances/order, answer state, flag state, serta writer lease.
- Answer payload menggunakan discriminated union per tipe soal. Endpoint takeover, flags, submit-summary, dan review termasuk dalam subset machine-readable.
- `/me/access/explain` hanya mengirim alasan aman, scheduled start/end, attempts remaining, serta label sumber; UUID grant dan diagnostic internal tidak diekspos.

- Actual Sejoli/WooCommerce bridge payload and signing.
- Whether public API clients are needed; default no.
- Exact file upload size/part strategy.
- Long-running export delivery mechanism.
