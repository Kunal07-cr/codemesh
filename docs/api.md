# Codaventra API Guide

Default local origin: `http://localhost:4200`. Most JSON responses use `{ "data": ... }`; errors use `{ "error": { "code", "message", "details", "requestId" } }`. Streaming, metrics, and external protocols have their own formats.

This guide lists the primary routes. Zod schemas and handlers in [shared types](../packages/shared/src/index.ts) and [API routes](../apps/api/src/routes/) define exact payloads and limits.

## Authentication and Mutation Rules

Browser clients send session cookies and `x-csrf-token` matching the `cm_csrf` cookie for protected mutations. Login, registration, password recovery/reset, and email verification have dedicated exceptions. Bearer-authenticated MCP, signed GitHub webhooks, and the exact scoped telemetry collector use their own controls.

Project routes enforce role permissions. Several engineering, mission, conversation, and report records are also creator-scoped. A project role does not grant access to every user's private run.

## Health and Accounts

| Method | Route |
| --- | --- |
| GET | `/api/health` |
| GET | `/api/ready` |
| GET | `/api/metrics` (configured monitoring bearer token) |
| GET | `/api/auth/me` |
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout` |
| GET | `/api/auth/sessions` |
| DELETE | `/api/auth/sessions/:sessionId` |
| POST | `/api/auth/password/forgot`, `/api/auth/password/reset` |
| POST | `/api/auth/email/verification`, `/api/auth/email/verify` |

Health describes dependency states; readiness returns 503 when persistence is unavailable. An HTTP 200 health response alone does not establish that every optional integration is configured.

## Projects and Imports

Paths below are relative to `/api/projects`.

| Method | Route |
| --- | --- |
| GET | `/discovery?search=`, `/dashboard` |
| POST | `/` |
| GET | `/:projectId`, `/:projectId/workspace`, `/:projectId/files` |
| GET | `/:projectId/files/content?path=src/main.ts` |
| GET | `/:projectId/graph`, `/:projectId/proof`, `/:projectId/intelligence`, `/:projectId/impact` |
| GET | `/:projectId/labs` |
| POST | `/:projectId/labs/snapshot` |
| POST | `/:projectId/import/sample`, `/:projectId/import/github` |
| POST | `/:projectId/import/zip/validate`, `/:projectId/import/zip` |
| GET | `/:projectId/members`, `/:projectId/settings/access-check` |
| PUT | `/:projectId/members/:userId` |

GitHub import accepts `{ "url": "https://github.com/owner/repository", "branch": "optional-branch" }` for public repositories. ZIP endpoints use multipart field `archive`. Import requires management permission and can replace existing indexed source. Path, type, file-count, and archive limits apply.

## Collaboration and Assistant

Relative to `/api/projects/:projectId`:

| Methods | Route |
| --- | --- |
| GET, POST | `/discussions`, `/discussions/:threadId/replies` |
| GET, POST | `/tasks` |
| PATCH, DELETE | `/tasks/:taskId` |
| PUT | `/tasks/:taskId/work` |
| GET | `/workspace/history`, `/contributions` |
| POST | `/patches/:patchId/apply`, `/patches/:patchId/reject` |
| POST | `/ai/ask`, `/ai/stream` |
| GET | `/ai/conversations`, `/ai/conversations/:conversationId` |
| DELETE | `/ai/conversations/:conversationId` |
| POST | `/ai/conversations/:conversationId/fork` |
| GET, POST | `/ai/evaluation` |
| GET | `/ai/dataset`, `/ai/feedback`, `/ai/feedback/:answerId` |
| PUT | `/ai/feedback/:answerId` |

`/ai/stream` emits server-sent events. Patch application requires current source/base checks. The older `POST /contributions/:contributionId/create-pr` endpoint remains distinct from the guarded Engineering Systems publication flow below.

Realtime document updates, presence, and chat use Socket.IO. See [WebSocket events](websocket-events.md).

## Engineering Studio

Relative to `/api/projects/:projectId/engineering`:

- `GET /`: runs, datasets, and available state.
- `POST /runs`: submit a task.
- `POST /runs/:runId/clarify` and `POST /runs/:runId/retry`.
- `DELETE /runs/:runId`: cancellation.
- `POST /runs/:runId/verification` and `GET /runs/:runId/report`.
- `POST /datasets`, `POST /datasets/example`, `POST /datasets/:corpusId/evaluate`.
- `POST /contracts`: confirm a source-anchored cross-repository link.

See [Engineering Studio](engineering-studio.md) for attempt, source, benchmark, and reference-isolation rules.

## Mission Studio

Relative to `/api/projects/:projectId/missions`:

- `GET /` and `POST /`.
- `POST /:missionId/dispatch` and `POST /:missionId/cancel`.
- `POST /:missionId/tasks/:taskId/accept`.
- `POST /:missionId/tasks/:taskId/recapture`.
- `GET /:missionId/report`.

Mutations use explicit confirmation and version/evidence checks. See [Mission Studio](mission-studio.md) for the exact request contracts and creator-scoped access.

## Engineering Systems and Conversation Lab

Systems base: `/api/projects/:projectId/engineering/systems`.

- `GET /`: tool state and permissions.
- `POST /revisions`, `POST /revisions/import`.
- `GET /revisions/compare`, `GET /revisions/source`.
- `POST /contracts/check`, `POST /verification`, `POST /redteam`.
- `GET /scorecard`, `POST /traces`.
- `POST /telemetry-tokens`, `DELETE /telemetry-tokens/:tokenId`.
- `POST /publications/approve`, `POST /publications/:publicationId/publish`.

The exact `POST /api/telemetry/:projectId/v1/traces` collector accepts scoped bearer credentials and OTLP/HTTP JSON.

Conversation base: `/api/projects/:projectId/engineering/conversations`.

- `GET /`, `POST /`, `POST /evaluate`.
- `POST /:runId/turns`, `POST /:runId/feedback`.

See [Engineering Systems](engineering-systems.md) and [Conversational Agent Lab](conversational-agent-lab.md) for consent, source freshness, worker, publication, and synthetic-data boundaries.

## Change Experiment Lab

Relative to `/api/projects/:projectId/change-lab`:

- `GET /` and `POST /example`.
- `POST /runs`, `GET /runs/:runId`, `DELETE /runs/:runId`.
- `GET /runs/:runId/receipt`.

See [Change Experiment Lab](change-experiment-lab.md) for supported experiments and execution requirements.

## Delivery, Operations, and External Access

Relative to `/api/projects/:projectId/delivery`:

- `GET /`.
- `POST /reviews`, `POST /sandbox`, `POST /sync`, `POST /incidents`, `POST /automation`.
- `POST /futures` and `POST /futures/:runId/reconcile`.
- `POST /tokens`, `DELETE /tokens/:tokenId`.
- `POST /shares`, `DELETE /shares/:shareId`.

Production Center uses `GET /api/projects/:projectId/operations`, `POST /api/projects/:projectId/operations/jobs`, and `DELETE /api/projects/:projectId/operations/jobs/:jobId`.

Public report lookup uses `GET /api/shares/:token`. The browser page is `/share/:token`; report scope and expiry still apply.

`POST /api/mcp` implements scoped bearer-authenticated JSON-RPC. Tools include ontology, answer, context, exact search, bounded source fetch, relationships, impact, and change planning. See the [VS Code companion](../apps/vscode-extension/README.md).

GitHub uses `GET /api/integrations/github/status` and signed `POST /api/integrations/github/webhook`. See [GitHub setup](github-setup.md).
