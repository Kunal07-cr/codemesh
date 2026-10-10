# Repository-grounded accuracy engine

## Audit and original failure modes

The request path is `apps/api/src/routes/ai.ts` -> the project's committed or workspace-aware index -> `searchRepository` -> `createAiProvider` -> SSE/JSON -> conversation persistence. Project permission middleware gates every assistant/evaluation endpoint. Streaming conversations are scoped by project and author; the revised route uses persisted history rather than merging untrusted client history into it.

Provider selection is unchanged: configured OpenAI-compatible endpoint/model first (including compatible Ollama endpoints), then configured Gemini, otherwise the deterministic local repository assistant. There was no learned embedding model, embedding cache, vector database, or external reranker. The old "vector" mode was a hashed-term cosine approximation, not learned semantic search. The revised strategy deliberately reports lexical/structural retrieval rather than claiming semantic embeddings.

Original problems identified in source:

- `chunkFile` omitted imports/top-level execution when symbols existed. It truncated content at 4,000 characters while keeping full-source ranges and token estimates.
- Term scoring counted common words and hash collisions; graph expansion selected the first chunk in each neighboring file.
- Ordinary short questions inherited the last user topic even without a real follow-up reference.
- Providers received 500-character citation previews instead of complete retrieved implementations, plus an independently injected active workspace file even when workspace evidence was disabled.
- Retrieved citations were attached to unconstrained model text without checking claim support. Streaming could expose that text before validation.
- The local provider mostly described declarations/locations, not the requested implementation.
- Call edges were marked verified after name-only resolution. Cross-file/member resolution is now conservative and remains a navigation hint, not runtime proof.
- ZIP extraction limits were enforced after decompression. Central-directory size/path/count checks now run before inflation.

## Implementation map

| File | Responsibility |
| --- | --- |
| `packages/code-intelligence/src/index.ts` | Project/path deduplication, artifact/gitignore exclusions, AST/heuristic symbols, bounded source windows with actual ranges |
| `packages/code-intelligence/src/groundedRetrieval.ts` | Query classification, identifier/path anchors, BM25-style relevance, dependency neighbors, deduplication and context budgets |
| `packages/ai/src/evidence.ts` | Revision/project/range checks, abstention/clarification, partial answers, validated model quotations, explicitly labeled inferences, checked streaming and source fallback |
| `packages/ai/src/index.ts` | Existing provider integrations, full evidence prompts, hard evidence rules, 30-second requests, bounded prompt size, unchanged reviewable-patch contracts |
| `packages/ai/src/benchmark.ts` | Twenty fixed questions across at least fifteen categories, authored source anchors and expected facts, per-question results and separate metrics |
| `packages/shared/src/evaluation.ts` | Shared typed evaluation report contract |
| `apps/api/src/routes/ai.ts` | Authenticated assistant/evaluation endpoints, safe evidence diagnostics, scoped history |
| `apps/api/src/services/jobQueue.ts` | Actual local evaluation execution in the existing durable in-process job queue |
| `apps/api/src/db/store.ts` | Bounded per-user/project evaluation history using existing persistence |
| `apps/api/src/services/zipImport.ts` | ZIP preflight budgets, traversal/absolute/duplicate-path rejection and selective inflation |
| `apps/web/src/pages/ProjectEvaluationPage.tsx` | Optional run history, actual progress, baseline/previous-run comparison, question and evidence inspection |
| `apps/web/src/components/AssistantSourceAnswer.tsx` | Inspectable code excerpts, copy controls and explicit inference/synthetic-data boundaries |
| `tests/ai/evidence-engine.test.ts` | Retrieval, source isolation, stale/invalid citations, fabricated provider responses, failures and independent benchmark anchors |
| `tests/api/userJourney.test.ts` | Authenticated queued evaluation and owner-only run visibility, alongside existing import/edit/review journeys |

Supporting accuracy changes:

