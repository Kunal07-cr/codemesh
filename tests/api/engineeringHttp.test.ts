import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/server";
import { makeEngineeringRun } from "../../apps/api/src/services/engineeringEngine";
import { engineeringClarificationSchema, engineeringRequestSchema } from "../../packages/shared/src/index";

describe("Engineering Studio HTTP journeys", () => {
  it.each([
    { instruction: "short", expectedAttempt: 1 },
    { instruction: " ".repeat(12), expectedAttempt: 1 },
    { instruction: "x".repeat(2001), expectedAttempt: 1 },
    { instruction: "Investigate the session", expectedAttempt: 0 },
    { instruction: "Investigate the session", expectedAttempt: 1, maxAttempts: 99 }
  ])("rejects invalid clarification payloads %j", (input) => {
    expect(engineeringClarificationSchema.safeParse(input).success).toBe(false);
  });

  it("resumes a creator-owned clarification once without resetting attempts, source or review boundaries", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codaventra-clarification-http-"));
    const keys = ["DATA_PATH", "SESSION_SECRET", "LLM_BASE_URL", "LLM_MODEL", "GEMINI_API_KEY"] as const;
    const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.DATA_PATH = path.join(directory, "state.json"); process.env.SESSION_SECRET = "clarification-test-session-secret-of-at-least-32-characters";
    process.env.LLM_BASE_URL = ""; process.env.LLM_MODEL = ""; process.env.GEMINI_API_KEY = "";
    const runtime = await createApp(), owner = request.agent(runtime.app), viewer = request.agent(runtime.app);
    const projectId = "project-sample-taskpilot", base = `/api/projects/${projectId}/engineering`;
    try {
      const login = await owner.post("/api/auth/login").send({ email: "owner@codemesh.dev", password: "CodeMesh123!" }).expect(200);
      const csrf = (login.headers["set-cookie"] as unknown as string[]).find((cookie) => cookie.startsWith("cm_csrf="))!.split(";")[0]!.slice("cm_csrf=".length);
      const viewerLogin = await viewer.post("/api/auth/login").send({ email: "viewer@codemesh.dev", password: "CodeMesh123!" }).expect(200);
      const viewerCsrf = (viewerLogin.headers["set-cookie"] as unknown as string[]).find((cookie) => cookie.startsWith("cm_csrf="))!.split(";")[0]!.slice("cm_csrf=".length);
      const created = await owner.post(`${base}/runs`).set("x-csrf-token", csrf).send({ objective: "Fix createSessionToken validation", mode: "repair", maxAttempts: 3 }).expect(200);
      const runId = created.body.data.run.id;
      for (let count = 0; count < 80 && ["running", "queued"].includes(runtime.store.getOperationJob(created.body.data.job.id)!.status); count++) await new Promise((resolve) => setTimeout(resolve, 50));
      let run = runtime.store.getEngineeringRun(projectId, runId)!;
      expect(run.status).toBe("needs_input"); expect(run.attempts).toBe(1);
      const baseline = JSON.stringify(runtime.store.listFiles(projectId)), manifest = JSON.stringify(run.manifest);
      const input = { instruction: "In src/auth/session.ts, replace `15m` with `30m`.", expectedAttempt: 1 };
      await request(runtime.app).post(`${base}/runs/${runId}/clarify`).set("Cookie", "cm_csrf=unauthenticated-fixture").set("x-csrf-token", "unauthenticated-fixture").send(input).expect(401);
      await owner.post(`${base}/runs/${runId}/clarify`).send(input).expect(403);
      await viewer.post(`${base}/runs/${runId}/clarify`).set("x-csrf-token", viewerCsrf).send(input).expect(404);
      await owner.post(`${base}/runs/${runId}/clarify`).set("x-csrf-token", csrf).send({ ...input, maxAttempts: 99 }).expect(422);
      const continued = await owner.post(`${base}/runs/${runId}/clarify`).set("x-csrf-token", csrf).send(input).expect(200);
      await owner.post(`${base}/runs/${runId}/clarify`).set("x-csrf-token", csrf).send(input).expect(409);
      for (let count = 0; count < 80 && ["running", "queued"].includes(runtime.store.getOperationJob(continued.body.data.job.id)!.status); count++) await new Promise((resolve) => setTimeout(resolve, 50));
      run = runtime.store.getEngineeringRun(projectId, runId)!;
      expect(run.status).toBe("awaiting_review"); expect(run.attempts).toBe(2); expect(run.maxAttempts).toBe(3);
      expect(run.objective).toBe("Fix createSessionToken validation"); expect(run.clarifications).toHaveLength(1);
      expect(run.patch?.status).toBe("proposed"); expect(run.patch?.files[0]?.proposedContent).toContain('expiresIn: "30m"');
      expect(JSON.stringify(runtime.store.listFiles(projectId))).toBe(baseline); expect(JSON.stringify(run.manifest)).toBe(manifest);
      const report = await owner.get(`${base}/runs/${runId}/report`).expect(200);
      expect(report.body.data.payload.run.clarifications[0]).toMatchObject({ instruction: input.instruction, attempt: 2 });
      expect(report.body.data.payload.commandsExecuted).toEqual([]); expect(report.body.data.payload.run.verification.status).toBe("NOT_RUN");
      expect(report.body.data.payload.run).not.toHaveProperty("snapshot");
      await owner.post(`${base}/runs/${runId}/clarify`).set("x-csrf-token", csrf).send({ ...input, expectedAttempt: 2 }).expect(409);
      await runtime.queue.stop();
      const blocked = async (status: "needs_input" | "cancelled", attempts = 1) => {
        const record = makeEngineeringRun(runtime.store, projectId, run.createdBy, engineeringRequestSchema.parse({ objective: "Investigate createSessionToken", maxAttempts: 3 }));
        record.status = status; record.attempts = attempts; await runtime.store.saveEngineeringRun(record); return record;
      };
      const exhausted = await blocked("needs_input", 3);
      await owner.post(`${base}/runs/${exhausted.id}/clarify`).set("x-csrf-token", csrf).send({ ...input, expectedAttempt: 3 }).expect(409);
      const cancelled = await blocked("cancelled");
      await owner.post(`${base}/runs/${cancelled.id}/clarify`).set("x-csrf-token", csrf).send(input).expect(409);
      const benchmark = await blocked("needs_input"); benchmark.corpusId = "00000000-0000-4000-8000-000000000001"; await runtime.store.saveEngineeringRun(benchmark);
      await owner.post(`${base}/runs/${benchmark.id}/clarify`).set("x-csrf-token", csrf).send(input).expect(409);
      const active = await blocked("needs_input");
      await runtime.store.createOperationJob({ projectId, createdBy: run.createdBy, type: "engineering.run", metadata: { runId: active.id } });
      await owner.post(`${base}/runs/${active.id}/clarify`).set("x-csrf-token", csrf).send(input).expect(409);
      const stale = await blocked("needs_input"), file = runtime.store.listFiles(projectId)[0]!;
      await runtime.store.upsertWorkspaceDoc(projectId, "main", file.path, `${file.content}\n// new revision\n`);
      await owner.post(`${base}/runs/${stale.id}/clarify`).set("x-csrf-token", csrf).send(input).expect(409);
      for (const record of [exhausted, cancelled, benchmark, active, stale]) expect(record.clarifications).toBeUndefined();
    } finally {
      await runtime.queue.stop(); await runtime.realtime.close(); await runtime.store.close();
      for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("enforces ownership and CSRF, imports/evaluates fixtures, completes a task and detects stale contract evidence", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codaventra-engineering-http-"));
    const keys = ["DATA_PATH", "SESSION_SECRET", "LLM_BASE_URL", "LLM_MODEL", "GEMINI_API_KEY"] as const;
    const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.DATA_PATH = path.join(directory, "state.json"); process.env.SESSION_SECRET = "engineering-test-session-secret-of-at-least-32-characters";
    process.env.LLM_BASE_URL = ""; process.env.LLM_MODEL = ""; process.env.GEMINI_API_KEY = "";
    const runtime = await createApp(), owner = request.agent(runtime.app), viewer = request.agent(runtime.app);
    const base = "/api/projects/project-sample-taskpilot/engineering";
    try {
      await request(runtime.app).get(base).expect(401);
      const login = await owner.post("/api/auth/login").send({ email: "owner@codemesh.dev", password: "CodeMesh123!" }).expect(200);
      const csrf = (login.headers["set-cookie"] as unknown as string[]).find((cookie) => cookie.startsWith("cm_csrf="))!.split(";")[0]!.slice("cm_csrf=".length);
      const viewerLogin = await viewer.post("/api/auth/login").send({ email: "viewer@codemesh.dev", password: "CodeMesh123!" }).expect(200);
      const viewerCsrf = (viewerLogin.headers["set-cookie"] as unknown as string[]).find((cookie) => cookie.startsWith("cm_csrf="))!.split(";")[0]!.slice("cm_csrf=".length);
      await owner.post(`${base}/datasets/example`).send({}).expect(403);
      await viewer.post(`${base}/datasets/example`).set("x-csrf-token", viewerCsrf).send({}).expect(403);
      const imported = await owner.post(`${base}/datasets/example`).set("x-csrf-token", csrf).send({}).expect(200);
      expect(JSON.stringify(imported.body.data)).not.toContain("DO_NOT_RETRIEVE_REFERENCE");
      expect(imported.body.data).not.toHaveProperty("raw");
      const evaluated = await owner.post(`${base}/datasets/${imported.body.data.id}/evaluate`).set("x-csrf-token", csrf).send({}).expect(200);
      for (let count = 0; count < 50 && !["succeeded", "failed"].includes(runtime.store.getOperationJob(evaluated.body.data.id)!.status); count++) await new Promise((resolve) => setTimeout(resolve, 50));
      expect(runtime.store.getOperationJob(evaluated.body.data.id)?.output?.report).toEqual(expect.objectContaining({ metrics: { measured: 3, notRun: 0, recallAtK: 1 } }));
      const created = await owner.post(`${base}/runs`).set("x-csrf-token", csrf).send({ objective: "Explain createSessionToken", mode: "investigate", maxAttempts: 2 }).expect(200);
      const runId = created.body.data.run.id;
      for (let count = 0; count < 50 && ["running", "queued"].includes(runtime.store.getEngineeringRun("project-sample-taskpilot", runId)!.status); count++) await new Promise((resolve) => setTimeout(resolve, 50));
      const report = await owner.get(`${base}/runs/${runId}/report`).expect(200);
      expect(report.body.data.payload.run.verification.status).toBe("NOT_RUN");
      expect(report.body.data.payload.commandsExecuted).toEqual([]);
      expect(report.body.data.payload.run).not.toHaveProperty("snapshot");
      await viewer.get(`${base}/runs/${runId}/report`).expect(404);
      const view = await viewer.get(base).expect(200);
      expect(view.body.data.runs).toEqual([]);
      expect(view.body.data.jobs).toEqual([]);
      await owner.post(`${base}/runs`).set("x-csrf-token", csrf).send({ objective: "Task with injected shell", command: "rm -rf /" }).expect(422);
      const ownerId = runtime.store.getUserRecordByEmail("owner@codemesh.dev")!.id;
      const consumer = await runtime.store.createProject(ownerId, { name: "Consumer repository", description: "HTTP test fixture", tags: [], visibility: "private", published: false, guidelines: "Review contracts" });
      const file = runtime.store.listFiles("project-sample-taskpilot")[0]!;
      await runtime.store.replaceProjectFiles(consumer.id, [{ ...file, projectId: consumer.id }], "zip", "consumer-fixture-v1");
      await owner.post(`${base}/contracts`).set("x-csrf-token", csrf).send({ consumerProjectId: consumer.id, name: "Fixture API contract", producerPath: file.path, consumerPath: file.path, confirmed: true }).expect(200);
      expect((await owner.get(base)).body.data.links[0].stale).toBe(false);
      expect((await viewer.get(base)).body.data.links).toEqual([]);
      await runtime.store.upsertWorkspaceDoc(consumer.id, "main", file.path, `${file.content}\n// drift\n`);
      expect((await owner.get(base)).body.data.links[0].stale).toBe(true);
      const stale = makeEngineeringRun(runtime.store, "project-sample-taskpilot", ownerId, engineeringRequestSchema.parse({ objective: "Retry the session investigation", maxAttempts: 3 }));
      stale.status = "needs_input"; stale.attempts = 1; await runtime.store.saveEngineeringRun(stale);
      await runtime.store.upsertWorkspaceDoc("project-sample-taskpilot", "main", file.path, `${file.content}\n// changed\n`);
      await owner.post(`${base}/runs/${stale.id}/retry`).set("x-csrf-token", csrf).send({}).expect(409);
    } finally {
      await runtime.queue.stop(); await runtime.realtime.close(); await runtime.store.close();
      for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
