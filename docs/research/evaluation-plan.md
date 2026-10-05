# Evaluation Plan

## Implemented Seed Evaluation

The current repository includes:

- `scripts/evaluate-retrieval.mjs`
- `docs/evaluation/retrieval-results.json`

The script evaluates three questions over the seeded TaskPilot repository using vector, hybrid, and graph retrieval modes.

## Planned Dataset

- Three small permissively licensed repositories.
- Thirty manually checked repository questions.
- Ten controlled workspace edits.
- Five narrowly scoped code-change tasks.

Keep tuning questions separate from evaluation questions.

## Metrics

- Recall@k.
- Citation correctness.
- Answer correctness rubric.
- Retrieval latency.
- Generation latency.
- Context token count.
- Patch task test pass/fail.

## Reporting Rules

- Report only experiments actually run.
- Store repository commit identifiers and expected evidence.
- Do not use an LLM judge as the only authority.
- State environment, model configuration, sample size, and limitations.
