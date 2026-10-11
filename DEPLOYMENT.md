# DEPLOYMENT.md

> **Status: PLANNED.** Nothing has been deployed. **No public deployment, paid resource, or paid API call may be made without the owner's explicit approval.** This guide describes local development now and a production approach later.

## 1. Environments

| Environment | Purpose | Providers |
|---|---|---|
| Local dev (WSL + Docker Desktop) | daily work | mock AI, local storage |
| Test / CI | automated tests | mock AI, local storage, service containers |
| Demo (later, optional) | portfolio | decision pending; real AI optional and approved |
| Production-like (later) | only if the owner decides | real providers, Cloudinary, managed Postgres/Redis |

## 2. Windows setup checklist (beginner)

1. **Virtualization:** Task Manager → Performance → CPU → "Virtualization: Enabled". If disabled, enable it in BIOS.
2. **WSL 2:** PowerShell as Administrator: `wsl --install`, restart, create the Linux user. Verify: `wsl --status`.
3. **Docker Desktop:** install, choose the WSL 2 backend, then Settings → Resources → WSL Integration → enable your distro. Verify in WSL: `docker --version`, `docker compose version`, `docker run hello-world`.
4. **Git:** inside WSL `sudo apt update && sudo apt install -y git`, then `git config --global user.name "..."`, `git config --global user.email "..."`, `git config --global core.autocrlf input`.
5. **Node.js:** install the Node version listed in `.nvmrc` using `nvm` inside WSL. Verify `node -v`, `npm -v`.
6. **Project location:** `~/projects/supportflow` inside WSL (**not** `C:\`).
7. **Editor:** install Antigravity and open the WSL folder (see AGENTS.md "Human setup").
8. **GitHub:** create an empty **private** repository; authenticate (GitHub CLI `gh auth login` or HTTPS with a credential manager).
9. Optional tools: DBeaver/pgAdmin (database viewer), Bruno/Postman (API calls).

## 3. Local development

Two modes:

**A. Infrastructure in Docker, Node in WSL (recommended while learning, fastest feedback)**
```bash
cp .env.example .env
docker compose up -d postgres redis
npm install
npm run migrate
npm run seed         # demo data (synthetic only)
npm run dev          # starts api, worker, frontend with reload
```
In this mode, `DATABASE_URL` and `REDIS_URL` in `.env` point at `localhost` (published on 127.0.0.1) rather than the service names. `.env.example` documents both variants; the agent must keep them in sync.

**B. Everything in Docker Compose (tests the real topology)**
```bash
docker compose up --build            # postgres, redis, migrate, api, worker, frontend
docker compose ps
docker compose logs -f api worker
curl http://localhost:4000/health
curl http://localhost:4000/ready
```

Housekeeping:
```bash
docker compose down            # stop, KEEP data
docker compose down -v         # DELETE volumes (pgdata, redis, storage) - destructive, needs approval
docker compose exec postgres psql -U supportflow -d supportflow
docker compose exec redis redis-cli ping
```

Native-module rule: `argon2` (if adopted) compiles/downloads binaries per platform. `node_modules` is installed **inside** each image and the host `node_modules` is never bind-mounted over it. In mode A, `npm install` runs in WSL (Linux), which is also fine.

## 4. Environment variables (canonical reference)

Placeholders only. Real values never go into Git. The authoritative template is `.env.example`.

| Variable | Purpose | Required when |
|---|---|---|
| `NODE_ENV` | `development` / `test` / `production`. Production refuses mock providers and insecure cookies | always |
| `LOG_LEVEL` | pino level | optional |
| `API_PORT` | API listen port | always |
| `APP_BASE_URL`, `CORS_ORIGINS` | frontend origin(s) for CORS/Origin checks | always |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_TEST_DB` | database bootstrap | compose |
| `DATABASE_URL` | connection string | always |
| `REDIS_URL`, `REDIS_PASSWORD` | Redis (password required outside local dev) | always |
| `JWT_ACCESS_SECRET` | ≥ 32 random bytes | always |
| `ACCESS_TOKEN_TTL_MINUTES`, `REFRESH_TOKEN_TTL_DAYS`, `REFRESH_FAMILY_MAX_DAYS`, `REFRESH_REUSE_GRACE_SECONDS` | token lifetimes | optional (defaults) |
| `COOKIE_SECURE` | must be `true` in production | production |
| `PASSWORD_HASH_ALGORITHM` | `argon2id` or `bcrypt` (final choice recorded in decision log) | always |
| `DEFAULT_ORGANIZATION_SLUG` | org for self-registered customers | always |
| `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_TIMEOUT_MS` | LLM (`mock` needs no key) | always / real only |
| `EMBEDDING_PROVIDER`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `EMBEDDING_CONFIG_NAME` | embeddings; **must equal the active `indexing_configs` row or the app refuses to start** | always |
| `RETRIEVAL_TOP_K`, `RETRIEVAL_CANDIDATE_LIMIT`, `RETRIEVAL_MIN_SIMILARITY` | retrieval tuning (threshold tuned per config) | optional |
| `AI_REQUESTS_PER_USER_PER_HOUR` | cost guard | optional |
| `STORAGE_PROVIDER`, `LOCAL_STORAGE_DIR`, `STORAGE_URL_SIGNING_SECRET`, `SIGNED_URL_TTL_SECONDS` | storage and signed access | always |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary | when `STORAGE_PROVIDER=cloudinary` |
| `MAX_UPLOAD_MB`, `MAX_PDF_PAGES` | upload limits | optional |
| `CHUNK_SIZE_CHARS`, `CHUNK_OVERLAP_CHARS` | initial chunking defaults used when creating a config | optional |
| `INGEST_JOB_ATTEMPTS`, `INGEST_BACKOFF_MS`, `WORKER_CONCURRENCY`, `RECONCILER_INTERVAL_MINUTES`, `STUCK_JOB_MINUTES` | queue behavior | optional |
| `VITE_API_URL` | frontend build-time API base URL | frontend |
| `SEED_DEMO_PASSWORD` | demo accounts, development only | seed |

Fail-fast rule: missing or malformed required variables stop the process at startup with a message naming the variable (never printing secret values). Tested.

### External accounts

| Account | Needed | Cost note |
|---|---|---|
| GitHub | Phase 0 | free |
| Cloudinary | Phase 4 spike | check current plan/limits at signup; requires owner approval |
| LLM/embedding provider | Phase 5 real runs only | check current pricing/free tier; **approval required before any call** |
| Hosting | Phase 8+ only if chosen | approval required |

## 5. Migrations

```bash
npm run migrate              # apply pending
npm run migrate:status
npm run migrate:create -- add_something
```
Rules: forward-only in shared environments; never edit an applied migration; the `migrate` Compose service applies migrations before the API starts; **destructive migrations (drops, truncates, type changes)** require owner approval and a backup first. Production migrations run as a separate step with a privileged DB role, not at API start.

## 6. Backup and restore (planned)

```bash
docker compose exec postgres pg_dump -U supportflow -Fc supportflow > backup.dump
docker compose exec -T postgres pg_restore -U supportflow -d supportflow --clean --if-exists < backup.dump
```
Test a restore into a scratch database before trusting any backup. Uploaded PDFs live in the storage provider and need their own backup/retention plan; a document can also be re-uploaded because chunks are derived data that can be rebuilt via reindex.

## 7. Production readiness checklist (Phase 8 gate, nothing here is done)

- [ ] `NODE_ENV=production`, mock providers rejected, `COOKIE_SECURE=true`, HTTPS in front
- [ ] Same-site frontend/API (CSRF design constraint, SECURITY.md §3)
- [ ] Strong generated secrets from a secret manager/platform vars; rotation procedure written
- [ ] Postgres and Redis not publicly exposed; Redis password; DB roles least-privilege
- [ ] `docker-compose.prod.yml` (or platform config): no source mounts, non-root users, no published DB/Redis ports, restart policies, resource limits
- [ ] Health checks wired to the platform; `/ready` used for traffic gating
- [ ] Backups and a tested restore
- [ ] Log retention and PII review
- [ ] Cloudinary verification spike evidence recorded (or another storage decision documented)
- [ ] Real provider cost limits/budget alerts configured by the owner
- [ ] CI green: lint, tests, build, dependency audit, secret scan
- [ ] Owner's explicit approval to deploy publicly

## 8. CI (planned, Phase 8; a minimal lint+test version may appear earlier)

GitHub Actions workflow `.github/workflows/ci.yml`: checkout → set up Node from `.nvmrc` → `npm ci` → lint → unit/component tests → start service containers (pgvector Postgres, Redis) → migrate → integration/security tests → frontend build → Docker image build (no push). Workflows never use real AI keys. Secrets are stored in GitHub encrypted secrets only if ever needed.

## 9. Demo plan (Phase 8)

Seed data (synthetic organization, one admin, two agents, two customers, a dozen tickets, three sample policy PDFs). Demo script in `docs/demo-script.md`: 1) log in as customer, create ticket; 2) log in as agent, see ticket; 3) upload a policy PDF and watch it index; 4) request suggestion, inspect sources, approve with an edit; 5) ask an unanswerable question and show the insufficient-evidence behavior; 6) replace a document with a broken PDF and show the previous version still serving; 7) show audit log as admin. Screenshots are taken from the real running UI only.

## 10. Troubleshooting

| Problem | Check |
|---|---|
| Container exits immediately | `docker compose logs <service>`; look for the fail-fast env message |
| `migrate` fails on `CREATE EXTENSION vector` | wrong Postgres image (must be a pgvector image); `docker compose exec postgres psql -U supportflow -c "\dx"` |
| API can't reach DB | in containers use `postgres`; on host use `localhost`; check `docker compose ps` health |
| Jobs never run | worker not running or Redis URL mismatch; `docker compose logs worker`; check queue connection |
| Startup error about embedding config | `.env` embedding values differ from the active `indexing_configs` row; run `npm run indexing:status` |
| Ingestion stuck in `processing` | check worker logs; reconciler re-enqueues after `STUCK_JOB_MINUTES` |
| Port in use | stop the other service or change the host port mapping |
| Hot reload not working | repo on `C:\`; move into WSL filesystem |
| Out of disk | `docker system df`; prune only with approval (`docker system prune` removes data) |
