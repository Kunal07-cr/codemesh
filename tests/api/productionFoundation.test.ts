import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JsonStore } from "../../apps/api/src/db/store";
import { verifyGitHubSignature } from "../../apps/api/src/routes/integrations";
import { OperationQueue } from "../../apps/api/src/services/jobQueue";
import { MetricsRegistry } from "../../apps/api/src/services/metrics";

describe("production foundation", () => {
  it("atomically persists jobs, action tokens, and webhook replay records", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codemesh-production-test-"));
    const filePath = path.join(directory, "state.json");
    try {
      const store = await new JsonStore(filePath).init();
      const job = await store.createOperationJob({ projectId: "project-sample-taskpilot", type: "quality.scan", createdBy: "user-owner" });
      await store.addAuthActionToken({ userId: "user-owner", kind: "password_reset", tokenHash: "token-hash", expiresAt: new Date(Date.now() + 60_000).toISOString() });
      await store.recordWebhookDelivery({ id: "delivery-1", provider: "github", event: "push", status: "received", projectIds: [] });
      await store.close();

      const reloaded = await new JsonStore(filePath).init();
      expect(reloaded.getOperationJob(job.id)?.status).toBe("queued");
      expect(await reloaded.consumeAuthActionToken("password_reset", "token-hash")).toMatchObject({ userId: "user-owner" });
      expect(reloaded.getWebhookDelivery("delivery-1")?.event).toBe("push");
      expect((await reloaded.persistenceHealth()).ok).toBe(true);
      await reloaded.close();
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("runs a durable quality job to completion", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codemesh-queue-test-"));
    const filePath = path.join(directory, "state.json");
    try {
      const store = await new JsonStore(filePath).init();
      const metrics = new MetricsRegistry();
      const queue = new OperationQueue(store, metrics, 1);
      await queue.start();
      const job = await queue.enqueue("project-sample-taskpilot", "quality.scan", "user-owner");
      const completed = await waitFor(() => {
        const candidate = store.getOperationJob(job.id);
        return candidate && ["succeeded", "failed"].includes(candidate.status) ? candidate : null;
      });
      expect(completed.status).toBe("succeeded");
      expect(completed.output).toMatchObject({ findings: expect.any(Number), score: expect.any(Number) });
      expect(metrics.snapshot().jobs.succeeded).toBe(1);
      await queue.stop();
      await store.close();
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("validates GitHub signatures without accepting altered payloads", () => {
    const secret = "webhook-secret";
    const body = Buffer.from(JSON.stringify({ ref: "refs/heads/main" }));
    const signature = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyGitHubSignature(body, signature, secret)).toBe(true);
    expect(verifyGitHubSignature(Buffer.from("changed"), signature, secret)).toBe(false);
  });
});

async function waitFor<T>(read: () => T | null, timeoutMs = 5_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("Timed out waiting for operation.");
}
