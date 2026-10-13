import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/server";
describe("Conversation lab HTTP journey", () => {
  it("isolates sessions, enforces CSRF and stale-turn checks and stores test feedback", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codaventra-conversation-http-")), keys = ["DATA_PATH", "SESSION_SECRET", "LLM_BASE_URL", "LLM_MODEL", "GEMINI_API_KEY"] as const;
    const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.DATA_PATH = path.join(directory, "state.json"); process.env.SESSION_SECRET = "test-conversation-session-secret-of-32-characters";
    process.env.LLM_BASE_URL = ""; process.env.LLM_MODEL = ""; process.env.GEMINI_API_KEY = "";
    const runtime = await createApp(), owner = request.agent(runtime.app), viewer = request.agent(runtime.app), base = "/api/projects/project-sample-taskpilot/engineering/conversations";
    try {
      await request(runtime.app).get(base).expect(401);
      const login = await owner.post("/api/auth/login").send({ email: "owner@codemesh.dev", password: "CodeMesh123!" }).expect(200);
      const csrf = (login.headers["set-cookie"] as unknown as string[]).find((item) => item.startsWith("cm_csrf="))!.split(";")[0]!.slice(8);
      await viewer.post("/api/auth/login").send({ email: "viewer@codemesh.dev", password: "CodeMesh123!" }).expect(200);
      await owner.post(base).send({ promptMode: "few-shot", language: "en" }).expect(403);
      const created = await owner.post(base).set("x-csrf-token", csrf).send({ promptMode: "few-shot", language: "en" }).expect(200);
      const id = created.body.data.id;
      expect((await viewer.get(base)).body.data.runs).toEqual([]);
      await owner.post(`${base}/${id}/turns`).set("x-csrf-token", csrf).send({ transcript: "demo", expectedTurns: 1 }).expect(409);
      for (const [expectedTurns, transcript] of ["product demo", "Tuesday 11 AM", "yes"].entries()) await owner.post(`${base}/${id}/turns`).set("x-csrf-token", csrf).send({ transcript, expectedTurns }).expect(200);
      expect((await owner.get(base)).body.data.runs[0].state).toBe("completed");
      await owner.post(`${base}/${id}/turns`).set("x-csrf-token", csrf).send({ transcript: "again", expectedTurns: 3 }).expect(400);
      await owner.post(`${base}/${id}/feedback`).set("x-csrf-token", csrf).send({ rating: "useful", category: "tool-routing", note: "Synthetic test" }).expect(200);
      const report = await owner.post(`${base}/evaluate`).set("x-csrf-token", csrf).send({}).expect(200); expect(report.body.data.metrics.passed).toBe(36);
      await owner.post(base).set("x-csrf-token", csrf).send({ promptMode: "persona", language: "en", providerMode: "configured-model", modelConsent: true }).expect(424);
    } finally {
      await runtime.queue.stop(); await runtime.realtime.close(); await runtime.store.close();
      for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
