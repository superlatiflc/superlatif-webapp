# 24 — Authentication, RBAC, Security, dan Privacy

**Versi:** 1.0-RC2  
**Security baseline:** OWASP ASVS 5 level 2 target for P0 flows; OWASP API Security Top 10 review  
**Accessibility baseline:** WCAG 2.2 AA

References:

- https://owasp.org/www-project-application-security-verification-standard/
- https://owasp.org/API-Security/editions/2023/en/0x11-t10/
- https://www.w3.org/TR/WCAG22/

## 1. Objectives

- Satu identity app yang dapat di-link ke WordPress/Sejoli.
- Session aman dan dapat dikelola user.
- Least privilege dan object-level authorization.
- Exam secret, PII, financial, dan learning data terlindungi.
- Auditability tanpa logging data berlebihan.
- Recovery aman dan aksesibel.

## 2. Threat model summary

Actors:

- external attacker;
- credential/session thief;
- abusive student/bot;
- compromised WordPress/plugin/provider;
- over-privileged/malicious admin;
- accidental operator error;
- curious user manipulating object IDs;
- supply-chain compromise.

Critical assets:

- accounts/sessions;
- order and access;
- exam keys/weights/forms;
- answers/results;
- question bank/media;
- PII;
- provider secrets;
- audit/correction controls.

## 3. Authentication

### Student

- Primary bridge exchange from verified WordPress identity.
- Fallback login method decided after bridge spike; magic link/OTP may be used with rate/abuse controls.
- Password manager/copy-paste supported; no cognitive CAPTCHA as only path.
- Step-up authentication for identity merge/security-sensitive action where feasible.

### Admin

- Dedicated admin authorization.
- MFA required for privileged roles.
- Step-up for role change, bulk revoke, result correction, secret/key operation.
- Shared admin account prohibited.

## 4. Session

- Random opaque session token; only hash stored server-side.
- Secure, HttpOnly, SameSite cookie; domain/path least scope.
- Session fixation prevention on login/privilege change.
- Idle and absolute expiry differentiated.
- Rotation after authentication/step-up.
- User can inspect and revoke devices.
- Revocation applied promptly to privileged actions.
- Exam writer lease separate from login session and scoped to attempt.

Provisional expiry:

- student idle 30 days, absolute 90 days;
- admin idle 8 hours, absolute 24 hours;
- step-up freshness 15 minutes for high-risk action.

Final values follow risk/UX review.

## 5. Authorization model

Decision inputs:

- authenticated actor;
- role/permission;
- object scope/ownership;
- effective access;
- object state/version;
- environment;
- step-up/approval status.

### Student

Object-level checks on every program/resource/batch/attempt/result request. UUID does not replace authorization.

### Admin

- Role grants capability.
- Permission grants action.
- Scope limits program/family/cohort where needed.
- State guards prevent editing locked objects.
- Approval workflow for high impact.

### Service/worker

Separate service identity/scopes. No use of global admin token in browser-facing process.

## 6. RBAC matrix core

| Permission | Tutor/Writer | Moderator/Reviewer | Academic Admin | Operations Admin | Live-Class Coordinator | Support | Finance/Reconciliation | Super Admin |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| question.draft.write | Ya | Ya | Ya | — | — | — | — | Ya |
| question.first_approve | — | Ya | Ya bila bukan creator | — | — | — | — | Ya |
| question.ranked_publish | — | — | Second approval | — | — | — | — | Ya/approval |
| program.publish | — | Review tertentu | Ya | — | — | — | — | Ya |
| batch.publish | — | Review | Ya | Operasional terbatas | — | — | — | Ya |
| live.occurrence.manage | — | — | Ya | Ya | Ya | Read | — | Ya |
| access.explain | — | — | Read | Read | — | Ya | Read | Ya |
| access.manual.change | — | — | Terbatas | Terbatas | — | Request terbatas | — | Ya |
| purchase.raw.read | — | — | — | Redacted | — | Redacted | Ya | Ya |
| reconciliation.manage | — | — | Read | Ya | — | Create case | Ya | Ya |
| result.correction.request | — | Ya | Ya | — | — | — | — | Ya |
| result.correction.publish | — | Approval | Approval | — | — | — | — | Ya/approval |
| notification.operational.schedule | — | — | Ya | Ya | Ya untuk kelas | — | — | Ya |
| notification.marketing.schedule | — | — | — | Ya sesuai consent | — | — | — | Ya |
| role.manage | — | — | — | — | — | — | — | Ya |

Role kanonik sama dengan 02, 07, 13, dan 15. Permission names final berada di seed/config dan diuji. Satu pengguna dapat memiliki beberapa role, tetapi kontrol `creator != first_approver != second_approver` dan `requester != approver` dievaluasi terhadap actor ID, bukan nama role saja.

## 7. High-risk workflows

Require reason + preview + audit; peer approval when marked:

- identity merge/link override;
- manual grant/revoke/extension mass action;
- role/permission change;
- blueprint/scoring publish;
- active batch time change;
- result correction;
- export PII/question secrets;
- bridge key rotation.

## 8. API security controls

- Strong schema validation and allowlisted fields.
- Object and function-level authorization per endpoint.
- Mass-assignment prevention.
- Pagination/query complexity limits.
- Rate/resource limits, upload size/decompression limits.
- SSRF protection for external URLs/imports.
- Safe redirect allowlist.
- CORS restricted; same-origin default.
- CSRF defense for cookie-authenticated state change.
- Content type/body limits.
- Generic external errors and request IDs.

## 9. Input/content security

