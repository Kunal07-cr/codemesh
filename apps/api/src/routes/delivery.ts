import crypto from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import {
  buildArchitectureDocumentation,
  buildAutomationMission,
  buildGeneratedTestPlans,
  buildIncidentReport,
  buildIncrementalIndexPlan,
  buildPullRequestReview
} from "@codemesh/code-intelligence";
import type { AppConfig } from "../config.js";
import type { DeliveryRun, JsonStore } from "../db/store.js";
import { badRequest, notFound } from "../errors.js";
import type { GitHubAppService } from "../services/githubApp.js";
import type { OperationQueue } from "../services/jobQueue.js";
import type { SandboxRunner } from "../services/sandboxRunner.js";
import { requireAuth, requireProjectPermission } from "../services/security.js";
import { asyncHandler, ok, parseBody } from "./helpers.js";

const filesSchema = z.object({
  title: z.string().trim().min(3).max(160).default("Workspace change review"),
  changedFiles: z.array(z.string().trim().min(1).max(500)).max(200).default([])
});
const sandboxSchema = z.object({ preset: z.enum(["tests", "typecheck", "build"]) });
const incidentSchema = z.object({
  title: z.string().trim().min(3).max(160),
  stackTrace: z.string().trim().min(10).max(30_000)
});
const automationSchema = z.object({ objective: z.string().trim().min(8).max(1200) });
const tokenSchema = z.object({
  name: z.string().trim().min(3).max(80),
  scopes: z.array(z.enum(["read", "propose"])).min(1).max(2).default(["read"]),
  expiresInDays: z.number().int().min(1).max(365).optional()
});
const shareSchema = z.object({
  label: z.string().trim().min(3).max(100),
  expiresInDays: z.number().int().min(1).max(90).default(7)
});

