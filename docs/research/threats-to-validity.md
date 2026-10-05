# Threats to Validity

- Small sample size: the seeded evaluation is too small for statistical claims.
- Repository selection: TaskPilot is synthetic and may not represent real codebases.
- Language coverage: current parser focuses on JavaScript and TypeScript.
- Retrieval approximation: local vector mode uses a deterministic hash-vector approximation, not learned embeddings.
- Model variability: Gemini results, when configured, may vary by model and time.
- Graph expansion cost: graph context may increase latency or add irrelevant neighbors.
- Workspace validity: CRDT convergence does not imply syntactically valid code.
- Benchmark contamination: external models may have seen public repositories or benchmark tasks.
- Participant validity: visualization benefits require a real user study before making usability claims.
- Implementation gap: production Postgres/GitHub flows are represented but not fully runtime-complete in this demo.
