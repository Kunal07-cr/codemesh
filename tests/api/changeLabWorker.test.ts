import { afterEach, describe, expect, it, vi } from "vitest";
import { exampleBundle } from "../../apps/api/src/services/changeLabEngine";
const docker = vi.hoisted(() => ({ resolve: vi.fn(), execute: vi.fn() }));
vi.mock("../../apps/api/src/services/changeLabDocker", () => ({ resolveLabImage: docker.resolve, executeLabContainer: docker.execute }));
import { startChangeLabWorker } from "../../apps/api/src/workers/changeLab";

describe("dedicated Change Lab worker protocol (mocked Docker driver)", () => {
  let worker: Awaited<ReturnType<typeof startChangeLabWorker>> | undefined;
  const token = "worker-test-token-".repeat(3);
  afterEach(async () => { if (worker) await worker.close(); worker = undefined; docker.execute.mockReset(); docker.resolve.mockReset(); });
  async function setup() {
    docker.resolve.mockResolvedValue(`sha256:${"b".repeat(64)}`);
    worker = await startChangeLabWorker({ CHANGE_LAB_WORKER_TOKEN: token, CHANGE_LAB_PORT: "0" });
    const address = worker.server.address(); if (!address || typeof address === "string") throw new Error("Missing address");
    return `http://127.0.0.1:${address.port}`;
  }
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  it("requires a strong token and a local pre-pulled image", async () => {
    await expect(startChangeLabWorker({ CHANGE_LAB_WORKER_TOKEN: "short" })).rejects.toThrow("at least 32");
    docker.resolve.mockRejectedValue(new Error("Docker engine unavailable"));
    await expect(startChangeLabWorker({ CHANGE_LAB_WORKER_TOKEN: token })).rejects.toThrow("Docker");
  });
  it("authenticates requests, rejects traversal, and produces actual engine comparisons", async () => {
    docker.execute.mockImplementation(async (files, probe) => ({ status: "returned", value: files[0].content.includes("<=") ? 2 : 1, durationMs: 1, events: [] }));
    const base = await setup();
    expect((await fetch(`${base}/health`)).status).toBe(401);
    expect((await fetch(`${base}/health`, { headers })).status).toBe(200);
    const bundle = exampleBundle(); bundle.request.generateBoundaries = false; bundle.request.investigate = false;
    expect((await fetch(`${base}/jobs`, { method: "POST", headers, body: JSON.stringify({ ...bundle, files: [{ path: "../bad.mjs", content: "bad" }] }) })).status).toBe(422);
    const response = await fetch(`${base}/jobs`, { method: "POST", headers, body: JSON.stringify(bundle) });
    expect(response.status).toBe(202);
    const accepted = await response.json() as { id: string };
    const job = await (await fetch(`${base}/jobs/${accepted.id}`, { headers })).json() as { status: string; result: { comparisons: unknown[] } };
    expect(job.status).toBe("completed"); expect(job.result.comparisons).toHaveLength(3);
    expect(docker.execute).toHaveBeenCalled();
    expect((await fetch(`${base}/jobs/${accepted.id}`)).status).toBe(401);
  });
  it("bounds the queue and cancels running and queued work without exposing a token", async () => {
    docker.execute.mockImplementation((_files, _probe, _target, _image, _harness, signal: AbortSignal) => new Promise((_resolve, reject) => { signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }); }));
    const base = await setup(), body = JSON.stringify(exampleBundle());
    const first = await (await fetch(`${base}/jobs`, { method: "POST", headers, body })).json() as { id: string };
    const second = await (await fetch(`${base}/jobs`, { method: "POST", headers, body })).json() as { id: string };
    const third = await (await fetch(`${base}/jobs`, { method: "POST", headers, body })).json() as { id: string };
    expect((await fetch(`${base}/jobs`, { method: "POST", headers, body })).status).toBe(429);
    for (const id of [second.id, third.id, first.id]) {
      const response = await fetch(`${base}/jobs/${id}`, { method: "DELETE", headers });
      const value = await response.json(); expect(value).toMatchObject({ status: "cancelled" }); expect(JSON.stringify(value)).not.toContain(token);
    }
  });
});
