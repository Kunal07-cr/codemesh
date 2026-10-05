import crypto from "node:crypto";
import { Router } from "express";
import type { AppConfig } from "../config.js";
import type { JsonStore } from "../db/store.js";
import { badRequest, failedDependency, unauthorized } from "../errors.js";
import type { OperationQueue } from "../services/jobQueue.js";
import { asyncHandler, ok } from "./helpers.js";

export function integrationRoutes(config: AppConfig, store: JsonStore, queue: OperationQueue) {
  const router = Router();

  router.get("/github/status", (req, res) => {
    ok(res, {
      configured: config.githubConfigured,
      webhookVerification: Boolean(config.GITHUB_WEBHOOK_SECRET),
      appId: config.GITHUB_APP_ID ? "configured" : "missing",
      signedIn: Boolean(req.auth),
      capabilities: config.githubConfigured
        ? ["verified webhooks", "push-triggered indexing", "installation credentials ready"]
        : ["public repository import"]
    });
  });

  router.post(
    "/github/webhook",
    asyncHandler(async (req, res) => {
      if (!config.GITHUB_WEBHOOK_SECRET) throw failedDependency("GitHub webhook verification is not configured.");
      const signature = req.header("x-hub-signature-256");
      if (!signature || !verifyGitHubSignature(req.rawBody ?? Buffer.from(JSON.stringify(req.body)), signature, config.GITHUB_WEBHOOK_SECRET)) {
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

      if (event !== "push") {
        await store.updateWebhookDelivery(deliveryId, { status: "ignored", processedAt: new Date().toISOString() });
        ok(res, { accepted: true, event, ignored: true });
        return;
      }

      const repositoryUrl = String(req.body?.repository?.html_url ?? "");
      const projects = repositoryUrl ? store.findProjectsByRepositoryUrl(repositoryUrl) : [];
      for (const project of projects) {
        await store.recordAudit({
          projectId: project.id,
          action: "github.push_received",
          metadata: { deliveryId, ref: req.body?.ref, commitSha: req.body?.after, repositoryUrl }
        });
        await queue.enqueue(project.id, "repository.reindex", "github-webhook");
      }
      await store.updateWebhookDelivery(deliveryId, {
        status: projects.length > 0 ? "processed" : "ignored",
        processedAt: new Date().toISOString(),
        projectIds: projects.map((project) => project.id)
      });
      ok(res, { accepted: true, event, projects: projects.length });
    })
  );

  return router;
}

export function verifyGitHubSignature(body: Buffer, signature: string, secret: string) {
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
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
