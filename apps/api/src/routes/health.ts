import { Router } from "express";
import type { AppConfig } from "../config.js";
import type { JsonStore } from "../db/store.js";
import type { RealtimeRuntime } from "../realtime/socket.js";
import type { ArtifactStorage } from "../services/artifactStorage.js";
import type { OperationQueue } from "../services/jobQueue.js";
import { asyncHandler, ok } from "./helpers.js";

export function healthRoutes(
  config: AppConfig,
  store: JsonStore,
  artifacts: ArtifactStorage,
  realtime: RealtimeRuntime,
  queue: OperationQueue,
  assistantDatasetAvailable = false
) {
  const router = Router();

  router.get("/health", asyncHandler(async (_req, res) => {
    const [persistence, objectStorage, realtimeHealth] = await Promise.all([
      store.persistenceHealth(),
      artifacts.health(),
      realtime.health()
    ]);
    ok(res, {
      ok: true,
      service: "codemesh-api",
      version: "0.1.0",
      dependencies: {
        datastore: persistence.ok ? "ok" : "degraded",
        postgres: persistence.provider === "postgres" ? (persistence.ok ? "ok" : "degraded") : "not_configured",
        redis: realtimeHealth.mode === "redis" ? (realtimeHealth.ok ? "ok" : "degraded") : "not_configured",
        s3: objectStorage.configured ? (objectStorage.ok ? "ok" : "degraded") : "not_configured",
        operations: queue.runtimeInfo(),
        aiProvider: config.aiProvider,
        assistantDataset: assistantDatasetAvailable ? "ok" : "unavailable",
        gemini: config.GEMINI_API_KEY && config.GEMINI_MODEL ? "ok" : "not_configured",
        github: config.githubConfigured ? "ok" : "not_configured"
      }
    });
  }));

  router.get("/ready", asyncHandler(async (_req, res) => {
    const persistence = await store.persistenceHealth();
    res.status(persistence.ok ? 200 : 503).json({ data: { ok: persistence.ok, persistence: persistence.provider } });
  }));

  return router;
}
