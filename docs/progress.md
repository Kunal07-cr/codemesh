# Codaventra Implementation Status

This document describes the current source tree. Live deployment configuration and external integration results must be checked separately.

## Application

- npm-workspace monorepo: React/Vite UI, Express/Socket.IO API, shared schemas, code intelligence, AI adapters, and a VS Code companion.
- Registration, login, refresh rotation, recovery/verification delivery hooks, session inventory, CSRF, project roles, and audit records.
- Safe sample/ZIP/public-GitHub imports, supported JS/TS graph indexing, source navigation, and impact analysis.
- Shared Monaco/Yjs workspace, presence, chat, discussions, tasks, and reviewed patch application.
- Source-cited assistant answers, conversation branches, feedback, retrieval traces, and configurable local/hosted providers.

## Advanced Workflows

| Area | Current source capability | Required boundary |
| --- | --- | --- |
| Engineering Studio | Frozen source tasks, bounded attempts, clarifications, task filters, benchmark imports, reports, and confirmed cross-repository links. | Reference answers remain outside provider context; execution is separate. |
| Mission Studio | 2-10 task dependency plans, explicit dispatch, reviewed handoffs, drift guards, cancellation, and reports. | Creator/project authorization; no automatic patch application or publication. |
| Change Experiment Lab | Built-in example, before/after probes, replay, boundary cases, and receipts. | Imported code needs a separate configured execution worker. |
| Engineering Systems | Historical graph/source comparison, conservative contract checks, runtime intake, scorecards, verified-fix jobs, and Review-to-PR. | Instrumentation, worker, and GitHub installation gates apply to their respective tools. |
| Delivery and intelligence | PR-risk reports, targeted plans, incident traces, Futures Lab receipts, Context Observatory, MCP, and expiring shares. | Static findings and estimates are distinct from observed outcomes. |
| Conversational Agent Lab | Versioned prompts, synthetic English/Hinglish sessions, guarded local tools, feedback, 36 scripted cases, and Python/SQL analysis. | Transcript prototype; no live voice/telephony or real bookings. |
| Operations | Dependency/readiness views, metrics, AI limits, persisted jobs, and integration states. | Queue execution and locks remain process-local. |

## Persistence and Integrations

- Default persistence: atomic JSON with Windows recovery handling.
- Configured `DATABASE_URL`: PostgreSQL JSONB application-state adapter.
- Optional Redis realtime fan-out, encrypted S3-compatible archives, account-email webhook, GitHub installation/webhook/check support, and hosted model generation.
- Draft publication is implemented through the separate Engineering Systems workflow and disabled by default. It needs an installation allowlist, exact proposal approval, fresh source, and matching passing test evidence.
- The normalized Prisma schemas are migration/reference assets, not the runtime store.
- Enterprise identity settings expose readiness; end-to-end OIDC/SCIM operation is not implemented.

## Verification Record

On **28 October 2026**, the current local source passed:

- `npm run build`.
- `npm run typecheck`.
- `npm test`: **215 tests across 44 files**.

This dated result does not certify production load, a live GitHub publication, worker-image behavior, live model accuracy, or the present dependency-audit result. See [Actions](https://github.com/Kunal07-cr/codemesh/actions) and run the gates again for subsequent source changes.

## Remaining Engineering Work

- Transactional state ownership and cross-instance concurrency before horizontal scaling.
- A separately operated shared job queue for distributed execution.
- Normalized database migration with a tested transfer/rollback path.
- Operator smoke tests for configured workers, instrumentation, model providers, and permitted GitHub installations.
- Restore drills, load testing, retention policies, and operational monitoring for the chosen deployment.

Existing graphs, editor workflows, and advanced tools remain part of the platform. New production work should preserve their authorization and evidence boundaries.

See the [documentation index](README.md) for setup and feature guides.
