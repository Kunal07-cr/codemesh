import crypto from "node:crypto";
import { buildIncrementalIndexPlan, buildPullRequestReview } from "@codemesh/code-intelligence";
import { Router } from "express";
import type { AppConfig } from "../config.js";
import type { JsonStore } from "../db/store.js";
import { badRequest, failedDependency, unauthorized } from "../errors.js";
import type { GitHubAppService } from "../services/githubApp.js";
import type { OperationQueue } from "../services/jobQueue.js";
import { asyncHandler, ok } from "./helpers.js";

export function integrationRoutes(
  config: AppConfig,
  store: JsonStore,
  queue: OperationQueue,
  github: GitHubAppService
) {
  const router = Router();

  router.get("/github/status", (req, res) => {
    ok(res, {
      ...github.info(),
      signedIn: Boolean(req.auth),
      webhookUrl: requestPublicUrl(req, config) + "/api/integrations/github/webhook",
      events: ["push", "pull_request"]
    });
  });

  router.post(
    "/github/webhook",
    asyncHandler(async (req, res) => {
      if (!config.GITHUB_WEBHOOK_SECRET) throw failedDependency("GitHub webhook verification is not configured.");
      const signature = req.header("x-hub-signature-256");
      const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
      if (!signature || !verifyGitHubSignature(rawBody, signature, config.GITHUB_WEBHOOK_SECRET)) {
        throw unauthorized("GitHub webhook signature is invalid.");
      }

      const deliveryId = req.header("x-github-delivery");
      const event = req.header("x-github-event") ?? "unknown";
      if (!deliveryId) throw badRequest("GitHub delivery id is required.");
      const duplicate = store.getWebhookDelivery(deliveryId);
      if (duplicate) {
        ok(res, { accepted: true, duplicate: true, status: duplicate.status });
        return;
      }
      await store.recordWebhookDelivery({ id: deliveryId, provider: "github", event, status: "received", projectIds: [] });

      if (event === "ping") {
        await store.updateWebhookDelivery(deliveryId, { status: "processed", processedAt: new Date().toISOString() });
        ok(res, { accepted: true, event, message: "pong" });
        return;
      }

      const repositoryUrl = String(req.body?.repository?.html_url ?? "");
      const repository = String(req.body?.repository?.full_name ?? "");
      const projects = repositoryUrl ? store.findProjectsByRepositoryUrl(repositoryUrl) : [];
      if (event === "push") {
        const result = await handlePush({ config, store, queue, github, projects, repository, deliveryId, body: req.body });
        await store.updateWebhookDelivery(deliveryId, {
          status: projects.length > 0 ? "processed" : "ignored",
          processedAt: new Date().toISOString(),
          projectIds: projects.map((project) => project.id)
        });
        ok(res, { accepted: true, event, projects: projects.length, ...result });
        return;
      }

      if (event === "pull_request") {
        const result = await handlePullRequest({ config, store, github, projects, repository, deliveryId, body: req.body });
        await store.updateWebhookDelivery(deliveryId, {
          status: projects.length > 0 ? "processed" : "ignored",
          processedAt: new Date().toISOString(),
          projectIds: projects.map((project) => project.id)
        });
        ok(res, { accepted: true, event, projects: projects.length, ...result });
        return;
      }

      await store.updateWebhookDelivery(deliveryId, { status: "ignored", processedAt: new Date().toISOString() });
      ok(res, { accepted: true, event, ignored: true });
    })
  );

  return router;
}

