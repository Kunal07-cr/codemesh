import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAiProvider, type AiProvider } from "../../packages/ai/src/index";
import { hashContent } from "../../packages/code-intelligence/src/index";
import { compareLabProbe, engineeringRequestSchema, type LabResult, type PatchProposal } from "../../packages/shared/src/index";
import { createStore } from "../../apps/api/src/db/store";
import { loadConfig } from "../../apps/api/src/config";
import { EngineeringEngine, engineeringVerification, makeEngineeringRun, publicEngineeringRun, validateEngineeringPatch } from "../../apps/api/src/services/engineeringEngine";
import { importBenchmark } from "../../apps/api/src/services/benchmarkDatasets";

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codaventra-engineering-"));
  const filePath = path.join(directory, "state.json"), store = await createStore(filePath);
  const projectId = "project-sample-taskpilot", userId = store.getUserRecordByEmail("owner@codemesh.dev")!.id;
  return { store, directory, filePath, projectId, userId, async close() { await store.close(); await fs.rm(directory, { recursive: true, force: true }); } };
}

describe("evidence-driven engineering engine", () => {
  it("does not turn unscored changes, timeouts or unstable worker results into passing verification", () => {
    const returned = (value: number) => ({ status: "returned" as const, value, durationMs: 1, events: [] });
    const probe = { id: "case", label: "An expectation", args: [1], expected: 2 };
    const result: LabResult = { comparisons: [compareLabProbe(probe, returned(1), returned(2))], investigation: [], counterexample: null, executionCount: 2, environment: { runtime: "fixture", image: "fixture", isolation: "Mocked outcome records only", command: "not executed by this test" }, unknowns: [] };
    expect(engineeringVerification(result).status).toBe("PASS");
    expect(engineeringVerification({ ...result, comparisons: [compareLabProbe(probe, returned(2), returned(1))] }).status).toBe("FAIL");
    expect(engineeringVerification({ ...result, comparisons: [compareLabProbe({ id: "unscored", label: "No expectation", args: [1] }, returned(1), returned(2))] }).status).toBe("NOT_RUN");
    expect(engineeringVerification({ ...result, comparisons: [compareLabProbe(probe, returned(1), { status: "timeout", durationMs: 10, events: [] })] }).status).toBe("NOT_RUN");
    expect(engineeringVerification({ ...result, stability: { probeId: "case", baseline: returned(1), proposed: returned(2), repeatMatched: false } }).status).toBe("NOT_RUN");
  });
  it("uses frozen source, leaves original files unchanged, and persists a real investigation with NOT RUN tests", async () => {
    const f = await fixture();
    try {
      const input = engineeringRequestSchema.parse({ objective: "What does createSessionToken do with the userId?", mode: "investigate" });
      const run = makeEngineeringRun(f.store, f.projectId, f.userId, input);
      const baseline = JSON.stringify(f.store.listFiles(f.projectId));
      await f.store.saveEngineeringRun(run);
      const job = await f.store.createOperationJob({ projectId: f.projectId, createdBy: f.userId, type: "engineering.run", metadata: { runId: run.id } });
      const engine = new EngineeringEngine(f.store, loadConfig(), createAiProvider({}));
      await engine.execute(job);
      const saved = f.store.getEngineeringRun(f.projectId, run.id)!;
      expect(saved.steps.some((step) => step.stage === "report")).toBe(true);
      expect(saved.verification.status).toBe("NOT_RUN");
      expect(saved.telemetry.billedTokens).toBeNull();
      expect(saved.manifest[0]!.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(saved.citations.length).toBeGreaterThan(0);
      expect(publicEngineeringRun(saved)).not.toHaveProperty("snapshot");
      expect(JSON.stringify(f.store.listFiles(f.projectId))).toBe(baseline);
      const reopened = await createStore(f.filePath);
      expect(reopened.getEngineeringRun(f.projectId, run.id)?.verification.status).toBe("NOT_RUN");
      await reopened.close();
    } finally { await f.close(); }
  });

  it("bounds proposal retries and rejects foreign, stale, empty or fabricated-verified patches", async () => {
    const f = await fixture();
    try {
      const run = makeEngineeringRun(f.store, f.projectId, f.userId, engineeringRequestSchema.parse({ objective: "Fix createSessionToken validation", mode: "repair", maxAttempts: 2 }));
      const original = run.snapshot[0]!;
      const patch: PatchProposal = { id: randomUUID(), projectId: run.projectId, workspaceId: "main", title: "Test proposal", summary: "Fixture only", files: [{ path: original.path, baseContent: original.content, proposedContent: `${original.content}\n// proposed fixture\n`, baseHash: hashContent(original.content) }], suggestedVerification: [], executedVerification: [], status: "proposed", createdAt: new Date().toISOString() };
      expect(validateEngineeringPatch(patch, run).status).toBe("proposed");
      for (const invalid of [{ ...patch, projectId: "other" }, { ...patch, executedVerification: ["tests passed"] }, { ...patch, files: [{ ...patch.files[0]!, path: "../escape.ts" }] }, { ...patch, files: [{ ...patch.files[0]!, baseHash: "stale" }] }]) expect(() => validateEngineeringPatch(invalid, run)).toThrow();
      let calls = 0;
      const provider: AiProvider = { name: "rejecting-fixture", async answer() { calls++; throw new Error("fixture provider failure"); } };
      await f.store.saveEngineeringRun(run);
      const job = await f.store.createOperationJob({ projectId: f.projectId, createdBy: f.userId, type: "engineering.run", metadata: { runId: run.id } });
      await new EngineeringEngine(f.store, loadConfig(), provider).execute(job);
      expect(calls).toBe(2);
      expect(f.store.getEngineeringRun(f.projectId, run.id)?.status).toBe("needs_input");
      expect(f.store.listPatches(f.projectId)).toHaveLength(0);
    } finally { await f.close(); }
  });

  it("never passes benchmark reference patches or hidden test names to the evaluated provider", async () => {
    const f = await fixture();
    try {
      await f.store.updateProjectRepository(f.projectId, "https://github.com/example/repo");
      const corpus = importBenchmark({ name: "Leakage guard", source: "swe-bench", sourceUrl: "https://github.com/SWE-bench/SWE-bench", version: "fixture-v1", license: "Fixture terms reviewed", licenseReviewed: true, split: "test", content: JSON.stringify([{ instance_id: "example__repo-1", repo: "example/repo", base_commit: f.store.getProject(f.projectId)!.commitSha, problem_statement: "Explain createSessionToken validation", patch: "HIDDEN_GOLD_PATCH", FAIL_TO_PASS: '["HIDDEN_TEST_NAME"]' }]) }, f.projectId, f.userId);
      await f.store.saveBenchmarkCorpus(corpus);
      const run = makeEngineeringRun(f.store, f.projectId, f.userId, engineeringRequestSchema.parse({ objective: "Ignored custom question", corpusId: corpus.id, taskId: corpus.records[0]!.id }));
      const local = createAiProvider({});
      let supplied = "";
      const provider: AiProvider = { name: "leakage-fixture", answer(request, context) { supplied = JSON.stringify({ request, context }); return local.answer(request, context); } };
      await f.store.saveEngineeringRun(run);
      const job = await f.store.createOperationJob({ projectId: f.projectId, createdBy: f.userId, type: "engineering.run", metadata: { runId: run.id } });
      await new EngineeringEngine(f.store, loadConfig(), provider).execute(job);
      expect(supplied).not.toContain("HIDDEN_GOLD_PATCH");
      expect(supplied).not.toContain("HIDDEN_TEST_NAME");
      expect(supplied).not.toContain("Ignored custom question");
      expect(() => makeEngineeringRun(f.store, f.projectId, f.userId, { ...engineeringRequestSchema.parse({ objective: "A task objective" }), corpusId: corpus.id, taskId: "missing" })).toThrow();
    } finally { await f.close(); }
  });

  it("cancellation prevents a late provider response from creating a proposal or replacing the cancelled record", async () => {
    const f = await fixture();
    try {
      let release!: () => void, entered!: () => void;
      const barrier = new Promise<void>((resolve) => { release = resolve; }), ready = new Promise<void>((resolve) => { entered = resolve; });
      const local = createAiProvider({});
      const provider: AiProvider = { name: "deferred-fixture", async answer(request, context) { entered(); await barrier; return local.answer(request, context); } };
      const run = makeEngineeringRun(f.store, f.projectId, f.userId, engineeringRequestSchema.parse({ objective: "Explain createSessionToken", mode: "investigate" }));
      await f.store.saveEngineeringRun(run);
      const job = await f.store.createOperationJob({ projectId: f.projectId, createdBy: f.userId, type: "engineering.run", metadata: { runId: run.id } });
      const pending = new EngineeringEngine(f.store, loadConfig(), provider).execute(job);
      await ready;
      run.status = "cancelled"; await f.store.saveEngineeringRun(run); await f.store.cancelOperationJob(f.projectId, job.id);
      release(); await pending;
      expect(f.store.getEngineeringRun(f.projectId, run.id)?.status).toBe("cancelled");
      expect(f.store.listPatches(f.projectId)).toHaveLength(0);
    } finally { await f.close(); }
  });
});
