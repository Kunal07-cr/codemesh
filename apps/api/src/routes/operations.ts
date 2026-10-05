import { Router } from "express";
import { z } from "zod";
import { analyzeRepository } from "@codemesh/code-intelligence";
import type { AppConfig } from "../config.js";
import type { JsonStore, OperationJobType } from "../db/store.js";
import type { RealtimeRuntime } from "../realtime/socket.js";
import { failedDependency, notFound, unauthorized } from "../errors.js";
import type { ArtifactStorage } from "../services/artifactStorage.js";
import type { OperationQueue } from "../services/jobQueue.js";
import type { MetricsRegistry } from "../services/metrics.js";
import { requireProjectPermission } from "../services/security.js";
import { asyncHandler, ok } from "./helpers.js";

const jobSchema = z.object({
  type: z.enum(["repository.reindex", "quality.scan", "persistence.verify", "audit.export"])
});

export function operationRoutes(
  config: AppConfig,
  store: JsonStore,
  queue: OperationQueue,
  metrics: MetricsRegistry,
  artifacts: ArtifactStorage,
  realtime: RealtimeRuntime
) {
  const router = Router();

  router.get(
    "/:projectId/operations",
    requireProjectPermission(store, "project.manage"),
    asyncHandler(async (req, res) => {
      const projectId = String(req.params.projectId);
      const project = store.getProject(projectId);
      if (!project) throw notFound("Project not found.");
      const [persistence, objectStorage, realtimeHealth] = await Promise.all([
        store.persistenceHealth(),
        artifacts.health(),
        realtime.health()
      ]);
      const telemetry = metrics.snapshot();
      const quality = analyzeRepository(store.getIndex(projectId));
      const retrievals = store.listRetrievals(projectId, 500);
      const jobs = store.listOperationJobs(projectId);
      const security = [
        check("secure-cookies", "Secure authentication cookies", config.cookie.secure, config.cookie.secure ? "Secure cookies are enforced." : "Enabled automatically in production."),
        check("session-secret", "Strong session secret", config.SESSION_SECRET.length >= 32 && !config.SESSION_SECRET.includes("dev-session"), "Use a randomly generated secret with at least 32 characters."),
        check("csrf", "CSRF protection", true, "Mutating browser requests require a matching CSRF token."),
        check("github-signatures", "GitHub webhook signatures", Boolean(config.GITHUB_WEBHOOK_SECRET), "Configure GITHUB_WEBHOOK_SECRET before accepting deliveries."),
        check("durable-storage", "Durable primary persistence", persistence.durable && persistence.ok, persistence.detail),
        check("metrics-auth", "Protected metrics endpoint", Boolean(config.METRICS_TOKEN), "Configure METRICS_TOKEN for production monitoring."),
        check("artifact-encryption", "Encrypted repository artifacts", objectStorage.ok, objectStorage.detail)
      ];
      const releaseGates = [
        gate("repository-index", "Repository index", store.listFiles(projectId).length > 0, `${store.listFiles(projectId).length} files indexed`),
        gate("quality", "Repository quality", quality.score >= 65, `Quality score ${quality.score}/100`),
        gate("critical-findings", "Critical findings", !quality.issues.some((issue) => issue.severity === "critical"), `${quality.issues.filter((issue) => issue.severity === "critical").length} critical findings`),
        gate("persistence", "Durable persistence", persistence.durable && persistence.ok, persistence.detail),
        gate("monitoring", "Monitoring access", Boolean(config.METRICS_TOKEN), config.METRICS_TOKEN ? "Metrics token configured" : "Metrics token missing"),
        gate("job-health", "Operations queue", !jobs.some((job) => job.status === "failed"), `${jobs.filter((job) => job.status === "failed").length} failed jobs`)
      ];
      const allChecks = [...security.map((item) => item.pass), ...releaseGates.map((item) => item.pass)];
      const score = Math.round((allChecks.filter(Boolean).length / allChecks.length) * 100);

      ok(res, {
        project: { id: project.id, name: project.name, commitSha: project.commitSha },
        generatedAt: new Date().toISOString(),
        readiness: {
          score,
          status: score >= 85 ? "production-ready" : score >= 60 ? "needs-attention" : "foundation",
          passing: allChecks.filter(Boolean).length,
          total: allChecks.length
        },
        dependencies: [
          dependency("persistence", persistence.provider === "postgres" ? "PostgreSQL" : "Atomic file store", persistence.ok, persistence.durable, persistence.detail),
          dependency("realtime", realtimeHealth.mode === "redis" ? "Redis realtime" : "Realtime collaboration", realtimeHealth.ok, realtimeHealth.mode === "redis", realtimeHealth.detail),
          dependency("artifacts", "Object storage", objectStorage.ok, objectStorage.configured, objectStorage.detail),
          dependency("ai", "AI provider", true, config.aiProvider !== "local-repository", config.aiProvider),
          dependency("github", "GitHub App", config.githubConfigured, config.githubConfigured, config.githubConfigured ? "App credentials and webhook verification are configured." : "Public imports work; App credentials are not configured."),
          dependency("email", "Account email", config.emailDeliveryConfigured, config.emailDeliveryConfigured, config.emailDeliveryConfigured ? "Account email webhook is configured." : "Password recovery delivery is not configured.")
        ],
        serviceLevels: {
          availability: telemetry.availability,
          targetAvailability: 0.995,
          errorRate: telemetry.errorRate,
          p50Ms: telemetry.latencyMs.p50,
          p95Ms: telemetry.latencyMs.p95,
          p99Ms: telemetry.latencyMs.p99,
          targetP95Ms: 500,
          requestsInWindow: telemetry.requests,
          windowMinutes: telemetry.windowMinutes
        },
        queue: queue.runtimeInfo(),
        jobs,
        security,
        releaseGates,
        usage: {
          assistantRequests: retrievals.length,
          contextTokens: retrievals.reduce((total, item) => total + item.contextTokens, 0),
          averageRetrievalLatencyMs: average(retrievals.map((item) => item.retrievalLatencyMs)),
          averageGenerationLatencyMs: average(retrievals.map((item) => item.generationLatencyMs)),
          configuredLimitPerMinute: config.AI_REQUESTS_PER_MINUTE
        },
        integrations: {
          github: { configured: config.githubConfigured, connected: project.repositorySource === "github", repositoryUrl: project.repoUrl },
          postgres: { configured: Boolean(config.DATABASE_URL), active: persistence.provider === "postgres" },
          redis: { configured: Boolean(config.REDIS_URL), active: realtime.mode === "redis" },
          objectStorage: { configured: artifacts.configured, active: objectStorage.ok },
          email: { configured: config.emailDeliveryConfigured },
          metrics: { configured: Boolean(config.METRICS_TOKEN), path: "/api/metrics" }
        }
      });
    })
  );

  router.post(
    "/:projectId/operations/jobs",
    requireProjectPermission(store, "project.manage"),
    asyncHandler(async (req, res) => {
      const { type } = jobSchema.parse(req.body) as { type: OperationJobType };
      ok(res, await queue.enqueue(String(req.params.projectId), type, req.auth!.user.id));
    })
  );

  router.delete(
    "/:projectId/operations/jobs/:jobId",
    requireProjectPermission(store, "project.manage"),
    asyncHandler(async (req, res) => {
      const job = await queue.cancel(String(req.params.projectId), String(req.params.jobId));
      if (!job) throw notFound("Queued or running operation not found.");
      ok(res, job);
    })
  );

  return router;
}

export function metricsRoutes(config: AppConfig, metrics: MetricsRegistry) {
  const router = Router();
  router.get("/metrics", (req, res, next) => {
    if (!config.METRICS_TOKEN) {
      if (config.isProduction) {
        next(failedDependency("Metrics export requires METRICS_TOKEN."));
        return;
      }
    } else if (req.header("authorization") !== `Bearer ${config.METRICS_TOKEN}`) {
      next(unauthorized("A valid metrics bearer token is required."));
      return;
    }
    res.type("text/plain; version=0.0.4").send(metrics.prometheus());
  });
  return router;
}

function check(id: string, label: string, pass: boolean, detail: string) {
  return { id, label, pass, detail };
}

function gate(id: string, label: string, pass: boolean, detail: string) {
  return { id, label, pass, detail };
}

function dependency(id: string, label: string, ok: boolean, configured: boolean, detail: string) {
  return { id, label, ok, configured, status: ok ? "ready" : configured ? "degraded" : "optional", detail };
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}
