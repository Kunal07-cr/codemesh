# CodeMesh

CodeMesh is a major-project prototype for graph-assisted repository understanding and AI-supported real-time collaborative development.

Implemented in this repository:

- React/Vite/TypeScript web app with Tailwind, React Router, TanStack Query, React Flow, Monaco, Socket.IO client, and Yjs.
- Express/TypeScript API with registration, login, HttpOnly cookies, refresh-token rotation, CSRF checks, CORS allowlist, and role permissions.
- Seeded TaskPilot repository with file browsing, TypeScript import/symbol indexing, architecture graph, retrieval modes, AI answers with citations, and patch preview/application.
- Socket.IO + Yjs collaborative document updates, presence, and workspace chat.
- Discussions, tasks, contribution status, repository imports, advanced code intelligence, and a visual Code Universe.
- Production Center with readiness scoring, SLO telemetry, release/security gates, AI usage, integration state, and durable maintenance jobs.
- Atomic local persistence with transparent PostgreSQL state storage when `DATABASE_URL` is configured.
- Optional Redis Socket.IO fan-out, S3-compatible encrypted repository archives, verified GitHub webhooks, and account-email delivery hooks.
- Password recovery, email verification, session inventory/revocation, per-user AI limits, Prometheus metrics, CI, CodeQL, and Dependabot.
- Unit/integration tests and a reproducible retrieval evaluation script.

## Quick Start on Windows

```powershell
cd C:\Users\LENOVO\Documents\Codex\2026-09-27\mak\outputs\codemesh
npm.cmd install --cache .\.npm-cache
npm.cmd run build
npm.cmd test
npm.cmd run dev
```

Open:

- App: http://localhost:4200
- API health: http://localhost:4200/api/health

Seeded accounts all use password `CodeMesh123!`:

- `owner@codemesh.dev`
- `maintainer@codemesh.dev`
- `contributor@codemesh.dev`
- `viewer@codemesh.dev`

## Useful Commands

```powershell
npm.cmd run seed
npm.cmd run build
npm.cmd test
npm.cmd run evaluate:retrieval
docker compose -f infra/docker-compose.yml up -d
```

## Configuration

Copy `.env.example` to `.env` for local overrides. Leave Gemini and GitHub fields blank to use the deterministic local AI provider and honest GitHub-disabled UI state.

Without infrastructure variables, CodeMesh runs with an atomic JSON datastore and single-instance realtime collaboration. Optional adapters activate automatically:

- `DATABASE_URL`: PostgreSQL-backed durable application state.
- `REDIS_URL`: multi-instance Socket.IO fan-out.
- `S3_*`: encrypted repository archive retention in S3, MinIO, or another compatible service.
- `GITHUB_*`: HMAC-verified webhook intake and push-triggered repository operations.
- `EMAIL_WEBHOOK_URL`: password-reset and email-verification delivery.
- `METRICS_TOKEN`: bearer-protected Prometheus export at `/api/metrics`.
- `LLM_*` or `GEMINI_*`: hosted model generation; grounded local repository answers remain available without a key.

Project owners can inspect the active configuration, run maintenance jobs, and review release gates at `/projects/:projectId/operations`.

## Verification Results

Use the same gates that run in GitHub Actions:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd audit --omit=dev --audit-level=high
```

## Permanent Deployment

The repository includes a production `Dockerfile` and `render.yaml` blueprint.
The container builds every workspace, serves the React application from the
Express API, exposes `/api/health`, and listens on port `10000` for Render.

Connect this repository to Render and use the blueprint. The app remains fully
usable with local fallbacks, while Production Center clearly marks unconfigured
external systems. For durable accounts and imports, attach managed PostgreSQL by
setting `DATABASE_URL`. Redis, object storage, hosted AI, GitHub App credentials,
and an email webhook can be enabled independently without rebuilding the image.

## Known Limitations

- Private GitHub repository access and upstream pull-request creation still require a GitHub App installation-token flow; public imports and signed webhooks work now.
- The PostgreSQL adapter persists the complete state transactionally as JSONB. The normalized Prisma schema remains the longer-term high-volume migration path.
- Retrieval uses deterministic local lexical/hash-vector scoring unless a hosted provider is configured.
- Durable jobs execute inside the API process. A dedicated worker service is the next scaling step for CPU-heavy indexing.
- Yjs documents are durably mirrored into the primary store, while active CRDT state remains process-local.

## Documentation

- `docs/progress.md`
- `docs/architecture.md`
- `docs/api.md`
- `docs/websocket-events.md`
- `docs/demo-script.md`
- `docs/github-setup.md`
- `docs/gemini-setup.md`
- `docs/deployment-backup.md`
- `docs/research/literature-survey.md`
