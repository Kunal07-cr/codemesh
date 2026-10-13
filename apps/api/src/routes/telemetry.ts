import { createHash, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { hasPermission, otlpTraceSchema } from "@codemesh/shared";
import type { JsonStore } from "../db/store.js";
import { badRequest, unauthorized, HttpError } from "../errors.js";
import { normalizeOtlp } from "../services/systemAnalysis.js";
import { asyncHandler, parseBody } from "./helpers.js";

export function telemetryRoutes(store: JsonStore) {
  const router = Router(), requests = new Map<string, { start: number; count: number }>();
  router.post("/:projectId/v1/traces", asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId), raw = String(req.header("authorization") ?? "").match(/^Bearer (cvt_[a-zA-Z0-9_-]{43})$/)?.[1];
    if (!raw) throw unauthorized("Project-scoped telemetry bearer required");
    const hash = createHash("sha256").update(raw).digest(), token = store.listTelemetryTokens(projectId).find((item) => {
      const expected = Buffer.from(item.hash, "hex");
      return expected.length === hash.length && timingSafeEqual(expected, hash);
    });
    if (!token || token.revokedAt || new Date(token.expiresAt).getTime() <= Date.now() || !hasPermission(store.getRole(projectId, token.createdBy), "project.manage")) throw unauthorized("Telemetry token expired, revoked or unauthorized");
    for (const [id, entry] of requests) if (Date.now() - entry.start >= 60_000) requests.delete(id);
    const window = requests.get(token.id) ?? { start: Date.now(), count: 0 }; window.count++; requests.set(token.id, window);
    if (window.count > 30) throw new HttpError(429, "RATE_LIMITED", "Telemetry rate limit reached");
    const input = parseBody(otlpTraceSchema, req);
    let traces: ReturnType<typeof normalizeOtlp>;
    try { traces = normalizeOtlp(input, store, projectId); } catch (error) { throw badRequest(error instanceof Error ? error.message : "Invalid trace batch"); }
    for (const trace of traces) await store.saveRuntimeTrace({ projectId, ...trace }, token.createdBy);
    res.status(200).json({});
  }));
  return router;
}
