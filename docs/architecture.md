# Codaventra Architecture

Codaventra is an npm-workspace modular monolith with a React frontend and optional external adapters. It is not a collection of independently deployed microservices.

## Runtime Components

~~~mermaid
flowchart TB
  UI["React UI: editor, graph, assistant, studios"] --> API["Express: authentication, permissions, routes"]
  UI <--> RT["Socket.IO + Yjs"]
  API --> CI["Code intelligence: AST, graph, retrieval"]
  CI --> AI["AI: local or configured provider"]
  API --> Q["In-process operation queue"]
  Q --> ENG["Engineering and systems engines"]
  API --> STORE["Application state store"]
  RT --> STORE
  ENG --> STORE
  STORE --> JSON["Atomic JSON files"]
  STORE --> PG["Optional PostgreSQL JSONB"]
  RT --> REDIS["Optional Redis fan-out"]
  API --> EXT["Optional GitHub, email, S3"]
  ENG --> WORKER["Optional separate verification worker"]
~~~

In a built deployment, Express serves `apps/web/dist` alongside the API. During UI development, Vite runs on port 5173 and calls the API on port 4200.

## Package Responsibilities

| Location | Responsibility |
| --- | --- |
| `apps/web` | Routes, project navigation, Monaco, React Flow, assistant, studio pages, and accessible motion controls. |
| `apps/api` | Authentication, authorization, imports, state, Socket.IO, orchestration, integrations, and worker clients. |
| `packages/shared` | Shared entities, Zod schemas, role permissions, task/mission/system contracts. |
| `packages/code-intelligence` | Supported AST extraction, graph construction, retrieval, impact analysis, and source consistency. |
| `packages/ai` | Local/model adapters, evidence checks, structured proposals, instruction-boundary checks, and evaluation. |
| `apps/vscode-extension` | Authenticated read-only access to repository intelligence through MCP. |

## Repository and Assistant Flow

1. An authenticated user creates or opens a project. API and realtime operations check project permissions.
2. Sample, public GitHub, or ZIP import produces bounded safe text files. Binary, credential-like, unsupported, or oversized paths can be excluded.
3. The index captures files, supported symbols/import relationships, source ranges, retrieval chunks, and a source revision.
4. The assistant retrieves repository evidence and graph context. The local provider is deterministic; configured chat/Gemini adapters can generate answers from supplied evidence.
5. Answers expose source citations and retrieval traces. Optional supplemental synthetic data is distinct from repository evidence.
6. Proposed changes remain review artifacts. Patch application checks permissions, captured base hashes, and current workspace content before updating the shared document.

## Collaborative Workspace

Socket.IO transports Yjs document updates, user presence, and workspace chat. The server repeats permission checks on joins and edits. Document text is mirrored into the application store; active CRDT state is process-local. Redis optionally distributes realtime messages but does not supply cross-instance mutation locking or job orchestration.

## Engineering and Mission Flow

Engineering Studio captures a source manifest, submits a bounded task to the operation queue, and records attempts, clarifications, proposals, and evidence. Benchmark reference answers remain evaluator-only.

Mission Studio saves a dependency graph spanning 2-10 tasks in accessible repositories. Saving does not dispatch work. Users explicitly launch ready steps and review evidence handoffs. Changed source or proposal evidence invalidates acceptance. Mission execution does not itself apply edits or publish branches.

Configured workers supply observed experiment or build/lint/test results for matching frozen source. Planning, static inspection, and human acceptance remain distinguishable from executed verification.

See [Engineering Studio](engineering-studio.md), [Mission Studio](mission-studio.md), and [Engineering Systems](engineering-systems.md).

## Persistence and Jobs

The store selects a persistence adapter using `DATABASE_URL`:

- Unset: local JSON with temporary writes and Windows backup/recovery handling.
- Set: a PostgreSQL `codemesh_state` table containing the serialized application state in JSONB, updated through a parameterized upsert.

The PostgreSQL adapter initializes its own state table. The normalized schemas under `prisma/` and `apps/api/prisma/` are not the active runtime data layer.

Jobs are persisted in application state and executed by an in-process operation queue. Locks, reservations, and shared-state ownership are designed around one API instance. Horizontal scaling needs transactional concurrency and a shared queue beyond the current adapters.

## Integration Boundaries

- GitHub App: verified webhooks, installation access, incremental sync, and repository Checks. The separate Review-to-PR path adds allowlisted draft publication after evidence and approval checks.
- S3-compatible storage: optional encrypted repository archives.
- Email webhook: configured account recovery/verification delivery.
- Metrics: protected Prometheus export; health and readiness have separate routes.
- Telemetry: scoped OTLP/HTTP JSON intake with bounded retention and heuristic source mapping.
- MCP: scoped bearer credentials and repository intelligence tools.
- OIDC/SCIM settings: readiness indicators, not a completed enterprise SSO/provisioning implementation.

## Security Model

HttpOnly access/refresh cookies, refresh rotation, CSRF checks, validation, role permissions, rate limits, and redacted audit/logging protect application actions. Project access and creator-scoped evidence checks also apply to advanced tools.

Untrusted repository code is not executed by assistant tool calls. Dedicated workers use fixed execution paths and configured isolation. Retrieved instructions and worker output remain untrusted; pattern-based instruction checks are an additional control, not a guarantee against prompt injection.

For deployment, worker, storage, and backup requirements, see [Deployment and Backup](deployment-backup.md).
