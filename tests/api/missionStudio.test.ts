import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createAiProvider } from "../../packages/ai/src/index";
import { missionRequestSchema } from "../../packages/shared/src/index";
import { createStore } from "../../apps/api/src/db/store";
import { loadConfig } from "../../apps/api/src/config";
import { EngineeringEngine } from "../../apps/api/src/services/engineeringEngine";
import { OperationQueue } from "../../apps/api/src/services/jobQueue";
import { MetricsRegistry } from "../../apps/api/src/services/metrics";
import { MissionStudio, missionAccessible, missionView } from "../../apps/api/src/services/missionStudio";
import { withEngineeringSubmission } from "../../apps/api/src/services/engineeringSubmissions";

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codaventra-missions-")), filePath = path.join(directory, "state.json");
  const store = await createStore(filePath), projectId = "project-sample-taskpilot", userId = store.getUserRecordByEmail("owner@codemesh.dev")!.id;
  const consumer = await store.createProject(userId, { name: "Private consumer", description: "Mission fixture", tags: [], visibility: "private", published: false, guidelines: "Review evidence" });
  await store.replaceProjectFiles(consumer.id, store.listFiles(projectId).map((file) => ({ ...file, projectId: consumer.id })), "zip", "consumer-v1");
  const queue = new OperationQueue(store, new MetricsRegistry(), 0), studio = new MissionStudio(store, queue);
  const plan = missionRequestSchema.parse({ title: "Cross-repository auth review", goal: "Review the authentication boundary in two repositories.", tasks: [
    { id: "session", title: "Producer session", projectId, objective: "Explain createSessionToken in src/auth/session.ts", mode: "investigate", dependsOn: [], maxAttempts: 2 },
    { id: "consumer", title: "Consumer guard", projectId: consumer.id, objective: "Explain requireAuth in src/auth/session.ts", mode: "investigate", dependsOn: ["session"], maxAttempts: 2 }
  ] });
  const engine = new EngineeringEngine(store, loadConfig(), createAiProvider({}));
  async function finish(runId: string) {
    const job = store.listPendingOperationJobs().find((item) => item.metadata?.runId === runId)!;
    await engine.execute(job); await store.updateOperationJob(job.id, { status: "succeeded", progress: 100 });
  }
  return { store, filePath, projectId, consumer, userId, queue, studio, plan, finish, async close() { await queue.stop(); await store.close(); await fs.rm(directory, { recursive: true, force: true }); } };
}

