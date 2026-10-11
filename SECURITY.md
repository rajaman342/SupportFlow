# SECURITY.md

> **Status: PLANNED.** Every control below is a requirement, not a claim. A control becomes ✅ Verified only when a named test or recorded check proves it (see PROJECT_PLAN evidence log).

## 1. Security principles

1. **Authentication ≠ authorization.** Authentication answers "who are you?" (login, tokens). Authorization answers "what may you do?" (role + ownership + organization). Both are enforced on the **server**; frontend route guards are only user-experience.
2. Deny by default; scope every query by organization (and by customer for customers).
3. Treat all external input, uploaded documents, and AI output as untrusted.
4. Humans approve AI output. The model has no tools.
5. Secrets live only in the environment, never in Git, logs, or API responses.

## 2. Authentication design

### Passwords
- Hashing: **Argon2id preferred**. Phase 1 includes a spike that installs the `argon2` package in our Docker image (Debian-slim base) and hashes/verifies in a test. If it installs and runs reliably, use it; if it causes material compatibility problems, use **bcrypt** with cost ≥ 12. **The final choice is recorded in the decision log** (PROJECT_PLAN §4) with the evidence.
- Argon2id parameters: start from the current OWASP Password Storage Cheat Sheet minimum recommendations (verify the current numbers when implementing), then measure hashing time on the target hardware and adjust. Parameters are encoded in the stored hash string, which allows later re-hashing on login when parameters change. If bcrypt is used, remember its 72-byte input limit (enforce max password length accordingly or pre-hash with a documented scheme).
- Password policy: 12–128 characters, reject a small list of very common passwords, no composition rules that encourage weak patterns.
- Login: same error for unknown email and wrong password; always perform a hash verification against a dummy hash for unknown emails to reduce timing differences; rate limited per IP+email; failures audited (no password values).

### Access token
- JWT, signed with `JWT_ACCESS_SECRET` (≥ 32 random bytes), algorithm pinned (e.g. HS256), 15-minute lifetime, claims minimal: `sub` (user id), `iat`, `exp`.
- **Role and organization are never trusted from the token.** Every request loads the user row (`id`, `organization_id`, `role`, `is_active`) from PostgreSQL. A deactivated user or a changed role takes effect immediately, not after token expiry.
- Stored by the SPA **in memory only** (not localStorage/sessionStorage), sent as `Authorization: Bearer`.

