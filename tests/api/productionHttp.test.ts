import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/server";

describe("production HTTP surface", () => {
  const originalDataPath = process.env.DATA_PATH;
  const originalSecret = process.env.SESSION_SECRET;
  const directories: string[] = [];

  afterEach(async () => {
    process.env.DATA_PATH = originalDataPath;
    process.env.SESSION_SECRET = originalSecret;
    await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
  });

  it("reports health and serves the authenticated Production Center payload", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codemesh-http-test-"));
    directories.push(directory);
    process.env.DATA_PATH = path.join(directory, "state.json");
    process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
    const runtime = await createApp();
    const agent = request.agent(runtime.app);
    try {
      const health = await agent.get("/api/health").expect(200);
      expect(health.body.data.dependencies.datastore).toBe("ok");

      await agent.post("/api/auth/login").send({ email: "owner@codemesh.dev", password: "CodeMesh123!" }).expect(200);
      const operations = await agent.get("/api/projects/project-sample-taskpilot/operations").expect(200);
      expect(operations.body.data.readiness.score).toEqual(expect.any(Number));
      expect(operations.body.data.dependencies).toEqual(expect.arrayContaining([expect.objectContaining({ id: "persistence" })]));
      expect(operations.body.data.releaseGates).toHaveLength(6);
    } finally {
      await runtime.queue.stop();
      await runtime.realtime.close();
      await runtime.store.close();
    }
  });
});
