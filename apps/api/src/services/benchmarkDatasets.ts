import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { benchmarkImportSchema, safeEngineeringPath, type BenchmarkCorpus, type BenchmarkImport, type BenchmarkRecord, type BenchmarkSummary } from "@codemesh/shared";
import { indexRepository, inferLanguage, searchRepository } from "@codemesh/code-intelligence";

export const DATASET_ADAPTER_VERSION = "codaventra-benchmarks-v1";
export const datasetCatalog = [
  { id: "swe-bench", name: "SWE-bench / Lite", kind: "repair benchmark", url: "https://github.com/SWE-bench/SWE-bench", adapter: true },
  { id: "defects4j", name: "Defects4J", kind: "Java defect infrastructure", url: "https://github.com/rjust/defects4j", adapter: true },
  { id: "codesearchnet", name: "CodeSearchNet", kind: "retrieval corpus", url: "https://github.com/github/CodeSearchNet", adapter: true },
  { id: "codexglue", name: "CodeXGLUE", kind: "task-specific benchmark suite", url: "https://github.com/microsoft/CodeXGLUE", adapter: true },
  { id: "sard", name: "NIST SARD / Juliet", kind: "security test cases", url: "https://samate.nist.gov/SARD/", adapter: true },
  { id: "otel", name: "OpenTelemetry Demo", kind: "runnable telemetry producer", url: "https://opentelemetry.io/docs/demo/", adapter: false },
  { id: "heritage", name: "Software Heritage", kind: "source archive API", url: "https://docs.softwareheritage.org/user/using_data/index.html", adapter: false },
  { id: "codeql", name: "CodeQL", kind: "static-analysis engine", url: "https://github.com/github/codeql", adapter: false },
  { id: "oss-fuzz", name: "OSS-Fuzz", kind: "fuzzing infrastructure", url: "https://github.com/google/oss-fuzz", adapter: false }
];
const sourceFileSchema = z.object({ path: z.string().min(1).max(500).refine(safeEngineeringPath, "Unsafe source path"), content: z.string().max(100_000) });
const rawSchema = z.record(z.string(), z.unknown());
const text = (record: Record<string, unknown>, key: string, fallback = "") => typeof record[key] === "string" ? (record[key] as string) : fallback;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function strings(value: unknown): string[] {
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { value = [value]; } }
  return z.array(z.string().min(1).max(500)).max(100).parse(value ?? []);
}

export function normalizeBenchmarkRecord(source: BenchmarkImport["source"], value: unknown): BenchmarkRecord {
  const raw = rawSchema.parse(value);
  let id = text(raw, "task_id", text(raw, "id", text(raw, "instance_id")));
  let issue = text(raw, "issue_description", text(raw, "problem_statement", text(raw, "question")));
  let files = sourceFileSchema.array().max(30).parse(raw.source_files ?? []);
  let kind: BenchmarkRecord["kind"] = "repair";
  const evaluation: BenchmarkRecord["evaluation"] = {
    expectedFiles: strings(raw.affected_files), referencePatch: text(raw, "reference_patch", text(raw, "patch")) || undefined,
    expectedTests: strings(raw.FAIL_TO_PASS ?? raw.expected_tests)
  };
  if (source === "codesearchnet") {
    const code = z.string().min(1).max(100_000).parse(raw.code);
    const sourcePath = z.string().min(1).parse(raw.path ?? `src/${text(raw, "func_name", "function").replace(/[^a-zA-Z0-9_]/g, "_")}.py`);
    files = [sourceFileSchema.parse({ path: sourcePath, content: code })];
    issue = text(raw, "docstring", text(raw, "question"));
    evaluation.expectedFiles = [sourcePath]; kind = "retrieval";
  } else if (source === "defects4j") {
    id ||= `${text(raw, "project")}-${text(raw, "bug_id")}`;
    issue ||= text(raw, "description");
    evaluation.expectedTests = strings(raw.trigger_tests);
  } else if (source === "codexglue") {
    issue ||= text(raw, "instruction", text(raw, "nl"));
    evaluation.referencePatch ||= text(raw, "fixed_code", text(raw, "code2")) || undefined;
    if (text(raw, "buggy_code", text(raw, "code1"))) files = [sourceFileSchema.parse({ path: text(raw, "path", "src/example.java"), content: text(raw, "buggy_code", text(raw, "code1")) })];
  } else if (source === "sard") {
    kind = "security"; issue ||= text(raw, "description");
    evaluation.weakness = z.string().regex(/^CWE-\d+$/).parse(raw.cwe ?? raw.vulnerability_type);
  } else if (source === "custom") {
    kind = z.enum(["repair", "retrieval", "security"]).parse(raw.kind ?? "repair");
  }
  id ||= hash(JSON.stringify(raw)).slice(0, 24);
  return {
    id: z.string().trim().min(1).max(200).parse(id), kind,
    issue: z.string().trim().min(8).max(4000).parse(issue), sourceFiles: files,
    repository: z.string().max(300).optional().parse(raw.repo ?? raw.repository),
    baseCommit: z.string().max(200).optional().parse(raw.base_commit),
    evaluation: { ...evaluation, referencePatch: z.string().max(200_000).optional().parse(evaluation.referencePatch) }
  };
}

