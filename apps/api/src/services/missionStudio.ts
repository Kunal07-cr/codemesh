import { randomUUID } from "node:crypto";
import { engineeringRequestSchema, hasPermission, missionOrder, type EngineeringRun, type Mission, type MissionRequest, type MissionTask, type MissionTaskView, type MissionView } from "@codemesh/shared";
import type { JsonStore } from "../db/store.js";
import { badRequest, conflict, forbidden, notFound } from "../errors.js";
import { engineeringHash, makeEngineeringRun } from "./engineeringEngine.js";
import { engineeringSourceFresh } from "./systemsEngine.js";
import type { OperationQueue } from "./jobQueue.js";
import { withEngineeringSubmission } from "./engineeringSubmissions.js";

export function missionAccessible(store: JsonStore, mission: Mission, userId: string) {
  return mission.createdBy === userId && [mission.projectId, ...mission.tasks.map((task) => task.projectId)].every((id) => hasPermission(store.getRole(id, userId), "ai.query"));
}
export function missionEvidenceDigest(run: EngineeringRun) {
  return engineeringHash(JSON.stringify({ id: run.id, attempts: run.attempts, status: run.status, manifest: run.manifest, answer: run.answer, citations: run.citations, patch: run.patch, verification: run.verification }));
}
function capture(store: JsonStore, userId: string, task: MissionRequest["tasks"][number]) {
  if (!hasPermission(store.getRole(task.projectId, userId), "ai.query")) throw forbidden("Every mission repository requires assistant access.");
  return makeEngineeringRun(store, task.projectId, userId, engineeringRequestSchema.parse({ objective: task.objective, mode: task.mode, maxAttempts: task.maxAttempts }));
}
function digest(run: EngineeringRun) { return engineeringHash(JSON.stringify(run.manifest)); }
function event(mission: Mission, action: string, taskId?: string) {
  mission.events.push({ action, taskId, createdAt: new Date().toISOString() });
  mission.events = mission.events.slice(-100);
}
export function missionView(store: JsonStore, mission: Mission): MissionView {
  const nodes = new Map<string, MissionTaskView>();
  for (const id of missionOrder(mission.tasks)) {
    const task = mission.tasks.find((item) => item.id === id)!, run = task.runId ? store.getEngineeringRun(task.projectId, task.runId) : null;
    let stale = true;
    try { stale = run ? !engineeringSourceFresh(store, run) : digest(capture(store, mission.createdBy, task)) !== task.sourceDigest || store.getProject(task.projectId)?.commitSha !== task.revision; } catch { /* Unavailable or oversized source cannot unlock a handoff. */ }
    const dependencies = task.dependsOn.every((parent) => nodes.get(parent)?.state === "accepted");
    const activeJob = Boolean(task.runId) && store.listPendingOperationJobs().some((job) => job.type === "engineering.run" && job.projectId === task.projectId && job.createdBy === mission.createdBy && job.metadata?.runId === task.runId);
    const evidenceDigest = run ? missionEvidenceDigest(run) : undefined;
    let state: MissionTaskView["state"], detail: string;
    if (mission.cancelled) { state = "cancelled"; detail = "Mission cancelled. Retained proposals remain unapplied."; }
    else if (activeJob) { state = "running"; detail = "Engineering job uses this task's frozen source."; }
    else if (stale) { state = "stale"; detail = "Source or proposal changed. Recapture before accepting or dispatching."; }
    else if (task.runId && !run) { state = "blocked"; detail = "Task evidence is no longer retained. Recapture source."; }
    else if (run && ["queued", "running"].includes(run.status)) { state = "blocked"; detail = "No active queue record was found. Recapture source to recover."; }
    else if (run?.status === "needs_input") { state = "needs_input"; detail = "Clarify this task in Engineering Studio, then return to review its evidence."; }
    else if (run && (["failed", "cancelled"].includes(run.status) || run.verification.status === "FAIL")) { state = "blocked"; detail = "The task stopped or verification failed. Review the task before recapturing."; }
    else if (run && dependencies && task.handoff?.digest === evidenceDigest) { state = "accepted"; detail = "Human-reviewed evidence handoff. This is not proof that code was applied or repaired."; }
    else if (run) { state = "review"; detail = dependencies ? "Review source evidence and any unapplied proposal before accepting this handoff." : "An upstream handoff changed. Review it before accepting this step."; }
    else if (task.launches >= 3) { state = "blocked"; detail = "Three source captures already launched for this task. Create a new mission."; }
    else { state = dependencies ? "ready" : "waiting"; detail = dependencies ? "Dependency evidence accepted. Ready for an explicit dispatch." : "Waiting for accepted upstream evidence."; }
    nodes.set(id, { ...task, state, detail, evidenceDigest, canAccept: state === "review" && dependencies && hasPermission(store.getRole(task.projectId, mission.createdBy), "workspace.review"), run: run ? { id: run.id, status: run.status, attempts: run.attempts, maxAttempts: run.maxAttempts, verification: run.verification, citations: run.citations.length, patchId: run.patch?.id } : undefined });
  }
  const tasks = mission.tasks.map((task) => nodes.get(task.id)!);
  const count = (state: MissionTaskView["state"]) => tasks.filter((task) => task.state === state).length;
  const summary = { ready: count("ready"), running: count("running"), accepted: count("accepted"), total: tasks.length, repositories: new Set(tasks.map((task) => task.projectId)).size };
  const status = mission.cancelled ? "cancelled" : summary.accepted === tasks.length ? "complete" : summary.running ? "running" : tasks.some((task) => ["review", "stale", "needs_input", "blocked"].includes(task.state)) ? "attention" : "planned";
  return { ...mission, tasks, status, summary };
}

