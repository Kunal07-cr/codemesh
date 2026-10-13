import { createHash } from "node:crypto";
import { inferLanguage, indexRepository, mapRuntimeTrace } from "@codemesh/code-intelligence";
import type { EngineeringRun, OtlpTraceInput, SystemRevision, VerificationResult } from "@codemesh/shared";
import type { JsonStore } from "../db/store.js";

export const systemHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function checkSystemFiles(files: Array<{ path: string; content: string }>) {
  if (new Set(files.map((file) => file.path.toLowerCase())).size !== files.length || files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0) > 1_500_000) throw new Error("Duplicate paths or source exceeds 1.5 MB.");
}
export function revisionIndex(revision: SystemRevision) {
  return indexRepository(revision.projectId, revision.revision, revision.files.map((file) => ({ ...file, projectId: revision.projectId, language: inferLanguage(file.path), size: Buffer.byteLength(file.content), binary: false, sensitive: false, updatedAt: revision.createdAt })));
}
export function compareSystemRevisions(before: SystemRevision, after: SystemRevision) {
  const oldIndex = revisionIndex(before), newIndex = revisionIndex(after);
  const describe = (index: ReturnType<typeof revisionIndex>) => index.symbols.map((symbol) => {
    const file = index.files.find((item) => item.path === symbol.filePath)!;
    return { key: `${symbol.filePath}:${symbol.kind}:${symbol.name}`, path: symbol.filePath, name: symbol.name, kind: symbol.kind, line: symbol.range.startLine,
      hash: systemHash(file.content.split(/\r?\n/).slice(symbol.range.startLine - 1, symbol.range.endLine).join("\n")) };
  });
  const oldSymbols = describe(oldIndex), newSymbols = describe(newIndex), oldMap = new Map(oldSymbols.map((item) => [item.key, item])), newMap = new Map(newSymbols.map((item) => [item.key, item]));
  const sourceChanges = [...new Set([...before.files, ...after.files].map((file) => file.path))].map((path) => {
    const a = before.files.find((file) => file.path === path), b = after.files.find((file) => file.path === path);
    return { path, status: !a ? "added" : !b ? "removed" : a.content !== b.content ? "changed" : "unchanged" };
  }).filter((item) => item.status !== "unchanged");
  const edges = (index: ReturnType<typeof revisionIndex>) => {
    const nodes = new Map(index.graph.nodes.map((node) => [node.id, `${node.type}:${node.filePath ?? ""}:${node.label}`]));
    return index.graph.edges.map((edge) => `${nodes.get(edge.source)} -> ${nodes.get(edge.target)} (${edge.type})`);
  };
  const oldEdges = new Set(edges(oldIndex)), newEdges = new Set(edges(newIndex));
  const visibleNodes = newIndex.graph.nodes.slice(0, 800), visibleIds = new Set(visibleNodes.map((node) => node.id));
  return { before: before.revision, after: after.revision, partial: !before.complete || !after.complete,
    files: sourceChanges, symbols: [...newSymbols.filter((item) => !oldMap.has(item.key)).map((item) => ({ ...item, status: "added" })),
      ...oldSymbols.filter((item) => !newMap.has(item.key)).map((item) => ({ ...item, status: "removed" })),
      ...newSymbols.filter((item) => oldMap.has(item.key) && oldMap.get(item.key)!.hash !== item.hash).map((item) => ({ ...item, status: "changed" }))],
    addedRelationships: [...newEdges].filter((edge) => !oldEdges.has(edge)), removedRelationships: [...oldEdges].filter((edge) => !newEdges.has(edge)),
    graph: { ...newIndex.graph, nodes: visibleNodes, edges: newIndex.graph.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)), warnings: [...newIndex.graph.warnings, ...(newIndex.graph.nodes.length > 800 ? ["Graph view capped at 800 nodes; source comparisons include all captured files."] : [])] }, warnings: [...oldIndex.graph.warnings, ...newIndex.graph.warnings],
    scope: "Compared retained source captures only. Names are matched by file/kind/name; overloads and renames can require review." };
}

