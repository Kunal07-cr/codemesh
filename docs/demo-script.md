# Codaventra Demo Walkthrough

Use a local demo datastore or a project you control. This walkthrough demonstrates the implemented flows and makes configured integrations visible.

## Prepare

~~~bash
npm ci
npm run build
npm run start -w @codemesh/api
~~~

Open [http://localhost:4200](http://localhost:4200). Sign in as `owner@codemesh.dev` with `CodeMesh123!`, or register an account. The sample accounts are initialized with a new datastore.

## 1. Understand a Repository

1. Open Discover or Dashboard, then **TaskPilot Sample**.
2. Open Workspace and show the file explorer, Monaco source, and code graph.
3. Select a graph node to navigate to its source. Show supported symbols, relationships, and line ranges.
4. Open AI Assistant and ask: "How does authentication protect task routes?"
5. Inspect citations and retrieval metadata. Open a cited source span rather than treating generated text as proof.

To demonstrate import, create a separate project and import a public GitHub URL or ZIP from Settings. Explain excluded paths and size/safety limits. Importing replaces that project's indexed source.

## 2. Review a Proposed Change

1. Ask the assistant to propose a specific, small change to supported source.
2. Inspect the proposed diff, base revision, and cited evidence.
3. Explain that generation and test execution are separate.
4. If demonstrating application, review the exact diff first and apply it only in the disposable demo workspace.
5. Change the base content before attempting a second application to demonstrate stale-source rejection.

Local mode supports bounded deterministic edits. Free-form generation needs a configured provider; show the actual provider state.

## 3. Engineering Studio

1. Open Engineering Studio and submit a focused investigation or change task.
2. Inspect captured source, task status, attempt count, and proposed evidence.
3. Demonstrate search/status filters and, where a run requests clarification, resume it with an explicit answer.
4. Open Systems to show Architecture Time Machine, contract checks, runtime intake, and scorecards.
5. Show verification as not run when the worker is unavailable. Only show PASS for actual matching worker observations.

## 4. Mission Studio

1. Open Mission Studio and compose a small dependency graph using repositories the current user can access.
2. Save the plan; point out that saving alone creates no running jobs.
3. Explicitly dispatch a ready task and inspect its Engineering Studio evidence.
4. Review and accept a current evidence handoff to unlock downstream work.
5. Show source-drift blocking, cancellation, or report export as appropriate.

A handoff is a human review acknowledgement. It is not a passing test, applied repair, or automatic release.

## 5. Collaboration and Permissions

1. Use a second browser session signed in as `contributor@codemesh.dev`.
2. Open the same workspace and demonstrate live edits, presence, and chat.
3. Use `viewer@codemesh.dev` to show read access and denied editing actions.
4. Open Tasks and Discussions to demonstrate the ordinary team workflow.

## 6. Labs, Delivery, and Operations

- **Engineering Labs:** use shortcuts to Proof Lab, Change Experiment Lab, Intelligence, and Workspace.
- **Change Experiment Lab:** run the built-in example. Imported-code probes need the separate worker.
- **Context Observatory:** inspect source spans, retrieval traces, estimated token baselines, and workspace drift.
- **Delivery Hub:** show reviews, incident tracing, Futures Lab receipts, MCP connection state, and expiring reports.
- **Production Center:** inspect storage, integration health, jobs, and release/security readiness.

Review-to-PR is optional. Without its allowlist, matching passing test evidence, and explicit approval, demonstrate the unavailable state. A configured publication creates a draft only.

## 7. Conversational Agent Lab

Open **Engineering > Systems > Conversational Agent Lab**.

1. Start a synthetic English or Hinglish session and choose a prompt mode.
2. Demonstrate clarification, slot selection, explicit confirmation, and human handoff.
3. Inspect typed transitions, prompt version/hash, observed latency, and feedback.
4. Run the scripted regression suite and explain its scope: nine conditions across four prompt modes, totaling 36 cases.

This lab does not make voice calls or real calendar bookings.

## Close with Evidence

Use an exported task/mission report and the source graph to explain the project's contribution. Show live configuration states honestly; synthetic previews, local regression fixtures, and observed production behavior are different evidence sources.
