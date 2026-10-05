import { Router } from "express";
import type { AppConfig } from "../config.js";
import { ok } from "./helpers.js";

export function healthRoutes(config: AppConfig, assistantDatasetAvailable = false) {
  const router = Router();

  router.get("/health", (_req, res) => {
    ok(res, {
      ok: true,
      service: "codemesh-api",
      version: "0.1.0",
      dependencies: {
        datastore: "ok",
        postgres: "not_configured",
        redis: "not_configured",
        s3: "not_configured",
        aiProvider: config.aiProvider,
        assistantDataset: assistantDatasetAvailable ? "ok" : "unavailable",
        gemini: config.GEMINI_API_KEY && config.GEMINI_MODEL ? "ok" : "not_configured",
        github: config.githubConfigured ? "ok" : "not_configured"
      }
    });
  });

  router.get("/ready", (_req, res) => {
    ok(res, { ok: true });
  });

  return router;
}
