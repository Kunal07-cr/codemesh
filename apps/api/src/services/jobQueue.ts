import crypto from "node:crypto";
import { createAiProvider, evaluateRepositoryBenchmark } from "@codemesh/ai";
import { analyzeRepository, buildIncrementalIndexPlan } from "@codemesh/code-intelligence";
import type { JsonStore, OperationJob, OperationJobType } from "../db/store.js";
import type { MetricsRegistry } from "./metrics.js";

export class OperationQueue {
  private timer?: NodeJS.Timeout;
  private ticking = false;
  private readonly active = new Set<Promise<void>>();

  constructor(
    private readonly store: JsonStore,
    private readonly metrics: MetricsRegistry,
    private readonly concurrency = 2
  ) {}

  async start() {
    for (const job of this.store.listPendingOperationJobs()) {
      if (job.status === "running") {
        await this.store.updateOperationJob(job.id, { status: "queued", error: "Recovered after process restart." });
      }
    }
    this.timer = setInterval(() => void this.tick(), 500);
    this.timer.unref();
    await this.tick();
  }

  async enqueue(projectId: string, type: OperationJobType, createdBy: string, metadata?: Record<string, unknown>) {
    const job = await this.store.createOperationJob({ projectId, type, createdBy, metadata });
    void this.tick();
    return job;
  }

  async cancel(projectId: string, jobId: string) {
    return this.store.cancelOperationJob(projectId, jobId);
  }

  runtimeInfo() {
    return {
      mode: "durable-in-process",
      concurrency: this.concurrency,
      active: this.active.size,
      queued: this.store.listPendingOperationJobs().filter((job) => job.status === "queued").length
    };
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    await Promise.allSettled([...this.active]);
  }

  private async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const capacity = Math.max(0, this.concurrency - this.active.size);
      const jobs = this.store.listPendingOperationJobs().filter((job) => job.status === "queued").slice(0, capacity);
      for (const job of jobs) {
        const execution = this.run(job).finally(() => {
          this.active.delete(execution);
          void this.tick();
        });
        this.active.add(execution);
      }
    } finally {
      this.ticking = false;
    }
  }

  private async run(job: OperationJob) {
    this.metrics.recordJob("started");
    const attempts = job.attempts + 1;
    await this.store.updateOperationJob(job.id, {
      status: "running",
      progress: 10,
      attempts,
      startedAt: new Date().toISOString(),
      error: undefined
    });
    try {
      const output = await this.execute(job);
      if (this.store.getOperationJob(job.id)?.status === "cancelled") return;
      await this.store.recordAudit({ projectId: job.projectId, userId: job.createdBy, action: "operations.job_succeeded", metadata: { jobId: job.id, type: job.type } });
      this.metrics.recordJob("succeeded");
      await this.store.updateOperationJob(job.id, {
        status: "succeeded",
        progress: 100,
        output,
        completedAt: new Date().toISOString()
      });
    } catch (error) {
      if (this.store.getOperationJob(job.id)?.status === "cancelled") return;
      const message = error instanceof Error ? error.message : "Operation failed.";
      const retry = attempts < job.maxAttempts;
      if (!retry) this.metrics.recordJob("failed");
      await this.store.updateOperationJob(job.id, {
        status: retry ? "queued" : "failed",
        progress: retry ? 0 : job.progress,
        error: message,
        completedAt: retry ? undefined : new Date().toISOString()
      });
    }
  }

  private async execute(job: OperationJob): Promise<Record<string, unknown>> {
    if (job.type === "assistant.evaluate") {
      const provider = createAiProvider({});
      const report = await evaluateRepositoryBenchmark((request, index, retrieval) => provider.answer(request, { projectId: index.projectId, workspaceId: "main", commitSha: index.commitSha, index, retrieval, workspaceDocs: [] }), {
        provider: provider.name,
        onRow: async (completed, total) => {
          if (this.store.getOperationJob(job.id)?.status === "cancelled") throw new Error("Evaluation cancelled.");
          await this.store.updateOperationJob(job.id, { progress: Math.round(completed / total * 100), metadata: { completed, total, suite: "source-facts-v1", provider: provider.name } });
        }
      });
      return { report };
    }
    await this.store.updateOperationJob(job.id, { progress: 45 });
    if (job.type === "repository.reindex") {
      const index = this.store.rebuildIndex(job.projectId);
      await this.store.captureLabSnapshot(job.projectId, job.createdBy);
      return { files: index.files.length, symbols: index.symbols.length, relationships: index.graph.edges.length };
    }
    if (job.type === "repository.incremental_sync") {
      const changedPaths = Array.isArray(job.metadata?.changedPaths)
        ? job.metadata.changedPaths.filter((value): value is string => typeof value === "string")
        : [];
      const before = this.store.getIndex(job.projectId);
      const plan = buildIncrementalIndexPlan(before, changedPaths);
      const index = this.store.rebuildIndex(job.projectId);
      await this.store.captureLabSnapshot(job.projectId, job.createdBy);
      return {
        strategy: plan.strategy,
        changedFiles: plan.changedFiles.length,
        affectedFiles: plan.affectedFiles.length,
        filesAvoided: plan.estimatedFilesAvoided,
        files: index.files.length,
        symbols: index.symbols.length,
        relationships: index.graph.edges.length,
        commitSha: job.metadata?.commitSha
      };
    }
    if (job.type === "quality.scan") {
      const report = analyzeRepository(this.store.getIndex(job.projectId));
      return {
        score: report.score,
        coverageEstimate: report.coverageEstimate,
        findings: report.issues.length,
        criticalFindings: report.issues.filter((issue) => issue.severity === "critical").length
      };
    }
    if (job.type === "persistence.verify") {
      const health = await this.store.verifyPersistence();
      if (!health.ok) throw new Error(health.detail);
      return health;
    }
    const events = this.store.listAuditEvents(job.projectId, 10_000);
    const digest = crypto.createHash("sha256").update(JSON.stringify(events)).digest("hex");
    return { records: events.length, sha256: digest, generatedAt: new Date().toISOString() };
  }
}
