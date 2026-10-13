import { randomUUID } from "node:crypto";
import { Router } from "express";
import {
  compareLabProbe, generateLabBoundaries, labBundleSchema, labCanonical, labOutcomeKey, labRequestSchema, labSafeFilePath,
  type JsonValue, type LabBundle, type LabRun
} from "@codemesh/shared";
import { hashContent, indexRepository, inferLanguage } from "@codemesh/code-intelligence";
import type { AppConfig } from "../config.js";
import type { JsonStore } from "../db/store.js";
import { badRequest, conflict, failedDependency, HttpError, notFound } from "../errors.js";
import { requireProjectPermission } from "../services/security.js";
import { ChangeLabClient } from "../services/changeLabClient.js";
import { exampleBundle, labHash, runLabExample } from "../services/changeLabEngine.js";
import { asyncHandler, ok, parseBody } from "./helpers.js";

export function changeLabRoutes(config: AppConfig, store: JsonStore) {
  const router = Router(), worker = new ChangeLabClient(config);
  const publicRun = (run: LabRun) => { const { snapshot: _snapshot, workerJobId: _job, ...safe } = run; return safe; };
  const getRun = (projectId: string, id: string) => {
    const run = store.getChangeLabRun(projectId, id);
    if (!run) throw notFound("Experiment not found.");
    return run;
  };
  function quota(projectId: string, userId: string) {
    const recent = store.listChangeLabRuns(projectId).filter((run) => run.createdBy === userId && Date.parse(run.createdAt) > Date.now() - 600_000);
    if (recent.length >= 5) throw new HttpError(429, "LAB_RATE_LIMIT", "Five experiments per project per ten minutes are allowed.");
    if (store.listChangeLabRuns(projectId).some((run) => run.status === "running" || run.status === "queued")) throw conflict("A project experiment is already active.");
  }
  function record(projectId: string, userId: string, bundle: LabBundle, mode: LabRun["mode"]): LabRun {
    const changed = new Map(bundle.changes.map((file) => [file.path, file.content]));
    const revision = mode === "example" ? "built-in-session-boundary-v1" : store.getProject(projectId)!.commitSha;
    const graph = indexRepository(projectId, revision, bundle.files.map((file) => ({ ...file, projectId, language: inferLanguage(file.path), size: file.content.length, binary: false, sensitive: false, updatedAt: new Date().toISOString() }))).graph;
    const targetIds = new Set(graph.nodes.filter((node) => node.filePath === bundle.request.filePath).map((node) => node.id));
    const connected = new Set([...targetIds, ...graph.edges.filter((edge) => targetIds.has(edge.source) || targetIds.has(edge.target)).flatMap((edge) => [edge.source, edge.target])]);
    const nodes = graph.nodes.filter((node) => connected.has(node.id)).sort((a, b) => Number(targetIds.has(b.id)) - Number(targetIds.has(a.id))).slice(0, 80);
    const shown = new Set(nodes.map((node) => node.id));
    return {
      id: randomUUID(), projectId, createdBy: userId, title: bundle.request.title, createdAt: new Date().toISOString(),
      status: "queued", mode, revision,
      request: bundle.request, snapshot: structuredClone(bundle),
      snapshotGraph: { ...graph, nodes, edges: graph.edges.filter((edge) => shown.has(edge.source) && shown.has(edge.target)).slice(0, 200) },
      manifest: bundle.files.map((file) => ({ path: file.path, baselineHash: labHash(file.content), proposedHash: labHash(changed.get(file.path) ?? file.content) })),
      bundleHash: labHash(labCanonical(JSON.parse(JSON.stringify(bundle)) as JsonValue))
    };
  }
  // Serialize submissions per project so concurrent requests cannot bypass the quota.
  const submissions = new Set<string>();
  router.get("/:projectId/change-lab", requireProjectPermission(store, "project.read"), asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId), project = store.getProject(projectId)!;
    ok(res, {
      project: { id: project.id, name: project.name, commitSha: project.commitSha },
      worker: await worker.health(), role: req.projectRole,
      files: store.listFiles(projectId).filter((file) => !file.binary && !file.sensitive && labSafeFilePath(file.path)).map((file) => file.path),
      exports: store.getIndex(projectId).symbols.filter((symbol) => symbol.exported && symbol.kind === "function").map((symbol) => ({ filePath: symbol.filePath, name: symbol.name, line: symbol.range.startLine })),
      patches: store.listPatches(projectId).filter((patch) => patch.status === "proposed").map((patch) => ({ id: patch.id, title: patch.title, files: patch.files.map((file) => file.path) })),
      runs: store.listChangeLabRuns(projectId).map(publicRun)
    });
  }));
  router.post("/:projectId/change-lab/example", requireProjectPermission(store, "workspace.review"), asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId);
    quota(projectId, req.auth!.user.id);
    if (submissions.has(projectId)) throw conflict("An experiment is being submitted.");
    submissions.add(projectId);
    try {
      const run = record(projectId, req.auth!.user.id, exampleBundle(), "example");
      run.result = await runLabExample(AbortSignal.timeout(5000)); run.status = "completed"; run.completedAt = new Date().toISOString();
      await store.saveChangeLabRun(run);
      await store.recordAudit({ action: "change_lab.example", projectId, userId: req.auth!.user.id, metadata: { runId: run.id } });
      ok(res, publicRun(run));
    } finally { submissions.delete(projectId); }
  }));
  router.post("/:projectId/change-lab/runs", requireProjectPermission(store, "workspace.review"), asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId), request = parseBody(labRequestSchema, req);
    if (!worker.info().configured) throw failedDependency("A restricted Change Lab worker must be connected first.");
    quota(projectId, req.auth!.user.id);
    if (submissions.has(projectId)) throw conflict("An experiment is being submitted.");
    submissions.add(projectId);
    try {
      const patch = store.getPatch(projectId, request.patchId);
      if (!patch || patch.status !== "proposed" || patch.files.length < 1 || patch.files.length > 4) throw badRequest("Choose an open proposal changing one to four files.");
      const docs = new Map(store.getWorkspaceDocs(projectId, patch.workspaceId).map((doc) => [doc.path, doc.content]));
      const files = store.listFiles(projectId).filter((file) => !file.binary && !file.sensitive && labSafeFilePath(file.path)).map((file) => ({ path: file.path, content: docs.get(file.path) ?? file.content }));
      for (const change of patch.files) {
        const current = files.find((file) => file.path === change.path);
        if (!current) throw badRequest("The patch contains an unsupported or sensitive file.");
        if (current.content !== change.baseContent || hashContent(current.content) !== change.baseHash) throw conflict("The proposal is stale. Create a new proposal against the current workspace.");
      }
      if (!/\.(?:js|mjs|cjs|ts|mts|cts)$/.test(request.filePath)) throw badRequest("Select a Node.js module.");
      const bundle = labBundleSchema.parse({ files, changes: patch.files.map((file) => ({ path: file.path, content: file.proposedContent })), request });
      const run = record(projectId, req.auth!.user.id, bundle, "repository");
      const job = await worker.submit(bundle);
      run.workerJobId = job.id;
      try { await store.saveChangeLabRun(run); } catch (error) { await worker.cancel(job.id).catch(() => undefined); throw error; }
      await store.recordAudit({ action: "change_lab.submit", projectId, userId: req.auth!.user.id, metadata: { runId: run.id, bundleHash: run.bundleHash } });
      ok(res, publicRun(run));
    } finally { submissions.delete(projectId); }
  }));
  router.get("/:projectId/change-lab/runs/:runId", requireProjectPermission(store, "project.read"), asyncHandler(async (req, res) => {
    let run = getRun(String(req.params.projectId), String(req.params.runId));
    if ((run.status === "queued" || run.status === "running") && run.workerJobId) {
      if (Date.parse(run.createdAt) < Date.now() - 300_000) { run = { ...run, status: "failed", error: "Worker deadline expired. No complete experiment is available.", completedAt: new Date().toISOString() }; await worker.cancel(run.workerJobId!).catch(() => undefined); }
      else {
        try {
          const job = await worker.get(run.workerJobId);
          if (job.id !== run.workerJobId) throw new Error("Worker job mismatch.");
          if (job.status === "completed" && job.result) {
            const expected = run.request.generateBoundaries ? generateLabBoundaries(run.request.probes) : run.request.probes;
            if (job.result.comparisons.length !== expected.length || job.result.comparisons.some((item, index) => labCanonical(JSON.parse(JSON.stringify(item.probe))) !== labCanonical(JSON.parse(JSON.stringify(expected[index]))))) throw new Error("Worker probe mismatch.");
            job.result.comparisons = job.result.comparisons.map((item) => compareLabProbe(item.probe, item.baseline, item.proposed));
            if (job.result.stability) {
              const repeated = job.result.stability, initial = job.result.comparisons.find((item) => item.probe.id === repeated.probeId);
              if (!initial) throw new Error("Worker repeated probe mismatch.");
              repeated.repeatMatched = labOutcomeKey(repeated.baseline) !== null && labOutcomeKey(repeated.proposed) !== null && labOutcomeKey(repeated.baseline) === labOutcomeKey(initial.baseline) && labOutcomeKey(repeated.proposed) === labOutcomeKey(initial.proposed);
              if (!repeated.repeatMatched) { initial.verdict = "inconclusive"; initial.reason = "Recorded outcomes did not reproduce on repeat; investigation was withheld."; job.result.investigation = []; job.result.counterexample = null; }
            }
            run = { ...run, status: "completed", result: job.result, error: undefined, completedAt: new Date().toISOString() };
          } else if (job.status === "completed") throw new Error("Worker returned no result.");
          else run = { ...run, status: job.status, error: job.error, completedAt: ["failed", "cancelled"].includes(job.status) ? new Date().toISOString() : undefined };
        } catch { run = { ...run, error: "Worker temporarily unavailable. Retry status; no result has been inferred." }; }
      }
      const latest = getRun(run.projectId, run.id);
      if (["queued", "running"].includes(latest.status)) await store.saveChangeLabRun(run); else run = latest;
    }
    const baseline = run.snapshot?.files.find((file) => file.path === run.request.filePath)?.content;
    const proposed = run.snapshot?.changes.find((file) => file.path === run.request.filePath)?.content ?? baseline;
    ok(res, { run: publicRun(run), source: { baseline, proposed } });
  }));
  router.delete("/:projectId/change-lab/runs/:runId", requireProjectPermission(store, "workspace.review"), asyncHandler(async (req, res) => {
    const run = getRun(String(req.params.projectId), String(req.params.runId));
    if (run.status !== "queued" && run.status !== "running") throw conflict("The experiment is no longer active.");
    if (run.workerJobId) await worker.cancel(run.workerJobId);
    run.status = "cancelled"; run.completedAt = new Date().toISOString();
    await store.saveChangeLabRun(run); await store.recordAudit({ action: "change_lab.cancel", projectId: run.projectId, userId: req.auth!.user.id, metadata: { runId: run.id } });
    ok(res, publicRun(run));
  }));
  router.get("/:projectId/change-lab/runs/:runId/receipt", requireProjectPermission(store, "project.read"), (req, res) => {
    const run = getRun(String(req.params.projectId), String(req.params.runId));
    const payload = JSON.parse(JSON.stringify({ schemaVersion: 1, run: publicRun(run), ...(req.query.includeSource === "true" ? { snapshot: run.snapshot } : {}) })) as JsonValue;
    ok(res, { payload, sha256: labHash(labCanonical(payload)), notice: "Integrity hash, not a digital signature. Replay requires the captured files, the recorded worker image, and the same probe configuration." });
  });
  return router;
}