async function handlePush(input: {
  config: AppConfig;
  store: JsonStore;
  queue: OperationQueue;
  github: GitHubAppService;
  projects: ReturnType<JsonStore["findProjectsByRepositoryUrl"]>;
  repository: string;
  deliveryId: string;
  body: Record<string, any>;
}) {
  const changedPaths = unique([
    ...(input.body.commits ?? []).flatMap((commit: Record<string, string[]>) => [
      ...(commit.added ?? []),
      ...(commit.modified ?? []),
      ...(commit.removed ?? [])
    ]),
    ...(input.body.head_commit?.added ?? []),
    ...(input.body.head_commit?.modified ?? []),
    ...(input.body.head_commit?.removed ?? [])
  ].map(String));
  const removedPaths = unique([
    ...(input.body.commits ?? []).flatMap((commit: Record<string, string[]>) => commit.removed ?? []),
    ...(input.body.head_commit?.removed ?? [])
  ].map(String));
  const upsertPaths = changedPaths.filter((filePath) => !removedPaths.includes(filePath));
  const commitSha = String(input.body.after ?? input.body.head_commit?.id ?? "");
  const installationId = Number(input.body.installation?.id ?? 0);
  let contentSynced = 0;

  for (const project of input.projects) {
    const plan = buildIncrementalIndexPlan(input.store.getIndex(project.id), changedPaths);
    if (input.config.githubConfigured && input.repository && installationId && commitSha) {
      const files = await input.github.fetchChangedFiles({
        projectId: project.id,
        repository: input.repository,
        commitSha,
        installationId,
        paths: upsertPaths
      });
      const applied = await input.store.applyIncrementalProjectFiles(project.id, files, removedPaths, commitSha);
      contentSynced += applied.upserted;
    }
    const job = await input.queue.enqueue(project.id, "repository.incremental_sync", "github-webhook", {
      deliveryId: input.deliveryId,
      changedPaths,
      removedPaths,
      commitSha,
      strategy: plan.strategy
    });
    await input.store.saveDeliveryRun({
      projectId: project.id,
      kind: "incremental_sync",
      status: "queued",
      title: "GitHub push " + (commitSha.slice(0, 7) || input.deliveryId.slice(0, 7)),
      input: { changedPaths, removedPaths, ref: input.body.ref, deliveryId: input.deliveryId, jobId: job.id },
      result: plan as unknown as Record<string, unknown>,
      createdBy: "github-app"
    });
    await input.store.recordAudit({
      projectId: project.id,
      action: "github.push_received",
      metadata: {
        deliveryId: input.deliveryId,
        ref: input.body.ref,
        commitSha,
        changedFiles: changedPaths.length,
        repository: input.repository
      }
    });
  }
  return { changedFiles: changedPaths.length, contentSynced };
}

async function handlePullRequest(input: {
  config: AppConfig;
  store: JsonStore;
  github: GitHubAppService;
  projects: ReturnType<JsonStore["findProjectsByRepositoryUrl"]>;
  repository: string;
  deliveryId: string;
  body: Record<string, any>;
}) {
  const action = String(input.body.action ?? "");
  if (!["opened", "reopened", "synchronize", "ready_for_review"].includes(action)) {
    return { ignored: true, action };
  }
  const pullNumber = Number(input.body.number ?? 0);
  const installationId = Number(input.body.installation?.id ?? 0);
  const headSha = String(input.body.pull_request?.head?.sha ?? "");
  let checksPublished = 0;

  for (const project of input.projects) {
    let changedFiles: string[] = [];
    if (input.config.githubConfigured && input.repository && pullNumber && installationId) {
      const files = await input.github.listPullRequestFiles(input.repository, pullNumber, installationId);
      changedFiles = files.filter((file) => file.status !== "removed").map((file) => file.filename);
    } else {
      changedFiles = unique((input.body.pull_request?.changed_files_list ?? []).map(String));
    }
    const review = buildPullRequestReview(input.store.getIndex(project.id), changedFiles);
    await input.store.saveDeliveryRun({
      projectId: project.id,
      kind: "pull_request",
      status: review.status === "pass" ? "passed" : review.status === "block" ? "blocked" : "attention",
      title: "PR #" + pullNumber + ": " + String(input.body.pull_request?.title ?? "Repository review"),
      input: {
        deliveryId: input.deliveryId,
        action,
        pullNumber,
        headSha,
        changedFiles
      },
      result: review as unknown as Record<string, unknown>,
      createdBy: "github-app",
      completedAt: new Date().toISOString()
    });
    await input.store.recordAudit({
      projectId: project.id,
      action: "github.pull_request_reviewed",
      metadata: { deliveryId: input.deliveryId, pullNumber, action, status: review.status, score: review.score }
    });
    if (input.config.githubConfigured && input.repository && installationId && headSha) {
      await input.github.createCheckRun({
        repository: input.repository,
        installationId,
        headSha,
        title: "CodeMesh review: " + review.status,
        summary: review.summary + "\n\nRisk score: " + review.score + "/100",
        conclusion: review.status === "pass" ? "success" : review.status === "block" ? "failure" : "neutral",
        annotations: review.annotations
      });
      checksPublished += 1;
    }
  }
  return { action, pullNumber, checksPublished };
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function requestPublicUrl(req: { header(name: string): string | undefined; protocol: string }, config: AppConfig) {
  const host = String(req.header("x-forwarded-host") ?? req.header("host") ?? "").split(",")[0]?.trim();
  const protocol = String(req.header("x-forwarded-proto") ?? req.protocol).split(",")[0]?.trim();
  return host ? `${protocol}://${host}` : config.publicUrl.replace(/\/$/, "");
}

export function verifyGitHubSignature(body: Buffer, signature: string, secret: string) {
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

