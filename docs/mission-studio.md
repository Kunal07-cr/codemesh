# Mission Studio

Mission Studio coordinates 2-10 evidence tasks across repositories the creator can access. A graphlib-validated directed acyclic graph defines the handoff order. React Flow renders the plan, and the existing Engineering Engine executes explicitly dispatched tasks.

## Workflow

1. Save an immutable plan containing a goal, task objectives, repositories, modes, dependencies and attempt limits.
2. Each task captures a source revision and manifest digest. Saving a plan does not create jobs.
3. Dispatch ready steps explicitly. The existing per-user limit allows at most two active engineering jobs, shared with ordinary Engineering Studio submissions.
4. Open a task's source-linked evidence and any proposed diff in Engineering Studio. Clarification continues the same frozen engineering run with its existing attempt budget.
5. Accept an evidence handoff explicitly. Downstream tasks become dispatchable only while every upstream handoff is current.
6. Export the report, recapture changed source, or cancel the mission.

Acceptance is a human review acknowledgement, not a passing behavioral test, applied repair, release approval or atomic multi-repository transaction. Verification remains `NOT_RUN` unless a matching experiment supplies actual verification evidence. No mission executes repository commands, applies a patch, writes a branch or publishes a pull request.

## Boundaries

- Creation requires project management access to the current repository. Every referenced repository requires assistant access.
- Lists, actions and reports are creator-scoped. Revoking access to any referenced repository hides the entire mission.
- Handoff acceptance also requires review access to that task's repository.
- Mutations use a mission version check and an in-process creator lock. Evidence acceptance additionally compares the current evidence digest.
- Each engineering request receives only its own repository source and objective. Upstream private source and benchmark reference solutions are not passed into another task's model context.
- Source edits, changed proposals and changed evidence invalidate handoffs and block downstream acceptance. A running task may finish analyzing its frozen source; stale evidence cannot unlock a new handoff.
- Source recapture clears the current handoff and run association, retaining prior run IDs. It does not dispatch anything automatically.
- Cancellation locks the plan before cancelling active jobs. Existing engine cancellation guards reject late proposal writes.
- At most three source-capture launches per task, one to three attempts per run, 100 retained mission events, 10 missions per creator and 50 per application instance. Creation is rejected at retention limits rather than silently evicting plans.
- Existing engineering-run retention can expire referenced evidence. Missing evidence is blocked and requires recapture, never reported as success.
- Plans follow the application's configured JSON/PostgreSQL store. An ephemeral deployment filesystem does not provide durable storage across redeploys or restarts. Reports are downloadable for review; permanent production persistence requires existing storage configuration to be upgraded separately.
- Orphaned queue reservations are visible as blocked tasks. Recapture cancels the orphaned run before a new explicit dispatch.

## API

All routes are rooted at `/api/projects/:projectId/missions`. Authenticated mutation requests require CSRF protection and are rate-limited.

- `GET /`: accessible repositories and creator-owned mission views.
- `POST /`: strict plan schema; cycles, self-dependencies, unknown dependencies and duplicate IDs are rejected.
- `POST /:missionId/dispatch`: `{ expectedVersion, confirmed: true }`.
- `POST /:missionId/tasks/:taskId/accept`: version, explicit confirmation and current `evidenceDigest`.
- `POST /:missionId/tasks/:taskId/recapture`: version and explicit confirmation.
- `POST /:missionId/cancel`: version and explicit confirmation.
- `GET /:missionId/report`: scoped plan, task summaries, event history, limitations and a SHA-256 payload digest. Full source snapshots are not exported.

Concurrency protection covers one application instance, consistent with the existing in-process operation queue. Horizontal scaling requires transactional cross-instance locking and a shared queue; this feature does not claim to provide either.
