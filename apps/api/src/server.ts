import http from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttpModule from "pino-http";
import { loadConfig } from "./config.js";
import { createStore } from "./db/store.js";
import { errorHandler } from "./errors.js";
import { aiRoutes } from "./routes/ai.js";
import { advancedRoutes } from "./routes/advanced.js";
import { authRoutes } from "./routes/auth.js";
import { collaborationRoutes } from "./routes/collaboration.js";
import { healthRoutes } from "./routes/health.js";
import { projectRoutes } from "./routes/projects.js";
import { attachRealtime } from "./realtime/socket.js";
import { authenticate, createRequestId, csrfProtection } from "./services/security.js";
import { loadAssistantDataset } from "./services/assistantDataset.js";
import { ArtifactStorage } from "./services/artifactStorage.js";
import { OperationQueue } from "./services/jobQueue.js";
import { MetricsRegistry } from "./services/metrics.js";
import { integrationRoutes } from "./routes/integrations.js";
import { deliveryRoutes, publicDeliveryRoutes } from "./routes/delivery.js";
import { mcpRoutes } from "./routes/mcp.js";
import { metricsRoutes, operationRoutes } from "./routes/operations.js";
import { GitHubAppService } from "./services/githubApp.js";
import { SandboxRunner } from "./services/sandboxRunner.js";

const pinoHttp = pinoHttpModule as unknown as (options: Record<string, unknown>) => express.RequestHandler;

export async function createApp() {
  const config = loadConfig();
  const store = await createStore(config.dataPath, config.DATABASE_URL);
  const assistantDataset = await loadAssistantDataset(config.ASSISTANT_DATASET_PATH).catch((error: unknown) => {
    console.warn(`CodeMesh assistant dataset unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
    return null;
  });
  const app = express();
  const server = http.createServer(app);
  const metrics = new MetricsRegistry();
  const artifacts = new ArtifactStorage(config);
  const github = new GitHubAppService(config);
  const sandbox = new SandboxRunner(config);

  app.disable("x-powered-by");
  app.use(createRequestId());
  app.use(
    pinoHttp({
      redact: ["req.headers.cookie", "req.headers.authorization", "req.headers.x-csrf-token", "res.headers.set-cookie"],
      customProps: (req: express.Request) => ({ requestId: req.id })
    })
  );
  app.use(metrics.middleware());
  app.use(helmet());
  app.use(compression());
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const forwardedHost = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0]!.trim();
    const forwardedProtocol = String(req.headers["x-forwarded-proto"] ?? req.protocol).split(",")[0]!.trim();
    const requestOrigin = forwardedHost ? `${forwardedProtocol}://${forwardedHost}` : "";
    const originAllowed = !origin || config.corsOrigins.includes(origin) || origin === requestOrigin;

    cors({
      origin: originAllowed ? origin ?? true : false,
      credentials: true
    })(req, res, next);
  });
  app.use(express.json({
    limit: "2mb",
    verify: (req, _res, buffer) => {
      (req as express.Request).rawBody = Buffer.from(buffer);
    }
  }));
  app.use(cookieParser());
  app.use(authenticate(config, store));
  app.use(csrfProtection());

  const realtime = await attachRealtime(server, config, store);
  const queue = new OperationQueue(store, metrics, config.JOB_CONCURRENCY);
  await queue.start();

  app.use("/api", healthRoutes(config, store, artifacts, realtime, queue, Boolean(assistantDataset)));
  app.use("/api", metricsRoutes(config, metrics));
  app.use("/api", publicDeliveryRoutes(store));
  app.use("/api/auth", authRoutes(config, store));
  app.use("/api/mcp", mcpRoutes(store));
  app.use("/api/integrations", integrationRoutes(config, store, queue, github));
  app.use("/api/projects", projectRoutes(store, artifacts));
  app.use("/api/projects", advancedRoutes(store));
  app.use("/api/projects", collaborationRoutes(config, store));
  app.use("/api/projects", aiRoutes(config, store, assistantDataset, queue));
  app.use("/api/projects", deliveryRoutes(config, store, queue, sandbox, github));
  app.use("/api/projects", operationRoutes(config, store, queue, metrics, artifacts, realtime));

  const webDist = path.resolve(process.cwd(), "../web/dist");
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^\/(?!api).*/, (_req, res) => {
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  app.use(errorHandler);

  return { app, server, io: realtime.io, realtime, queue, metrics, artifacts, github, sandbox, config, store, assistantDataset };
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  const runtime = await createApp();
  runtime.server.listen(runtime.config.API_PORT, () => {
    runtime.app.locals.logger?.info?.(`CodeMesh API listening on ${runtime.config.API_PORT}`);
    console.log(`CodeMesh API listening on http://localhost:${runtime.config.API_PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}; shutting down.`);
    await runtime.queue.stop();
    await runtime.realtime.close();
    await runtime.store.close();
    runtime.server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