export function deliveryRoutes(
  config: AppConfig,
  store: JsonStore,
  queue: OperationQueue,
  sandbox: SandboxRunner,
  github: GitHubAppService
) {
  const router = Router();

  router.get(
    "/:projectId/delivery",
    requireProjectPermission(store, "project.read"),
    (req, res) => {
      const projectId = String(req.params.projectId);
      const project = store.getProject(projectId)!;
      const index = store.getIndex(projectId);
      const baseByPath = new Map(store.listFiles(projectId).map((file) => [file.path, file.content]));
      const changedFiles = store.getWorkspaceDocs(projectId, "main")
        .filter((doc) => baseByPath.get(doc.path) !== doc.content)
        .map((doc) => doc.path);
      const role = store.getRole(projectId, req.auth!.user.id);
      ok(res, {
        project: { id: project.id, name: project.name, commitSha: project.commitSha, repoUrl: project.repoUrl, role },
        files: store.listFiles(projectId).map((file) => file.path).sort(),
        changedFiles,
        review: buildPullRequestReview(index, changedFiles),
        incremental: buildIncrementalIndexPlan(index, changedFiles),
        documentation: buildArchitectureDocumentation(index),
        generatedTests: buildGeneratedTestPlans(index, changedFiles),
        runs: store.listDeliveryRuns(projectId),
        agentTokens: store.listAgentAccessTokens(projectId).map(safeAgentToken),
        shares: store.listProjectShares(projectId).map(safeShare),
        notifications: store.listNotifications(req.auth!.user.id),
        sandbox: sandbox.info(),
        integrations: {
          github: github.info(),
          mcp: { endpoint: `${requestPublicUrl(req, config)}/api/mcp`, protocolVersion: "2025-11-25" },
          vscode: { available: true, extensionPath: "apps/vscode-extension" },
          identity: { oidc: config.enterpriseIdentityConfigured, scim: config.scimConfigured }
        },
        organization: {
          memberCount: store.listMembers(projectId).length,
          roles: [...new Set(store.listMembers(projectId).map((member) => member.role))],
          controls: [
            { label: "Server-enforced RBAC", status: "ready" },
            { label: "Signed audit trail", status: "ready" },
            { label: "OIDC single sign-on", status: config.enterpriseIdentityConfigured ? "ready" : "configuration_required" },
            { label: "SCIM provisioning", status: config.scimConfigured ? "ready" : "configuration_required" }
          ]
        }
      });
    }
  );

  router.post(
    "/:projectId/delivery/reviews",
    requireProjectPermission(store, "workspace.review"),
    asyncHandler(async (req, res) => {
      const input = parseBody(filesSchema, req);
      const projectId = String(req.params.projectId);
      const result = buildPullRequestReview(store.getIndex(projectId), input.changedFiles);
      ok(res, await store.saveDeliveryRun({
        projectId,
        kind: "pull_request",
        status: mapReviewStatus(result.status),
        title: input.title,
        input: { changedFiles: input.changedFiles },
        result: result as unknown as Record<string, unknown>,
        createdBy: req.auth!.user.id,
        completedAt: new Date().toISOString()
      }));
    })
  );

  router.post(
    "/:projectId/delivery/sandbox",
    requireProjectPermission(store, "workspace.review"),
    asyncHandler(async (req, res) => {
      const input = parseBody(sandboxSchema, req);
      const projectId = String(req.params.projectId);
      const result = await sandbox.verify(store.listFiles(projectId), input.preset);
      ok(res, await store.saveDeliveryRun({
        projectId,
        kind: "sandbox",
        status: result.status,
        title: `${input.preset} verification`,
        input,
        result: result as unknown as Record<string, unknown>,
        createdBy: req.auth!.user.id,
        completedAt: new Date().toISOString()
      }));
    })
  );

  router.post(
    "/:projectId/delivery/sync",
    requireProjectPermission(store, "project.manage"),
    asyncHandler(async (req, res) => {
      const input = parseBody(filesSchema, req);
      const projectId = String(req.params.projectId);
      const plan = buildIncrementalIndexPlan(store.getIndex(projectId), input.changedFiles);
      const job = await queue.enqueue(projectId, "repository.incremental_sync", req.auth!.user.id, {
        changedPaths: input.changedFiles,
        commitSha: store.getProject(projectId)?.commitSha,
        strategy: plan.strategy
      });
      await store.saveDeliveryRun({
        projectId,
        kind: "incremental_sync",
        status: "queued",
        title: input.title || "Incremental repository sync",
        input: { changedFiles: input.changedFiles, jobId: job.id },
        result: plan as unknown as Record<string, unknown>,
        createdBy: req.auth!.user.id
      });
      ok(res, { job, plan });
    })
  );

  router.post(
    "/:projectId/delivery/incidents",
    requireProjectPermission(store, "workspace.review"),
    asyncHandler(async (req, res) => {
      const input = parseBody(incidentSchema, req);
      const projectId = String(req.params.projectId);
      const result = buildIncidentReport(store.getIndex(projectId), input.title, input.stackTrace);
      ok(res, await store.saveDeliveryRun({
        projectId,
        kind: "incident",
        status: result.matchedFiles.length ? (result.severity === "critical" ? "blocked" : "attention") : "attention",
        title: input.title,
        input: { stackTrace: input.stackTrace.slice(0, 2_000) },
        result: result as unknown as Record<string, unknown>,
        createdBy: req.auth!.user.id,
        completedAt: new Date().toISOString()
      }));
    })
  );

  router.post(
    "/:projectId/delivery/automation",
    requireProjectPermission(store, "ai.query"),
    asyncHandler(async (req, res) => {
      const input = parseBody(automationSchema, req);
      const projectId = String(req.params.projectId);
      const result = buildAutomationMission(store.getIndex(projectId), input.objective);
      ok(res, await store.saveDeliveryRun({
        projectId,
        kind: "automation",
        status: result.sandbox.status === "pass" ? "passed" : result.sandbox.status,
        title: input.objective.slice(0, 160),
        input,
        result: result as unknown as Record<string, unknown>,
        createdBy: req.auth!.user.id,
        completedAt: new Date().toISOString()
      }));
    })
  );

  router.post(
    "/:projectId/delivery/tokens",
    requireProjectPermission(store, "project.manage"),
    asyncHandler(async (req, res) => {
      const input = parseBody(tokenSchema, req);
      const projectId = String(req.params.projectId);
      const rawToken = `cmcp_${crypto.randomBytes(32).toString("base64url")}`;
      const token = await store.createAgentAccessToken({
        projectId,
        userId: req.auth!.user.id,
        name: input.name,
        prefix: rawToken.slice(0, 14),
        tokenHash: hashToken(rawToken),
        scopes: input.scopes,
        expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString() : undefined
      });
      ok(res, { token: rawToken, record: safeAgentToken(token), endpoint: `${requestPublicUrl(req, config)}/api/mcp` });
    })
  );

  router.delete(
    "/:projectId/delivery/tokens/:tokenId",
    requireProjectPermission(store, "project.manage"),
    asyncHandler(async (req, res) => {
      const token = await store.revokeAgentAccessToken(String(req.params.projectId), String(req.params.tokenId), req.auth!.user.id);
      if (!token) throw notFound("Agent token not found.");
      ok(res, safeAgentToken(token));
    })
  );

  router.post(
    "/:projectId/delivery/shares",
    requireProjectPermission(store, "project.manage"),
    asyncHandler(async (req, res) => {
      const input = parseBody(shareSchema, req);
      const projectId = String(req.params.projectId);
      const rawToken = `cmshare_${crypto.randomBytes(30).toString("base64url")}`;
      const share = await store.createProjectShare({
        projectId,
        createdBy: req.auth!.user.id,
        label: input.label,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString()
      });
      ok(res, { share: safeShare(share), url: `${requestPublicUrl(req, config)}/share/${rawToken}` });
    })
  );

  router.delete(
    "/:projectId/delivery/shares/:shareId",
    requireProjectPermission(store, "project.manage"),
    asyncHandler(async (req, res) => {
      const share = await store.revokeProjectShare(String(req.params.projectId), String(req.params.shareId), req.auth!.user.id);
      if (!share) throw notFound("Share link not found.");
      ok(res, safeShare(share));
    })
  );

  router.post(
    "/:projectId/delivery/notifications/:notificationId/read",
    requireAuth(),
    asyncHandler(async (req, res) => {
      const notification = await store.markNotificationRead(req.auth!.user.id, String(req.params.notificationId));
      if (!notification) throw notFound("Notification not found.");
      ok(res, notification);
    })
  );

  return router;
}

