# Engineering Systems

Open a project, then Engineering > Systems. The existing editor, graph,
assistant, Change Lab, workflow pages and visual identity are unchanged.

## Implemented Capabilities

| Tool | Working path | Explicit boundary |
| --- | --- | --- |
| Verified Fix Pipeline | Reviewed frozen proposal -> durable job -> separate worker -> baseline/proposed npm build/lint/test observations | Requires a dedicated Docker host and matching dependency image; missing scripts/dependencies are NOT RUN |
| Architecture Time Machine | Retained workspace/Git exports -> re-index -> file/symbol/relationship comparison -> historical graph and read-only source diff | Captures are bounded; user-supplied Git exports are not independently authenticated against GitHub |
| API Contract Sentinel | Confirmed producer/consumer source link -> captured OpenAPI baseline -> current producer comparison | Conservative OpenAPI 3.0 JSON rules, not whole-schema/consumer correctness proof; unsupported cases remain NOT RUN |
| Live Runtime Twin | Scoped authenticated OTLP/HTTP JSON batches -> bounded span normalization -> existing source mapping -> polling runtime view | Requires an instrumented application/collector; no fabricated traces, arbitrary resource attributes are discarded |
| Review-to-PR | Passing test evidence -> exact-patch approval -> allowlisted installation -> dedicated branch and draft PR | Disabled by default; no merge, force push, workflow edit or protected-branch bypass |
| AI Evaluation Scorecards | Retained source citations + observed pipelines + held-out dataset provenance -> JSON scorecard | Citation validity is not answer truth; official SWE-bench/Defects4J score remains unavailable |
| Repository Instruction Boundary | Suspicious retrieved/active source -> abstain before provider call; reproducible canary checks | Conservative pattern checks, not immunity to prompt injection or a general jailbreak benchmark |

## Separate Verification Worker

Do not mount a Docker socket into the public API. Use a dedicated, disposable
execution host without production credentials or other workloads. Docker
container isolation is defense in depth, not a substitute for host/VM isolation.
The worker uses fixed argv, a locally resolved image digest, no network, non-root
UID, read-only source and harness, no Linux capabilities, resource/output limits
and fresh containers for every baseline/proposed stage. It stops dispatching on
an unconfirmed container cleanup. The API has no local execution fallback.

Set these on the API:

```text
VERIFICATION_WORKER_URL=https://your-private-worker.example
VERIFICATION_WORKER_TOKEN=<32+ character random secret>
```

Set the same token on the dedicated host, plus `VERIFICATION_IMAGE` referencing
an operator-prepared, already pulled Node/npm image. Run from the repository root:

```powershell
npm.cmd run verification:worker
```

Bind to loopback by default. If remotely connected, use a private/firewalled
HTTPS reverse proxy; do not expose Docker or an unauthenticated worker port.
The worker port defaults to 4302. It serializes three queued/active jobs maximum;
records expire after ten minutes. API job recovery reuses the persisted worker
job ID; an expired worker job fails rather than inventing execution evidence.

For dependencies, bake a reviewed lockfile's installed modules into
`/opt/codaventra/node_modules` and its package-lock.json SHA-256 into
`/opt/codaventra/lock.sha256`. The harness refuses a lockfile mismatch. There is
no runtime dependency installation. Dependency-free projects need no prebaked
modules. Only root package.json scripts named build/lint/test are supported;
test scripts must exit under `CI=true`. Missing scripts, exhausted output caps,
unsupported manifests and deadlines remain NOT RUN. Script names do not prove
that their definitions really build, lint or test anything; inspect them before
approval. Logs are untrusted output. All selected proposed stages must pass for
a pipeline PASS. Baseline failures that become passes are reported separately.

Results carry the frozen bundle SHA-256 and operator image identity. They are
trusted observations from the configured worker, not signed third-party
attestations. A changed workspace cannot inherit a passing verification.

## Historical Git Sources

