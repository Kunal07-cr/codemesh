import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../apps/api/src/server";
import { sampleMission } from "../../apps/web/src/lib/missionDrafts";

describe("Mission Studio HTTP boundaries", () => {
  it("protects plans, dispatch, handoffs and exports with ownership, permissions, CSRF and versions", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codaventra-missions-http-"));
    const keys = ["DATA_PATH", "SESSION_SECRET", "LLM_BASE_URL", "LLM_MODEL", "GEMINI_API_KEY"] as const;
    const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.DATA_PATH = path.join(directory, "state.json"); process.env.SESSION_SECRET = "mission-test-session-secret-of-at-least-32-characters";
    process.env.LLM_BASE_URL = ""; process.env.LLM_MODEL = ""; process.env.GEMINI_API_KEY = "";
    const runtime = await createApp(), owner = request.agent(runtime.app), viewer = request.agent(runtime.app);
    const projectId = "project-sample-taskpilot", base = `/api/projects/${projectId}/missions`;
    try {
      await request(runtime.app).get(base).expect(401);
      const login = await owner.post("/api/auth/login").send({ email: "owner@codemesh.dev", password: "CodeMesh123!" }).expect(200);
      const csrf = (login.headers["set-cookie"] as unknown as string[]).find((cookie) => cookie.startsWith("cm_csrf="))!.split(";")[0]!.slice("cm_csrf=".length);
      const viewerLogin = await viewer.post("/api/auth/login").send({ email: "viewer@codemesh.dev", password: "CodeMesh123!" }).expect(200);
      const viewerCsrf = (viewerLogin.headers["set-cookie"] as unknown as string[]).find((cookie) => cookie.startsWith("cm_csrf="))!.split(";")[0]!.slice("cm_csrf=".length);
      const input = sampleMission(projectId), ownerId = runtime.store.getUserRecordByEmail("owner@codemesh.dev")!.id;
      const consumer = await runtime.store.createProject(ownerId, { name: "Private mission consumer", description: "HTTP fixture", tags: [], visibility: "private", published: false, guidelines: "Review evidence" });
      await runtime.store.replaceProjectFiles(consumer.id, runtime.store.listFiles(projectId).map((file) => ({ ...file, projectId: consumer.id })), "zip", "consumer-v1");
      input.tasks[1]!.projectId = consumer.id;
      await owner.post(base).send(input).expect(403);
      await viewer.post(base).set("x-csrf-token", viewerCsrf).send(input).expect(403);
      await owner.post(base).set("x-csrf-token", csrf).send({ ...input, shell: "execute repository" }).expect(422);
      await owner.post(base).set("x-csrf-token", csrf).send({ ...input, tasks: input.tasks.map((task, index) => ({ ...task, dependsOn: [input.tasks[1 - index]!.id] })) }).expect(422);
      await owner.post(base).set("x-csrf-token", csrf).send({ ...input, tasks: [input.tasks[0], { ...input.tasks[1], projectId: "unknown-private" }] }).expect(403);
      let mission = (await owner.post(base).set("x-csrf-token", csrf).send(input).expect(200)).body.data;
      expect(mission.tasks.map((task: { state: string }) => task.state)).toEqual(["ready", "waiting"]);
      const viewerList = (await viewer.get(base).expect(200)).body.data;
      expect(viewerList.missions).toEqual([]); expect(viewerList.createAllowed).toBe(false); expect(JSON.stringify(viewerList)).not.toContain(consumer.name);
      await viewer.get(`${base}/${mission.id}/report`).expect(404);
      await viewer.post(`${base}/${mission.id}/dispatch`).set("x-csrf-token", viewerCsrf).send({ expectedVersion: mission.version, confirmed: true }).expect(404);
      await owner.post(`${base}/${mission.id}/dispatch`).set("x-csrf-token", csrf).send({ expectedVersion: mission.version, confirmed: false }).expect(422);
      mission = (await owner.post(`${base}/${mission.id}/dispatch`).set("x-csrf-token", csrf).send({ expectedVersion: mission.version, confirmed: true }).expect(200)).body.data;
      const first = mission.tasks[0];
      for (let count = 0; count < 80 && runtime.store.listPendingOperationJobs().some((job) => job.metadata?.runId === first.runId); count++) await new Promise((resolve) => setTimeout(resolve, 50));
      mission = (await owner.get(base).expect(200)).body.data.missions[0];
      expect(mission.tasks[0].state).toBe("review");
      mission = (await owner.post(`${base}/${mission.id}/tasks/${first.id}/accept`).set("x-csrf-token", csrf).send({ expectedVersion: mission.version, confirmed: true, evidenceDigest: mission.tasks[0].evidenceDigest }).expect(200)).body.data;
      expect(mission.tasks[1].state).toBe("ready");
      await owner.post(`${base}/${mission.id}/dispatch`).set("x-csrf-token", csrf).send({ expectedVersion: mission.version - 1, confirmed: true }).expect(409);
      const report = (await owner.get(`${base}/${mission.id}/report`).expect(200)).body.data;
      expect(report.sha256).toMatch(/^[a-f0-9]{64}$/); expect(JSON.stringify(report)).not.toContain('"snapshot"');
      expect(report.payload.mission.tasks[0].run.verification.status).toBe("NOT_RUN");
      expect(report.payload.limitations.join(" ")).toContain("not proof");
      const getRole = runtime.store.getRole.bind(runtime.store), spy = vi.spyOn(runtime.store, "getRole").mockImplementation((id, userId) => id === consumer.id && userId === ownerId ? null : getRole(id, userId));
      expect((await owner.get(base).expect(200)).body.data.missions).toEqual([]);
      await owner.get(`${base}/${mission.id}/report`).expect(404); spy.mockRestore();
      const cancelled = await owner.post(`${base}/${mission.id}/cancel`).set("x-csrf-token", csrf).send({ expectedVersion: mission.version, confirmed: true }).expect(200);
      expect(cancelled.body.data.status).toBe("cancelled");
    } finally {
      vi.restoreAllMocks(); await runtime.queue.stop(); await runtime.realtime.close(); await runtime.store.close();
      for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
      await fs.rm(directory, { recursive: true, force: true });
    }
  }, 30000);
});
