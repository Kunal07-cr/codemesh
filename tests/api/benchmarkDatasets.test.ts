import { describe, expect, it } from "vitest";
import { benchmarkImportSchema, safeEngineeringPath } from "../../packages/shared/src/engineering";
import { benchmarkSummary, benchmarkTaskContext, evaluateCorpusRetrieval, exampleBenchmark, importBenchmark, normalizeBenchmarkRecord } from "../../apps/api/src/services/benchmarkDatasets";

const input = { name: "Frozen issues", source: "swe-bench" as const, sourceUrl: "https://github.com/SWE-bench/SWE-bench", version: "fixture-only-v1", license: "Fixture license reviewed", licenseReviewed: true as const, split: "test" as const,
  content: JSON.stringify([{ instance_id: "owner__repo-1", repo: "owner/repo", base_commit: "a".repeat(40), problem_statement: "Fix the failing input validator", patch: "GOLD_PATCH_DO_NOT_RETRIEVE", FAIL_TO_PASS: '["gold_test_secret"]' }]) };

describe("benchmark dataset adapters and held-out isolation", () => {
  it("retains raw/evaluation provenance without putting reference answers in summaries or task context", () => {
    const corpus = importBenchmark(input, "project", "owner");
    expect(corpus.raw).toContain("GOLD_PATCH_DO_NOT_RETRIEVE");
    expect(corpus.records[0]!.evaluation.referencePatch).toBe("GOLD_PATCH_DO_NOT_RETRIEVE");
    expect(corpus.provenance.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(benchmarkSummary(corpus))).not.toContain("GOLD_PATCH");
    expect(JSON.stringify(benchmarkTaskContext(corpus.records[0]!))).not.toContain("gold_test_secret");
    const report = evaluateCorpusRetrieval(corpus);
    expect(report.rows[0]!.status).toBe("NOT_RUN");
    expect(report.metrics.recallAtK).toBeNull();
  });

  it("normalizes bounded JSONL exports and rejects duplicate IDs, malformed input and unreviewed licenses", () => {
    const row = JSON.parse(input.content)[0];
    expect(importBenchmark({ ...input, content: `${JSON.stringify(row)}\n${JSON.stringify({ ...row, instance_id: "another" })}` }, "p", "u").records).toHaveLength(2);
    expect(() => importBenchmark({ ...input, content: JSON.stringify([row, row]) }, "p", "u")).toThrow(/Duplicate/);
    expect(() => importBenchmark({ ...input, content: "not json" }, "p", "u")).toThrow();
    expect(benchmarkImportSchema.safeParse({ ...input, licenseReviewed: false }).success).toBe(false);
    expect(() => importBenchmark({ ...input, content: JSON.stringify(Array.from({ length: 101 }, (_, id) => ({ ...row, instance_id: String(id) }))) }, "p", "u")).toThrow(/100/);
  });

  it("supports Python and Java sources without allowing unsafe repository paths", () => {
    expect(normalizeBenchmarkRecord("codesearchnet", { code: "def add(a, b): return a + b", path: "src/add.py", docstring: "Find the add function", repo: "org/repo" }).kind).toBe("retrieval");
    expect(normalizeBenchmarkRecord("defects4j", { task_id: "Lang-1", description: "Fix the DateParser error", source_files: [{ path: "src/DateParser.java", content: "class DateParser {}" }], trigger_tests: ["DateParserTest"] }).sourceFiles[0]!.path).toContain(".java");
    expect(normalizeBenchmarkRecord("codexglue", { id: "repair", instruction: "Repair this validation function", buggy_code: "class Check {}", fixed_code: "GOLD_CLASS" }).evaluation.referencePatch).toBe("GOLD_CLASS");
    expect(normalizeBenchmarkRecord("sard", { id: "case", description: "Inspect the injection sink", cwe: "CWE-89" }).evaluation.weakness).toBe("CWE-89");
    for (const path of ["../escape.py", "C:/secret.ts", "/root/main.ts", "src\\main.ts", ".env", "src/private.key"]) expect(safeEngineeringPath(path), path).toBe(false);
    expect(() => normalizeBenchmarkRecord("codesearchnet", { code: "code", path: "../escape.py", docstring: "Find the function" })).toThrow();
  });

  it("executes source retrieval assertions over only the authored smoke fixtures", () => {
    const report = evaluateCorpusRetrieval(exampleBenchmark("project", "owner"));
    expect(report.metrics).toEqual({ measured: 3, notRun: 0, recallAtK: 1 });
    expect(report.rows.every((row) => row.status === "PASS")).toBe(true);
    expect(JSON.stringify(report)).not.toContain("DO_NOT_RETRIEVE_REFERENCE");
  });
});