- Rich text sanitized to allowed document schema.
- LaTeX rendered through safe allowlist.
- File type verified by bytes and declared MIME.
- Malware scan/quarantine.
- Image decode/re-encode variants where appropriate.
- ZIP bomb, path traversal, excessive entries/ratio prevented.
- CSV/Excel formula injection neutralized on exports and unsafe imports.
- External link scheme/domain policy.
- SVG disabled/sanitized.

## 10. Exam security

- Student serializer allowlist.
- Correct answer/weight/explanation restricted until release.
- Presented order snapshot server-side.
- Writer lease and answer revision CAS.
- Server timer and idempotent submit.
- Rate limit tuned for autosave.
- Passive telemetry only; no automatic accusation.
- Form exposure/usage monitoring.
- Admin cannot edit attempt answer.

## 11. Commerce webhook security

- HMAC/timestamp/event ID if bridge supports.
- Replay window and dedupe.
- Raw bytes signature verification.
- TLS.
- Secret rotation/key ID.
- Fast durable acknowledgement.
- Provider/source anomaly monitoring.

## 12. Secrets

- Stored in deployment secret manager/environment, not repository/database plain text.
- Environment-specific and least privilege.
- Rotation runbook.
- No secrets in logs/errors/client bundles.
- `.env.example` contains names only in Gate 4.
- Emergency revoke supported.

## 13. Data protection

### In transit

TLS; HSTS; secure provider connections.

### At rest

Managed storage encryption baseline. Field/application encryption considered for selected high-risk data where search requirements allow.

### PII minimization

- Analytics pseudonymous IDs.
- Redaction/masking in admin and logs.
- Collect only data with explicit purpose.
- Private URLs/token references not stored in generic event properties.

## 14. Data access logging

Audit:

- PII/financial export;
- raw purchase payload view;
- exam secret view;
- role changes;
- manual access;
- correction;
- identity merge;
- security/session actions.

Read logging volume is risk-based; not every normal student read enters audit log.

## 15. Privacy notices and rights

- Purpose disclosed near profile/onboarding fields.
- Marketing consent separated from operational processing.
- Notification preferences clear.
- Account/data request workflow.
- Deletion/anonymization respects finance/exam/audit retention obligations.
- Policy explains exam activity telemetry transparently.
- Minor/student privacy and Indonesian legal review required before production.

## 16. Retention

Retention policy table in PRD remains provisional. Implementation requires:

- record category;
- purpose/legal basis;
- retention period;
- archive/delete/anonymize action;
- owner;
- hold exception;
- automated job and evidence.

## 17. Logging and redaction

Never log:

- password/OTP/session/lease token;
- answer payload by default;
- correct answer/weight;
- raw authorization header;
- full webhook payload without controlled secure store;
- signed private URLs;
- unnecessary email/phone.

Structured safe fields: object IDs, status, error code, latency, correlation, actor pseudonym.

## 18. Browser security

- Content Security Policy with staged enforcement.
- Frame ancestors/anti-clickjacking.
- MIME sniff prevention.
- Referrer policy.
- Permissions policy.
- Dependency integrity/build provenance.
- No sensitive data in localStorage; exam offline queue scoped and protected best-effort.

## 19. Infrastructure security

- Separate environments/projects/credentials.
- Production access restricted and reviewed.
- Database roles and network controls.
- Backup access and restore audit.
- Patch/dependency update cadence.
- Vulnerability/dependency/secret scanning in CI.
- Provider status/incident monitoring.

## 20. Security testing

- Threat model review per release slice.
- ASVS level 2 control mapping for P0.
- SAST/dependency/secret scan.
- Authorization matrix tests.
- Webhook replay/signature tests.
- File/ZIP abuse tests.
- Exam secret serializer tests.
- Rate/resource/load abuse tests.
- Manual penetration test before broad paid launch or after major auth/exam change.

## 21. Incident response

Severity, owner, containment, evidence, communication, recovery, and postmortem.

Security incident cases:

- credential/session compromise;
- exam content leak;
- unauthorized admin action;
- PII exposure;
- commerce event forgery;
- supply-chain compromise.

Logs/clocks/correlation preserved; do not destroy evidence during recovery.

## 22. Accessibility/security interaction

- Authentication supports password managers and copy/paste.
- CAPTCHA has accessible alternative.
- Session timeout warns and preserves safe input.
- MFA/recovery instructions readable and keyboard accessible.
- Security warnings do not rely only on color.
- Exam time announcements accessible without overwhelming live regions.

## 23. Acceptance

1. User cannot access another user’s attempt/result by changing UUID.
2. Support cannot view question key or edit answer.
3. Bridge token replay and open redirect fail.
4. Revoked session fails privileged actions promptly.
5. ZIP traversal/bomb and spoofed MIME rejected.
6. Analytics/log scan finds no answer/token leakage.
7. Manual access and correction show complete audit.
8. Authentication P0 passes keyboard/screen reader checks.

## 24. Open decisions

### Audit resolution RC2

- Consent anak/wali, notice version, purpose, withdrawal, dan DSR memiliki data model; ambang umur, retention schedule, serta legal basis menunggu review hukum Indonesia.
- WhatsApp marketing/engagement memerlukan opt-in per kategori; transaksi wajib tidak disamakan dengan marketing.
- Answer key dan option weight berada pada restricted academic secret table/encrypted payload, tidak satu row dengan content serializer.
- Audit menyimpan before/after yang telah direduksi/redacted selain checksum. Raw webhook, private meeting URL, token, jawaban, dan PII tidak masuk analytics/log generik.

- Final student fallback authentication.
- MFA provider/method for admin.
- PII encryption/search implementation.
- Retention/legal basis after Indonesian counsel review.
- Pen-test vendor/timing.
