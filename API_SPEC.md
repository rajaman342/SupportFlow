# API_SPEC.md

> **Status: PLANNED.** No endpoint exists yet. This is the contract the implementation must follow; changes to it require updating this file first.

## 1. Conventions

- Base path: `/api/v1`. JSON request/response (`Content-Type: application/json`) except multipart uploads.
- Authentication: `Authorization: Bearer <accessToken>` (JWT, 15 min). The refresh cookie is only sent to `/auth/*`.
- Every response carries `X-Request-Id`. A client may send its own `X-Request-Id` (validated, max 64 chars); otherwise one is generated.
- Success: `{ "data": ... }` and, for lists, `{ "data": [...], "meta": { "page", "limit", "total", "totalPages" } }`.
- Timestamps: ISO 8601 UTC strings. IDs: UUID strings.
- Unknown JSON fields are rejected or stripped (Zod `strict`); the choice is fixed per schema and tested.
- Cookie-authenticated endpoints (`/auth/refresh`, `/auth/logout`) require header `X-Requested-With: supportflow` and an allowed `Origin` (see SECURITY.md).

### Authorization legend
`public` | `any` (any authenticated user) | `customer` | `agent` (agent or admin) | `admin` | `owner` (the ticket's customer). **Org scope is always enforced** from the authenticated user's database row.

### Error envelope

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed", "details": [{ "field": "body", "issue": "Required" }], "requestId": "..." } }
```

| HTTP | code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod failure (body, query, params) |
| 400 | `INVALID_FILE` | Upload failed validation (size, extension, MIME, signature, encrypted, no pages) |
| 401 | `UNAUTHENTICATED` | Missing/invalid/expired access token |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password (same message for both) |
| 401 | `REFRESH_INVALID` | Refresh token missing, unknown, expired |
| 401 | `REFRESH_REUSE_DETECTED` | A rotated refresh token was reused; whole session family revoked |
| 403 | `FORBIDDEN` | Authenticated but role not allowed |
| 403 | `CSRF_REJECTED` | Missing custom header or disallowed Origin on cookie endpoints |
| 404 | `NOT_FOUND` | Missing **or** not in caller's scope (no distinction) |
| 409 | `INVALID_TRANSITION` | Disallowed ticket status change |
| 409 | `CONFLICT` | Duplicate email, duplicate document hash, stale state |
| 413 | `PAYLOAD_TOO_LARGE` | Body/upload exceeds limit |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Wrong content type |
| 422 | `BUSINESS_RULE_VIOLATION` | e.g. assigning a ticket to a customer, approving a non-answered draft |
| 429 | `RATE_LIMITED` | Limiter tripped; `Retry-After` header set |
| 500 | `INTERNAL_ERROR` | Unexpected; details only in server logs |
| 503 | `DATABASE_UNAVAILABLE`, `QUEUE_UNAVAILABLE`, `STORAGE_UNAVAILABLE`, `AI_PROVIDER_UNAVAILABLE` | Dependency down |

### Pagination, sorting, search

`?page=1&limit=20` (default 20, max 100). `sort` is a whitelist per endpoint, e.g. `sort=-created_at` (`-` = descending). Anything not whitelisted is `VALIDATION_ERROR`. Search `q` uses PostgreSQL full-text search on ticket subject.

## 2. Endpoint inventory

### 2.1 Auth

| Method + path | Auth | Request | Success | Notes |
|---|---|---|---|---|
| `POST /auth/register` | public | `{email, password, fullName}` | `201 {data:{user}}` | Creates a **customer** in the default organization. Password 12–128 chars, not in a small common list. Rate limited. Role can never be supplied |
| `POST /auth/login` | public | `{email, password}` | `200 {data:{accessToken, user}}` + `Set-Cookie: sf_refresh` | Same error for unknown email and bad password; hash is checked even for unknown emails to equalize timing |
| `POST /auth/refresh` | cookie | none | `200 {data:{accessToken}}` + rotated cookie | See rotation rules below |
| `POST /auth/logout` | cookie | none | `204` | Revokes the family; clears cookie. Access token expires naturally (≤15 min) |
| `POST /auth/change-password` | any | `{currentPassword, newPassword}` | `204` | Revokes all the user's refresh tokens |
| `GET /auth/me` | any | none | `200 {data:{user}}` | |

User object returned: `{id, email, fullName, role, organizationId, createdAt}`. **Never** `password_hash`.

**Refresh rules:** token is opaque, random, 256-bit, stored only as SHA-256. Each use rotates (old revoked as `rotated`, new in same family). Re-presenting an already-rotated token: if within `REFRESH_REUSE_GRACE_SECONDS` of its rotation and the family is otherwise healthy, respond `401 REFRESH_INVALID` *without* revoking (covers two tabs racing; the SPA retries once with the new cookie); outside the grace window, revoke the family, audit `auth.refresh_reuse_detected`, respond `401 REFRESH_REUSE_DETECTED`. Absolute family lifetime `REFRESH_FAMILY_MAX_DAYS`.

### 2.2 Users (admin)

| Method + path | Auth | Request | Success |
|---|---|---|---|
| `POST /users` | admin | `{email, fullName, role: "agent"|"admin"|"customer", temporaryPassword}` | `201` |
| `GET /users` | admin | `?q&role&active&page&limit` | `200` list |
| `PATCH /users/:id/role` | admin | `{role}` | `200`; cannot demote the last active admin |
| `PATCH /users/:id/active` | admin | `{isActive}` | `200`; deactivating revokes refresh tokens; cannot deactivate yourself if last admin |

### 2.3 Tickets

| Method + path | Auth | Request | Success |
|---|---|---|---|
| `POST /tickets` | customer | `{subject (3-200), body (1-10000), priority? ("low"|"medium"|"high"|"urgent")}` | `201 {data: ticket}` |
| `GET /tickets` | customer (own only) / agent (whole org) | `?q&status&priority&assigneeId&assignedToMe&sort&page&limit` | `200` list |
| `GET /tickets/:id` | owner / agent | | `200 {data: ticket}` |
| `PATCH /tickets/:id` | agent | `{priority?, category?}` | `200` |
| `POST /tickets/:id/assign` | agent | `{agentId \| null}` | `200`. Agents may assign to themselves; only admins assign others. Target must be agent/admin in same org (`422` otherwise) |
| `POST /tickets/:id/status` | agent; owner may only do `resolved→open` | `{status}` | `200` or `409 INVALID_TRANSITION` |
| `GET /tickets/:id/messages` | owner / agent | `?page&limit` (oldest first) | `200` list |
| `POST /tickets/:id/messages` | owner / agent | `{body (1-10000)}` | `201` |

Customers set priority on creation only as a **suggestion**: stored, but agents can change it; customers cannot change priority afterward. A customer message on a `resolved` ticket reopens it (`resolved→open`), audited.

**Allowed transitions**

| From → To | Who |
|---|---|
| open → in_progress | agent |
| in_progress → open | agent |
| in_progress → resolved | agent |
| open → resolved | agent, only if at least one agent message exists |
| resolved → open | agent or the owning customer |
All others → `409 INVALID_TRANSITION`. `resolved_at` is set/cleared accordingly.

Ticket object: `{id, subject, status, priority, category, customerId, customer:{id,fullName}, assignedAgent:{id,fullName}|null, createdAt, updatedAt, resolvedAt}`. Staff list items may include `lastMessageAt`.

### 2.4 Documents (agent)

| Method + path | Request | Success |
|---|---|---|
| `POST /documents` | multipart: `file` (PDF), `title` | `202 {data:{documentId, versionId, status:"uploaded"}}` |
| `GET /documents` | `?q&status&page&limit` (`status` filters the latest version's status) | `200` list |
| `GET /documents/:id` | | `200` metadata, `latestVersion`, `activeVersion`, `servingPreviousVersion: boolean`, page/chunk counts |
| `GET /documents/:id/versions` | | `200` list of versions with status/error |
| `PUT /documents/:id/file` | multipart: `file` | `202` new version `origin=replace`. Existing active version stays searchable until the new one is indexed |
| `POST /documents/:id/reindex` | none | `202` new version `origin=reindex` reusing the stored file |
| `GET /documents/:id/download-url` | `?version=active|<versionId>` | `200 {data:{url, expiresAt}}`. Short-lived; audit-logged |
| `GET /documents/:id/file` | `?token&exp` (local provider only) | Streams the PDF if HMAC token valid and unexpired, **and** the version belongs to a non-deleted document |
| `DELETE /documents/:id` | | `204`. Soft delete; retrieval stops immediately |

Upload validation (`400 INVALID_FILE`): size ≤ `MAX_UPLOAD_MB`; extension `.pdf`; MIME `application/pdf`; first bytes `%PDF-`; not password-protected; page count ≤ `MAX_PDF_PAGES` (checked in the worker if not cheap at upload; marks version `failed` with `PDF_TOO_MANY_PAGES`); filename sanitized; duplicate SHA-256 of an active/latest version in the org → `409 CONFLICT`.

Document status values seen by clients: `uploaded`, `processing`, `indexed`, `failed`, `superseded`. Typical failure codes in `error_code`: `PDF_ENCRYPTED`, `PDF_NO_TEXT`, `PDF_TOO_MANY_PAGES`, `PDF_CORRUPT`, `EMBEDDING_FAILED`, `STORAGE_READ_FAILED`.

### 2.5 AI suggestions (agent)

| Method + path | Request | Success |
|---|---|---|
| `POST /tickets/:id/ai-suggestions` | `{force?: boolean}` | `201 {data: suggestion}`. If a `pending_review` suggestion already exists for the same latest customer message and active config and `force` is false, returns it with `200` (idempotent, saves cost) |
| `GET /tickets/:id/ai-suggestions` | `?page&limit` | `200` history, newest first |
| `GET /ai-suggestions/:id` | | `200` |
| `POST /ai-suggestions/:id/review` | `{action: "approve"|"edit_approve"|"reject"|"dismiss", body?: string, reason?: string}` | `200`. `approve`/`edit_approve` only for `outcome=answered` and `pending_review`; `edit_approve` requires `body`. Approve inserts a ticket message authored by the **reviewing agent** with `source=ai_approved`. Ticket status never changes automatically. `dismiss` for non-answered outcomes |
| `GET /ai-suggestions/:id/sources/:sourceId` | | `200` snapshot `{documentTitle, pageNumber, snippet, similarity, citedInAnswer, sourceState: "current"|"superseded"|"deleted"}` |

Suggestion object:
```json
{
  "id": "...", "ticketId": "...", "outcome": "answered",
  "draftBody": "Refunds are available within 30 days of delivery [1].",
  "suggestedCategory": "refund", "suggestedPriority": "medium",
  "reviewStatus": "pending_review",
  "sources": [
    { "id": "...", "rank": 1, "documentId": "...", "documentTitle": "Refund Policy", "pageNumber": 3,
      "similarity": 0.81, "citedInAnswer": true, "snippet": "..." }
  ],
  "provider": "mock", "model": "mock-llm-v1", "createdAt": "..."
}
```
Citations in `draftBody` use `[n]` markers that match `sources[].rank`. `outcome` ∈ `answered | insufficient_evidence | conflicting_evidence | error`. For `insufficient_evidence`, `draftBody` is null and a fixed explanatory message is shown by the UI.
`sourceState` lets the UI warn "a cited document was replaced or deleted since this draft was generated".

### 2.6 Admin and ops

| Method + path | Auth | Notes |
|---|---|---|
| `GET /audit-logs` | admin | `?action&entityType&actorId&from&to&page&limit` |
| `GET /admin/stats` | admin | ticket counts by status, documents by status, suggestions by review status (cached 60 s) |
| `GET /admin/indexing-config` | admin | read-only: active/staged configs, provider, model, dimensions |
| `GET /health` | public | `200 {data:{status:"ok"}}` |
| `GET /ready` | public | `200` or `503` with per-dependency booleans (no internals) |

Indexing-config changes are performed by documented admin scripts, not endpoints (see AI_RAG_DESIGN.md).

## 3. Validation notes

- Strings are trimmed; control characters stripped except newline/tab in message bodies.
- Emails lower-cased by `citext`; max 254 chars.
- Route `:id` params must be UUIDs.
- Sort/filter inputs are whitelisted; values are always bound parameters.
- Message and ticket text is stored as plain text; the frontend renders it as text (never raw HTML).

## 4. Implementation status

| Group | Status |
|---|---|
| Auth, Users, Tickets | 🗓 Planned (Phase 2) |
| Documents | 🗓 Planned (Phase 4) |
| AI suggestions | 🗓 Planned (Phase 5) |
| Admin/ops (`/health`, `/ready` in Phase 1) | 🗓 Planned |
