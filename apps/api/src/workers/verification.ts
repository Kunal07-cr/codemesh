import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { verificationBundleSchema, type VerificationBundle, type VerificationResult } from "@codemesh/shared";
import { resolveLabImage } from "../services/changeLabDocker.js";
import { runVerificationContainers } from "../services/verificationDocker.js";
import { checkSystemFiles } from "../services/systemAnalysis.js";

export async function startVerificationWorker(env = process.env) {
  const token = env.VERIFICATION_WORKER_TOKEN ?? "";
  if (token.length < 32 || !env.VERIFICATION_IMAGE) throw new Error("Set a worker token (32+ characters) and an operator-provisioned VERIFICATION_IMAGE");
  const image = await resolveLabImage(env.VERIFICATION_IMAGE), harness = path.resolve("scripts/verification/harness.mjs");
  await fs.access(harness);
  const port = Number(env.VERIFICATION_PORT ?? 4302);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid worker port");
  type Job = { id: string; status: "queued" | "running" | "completed" | "failed" | "cancelled"; bundle?: VerificationBundle; result?: VerificationResult; abort: AbortController; at: number };
  const jobs = new Map<string, Job>(); let active: Promise<void> | undefined, stopping = false, degraded = false;
  const safe = ({ id, status, result }: Job) => ({ id, status, result });
  function pump() {
    if (active || stopping || degraded) return;
    const job = [...jobs.values()].find((item) => item.status === "queued");
    if (!job?.bundle) return;
    job.status = "running";
    active = runVerificationContainers(job.bundle, image, harness, AbortSignal.any([job.abort.signal, AbortSignal.timeout(240_000)])).then((result) => {
      if (job.status !== "cancelled") { job.result = result; job.status = "completed"; }
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === "LabContainerCleanupError") degraded = true;
      if (job.status !== "cancelled") job.status = "failed";
    }).finally(() => { job.bundle = undefined; active = undefined; pump(); });
  }
  const server = http.createServer(async (req, res) => {
    const reply = (code: number, value: unknown) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(value)); };
    const provided = Buffer.from(String(req.headers.authorization ?? "")), expected = Buffer.from(`Bearer ${token}`);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return reply(401, { error: "Unauthorized" });
    const url = new URL(req.url ?? "/", "http://worker");
    for (const [id, job] of jobs) if (!["queued", "running"].includes(job.status) && Date.now() - job.at > 600_000) jobs.delete(id);
    try {
      if (req.method === "GET" && url.pathname === "/health") return reply(200, { ready: !stopping && !degraded, image });
      if (req.method === "POST" && url.pathname === "/jobs") {
        if (stopping || degraded || jobs.size >= 12 || [...jobs.values()].filter((job) => ["queued", "running"].includes(job.status)).length >= 3) return reply(429, { error: "Worker unavailable or full" });
        const chunks: Buffer[] = []; let bytes = 0;
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 3_000_000) return reply(413, { error: "Bundle too large" }); chunks.push(Buffer.from(chunk)); }
        const bundle = verificationBundleSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8"))); checkSystemFiles(bundle.files);
        if (stopping || degraded || jobs.size >= 12 || [...jobs.values()].filter((job) => ["queued", "running"].includes(job.status)).length >= 3) return reply(429, { error: "Worker unavailable or full" });
        const job: Job = { id: randomUUID(), status: "queued", bundle, abort: new AbortController(), at: Date.now() };
        jobs.set(job.id, job); reply(202, safe(job)); pump(); return;
      }
      const id = url.pathname.match(/^\/jobs\/([a-f0-9-]{36})$/)?.[1], job = id ? jobs.get(id) : undefined;
      if (!job) return reply(404, { error: "Job unavailable or expired" });
      if (req.method === "GET") return reply(200, safe(job));
      if (req.method === "DELETE") { if (["queued", "running"].includes(job.status)) { job.status = "cancelled"; job.abort.abort(); job.bundle = undefined; } return reply(200, safe(job)); }
      reply(405, { error: "Method not allowed" });
    } catch { reply(422, { error: "Invalid verification request" }); }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, env.VERIFICATION_BIND ?? "127.0.0.1", resolve); });
  return { server, async close() { stopping = true; for (const job of jobs.values()) job.abort.abort(); await active; await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeIdleConnections(); }); } };
}
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  const worker = await startVerificationWorker();
  console.log("Codaventra restricted verification worker started");
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { void worker.close().then(() => process.exit(0)); });
}
