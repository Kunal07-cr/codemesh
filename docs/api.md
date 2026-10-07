# API Reference

Base URL: `http://localhost:4200`

All successful responses use `{ "data": ... }`. Errors use `{ "error": { "code", "message", "details", "requestId" } }`.

## Auth

- `GET /api/auth/me`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

Unsafe requests require `x-csrf-token` matching the `cm_csrf` cookie, except login and registration.

## Projects

- `GET /api/projects/discovery?search=`
- `GET /api/projects/dashboard`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `GET /api/projects/:projectId/workspace`
- `GET /api/projects/:projectId/files`
- `GET /api/projects/:projectId/files/content?path=src/main.ts`
- `GET /api/projects/:projectId/graph`
- `POST /api/projects/:projectId/import/sample`
- `POST /api/projects/:projectId/import/zip/validate`
- `POST /api/projects/:projectId/import/zip`
- `GET /api/projects/:projectId/members`
- `PUT /api/projects/:projectId/members/:userId`

## Collaboration

- `GET /api/projects/:projectId/discussions`
- `POST /api/projects/:projectId/discussions`
- `GET /api/projects/:projectId/discussions/:threadId/replies`
- `POST /api/projects/:projectId/discussions/:threadId/replies`
- `GET /api/projects/:projectId/tasks`
- `POST /api/projects/:projectId/tasks`
- `PATCH /api/projects/:projectId/tasks/:taskId`

## AI and Contributions

- `POST /api/projects/:projectId/ai/ask`
- `GET /api/projects/:projectId/contributions`
- `POST /api/projects/:projectId/patches/:patchId/apply`
- `POST /api/projects/:projectId/patches/:patchId/reject`
- `POST /api/projects/:projectId/contributions/:contributionId/create-pr`

GitHub PR creation currently returns a not-configured or not-completed state unless the GitHub App flow is finished.

## Delivery Hub

- `GET /api/projects/:projectId/delivery`
- `POST /api/projects/:projectId/delivery/reviews`
- `POST /api/projects/:projectId/delivery/sandbox`
- `POST /api/projects/:projectId/delivery/sync`
- `POST /api/projects/:projectId/delivery/incidents`
- `POST /api/projects/:projectId/delivery/automation`
- `POST /api/projects/:projectId/delivery/futures`
- `POST /api/projects/:projectId/delivery/futures/:runId/reconcile`
- `POST /api/projects/:projectId/delivery/tokens`
- `DELETE /api/projects/:projectId/delivery/tokens/:tokenId`
- `POST /api/projects/:projectId/delivery/shares`
- `DELETE /api/projects/:projectId/delivery/shares/:shareId`
- `GET /api/shares/:token`

## MCP

`POST /api/mcp` implements authenticated JSON-RPC over HTTP. Use a `Bearer cmcp_*` token created in Delivery Hub. The `simulate_change_futures` tool exposes the evidence-grounded Futures Lab to connected engineering agents.

The precise retrieval surface includes `graph_ontology`, `code_answer`, `code_context`, `search_code`, `fetch_code`, and `query_context`. Broader tools provide repository search, impact analysis, repository health, architecture documentation, generated test plans, incident tracing, Futures Lab simulation, and scoped change planning. Successful tool calls update the token handshake timestamp and append a redacted agent-activity audit event. MCP resources expose non-sensitive indexed files through `codemesh://` URIs.

`GET /api/projects/:projectId/intelligence` also returns the Context Observatory payload: measured retrieval traces, estimated whole-repository baselines, delivered and avoided tokens, exact source spans, the current content manifest, and unsynced workspace paths.

## GitHub Integration

- `GET /api/integrations/github/status`
- `POST /api/integrations/github/webhook`

The webhook requires `x-hub-signature-256`. Push events trigger incremental content sync and pull-request events create graph-aware GitHub Checks when installation credentials are configured.

