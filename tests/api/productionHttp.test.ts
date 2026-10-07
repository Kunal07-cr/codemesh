import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/server";
import { hashToken } from "../../apps/api/src/routes/delivery";

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

      const intelligence = await agent.get("/api/projects/project-sample-taskpilot/intelligence").expect(200);
      expect(intelligence.body.data.context.freshness.manifest).toMatch(/^[0-9a-f]{8}$/);
      expect(intelligence.body.data.context.summary.repositoryTokens).toBeGreaterThan(0);

      const owner = runtime.store.getUserRecordByEmail("owner@codemesh.dev")!;
      const rawToken = "cmcp_production_http_context_token";
      await runtime.store.createAgentAccessToken({
        projectId: "project-sample-taskpilot",
        userId: owner.id,
        name: "HTTP test agent",
        prefix: rawToken.slice(0, 14),
        tokenHash: hashToken(rawToken),
        scopes: ["read"]
      });
      const tools = await request(runtime.app)
        .post("/api/mcp")
        .set("authorization", `Bearer ${rawToken}`)
        .send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
        .expect(200);
      expect(tools.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(expect.arrayContaining(["graph_ontology", "code_answer", "code_context", "search_code", "fetch_code", "query_context"]));
      const context = await request(runtime.app)
        .post("/api/mcp")
        .set("authorization", `Bearer ${rawToken}`)
        .send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "code_context", arguments: { question: "Where is authentication handled?" } } })
        .expect(200);
      expect(context.body.result.structuredContent.spans.length).toBeGreaterThan(0);
      expect(runtime.store.listAuditEvents("project-sample-taskpilot").some((event) => event.action === "agent.tool_called")).toBe(true);
    } finally {
      await runtime.queue.stop();
      await runtime.realtime.close();
      await runtime.store.close();
    }
  });
});

