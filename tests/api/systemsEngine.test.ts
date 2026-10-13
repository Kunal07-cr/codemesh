import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createStore } from "../../apps/api/src/db/store";
import { loadConfig } from "../../apps/api/src/config";
import { makeEngineeringRun } from "../../apps/api/src/services/engineeringEngine";
import { SystemsEngine, engineeringSourceFresh, verificationBundle } from "../../apps/api/src/services/systemsEngine";
import { systemHash } from "../../apps/api/src/services/systemAnalysis";
import { verificationDockerArgs } from "../../apps/api/src/services/verificationDocker";
import type { VerificationClient } from "../../apps/api/src/services/verificationClient";
import { createAiProvider } from "../../packages/ai/src/index";
import { hashContent } from "../../packages/code-intelligence/src/index";
import { engineeringRequestSchema, type VerificationResult } from "../../packages/shared/src/index";

describe("Restricted verification orchestration", () => {
  it("uses fixed argv and non-root, network-free, read-only containers", () => {
    const args = verificationDockerArgs("test-worker", "C:/tmp/source", "C:/tmp/harness", `sha256:${"a".repeat(64)}`);
    for (const value of ["--network=none", "--read-only", "--cap-drop=ALL", "--user=65534:65534", "--entrypoint=node"]) expect(args).toContain(value);
    expect(() => verificationDockerArgs("bad;name", "/tmp", "/tmp", "latest")).toThrow();
    expect(() => verificationDockerArgs("valid", "/tmp,escaped", "/harness", `sha256:${"a".repeat(64)}`)).toThrow();
  });
  it("accepts only matching worker evidence and respects stale/changed proposals", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codaventra-systems-engine-")), store = await createStore(path.join(directory, "state.json"));
    try {
      const projectId = "project-sample-taskpilot", userId = store.getUserRecordByEmail("owner@codemesh.dev")!.id;
      const run = makeEngineeringRun(store, projectId, userId, engineeringRequestSchema.parse({ objective: "Repair session token" })), file = run.snapshot.find((item) => item.path === "src/auth/session.ts")!;
      run.status = "awaiting_review"; run.patch = { id: randomUUID(), projectId, workspaceId: "main", title: "Reviewed fixture", summary: "Fixture", files: [{ path: file.path, baseContent: file.content, baseHash: hashContent(file.content), proposedContent: `${file.content}\n// reviewed fixture` }], suggestedVerification: [], executedVerification: [], status: "proposed", createdAt: run.createdAt };
      await store.savePatch(run.patch); await store.saveEngineeringRun(run);
      const bundle = verificationBundle(run, ["test"]);
      const observation = { stage: "test" as const, command: "npm run test", status: "PASS" as const, exitCode: 0, durationMs: 10, detail: "Mock worker observation", output: "fixture" };
      let result: VerificationResult = { bundleHash: systemHash(bundle), image: `sha256:${"a".repeat(64)}`, baseline: [observation], proposed: [observation] };
      const remoteId = randomUUID(), worker = { submit: vi.fn(async () => ({ id: remoteId, status: "queued" })), get: vi.fn(async () => ({ id: remoteId, status: "completed", result })), cancel: vi.fn(async () => ({})) } as unknown as VerificationClient;
      const engine = new SystemsEngine(store, loadConfig({}), createAiProvider({}), worker);
      async function job() {
        const record = await store.saveVerificationRun({ id: randomUUID(), projectId, createdBy: userId, createdAt: run.createdAt, engineeringRunId: run.id, patchId: run.patch!.id, revision: run.revision, bundleHash: systemHash(bundle), status: "queued", stages: ["test"] });
        return store.createOperationJob({ projectId, type: "engineering.verify", createdBy: userId, metadata: { verificationId: record.id } });
      }
      await engine.execute(await job()); expect(store.getEngineeringRun(projectId, run.id)?.verification.status).toBe("PASS");
      result = { ...result, bundleHash: "b".repeat(64) };
      await expect(engine.execute(await job())).rejects.toThrow("No complete verification result");
      expect(worker.cancel).toHaveBeenCalled();
      expect(engineeringSourceFresh(store, run)).toBe(true);
      await store.savePatch({ ...run.patch, status: "applied" }); expect(engineeringSourceFresh(store, run)).toBe(false);
      expect(() => verificationBundle(run, ["test", "test"])).toThrow();
    } finally { await store.close(); await fs.rm(directory, { recursive: true, force: true }); }
  });
});
