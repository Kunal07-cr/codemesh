import { z } from "zod";
import { verificationResultSchema, type VerificationBundle } from "@codemesh/shared";
import type { AppConfig } from "../config.js";

const workerJobSchema = z.object({ id: z.string().uuid(), status: z.enum(["queued", "running", "completed", "failed", "cancelled"]), result: verificationResultSchema.optional() });
export class VerificationClient {
  constructor(private readonly config: AppConfig) {}
  info() { return { configured: Boolean(this.config.VERIFICATION_WORKER_URL && this.config.VERIFICATION_WORKER_TOKEN), boundary: "Separate operator-provisioned Docker worker; no API-host execution", stages: ["build", "lint", "test"] }; }
  async submit(bundle: VerificationBundle) { return workerJobSchema.parse(await this.request("/jobs", { method: "POST", body: JSON.stringify(bundle) })); }
  async get(id: string) { return workerJobSchema.parse(await this.request(`/jobs/${z.string().uuid().parse(id)}`)); }
  async cancel(id: string) { return workerJobSchema.parse(await this.request(`/jobs/${z.string().uuid().parse(id)}`, { method: "DELETE" })); }
  private async request(path: string, init: RequestInit = {}) {
    if (!this.info().configured) throw new Error("Verification worker not configured");
    const response = await fetch(`${this.config.VERIFICATION_WORKER_URL!.replace(/\/$/, "")}${path}`, { ...init,
      headers: { "content-type": "application/json", authorization: `Bearer ${this.config.VERIFICATION_WORKER_TOKEN}` }, redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!response.ok || !response.body) throw new Error("Verification worker unavailable");
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 256_000) throw new Error("Worker response too large"); chunks.push(chunk.value); } return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
    finally { await reader.cancel().catch(() => undefined); }
  }
}
