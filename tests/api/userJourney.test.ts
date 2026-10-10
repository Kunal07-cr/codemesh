import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { strToU8, zipSync } from "fflate";
import { io, type Socket } from "socket.io-client";
import * as Y from "yjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../apps/api/src/server";

describe("authenticated end-to-end HTTP and realtime journeys", () => {
  let runtime: Awaited<ReturnType<typeof createApp>>;
  let directory: string;
  const sockets: Socket[] = [];

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "codemesh-journey-"));
    // Keep this gate independent of external models, databases and cloud services.
    for (const name of ["DATABASE_URL", "REDIS_URL", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "LLM_BASE_URL", "LLM_MODEL", "GEMINI_API_KEY", "GEMINI_MODEL", "EMAIL_WEBHOOK_URL"]) vi.stubEnv(name, "");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATA_PATH", path.join(directory, "state.json"));
    vi.stubEnv("SESSION_SECRET", "journey-test-secret-with-at-least-32-characters");
    runtime = await createApp();
    await new Promise<void>((resolve, reject) => { runtime.server.once("error", reject); runtime.server.listen(0, "127.0.0.1", resolve); });
  });
  afterEach(async () => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
    if (runtime) { await runtime.queue.stop(); await runtime.realtime.close(); await runtime.store.close(); }
    vi.unstubAllEnvs();
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  });

  async function login(email = "owner@codemesh.dev") {
    const agent = request.agent(runtime.server);
    const response = await agent.post("/api/auth/login").send({ email, password: "CodeMesh123!" }).expect(200);
    const cookies = response.headers["set-cookie"] as unknown as string[];
    const csrf = cookies.find((cookie) => cookie.startsWith("cm_csrf="))!.split(";")[0]!.slice("cm_csrf=".length);
    agent.set("x-csrf-token", csrf);
    return { agent, cookie: cookies.map((cookie) => cookie.split(";")[0]).join("; "), userId: response.body.data.user.id };
  }
  const editRequest = { mode: "propose", retrievalMode: "graph", knowledgeScope: "repository", includeWorkspace: true, activeFilePath: "src/main.ts", conversation: [], question: "In src/main.ts replace `alpha` with `beta`." };

  it("signs in, creates and imports a project, edits live, guards stale patches and reviews changes", async () => {
    await request(runtime.server).get("/api/projects/dashboard").expect(401);
    await request(runtime.server).post("/api/auth/login").send({ email: "owner@codemesh.dev", password: "wrong-password" }).expect(401);
    const { agent, cookie } = await login();
    const created = await agent.post("/api/projects").send({ name: "Journey repository", description: "A deterministic repository for the release gate.", visibility: "private" }).expect(200);
    const projectId = created.body.data.id;
    const base = `/api/projects/${projectId}`;
    const archive = Buffer.from(zipSync({ "src/main.ts": strToU8('export function greeting() { return "alpha"; }\n'), "src/util.ts": strToU8("export const version = 1;\n"), "README.md": strToU8("# Journey repository\n"), ".env": strToU8("SECRET=not-imported") }));
    await agent.post(`${base}/import/zip/validate`).attach("archive", archive, "journey.zip").expect(200);
    const imported = await agent.post(`${base}/import/zip`).attach("archive", archive, "journey.zip").expect(200);
    expect(imported.body.data.files).toBe(3);
    const workspace = await agent.get(`${base}/workspace`).expect(200);
    expect(workspace.body.data.files.map((file: { path: string }) => file.path)).toContain("src/main.ts");
    expect(workspace.body.data.graph.nodes.some((node: { label: string }) => node.label === "greeting")).toBe(true);
    const address = runtime.server.address();
    if (!address || typeof address === "string") throw new Error("Journey server has no TCP address");
    const socket = io(`http://127.0.0.1:${address.port}`, { transports: ["websocket"], extraHeaders: { cookie }, reconnection: false, timeout: 3000 });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
    expect(await socket.timeout(3000).emitWithAck("workspace:join", { projectId, workspaceId: "main" })).toMatchObject({ ok: true });
    const opened = await socket.timeout(3000).emitWithAck("doc:open", { projectId, workspaceId: "main", path: "src/main.ts" });
    expect(opened.ok).toBe(true);
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, Uint8Array.from(opened.update));
      const proposed = await agent.post(`${base}/ai/ask`).send(editRequest).expect(200);
      expect(proposed.body.data.patch.status).toBe("proposed");
      const vector = Y.encodeStateVector(doc);
      const text = doc.getText("content"); text.insert(text.length, "// concurrent live edit\n");
      expect(await socket.timeout(3000).emitWithAck("doc:update", { projectId, workspaceId: "main", path: "src/main.ts", update: Array.from(Y.encodeStateAsUpdate(doc, vector)) })).toMatchObject({ ok: true });
      const updated = await agent.get(`${base}/workspace`).expect(200);
      expect(updated.body.data.docs.find((item: { path: string }) => item.path === "src/main.ts").content).toContain("concurrent live edit");
      await agent.post(`${base}/patches/${proposed.body.data.patch.id}/apply`).expect(409);
      await agent.post(`${base}/patches/${proposed.body.data.patch.id}/reject`).expect(200);
      const fresh = await agent.post(`${base}/ai/ask`).send(editRequest).expect(200);
      const applied = await agent.post(`${base}/patches/${fresh.body.data.patch.id}/apply`).expect(200);
      expect(applied.body.data.patch.status).toBe("applied");
      expect(applied.body.data.patch.executedVerification).toEqual([]);
      const final = await agent.get(`${base}/workspace`).expect(200);
      expect(final.body.data.docs.find((item: { path: string }) => item.path === "src/main.ts").content).toContain('return "beta"');
      const task = await agent.post(`${base}/tasks`).send({ title: "Verify the imported repository" }).expect(200);
      await agent.delete(`${base}/tasks/${task.body.data.id}`).expect(200);
      const tasks = await agent.get(`${base}/tasks`).expect(200);
      expect(tasks.body.data.some((item: { id: string }) => item.id === task.body.data.id)).toBe(false);
    } finally { doc.destroy(); }
  });

  it("persists answer feedback, scopes it to the author and cleans it up with its conversation", async () => {
    const { agent, userId } = await login();
    const { agent: viewer } = await login("viewer@codemesh.dev");
    const base = "/api/projects/project-sample-taskpilot";
    const stream = await agent.post(`${base}/ai/stream`).send({ question: "Where is authentication handled?", mode: "explain", retrievalMode: "graph", knowledgeScope: "repository", includeWorkspace: true, conversation: [] }).expect(200);
    const resultLine = stream.text.split("\n\n").find((event) => event.startsWith("event: result\n"))!.split("\ndata: ")[1]!;
    const result = JSON.parse(resultLine);
    const endpoint = `${base}/ai/feedback/${result.result.id}`;
    await agent.put(endpoint).send({ rating: "helpful", incorrectCitation: false, note: "Useful source range" }).expect(200);
    const saved = await agent.get(endpoint).expect(200);
    expect(saved.body.data.feedback).toMatchObject({ userId, rating: "helpful", note: "Useful source range" });
    const disk = JSON.parse(await fs.readFile(path.join(directory, "state.json"), "utf8"));
    expect(disk.assistantFeedback).toHaveLength(1);
    await viewer.get(endpoint).expect(404);
    await viewer.put(endpoint).send({ rating: "unhelpful", incorrectCitation: true, note: "Not mine" }).expect(404);
    await agent.put(endpoint).send({ rating: "invalid", incorrectCitation: false, note: "" }).expect(422);
    await agent.put(endpoint).send({ rating: null, incorrectCitation: true, note: "x".repeat(1001) }).expect(422);
    await agent.put(endpoint).send({ rating: "unhelpful", incorrectCitation: true, note: "Please review the citation" }).expect(200);
    const examples = await agent.get(`${base}/ai/feedback`).expect(200);
    expect(examples.body.data.examples).toHaveLength(1);
    expect(examples.body.data.examples[0]).toMatchObject({ question: "Where is authentication handled?", answer: { id: result.result.id }, feedback: { incorrectCitation: true } });
    expect((await viewer.get(`${base}/ai/feedback`).expect(200)).body.data.examples).toEqual([]);
    await viewer.post(`${base}/import/zip`).expect(403);
    await viewer.post(`${base}/tasks`).send({ title: "Forbidden task" }).expect(403);
    await agent.delete(`${base}/ai/conversations/${result.conversationId}`).expect(200);
    await agent.get(endpoint).expect(404);
    expect((await agent.get(`${base}/ai/feedback`).expect(200)).body.data.examples).toEqual([]);
    expect(runtime.store.snapshot().assistantFeedback).toEqual([]);
  });
});
