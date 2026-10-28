# Deployment, Configuration, and Backup

This guide describes the configuration bundled with Codaventra. It does not provision services or confirm that an existing hosted instance is healthy.

## Local Demo

The simplest run needs Node.js and npm only:

~~~bash
npm ci
npm run build
npm run start -w @codemesh/api
~~~

With infrastructure variables unset, the API uses local JSON storage and process-local realtime state on port 4200. npm workspace scripts execute from their workspace directory; the default data location is therefore under the API workspace. Set an absolute `DATA_PATH` if you need a predictable location.

The API reads process environment variables. The start/dev scripts do not automatically read a root `.env` file.

## Environment Configuration

Use [.env.example](../.env.example) as a variable reference. Its non-empty PostgreSQL/Redis/MinIO examples assume those services exist. Do not load it unchanged for a database-free demo.

For example, in the PowerShell terminal that will start the API:

~~~powershell
$env:SESSION_SECRET = [guid]::NewGuid().ToString() + [guid]::NewGuid().ToString()
$env:DATA_PATH = Join-Path (Get-Location) "storage/codaventra-local.json"
npm.cmd run start -w @codemesh/api
~~~

Use the host's secret settings for deployed credentials. Keep actual credentials and local state out of Git.

## Optional Local Infrastructure

~~~bash
docker compose -f infra/docker-compose.yml up -d
~~~

The Compose file starts **PostgreSQL with pgvector, Redis, and MinIO**. It does not start the application or automatically connect its environment.

- Set `DATABASE_URL` to activate the existing PostgreSQL JSONB state adapter. It creates the `codemesh_state` table; the normalized Prisma schemas are not the runtime store.
- Set `REDIS_URL` for Socket.IO fan-out. Jobs still execute inside the API.
- Configure the S3-compatible settings and create the named bucket for archive storage.
- Existing JSON state is not automatically migrated by changing `DATABASE_URL`. Plan and verify data transfer separately.

## Docker and Existing Render Configuration

The root [Dockerfile](../Dockerfile) builds, type-checks, tests, and prunes development dependencies. Its runtime serves the UI through Express, runs as the Node user, and defaults to port 10000.

The [Render configuration](../render.yaml) contains one Docker web service with `/api/health` as its health path. The container's own health check uses `/api/ready`.

Before using that configuration for another deployment:

1. Set `WEB_ORIGIN`, `API_ORIGIN`, and `APP_PUBLIC_URL` to that deployment's actual HTTPS origin.
2. Supply a strong `SESSION_SECRET` and a separate `METRICS_TOKEN`.
3. Configure PostgreSQL or an appropriate persistent data location for retained records.
4. Set optional model, email, GitHub, Redis, and object-storage variables only when available.
5. Check `/api/health` for dependency states and `/api/ready` for persistence readiness.

A fresh ephemeral filesystem can lose accounts, imports, and evidence on restart or redeploy. PostgreSQL addresses persistence, but the application still assumes a single API owner: whole-state writes, queue dispatch, and mutation locks need redesign before horizontal scaling.

## Isolated Repository Execution

Keep execution disabled on the public API host. Dedicated execution hosts must not hold production credentials or share unrelated workloads.

- [Change Experiment Lab](change-experiment-lab.md): `CHANGE_LAB_WORKER_URL` and `CHANGE_LAB_WORKER_TOKEN` on the API; separately configured worker execution.
- [Engineering Systems](engineering-systems.md): `VERIFICATION_WORKER_URL` and `VERIFICATION_WORKER_TOKEN` on the API; an operator-prepared `VERIFICATION_IMAGE` on the worker.
- Worker URLs, authentication, resource limits, dependency images, and cleanup behavior must match the linked guides.
- Missing workers or unsupported scripts remain not run. Static plans do not count as executed tests.

## Optional Integrations

| Integration | Configuration and behavior |
| --- | --- |
| Hosted AI | Compatible chat endpoint or Gemini; see [provider setup](gemini-setup.md). |
| GitHub App | Webhooks/checks; optional allowlisted draft publication has additional evidence/approval gates. See [GitHub setup](github-setup.md). |
| Email | `EMAIL_WEBHOOK_URL` supplies reset/verification delivery. |
| Object storage | `S3_*` settings activate encrypted repository archives. |
| Metrics | `/api/metrics` requires the configured monitoring bearer token. |
| Enterprise identity | OIDC/SCIM settings expose readiness; they are not a finished SSO/provisioning service. |

## Backup and Recovery

Back up the actual configured data layer, then verify restoration on an isolated instance.

- **Local JSON:** stop writes before copying the state file, retain backups outside the ephemeral app filesystem, and protect them as private application data. File-save recovery handling is not a disaster-recovery system.
- **PostgreSQL:** use provider snapshots or `pg_dump`, including `codemesh_state`. Verify that application state and version metadata restore together.
- **S3/MinIO:** retain referenced archives and bucket metadata alongside database backups. Preserve encryption settings/secrets needed by the archive adapter.
- **Redis:** realtime fan-out data is not the source of record; do not substitute a Redis backup for application-state backups.
- **Configuration:** store required secrets in an approved secret store, separate from source and exported reports.

After restoring, verify login, sample/project access, file content, retained tasks, and evidence freshness. Do not replay remote publishing or worker jobs as part of a restore without reviewing their external state.
