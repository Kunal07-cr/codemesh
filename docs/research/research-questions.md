# Research Questions

## RQ1

Does graph-assisted retrieval improve relevant-code retrieval and grounded answers?

Comparison:

- Vector-only retrieval.
- Hybrid lexical and vector retrieval.
- Hybrid retrieval with graph-neighborhood expansion.

Measures:

- Recall@k against manually annotated relevant files/chunks.
- Citation correctness.
- Answer correctness using a human-reviewed rubric.
- Latency and context cost.

## RQ2

Does current workspace context reduce stale answers?

Comparison:

- Committed-code-only retrieval.
- Workspace-aware retrieval over current Yjs document snapshots.

Measures:

- Correctness against the current workspace.
- References to outdated code.
- Time until workspace edits are available to retrieval.

## RQ3

Does interactive visualization help developers understand a repository?

Comparison:

- Editor-only access.
- Editor plus graph access.

Measures:

- Task completion time.
- Task correctness.
- Participant feedback.

If no participant study is executed, report only the protocol and state that usability benefits remain unvalidated.