describe("multi-repository Mission Studio", () => {
  it("dispatches dependency steps only after current human handoffs without writing source", async () => {
    const f = await fixture();
    try {
      const baseline = JSON.stringify([f.store.listFiles(f.projectId), f.store.listFiles(f.consumer.id)]);
      let mission = await f.studio.create(f.projectId, f.userId, f.plan);
      expect(f.store.listPendingOperationJobs()).toHaveLength(0);
      expect(missionView(f.store, mission).tasks.map((task) => task.state)).toEqual(["ready", "waiting"]);
      mission = await f.studio.dispatch(f.projectId, f.userId, mission.id, mission.version);
      expect(f.store.listPendingOperationJobs()).toHaveLength(1); expect(mission.tasks[1]!.runId).toBeUndefined();
      await expect(f.studio.dispatch(f.projectId, f.userId, mission.id, mission.version - 1)).rejects.toThrow("changed");
      await f.finish(mission.tasks[0]!.runId!);
      let view = missionView(f.store, mission); expect(view.tasks[0]!.state).toBe("review"); expect(view.tasks[0]!.run!.citations).toBeGreaterThan(0);
      await expect(f.studio.accept(f.projectId, f.userId, mission.id, "session", mission.version, "0".repeat(64))).rejects.toThrow("changed");
      mission = await f.studio.accept(f.projectId, f.userId, mission.id, "session", mission.version, view.tasks[0]!.evidenceDigest!);
      expect(missionView(f.store, mission).tasks.map((task) => task.state)).toEqual(["accepted", "ready"]);
      mission = await f.studio.dispatch(f.projectId, f.userId, mission.id, mission.version);
      await f.finish(mission.tasks[1]!.runId!); view = missionView(f.store, mission);
      mission = await f.studio.accept(f.projectId, f.userId, mission.id, "consumer", mission.version, view.tasks[1]!.evidenceDigest!);
      expect(missionView(f.store, mission).status).toBe("complete");
      expect(missionView(f.store, mission).tasks.every((task) => task.run!.verification.status === "NOT_RUN")).toBe(true);
      expect(JSON.stringify([f.store.listFiles(f.projectId), f.store.listFiles(f.consumer.id)])).toBe(baseline);
      const reopened = await createStore(f.filePath); expect(reopened.getMission(f.projectId, mission.id)?.events.at(-1)?.action).toBe("evidence.accepted"); await reopened.close();
    } finally { await f.close(); }
  });
  it("invalidates accepted evidence on source drift and recaptures without auto-dispatch", async () => {
    const f = await fixture();
    try {
      let mission = await f.studio.create(f.projectId, f.userId, f.plan);
      mission = await f.studio.dispatch(f.projectId, f.userId, mission.id, mission.version); await f.finish(mission.tasks[0]!.runId!);
      mission = await f.studio.accept(f.projectId, f.userId, mission.id, "session", mission.version, missionView(f.store, mission).tasks[0]!.evidenceDigest!);
      const oldId = mission.tasks[0]!.runId!, file = f.store.listFiles(f.projectId)[0]!;
      await f.store.upsertWorkspaceDoc(f.projectId, "main", file.path, `${file.content}\n// source drift\n`);
      expect(missionView(f.store, mission).tasks.map((task) => task.state)).toEqual(["stale", "waiting"]);
      await expect(f.studio.dispatch(f.projectId, f.userId, mission.id, mission.version)).rejects.toThrow("No mission tasks");
      mission = await f.studio.recapture(f.projectId, f.userId, mission.id, "session", mission.version);
      expect(mission.tasks[0]!.previousRuns).toEqual([oldId]); expect(mission.tasks[0]!.handoff).toBeUndefined(); expect(mission.tasks[0]!.runId).toBeUndefined();
      expect(f.store.listPendingOperationJobs()).toHaveLength(0); expect(missionView(f.store, mission).tasks[0]!.state).toBe("ready");
    } finally { await f.close(); }
  });
  it("caps submissions, shares the normal engineering lock and ignores unrelated jobs", async () => {
    const f = await fixture();
    try {
      const plan = { ...f.plan, tasks: Array.from({ length: 3 }, (_, index) => ({ ...f.plan.tasks[0]!, id: `task-${index}`, dependsOn: [] })) };
      let mission = await f.studio.create(f.projectId, f.userId, plan);
      await f.store.createOperationJob({ projectId: f.projectId, createdBy: f.userId, type: "quality.scan" });
      expect(missionView(f.store, mission).summary.running).toBe(0);
      mission = await f.studio.recapture(f.projectId, f.userId, mission.id, "task-0", mission.version);
      await withEngineeringSubmission(f.store, `create:${f.userId}`, async () => {
        await expect(f.studio.dispatch(f.projectId, f.userId, mission.id, mission.version)).rejects.toThrow();
      });
      const results = await Promise.allSettled([f.studio.dispatch(f.projectId, f.userId, mission.id, mission.version), f.studio.dispatch(f.projectId, f.userId, mission.id, mission.version)]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      mission = f.studio.owned(f.projectId, f.userId, mission.id);
      expect(f.store.listPendingOperationJobs().filter((job) => job.type === "engineering.run")).toHaveLength(2);
      await expect(f.studio.dispatch(f.projectId, f.userId, mission.id, mission.version)).rejects.toThrow("Two engineering jobs");
      await expect(f.studio.recapture(f.projectId, f.userId, mission.id, "task-0", mission.version)).rejects.toThrow("active");
    } finally { await f.close(); }
  });
  it("hides the entire mission on revoked repository access and requires review permission", async () => {
    const f = await fixture();
    try {
      let mission = await f.studio.create(f.projectId, f.userId, f.plan);
      const viewer = f.store.getUserRecordByEmail("viewer@codemesh.dev")!.id;
      expect(missionAccessible(f.store, mission, viewer)).toBe(false);
      const original = f.store.getRole.bind(f.store), spy = vi.spyOn(f.store, "getRole").mockImplementation((id, userId) => id === f.consumer.id && userId === f.userId ? null : original(id, userId));
      expect(missionAccessible(f.store, mission, f.userId)).toBe(false);
      expect(() => f.studio.owned(f.projectId, f.userId, mission.id)).toThrow("not found"); spy.mockRestore();
      mission = await f.studio.dispatch(f.projectId, f.userId, mission.id, mission.version); await f.finish(mission.tasks[0]!.runId!);
      await f.store.updateMember(f.projectId, f.userId, "viewer");
      await expect(f.studio.accept(f.projectId, f.userId, mission.id, "session", mission.version, missionView(f.store, mission).tasks[0]!.evidenceDigest!)).rejects.toThrow("Review access");
      await expect(f.studio.create(f.projectId, f.userId, f.plan)).rejects.toThrow("management access");
    } finally { vi.restoreAllMocks(); await f.close(); }
  });
  it("recovers an orphaned queue reservation and enforces three capture launches", async () => {
    const f = await fixture();
    try {
      let mission = await f.studio.create(f.projectId, f.userId, f.plan);
      const spy = vi.spyOn(f.queue, "enqueue").mockRejectedValue(new Error("Queue fixture failed"));
      await expect(f.studio.dispatch(f.projectId, f.userId, mission.id, mission.version)).rejects.toThrow("Queue fixture failed"); spy.mockRestore();
      mission = f.studio.owned(f.projectId, f.userId, mission.id); const orphan = mission.tasks[0]!.runId!;
      expect(missionView(f.store, mission).tasks[0]!.state).toBe("blocked");
      mission = await f.studio.recapture(f.projectId, f.userId, mission.id, "session", mission.version);
      expect(f.store.getEngineeringRun(f.projectId, orphan)?.status).toBe("cancelled");
      for (let launch = 1; launch < 3; launch++) {
        mission = await f.studio.dispatch(f.projectId, f.userId, mission.id, mission.version); await f.finish(mission.tasks[0]!.runId!);
        if (launch < 2) mission = await f.studio.recapture(f.projectId, f.userId, mission.id, "session", mission.version);
      }
      await expect(f.studio.recapture(f.projectId, f.userId, mission.id, "session", mission.version)).rejects.toThrow("budget");
    } finally { await f.close(); }
  });
  it("cancels active tasks and prevents a cancelled plan from reopening", async () => {
    const f = await fixture();
    try {
      let mission = await f.studio.create(f.projectId, f.userId, f.plan);
      mission = await f.studio.dispatch(f.projectId, f.userId, mission.id, mission.version);
      mission = await f.studio.cancel(f.projectId, f.userId, mission.id, mission.version);
      expect(missionView(f.store, mission).status).toBe("cancelled"); expect(f.store.listPendingOperationJobs()).toHaveLength(0);
      expect(f.store.getEngineeringRun(f.projectId, mission.tasks[0]!.runId!)?.status).toBe("cancelled");
      await expect(f.studio.dispatch(f.projectId, f.userId, mission.id, mission.version)).rejects.toThrow("cancelled");
      await expect(f.studio.recapture(f.projectId, f.userId, mission.id, "session", mission.version)).rejects.toThrow("cancelled");
    } finally { await f.close(); }
  });
  it("keeps private repository source out of upstream model context", async () => {
    const f = await fixture();
    try {
      const files = f.store.listFiles(f.consumer.id);
      const source = files.find((file) => file.path === "src/auth/session.ts")!;
      source.content += "\nexport const PRIVATE_CONSUMER_CANARY = 7;\n"; source.size = source.content.length;
      await f.store.replaceProjectFiles(f.consumer.id, files, "zip", "consumer-v2");
      let mission = await f.studio.create(f.projectId, f.userId, f.plan);
      mission = await f.studio.dispatch(f.projectId, f.userId, mission.id, mission.version);
      const job = f.store.listPendingOperationJobs().find((item) => item.metadata?.runId === mission.tasks[0]!.runId)!;
      const local = createAiProvider({}); let supplied = "";
      await new EngineeringEngine(f.store, loadConfig(), { name: "mission-context-fixture", answer(request, context) { supplied = JSON.stringify({ request, context }); return local.answer(request, context); } }).execute(job);
      expect(supplied).toContain("createSessionToken"); expect(supplied).not.toContain("PRIVATE_CONSUMER_CANARY"); expect(supplied).not.toContain(f.consumer.id);
    } finally { await f.close(); }
  });
  it("rejects a late model proposal after mission cancellation", async () => {
    const f = await fixture(); let release: () => void = () => {};
    try {
      let entered: () => void = () => {};
      const started = new Promise<void>((resolve) => { entered = resolve; }), gate = new Promise<void>((resolve) => { release = resolve; });
      const plan = { ...f.plan, tasks: f.plan.tasks.map((task, index) => index ? task : { ...task, mode: "repair" as const, objective: "In src/auth/session.ts, replace `15m` with `30m`." }) };
      let mission = await f.studio.create(f.projectId, f.userId, plan);
      mission = await f.studio.dispatch(f.projectId, f.userId, mission.id, mission.version);
      const job = f.store.listPendingOperationJobs().find((item) => item.metadata?.runId === mission.tasks[0]!.runId)!;
      const local = createAiProvider({}), before = JSON.stringify(f.store.listFiles(f.projectId));
      const engine = new EngineeringEngine(f.store, loadConfig(), { name: "delayed-mission-fixture", async answer(request, context) { entered(); await gate; return local.answer(request, context); } });
      const executing = engine.execute(job); await started;
      mission = await f.studio.cancel(f.projectId, f.userId, mission.id, mission.version); release(); await executing;
      expect(f.store.getEngineeringRun(f.projectId, mission.tasks[0]!.runId!)?.status).toBe("cancelled");
      expect(f.store.listPatches(f.projectId)).toHaveLength(0); expect(JSON.stringify(f.store.listFiles(f.projectId))).toBe(before);
    } finally { release(); await f.close(); }
  });
});
