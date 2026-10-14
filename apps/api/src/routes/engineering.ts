import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { benchmarkImportSchema, contractLinkSchema, engineeringClarificationSchema, engineeringRequestSchema, hasPermission, safeEngineeringPath, type EngineeringRun } from "@codemesh/shared";
import type { AppConfig } from "../config.js";
import type { JsonStore } from "../db/store.js";
import { badRequest, conflict, forbidden, notFound } from "../errors.js";
import { benchmarkSummary, datasetCatalog, exampleBenchmark, importBenchmark } from "../services/benchmarkDatasets.js";
import { engineeringHash, engineeringVerification, makeEngineeringRun, publicEngineeringRun, type EngineeringEngine } from "../services/engineeringEngine.js";
import type { OperationQueue } from "../services/jobQueue.js";
import { ChangeLabClient } from "../services/changeLabClient.js";
import { createUserRateLimiter, requireProjectPermission } from "../services/security.js";
import { asyncHandler, ok, parseBody } from "./helpers.js";
import { withEngineeringSubmission } from "../services/engineeringSubmissions.js";

export function engineeringRoutes(config: AppConfig, store: JsonStore, queue: OperationQueue, engine: EngineeringEngine) {
  const router = Router(), worker = new ChangeLabClient(config);
  const locked = (key: string, action: () => Promise<void>) => withEngineeringSubmission(store, key, action);
  const limiter = createUserRateLimiter(Math.min(10, config.AI_REQUESTS_PER_MINUTE));
  const owned = (projectId: string, userId: string, id: string) => {
    const run = store.getEngineeringRun(projectId, id);
    if (!run || run.createdBy !== userId) throw notFound("Engineering run not found.");
    return run;
  };
  const inactive = (run: EngineeringRun) => {
    if (store.listPendingOperationJobs().some((job) => job.projectId === run.projectId && job.metadata?.runId === run.id)) throw conflict("This task already has an active job.");
  };
  const fresh = (run: EngineeringRun) => {
    const docs = new Map(store.getWorkspaceDocs(run.projectId, "main").map((doc) => [doc.path, doc.content]));
    const files = store.listFiles(run.projectId).filter((file) => !file.binary && !file.sensitive && safeEngineeringPath(file.path));
    if (store.getProject(run.projectId)?.commitSha !== run.revision || files.length !== run.manifest.length || run.manifest.some((file) => engineeringHash(docs.get(file.path) ?? files.find((item) => item.path === file.path)?.content ?? "") !== file.sha256)) throw conflict("Source changed since this task was captured. Start a new run.");
  };

  router.get("/:projectId/engineering", requireProjectPermission(store, "ai.query"), (req, res) => {
    const projectId = String(req.params.projectId), userId = req.auth!.user.id;
    const runs = store.listEngineeringRuns(projectId, userId);
    const jobs = store.listOperationJobs(projectId, 500).filter((job) => job.createdBy === userId && job.type.startsWith("engineering.")).slice(0, 30);
    const links = store.listContractLinks(projectId).filter((link) => hasPermission(store.getRole(link.projectId, userId), "project.read") && hasPermission(store.getRole(link.consumerProjectId, userId), "project.read")).map((link) => {
      const producer = store.listFiles(link.projectId).find((file) => file.path === link.producerPath);
      const consumer = store.listFiles(link.consumerProjectId).find((file) => file.path === link.consumerPath);
      return { ...link, stale: !producer || !consumer || engineeringHash(store.getWorkspaceDoc(link.projectId, "main", link.producerPath)?.content ?? producer.content) !== link.producerHash || engineeringHash(store.getWorkspaceDoc(link.consumerProjectId, "main", link.consumerPath)?.content ?? consumer.content) !== link.consumerHash };
    });
    ok(res, { project: store.getProject(projectId), permissions: req.projectRole ? hasPermission(req.projectRole, "project.manage") : false,
      reviewAllowed: hasPermission(req.projectRole, "workspace.review"), provider: engine.provider.name,
      runs: runs.map(publicEngineeringRun), jobs, datasets: store.listBenchmarkCorpora(projectId).map(benchmarkSummary), catalog: datasetCatalog, worker: worker.info(), links,
      projects: store.listProjectsForUser(userId).filter((project) => hasPermission(store.getRole(project.id, userId), "project.read")).map((project) => ({ id: project.id, name: project.name, files: store.listFiles(project.id).filter((file) => !file.sensitive && !file.binary && safeEngineeringPath(file.path)).map((file) => file.path) })) });
  });
  router.post("/:projectId/engineering/datasets", requireProjectPermission(store, "project.manage"), limiter, asyncHandler(async (req, res) => {
    const input = parseBody(benchmarkImportSchema, req);
    try { ok(res, benchmarkSummary(await store.saveBenchmarkCorpus(importBenchmark(input, String(req.params.projectId), req.auth!.user.id)))); }
    catch { throw badRequest("Dataset import failed. Check the adapter format, record IDs, size limits, and available corpus slots."); }
  }));
  router.post("/:projectId/engineering/datasets/example", requireProjectPermission(store, "project.manage"), limiter, asyncHandler(async (req, res) => {
    parseBody(z.object({}).strict(), req);
    const projectId = String(req.params.projectId);
    const existing = store.listBenchmarkCorpora(projectId).find((corpus) => corpus.provenance.version === "authored-smoke-v1");
    ok(res, benchmarkSummary(existing ?? await store.saveBenchmarkCorpus(exampleBenchmark(projectId, req.auth!.user.id))));
  }));
  router.post("/:projectId/engineering/datasets/:corpusId/evaluate", requireProjectPermission(store, "project.manage"), limiter, asyncHandler(async (req, res) => {
    parseBody(z.object({}).strict(), req);
    const projectId = String(req.params.projectId), corpusId = String(req.params.corpusId);
    if (!store.getBenchmarkCorpus(projectId, corpusId)) throw notFound("Dataset not found.");
    const existing = store.listPendingOperationJobs().find((job) => job.projectId === projectId && job.createdBy === req.auth!.user.id && job.type === "engineering.evaluate" && job.metadata?.corpusId === corpusId);
    ok(res, existing ?? await queue.enqueue(projectId, "engineering.evaluate", req.auth!.user.id, { corpusId }));
  }));
  router.post("/:projectId/engineering/runs", requireProjectPermission(store, "ai.query"), limiter, asyncHandler(async (req, res) => {
    const input = parseBody(engineeringRequestSchema, req), projectId = String(req.params.projectId), userId = req.auth!.user.id;
    await locked(`create:${userId}`, async () => {
      if (store.listPendingOperationJobs().filter((job) => job.createdBy === userId && job.type === "engineering.run").length >= 2) throw conflict("Two engineering tasks are already queued or running.");
      let run: EngineeringRun;
      try { run = makeEngineeringRun(store, projectId, userId, input); } catch (error) { throw badRequest(error instanceof Error ? error.message : "Cannot capture repository."); }
      await store.saveEngineeringRun(run);
      const job = await queue.enqueue(projectId, "engineering.run", userId, { runId: run.id });
      ok(res, { run: publicEngineeringRun(run), job });
    });
  }));
  router.post("/:projectId/engineering/runs/:runId/retry", requireProjectPermission(store, "ai.query"), limiter, asyncHandler(async (req, res) => {
    parseBody(z.object({}).strict(), req);
    const run = owned(String(req.params.projectId), req.auth!.user.id, String(req.params.runId));
    await locked(`resume:${run.id}`, async () => {
      inactive(run); fresh(run);
      if (run.attempts >= run.maxAttempts || run.status === "cancelled" || !(run.status === "needs_input" || run.status === "failed" || run.verification.status === "FAIL")) throw conflict("No repair retry is available for this task.");
      if (run.patch) { run.previousProposals ??= []; run.previousProposals.push({ id: run.patch.id, verification: run.verification.status }); run.patch = undefined; }
      run.status = "queued"; run.error = undefined; run.completedAt = undefined;
      run.verification = { status: "NOT_RUN", scope: "Retry proposal", detail: "The next proposal needs a new matching worker experiment." };
      await store.saveEngineeringRun(run);
      ok(res, await queue.enqueue(run.projectId, "engineering.run", run.createdBy, { runId: run.id }));
    });
  }));
  router.post("/:projectId/engineering/runs/:runId/clarify", requireProjectPermission(store, "ai.query"), limiter, asyncHandler(async (req, res) => {
    const input = parseBody(engineeringClarificationSchema, req);
    const run = owned(String(req.params.projectId), req.auth!.user.id, String(req.params.runId));
    await locked(`resume:${run.id}`, async () => {
      inactive(run); fresh(run);
      if (run.status !== "needs_input" || run.attempts !== input.expectedAttempt || run.attempts >= run.maxAttempts) throw conflict("This task is no longer waiting for input or has no attempts remaining. Refresh the task.");
      if (run.corpusId) throw conflict("Benchmark tasks keep their fixed statement. Start a custom task for additional instructions.");
      run.clarifications ??= [];
      run.clarifications.push({ instruction: input.instruction, createdAt: new Date().toISOString(), attempt: run.attempts + 1 });
      run.status = "queued"; run.error = undefined; run.completedAt = undefined;
      run.verification = { status: "NOT_RUN", scope: "Clarified task", detail: "Clarification does not verify a repair. Any new proposal still needs review and a matching worker experiment." };
      await store.saveEngineeringRun(run);
      await store.recordAudit({ projectId: run.projectId, userId: run.createdBy, action: "engineering.clarified", metadata: { runId: run.id, attempt: run.attempts + 1 } });
      const job = await queue.enqueue(run.projectId, "engineering.run", run.createdBy, { runId: run.id });
      ok(res, { run: publicEngineeringRun(run), job });
    });
  }));
  router.delete("/:projectId/engineering/runs/:runId", requireProjectPermission(store, "ai.query"), asyncHandler(async (req, res) => {
    const run = owned(String(req.params.projectId), req.auth!.user.id, String(req.params.runId));
    if (!["queued", "running"].includes(run.status)) throw conflict("Only an active task can be cancelled.");
    run.status = "cancelled"; run.completedAt = new Date().toISOString(); await store.saveEngineeringRun(run);
    for (const job of store.listPendingOperationJobs().filter((job) => job.projectId === run.projectId && job.metadata?.runId === run.id)) await queue.cancel(run.projectId, job.id);
    ok(res, publicEngineeringRun(run));
  }));
  router.post("/:projectId/engineering/runs/:runId/verification", requireProjectPermission(store, "workspace.review"), asyncHandler(async (req, res) => {
    const input = parseBody(z.object({ labRunId: z.string().uuid() }).strict(), req);
    const run = owned(String(req.params.projectId), req.auth!.user.id, String(req.params.runId));
    inactive(run); fresh(run);
    const lab = store.getChangeLabRun(run.projectId, input.labRunId);
    if (!run.patch || !lab || lab.mode !== "repository" || lab.status !== "completed" || !lab.result || lab.request.patchId !== run.patch.id || lab.revision !== run.revision) throw conflict("Choose a completed repository experiment for this exact proposed patch.");
    if (lab.manifest.some((file) => run.manifest.find((source) => source.path === file.path)?.sha256 !== file.baselineHash) || run.patch.files.some((file) => lab.manifest.find((source) => source.path === file.path)?.proposedHash !== engineeringHash(file.proposedContent))) throw conflict("The experiment does not match this task's frozen source and proposed contents.");
    const { status, detail, feedback } = engineeringVerification(lab.result);
    run.verification = { status, scope: "Restricted exported-function probes only; not the repository test suite", labRunId: lab.id, detail };
    run.repairFeedback = feedback;
    run.steps.push({ stage: "verify", status, detail: run.verification.detail, latencyMs: 0 });
    run.status = status === "PASS" ? "completed" : "awaiting_review";
    await store.saveEngineeringRun(run);
    ok(res, publicEngineeringRun(run));
  }));
  router.get("/:projectId/engineering/runs/:runId/report", requireProjectPermission(store, "ai.query"), (req, res) => {
    const run = owned(String(req.params.projectId), req.auth!.user.id, String(req.params.runId));
    const experiment = run.verification.labRunId ? store.getChangeLabRun(run.projectId, run.verification.labRunId) : null;
    const payload = { schemaVersion: 1, run: publicEngineeringRun(run), commandsExecuted: experiment?.result ? [experiment.result.environment.command] : [], verificationScope: run.verification.scope,
      rollback: "No original repository file is modified by an engineering run. Reject an unapplied proposal; if you separately applied it, use the existing workspace revision recovery before publishing.",
      limitations: ["Static matches are hypotheses, not confirmed root causes.", "Token usage is estimated; billed usage and cost are unavailable unless recorded by the provider.", "No official SWE-bench/Defects4J harness or CodeQL scan is implied by this report."] };
    ok(res, { payload, sha256: engineeringHash(JSON.stringify(payload)) });
  });
  router.post("/:projectId/engineering/contracts", requireProjectPermission(store, "project.manage"), limiter, asyncHandler(async (req, res) => {
    const input = parseBody(contractLinkSchema, req), projectId = String(req.params.projectId), userId = req.auth!.user.id;
    if (input.consumerProjectId === projectId) throw badRequest("Select a different consumer repository.");
    if (!hasPermission(store.getRole(input.consumerProjectId, userId), "project.manage")) throw forbidden("Owner access to both repositories is required to confirm a link.");
    const producer = store.listFiles(projectId).find((file) => file.path === input.producerPath && !file.sensitive && !file.binary);
    const consumer = store.listFiles(input.consumerProjectId).find((file) => file.path === input.consumerPath && !file.sensitive && !file.binary);
    if (!producer || !consumer || !safeEngineeringPath(producer.path) || !safeEngineeringPath(consumer.path)) throw badRequest("Choose safe indexed source files in both repositories.");
    const link = { id: randomUUID(), projectId, consumerProjectId: input.consumerProjectId, name: input.name, producerPath: producer.path, consumerPath: consumer.path, producerHash: engineeringHash(store.getWorkspaceDoc(projectId, "main", producer.path)?.content ?? producer.content), consumerHash: engineeringHash(store.getWorkspaceDoc(input.consumerProjectId, "main", consumer.path)?.content ?? consumer.content), createdBy: userId, createdAt: new Date().toISOString(), evidence: "human-confirmed-source-link" as const };
    ok(res, await store.saveContractLink(link));
  }));
  return router;
}
