# Engineering Studio

## Current-State Audit

The React/Express/TypeScript monorepo already provides source indexing, repository
graphs, grounded AI providers, patch previews, runtime-span imports, static
security analysis, PR-risk reports, revision snapshots, and durable jobs. The
Change Lab uses a separate restricted Docker worker for repository probes.

The supplied roadmap is a blueprint, not bundled training data. The main gaps
are an orchestrated investigation-to-evidence workflow, benchmark adapters with
provenance, held-out/reference isolation, and verifiable cross-project contracts.
Do not replace existing project pages or claim that planning/static checks are
executed tests. Current PostgreSQL persistence stores application state as JSONB;
jobs are durable but execute within the API process.

## Implementation Plan

1. Add typed task/run records and reuse existing indexing, AI, review and jobs.
2. Import bounded JSON/JSONL benchmark exports; separate raw, normalized and
   evaluation fields. Keep reference patches and expected answers out of AI context.
3. Connect observed Change Lab results to reviewed proposals and export evidence.
4. Connect repositories with explicitly confirmed source-anchored contracts.
5. Add focused adapter, orchestration, authorization and leakage tests; verify
   builds and browser layouts without changing the current visual identity.

## Boundaries

No dataset download, model training, untrusted shell execution, original-file
modification, or GitHub write happens automatically. Existing assistant datasets
remain independent. Imported benchmark tasks cannot establish SWE-bench scores
without their matching repository revision and official evaluation harness.

## Architecture and Data Flow

Project source + task -> frozen source/manifest -> durable operation job ->
existing AST/graph retrieval -> configured grounded provider -> guarded proposal
-> explicit review -> separate Change Lab experiment -> scoped evidence report.

The original repository is never written by this workflow. Existing patch review
and stale-base checks remain authoritative. Attempts are capped at three. Retry
after a failed experiment requires a fresh source base, archives the previous
proposal ID, and supplies observed failure outcomes rather than benchmark gold
answers. Cancellation prevents later proposals from being saved; an already
in-flight provider request can continue until its provider/deadline timeout.

Benchmark raw exports, normalized records and evaluation fields are separate
properties in the private application store. They are not assistant retrieval
sources. Provider input contains only the selected task statement and captured
project source. Reference patches, hidden test names and labels remain evaluator
data. Source-code comments and task statements remain untrusted input.

## Available Interfaces

- Project navigation: Engineering, with Tasks, Benchmarks, Connections and History.
- API base: `/api/projects/:projectId/engineering`.
- Task creation/cancellation/retry/report: `/runs` and `/runs/:runId/...`.
- Benchmark import/sample/evaluation: `/datasets`, `/datasets/example`, and
  `/datasets/:corpusId/evaluate`.
- Cross-project source confirmation: `/contracts`. Owner access to both projects
  is required; inaccessible links are omitted and source drift is flagged.
- Run reports and full source snapshots are creator-scoped. Reference solutions
  are omitted from corpus summaries and from ordinary Studio responses.

## Setup and Reproducible Checks

```powershell
npm.cmd run build
npm.cmd run typecheck
npm.cmd test
npm.cmd run evaluate:datasets
npm.cmd run dev
```

Open `/projects/project-sample-taskpilot/engineering` after signing in. The CLI
evaluation runs three independently authored retrieval fixtures, not downloaded
SWE-bench tasks. It exits nonzero if an executed retrieval assertion fails.

`npm.cmd run evaluate:datasets -- path/to/import-envelope.json` accepts the same
validated import envelope as the API. The envelope contains `name`, `source`,
`sourceUrl`, `version`, `license`, `licenseReviewed`, `split`, and a JSON/JSONL
`content` string. Confirm source/record licenses yourself before setting
`licenseReviewed` to true. Imports are private and bounded to 1 MB/100 records,
five corpora per project and twenty per instance. Basic startup needs no download.

SWE-bench JSON exports and CodeSearchNet JSONL records have native field adapters.
Defects4J, task-specific CodeXGLUE data, and SARD require bounded JSON exports;
their original CSV/XML/download formats are not ingested directly. Normalized
records use `task_id`, `issue_description`, optional `repository`/`base_commit`,
`source_files: [{path, content}]`, `affected_files`, `reference_patch`, and
`expected_tests`. Security records also carry a CWE label. Corpus SHA-256 and
adapter version identify the raw input and transformations. `retrievedAt` records
the import capture time, not a separately verified upstream download time.

Project engineering tasks selected from benchmarks require the exact repository
and base commit. Imported repair/security cases remain NOT RUN in retrieval-only
evaluation. Retrieval assertions use a joint source index of the imported
retrieval records; no reference-patch fields enter that index.

## Verification and Remaining Integrations

Engineering > Systems adds selected npm-script verification, retained Git source
comparisons, conservative OpenAPI checks, a scoped OTLP JSON collector, draft-PR
approval/publishing, evidence scorecards and repository instruction boundary
checks. See [Engineering Systems](engineering-systems.md) for setup and limits.
Separate workers, instrumented producers and an explicitly authorized GitHub App
are required; no infrastructure or account permissions are enabled automatically.

The Studio distinguishes PASS, FAIL and NOT RUN. PASS for an investigation/plan
means that stage completed, not that a defect is fixed. A completed worker
experiment can be attached only when its project, patch, revision, baseline
hashes and proposed content hashes match the frozen task. Explicit expectations
are recomputed from observed outcomes. Unscored, timed-out or unstable outcomes
do not become passing repair evidence. A probe PASS is limited to its exported
function and supplied cases; it is not the repository test suite.

| Roadmap area | Implemented surface | Remaining dependency/work |
| --- | --- | --- |
| Engineering agent | Durable task stages, provider proposals, cancellation, bounded retries | Multi-agent role delegation and package-level test harness |
| Digital twin | Existing static graph and source-linked runtime-span view | Live OTLP collection and deployed telemetry producer |
| Root cause | Source-anchored candidate hypotheses and existing incident analysis | Benchmark-validated causal diagnosis |
| Migration | Captured plans and guarded multi-file proposals | Dedicated transformation/compatibility suites |
| Evaluation/repair | Held-out adapters, retrieval assertions, observed probe feedback | Official SWE-bench/Defects4J execution environments |
| Security | Existing static workbench and CWE-tagged corpus imports | Connected CodeQL/OSS-Fuzz execution and labeled precision/recall |
| PR engineer | Existing PR-risk reports, source proposals and review boundary | Authorized upstream branch/PR publishing |
| Temporal graph | Frozen source captures/history and existing graph snapshots | Full historical commit-level symbol graph ingestion |
| Cross-repository | Owner-confirmed source links and hash-based drift detection | Automated API-schema compatibility validation |
| Reliability | Step timings, attempts, source/token estimates, durable job outcomes | Provider billing usage, cost attribution and external telemetry export |

Keep `CHANGE_LAB_WORKER_URL`/`CHANGE_LAB_WORKER_TOKEN` unset until a restricted
worker is connected. No API-process fallback executes uploaded code or package
scripts. Existing LLM/Gemini variables configure generation; without a provider
key the local evidence assistant runs, but cannot guarantee arbitrary code fixes.
No GitHub write, model training, dataset redistribution, paid service creation,
or large external download is performed by adding the Studio.