type Json = Record<string, any>;
const canonical = (value: any): string => JSON.stringify(value && typeof value === "object" ? Array.isArray(value) ? value.map((item) => JSON.parse(canonical(item))) : Object.fromEntries(Object.keys(value).sort().map((key) => [key, JSON.parse(canonical(value[key]))])) : value ?? null);
export function compareApiContract(beforeText: string, afterText: string) {
  const issues: Array<{ operation: string; severity: "breaking" | "review"; detail: string }> = [];
  let checked = 0;
  try {
    const before = JSON.parse(beforeText) as Json, after = JSON.parse(afterText) as Json;
    if (![before, after].every((doc) => /^3\.0\.\d+$/.test(doc?.openapi) && doc.paths && typeof doc.paths === "object" && !Array.isArray(doc.paths))) throw new Error("Only OpenAPI 3.0 JSON documents are supported.");
    function resolved(value: any, root: Json, chain: string[] = []): any {
      if (!value || typeof value !== "object") return value;
      if (chain.length > 20) throw new Error("Recursive schema requires an external compatibility validator.");
      if (typeof value.$ref === "string") {
        if (!value.$ref.startsWith("#/") || chain.includes(value.$ref)) throw new Error("External/cyclic references are not evaluated.");
        const target = value.$ref.slice(2).split("/").map((key: string) => key.replace(/~1/g, "/").replace(/~0/g, "~")).reduce((node: any, key: string) => node && Object.hasOwn(node, key) ? node[key] : undefined, root);
        if (!target) throw new Error("Unresolved schema reference.");
        return resolved(target, root, [...chain, value.$ref]);
      }
      return Array.isArray(value) ? value.map((item) => resolved(item, root, chain)) : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolved(item, root, chain)]));
    }
    function schema(a: any, b: any, operation: string, direction: "request" | "response", location: string, depth = 0) {
      if (depth > 20) throw new Error("Schema depth exceeded.");
      if (!a || !b) return;
      if (a.type && a.type !== b.type) issues.push({ operation, severity: "breaking", detail: `${location}: type changed from ${a.type} to ${b.type ?? "unspecified"}.` });
      if (direction === "request" && (b.required ?? []).some((key: string) => !(a.required ?? []).includes(key))) issues.push({ operation, severity: "breaking", detail: `${location}: request now requires additional fields.` });
      if (Array.isArray(a.enum) && Array.isArray(b.enum) && (direction === "request" ? a.enum.some((item: unknown) => !b.enum.includes(item)) : b.enum.some((item: unknown) => !a.enum.includes(item)))) issues.push({ operation, severity: "breaking", detail: `${location}: enum compatibility changed.` });
      for (const [key, value] of Object.entries(a.properties ?? {})) {
        if (!b.properties?.[key] && direction === "response") issues.push({ operation, severity: "breaking", detail: `${location}.${key}: response property removed.` });
        else schema(value, b.properties?.[key], operation, direction, `${location}.${key}`, depth + 1);
      }
      schema(a.items, b.items, operation, direction, `${location}[]`, depth + 1);
    }
    for (const [path, pathItem] of Object.entries(before.paths) as Array<[string, Json]>) for (const method of ["get", "post", "put", "patch", "delete", "head", "options", "trace"]) {
      if (!pathItem?.[method]) continue;
      checked++; const operation = `${method.toUpperCase()} ${path}`, a = resolved(pathItem[method], before), b = resolved(after.paths[path]?.[method], after);
      if (!b) { issues.push({ operation, severity: "breaking", detail: "Operation removed." }); continue; }
      if (![a, b].every((item) => item.responses && typeof item.responses === "object" && Object.keys(item.responses).length)) throw new Error("Operation requires a nonempty responses object.");
      const aParams = resolved([...(pathItem.parameters ?? []), ...(a.parameters ?? [])], before), bParams = resolved([...(after.paths[path]?.parameters ?? []), ...(b.parameters ?? [])], after);
      for (const parameter of bParams) if (parameter.required && !aParams.some((item: Json) => item.name === parameter.name && item.in === parameter.in && item.required)) issues.push({ operation, severity: "breaking", detail: `New required ${parameter.in} parameter: ${parameter.name}.` });
      for (const parameter of aParams) { const match = bParams.find((item: Json) => item.name === parameter.name && item.in === parameter.in); schema(parameter.schema, match?.schema, operation, "request", `parameter ${parameter.name}`); }
      if (b.requestBody?.required && !a.requestBody?.required) issues.push({ operation, severity: "breaking", detail: "Request body became required." });
      schema(a.requestBody?.content?.["application/json"]?.schema, b.requestBody?.content?.["application/json"]?.schema, operation, "request", "request body");
      for (const [code, response] of Object.entries(a.responses ?? {}) as Array<[string, Json]>) {
        if (!b.responses?.[code]) issues.push({ operation, severity: "breaking", detail: `Response ${code} removed.` });
        else schema(response.content?.["application/json"]?.schema, b.responses[code].content?.["application/json"]?.schema, operation, "response", `response ${code}`);
      }
      if (canonical(a) !== canonical(b) || canonical(aParams) !== canonical(bParams) || canonical(before.security) !== canonical(after.security) || canonical(before.servers) !== canonical(after.servers)) issues.push({ operation, severity: "review", detail: "Operation changed. Unchecked constraints, authentication and non-JSON media types require review." });
    }
    const status = issues.some((issue) => issue.severity === "breaking") ? "FAIL" : issues.length || !checked ? "NOT_RUN" : "PASS";
    return { status, checked, issues, scope: "Conservative OpenAPI 3.0 JSON comparison; no consumer execution or complete semantic compatibility proof." };
  } catch (error) { return { status: "NOT_RUN", checked, issues, scope: error instanceof Error ? error.message : "Contract cannot be evaluated." }; }
}

