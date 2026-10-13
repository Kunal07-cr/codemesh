import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/server";

describe("Engineering Systems HTTP boundaries", () => {
  it("protects capture, collector credentials, imports, scorecards and worker execution", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codaventra-systems-http-"));
    const keys = ["DATA_PATH", "SESSION_SECRET", "LLM_BASE_URL", "LLM_MODEL", "GEMINI_API_KEY", "VERIFICATION_WORKER_URL", "VERIFICATION_WORKER_TOKEN", "GITHUB_PUBLISH_ENABLED"] as const;
    const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.DATA_PATH = path.join(directory, "state.json"); process.env.SESSION_SECRET = "test-systems-session-secret-of-at-least-32-characters";
    for (const key of keys.slice(2)) process.env[key] = "";
    const runtime = await createApp(), owner = request.agent(runtime.app), viewer = request.agent(runtime.app), base = "/api/projects/project-sample-taskpilot/engineering/systems";
    try {
      await request(runtime.app).get(base).expect(401);
      const login = await owner.post("/api/auth/login").send({ email: "owner@codemesh.dev", password: "CodeMesh123!" }).expect(200);
      const csrf = (login.headers["set-cookie"] as unknown as string[]).find((value) => value.startsWith("cm_csrf="))!.split(";")[0]!.slice(8);
      const other = await viewer.post("/api/auth/login").send({ email: "viewer@codemesh.dev", password: "CodeMesh123!" }).expect(200);
      const otherCsrf = (other.headers["set-cookie"] as unknown as string[]).find((value) => value.startsWith("cm_csrf="))!.split(";")[0]!.slice(8);
      await owner.post(`${base}/revisions`).send({}).expect(403);
      await viewer.post(`${base}/revisions`).set("x-csrf-token", otherCsrf).send({}).expect(403);
      const capture = await owner.post(`${base}/revisions`).set("x-csrf-token", csrf).send({}).expect(200);
      const source = runtime.store.listFiles("project-sample-taskpilot").find((file) => file.path === "src/auth/session.ts")!;
      await runtime.store.upsertWorkspaceDoc("project-sample-taskpilot", "main", source.path, `${source.content}\nexport function newValue() { return 1; }`);
      const after = await owner.post(`${base}/revisions`).set("x-csrf-token", csrf).send({}).expect(200);
      const compared = await owner.get(`${base}/revisions/compare?before=${capture.body.data.id}&after=${after.body.data.id}`).expect(200);
      expect(compared.body.data.files).toContainEqual({ path: source.path, status: "changed" });
      const code = await owner.get(`${base}/revisions/source?before=${capture.body.data.id}&after=${after.body.data.id}&path=${encodeURIComponent(source.path)}`).expect(200);
      expect(code.body.data.before).toBe(source.content); expect(code.body.data.after).toContain("newValue");
      await owner.post(`${base}/verification`).set("x-csrf-token", csrf).send({ runId: capture.body.data.id, stages: ["test"], approved: true }).expect(424);
      await owner.post(`${base}/verification`).set("x-csrf-token", csrf).send({ runId: capture.body.data.id, stages: ["test"], approved: true, command: "arbitrary shell" }).expect(422);
      const issued = await owner.post(`${base}/telemetry-tokens`).set("x-csrf-token", csrf).send({ name: "Test collector", confirmed: true }).expect(200);
      const token = issued.body.data.token;
      expect(token).toMatch(/^cvt_/); expect(JSON.stringify(runtime.store.snapshot())).not.toContain(token);
      const telemetryPath = "/api/telemetry/project-sample-taskpilot/v1/traces";
      const batch = { resourceSpans: [{ scopeSpans: [{ spans: [{ traceId: "a".repeat(32), spanId: "b".repeat(16), name: "session", startTimeUnixNano: "1000000000", endTimeUnixNano: "1000500000", attributes: [{ key: "code.file.path", value: { stringValue: source.path } }, { key: "secret", value: { stringValue: "DO_NOT_STORE" } }] }] }] }] };
      await owner.post(telemetryPath).send(batch).expect(401);
      await request(runtime.app).post(telemetryPath).set("Authorization", `Bearer ${token}`).send(batch).expect(200);
      const view = await owner.get(base).expect(200);
      expect(view.body.data.traces).toHaveLength(1); expect(JSON.stringify(view.body.data)).not.toContain(token); expect(JSON.stringify(view.body.data.traces)).not.toContain("DO_NOT_STORE");
      expect((await viewer.get(base)).body.data.telemetryTokens).toEqual([]);
      await owner.delete(`${base}/telemetry-tokens/${issued.body.data.id}`).set("x-csrf-token", csrf).expect(200);
      await request(runtime.app).post(telemetryPath).set("Authorization", `Bearer ${token}`).send(batch).expect(401);
      const score = await owner.get(`${base}/scorecard`).expect(200); expect(score.body.data.officialRepairScore).toBeNull(); expect(score.body.data.pipeline.passRate).toBeNull();
      const job = await owner.post(`${base}/redteam`).set("x-csrf-token", csrf).send({}).expect(200);
      for (let count = 0; count < 50 && !["succeeded", "failed"].includes(runtime.store.getOperationJob(job.body.data.id)!.status); count++) await new Promise((resolve) => setTimeout(resolve, 50));
      expect((runtime.store.getOperationJob(job.body.data.id)?.output?.report as any)?.rows.every((row: any) => row.status === "PASS")).toBe(true);
      await owner.post(`${base}/publications/approve`).set("x-csrf-token", csrf).send({ runId: capture.body.data.id, title: "Test draft", base: "main", installationId: 1, approved: true }).expect(404);
    } finally {
      await runtime.queue.stop(); await runtime.realtime.close(); await runtime.store.close();
      for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
