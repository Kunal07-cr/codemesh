# Codaventra Documentation

Start with the [project overview and quick start](../README.md). The guides below describe the current implementation and its configuration boundaries.

## Start and Operate

| Guide | Covers |
| --- | --- |
| [Demo walkthrough](demo-script.md) | Repository graph, assistant, review, collaboration, studios, and labs. |
| [Architecture](architecture.md) | Runtime components, data flow, persistence, jobs, and security boundaries. |
| [API guide](api.md) | Primary REST surfaces, authentication, CSRF, MCP, and telemetry. |
| [WebSocket events](websocket-events.md) | Existing realtime protocol overview. |
| [Deployment and backup](deployment-backup.md) | Local run, environment loading, Docker, storage, workers, and recovery. |
| [Implementation status](progress.md) | Completed capabilities, dated verification record, and remaining work. |

## AI, Engineering, and Review

| Guide | Covers |
| --- | --- |
| [AI provider setup](gemini-setup.md) | Local, compatible chat, and Gemini modes; evaluation scope. |
| [GitHub integration](github-setup.md) | Public import, App sync/checks, and optional guarded draft publication. |
| [Engineering Studio](engineering-studio.md) | Frozen tasks, attempts, benchmark provenance, contracts, and evidence. |
| [Engineering Systems](engineering-systems.md) | Verification workers, history, contract sentinel, runtime intake, scorecards, and PR gates. |
| [Mission Studio](mission-studio.md) | Dependency plans, explicit dispatch, human handoffs, and drift guards. |
| [Change Experiment Lab](change-experiment-lab.md) | Before/after probes, replay, execution worker, and receipts. |
| [Proof Lab](proof-lab.md) | Source-linked exploratory checks and workspace tools. |
| [Conversational Agent Lab](conversational-agent-lab.md) | Synthetic transcript sessions, prompt modes, evaluation, and Python/SQL analysis. |
| [Workspace tools](workspace-tools.md) | Existing source navigation and workspace utilities. |
| [VS Code companion](../apps/vscode-extension/README.md) | Read-only MCP integration from the editor. |

## Evaluation, Research, and Identity

- [Accuracy evaluation](evaluation/accuracy/README.md).
- [Retrieval report](evaluation/retrieval-results.json).
- [Conversation analytics SQL](conversation-analytics.sql).
- [Literature survey](research/literature-survey.md).
- [Research evaluation plan](research/evaluation-plan.md).
- [Threats to validity](research/threats-to-validity.md).
- [References](research/references.bib).
- [Brand identity](brand-identity.md).

Research plans and stored evaluation snapshots have their own dates and scope. They are not claims of current production performance. Source, configuration, observed results, and explicit not-run states take precedence over roadmap language.
