# Repository Proof Lab

The optional `/projects/:projectId/proof-lab` surface extends the existing project without changing its homepage, workspace, workflow, graph, or assistant designs. Entry points are the project overview and Engineering Labs.

## Six connected tools

1. **Change Observatory:** shortest dependency-hop waves from a selected file or symbol, with manual scrubbing, reduced-motion-aware replay, source ranges, and reconstructable evidence paths.
2. **Boundary experiments:** compare the baseline with hypothetical traversal barriers. Alternate paths remain reachable. Paths delayed beyond the selected horizon are not reported as isolated. No real guard or code change is applied.
3. **Dependency cycle atlas:** strongly connected dependency groups and self-loops using Graphlib, with inferred relationships explicitly identified. Structural containment/export links do not create false cycles.
4. **Source-inspection planner:** deterministic greedy file coverage of reached relationships, a session-only review checklist, direct source links, and explicit uncovered counts. This is neither a globally optimal cover nor executed test coverage.
5. **Experiment capsules:** portable JSON settings bound to project ID, revision and SHA-256 graph metadata. Strict validation rejects stale, mismatched, malformed, oversized and unknown-entity inputs. Capsules contain entity IDs (which can include private paths), not file contents or chat history. Export them only to intended recipients. The fingerprint is a compatibility check, not a signature or authenticity proof.
6. **AI challenge builder:** four source-specific prompts for citation quality, missing-symbol hallucinations, unsupported runtime guarantees, and ambiguity or historical-revision claims. The assistant link prefills a prompt; it does not submit automatically. Criteria require human review and are not fabricated accuracy scores.

## Analysis and limits

- Graphlib `4.0.5` supplies directed shortest paths and strongly connected components. Zod supplies strict capsule and settings validation.
- Only recorded `imports` and `references` relationships are considered dependencies; call edges are recorded references with a `calls` label. “Indexed” means the index marked a link verified, not that runtime behavior is proven.
- Traversing dependents reverses these dependency links; traversing dependencies follows them. Barriers stop propagation *out of* an entity while still reaching that entity.
- The horizon is 1-12 hops. Analysis refuses graphs above 2,000 nodes or 10,000 edges rather than silently calculating incomplete totals. The visual canvas shows at most 80 reached entities and reports its displayed/total count. Inspection plans contain at most 20 files.
- Fingerprints exclude generation timestamps and normalize node/edge ordering; they include entity ranges and relationship verification flags. They hash graph metadata, not source contents. Compatibility also requires the repository revision. Refresh after import or re-indexing.
- Analysis reads the committed index, not unsaved collaborative editor buffers. A graph with no links does not establish that a change is safe. Dynamic calls, unresolved imports and missing index coverage remain limitations.
- No imported scripts, mutation tests, shell commands, or model calls execute automatically. No external service, credential, public share permission, backend mutation, or storage migration was added.
- The read-only `/api/projects/:projectId/proof` endpoint returns project revision and index metadata together under the existing visibility middleware. It does not return file contents or chat history and accepts no mutation methods.
- Existing API visibility checks protect project/graph/source reads; new client caches and experiment state are scoped by project and signed-in identity. Checklists are not durable team approvals.

## Verification

```powershell
npm run typecheck --workspace @codemesh/web
npm run build --workspace @codemesh/web
npm test -- --run tests/web/proof-lab.test.ts
npm test
```

Tests cover edge direction, evidence filtering, alternate routes, horizon versus reachability, cycles/self-loops, bounded greedy coverage, reproducible fingerprints, capsule rejection, missing symbols, and ambiguous names. Existing assistant, import, authentication, realtime editing, task, review and evaluation tests remain in the full suite.

Source map: `apps/web/src/lib/proofLab.ts` (pure analysis and validation), `pages/ProjectProofLabPage.tsx` (six tools), `proof-lab.css` (isolated styling), `router.tsx` (lazy route), `pages/ProjectOverviewPage.tsx` and `pages/ProjectLabsPage.tsx` (entry points), `apps/api/src/routes/projects.ts` (read-only snapshot), `tests/web/proof-lab.test.ts` (analysis regressions), `tests/api/userJourney.test.ts` (permission and revision regressions), and web dependency/lock files.

Primary library documentation: [Graphlib](https://github.com/dagrejs/graphlib), [algorithm reference](https://github.com/dagrejs/graphlib/wiki/API-Reference).