| File | Reason for change |
| --- | --- |
| `packages/shared/src/index.ts` | Export evaluation types and extend answers with source facts, grounding diagnostics and separately labeled inference |
| `apps/api/src/config.ts` | Bound model prompt characters through existing environment configuration |
| `apps/api/src/server.ts` | Pass the existing queue into AI routes and redact CSRF headers in request logs |
| `apps/web/src/router.tsx` | Lazy-load the optional evaluation page |
| `apps/web/src/pages/ProjectOverviewPage.tsx` | Add the evaluation entry point without removing existing tools |
| `apps/web/src/components/RepositoryAssistant.tsx` | Render inspectable source answers, actual grounding states and truthful retrieval labels |
| `apps/web/src/components/InteractiveCodeGraph.tsx` | Label the existing conceptual diagram as illustrative rather than analyzed repository data |
| `scripts/evaluate-accuracy.mjs` | Reproduce local results and keep paid/live evaluation an explicit separate command |
| `package.json` | Expose the accuracy benchmark command |
| `packages/code-intelligence/package.json`, `package-lock.json` | Add the standard `ignore` parser for repository exclusion rules |
| `tests/ai/assistant.test.ts` | Assert that unchecked provider text never leaks through streaming |
| `tests/api/zipImport.test.ts` | Cover pre-inflation size limits and absolute-path rejection |
| `docs/evaluation/accuracy/baseline.json`, `docs/evaluation/accuracy/post-change.json` | Preserve actual per-question evidence, answers, failures and measured results |
| `docs/evaluation/accuracy/README.md` | Document the audit, file map, measurements, commands and limitations |

The preceding UI release and its responsive follow-up changed these files:

| File | Reason for change |
| --- | --- |
| `apps/web/src/components/ArchitectureHero.tsx` | Put the real sample repository graph into an unframed product-first hero |
| `apps/web/src/components/RepositoryGraphCanvas.tsx` | Shared source-linked React Flow canvas with focus, search, layouts, relationship filters and directed paths; refit on resize |
| `apps/web/src/lib/graphExploration.ts` | Deterministic layouts, semantic entity colors and cycle-safe graph exploration |
| `apps/web/src/lib/useReducedMotion.ts` | React to operating-system and application reduced-motion preferences |
| `apps/web/src/pages/LandingPage.tsx` | Integrate the graph-first experience while preserving supporting product sections |
| `apps/web/src/pages/WorkspacePage.tsx` | Synchronize graph selection, source navigation and contextual assistant prompts |
| `apps/web/src/pages/ProjectUniversePage.tsx` | Use actual index assembly states instead of implying unavailable repository history |
| `apps/web/src/components/RepositoryImportPanel.tsx` | Reflect real pending import states without fabricated percentages |
| `apps/web/src/components/Shell.tsx` | Add skip navigation and keep workspace ambient motion restrained |
| `apps/web/src/components/AppearancePanel.tsx` | Preserve appearance preferences safely when local storage is unavailable |
| `apps/web/src/main.tsx` | Load the shared motion stylesheet |
| `apps/web/src/landing.css` | Remove obsolete hero layout rules that obstruct the new graph-first layout |
| `apps/web/src/motion.css` | Multicolor semantic tokens, focused microinteractions, reduced motion, mobile layouts and evaluation styles |
| `tests/web/graph-exploration.test.ts` | Guard graph layouts, focus neighborhoods, relationship filtering and directed paths |

`RepositoryAssistant.tsx` was also changed in the UI release for contextual graph actions. It is listed above with its subsequent accuracy changes.

Existing graphs, workflow pages, imports, collaboration, tasks, dataset-only answers and patch review remain available. Combined-scope synthetic comparisons are separately labeled and are never current-project evidence.

## Measurement

`baseline.json` was generated with the original retrieval/provider implementations before those implementations were changed. The benchmark fixtures and source-anchored expected facts were authored independently, not generated/judged by the model. `post-change.json` is the rerun of the same twenty questions. The classifier, retrieval and provider implementations changed; expected facts did not.

