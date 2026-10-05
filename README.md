# CodeMesh

CodeMesh is a major-project prototype for graph-assisted repository understanding and AI-supported real-time collaborative development.

Implemented in this repository:

- React/Vite/TypeScript web app with Tailwind, React Router, TanStack Query, React Flow, Monaco, Socket.IO client, and Yjs.
- Express/TypeScript API with registration, login, HttpOnly cookies, refresh-token rotation, CSRF checks, CORS allowlist, and role permissions.
- Seeded TaskPilot repository with file browsing, TypeScript import/symbol indexing, architecture graph, retrieval modes, AI answers with citations, and patch preview/application.
- Socket.IO + Yjs collaborative document updates, presence, and workspace chat.
- Discussions, tasks, contribution status, GitHub not-configured state, Prisma/Postgres schema, pgvector migration, Docker Compose for Postgres/Redis/MinIO.
- Unit tests and a small reproducible retrieval evaluation script.

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

The current runnable demo uses a JSON development datastore at `storage/codemesh-dev.json`. The Prisma schema and Docker Compose services define the intended PostgreSQL/pgvector, Redis, and MinIO production path.

## Verification Results

Last verified in this workspace:

- `npm.cmd run build`: passed.
- `npm.cmd test`: 7 tests passed.
- `npm.cmd run evaluate:retrieval`: wrote 9 measured retrieval rows to `docs/evaluation/retrieval-results.json`.
- `npm.cmd audit --omit=dev --json`: production dependencies reported 0 vulnerabilities.

## Permanent Deployment

The repository includes a production `Dockerfile` and `render.yaml` blueprint.
The container builds every workspace, serves the React application from the
Express API, exposes `/api/health`, and listens on port `10000` for Render.

For a persistent public deployment, connect this repository to Render and use
the blueprint. Set `GEMINI_API_KEY` in the Render environment when hosted AI
answers are required; the repository-grounded local fallback remains available
without it. The free blueprint stores demo data on the service filesystem, so
accounts and imported repositories can reset when the service is recreated.

## Known Limitations

- GitHub App import/webhooks/PR creation are documented and permission-gated, but real installation-token write flow is not completed in this demo.
- PostgreSQL/Prisma schema is present, but the runtime API currently uses the JSON development store for easy demonstration.
- Retrieval uses deterministic local lexical/hash-vector scoring unless a Gemini configuration is provided. It is not a real embedding pipeline yet.
- The web bundle is large because Monaco is loaded in the first bundle; code-splitting is a clear next step.
- In this sandbox, the Vite dev optimizer cannot scan all dependency files, so `npm.cmd run dev` serves the production-built frontend through Express at port 4200.
- Collaborative editing uses Yjs through Socket.IO events, not a dedicated `y-websocket` server.

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