export function publicDeliveryRoutes(store: JsonStore) {
  const router = Router();
  router.get("/shares/:token", (req, res) => {
    const share = store.getProjectShareByHash(hashToken(String(req.params.token)));
    if (!share) throw notFound("This report link is invalid, expired, or revoked.");
    const project = store.getProject(share.projectId);
    if (!project) throw notFound("Shared project not found.");
    const index = store.getIndex(project.id);
    const documentation = buildArchitectureDocumentation(index);
    ok(res, {
      share: { label: share.label, expiresAt: share.expiresAt },
      project: { name: project.name, description: project.description, commitSha: project.commitSha, languages: project.languages, updatedAt: project.updatedAt },
      repository: { files: index.files.length, symbols: index.symbols.length, relationships: index.graph.edges.length },
      documentation,
      review: buildPullRequestReview(index, []),
      qualityTimeline: store.listQualitySnapshots(project.id).slice(0, 12),
      generatedAt: new Date().toISOString()
    });
  });
  return router;
}

export function hashToken(token: string) {
  if (!token) throw badRequest("Token is required.");
  return crypto.createHash("sha256").update(token).digest("hex");
}

function safeAgentToken(token: ReturnType<JsonStore["listAgentAccessTokens"]>[number]) {
  const { tokenHash: _tokenHash, ...safe } = token;
  return safe;
}

function safeShare(share: ReturnType<JsonStore["listProjectShares"]>[number]) {
  const { tokenHash: _tokenHash, ...safe } = share;
  return safe;
}

function mapReviewStatus(status: "pass" | "review" | "block"): DeliveryRun["status"] {
  return status === "pass" ? "passed" : status === "review" ? "attention" : "blocked";
}

function requestPublicUrl(req: Request, config: AppConfig) {
  const host = String(req.header("x-forwarded-host") ?? req.header("host") ?? "").split(",")[0]?.trim();
  const protocol = String(req.header("x-forwarded-proto") ?? req.protocol).split(",")[0]?.trim();
  return host ? `${protocol}://${host}` : config.publicUrl.replace(/\/$/, "");
}