Capture the workspace through the UI or export exact commits from an existing
local checkout. The exporter only reads Git objects; it does not checkout files,
run repository hooks/scripts, or contact a remote:

```powershell
npm.cmd run history:export -- C:\path\to\checkout <40-character-commit> owner/repository
```

The command writes one JSON envelope to stdout. Save that output as JSON using
your shell and import it in Architecture Time Machine. The repository name must
match the project's connected GitHub URL. One export contains up to 2000 safe
UTF-8 source files/1.5 MB. Binary, credential and unsupported files are excluded;
exports are marked partial. Twelve captures per project/60 per instance are
retained, with a 20 MB instance source cap. The graph viewport is bounded to 800 nodes; comparisons include all
captured source. Symbol matching uses path/kind/name, so overloads and renames
require review. Historical source opens a read-only diff, not a misleading link
to current editor contents.

## Runtime Intake

Project owners explicitly create trace-only collector credentials in the runtime
tool. The raw token is shown once, only its SHA-256 is persisted, it expires in
seven days and can be revoked. Revoking the creator's project ownership also
invalidates the token. No token is created automatically by opening the page.

Send standard OTLP/HTTP JSON (not protobuf/gRPC) to:

```text
POST /api/telemetry/<projectId>/v1/traces
Authorization: Bearer <project-scoped collector token>
Content-Type: application/json
```

This exact endpoint accepts scoped bearer credentials, never session-cookie
authentication. Browser mutations elsewhere keep CSRF protection. Intake is
limited to 200 spans/10 traces per batch and 30 requests per minute per token.
Only trace/span identities, parent, name, duration, status and eligible code path
are retained. Filter sensitive span names at the producer. Source mapping is
heuristic and its confidence stays visible. Batches are bounded observations,
not a complete trace archive. Configure an actual SDK/collector separately; the
app does not pretend that source-derived previews are observed production data.

## Draft Pull Requests

The GitHub App needs Contents and Pull Requests write permissions on a repository
the user actually authorizes. Configure the existing GitHub App settings, then:

```text
GITHUB_PUBLISH_ENABLED=true
GITHUB_PUBLISH_REPOSITORIES=owner/repository:installation_id
```

There is no default allowlist. Publication requires an owned, fresh, unapplied
engineering proposal and a matching passing pipeline containing the test stage.
Approval stores the exact patch digest. The publication action rechecks current
role, patch identity, upstream branch head, original file content, and source
freshness. It preserves executable file modes and rejects symlinks/submodules
and workflow-file edits. The installation token is narrowed to this repository
and the two required permissions. New branches are named by publication UUID;
retry verifies the expected tree and reuses an existing PR, without force push.
If the upstream base changes, capture/verify/approve again. Publication creates
a draft only, never merges. Partial failure records remain visible for recovery.

## Evaluation and Security

Scorecards count only retained creator-owned task/pipeline evidence. Denominators,
null metrics, corpus digests and adapter versions remain visible. Held-out
reference solutions never enter provider context. Three authored canary cases
check role spoofing, instruction override and secret requests. The model's tools
cannot run shell commands or obtain API secrets through this evaluation. The
guard can produce false positives and is vulnerable to obfuscation; retain the
server authorization, review and execution boundaries as independent controls.

## Verification

```powershell
npm.cmd run build
npm.cmd run typecheck
npm.cmd test
```

HTTP tests cover authorization, CSRF, capture/diff, collector grant/revocation,
trace normalization, unavailable integrations and red-team job completion.
Mocked worker/GitHub tests validate identities and request boundaries without
executing imported code or creating a real upstream PR. A real Docker image,
instrumented producer and permitted GitHub installation require operator smoke
tests before production use. Use PostgreSQL or supported persistent storage;
an ephemeral deployment filesystem loses records during redeployment.

Protocol references: [OTLP specification](https://opentelemetry.io/docs/specs/otlp/),
[GitHub commit API](https://docs.github.com/en/rest/git/commits),
[GitHub pull-request API](https://docs.github.com/en/rest/pulls/pulls).
