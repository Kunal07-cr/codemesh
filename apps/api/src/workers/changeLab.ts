import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { labBundleSchema, labSafeFilePath, type LabBundle, type LabResult } from "@codemesh/shared";
import { runChangeExperiment } from "../services/changeLabEngine.js";
import { executeLabContainer, resolveLabImage } from "../services/changeLabDocker.js";

export async function startChangeLabWorker(env = process.env) {
  const token = env.CHANGE_LAB_WORKER_TOKEN ?? "";
  if (token.length < 32) throw new Error("Set CHANGE_LAB_WORKER_TOKEN to a random value of at least 32 characters");
  const harness = path.resolve(env.CHANGE_LAB_HARNESS_PATH ?? path.join(process.cwd(), "scripts/change-lab/harness.mjs"));
  await fs.access(harness);
  const image = await resolveLabImage(env.CHANGE_LAB_IMAGE ?? "node:24-bookworm-slim");
  const host = env.CHANGE_LAB_BIND ?? "127.0.0.1";
  const port = Number(env.CHANGE_LAB_PORT ?? 4301);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid worker port");
  type Job = { id: string; status: "queued" | "running" | "completed" | "failed" | "cancelled"; bundle?: LabBundle; result?: LabResult; error?: string; createdAt: number; abort: AbortController };
  const jobs = new Map<string, Job>(); let running: Promise<void> | undefined, stopping = false, degraded = false;
  const safeJob = ({ id, status, result, error }: Job) => ({ id, status, result, error });
  function pump() {
    if (running || stopping || degraded) return;
    const job = [...jobs.values()].find((item) => item.status === "queued");
    if (!job?.bundle) return;
    const bundle = job.bundle;
    job.status = "running";
    const deadline = AbortSignal.timeout(180_000);
    running = runChangeExperiment(bundle, (files, probe, signal) => executeLabContainer(files, probe, bundle.request, image, harness, signal), {
      runtime: "Node image with native TypeScript stripping; no dependency installation",
      image, isolation: "Fresh non-root Docker container per probe; network disabled, read-only snapshot, no capabilities, PID/CPU/memory/output/deadline caps",
      command: "node --no-warnings /lab/harness.mjs; JSON probe on stdin"
    }, AbortSignal.any([job.abort.signal, deadline])).then((result) => {
      if (job.status !== "cancelled") { job.result = result; job.status = "completed"; }
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === "LabContainerCleanupError") {
        degraded = true;
        for (const item of jobs.values()) if (item.status === "queued") { item.status = "failed"; item.bundle = undefined; item.error = "Worker requires operator inspection after cleanup failure"; }
      }
      if (job.status !== "cancelled") { job.status = "failed"; job.error = deadline.aborted ? "Experiment exceeded the three-minute budget" : "Execution interrupted or failed; no complete result available"; }
    }).finally(() => { job.bundle = undefined; running = undefined; pump(); });
  }
  const server = http.createServer(async (req, res) => {
    const reply = (status: number, value: unknown) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(value)); };
    const bearer = Buffer.from(String(req.headers.authorization ?? "")), expected = Buffer.from(`Bearer ${token}`);
    if (bearer.length !== expected.length || !timingSafeEqual(bearer, expected)) { reply(401, { error: "Unauthorized" }); return; }
    const url = new URL(req.url ?? "/", "http://worker");
    for (const [id, job] of jobs) if (!["queued", "running"].includes(job.status) && Date.now() - job.createdAt > 600_000) jobs.delete(id);
    try {
      if (req.method === "GET" && url.pathname === "/health") {
        let ready = !stopping && !degraded;
        if (ready) try { ready = await resolveLabImage(image) === image; } catch { ready = false; }
        reply(200, { ready, detail: ready ? "Restricted Docker worker ready" : degraded ? "Worker requires operator inspection after cleanup failure" : "Docker execution is unavailable", image }); return;
      }
      if (req.method === "POST" && url.pathname === "/jobs") {
        if (stopping || degraded || [...jobs.values()].filter((job) => ["queued", "running"].includes(job.status)).length >= 3 || jobs.size >= 12) { reply(429, { error: "Worker unavailable or queue full" }); return; }
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 1_500_000) { reply(413, { error: "Bundle too large" }); return; } chunks.push(Buffer.from(chunk)); }
        const text = Buffer.concat(chunks).toString("utf8");
        const bundle = labBundleSchema.parse(JSON.parse(text));
        if (bundle.files.some((file) => !labSafeFilePath(file.path)) || new Set(bundle.files.map((file) => file.path.toLowerCase())).size !== bundle.files.length || !/\.(?:js|mjs|cjs|ts|mts|cts)$/.test(bundle.request.filePath)) { reply(422, { error: "Unsupported snapshot" }); return; }
        if (stopping || degraded || [...jobs.values()].filter((job) => ["queued", "running"].includes(job.status)).length >= 3 || jobs.size >= 12) { reply(429, { error: "Worker unavailable or queue full" }); return; }
        const job: Job = { id: randomUUID(), status: "queued", bundle, createdAt: Date.now(), abort: new AbortController() };
        jobs.set(job.id, job); reply(202, safeJob(job)); pump(); return;
      }
      const id = url.pathname.match(/^\/jobs\/([a-f0-9-]{36})$/)?.[1], job = id ? jobs.get(id) : undefined;
      if (!job) { reply(404, { error: "Job not found or expired" }); return; }
      if (req.method === "GET") { reply(200, safeJob(job)); return; }
      if (req.method === "DELETE") {
        if (job.status === "queued" || job.status === "running") { job.status = "cancelled"; job.abort.abort(); job.bundle = undefined; }
        reply(200, safeJob(job)); return;
      }
      reply(405, { error: "Method not allowed" });
    } catch { reply(422, { error: "Invalid request" }); }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve); });
  return { server, async close() { stopping = true; for (const job of jobs.values()) job.abort.abort(); await running; await new Promise<void>((resolve) => { server.close(() => resolve()); server.closeIdleConnections(); }); } };
}
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  const worker = await startChangeLabWorker();
  console.log(`Codaventra restricted Change Lab worker listening on ${process.env.CHANGE_LAB_BIND ?? "127.0.0.1"}:${process.env.CHANGE_LAB_PORT ?? "4301"}`);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { void worker.close().then(() => process.exit(0)); });
}
