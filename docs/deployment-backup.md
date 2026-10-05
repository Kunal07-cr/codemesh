# Deployment and Backup

## Local Infrastructure

```powershell
docker compose -f infra/docker-compose.yml up -d
```

This starts Postgres with pgvector, Redis, and MinIO. The API still uses the JSON dev store until a Prisma-backed store replaces `JsonStore`.

## Production Checklist

- Set strong `SESSION_SECRET`.
- Use HTTPS so Secure cookies are enabled.
- Restrict `WEB_ORIGIN` and CORS to trusted origins.
- Move persistence to Postgres/Prisma and object storage to S3/MinIO.
- Run migrations, including `CREATE EXTENSION IF NOT EXISTS vector`.
- Configure Redis-backed BullMQ for imports, indexing, webhooks, and retries.
- Configure structured log shipping and secret redaction.
- Back up Postgres and object storage together so snapshots and database rows stay consistent.

## Backup

- Postgres: scheduled `pg_dump` or managed snapshots.
- MinIO/S3: bucket versioning or periodic object replication.
- Redis: append-only persistence is enabled in local Compose, but Redis should not be the source of record.
