import { describe, expect, it } from "vitest";
import { compareApiContract, compareSystemRevisions, normalizeOtlp, verificationVerdict } from "../../apps/api/src/services/systemAnalysis";
import { otlpTraceSchema, safeEngineeringPath, type SystemRevision, type VerificationResult } from "../../packages/shared/src/index";
import { indexRepository } from "../../packages/code-intelligence/src/index";
import type { JsonStore } from "../../apps/api/src/db/store";

const revision = (content: string): SystemRevision => ({ id: "snapshot", projectId: "project", createdBy: "user", createdAt: "2026-01-01T00:00:00Z", revision: "a".repeat(40), origin: "git-export", complete: false, files: [{ path: "src/value.ts", content }], sha256: "a".repeat(64) });
const spec = (operation: Record<string, unknown>) => JSON.stringify({ openapi: "3.0.3", paths: { "/items": { get: operation } } });
describe("Engineering systems analysis", () => {
  it("compares symbol bodies without counting a line shift as a new function", () => {
    const report = compareSystemRevisions(revision("export function value() { return 1; }"), revision("\nexport function value() { return 2; }"));
    expect(report.symbols).toEqual(expect.arrayContaining([expect.objectContaining({ name: "value", status: "changed" })]));
    expect(report.symbols.filter((item) => item.name === "value" && item.status === "added")).toEqual([]);
    expect(report.partial).toBe(true); expect(report.files[0]?.status).toBe("changed");
  });
  it("reports removed operations and newly required parameters", () => {
    const before = spec({ parameters: [], responses: { "200": { description: "ok" } } });
    const after = spec({ parameters: [{ name: "tenant", in: "query", required: true, schema: { type: "string" } }], responses: { "200": { description: "ok" } } });
    expect(compareApiContract(before, after).status).toBe("FAIL");
    expect(compareApiContract(before, JSON.stringify({ openapi: "3.0.3", paths: {} })).issues[0]?.detail).toBe("Operation removed.");
    expect(compareApiContract(before, before).status).toBe("PASS");
  });
  it("detects request enum narrowing and removed response fields", () => {
    const body = { requestBody: { content: { "application/json": { schema: { type: "object", properties: { kind: { type: "string", enum: ["a", "b"] } } } } } }, responses: { "200": { content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" } } } } } } } };
    const changed = structuredClone(body); changed.requestBody.content["application/json"].schema.properties.kind.enum = ["a"]; (changed.responses["200"].content["application/json"].schema.properties as Record<string, unknown>) = {};
    const report = compareApiContract(spec(body), spec(changed));
    expect(report.status).toBe("FAIL"); expect(report.issues.filter((item) => item.severity === "breaking").length).toBe(2);
  });
  it("does not infer compatibility for unsupported versions, external/cyclic references or changed authentication", () => {
    expect(compareApiContract("{}", "{}").status).toBe("NOT_RUN");
    expect(compareApiContract(spec({ $ref: "https://example.invalid/api.json" }), spec({ responses: {} })).status).toBe("NOT_RUN");
    expect(compareApiContract(spec({ responses: {} }), spec({ responses: {}, security: [{ bearer: [] }] })).status).toBe("NOT_RUN");
  });
  it("normalizes OTLP nanoseconds without storing arbitrary resource attributes", () => {
    const capture = revision("export function value() { return 1; }");
    const files = capture.files.map((file) => ({ ...file, projectId: "project", language: "typescript", size: 50, binary: false, sensitive: false, updatedAt: capture.createdAt }));
    const store = { listFiles: () => files, getIndex: () => indexRepository("project", "sha", files) } as unknown as JsonStore;
    const input = otlpTraceSchema.parse({ resourceSpans: [{ resource: { attributes: [{ key: "private", value: { stringValue: "DO_NOT_STORE" } }] }, scopeSpans: [{ spans: [{ traceId: "a".repeat(32), spanId: "b".repeat(16), name: "value", startTimeUnixNano: "1000000000", endTimeUnixNano: "1002500000", status: { code: 2 }, attributes: [{ key: "code.file.path", value: { stringValue: "src/value.ts" } }] }] }] }] });
    const trace = normalizeOtlp(input, store, "project")[0]!;
    expect(trace.spans[0]?.durationMs).toBe(2.5); expect(trace.spans[0]?.status).toBe("error");
    expect(JSON.stringify(trace)).not.toContain("DO_NOT_STORE");
    input.resourceSpans[0]!.scopeSpans[0]!.spans[0]!.endTimeUnixNano = "0";
    expect(() => normalizeOtlp(input, store, "project")).toThrow("duration");
  });
  it("never promotes an unavailable script to a passing pipeline", () => {
    const observation = { stage: "test" as const, command: "npm run test", status: "NOT_RUN" as const, exitCode: null, durationMs: 0, detail: "Missing dependencies", output: "" };
    const result: VerificationResult = { image: `sha256:${"a".repeat(64)}`, bundleHash: "b".repeat(64), baseline: [observation], proposed: [observation] };
    expect(verificationVerdict(result).status).toBe("NOT_RUN");
    result.proposed[0] = { ...observation, status: "FAIL", exitCode: 1 }; expect(verificationVerdict(result).status).toBe("FAIL");
    result.baseline[0] = result.proposed[0]; result.proposed[0] = { ...observation, status: "PASS", exitCode: 0 };
    expect(verificationVerdict(result)).toMatchObject({ status: "PASS", repaired: ["test"] });
  });
  it("rejects secret/configuration paths and case-colliding source paths", () => {
    for (const path of [".npmrc", ".pypirc", "keys/id_ed25519", "secrets.pem", "../main.ts"]) expect(safeEngineeringPath(path)).toBe(false);
  });
});
