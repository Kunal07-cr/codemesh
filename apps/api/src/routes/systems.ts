import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { hasPermission, otlpTraceSchema, publishApprovalSchema, revisionImportSchema, safeEngineeringPath, verificationStages, type SystemRevision } from "@codemesh/shared";
import { repositoryInstructionWarnings } from "@codemesh/ai";
import type { AppConfig } from "../config.js";
import type { JsonStore } from "../db/store.js";
import { badRequest, conflict, failedDependency, forbidden, notFound } from "../errors.js";
import { createUserRateLimiter, requireProjectPermission } from "../services/security.js";
import type { GitHubAppService } from "../services/githubApp.js";
import type { OperationQueue } from "../services/jobQueue.js";
import type { SystemsEngine } from "../services/systemsEngine.js";
import { engineeringSourceFresh, verificationBundle } from "../services/systemsEngine.js";
import { checkSystemFiles, compareApiContract, compareSystemRevisions, engineeringScorecard, normalizeOtlp, revisionIndex, systemHash, verificationVerdict } from "../services/systemAnalysis.js";
import { asyncHandler, ok, parseBody } from "./helpers.js";

export function systemsRoutes(config: AppConfig, store: JsonStore, queue: OperationQueue, engine: SystemsEngine, github: GitHubAppService) {
  const router = Router(), limiter = createUserRateLimiter(10), publishing = new Set<string>();
  const path = "/:projectId/engineering/systems";
  const owned = (projectId: string, userId: string, runId: string) => { const run = store.getEngineeringRun(projectId, runId); if (!run || run.createdBy !== userId) throw notFound("Task not found"); return run; };
  const summary = ({ files, ...revision }: SystemRevision) => ({ ...revision, files: files.length, symbols: revisionIndex({ ...revision, files }).symbols.length });
  router.get(path, requireProjectPermission(store, "ai.query"), (req, res) => {
    const projectId = String(req.params.projectId), userId = req.auth!.user.id;
    ok(res, { worker: engine.worker.info(), publishEnabled: config.GITHUB_PUBLISH_ENABLED && config.githubConfigured,
      permissions: { manage: hasPermission(req.projectRole, "project.manage"), review: hasPermission(req.projectRole, "workspace.review"), publish: hasPermission(req.projectRole, "github.publish") },
      revisions: store.listSystemRevisions(projectId).map(summary), verification: store.listVerificationRuns(projectId, userId), publications: store.listPublications(projectId, userId),
      scorecard: engineeringScorecard(store, projectId, userId),
      jobs: store.listOperationJobs(projectId, 500).filter((job) => job.createdBy === userId && ["engineering.verify", "engineering.redteam"].includes(job.type)).slice(0, 30),
      injectionFindings: store.listFiles(projectId).filter((file) => !file.binary && !file.sensitive && safeEngineeringPath(file.path)).flatMap((file) => repositoryInstructionWarnings(store.getWorkspaceDoc(projectId, "main", file.path)?.content ?? file.content).map((finding) => ({ ...finding, path: file.path }))).slice(0, 100),
      traces: store.listRuntimeTraces(projectId),
      telemetryTokens: hasPermission(req.projectRole, "project.manage") ? store.listTelemetryTokens(projectId).map(({ hash: _hash, ...token }) => token) : [],
      telemetryEndpoint: `/api/telemetry/${encodeURIComponent(projectId)}/v1/traces` });
  });
  router.post(`${path}/revisions`, requireProjectPermission(store, "project.manage"), limiter, asyncHandler(async (req, res) => {
    parseBody(z.object({}).strict(), req);
    const projectId = String(req.params.projectId), project = store.getProject(projectId)!;
    const files = store.listFiles(projectId).filter((file) => !file.binary && !file.sensitive && safeEngineeringPath(file.path)).map((file) => ({ path: file.path, content: store.getWorkspaceDoc(projectId, "main", file.path)?.content ?? file.content }));
    if (!files.length || files.length > 2000) throw badRequest("Capture requires one to 2000 eligible source files");
    try { checkSystemFiles(files); } catch { throw badRequest("Source exceeds capture limits"); }
    const revision: SystemRevision = { id: randomUUID(), projectId, createdBy: req.auth!.user.id, createdAt: new Date().toISOString(), revision: project.commitSha, origin: "workspace", complete: false, files, sha256: systemHash(files) };
    ok(res, summary(await store.saveSystemRevision(revision)));
  }));
  router.post(`${path}/revisions/import`, requireProjectPermission(store, "project.manage"), limiter, asyncHandler(async (req, res) => {
    const input = parseBody(revisionImportSchema, req), projectId = String(req.params.projectId);
    const repository = store.getProject(projectId)!.repoUrl?.replace(/^https:\/\/github\.com\//, "").replace(/\.git\/?$/, "").replace(/\/$/, "");
    if (repository?.toLowerCase() !== input.repository.toLowerCase()) throw badRequest("Git export must identify this project's connected repository");
    try { checkSystemFiles(input.files); } catch { throw badRequest("Duplicate files or oversized export"); }
    const revision: SystemRevision = { id: randomUUID(), projectId, createdBy: req.auth!.user.id, createdAt: input.capturedAt, revision: input.revision, repository: input.repository, origin: "git-export", complete: input.complete, files: input.files, sha256: systemHash(input.files) };
    ok(res, summary(await store.saveSystemRevision(revision)));
  }));
  router.get(`${path}/revisions/compare`, requireProjectPermission(store, "ai.query"), (req, res) => {
    const input = z.object({ before: z.string().uuid(), after: z.string().uuid() }).parse(req.query), revisions = store.listSystemRevisions(String(req.params.projectId));
    const before = revisions.find((item) => item.id === input.before), after = revisions.find((item) => item.id === input.after);
    if (!before || !after) throw notFound("Source capture not found");
    ok(res, compareSystemRevisions(before, after));
  });
  router.get(`${path}/revisions/source`, requireProjectPermission(store, "ai.query"), (req, res) => {
    const input = z.object({ before: z.string().uuid(), after: z.string().uuid(), path: z.string().refine(safeEngineeringPath) }).parse(req.query);
    const captures = store.listSystemRevisions(String(req.params.projectId)), before = captures.find((item) => item.id === input.before), after = captures.find((item) => item.id === input.after);
    if (!before || !after) throw notFound("Capture unavailable");
    const a = before.files.find((file) => file.path === input.path), b = after.files.find((file) => file.path === input.path);
    if (!a && !b) throw notFound("Captured source unavailable");
    ok(res, { path: input.path, before: a?.content ?? "", after: b?.content ?? "" });
  });
  router.post(`${path}/contracts/check`, requireProjectPermission(store, "ai.query"), asyncHandler(async (req, res) => {
    const input = parseBody(z.object({ linkId: z.string().uuid(), baselineId: z.string().uuid() }).strict(), req), projectId = String(req.params.projectId);
    const link = store.listContractLinks(projectId).find((item) => item.id === input.linkId);
    if (!link || !hasPermission(store.getRole(link.projectId, req.auth!.user.id), "project.read") || !hasPermission(store.getRole(link.consumerProjectId, req.auth!.user.id), "project.read")) throw notFound("Contract link unavailable");
    const baseline = store.listSystemRevisions(link.projectId).find((item) => item.id === input.baselineId)?.files.find((file) => file.path === link.producerPath);
    const current = store.listFiles(link.projectId).find((file) => file.path === link.producerPath && !file.sensitive && !file.binary);
    if (!baseline || !current) throw notFound("Capture the producer's OpenAPI JSON before checking changes");
    ok(res, { ...compareApiContract(baseline.content, store.getWorkspaceDoc(link.projectId, "main", link.producerPath)?.content ?? current.content), affectedConsumer: { id: link.consumerProjectId, name: store.getProject(link.consumerProjectId)?.name, path: link.consumerPath }, confirmation: "Potential impact follows a human-confirmed link, not executed consumer tests" });
  }));
  router.post(`${path}/verification`, requireProjectPermission(store, "workspace.review"), limiter, asyncHandler(async (req, res) => {
    const input = parseBody(z.object({ runId: z.string().uuid(), stages: z.array(z.enum(verificationStages)).min(1).max(3), approved: z.literal(true) }).strict(), req);
    if (!engine.worker.info().configured) throw failedDependency("Configure a separate verification worker first");
    const projectId = String(req.params.projectId), userId = req.auth!.user.id, run = owned(projectId, userId, input.runId);
    if (!engineeringSourceFresh(store, run)) throw conflict("Source changed since the task was captured");
    if (store.listVerificationRuns(projectId, userId).some((item) => ["queued", "running"].includes(item.status))) throw conflict("A verification run is already active");
    let bundle; try { bundle = verificationBundle(run, input.stages); } catch (error) { throw badRequest(error instanceof Error ? error.message : "Invalid proposal"); }
    const record = await store.saveVerificationRun({ id: randomUUID(), projectId, createdBy: userId, createdAt: new Date().toISOString(), engineeringRunId: run.id, patchId: run.patch!.id, revision: run.revision, bundleHash: systemHash(bundle), status: "queued", stages: input.stages });
    ok(res, await queue.enqueue(projectId, "engineering.verify", userId, { verificationId: record.id }));
  }));
  router.post(`${path}/redteam`, requireProjectPermission(store, "workspace.review"), limiter, asyncHandler(async (req, res) => {
    parseBody(z.object({}).strict(), req);
    const projectId = String(req.params.projectId), userId = req.auth!.user.id;
    const existing = store.listPendingOperationJobs().find((job) => job.projectId === projectId && job.createdBy === userId && job.type === "engineering.redteam");
    ok(res, existing ?? await queue.enqueue(projectId, "engineering.redteam", userId));
  }));
  router.get(`${path}/scorecard`, requireProjectPermission(store, "ai.query"), (req, res) => ok(res, engineeringScorecard(store, String(req.params.projectId), req.auth!.user.id)));
  router.post(`${path}/traces`, requireProjectPermission(store, "workspace.edit"), limiter, asyncHandler(async (req, res) => {
    const input = parseBody(otlpTraceSchema, req), projectId = String(req.params.projectId);
    let traces; try { traces = normalizeOtlp(input, store, projectId); } catch (error) { throw badRequest(error instanceof Error ? error.message : "Invalid trace batch"); }
    for (const trace of traces) await store.saveRuntimeTrace({ projectId, ...trace }, req.auth!.user.id);
    ok(res, { traces: traces.length });
  }));
  router.post(`${path}/telemetry-tokens`, requireProjectPermission(store, "project.manage"), limiter, asyncHandler(async (req, res) => {
    const input = parseBody(z.object({ name: z.string().trim().min(3).max(80), confirmed: z.literal(true) }).strict(), req), raw = `cvt_${randomBytes(32).toString("base64url")}`;
    const token = await store.saveTelemetryToken({ id: randomUUID(), projectId: String(req.params.projectId), createdBy: req.auth!.user.id, name: input.name, hash: createHash("sha256").update(raw).digest("hex"), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString() });
    await store.recordAudit({ projectId: token.projectId, userId: token.createdBy, action: "telemetry.token_created", metadata: { tokenId: token.id } });
    res.set("cache-control", "no-store"); ok(res, { id: token.id, token: raw, expiresAt: token.expiresAt });
  }));
  router.delete(`${path}/telemetry-tokens/:tokenId`, requireProjectPermission(store, "project.manage"), asyncHandler(async (req, res) => {
    const token = store.listTelemetryTokens(String(req.params.projectId)).find((item) => item.id === req.params.tokenId);
    if (!token) throw notFound(); token.revokedAt = new Date().toISOString(); await store.saveTelemetryToken(token);
    await store.recordAudit({ projectId: token.projectId, userId: req.auth!.user.id, action: "telemetry.token_revoked", metadata: { tokenId: token.id } }); ok(res, { revoked: true });
  }));
  router.post(`${path}/publications/approve`, requireProjectPermission(store, "github.publish"), limiter, asyncHandler(async (req, res) => {
    const input = parseBody(publishApprovalSchema, req), projectId = String(req.params.projectId), userId = req.auth!.user.id, run = owned(projectId, userId, input.runId);
    const repository = store.getProject(projectId)!.repoUrl?.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/)?.[1];
    if (!repository || !github.publicationAllowed(repository, input.installationId)) throw failedDependency("Enable and allowlist this GitHub repository/installation before publication");
    const verified = store.listVerificationRuns(projectId, userId).find((item) => item.engineeringRunId === run.id && item.patchId === run.patch?.id && item.result && verificationVerdict(item.result).status === "PASS" && verificationBundle(run, item.stages) && item.bundleHash === systemHash(verificationBundle(run, item.stages)));
    if (!run.patch || run.patch.status !== "proposed" || !engineeringSourceFresh(store, run) || !verified || !verified.stages.includes("test")) throw conflict("Require a fresh unapplied patch and passing repository test evidence");
    if (run.snapshot.some((file) => store.listFiles(projectId).find((original) => original.path === file.path)?.content !== file.content)) throw conflict("Publish from indexed commit source, not uncommitted workspace changes");
    const id = randomUUID();
    ok(res, await store.savePublication({ id, projectId, createdBy: userId, createdAt: new Date().toISOString(), runId: run.id, patchHash: systemHash(run.patch), base: input.base, repository, installationId: input.installationId, branch: `codaventra/${id}`, title: input.title, status: "approved" }));
  }));
  router.post(`${path}/publications/:publicationId/publish`, requireProjectPermission(store, "github.publish"), limiter, asyncHandler(async (req, res) => {
    parseBody(z.object({ confirmed: z.literal(true) }).strict(), req);
    const projectId = String(req.params.projectId), userId = req.auth!.user.id, record = store.listPublications(projectId, userId).find((item) => item.id === req.params.publicationId);
    if (!record) throw notFound(); if (record.status === "published") { ok(res, record); return; }
    if (publishing.has(record.id)) throw conflict("Publication already in progress");
    const run = owned(projectId, userId, record.runId);
    const allowed = () => {
      const current = owned(projectId, userId, run.id);
      if (!hasPermission(store.getRole(projectId, userId), "github.publish")) throw forbidden();
      if (!current.patch || current.patch.status !== "proposed" || systemHash(current.patch) !== record.patchHash || !engineeringSourceFresh(store, current)) throw conflict("Proposal or captured source changed since approval");
    };
    allowed(); publishing.add(record.id);
    try {
      record.status = "publishing"; await store.savePublication(record);
      const scorecard = engineeringScorecard(store, projectId, userId);
      const result = await github.publishDraft({ ...record, publicationId: record.id, revision: run.revision, patch: run.patch!, assertAllowed: allowed,
        body: `Reviewed in Codaventra Engineering Studio.\n\nTask: ${run.id}\nRevision: ${run.revision}\nApproved patch SHA-256: ${record.patchHash}\n\nVerification: ${run.verification.scope}\n${run.verification.detail}\n\nMeasured pipeline runs: ${scorecard.pipeline.measured}. Official benchmark score: unavailable.\n\nDraft only. Maintainer review and upstream CI are still required.` });
      Object.assign(record, result); record.status = "published"; record.error = undefined;
      await store.recordAudit({ projectId, userId, action: "engineering.draft_pr_published", metadata: { publicationId: record.id, url: result.url } });
    } catch { record.status = "failed"; record.error = "Publication incomplete. Check source freshness, upstream branch and GitHub permissions; retry reuses this branch identity."; }
    finally { publishing.delete(record.id); await store.savePublication(record); }
    ok(res, record);
  }));
  return router;
}
