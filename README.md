<p align="center">
  <img src="apps/web/public/brand/codaventra-pathfinder-v1.png" width="96" height="96" alt="Codaventra logo">
</p>

<h1 align="center">Codaventra</h1>
<p align="center"><strong>Understand the repository. Investigate with evidence. Review every change.</strong></p>
<p align="center">
  <a href="https://codemesh-platform.onrender.com/">Live app</a> &middot;
  <a href="docs/README.md">Documentation</a> &middot;
  <a href="#quick-start">Quick start</a> &middot;
  <a href="docs/demo-script.md">Demo walkthrough</a>
</p>

Codaventra is a repository intelligence and collaborative engineering platform. It connects a source-linked code graph, a shared editor, repository-grounded AI, and human-reviewed agent workflows in one workspace.

Import a GitHub repository or ZIP, trace relationships, ask questions with file-and-line citations, and inspect proposed changes against captured source. Engineering Studio and Mission Studio organize investigation, verification evidence, and cross-repository handoffs.

This is a working major-project prototype with optional infrastructure adapters. The sections below distinguish local capabilities from integrations that require configuration.

## What You Can Do

| Area | Capabilities |
| --- | --- |
| Repository workspace | GitHub/ZIP imports, file explorer, Monaco editor, synchronized graph/source navigation, source history, and impact views. Import safety and resource limits apply; binaries and excluded files are not indexed. |
| Repository-grounded assistant | Source-cited answers, conversation history and branches, feedback, retrieval traces, and reviewable patch proposals. Configurable hosted models or a deterministic local provider. |
| Collaboration | Yjs/Socket.IO document updates, presence, workspace chat, discussions, tasks, and role-controlled editing/review. |
| Engineering Studio | Frozen source manifests, bounded investigation/proposal attempts, clarification follow-ups, task search/status filters, benchmark imports, and exportable evidence. |
| Mission Studio | Dependency graphs for 2-10 tasks across accessible repositories, explicit dispatch, reviewed handoffs, source-drift guards, cancellation, and reports. |
| Change Experiment Lab | Before/after probes, event replay, boundary cases, regression-test drafts, and integrity receipts. Imported-code execution requires a separate restricted worker. |
| Engineering Systems | Architecture Time Machine, API Contract Sentinel, runtime-span intake, verified-fix pipelines, evaluation scorecards, instruction-boundary checks, and guarded draft-PR publishing. |
| Delivery and observability | Graph-aware reviews, targeted test plans, incident tracing, Repository Futures Lab, Context Observatory, expiring reports, MCP tokens, and a VS Code companion. |
| Operations | Persistence/integration health, job status, SLO telemetry, release/security readiness, AI usage controls, Prometheus metrics, and audit events. |
| Conversational Agent Lab | Synthetic English/Hinglish demo-booking transcripts, four prompt modes, confirmation guards, handoff, and 36 scripted regression cases with Python/SQL analysis. |

The interface also includes a multicolor dark theme, animated repository visuals, page/loading transitions, microinteractions, quick-open navigation, and reduced-motion support.

## Typical Workflow

~~~mermaid
flowchart LR
  A["Import repository"] --> B["Index files and symbols"]
  B --> C["Explore graph and source"]
  C --> D["Ask or investigate"]
  D --> E["Review cited evidence and proposed diff"]
  E --> F["Verify on separate worker"]
  F --> G["Accept evidence or approve a draft PR"]
~~~

Verification and GitHub publication are explicit, separately configured steps. A generated answer or accepted mission handoff does not establish that tests passed.

## Quick Start

Use **Node.js 24** and npm. The declared minimum is Node.js 22.12.0; Node.js 24 is used by CI and the Dockerfile. Python is optional for analysis scripts. No external database or model credentials are required for the local demo.

~~~bash
git clone https://github.com/Kunal07-cr/codemesh.git
cd codemesh
npm ci
npm run build
npm run start -w @codemesh/api
~~~

On Windows, use `npm.cmd` instead of `npm` if PowerShell blocks the npm script.

