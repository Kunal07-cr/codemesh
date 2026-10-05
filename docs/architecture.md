# Architecture

## Runtime Shape

CodeMesh is a modular monolith plus frontend:

- Web client: React app served by Vite during development.
- API server: Express handles REST, authentication, authorization, imports, AI requests, patch review, and health checks.
- Realtime server: Socket.IO shares the same HTTP server and transports Yjs document updates, presence, and workspace chat.
- Code intelligence package: extracts JS/TS imports, declarations, source ranges, graph nodes/edges, and retrieval chunks.
- AI package: exposes a provider interface so local demo, Gemini, or future providers can be swapped.

## Data Flow

1. A user signs in. The API sets HttpOnly access and refresh cookies plus a readable CSRF cookie.
2. The web app requests a project workspace. The API checks membership and returns files, graph, docs, role, and permissions.
3. Opening a file requests a Yjs state update over Socket.IO. Edits are applied to a Yjs document on the server and persisted as workspace snapshots.
4. AI questions call `/api/projects/:projectId/ai/ask`. The server checks `ai.query`, retrieves authorized chunks, optionally expands through graph neighbors, and returns citations.
5. Proposed patches are stored as review artifacts. Applying a patch checks the base content hash and current workspace content before updating the Yjs-backed workspace file.

## Authorization Boundaries

Roles are defined in `packages/shared/src/index.ts`. API middleware enforces project read, project manage, member manage, discussion post, task manage, workspace edit/review, AI query, and GitHub publish permissions. Socket.IO joins and Yjs updates repeat server-side permission checks.

## Production Path

The demo store is JSON for immediate local evaluation. The production path is represented by:

- `prisma/schema.prisma`
- `prisma/migrations/0001_init/migration.sql`
- `infra/docker-compose.yml`

Postgres + pgvector should own persistent data, Redis/BullMQ should own indexing jobs, and MinIO should own uploaded ZIP archives and snapshots.
