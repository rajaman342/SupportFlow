# SupportFlow

> AI-assisted customer support ticketing platform with citation-grounded RAG, tenant isolation, and mandatory human-in-the-loop review.

[![CI](https://github.com/amanraj/supportflow/actions/workflows/ci.yml/badge.svg)](https://github.com/amanraj/supportflow/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-v22%20LTS-brightgreen)
![PostgreSQL](https://img.shields.io/badge/postgresql-16%20%2B%20pgvector-blue)
![Redis](https://img.shields.io/badge/redis-7--alpine-red)
![Tests](https://img.shields.io/badge/tests-151%20passing-success)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## 1. Overview & Core Mission

SupportFlow solves a critical problem in modern customer service: **hallucinations and liability in automated customer support**.

Instead of allowing an AI model to autonomously message customers or resolve issues unchecked, SupportFlow implements an enterprise **Human-in-the-Loop RAG Architecture**:

1. **Grounded Retrieval:** When an agent handles a ticket, SupportFlow retrieves authoritative company policy passages using PostgreSQL `pgvector` vector similarity search.
2. **Server-Side Citation Validation:** AI response drafts reference exact chunk IDs. SupportFlow maps citations server-side to verified document and page numbers—preventing fabricated citations.
3. **Mandatory Human Approval:** Agents review, inspect cited sources, edit text if necessary, and approve drafts. **The AI never sends messages or resolves tickets autonomously.**
4. **Resilient Document Versioning:** If a re-indexing job or replacement PDF upload fails, SupportFlow preserves the previous active version without downtime or broken retrieval.

---

## 2. Technology Stack

| Layer | Technologies & Libraries | Architectural Purpose |
|---|---|---|
| **Frontend** | React 19, Vite, Tailwind CSS, React Router 7 | Responsive single-page application with in-memory JWT storage and role-aware routing. |
| **Backend API** | Node.js (Active LTS v22), Express, Zod, pino, helmet | REST API following `routes → controllers → services → repositories`. No ORM (raw SQL via `pg`). |
| **Worker Service** | Node.js, BullMQ | Asynchronous PDF ingestion, text extraction, page-aware chunking, vector embedding, and reconciler recovery. |
| **Database** | PostgreSQL 16 + `pgvector` 0.8.7, `node-pg-migrate` | Relational multi-tenant schema with HNSW vector indexes, JSONB source snapshots, and full-text search. |
| **Queue & Caching** | Redis 7 Alpine, `rate-limiter-flexible` | Distributed rate limiting, BullMQ job queue, query embedding cache, and version-counter cache invalidation. |
| **Security & Auth** | Argon2id, jsonwebtoken, signed HMAC URLs | Password hashing, rotating HttpOnly SameSite=Strict refresh cookies, custom CSRF headers, and tenant isolation. |
| **Testing** | Vitest, Supertest, React Testing Library | Unit, integration, security boundary, frontend component, and RAG evaluation test suites. |
| **DevOps & Infra** | Docker, Docker Compose, Nginx, GitHub Actions | Multi-stage production container builds, internal network isolation, and automated CI pipeline. |

---

## 3. System Architecture

```
                       +---------------------------------------+
                       |   Web Browser (Customer / Agent / UI) |
                       +---------------------------------------+
                                           |
                           (HTTPS / Port 80 / Reverse Proxy)
                                           v
                       +---------------------------------------+
                       |         Nginx Gateway / Frontend       |
                       +---------------------------------------+
                            /                             \
                Static SPA Assets                   /api/v1 (Proxy)
                           |                               v
                           v                   +-----------------------+
                       [React UI]              |   SupportFlow API     |
                                               +-----------------------+
                                                /          |          \
                                               /           |           \
                                       SQL Queries    Redis Cache    BullMQ Jobs
                                             /             |             \
                                            v              v              v
               +-------------------------------+      +---------+    +------------------+
               | PostgreSQL 16 + pgvector      |      | Redis 7 |    | BullMQ Worker    |
               | - Multi-tenant isolation      |      +---------+    | - PDF extraction |
               | - Document versions & chunks  |           ^         | - Chunking       |
               | - HNSW cosine vector index    |           |         | - Vector embed   |
               +-------------------------------+           +---------+------------------+
```

---

## 4. Quickstart Guide (Local Development)

### Prerequisites
- **OS:** Linux, macOS, or Windows with **WSL 2**
- **Docker Desktop** (Engine 24+)
- **Node.js:** v22 LTS (managed via `nvm`)
- **Git**

### Step-by-Step Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/amanraj/supportflow.git
   cd supportflow
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```

3. **Start infrastructure containers (PostgreSQL + pgvector, Redis):**
   ```bash
   docker compose up -d postgres redis
   ```

4. **Install workspace dependencies:**
   ```bash
   npm install
   ```

5. **Run database migrations:**
   ```bash
   npm run migrate
   ```

6. **Seed synthetic demonstration data (users, tickets, policy documents):**
   ```bash
   npm run seed
   ```

7. **Launch all services in development mode (API, Worker, Frontend):**
   ```bash
   npm run dev
   ```

Open your browser at `http://localhost:5173`.

---

## 5. Demonstration Accounts & Walkthrough

The seed script creates synthetic demo data with password: `SupportFlowDemo2026!`

| Role | Email Address | Capabilities |
|---|---|---|
| **Administrator** | `admin@supportflow.demo` | Full system control, user management, audit logs, document knowledge base, indexing configs. |
| **Support Agent** | `sarah.agent@supportflow.demo` | View organization tickets, assign tickets, request RAG drafts, inspect citations, edit and approve messages. |
| **Support Agent** | `marcus.agent@supportflow.demo` | Peer agent handling ticket queues and collaborating on customer issues. |
| **Customer** | `customer.one@supportflow.demo` | Customer portal, create tickets, view own tickets and message history. |
| **Customer** | `customer.two@supportflow.demo` | Independent customer account (demonstrates strict cross-customer isolation). |

### Walkthrough Script
1. **Customer:** Sign in as `customer.one@supportflow.demo`. Submit a ticket asking about refund turnaround times.
2. **Agent:** Sign in as `sarah.agent@supportflow.demo`. Open the newly created ticket, click **Generate AI Draft**.
3. **Citation Inspection:** Observe the structured response citing `[1] (Customer Refund and Returns Policy, Page 1)`.
4. **Approval Flow:** Click **Approve & Send**. The message appears as an agent reply without altering the ticket's active status.
5. **Knowledge Base:** As agent or admin, visit `/documents` to upload a PDF or inspect indexed version metadata.

---

## 6. RAG Evaluation Baseline & Quality Metrics

SupportFlow features a reproducible evaluation harness (`npm run eval:mock`) evaluating 35 benchmark queries across policy categories, edge cases, out-of-scope inquiries, and prompt injection attacks.

### Baseline Evaluation Results (2026-10-12)

| Metric | Benchmark Target | Actual Measured Result | Evaluation Status |
|---|---|---|---|
| **Retrieval Hit@K** ($K=6$) | $\ge 90\%$ | **100%** (28/28 answerable) | ✅ Pass |
| **Retrieval Recall@K** | $\ge 85\%$ | **100%** | ✅ Pass |
| **Mean Reciprocal Rank (MRR)** | $\ge 0.70$ | **0.954** | ✅ Pass |
| **Citation Validity Rate** | $100\%$ | **100%** (zero hallucinated chunk IDs) | ✅ Pass |
| **Unsupported Answer Rate** | $0\%$ | **0%** | ✅ Pass |
| **Abstention Accuracy** | $\ge 90\%$ | **28.6%** (mock retrieval filter) | ⚠️ Expected with mock hash |
| **Prompt Injection Resilience** | $100\%$ | **100%** (zero instruction leaks) | ✅ Pass |
| **Total Pipeline Latency (p50 / p95)** | $< 100\text{ms}$ | **4 ms / 5 ms** | ✅ Pass |

> **Honest Appraisal of Evaluation:**
> The baseline was measured using deterministic offline mock providers (`mock-hash-v1-384`). Keyword-feature hashing proves SQL retrieval filters, vector dimension checks, chunk boundaries, and citation validation. It does **not** prove semantic synonymy or live model reasoning. Live model benchmarks will be published separately following owner approval for real API quotas.

---

## 7. Testing & Verification Summary

Run the complete test suite locally:

```bash
npm test                  # Full test suite (151 tests across 31 test files)
npm run test:unit         # Isolated unit tests
npm run test:integration  # Domain workflows against PostgreSQL and Redis
npm run test:security     # RBAC, tenant isolation, CSRF, and rate limiting
npm run test:frontend     # React component and authentication client tests
npm run eval:mock         # RAG evaluation benchmark harness
npm run lint              # ESLint code quality check (0 errors, 0 warnings)
npm run build             # Production Vite frontend build (1622 modules bundled)
```

### Verification Matrix
- **Unit Tests:** Password hashing (Argon2id), JWT rotation, PDF extraction, page chunking, mock embeddings, citation validators, error envelopes, requestId propagation.
- **Integration Tests:** Authentication lifecycle, refresh token reuse detection, ticket transitions, full-text search, user administration, PDF upload and worker ingestion, version swap safety, vector candidate retrieval, Redis cache invalidation.
- **Security Tests:** Tenant isolation (cross-tenant 404s), CSRF rejection on missing headers/foreign origins, customer RBAC blocks on documents and AI routes, HMAC signed download token forgery checks, Redis-backed rate limiting (429 `Retry-After`).
- **Production Config Tests:** Production compose YAML isolation, closed host ports for database and Redis, mandatory password protection, and production environment guards.

---

## 8. Production Deployment Blueprint

SupportFlow provides a hardened production Docker Compose topology (`docker-compose.prod.yml`):

- **No Public DB/Redis Ports:** PostgreSQL and Redis do not publish ports to the host; they communicate strictly over the internal Docker bridge network (`supportflow_internal`).
- **Nginx Web Gateway:** Multi-stage production container (`frontend/Dockerfile.prod`) serves the compiled React SPA and reverse-proxies `/api/v1` to the API service.
- **Production Configuration Validation:** Automatically halts boot if `NODE_ENV=production` is used with mock AI providers, insecure cookies, or missing Redis passwords.
- **Persistent Data:** Dedicated persistent named volumes (`postgres_prod_data`, `redis_prod_data`, `storage_prod_data`).

See [DEPLOYMENT.md](DEPLOYMENT.md) for pre-deployment checklist and operational runbooks.

---

## 9. Project Documentation Index

- [PROJECT_PLAN.md](PROJECT_PLAN.md) — Product requirements, decision log, phase tracker, and evidence log.
- [ARCHITECTURE.md](ARCHITECTURE.md) — Service topology, data flows, caching architecture, and failure modes.
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) — PostgreSQL ER diagram, tables, indexes, and pgvector constraints.
- [API_SPEC.md](API_SPEC.md) — REST API contracts, authentication headers, error envelopes, and status codes.
- [AI_RAG_DESIGN.md](AI_RAG_DESIGN.md) — Ingestion pipeline, chunking strategies, prompt templates, and citation rules.
- [SECURITY.md](SECURITY.md) — Threat model, CSRF/cookie design, RBAC matrix, and security controls checklist.
- [TESTING.md](TESTING.md) — Testing strategy, test matrix, results log, and evaluation methodologies.
- [DEPLOYMENT.md](DEPLOYMENT.md) — Environment variables, Docker configurations, backups, and production checklist.

---

## 10. License

MIT License. Designed and developed as a production-grade AI engineering portfolio project.