| Metric | Original local baseline | Revised local run |
| --- | ---: | ---: |
| Evidence Recall@8 | 93.75% | 100% |
| MRR | 0.7969 | 0.9583 |
| Expected fact coverage | 10.42% | 100% |
| Source-supported answer checks | 5% | 100% |
| Citation precision against required source anchors | 18.42% | 96.88% |
| Abstention precision | 100% | 100% |
| Abstention recall | 25% | 100% |
| Multi-file evidence coverage | 100% | 100% |

Latency and estimated context consumption are recorded in each JSON report, not represented as model billing or production performance. A partial answer is not a full abstention. Citation precision is a macro-average of emitted citations that have valid source ranges and support the benchmark's required source anchors. A contextual quote can be structurally valid yet not match a required anchor; this remaining relevance gap is reported, not hidden.

These results measure the deterministic local/extractive assistant on small known fixtures. **They are not a claim of 100% AI accuracy**, do not prove semantic correctness for arbitrary explanations, and do not establish any live Gemini/Ollama/OpenAI-compatible model's accuracy. Live models may produce incorrect interpretations even when their quotations are valid. The interface labels interpretations as inferences, not verified facts. No live-model benchmark was run for this change.

## Commands

Run from the repository root, with Node 22.12+:

```powershell
npm ci
npm run build
npm run typecheck
npm test
npm run evaluate:accuracy
```

Results are written to `docs/evaluation/accuracy/post-change.json`. The UI action runs this same fixed suite through the backend, saves actual results and polls actual job progress. It runs the local provider and does not incur model charges or send private repositories to an external model.

To explicitly run the separate live-provider suite (up to twenty sequential requests, which may incur charges), configure the existing provider variables and then run:

```powershell
node --env-file=.env scripts/evaluate-accuracy.mjs --live --output=live
```

The script refuses live mode without an endpoint/model or Gemini key/model. It sends only public benchmark fixtures. It uses the same deterministic assertions; human review of semantic explanations is still required. Never publish `.env` or live-provider secrets.

## Configuration, deployment and limits

- `LLM_MAX_PROMPT_CHARS` defaults to 32,000 (allowed 4,000-128,000). Oversized prompts fall back to source evidence without sending an over-budget model request. This is a character ceiling, not a model-specific tokenizer. Set it conservatively for your model's context window.
- Source retrieval is capped at eight chunks and approximately 6,000 context tokens. Token estimates use source characters, not a provider tokenizer. Conversation and synthetic context are separately bounded. No model test execution is implied.
- TypeScript/JavaScript uses the existing TypeScript AST. Python retains an indentation/name heuristic. Other supported safe text files are bounded text windows, not an AST parser for every language. Cross-file/member call binding is not fully type-resolved.
- Artifact/gitignore exclusions apply to the intelligence index; safe imported source files are still retained in the workspace. Oversized retained files can be absent from semantic parsing. Re-import/re-index after changing a repository; caches are scoped to each project's rebuilt index. Retrieval does not use a shared embedding/result cache.
- The evaluation dashboard scores the fixed fixtures, **not the user's private project**. Index counters/warnings/revision are the selected project's real state. Runs are scoped to the requester and project and bounded to twenty historical completed runs per user/project.
- The job queue uses existing bounded concurrency and persistence. On a free Render service with an ephemeral file store, history can disappear on redeploy. Configure the existing PostgreSQL persistence or a supported persistent disk for durable production history.
- Commit these scoped changes and deploy through the existing Docker/Render service. Docker's order remains `npm ci` -> build -> typecheck -> tests -> prune. No new external vector database, embedding service or API credential is required.

Remaining work: evaluate real production repositories with independently reviewed multi-language facts; measure live-provider semantic correctness and billed token usage; add learned embeddings only with a configured embedding provider and evidence that they improve recall on held-out questions; improve name/alias/member resolution with a semantic type checker. Do not treat this twenty-question development suite as a held-out generalization guarantee.