export function importBenchmark(input: BenchmarkImport, projectId: string, createdBy: string): BenchmarkCorpus {
  const checked = benchmarkImportSchema.parse(input);
  if (Buffer.byteLength(checked.content, "utf8") > 1_000_000) throw new Error("Benchmark exports must be at most 1 MB.");
  const trimmed = checked.content.trim();
  let raw: unknown;
  try { raw = JSON.parse(trimmed); }
  catch { raw = trimmed.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }
  const values = Array.isArray(raw) ? raw : [raw];
  if (!values.length || values.length > 100) throw new Error("Import between one and 100 benchmark records.");
  const records = values.map((value) => normalizeBenchmarkRecord(checked.source, value));
  if (new Set(records.map((record) => record.id)).size !== records.length) throw new Error("Duplicate task IDs are not allowed.");
  const now = new Date().toISOString();
  return {
    id: randomUUID(), projectId, createdBy, createdAt: now,
    name: checked.name, source: checked.source, split: checked.split, raw: checked.content, records,
    provenance: { sourceUrl: checked.sourceUrl, version: checked.version, license: checked.license, licenseReviewed: true, retrievedAt: now, sha256: hash(checked.content), adapterVersion: DATASET_ADAPTER_VERSION }
  };
}

export function benchmarkSummary(corpus: BenchmarkCorpus): BenchmarkSummary {
  const { raw: _raw, records, ...metadata } = corpus;
  return { ...metadata, tasks: records.map(({ id, kind, issue, repository, baseCommit }) => ({ id, kind, issue, repository, baseCommit })) };
}

export function benchmarkTaskContext(record: BenchmarkRecord) {
  return { id: record.id, issue: record.issue, repository: record.repository, baseCommit: record.baseCommit };
}

export function evaluateCorpusRetrieval(corpus: BenchmarkCorpus) {
  const sourceFiles = corpus.records.flatMap((record, position) => record.kind === "retrieval" ? record.sourceFiles.map((file) => ({ ...file, path: `records/${position}/${file.path}`, projectId: `benchmark-${corpus.id}`, size: file.content.length, language: inferLanguage(file.path), binary: false, sensitive: false, updatedAt: corpus.createdAt })) : []);
  const index = indexRepository(`benchmark-${corpus.id}`, corpus.provenance.version, sourceFiles);
  const rows = corpus.records.map((record, position) => {
    if (record.kind !== "retrieval" || !record.sourceFiles.length || !record.evaluation.expectedFiles.length) return {
      id: record.id, status: "NOT_RUN", recallAtK: null, reason: "This task requires its matching repository and an external repair/security harness. No test command was executed."
    };
    const hits = searchRepository(index, record.issue, "graph", 8).hits;
    const actual = [...new Set(hits.map((hit) => hit.chunk.filePath))];
    const recall = record.evaluation.expectedFiles.filter((file) => actual.includes(`records/${position}/${file}`)).length / record.evaluation.expectedFiles.length;
    return { id: record.id, status: recall === 1 ? "PASS" : "FAIL", recallAtK: recall, retrievedFiles: actual, reason: "Source-file retrieval assertion; not a repair, security, or executed-test score." };
  });
  const measured = rows.filter((row) => row.recallAtK !== null);
  return { adapterVersion: DATASET_ADAPTER_VERSION, datasetSha256: corpus.provenance.sha256, generatedAt: new Date().toISOString(), k: 8, rows,
    metrics: { measured: measured.length, notRun: rows.length - measured.length, recallAtK: measured.length ? measured.reduce((sum, row) => sum + row.recallAtK!, 0) / measured.length : null },
    limitations: ["Lexical/graph retrieval only; no model was trained.", "Reference patches and expected tests are excluded from task context.", "Small isolated retrieval fixtures do not establish SWE-bench or whole-repository repair performance."] };
}

export function exampleBenchmark(projectId: string, createdBy: string) {
  return importBenchmark({ name: "Codaventra retrieval smoke fixtures", source: "custom", sourceUrl: "https://github.com/Kunal07-cr/codemesh", version: "authored-smoke-v1", license: "Project-authored local evaluation fixtures; not upstream benchmark data", licenseReviewed: true, split: "test", content: JSON.stringify([
    { id: "session", kind: "retrieval", issue_description: "Where does createSessionToken call signToken?", source_files: [{ path: "src/session.ts", content: "export function createSessionToken(id: string) { return signToken({ sub: id }); }\n" }], affected_files: ["src/session.ts"], reference_patch: "DO_NOT_RETRIEVE_REFERENCE" },
    { id: "validation", kind: "retrieval", issue_description: "What does validateTitle return for whitespace?", source_files: [{ path: "src/validation.ts", content: "export function validateTitle(title: string) { return title.trim().length >= 3; }\n" }], affected_files: ["src/validation.ts"] },
    { id: "store", kind: "retrieval", issue_description: "How does readValue handle a missing key?", source_files: [{ path: "src/store.ts", content: "export function readValue(values: Map<string, string>, key: string) { return values.get(key) ?? null; }\n" }], affected_files: ["src/store.ts"] }
  ]) }, projectId, createdBy);
}
