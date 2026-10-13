import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compareLabProbe, generateLabBoundaries, labBundleSchema, labCanonical, labOutcomeSchema, labRequestSchema, labResultSchema, labSafeFilePath,
  type LabBundle, type LabOutcome, type LabRun
} from "@codemesh/shared";
import { hashContent } from "@codemesh/code-intelligence";
import { createApp } from "../../apps/api/src/server";
import { labDockerArgs } from "../../apps/api/src/services/changeLabDocker";
import { exampleBundle, labHash, runChangeExperiment, runLabExample } from "../../apps/api/src/services/changeLabEngine";
import { loadConfig } from "../../apps/api/src/config";
import { verifyLabReceipt, labRegressionTest } from "../../apps/web/src/lib/changeLab";

const outcome = (value: number): LabOutcome => ({ status: "returned", value, events: [], durationMs: 1 });
const environment = { runtime: "test fixture", image: "fixture", isolation: "trusted test only", command: "fixture function" };
describe("Change Lab comparison and bounded execution engine", () => {
  it("distinguishes differences from expectation-backed regressions and infrastructure failures", () => {
    const probe = { id: "one", label: "One", args: [1] };
    expect(compareLabProbe(probe, outcome(1), outcome(2)).verdict).toBe("changed");
    expect(compareLabProbe({ ...probe, expected: 1 }, outcome(1), outcome(2)).verdict).toBe("regression");
    expect(compareLabProbe({ ...probe, expected: 2 }, outcome(1), outcome(2)).verdict).toBe("improvement");
    expect(compareLabProbe({ ...probe, expected: 3 }, outcome(1), outcome(2)).verdict).toBe("inconclusive");
    expect(compareLabProbe(probe, outcome(1), { status: "timeout", error: "limit", events: [], durationMs: 4000 }).verdict).toBe("inconclusive");
    const thrown: LabOutcome = { status: "threw", error: "bad input", events: [], durationMs: 1 };
    expect(compareLabProbe(probe, thrown, thrown).verdict).toBe("inconclusive");
    expect(compareLabProbe({ ...probe, expectedError: "bad input" }, thrown, outcome(1)).verdict).toBe("regression");
    expect(compareLabProbe({ ...probe, expected: { b: 2, a: 1 } }, { ...outcome(0), value: { a: 1, b: 2 } }, { ...outcome(0), value: { b: 2, a: 1 } }).verdict).toBe("same");
  });
  it("caps generated probes, removes inherited expectations, and validates safe bundles", () => {
    const bundle = exampleBundle();
    const probes = generateLabBoundaries(bundle.request.probes);
    expect(probes.length).toBeLessThanOrEqual(24);
    expect(new Set(probes.map((probe) => probe.id)).size).toBe(probes.length);
    expect(probes.filter((probe) => probe.generated).every((probe) => probe.expected === undefined && probe.expectedError === undefined)).toBe(true);
    expect(labRequestSchema.safeParse({ ...bundle.request, probes: [bundle.request.probes[0], bundle.request.probes[0]] }).success).toBe(false);
    expect(labRequestSchema.safeParse({ ...bundle.request, command: "arbitrary command" }).success).toBe(false);
    let nested: unknown = 1; for (let depth = 0; depth < 10; depth++) nested = [nested];
    expect(labRequestSchema.safeParse({ ...bundle.request, probes: [{ id: "deep", label: "Deep input", args: [nested] }] }).success).toBe(false);
    expect(labBundleSchema.safeParse({ ...bundle, files: [{ path: "../escape.mjs", content: "bad" }] }).success).toBe(false);
    for (const value of [".env", ".aws/credentials.json", "src/secrets.json", "node_modules/code.mjs", "C:/secret.ts", "src/../escape.ts", "src\\escape.ts"]) expect(labSafeFilePath(value)).toBe(false);
    expect(labSafeFilePath("src/utils/math.ts")).toBe(true);
    expect(labOutcomeSchema.safeParse({ status: "returned", events: [], durationMs: 1 }).success).toBe(false);
    expect(loadConfig({ CHANGE_LAB_WORKER_URL: "http://127.0.0.1:4301", CHANGE_LAB_WORKER_TOKEN: "x".repeat(32) }).CHANGE_LAB_WORKER_URL).toContain("127.0.0.1");
    expect(() => loadConfig({ CHANGE_LAB_WORKER_URL: "http://example.com" })).toThrow();
  });
  it("executes the trusted session example, preserves source, and investigates file reversions", async () => {
    const original = exampleBundle(), before = structuredClone(original);
    const result = labResultSchema.parse(await runLabExample(new AbortController().signal));
    expect(result.comparisons.find((item) => item.probe.id === "expiry")).toMatchObject({ verdict: "regression", baseline: { value: { accepted: false } }, proposed: { value: { accepted: true } } });
    expect(result.investigation[0]?.matchesBaseline).toBe(true);
    expect(result.counterexample?.baseline.value).not.toEqual(result.counterexample?.proposed.value);
    expect(result.environment.isolation).toContain("No imported");
    expect(result.executionCount).toBeLessThanOrEqual(64);
    expect(original).toEqual(before);
  });
  it("shrinks differing inputs, isolates a candidate file, and stops on cancellation", async () => {
    const bundle: LabBundle = { ...exampleBundle(), files: [{ path: "src/a.mjs", content: "before" }], changes: [{ path: "src/a.mjs", content: "after" }], request: { ...exampleBundle().request, filePath: "src/a.mjs", generateBoundaries: false, probes: [{ id: "large", label: "Large input", args: [999], expected: 999 }] } };
    const result = await runChangeExperiment(bundle, async (files, probe) => outcome(Number(probe.args[0]) + (files[0].content === "after" ? 1 : 0)), environment, new AbortController().signal);
    expect(result.counterexample?.probe.args).toEqual([0]);
    expect(result.investigation).toMatchObject([{ revertedPath: "src/a.mjs", matchesBaseline: true }]);
    const abort = new AbortController(); abort.abort();
    const execute = vi.fn();
    await expect(runChangeExperiment(bundle, execute, environment, abort.signal)).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
  it("uses fixed non-root Docker boundaries without a shell, network, or privileged mounts", () => {
    const args = labDockerArgs("codemesh-lab-test", "/tmp/snapshot", "/trusted/harness.mjs", `sha256:${"a".repeat(64)}`);
    for (const flag of ["--network=none", "--read-only", "--user=65534:65534", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit=32", "--memory=256m", "--pull=never"]) expect(args).toContain(flag);
    expect(args.join(" ")).not.toContain("docker.sock");
    expect(() => labDockerArgs("invalid name", "/tmp", "/harness", "node:latest")).toThrow();
  });
  it("withholds investigations when a repeated differing case is unstable", async () => {
    const bundle = exampleBundle(); bundle.request.generateBoundaries = false; bundle.request.probes = [{ id: "unstable", label: "Unstable fixture", args: [1] }];
    let count = 0;
    const result = await runChangeExperiment(bundle, async () => outcome(++count), environment, new AbortController().signal);
    expect(result.stability?.repeatMatched).toBe(false);
    expect(result.comparisons[0].verdict).toBe("inconclusive");
    expect(result.counterexample).toBeNull(); expect(result.investigation).toEqual([]);
  });
  it("runs the actual harness against only our owned fixture and distinguishes loading and invocation failures", async () => {
    async function execute(exportName: string, args: unknown[] = []) {
      const child = spawn(process.execPath, [path.resolve("scripts/change-lab/harness.mjs")], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
      child.stdin.end(JSON.stringify({ root: path.resolve("tests/fixtures/change-lab"), filePath: "subject.mjs", exportName, args }));
      await new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("close", (code) => code === 0 ? resolve() : reject(new Error(output))); });
      const line = output.split("\n").find((item) => item.startsWith("CODEMESH_LAB_RESULT:"))!;
      return labOutcomeSchema.parse(JSON.parse(line.slice("CODEMESH_LAB_RESULT:".length)));
    }
    expect(await execute("add", [2, 3])).toMatchObject({ status: "returned", value: 5, events: [{ kind: "call" }, { kind: "console" }, { kind: "return" }] });
    expect(await execute("reject")).toMatchObject({ status: "threw", error: "Expected fixture failure" });
    expect(await execute("unsupported")).toMatchObject({ status: "blocked" });
    expect(await execute("missing")).toMatchObject({ status: "blocked" });
  });
});

describe("Change Lab authenticated HTTP journeys", () => {
  let runtime: Awaited<ReturnType<typeof createApp>> | undefined, directory: string;
  afterEach(async () => { if (runtime) { await runtime.queue.stop(); await runtime.realtime.close(); await runtime.store.close(); runtime = undefined; } vi.restoreAllMocks(); vi.unstubAllEnvs(); if (directory) await fs.rm(directory, { recursive: true, force: true }); });
  async function setup(worker = false) {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "codemesh-experiment-test-"));
    for (const name of ["DATABASE_URL", "REDIS_URL", "S3_BUCKET", "LLM_BASE_URL", "LLM_MODEL", "GEMINI_API_KEY", "GEMINI_MODEL", "EMAIL_WEBHOOK_URL", "CHANGE_LAB_WORKER_URL", "CHANGE_LAB_WORKER_TOKEN"]) vi.stubEnv(name, "");
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("DATA_PATH", path.join(directory, "state.json"));
    if (worker) { vi.stubEnv("CHANGE_LAB_WORKER_URL", "http://127.0.0.1:4301"); vi.stubEnv("CHANGE_LAB_WORKER_TOKEN", "x".repeat(32)); }
    runtime = await createApp(); return runtime;
  }
  async function login(email = "owner@codemesh.dev") {
    const agent = request.agent(runtime!.app);
    const response = await agent.post("/api/auth/login").send({ email, password: "CodeMesh123!" }).expect(200);
    const cookies = response.headers["set-cookie"] as unknown as string[];
    agent.set("x-csrf-token", cookies.find((cookie) => cookie.startsWith("cm_csrf="))!.split(";")[0]!.slice("cm_csrf=".length));
    return agent;
  }
  const base = "/api/projects/project-sample-taskpilot/change-lab";
  it("requires membership, blocks repository execution without a worker, and keeps the sample distinct", async () => {
    await setup();
    await request(runtime!.app).get(base).expect(401);
    const owner = await login(), viewer = await login("viewer@codemesh.dev");
    await viewer.post(`${base}/example`).send({}).expect(403);
    await owner.post(`${base}/runs`).send(exampleBundle().request).expect(424);
    const response = await owner.post(`${base}/example`).send({}).expect(200);
    const run: LabRun = response.body.data;
    expect(run.mode).toBe("example"); expect(run.status).toBe("completed"); expect(run).not.toHaveProperty("snapshot");
    expect((await owner.get(`${base}/runs/${run.id}`).expect(200)).body.data.source.baseline).toContain("originalSession");
    const receipt = (await owner.get(`${base}/runs/${run.id}/receipt?includeSource=true`).expect(200)).body.data;
    expect(await verifyLabReceipt(JSON.stringify(receipt))).toMatchObject({ scope: "example", sourceIncluded: true, resultAvailable: true });
    receipt.payload.run.title = "Tampered";
    await expect(verifyLabReceipt(JSON.stringify(receipt))).rejects.toThrow("integrity");
    expect(labRegressionTest(run)).toContain("assert.deepEqual");
    expect(runtime!.store.getPatch("project-sample-taskpilot", "built-in-example")).toBeNull();
    await owner.get(`/api/projects/other-project/change-lab/runs/${run.id}`).expect(401);
    await owner.delete(`${base}/runs/${run.id}`).expect(409);
  });
  it("rejects stale patches and forbidden files, captures snapshots, polls results and cancels", async () => {
    await setup(true); const owner = await login();
    const projectId = "project-sample-taskpilot", current = runtime!.store.listFiles(projectId).find((file) => file.path.endsWith(".ts"))!;
    const patch = { id: "lab-patch", projectId, workspaceId: "main", title: "Lab proposal", summary: "Change in fixture", files: [{ path: current.path, baseContent: current.content, proposedContent: `${current.content}\n// proposal\n`, baseHash: hashContent(current.content) }], suggestedVerification: [], executedVerification: [], status: "proposed" as const, createdAt: new Date().toISOString() };
    await runtime!.store.savePatch(patch);
    const body = { ...exampleBundle().request, patchId: patch.id, filePath: current.path, generateBoundaries: false, investigate: false, probes: [{ id: "case", label: "Case", args: [1] }] };
    await runtime!.store.savePatch({ ...patch, files: [{ ...patch.files[0], baseHash: "stale" }] });
    await owner.post(`${base}/runs`).send(body).expect(409);
    await runtime!.store.savePatch({ ...patch, files: [{ ...patch.files[0], path: ".env" }] });
    await owner.post(`${base}/runs`).send(body).expect(400);
    await runtime!.store.savePatch(patch);
    const jobId = randomUUID(); let phase = "queued", captured: LabBundle | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      expect(String(init?.headers && (init.headers as Record<string, string>).authorization)).toBe(`Bearer ${"x".repeat(32)}`);
      if (init?.method === "POST") { captured = JSON.parse(String(init.body)); return new Response(JSON.stringify({ id: jobId, status: "queued" }), { status: 202 }); }
      if (init?.method === "DELETE") return new Response(JSON.stringify({ id: jobId, status: "cancelled" }));
      if (phase === "bad") return new Response("error", { status: 503 });
      const result = phase === "completed" ? { comparisons: [{ probe: body.probes[0], baseline: outcome(1), proposed: outcome(2), verdict: "regression", reason: "Untrusted worker verdict" }], investigation: [], counterexample: null, executionCount: 2, environment, unknowns: [] } : undefined;
      return new Response(JSON.stringify({ id: jobId, status: phase, result }));
    });
    const run = (await owner.post(`${base}/runs`).send(body).expect(200)).body.data as LabRun;
    expect(captured?.files.some((file) => file.path === ".env")).toBe(false);
    expect(captured?.changes[0].content).toContain("// proposal");
    expect(runtime!.store.getWorkspaceDoc(projectId, "main", current.path)?.content).toBe(current.content);
    await owner.post(`${base}/runs`).send(body).expect(409);
    phase = "bad";
    expect((await owner.get(`${base}/runs/${run.id}`).expect(200)).body.data.run.error).toContain("unavailable");
    phase = "completed";
    const completed = (await owner.get(`${base}/runs/${run.id}`).expect(200)).body.data.run;
    expect(completed.status).toBe("completed");
    expect(completed.result.comparisons[0].verdict).toBe("changed");
    const receipt = (await owner.get(`${base}/runs/${run.id}/receipt?includeSource=true`).expect(200)).body.data;
    expect(await verifyLabReceipt(JSON.stringify(receipt))).toMatchObject({ sourceIncluded: true, scope: "repository" });
    const next = (await owner.post(`${base}/runs`).send(body).expect(200)).body.data;
    await owner.delete(`${base}/runs/${next.id}`).expect(200);
    expect(runtime!.store.getChangeLabRun(projectId, next.id)?.status).toBe("cancelled");
    const saved = runtime!.store.snapshot();
    expect(saved.changeLabRuns?.find((item) => item.id === run.id)?.snapshot?.files.length).toBeGreaterThan(0);
    expect(labHash(labCanonical(captured!))).toBe(run.bundleHash);
  });
});
