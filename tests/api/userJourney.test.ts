import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { strToU8, zipSync } from "fflate";
import { io, type Socket } from "socket.io-client";
import * as Y from "yjs";
import { hashContent } from "@codemesh/code-intelligence";
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

  async function connect(cookie: string) {
    const address = runtime.server.address();
    if (!address || typeof address === "string") throw new Error("No TCP address");
    const socket = io(`http://127.0.0.1:${address.port}`, { transports: ["websocket"], extraHeaders: { cookie }, reconnection: false, timeout: 3000 });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
    return socket;
  }

  it("forks immutable owned conversation snapshots without sharing future turns", async () => {
    const { agent, userId } = await login();
    const { agent: viewer } = await login("viewer@codemesh.dev");
    const base = "/api/projects/project-sample-taskpilot/ai/conversations";
    const parent = await runtime.store.createAssistantConversation("project-sample-taskpilot", userId, "Original approach");
    const stream = await agent.post("/api/projects/project-sample-taskpilot/ai/stream").send({ question: "Where is authentication handled?", mode: "explain", retrievalMode: "graph", knowledgeScope: "repository", includeWorkspace: true, conversation: [], conversationId: parent.id }).expect(200);
    const result = JSON.parse(stream.text.split("\n\n").find((event) => event.startsWith("event: result\n"))!.split("\ndata: ")[1]!);
    const requestBody = { answerId: result.result.id, title: "Alternative approach" };
    await viewer.post(`${base}/${parent.id}/fork`).send(requestBody).expect(404);
    await agent.post(`${base}/${parent.id}/fork`).send({ ...requestBody, title: "x" }).expect(422);
    await agent.post(`${base}/${parent.id}/fork`).send({ ...requestBody, answerId: "missing" }).expect(404);
    const branch = await agent.post(`${base}/${parent.id}/fork`).send(requestBody).expect(200);
    expect(branch.body.data.conversation.parentId).toBe(parent.id);
    expect(branch.body.data.messages).toHaveLength(2);
    await runtime.store.addAssistantMessage(parent.id, "user", "Only in parent");
    await runtime.store.addAssistantMessage(branch.body.data.conversation.id, "user", "Only in branch");
    const left = await agent.get(`${base}/${parent.id}`).expect(200), right = await agent.get(`${base}/${branch.body.data.conversation.id}`).expect(200);
    expect(left.body.data.messages.map((item: { content: string }) => item.content)).not.toContain("Only in branch");
    expect(right.body.data.messages.map((item: { content: string }) => item.content)).not.toContain("Only in parent");
    await viewer.get(`${base}/${branch.body.data.conversation.id}`).expect(404);
    await runtime.store.addAssistantMessage(parent.id, "user", "x".repeat(1_000_001));
    await runtime.store.addAssistantMessage(parent.id, "assistant", "Large snapshot", { ...result.result, id: "large-answer" });
    await agent.post(`${base}/${parent.id}/fork`).send({ ...requestBody, answerId: "large-answer" }).expect(404);
    await agent.delete(`${base}/${parent.id}`).expect(200);
    expect((await agent.get(`${base}/${branch.body.data.conversation.id}`).expect(200)).body.data.messages).toHaveLength(3);
  });

  it("persists task-linked code and manual checks with project and version guards", async () => {
    const { agent } = await login();
    const { agent: viewer } = await login("viewer@codemesh.dev");
    const base = "/api/projects/project-sample-taskpilot";
    const task = await agent.post(`${base}/tasks`).send({ title: "Review authentication" }).expect(200);
    const work = { expectedVersion: 0, paths: ["src/auth/session.ts"], patchIds: [], checks: [{ id: "manual-1", label: "Session expiry", status: "pending", note: "" }], notes: "Inspect boundary conditions" };
    await viewer.put(`${base}/tasks/${task.body.data.id}/work`).send(work).expect(403);
    await agent.put(`${base}/tasks/${task.body.data.id}/work`).send({ ...work, paths: ["../private.ts"] }).expect(400);
    await agent.put(`${base}/tasks/${task.body.data.id}/work`).send({ ...work, patchIds: ["another-project-patch"] }).expect(400);
    const saved = await agent.put(`${base}/tasks/${task.body.data.id}/work`).send(work).expect(200);
    expect(saved.body.data.work).toMatchObject({ paths: work.paths, version: 1, checks: work.checks });
    expect(saved.body.data.work).not.toHaveProperty("expectedVersion");
    await agent.put(`${base}/tasks/${task.body.data.id}/work`).send(work).expect(409);
    const manual = await agent.put(`${base}/tasks/${task.body.data.id}/work`).send({ ...work, expectedVersion: 1, checks: [{ ...work.checks[0], status: "passed", note: "Observed manually" }] }).expect(200);
    expect(manual.body.data.work.version).toBe(2);
    expect(runtime.store.listTasks("project-sample-taskpilot").find((item) => item.id === task.body.data.id)?.work?.checks[0]?.note).toBe("Observed manually");
    await agent.put(`${base}/tasks/missing/work`).send(work).expect(404);
  });

  it("recovers code only against the current server content and tracks annotation staleness", async () => {
    const { agent, cookie } = await login();
    const { cookie: viewerCookie } = await login("viewer@codemesh.dev");
    const projectId = "project-sample-taskpilot", workspaceId = "main", path = "src/auth/session.ts";
    const socket = await connect(cookie), viewer = await connect(viewerCookie);
    await socket.timeout(3000).emitWithAck("workspace:join", { projectId, workspaceId });
    const initial = runtime.store.getWorkspaceDoc(projectId, workspaceId, path)!.content;
    const recovered = `${initial}\n// recovered local draft\n`;
    expect(await viewer.timeout(3000).emitWithAck("doc:replace", { projectId, workspaceId, path, expectedContent: initial, content: recovered })).toMatchObject({ ok: false });
    expect(await socket.timeout(3000).emitWithAck("doc:replace", { projectId, workspaceId, path, expectedContent: "older version", content: recovered })).toMatchObject({ ok: false });
    expect(runtime.store.getWorkspaceDoc(projectId, workspaceId, path)!.content).toBe(initial);
    expect(await socket.timeout(3000).emitWithAck("doc:open", { projectId, workspaceId, path: "missing.ts" })).toMatchObject({ ok: false });
    expect(await socket.timeout(3000).emitWithAck("doc:replace", { projectId, workspaceId, path, expectedContent: initial, content: recovered })).toMatchObject({ ok: true });
    const added = await socket.timeout(3000).emitWithAck("annotation:create", { projectId, workspaceId, filePath: path, range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 }, body: "Expiry is checked at this boundary", kind: "decision", sourceRevision: "workspace" });
    expect(added).toMatchObject({ ok: true, annotation: { kind: "decision" } });
    expect(await viewer.timeout(3000).emitWithAck("annotation:resolve", { projectId, workspaceId, annotationId: added.annotation.id, resolved: true })).toMatchObject({ ok: false });
    expect(await socket.timeout(3000).emitWithAck("annotation:resolve", { projectId, workspaceId, annotationId: added.annotation.id, resolved: true })).toMatchObject({ ok: true });
    expect(runtime.store.listAnnotations(projectId)[0]).toMatchObject({ resolved: true, outdated: false });
    const changed = recovered + "// teammate changed this\n";
    await runtime.store.upsertWorkspaceDoc(projectId, workspaceId, path, changed);
    expect(runtime.store.listAnnotations(projectId)[0]?.outdated).toBe(true);
    const opened = await socket.timeout(3000).emitWithAck("doc:open", { projectId, workspaceId, path });
    const doc = new Y.Doc(); try { Y.applyUpdate(doc, Uint8Array.from(opened.update)); expect(doc.getText("content").toString()).toBe(changed); } finally { doc.destroy(); }
    expect(await socket.timeout(3000).emitWithAck("doc:replace", { projectId, workspaceId, path, expectedContent: recovered, content: "conflicting local copy" })).toMatchObject({ ok: false });
    const workspace = await agent.get(`/api/projects/${projectId}/workspace`).expect(200);
    expect(workspace.body.data.annotations[0].outdated).toBe(true);
    expect(await socket.timeout(3000).emitWithAck("annotation:create", { projectId, workspaceId, filePath: path, range: { startLine: 1, startColumn: 1, endLine: 999999, endColumn: 1 }, body: "Invalid source", sourceRevision: "workspace" })).toMatchObject({ ok: false });
    expect(await socket.timeout(3000).emitWithAck("annotation:create", null)).toMatchObject({ ok: false });
  });

  it("does not partly apply a stale multi-file suggestion and prevents repeated review", async () => {
    const { agent } = await login();
    const projectId = "project-sample-taskpilot", workspaceId = "main";
    const paths = ["src/auth/session.ts", "src/server.ts"];
    const originals = paths.map((path) => runtime.store.getWorkspaceDoc(projectId, workspaceId, path)!.content);
    const patch = { id: "multi-stale", projectId, workspaceId, title: "Two-file correction", summary: "Controlled test patch", files: paths.map((path, index) => ({ path, baseContent: index === 0 ? originals[index]! : "stale base", proposedContent: "changed", baseHash: hashContent(index === 0 ? originals[index]! : "stale base") })), suggestedVerification: [], executedVerification: [], status: "proposed" as const, createdAt: new Date().toISOString() };
    await runtime.store.savePatch(patch);
    await agent.post(`/api/projects/${projectId}/patches/${patch.id}/apply`).send({}).expect(409);
    expect(paths.map((path) => runtime.store.getWorkspaceDoc(projectId, workspaceId, path)!.content)).toEqual(originals);
    await agent.post(`/api/projects/${projectId}/patches/${patch.id}/reject`).send({}).expect(200);
    await agent.post(`/api/projects/${projectId}/patches/${patch.id}/apply`).send({}).expect(409);
  });

  it("reads coherent proof snapshots without exposing private projects to other identities", async () => {
    const sample = await request(runtime.server).get("/api/projects/project-sample-taskpilot/proof").expect(200);
    expect(sample.body.data.project.commitSha).toBe("sample-commit-2026-09-27");
    expect(sample.body.data.graph.nodes.some((node: { filePath?: string }) => node.filePath === "src/auth/session.ts")).toBe(true);
    const { agent } = await login();
    const { agent: other } = await login("viewer@codemesh.dev");
    const created = await agent.post("/api/projects").send({ name: "Private proof repository", description: "Private revision snapshot.", visibility: "private" }).expect(200);
    const base = `/api/projects/${created.body.data.id}`;
    await request(runtime.server).get(`${base}/proof`).expect(403);
    await other.get(`${base}/proof`).expect(403);
    const imported = await agent.post(`${base}/import/zip`).attach("archive", Buffer.from(zipSync({ "src/snapshot.ts": strToU8("export const snapshot = 1;\n") })), "snapshot.zip").expect(200);
    const snapshot = await agent.get(`${base}/proof`).expect(200);
    expect(snapshot.body.data.project.commitSha).toBe(imported.body.data.commitSha);
    expect(snapshot.body.data.graph.nodes.some((node: { filePath?: string }) => node.filePath === "src/snapshot.ts")).toBe(true);
    expect(snapshot.body.data).not.toHaveProperty("files");
    expect(snapshot.body.data).not.toHaveProperty("chat");
    await agent.post(`${base}/proof`).send({ execute: true }).expect(404);
  });

  it("executes and persists a private benchmark run with authenticated progress/results", async () => {
    const base = "/api/projects/project-sample-taskpilot/ai/evaluation";
    await request(runtime.server).get(base).expect(401);
    const { agent } = await login();
    const { agent: viewer } = await login("viewer@codemesh.dev");
    const status = await agent.get(base).expect(200);
    expect(status.body.data.index.indexedFiles).toBe(9);
    expect(status.body.data.baseline.version).toBe("source-facts-v1");
    await agent.post(base).send({ live: true }).expect(422);
    const queued = await agent.post(base).send({}).expect(200);
    let finished = await agent.get(base).expect(200);
    for (let attempt = 0; attempt < 100 && finished.body.data.runs[0]?.status !== "succeeded"; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      finished = await agent.get(base).expect(200);
    }
    expect(finished.body.data.runs[0]).toMatchObject({ id: queued.body.data.id, status: "succeeded", progress: 100 });
    expect(finished.body.data.runs[0].output.report.rows).toHaveLength(20);
    expect((await viewer.get(base).expect(200)).body.data.runs).toEqual([]);
    expect(runtime.store.snapshot().operationJobs?.find((job) => job.id === queued.body.data.id)?.status).toBe("succeeded");
  });

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