Open [http://localhost:4200](http://localhost:4200). The API serves the built frontend on the same port.

### Demo Accounts

A newly initialized datastore seeds the TaskPilot sample and these demonstration accounts:

| Role | Email |
| --- | --- |
| Owner | `owner@codemesh.dev` |
| Maintainer | `maintainer@codemesh.dev` |
| Contributor | `contributor@codemesh.dev` |
| Viewer | `viewer@codemesh.dev` |

Demo password: `CodeMesh123!`. These are public sample credentials, not private secrets. Registration is also available.

### Development

`npm run dev` rebuilds the workspaces and starts the API watcher. For frontend hot reload, build once, then run these in separate terminals from the repository root:

~~~bash
npm run dev -w @codemesh/api
~~~

~~~bash
npm run dev -w @codemesh/web
~~~

Open [http://localhost:5173](http://localhost:5173) for the Vite development UI. Its default API target is `http://localhost:4200`.

### Configuration

[.env.example](.env.example) lists the supported settings and local infrastructure examples. The API reads process environment variables; its npm start/dev scripts do not automatically load a root `.env` file. Export settings in your shell or inject them through your host/container.

For the simplest demo, leave infrastructure variables unset. The example file contains non-empty PostgreSQL, Redis, and MinIO values; loading it unchanged selects those local services and requires them to be running.

| Setting | Purpose |
| --- | --- |
| `SESSION_SECRET`, `WEB_ORIGIN`, `API_ORIGIN`, `APP_PUBLIC_URL` | Session signing and deployment origins. |
| `DATA_PATH` | Local JSON state location when `DATABASE_URL` is unset. |
| `DATABASE_URL` | PostgreSQL application-state persistence using JSONB. |
| `LLM_BASE_URL` + `LLM_MODEL`, optional `LLM_API_KEY` | OpenAI-compatible chat provider; takes priority over Gemini when configured. |
| `GEMINI_API_KEY` + `GEMINI_MODEL` | Optional Gemini generation provider. |
| `REDIS_URL` | Socket.IO fan-out; not a distributed job queue. |
| `S3_*` | Optional encrypted repository archive storage. |
| `GITHUB_*` | GitHub App credentials, webhooks, checks, and separately enabled publishing. |
| `CHANGE_LAB_WORKER_*`, `VERIFICATION_WORKER_*` | Dedicated execution-worker connections. |
| `EMAIL_WEBHOOK_URL`, `METRICS_TOKEN` | Account-email delivery and protected metrics export. |

See [AI provider setup](docs/gemini-setup.md), [GitHub integration](docs/github-setup.md), and [deployment and backup](docs/deployment-backup.md).

## Technology and Structure

| Layer | Implementation |
| --- | --- |
| Web | React, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, Monaco, React Flow. |
| API | Express, TypeScript, Zod, cookie sessions, CSRF checks, role permissions, structured logging. |
| Intelligence | TypeScript AST analysis, graph/hybrid retrieval, source manifests, provider adapters, and evidence evaluation. |
| Realtime | Socket.IO and Yjs; optional Redis fan-out. |
| Persistence | Atomic local JSON or PostgreSQL JSONB state; optional S3-compatible archive storage. |
| Tooling | npm workspaces, Vitest, Python/SQL analysis scripts, Docker, GitHub Actions, CodeQL, Dependabot. |

~~~text
apps/
  web/                   React UI and repository workspace
  api/                   REST, realtime, services, and worker entry points
  vscode-extension/      Read-only repository intelligence companion
packages/
  shared/                Types, validation schemas, roles, and permissions
  code-intelligence/     Indexing, graphs, retrieval, and change analysis
  ai/                    Providers, evidence checks, and evaluation logic
docs/                    Setup, architecture, feature guides, and research
tests/                   Unit, API, realtime, and UI-logic tests
scripts/                 Evaluation, history export, and worker harnesses
samples/                 Seeded TaskPilot source
prisma/                  Normalized schema and migration reference
infra/                   Local PostgreSQL, Redis, and MinIO Compose stack
~~~

## Verification

~~~bash
npm run build
npm run typecheck
npm test
~~~

The local verification run on **28 October 2026** passed the build, type checks, and **215 tests across 44 test files**. This is a dated local result; use [GitHub Actions](https://github.com/Kunal07-cr/codemesh/actions) for later runs.

Additional commands:

~~~bash
npm run evaluate:retrieval
npm run evaluate:accuracy
npm run evaluate:datasets
npm run evaluate:conversations --silent
npm audit --omit=dev --audit-level=high
~~~

Build first for evaluation scripts that import compiled packages. Evaluation commands can write reports. Audit status and live model quality are separate checks and are not implied by the local test count. Scripted fixtures are regression checks, not general AI-accuracy benchmarks.

## Deployment

The [Dockerfile](Dockerfile) builds and verifies the workspaces, then serves the web app through Express on port `10000`. [render.yaml](render.yaml) describes the existing Render-oriented service configuration.

- Health: `/api/health`; persistence readiness: `/api/ready`.
- Set deployment origins and a strong session secret through the host environment.
- Use PostgreSQL or properly backed-up persistent storage for retained accounts and imports.
- Configure model, email, object storage, and GitHub integrations independently.
- Keep repository execution off the public API host; workers require separate configuration.

The Render service uses the existing URL [codemesh-platform.onrender.com](https://codemesh-platform.onrender.com/). Repository documentation updates do not verify live deployment health.

## Implementation Boundaries

- Default AI answers use deterministic local retrieval and templates; free-form generation requires a configured model. Citations support traceability, not a guarantee of correctness.
- Indexing is bounded static analysis. Imported source need not include every file, and relationship extraction is strongest for supported JavaScript/TypeScript patterns.
- PostgreSQL stores the application's complete state as JSONB. The normalized Prisma schema is not the active runtime repository layer.
- Jobs and concurrency locks are process-local. PostgreSQL and Redis fan-out alone do not make multiple API instances safe.
- Verified-fix pipelines and imported-code experiments need dedicated workers. Unavailable execution is reported as not run.
- Draft PR publishing requires a configured and allowlisted GitHub App, fresh source, matching passing test evidence, and explicit approval. It never merges.
- Mission handoff acceptance is a review acknowledgement, not a passing test or applied repair.
- Conversational Agent Lab uses synthetic transcripts. It does not provide live calls, speech recognition, speech synthesis, or real calendar bookings.

## Documentation

Start with the [documentation index](docs/README.md), [architecture](docs/architecture.md), [demo walkthrough](docs/demo-script.md), and [current implementation status](docs/progress.md).

### Naming Compatibility

The product is **Codaventra**. The repository name, `@codemesh/*` package names, demo accounts, cookies, saved-browser keys, MCP resource scheme, and existing hosted URL retain their original identifiers so integrations and saved data remain compatible.