### Refresh token and rotation
- Opaque random 256-bit value, delivered only in the cookie `sf_refresh`: `HttpOnly; Secure (production); SameSite=Strict; Path=/api/v1/auth; Max-Age = REFRESH_TOKEN_TTL_DAYS`. Stored server-side as a SHA-256 hash.
- **Rotation:** every refresh issues a new token and revokes the old one (`revoked_reason=rotated`, `replaced_by` set), same `family_id`.
- **Reuse detection:** presenting a revoked token after the grace window revokes the entire family (`reuse_detected`) and writes an audit entry. This limits a stolen-token scenario to the next legitimate refresh.
- **Race tolerance:** two tabs refreshing at once is normal. The SPA API client uses a single in-flight refresh promise per tab and retries once on `REFRESH_INVALID`. The server's `REFRESH_REUSE_GRACE_SECONDS` window prevents a benign race from revoking the session.
- **Lifetimes:** idle `REFRESH_TOKEN_TTL_DAYS` (7), absolute `REFRESH_FAMILY_MAX_DAYS` (30).
- **Revocation events:** logout (family), password change (all of the user's tokens), user deactivation (all), admin action.
- **Session restore:** on page load, the SPA calls `/auth/refresh` to obtain a new access token.

### Logout and token handling
Logout calls `/auth/logout` (revokes family, clears cookie) and clears in-memory state. Honest limitation: an already-issued access token remains technically valid until it expires (≤ 15 min), but it stops working sooner if the user is deactivated because of the per-request user lookup.

## 3. CSRF protection

CSRF matters only for credentials that browsers attach **automatically** (cookies). Our design limits exposure:

| Layer | Control |
|---|---|
| No cookie for API calls | All API endpoints except `/auth/refresh` and `/auth/logout` authenticate with the `Authorization` header, which a cross-site form or image cannot set. They are not CSRF-able |
| Cookie scope | The refresh cookie has `Path=/api/v1/auth`, so it is not sent to other endpoints |
| SameSite=Strict | Cross-site requests do not carry the cookie |
| Custom header | `/auth/refresh` and `/auth/logout` require `X-Requested-With: supportflow`. Cross-origin requests with custom headers trigger a CORS preflight that our allowlist rejects |
| Origin check | The server validates `Origin` (or `Referer` fallback) against `CORS_ORIGINS` on those endpoints; missing/foreign origin → `403 CSRF_REJECTED` |
| CORS | Strict allowlist (never `*` with credentials); `credentials: true` only for listed origins |
| Content type | JSON bodies require `application/json` |

**Deployment constraint:** this design relies on frontend and API being the **same site** (for example the same origin behind a reverse proxy, or `app.example.com` + `api.example.com`). Local development (`localhost:5173` → `localhost:4000`) is same-site. If a future deployment needs cross-site cookies (`SameSite=None`), the CSRF design must be revisited (for example with a synchronizer token) before shipping.

**XSS** is the larger risk to tokens: React escapes by default; we never use `dangerouslySetInnerHTML` for tickets/messages/AI text; CSP headers (via helmet, tuned for the SPA) in production; no inline script reliance. The access token being memory-only and the refresh token being HttpOnly limits what XSS can steal, though XSS could still use the session while the page is open.

## 4. Authorization model

| Resource | customer | agent | admin |
|---|---|---|---|
| Own tickets/messages | read, create, reply, reopen | | |
| All org tickets | ✗ | read/manage | read/manage |
| Assign others | ✗ | ✗ (self only) | ✓ |
| Documents and versions | ✗ | full | full |
| AI suggestions | ✗ | request/review | request/review |
| Users, audit logs, stats | ✗ | ✗ | ✓ |

Implementation rules: route middleware checks role; **services and repositories** check organization/ownership in SQL predicates; resources not in scope return 404; tests exist per endpoint for cross-customer, cross-organization, and wrong-role access.

## 5. Tenant isolation checklist

- [ ] `organization_id` on every tenant-owned table; indexes lead with it where relevant
- [ ] Organization taken from the DB user row, never from client input
- [ ] Retrieval filters organization in SQL and joins active, non-deleted versions
- [ ] Customers cannot reach documents, chunks, AI drafts or sources
- [ ] Cache keys include organization (and user for customer data); no shared key holds customer data
- [ ] Job payloads contain only IDs; workers re-load the row and use *its* organization
- [ ] Storage keys include organization; signed URLs are issued only after an org-scoped lookup
- [ ] Audit log queries are organization-scoped
- [ ] Automated cross-tenant tests (two organizations seeded in tests) cover tickets, documents, retrieval, caches, downloads

## 6. Private document access

- No permanent public URL is stored or returned anywhere.
- Cloudinary (Phase 4): authenticated delivery type; only the `storage_key` is stored; short-lived signed access issued per request after role+org checks; each issuance audited. **Before relying on it**, run the Phase 4 verification spike (authenticated delivery, signed URL expiry, plan limitations, PDF delivery settings, deletion behavior) and record the evidence.
- Local provider: files live in a Docker volume not served by any static route; downloads go through the API with an HMAC token bound to the version id and an expiry (`SIGNED_URL_TTL_SECONDS`), using constant-time comparison; streamed with `X-Content-Type-Options: nosniff` and `Content-Disposition`.
- File names in storage are generated (ids), never user-provided.
- Deletion removes chunks and assets (when unreferenced); DB soft delete takes effect immediately for retrieval.

## 7. Upload security

- Size limit enforced by Multer **and** reverse proxy later.
- Validate extension, MIME type, and magic bytes (`%PDF-`); the three must agree.
- Parse in the **worker**, not the API process, so a malicious/pathological PDF can only hurt the worker; set page and time limits (`MAX_PDF_PAGES`, per-job timeout).
- Reject encrypted PDFs; never execute or render active content; extraction only.
- Sanitized display filename; control characters removed.
- Optional later: malware scanning (Phase 9; not in MVP, documented risk).

## 8. AI security

| Risk | Control |
|---|---|
| Prompt injection via PDFs/tickets | Untrusted-data framing, no tools, JSON-only output, citation validation, human approval, evaluation cases |
| Fabricated citations | Citations are numbers mapped server-side to retrieved chunk ids; titles/pages come from DB |
| Data leakage across tenants | SQL org filter before anything reaches the model |
| Cost abuse | Per-user rate limits, existing-suggestion reuse, max prompt size, timeout |
| Sensitive data in logs | Prompts, completions, ticket bodies not logged in full |
| Model overclaiming | Insufficient-evidence path; UI states AI drafts may be wrong |

## 9. Platform security checklist

- [ ] `helmet`, strict CORS allowlist, request body size limits (JSON small, multipart per upload limit)
- [ ] Zod validation for body/query/params; unknown fields handled; sort/filter whitelists; parameterized SQL only
- [ ] Centralized error handler: no stack traces, SQL, or paths in responses
- [ ] Logging redaction: `authorization`, `cookie`, `set-cookie`, `password`, `token`, `refreshToken`, `secret`, `apiKey`, message/prompt bodies
- [ ] Secrets only from environment; `.env` git-ignored; startup fails on missing/weak secrets (tested)
- [ ] Containers run as non-root; no secrets baked into images; Postgres/Redis published only on `127.0.0.1` in development and not at all in production
- [ ] Redis password required outside local development
- [ ] Dependency audit (`npm audit`) reviewed in CI; lockfile committed; pinned image tags; secret scanner in CI (tool chosen in Phase 8)
- [ ] Audit log append-only (DB privileges), no secrets in metadata
- [ ] DB role used by the app is not a superuser; migrations use a separate privileged role in production
- [ ] HTTPS terminated by the production proxy/platform; `Secure` cookies and HSTS in production
- [ ] Rate limits on auth, upload, and AI endpoints

## 10. Threat model (STRIDE-style summary)

| Threat | Example | Mitigation |
|---|---|---|
| Spoofing | credential stuffing, stolen refresh token | rate limits, Argon2id/bcrypt, rotation + reuse detection |
| Tampering | forged `organization_id`, role escalation via register | server-derived org/role, register creates customers only, tests |
| Repudiation | agent denies approving a reply | audit logs with actor, request id |
| Information disclosure | IDOR on tickets/docs, cross-tenant retrieval, leaked PDFs, verbose errors | org/ownership predicates, 404 policy, signed short-lived URLs, error handler |
| Denial of service | huge uploads, pathological PDFs, AI spam, brute force | size/page/time limits, worker isolation, rate limits, queue backoff |
| Elevation of privilege | customer calls agent endpoints | middleware + service checks, tests per endpoint |
| AI-specific | prompt injection, fabricated policy | see §8 |

## 11. Known limitations (to state honestly in interviews and README)

- Access tokens cannot be revoked before expiry (mitigated by per-request user lookup and a short lifetime).
- No MFA, SSO, or account recovery by email in the MVP.
- No malware scanning of uploaded PDFs.
- Single-region, single-instance deployment assumptions; no WAF.
- LLM output can still be wrong; human review is the final control.
- Prompt-injection defenses reduce, not eliminate, risk.

## 12. Incident-style scenarios to rehearse

1. Refresh token reuse detected: what is logged, what the user sees, how an admin investigates.
2. Cloudinary API secret leaked: rotate in the provider, update environment, redeploy, review access logs.
3. A document containing instructions ("ignore previous rules...") is uploaded: how the pipeline behaves.
4. Cross-tenant bug suspected: how to query audit logs and prove scope.

## 13. Implementation status

| Control group | Status |
|---|---|
| All | 🗓 Planned (auth Phase 2; documents Phase 4; AI Phase 5; limits Phase 6; tests Phase 7; hardening Phase 8) |
