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

const pinoHttp = pinoHttpModule as unknown as (options: Record<string, unknown>) => express.RequestHandler;

export async function createApp() {
  const config = loadConfig();
  const store = await createStore(config.dataPath);
  const assistantDataset = await loadAssistantDataset(config.ASSISTANT_DATASET_PATH).catch((error: unknown) => {
    console.warn(`CodeMesh assistant dataset unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
    return null;
  });
  const app = express();

  app.disable("x-powered-by");
  app.use(createRequestId());
  app.use(
    pinoHttp({
      redact: ["req.headers.cookie", "req.headers.authorization", "res.headers.set-cookie"],
      customProps: (req: express.Request) => ({ requestId: req.id })
    })
  );
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
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(authenticate(config, store));
  app.use(csrfProtection());

  app.use("/api", healthRoutes(config, Boolean(assistantDataset)));
  app.use("/api/auth", authRoutes(config, store));
  app.use("/api/projects", projectRoutes(store));
  app.use("/api/projects", advancedRoutes(store));
  app.use("/api/projects", collaborationRoutes(config, store));
  app.use("/api/projects", aiRoutes(config, store, assistantDataset));

  const webDist = path.resolve(process.cwd(), "../web/dist");
  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^\/(?!api).*/, (_req, res) => {
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  app.use(errorHandler);

  const server = http.createServer(app);
  const io = attachRealtime(server, config, store);

  return { app, server, io, config, store, assistantDataset };
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  const runtime = await createApp();
  runtime.server.listen(runtime.config.API_PORT, () => {
    runtime.app.locals.logger?.info?.(`CodeMesh API listening on ${runtime.config.API_PORT}`);
    console.log(`CodeMesh API listening on http://localhost:${runtime.config.API_PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}; shutting down.`);
    runtime.io.close();
    runtime.server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
