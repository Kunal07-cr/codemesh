import type { CodeChunk, RetrievalMode } from "@codemesh/shared";
import type { RepositoryIndex, SearchHit, SearchResult } from "./index.js";

const stop = new Set("a an and are as at be before by can code do does explain file files for from function functions general how i in is it me of on or project repository return returns should that the this through to trace what when where which why with would your".split(" "));
const narrativeWords = new Set("task tasks app config user users data value key result response request".split(" "));
export function retrievalTerms(text: string) {
  return [...new Set(text.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9_./-]+/).filter((word) => word.length > 1 && !stop.has(word)))];
}
export function classifyRepositoryQuestion(index: RepositoryIndex, query: string) {
  const names = new Set(index.symbols.map((symbol) => symbol.name));
  const words = query.match(/[A-Za-z_$][\w$]*/g) ?? [];
  const requested = [...new Set(words.filter((word) => !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|HTTP|JSON|API|URL|UI)$/i.test(word) && !stop.has(word.toLowerCase()) && (!narrativeWords.has(word.toLowerCase()) || query.includes(`\`${word}\``)) && (names.has(word) || /[a-z][A-Z]|[a-z]_[a-z]|^[A-Z][A-Z_]{2,}$/.test(word))))];
  const paths = index.files.filter((file) => query.includes(file.path)).map((file) => file.path);
  const missing = requested.filter((name) => !names.has(name) && !index.files.some((file) => file.content.includes(name)));
  // Explicit technology assumptions must be present in source before making repository claims.
  for (const term of query.match(/\b(?:PostgreSQL|MongoDB|Redis|MySQL|Kafka|DynamoDB)\b/gi) ?? []) {
    if (!index.files.some((file) => file.content.toLowerCase().includes(term.toLowerCase()))) missing.push(term);
  }
  const ambiguous = requested.filter((name) => new Set(index.symbols.filter((symbol) => symbol.name === name && (!paths.length || paths.includes(symbol.filePath))).map((symbol) => symbol.filePath)).size > 1);
  const kind = /\bin general\b|general programming|binary search|capital of|weather|recipe/i.test(query) ? "general"
    : /\b(flow|trace|start|entry|calls?|callers?|GET|POST|PUT|PATCH|DELETE)\b/i.test(query) ? "flow"
    : /config|environment|\bPORT\b|dependencies|scripts|\brun\b|\btest\b/i.test(query) ? "configuration"
    : /error|exception|invalid|fail|debug/i.test(query) ? "debugging"
    : /architecture|modules|structure/i.test(query) ? "architecture"
    : requested.length ? "symbol" : "repository";
  return { kind, requested, missing: [...new Set(missing)], ambiguous, paths };
}

function termsFor(chunk: CodeChunk) { return retrievalTerms(`${chunk.filePath} ${chunk.symbolName ?? ""} ${chunk.content}`); }
function overlap(a: CodeChunk, b: CodeChunk) {
  if (a.filePath !== b.filePath) return 0;
  const intersection = Math.max(0, Math.min(a.range.endLine, b.range.endLine) - Math.max(a.range.startLine, b.range.startLine) + 1);
  return intersection / Math.max(1, Math.min(a.range.endLine - a.range.startLine + 1, b.range.endLine - b.range.startLine + 1));
}

