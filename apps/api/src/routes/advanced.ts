import { Router } from "express";
import { z } from "zod";
import {
  analyzeSemanticMerge,
  buildAiEvaluation,
  buildPullRequestRisk,
  buildRuntimeTracePreview,
  buildSecurityWorkbench,
  generateArchitectureDecisionDraft,
  mapRuntimeTrace,
  planAutonomousChange,
  verifyVirtualSandbox
} from "@codemesh/code-intelligence";
import type { JsonStore } from "../db/store.js";
import { requireProjectPermission } from "../services/security.js";
import { asyncHandler, ok, parseBody } from "./helpers.js";

const changeRunSchema = z.object({ objective: z.string().trim().min(8).max(1000) });
const traceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  source: z.enum(["opentelemetry", "manual"]).default("opentelemetry"),
  spans: z.array(z.object({
    id: z.string().min(1).max(200),
    parentId: z.string().max(200).optional(),
    name: z.string().min(1).max(300),
    durationMs: z.number().min(0).max(86_400_000),
    status: z.enum(["ok", "error"]).optional(),
    filePath: z.string().max(500).optional()
  })).min(1).max(200)
});
const decisionSchema = z.object({
  title: z.string().trim().min(4).max(180),
  status: z.enum(["proposed", "accepted", "superseded"]).default("proposed"),
  context: z.string().trim().min(8).max(5000),
  decision: z.string().trim().min(8).max(5000),
  consequences: z.string().trim().min(8).max(5000),
  evidenceFiles: z.array(z.string().max(500)).max(30).default([])
});

export function advancedRoutes(store: JsonStore) {
  const router = Router();

  router.get(
    "/:projectId/advanced",
    requireProjectPermission(store, "project.read"),
    (req, res) => {
      const projectId = String(req.params.projectId);
      const project = store.getProject(projectId)!;
      const index = store.getIndex(projectId);
      const docs = store.getWorkspaceDocs(projectId, "main");
      const baseByPath = new Map(store.listFiles(projectId).map((file) => [file.path, file.content]));
      const changedFiles = docs.filter((doc) => baseByPath.get(doc.path) !== doc.content).map((doc) => doc.path);
      const mergeFile = String(req.query.mergeFile ?? changedFiles[0] ?? "");
      const traces = store.listRuntimeTraces(projectId);
      const userProjects = store.listProjectsForUser(req.auth!.user.id);
      ok(res, {
        project: { id: project.id, name: project.name, commitSha: project.commitSha },
        runs: store.listAutonomousRuns(projectId),
        semanticMerge: analyzeSemanticMerge(index, mergeFile),
        pullRequestRisk: buildPullRequestRisk(index, changedFiles),
        runtime: {
          traces,
          active: traces[0] ?? { id: "preview", projectId, name: "Graph-derived preview", source: "manual", spans: buildRuntimeTracePreview(index), createdAt: new Date().toISOString(), preview: true }
        },
        portfolio: buildPortfolio(store, userProjects.map((candidate) => candidate.id)),
        security: buildSecurityWorkbench(index),
        aiEvaluation: buildAiEvaluation(index, store.listRetrievals(projectId)),
        decisionDraft: generateArchitectureDecisionDraft(index),
        decisions: store.listArchitectureDecisions(projectId),
        files: index.files.map((file) => file.path)
      });
    }
  );

  router.post(
    "/:projectId/advanced/runs",
    requireProjectPermission(store, "ai.query"),
    asyncHandler(async (req, res) => {
      const input = parseBody(changeRunSchema, req);
      const projectId = String(req.params.projectId);
      const index = store.getIndex(projectId);
      const plan = planAutonomousChange(index, input.objective);
      const sandbox = verifyVirtualSandbox(index, plan);
      ok(res, await store.saveAutonomousRun({ projectId, userId: req.auth!.user.id, objective: input.objective, status: sandbox.status, plan, sandbox }));
    })
  );

  router.post(
    "/:projectId/advanced/traces",
    requireProjectPermission(store, "workspace.edit"),
    asyncHandler(async (req, res) => {
      const input = parseBody(traceSchema, req);
      const projectId = String(req.params.projectId);
      const spans = mapRuntimeTrace(store.getIndex(projectId), input.spans);
      ok(res, await store.saveRuntimeTrace({ projectId, name: input.name, source: input.source, spans }, req.auth!.user.id));
    })
  );

  router.post(
    "/:projectId/advanced/decisions",
    requireProjectPermission(store, "workspace.edit"),
    asyncHandler(async (req, res) => {
      const input = parseBody(decisionSchema, req);
      const projectId = String(req.params.projectId);
      const knownFiles = new Set(store.listFiles(projectId).map((file) => file.path));
      ok(res, await store.createArchitectureDecision({
        ...input,
        projectId,
        evidenceFiles: input.evidenceFiles.filter((filePath) => knownFiles.has(filePath)),
        authorId: req.auth!.user.id
      }));
    })
  );

  return router;
}

function buildPortfolio(store: JsonStore, projectIds: string[]) {
  const projects = projectIds.map((id) => store.getProject(id)).filter((project): project is NonNullable<ReturnType<JsonStore["getProject"]>> => Boolean(project));
  const nodes = projects.map((project) => ({
    id: project.id,
    name: project.name,
    files: store.listFiles(project.id).length,
    symbols: store.getIndex(project.id).symbols.length,
    languages: project.languages,
    tags: project.tags
  }));
  const connections: Array<{ source: string; target: string; reasons: string[] }> = [];
  for (let left = 0; left < projects.length; left += 1) {
    for (let right = left + 1; right < projects.length; right += 1) {
      const a = projects[left]!;
      const b = projects[right]!;
      const sharedLanguages = a.languages.filter((language) => b.languages.includes(language));
      const sharedTags = a.tags.filter((tag) => b.tags.includes(tag));
      const reasons = [...sharedLanguages.map((language) => `language:${language}`), ...sharedTags.map((tag) => `tag:${tag}`)];
      if (reasons.length) connections.push({ source: a.id, target: b.id, reasons: reasons.slice(0, 6) });
    }
  }
  return { nodes, connections };
}
