# Change Experiment Lab

Route: `/projects/:projectId/change-lab`. Entries are in project navigation,
the overview, and Engineering Labs. Existing Proof Lab, graphs, workflows,
assistant, and review controls remain unchanged.

## What is implemented

1. Baseline and proposal execute against identical JSON-input probes. Expected
   values/errors identify regressions; an unexplained difference is `changed`,
   not automatically a defect. Loading failures/timeouts are inconclusive.
2. Manual or reduced-motion-aware replay of export invocation, captured console,
   return/error events. Source and graph come from the tested snapshot. The graph
   is an indexed structure, not an invented runtime call graph. Internal calls
   are not instrumented.
3. Deterministic boundary cases (at most 24 total), then up to six shrinking
   attempts on a differing input. Download a Node test draft using the observed
   baseline expectation. Review that assertion before adopting it.
4. Controlled single-file reversions of up to four changed files. Recovery of
   the baseline outcome identifies a possible contributor, not proven causality
   or a globally minimal failing patch. Sources are never applied or modified.
   The differing case is repeated first. Unstable outcomes withhold counterexample
   and reversion investigation; shrink attempts share the 64-execution budget.
5. Source/probe manifests, SHA-256 integrity receipts, optional complete source
   snapshots, browser verification, and replay CLI. Hashes are not signatures or
   protection against a malicious worker/module fabricating observations.

The executable session-boundary sample uses trusted built-in functions, not
imported code. It demonstrates the difference between `<` and `<=` at expiry,
and is explicitly labelled as NOT evidence about the user's repository.

## Execution boundary

The API only submits authenticated jobs to a separately operated worker. It
never evaluates or spawns imported code, even when old `SANDBOX_*` flags are set.
The worker uses fresh Linux Docker containers per probe, no network, non-root
UID/GID, read-only mounts/root filesystem, no capabilities, no-new-privileges,
32 PIDs, 256 MB RAM with no extra swap, half a CPU, a small tmpfs, bounded output,
four-second probe deadlines and a three-minute experiment deadline. Images must
be pre-pulled; the exact image ID is resolved and recorded. Keep the OS default
seccomp policy enabled. Run this worker on a disposable, dedicated host using
rootless Docker where practical, not the API/database machine.

Never mount the Docker socket inside an execution container. Do not expose the
worker directly to the internet. For a remote worker, use HTTPS behind private
network controls. The worker token is server-only and must not be in repository
snapshots, logs, frontend builds, receipts, or container environment variables.

No package installations or repository scripts run. This first execution profile
supports Node ESM/CommonJS exports with JSON arguments/results, including native
erasable TypeScript in Node 24. Native type stripping is not type checking.
TS path aliases, `.js` imports resolving to `.ts`, JSX, non-erasable TS, Python,
HTTP services, external dependencies/state, and browser applications may be
blocked. There is no unsafe local fallback to make these appear to work.

Sensitive/binary/hidden paths and obvious credential JSON files are excluded.
Source files can still contain hard-coded secrets: review source before sending
it to the worker. The worker receives the captured safe source and probe data.
All imported outputs, including console/error messages, must be treated as
untrusted. Determinism and wall-clock/randomness are NOT controlled.

Docker controls documented by [Docker security](https://docs.docker.com/engine/security/)
and [resource constraints](https://docs.docker.com/engine/containers/resource_constraints/).
TypeScript profile follows [Node type stripping](https://nodejs.org/api/typescript.html).

## Local setup on Windows

Start Docker Desktop in Linux-container mode, then from the Codaventra root:

```powershell
docker pull node:24-bookworm-slim
npm.cmd run build -w @codemesh/shared
$env:CHANGE_LAB_WORKER_TOKEN = (node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
npm.cmd run lab:worker
```

Keep this terminal open. In the API terminal, set the SAME token (do not post it
in chat), set the worker URL, then start the application:

```powershell
$env:CHANGE_LAB_WORKER_TOKEN = '<same secret from worker terminal>'
$env:CHANGE_LAB_WORKER_URL = 'http://127.0.0.1:4301'
npm.cmd run dev
```

Environment variables are read from the process. Copying `.env.example` alone
does not load it. Docker must be running before the worker starts. The hosted
API deployment needs a separately provisioned worker; these changes do not
create cloud infrastructure or enable repository execution there automatically.

Optional worker-only environment: `CHANGE_LAB_IMAGE` (default
`node:24-bookworm-slim`), `CHANGE_LAB_PORT` (4301), `CHANGE_LAB_BIND` (loopback),
`CHANGE_LAB_HARNESS_PATH` (absolute trusted harness location). Do not set an
untrusted image or harness path.

## Probes

Create an open patch against the current workspace using the existing assistant.
Select its module and function export. A patch may change one to four supported
files, with at most 200 safe files/1.5 MB in the snapshot. At most 12 explicit
cases/24 with generated cases and 64 executions are permitted.

```json
[
  { "id": "valid", "label": "Valid input", "args": [2, 3], "expected": 5 },
  { "id": "empty", "label": "Empty input", "args": [], "expectedError": "Missing arguments" }
]
```

`expectedError` matches the exact error message. `expected` and `expectedError`
are mutually exclusive. Generated inputs have no inherited expectation.
Probe/result JSON values are limited to eight nested collection levels.

## Receipts and replay

By default the receipt contains metadata, probes and outputs, but not source.
Select **Include source snapshot** for reproducibility. Inspect exports before
sharing. To replay a repository receipt through the currently configured worker:

```powershell
npm.cmd run lab:replay -- 'C:\path\codaventra-receipt.json'
```

The CLI verifies the integrity/bundle hash and requires the original worker image.
Replay is a NEW execution, not merely redisplaying old results. Built-in examples
are replayed with the app's sample action.

## Permissions, retention and limitations

Project members with `project.read` can inspect evidence; `workspace.review` is
required for execution/cancellation. Existing HttpOnly sessions, CSRF and project
RBAC apply. Stale, cross-project, unsupported and sensitive patches are rejected.
One active experiment per project; five submissions per project/user/ten minutes.
Recent completed runs are capped at ten per project and forty overall. Export
important receipts before retention removes them. Worker result records expire
after ten minutes, with one running and at most two queued jobs. API polling
persists finished results; poll within that window. There is no distributed
submission lock or durable worker queue yet. The API-side submission lock is
single-instance; use a durable queue/lease before horizontal scaling.

Unit/integration tests cover comparison rules, generated bounds, shrinking,
reversions, auth/CSRF/RBAC, source integrity, stale proposals, missing worker,
worker protocol, cancellation and trusted harness execution. These are not a
security audit of Docker/container escapes. Real Docker isolation needs a running
engine and dedicated-host testing before enabling untrusted production workloads.
Unconfirmed container cleanup degrades the worker and prevents further execution
until the operator has inspected the host and restarted it.
