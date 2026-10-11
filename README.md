# SupportFlow

> AI-assisted customer support ticketing with a citation-grounded knowledge base and mandatory human review.

**Project status: Phase 0 (documentation only).** No application code exists yet. Everything below describes the **planned** system. Nothing is *implemented* or *verified* until [PROJECT_PLAN.md](PROJECT_PLAN.md) says so with evidence.

| Legend | Meaning |
|---|---|
| 🗓 Planned | Designed in the docs, no code |
| 🛠 Implemented | Code exists, not yet proven by tests/commands |
| ✅ Verified | Proven by a recorded command/test run (see PROJECT_PLAN evidence log) |

---

## What it is

Customers open support tickets. Agents manage them and upload company policy PDFs. For a ticket, an agent can request an AI-drafted reply built **only** from retrieved policy passages. Each draft lists its sources (document + page). The agent reviews, edits, approves, or rejects it. If the knowledge base lacks evidence, the system says so instead of guessing. **The AI never sends a message or resolves a ticket by itself.**

## Planned technology

| Layer | Choice |
|---|---|
| Frontend | React, Vite, JavaScript, Tailwind CSS, React Router, reusable fetch-based API client |
| Backend | Node.js (Active LTS, pinned), Express, ES modules, Zod validation, pino logging |
| Database | PostgreSQL + pgvector, SQL migrations via `node-pg-migrate`, raw SQL through `pg` (no ORM) |
| Queue / cache | Redis, BullMQ (separate worker process), `rate-limiter-flexible` |
| AI | Provider abstraction. Deterministic **mock** providers first; one real provider chosen in Phase 5 |
| Files | `StorageProvider` abstraction: local volume first, Cloudinary (private/authenticated) in Phase 4 |
| Tests | Vitest everywhere, Supertest, React Testing Library, GitHub Actions |
| Packaging | npm workspaces, Docker, Docker Compose |

## Documentation map

| File | Read it for |
|---|---|
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | PRD, MVP scope, decision log, phases, status tracker |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Diagrams, services, flows, caching, failure behavior |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | ER diagram, tables, constraints, pgvector design, tenant rules |
| [API_SPEC.md](API_SPEC.md) | Endpoints, auth, validation, errors, pagination |
| [AI_RAG_DESIGN.md](AI_RAG_DESIGN.md) | Ingestion, retrieval, prompts, citations, embedding configs, evaluation |
| [SECURITY.md](SECURITY.md) | Auth/CSRF design, threat model, controls checklist |
| [TESTING.md](TESTING.md) | Test strategy, matrix, mock vs real, RAG evaluation |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Environment variables, Docker, backups, production gates |
| [INTERVIEW_GUIDE.md](INTERVIEW_GUIDE.md) | Explaining the project and its trade-offs |
| [AGENTS.md](AGENTS.md) | Rules for the Antigravity coding agent |

## Quick start (PLANNED — works only after Phase 1 is verified)

Prerequisites on Windows: WSL 2, Docker Desktop (WSL 2 backend), Git, Node.js (version in `.nvmrc`). Keep the repo **inside the WSL filesystem** (for example `~/projects/supportflow`), not under `C:\`.

```bash
git clone <your-repo-url> supportflow && cd supportflow
cp .env.example .env            # then edit local-only secrets
docker compose up -d postgres redis      # infrastructure only
npm install                              # run inside WSL
npm run migrate                          # apply SQL migrations
npm run dev                              # api + worker + frontend with hot reload
```

Or run everything in containers:

```bash
docker compose up --build
```

Useful commands (planned):

```bash
docker compose ps                    # service state and health
docker compose logs -f api worker    # follow logs
docker compose down                  # stop, KEEP data
docker compose down -v               # stop, DELETE data volumes (destructive)
npm test                             # all test suites
npm run lint
npm run seed                         # demo data (refuses to run in production)
```

## Demo accounts and screenshots

🗓 Planned. Demo accounts come from the seed script (synthetic data only) and will be listed here after Phase 8. Screenshots will be added after the UI exists. Placeholders: `docs/screenshots/`.

## Troubleshooting (Windows + Docker)

| Symptom | Likely cause / fix |
|---|---|
| `Cannot connect to the Docker daemon` | Start Docker Desktop; enable WSL integration for your distro in its settings |
| `port is already allocated` (5432/6379) | Another Postgres/Redis is running; stop it or change the host port in `.env` |
| `ECONNREFUSED 127.0.0.1:5432` **inside a container** | Inside containers use service names (`postgres`, `redis`), never `localhost` |
| Slow file watching or odd permission errors | Repo is under `C:\`; move it into the WSL filesystem |
| Native module errors (e.g. argon2) | Do not share `node_modules` between host and container; see DEPLOYMENT.md |
| `API refused to start: missing environment variable` | Intentional fail-fast; compare `.env` with `.env.example` |
| Line-ending errors in shell scripts | `git config --global core.autocrlf input`, re-clone |

More in [DEPLOYMENT.md](DEPLOYMENT.md).

## Honesty policy

Tests, benchmarks, latencies, costs and RAG-quality numbers are published only when actually measured, with the date, commit, and whether a mock or real provider was used. Mock-provider results say nothing about real model quality.