export class MissionStudio {
  constructor(private readonly store: JsonStore, private readonly queue: OperationQueue) {}

  owned(projectId: string, userId: string, id: string) {
    const mission = this.store.getMission(projectId, id);
    if (!mission || !missionAccessible(this.store, mission, userId)) throw notFound("Mission not found.");
    return mission;
  }
  async create(projectId: string, userId: string, input: MissionRequest) {
    if (!hasPermission(this.store.getRole(projectId, userId), "project.manage")) throw forbidden("Project management access is required to create a mission.");
    const tasks = input.tasks.map((task): MissionTask => {
      const run = capture(this.store, userId, task);
      return { ...task, projectName: this.store.getProject(task.projectId)!.name, revision: run.revision, sourceDigest: digest(run), launches: 0, previousRuns: [] };
    });
    if (!tasks.some((task) => task.projectId === projectId)) throw badRequest("Include the current repository in the mission.");
    const now = new Date().toISOString();
    const mission: Mission = { id: randomUUID(), projectId, createdBy: userId, createdAt: now, updatedAt: now, title: input.title, goal: input.goal, version: 1, cancelled: false, tasks, events: [{ action: "plan.created", createdAt: now }] };
    try { return await this.store.saveMission(mission); } catch (error) { throw conflict(error instanceof Error ? error.message : "Mission cannot be saved."); }
  }
  private async mutate(projectId: string, userId: string, id: string, expectedVersion: number, action: (mission: Mission) => Promise<Mission>) {
    return withEngineeringSubmission(this.store, `mission:${userId}`, async () => {
      const mission = this.owned(projectId, userId, id);
      if (mission.version !== expectedVersion || mission.cancelled) throw conflict("The mission changed or was cancelled. Refresh it.");
      return action(mission);
    });
  }
  async dispatch(projectId: string, userId: string, id: string, version: number) {
    return this.mutate(projectId, userId, id, version, (mission) => withEngineeringSubmission(this.store, `create:${userId}`, async () => {
      const capacity = 2 - this.store.listPendingOperationJobs().filter((job) => job.createdBy === userId && job.type === "engineering.run").length;
      const ready = missionView(this.store, mission).tasks.filter((task) => task.state === "ready").slice(0, Math.max(0, capacity));
      if (!ready.length) throw conflict(capacity <= 0 ? "Two engineering jobs are already active. Wait before dispatching." : "No mission tasks are ready. Review upstream evidence or recapture changed source.");
      const runs = ready.map((task) => ({ task, run: capture(this.store, userId, task) }));
      if (runs.some(({ task, run }) => run.revision !== task.revision || digest(run) !== task.sourceDigest)) throw conflict("Source changed while dispatching. Recapture it.");
      for (const { task, run } of runs) {
        await this.store.saveEngineeringRun(run);
        const node = mission.tasks.find((item) => item.id === task.id)!;
        node.runId = run.id; node.launches++; node.handoff = undefined; event(mission, "task.dispatched", node.id);
      }
      let saved = await this.store.saveMission(mission, version);
      for (const { task, run } of runs) {
        const job = await this.queue.enqueue(task.projectId, "engineering.run", userId, { runId: run.id, missionId: mission.id, missionTaskId: task.id });
        saved.tasks.find((item) => item.id === task.id)!.jobId = job.id;
      }
      saved = await this.store.saveMission(saved, saved.version);
      return saved;
    }));
  }
  async accept(projectId: string, userId: string, id: string, taskId: string, version: number, expectedDigest: string) {
    return this.mutate(projectId, userId, id, version, async (mission) => {
      const view = missionView(this.store, mission), task = view.tasks.find((item) => item.id === taskId);
      if (!task) throw notFound("Mission task not found.");
      if (!hasPermission(this.store.getRole(task.projectId, userId), "workspace.review")) throw forbidden("Review access to this repository is required.");
      if (task.state !== "review" || task.evidenceDigest !== expectedDigest || !task.dependsOn.every((parent) => view.tasks.find((item) => item.id === parent)?.state === "accepted")) throw conflict("The source, dependency or evidence changed. Review the current task.");
      mission.tasks.find((item) => item.id === taskId)!.handoff = { digest: expectedDigest, acceptedBy: userId, acceptedAt: new Date().toISOString() };
      event(mission, "evidence.accepted", taskId);
      return this.store.saveMission(mission, version);
    });
  }
  async recapture(projectId: string, userId: string, id: string, taskId: string, version: number) {
    return this.mutate(projectId, userId, id, version, async (mission) => {
      const task = mission.tasks.find((item) => item.id === taskId);
      if (!task) throw notFound("Mission task not found.");
      if (task.launches >= 3 || (task.runId && this.store.listPendingOperationJobs().some((job) => job.type === "engineering.run" && job.projectId === task.projectId && job.createdBy === userId && job.metadata?.runId === task.runId))) throw conflict("The task is active or its capture budget is exhausted.");
      const run = capture(this.store, userId, task);
      if (task.runId) {
        task.previousRuns.push(task.runId);
        const previous = this.store.getEngineeringRun(task.projectId, task.runId);
        if (previous && ["queued", "running"].includes(previous.status)) { previous.status = "cancelled"; await this.store.saveEngineeringRun(previous); }
      }
      task.revision = run.revision; task.sourceDigest = digest(run); task.runId = undefined; task.jobId = undefined; task.handoff = undefined;
      event(mission, "source.recaptured", taskId);
      return this.store.saveMission(mission, version);
    });
  }
  async cancel(projectId: string, userId: string, id: string, version: number) {
    return this.mutate(projectId, userId, id, version, async (mission) => {
      mission.cancelled = true; event(mission, "mission.cancelled");
      const saved = await this.store.saveMission(mission, version);
      for (const task of mission.tasks) if (task.runId) {
        const run = this.store.getEngineeringRun(task.projectId, task.runId);
        if (run && ["queued", "running"].includes(run.status)) { run.status = "cancelled"; run.completedAt = new Date().toISOString(); await this.store.saveEngineeringRun(run); }
        for (const job of this.store.listPendingOperationJobs().filter((job) => job.projectId === task.projectId && job.createdBy === userId && job.metadata?.runId === task.runId)) await this.queue.cancel(task.projectId, job.id);
      }
      return saved;
    });
  }
}