export function retrieveGroundedEvidence(index: RepositoryIndex, query: string, mode: RetrievalMode = "graph", limit = 8, tokenBudget = 6000): SearchResult {
  const start = performance.now();
  limit = Math.max(1, Math.min(24, limit));
  const plan = classifyRepositoryQuestion(index, query);
  const terms = retrievalTerms(query);
  const unique = new Map<string, CodeChunk>();
  for (const chunk of index.chunks) {
    if (chunk.projectId !== index.projectId || chunk.commitSha !== index.commitSha || !index.files.some((file) => file.path === chunk.filePath)) continue;
    unique.set(`${chunk.filePath}:${chunk.range.startLine}:${chunk.range.endLine}:${chunk.content}`, chunk);
  }
  const chunks = [...unique.values()];
  const documents = chunks.map(termsFor);
  const df = new Map<string, number>();
  for (const document of documents) for (const term of document) df.set(term, (df.get(term) ?? 0) + 1);
  const avg = documents.reduce((sum, document) => sum + document.length, 0) / Math.max(1, documents.length);
  const ranked: SearchHit[] = chunks.map((chunk, position) => {
    const document = documents[position]!;
    const lexical = terms.reduce((sum, term) => {
      if (!document.includes(term)) return sum;
      const idf = Math.log(1 + (chunks.length - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5));
      return sum + idf * 2.2 / (1 + 1.2 * (0.25 + 0.75 * document.length / Math.max(1, avg)));
    }, 0);
    const exactSymbol = chunk.symbolName && plan.requested.includes(chunk.symbolName) ? 14 : 0;
    const exactPath = plan.paths.includes(chunk.filePath) ? chunk.symbolName ? 9 : 14 : 0;
    const method = query.match(/\b(GET|POST|PUT|PATCH|DELETE)\b/i)?.[1]?.toLowerCase();
    const route = query.match(/\/[a-z0-9_/-]+/i)?.[0];
    const routeMatch = method && route && chunk.content.includes(`.${method}("${route}"`) ? 16 : 0;
    const queryFraction = terms.length ? terms.filter((term) => document.includes(term)).length / terms.length : 0;
    const config = plan.kind === "configuration" && /config|package\.json|\.env\.example|readme|docker|\.ya?ml$/i.test(chunk.filePath) ? 2 : 0;
    return { chunk, score: lexical + exactSymbol + exactPath + routeMatch + queryFraction + config,
      reason: exactSymbol ? "exact symbol + BM25-style lexical relevance" : exactPath ? "explicit source path + lexical relevance" : "BM25-style lexical relevance + term overlap" };
  }).filter((hit) => hit.score > 0 && (terms.some((term) => termsFor(hit.chunk).includes(term)) || Boolean(hit.chunk.symbolName && plan.requested.includes(hit.chunk.symbolName)) || plan.paths.includes(hit.chunk.filePath))).sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));
  const candidates = new Map(ranked.map((hit) => [hit.chunk.id, hit]));
  const expandedFromChunkIds: string[] = [];
  if (mode === "graph" && ["flow", "architecture", "debugging", "repository"].includes(plan.kind)) {
    const seeds = ranked.filter((hit) => hit.chunk.symbolName && plan.requested.includes(hit.chunk.symbolName));
    const roots = (seeds.length ? seeds : ranked).slice(0, 3);
    const byId = new Map(index.graph.nodes.map((node) => [node.id, node]));
    for (const root of roots) {
      const ids = new Set([`file:${root.chunk.filePath}`, root.chunk.symbolId].filter((id): id is string => Boolean(id)));
      const paths = new Set<string>();
      for (const edge of index.graph.edges) {
        if (edge.type === "contains" || edge.type === "exports") continue;
        if (ids.has(edge.source) || ids.has(edge.target)) {
          const other = byId.get(ids.has(edge.source) ? edge.target : edge.source);
          if (other?.filePath) paths.add(other.filePath);
        }
      }
      for (const path of [...paths].slice(0, 8)) {
        const related = chunks.filter((chunk) => chunk.filePath === path).sort((a, b) => (candidates.get(b.id)?.score ?? 0) - (candidates.get(a.id)?.score ?? 0)).slice(0, 2);
        for (const chunk of related) {
          const existing = candidates.get(chunk.id);
          candidates.set(chunk.id, { chunk, score: (existing?.score ?? 0) + 3, reason: `${existing?.reason ?? "source context"}; dependency neighbor of ${root.chunk.filePath} (relationships are navigation hints, not runtime proof)` });
          expandedFromChunkIds.push(root.chunk.id);
        }
      }
    }
  }
  const hits: SearchHit[] = [];
  let used = 0, contextTruncated = false;
  const ordered = [...candidates.values()].sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));
  // Reserve a direct implementation for each requested symbol before spending the remaining budget.
  const anchors = plan.requested.map((name) => ordered.find((hit) => hit.chunk.symbolName === name && (!plan.paths.length || plan.paths.includes(hit.chunk.filePath)))).filter((hit): hit is SearchHit => Boolean(hit));
  for (const hit of [...anchors, ...ordered]) {
    const needsImportContext = /\b(import|imports|from)\b/i.test(query);
    if (hits.length >= limit || hits.some((selected) => selected.chunk.id === hit.chunk.id || (overlap(selected.chunk, hit.chunk) > 0.8 && !(needsImportContext && Boolean(selected.chunk.symbolName) !== Boolean(hit.chunk.symbolName))))) continue;
    if (used + hit.chunk.tokenCount > tokenBudget) { contextTruncated = true; continue; }
    hits.push(hit); used += hit.chunk.tokenCount;
  }
  return { mode, hits, latencyMs: Math.max(1, Math.round(performance.now() - start)), expandedFromChunkIds: [...new Set(expandedFromChunkIds)],
    evidence: { ...plan, contextTruncated, strategy: "identifier + BM25-style lexical + dependency expansion; no learned semantic embeddings" } };
}
