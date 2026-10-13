import { labResultSchema, type LabBundle } from "@codemesh/shared";
import { z } from "zod";
import type { AppConfig } from "../config.js";

const jobSchema = z.object({ id: z.string().uuid(), status: z.enum(["queued", "running", "completed", "failed", "cancelled"]), result: labResultSchema.optional(), error: z.string().max(1000).optional() });
export class ChangeLabClient {
  constructor(private readonly config: AppConfig) {}
  info() {
    return { configured: Boolean(this.config.CHANGE_LAB_WORKER_URL && this.config.CHANGE_LAB_WORKER_TOKEN), boundary: "Dedicated Docker worker; repository execution never falls back to the API process.", supported: "Node.js JSON-input exported functions (.js/.mjs/.cjs and erasable .ts/.mts/.cts). No dependency installation, network, or package scripts." };
  }
  async health() {
    if (!this.info().configured) return { ...this.info(), ready: false, detail: "Connect a restricted worker to run repository experiments." };
    try {
      const value = z.object({ ready: z.boolean(), detail: z.string().max(500), image: z.string().max(300).optional() }).parse(await this.request("/health"));
      return { ...this.info(), ...value };
    } catch { return { ...this.info(), ready: false, detail: "The worker is unreachable or not ready." }; }
  }
  async submit(bundle: LabBundle) {
    return jobSchema.parse(await this.request("/jobs", { method: "POST", body: JSON.stringify(bundle) }));
  }
  async get(id: string) { return jobSchema.parse(await this.request(`/jobs/${z.string().uuid().parse(id)}`)); }
  async cancel(id: string) { return jobSchema.parse(await this.request(`/jobs/${z.string().uuid().parse(id)}`, { method: "DELETE" })); }
  private async request(path: string, init: RequestInit = {}) {
    if (!this.info().configured) throw new Error("Change Lab worker is not configured.");
    const response = await fetch(`${this.config.CHANGE_LAB_WORKER_URL!.replace(/\/$/, "")}${path}`, {
      ...init, headers: { "content-type": "application/json", authorization: `Bearer ${this.config.CHANGE_LAB_WORKER_TOKEN}` },
      signal: AbortSignal.timeout(8000), redirect: "error"
    });
    if (!response.ok) throw new Error(response.status === 429 ? "The worker queue is full; retry later." : "The worker request failed.");
    if (!response.body) throw new Error("Empty worker response.");
    const reader = response.body.getReader(); let text = "", size = 0;
    try {
      const decoder = new TextDecoder();
      while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 1_500_000) throw new Error("Worker response exceeded its limit."); text += decoder.decode(chunk.value, { stream: true }); }
      text += decoder.decode();
      return JSON.parse(text) as unknown;
    } finally { await reader.cancel().catch(() => undefined); }
  }
}