export function normalizeOtlp(input: OtlpTraceInput, store: JsonStore, projectId: string) {
  const groups = new Map<string, Array<{ id: string; parentId?: string; name: string; durationMs: number; status: "ok" | "error"; filePath?: string }>>();
  let total = 0;
  const known = new Set(store.listFiles(projectId).filter((file) => !file.binary && !file.sensitive).map((file) => file.path));
  for (const resource of input.resourceSpans) for (const scope of resource.scopeSpans) for (const span of scope.spans) {
    if (++total > 200) throw new Error("A batch may contain at most 200 spans.");
    const start = BigInt(span.startTimeUnixNano), end = BigInt(span.endTimeUnixNano);
    if (end < start || end - start > 86_400_000_000_000n) throw new Error("Span duration is invalid.");
    const id = span.spanId.toLowerCase(), trace = span.traceId.toLowerCase();
    if (/^0+$/.test(id) || /^0+$/.test(trace)) throw new Error("Zero trace/span identities are invalid.");
    const spans = groups.get(trace) ?? [];
    if (spans.some((item) => item.id === id)) throw new Error("Duplicate span identity in this trace.");
    const source = span.attributes?.find((item) => ["code.file.path", "code.filepath"].includes(item.key))?.value.stringValue;
    spans.push({ id, parentId: span.parentSpanId?.toLowerCase() || undefined, name: span.name, durationMs: Number(end - start) / 1_000_000,
      status: span.status?.code === 2 || span.status?.code === "STATUS_CODE_ERROR" ? "error" : "ok", filePath: source && known.has(source) ? source : undefined });
    groups.set(trace, spans);
  }
  if (groups.size > 10) throw new Error("A batch may contain at most ten traces.");
  return [...groups].map(([id, spans]) => ({ name: `OTLP ${id}`, source: "opentelemetry" as const, spans: mapRuntimeTrace(store.getIndex(projectId), spans) }));
}

export function verificationVerdict(result: VerificationResult) {
  const failures = result.proposed.filter((item) => item.status === "FAIL");
  const missing = result.proposed.filter((item) => item.status !== "PASS");
  return { status: failures.length ? "FAIL" as const : missing.length ? "NOT_RUN" as const : "PASS" as const,
    repaired: result.proposed.filter((item) => item.status === "PASS" && result.baseline.find((before) => before.stage === item.stage)?.status === "FAIL").map((item) => item.stage),
    scope: "Selected npm scripts in an operator-pinned container. A script exit code is not full correctness or official benchmark evidence." };
}

export function engineeringScorecard(store: JsonStore, projectId: string, userId: string) {
  const runs = store.listEngineeringRuns(projectId, userId);
  const citations = runs.flatMap((run) => run.citations.map((citation) => {
    const file = run.snapshot.find((item) => item.path === citation.filePath), lines = file?.content.split(/\r?\n/);
    return Boolean(lines && citation.range.startLine >= 1 && citation.range.endLine >= citation.range.startLine && citation.range.endLine <= lines.length && citation.excerpt.trim() && lines.slice(citation.range.startLine - 1, citation.range.endLine).join("\n").includes(citation.excerpt.trim()));
  }));
  const verification = store.listVerificationRuns(projectId, userId).filter((run) => run.result).map((run) => ({ id: run.id, ...verificationVerdict(run.result!) }));
  const measured = verification.filter((run) => run.status !== "NOT_RUN");
  const corpora = store.listBenchmarkCorpora(projectId);
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), sourceRuns: runs.length,
    citationValidity: { checked: citations.length, valid: citations.filter(Boolean).length, rate: citations.length ? citations.filter(Boolean).length / citations.length : null },
    pipeline: { measured: measured.length, passed: measured.filter((run) => run.status === "PASS").length, notRun: verification.filter((run) => run.status === "NOT_RUN").length,
      passRate: measured.length ? measured.filter((run) => run.status === "PASS").length / measured.length : null },
    heldOut: corpora.filter((corpus) => corpus.split === "test").map((corpus) => ({ id: corpus.id, name: corpus.name, sha256: corpus.provenance.sha256, records: corpus.records.length, adapter: corpus.provenance.adapterVersion })),
    officialRepairScore: null, limitations: ["Citation validity measures source substring/range correctness, not answer relevance or truth.", "Pipeline results are selected scripts, not official SWE-bench/Defects4J scores.", "Held-out records remain evaluator data; this is not model training."] };
}
