import { afterEach, describe, expect, it, vi } from "vitest";
import { benchmarkItems, buildBenchmarkIndex, createAiProvider, evaluateRepositoryBenchmark } from "@codemesh/ai";
import { indexRepository, retrieveGroundedEvidence, searchRepository } from "@codemesh/code-intelligence";
import type { AiAskRequest } from "@codemesh/shared";

afterEach(() => vi.unstubAllGlobals());
const index = buildBenchmarkIndex();
function context(question: string) { return { projectId: index.projectId, workspaceId: "main", commitSha: index.commitSha, index, retrieval: searchRepository(index, question, "graph", 8), workspaceDocs: [] }; }
function request(question: string): AiAskRequest { return { question, mode: "explain", retrievalMode: "graph", includeWorkspace: false, conversation: [] }; }

describe("source evidence safety", () => {
  it("returns actual implementation behavior for the original token regression", async () => {
    const question = "What does createSessionToken return?";
    const answer = await createAiProvider({}).answer(request(question), context(question));
    expect(answer.answer).toContain('jwt.sign({ sub: userId }, secret, { expiresIn: "15m" })');
    expect(answer.sourceFacts?.[0]?.code).toContain("jwt.sign");
    expect(answer.grounding?.validatedCitations).toBeGreaterThan(0);
  });
  it.each(["Explain deleteAccountPermanently.", "Where does createTask write to PostgreSQL?", "Explain calculateTotal."])("abstains or asks for clarification: %s", async (question) => {
    const answer = await createAiProvider({}).answer(request(question), context(question));
    expect(answer.grounding?.status).toBe("abstained"); expect(answer.citations).toEqual([]);
  });
  it("answers only the verifiable portion of a multi-part question", async () => {
    const question = "Explain createSessionToken and deleteAccountPermanently.";
    const answer = await createAiProvider({}).answer(request(question), context(question));
    expect(answer.grounding?.status).toBe("partial"); expect(answer.answer).toContain("jwt.sign"); expect(answer.grounding?.missing).toContain("deleteAccountPermanently");
  });
  it("rejects cross-project, stale, and incorrect-range hits", async () => {
    const question = "Explain createSessionToken.";
    const ctx = context(question), hit = ctx.retrieval.hits[0]!;
    ctx.retrieval.hits = [
      { ...hit, chunk: { ...hit.chunk, projectId: "other-repo" } },
      { ...hit, chunk: { ...hit.chunk, commitSha: "stale" } },
      { ...hit, chunk: { ...hit.chunk, range: { ...hit.chunk.range, endLine: 999 } } }
    ];
    const answer = await createAiProvider({}).answer(request(question), ctx);
    expect(answer.grounding?.status).toBe("abstained"); expect(answer.grounding?.rejectedCitations).toBe(3);
  });
  it("does not use workspace drafts when workspace context is disabled", async () => {
    const question = "Explain createSessionToken.";
    const ctx = context(question);
    ctx.retrieval.hits = ctx.retrieval.hits.map((hit) => ({ ...hit, chunk: { ...hit.chunk, sourceRevision: "workspace" } }));
    expect((await createAiProvider({}).answer(request(question), ctx)).citations).toEqual([]);
  });
  it("validates model quotes and drops fabricated paths from inferences", async () => {
    const question = "Explain createSessionToken.";
    const quote = 'return jwt.sign({ sub: userId }, secret, { expiresIn: "15m" });';
    const mocked = vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ facts: [{ evidence: 1, quote }, { evidence: 999, quote: "admin.ts" }], reasoning: "admin.ts owns authentication." }) } }] }));
    vi.stubGlobal("fetch", mocked);
    const answer = await createAiProvider({ llmBaseUrl: "http://model.test/v1", llmModel: "mock" }).answer(request(question), context(question));
    expect(answer.grounding?.status).toBe("source-linked"); expect(answer.grounding?.rejectedCitations).toBe(2); expect(answer.answer).not.toContain("admin.ts"); expect(answer.inference).toBeUndefined();
    const options = mocked.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(options[1].body)).toContain("untrusted"); expect(options[1].signal).toBeDefined();
  });
  it("never streams a hallucinated response before it has been checked", async () => {
    const question = "Explain normalizeSlug.";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ message: { content: '{"facts":[{"evidence":1,"quote":"admin.ts grants universal access"}]}' } }] })));
    const tokens: string[] = [];
    const answer = await createAiProvider({ llmBaseUrl: "http://model.test/v1", llmModel: "mock" }).streamAnswer!(request(question), context(question), (token) => tokens.push(token));
    expect(answer.grounding?.status).toBe("provider-fallback"); expect(tokens.join("")).not.toContain("grants universal access"); expect(tokens.join("")).toBe(answer.answer);
  });
  it("falls back to checked source on provider quota errors without leaking error bodies", async () => {
    const question = "Explain createSessionToken.";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("PRIVATE_API_KEY_SHOULD_NOT_LEAK", { status: 429 })));
    const answer = await createAiProvider({ llmBaseUrl: "http://model.test/v1", llmModel: "mock" }).answer(request(question), context(question));
    expect(answer.grounding?.status).toBe("provider-fallback"); expect(answer.answer).toContain("jwt.sign"); expect(JSON.stringify(answer)).not.toContain("PRIVATE_API_KEY");
  });
  it("separates general programming from repository findings", async () => {
    const question = "Explain binary search in general programming.";
    const answer = await createAiProvider({}).answer(request(question), context(question));
    expect(answer.grounding?.status).toBe("general"); expect(answer.answer).toContain("O(log n)"); expect(answer.citations).toEqual([]);
  });
  it("keeps malicious source comments as data rather than following their instructions", async () => {
    const question = "Explain normalizeSlug.";
    const answer = await createAiProvider({}).answer(request(question), context(question));
    expect(answer.sourceFacts?.[0]?.code).not.toContain("ignore prior instructions"); expect(answer.answer).toContain("toLowerCase()");
  });
  it("runs all independent source anchors and categories with actual per-question progress", async () => {
    const progress: number[] = [];
    const provider = createAiProvider({});
    const report = await evaluateRepositoryBenchmark((input, index, retrieval) => provider.answer(input, { projectId: index.projectId, workspaceId: "main", commitSha: index.commitSha, index, retrieval, workspaceDocs: [] }), { provider: provider.name, onRow: (completed) => { progress.push(completed); } });
    expect(new Set(benchmarkItems.map((item) => item.category)).size).toBeGreaterThanOrEqual(15);
    expect(progress).toEqual(Array.from({ length: 20 }, (_, position) => position + 1)); expect(report.rows).toHaveLength(20);
    expect(report.rows.find((row) => row.id === "returns")?.factCoverage).toBe(1);
  });
});

describe("indexing and retrieval regressions", () => {
  it("retrieves nested and explicitly disambiguated symbols", () => {
    expect(searchRepository(index, "normalizeSlug", "graph", 8).hits[0]?.chunk.filePath).toBe("src/domain/deep/nested/normalize.ts");
    expect(searchRepository(index, "calculateTotal in src/billing/total.ts", "graph", 8).hits[0]?.chunk.filePath).toBe("src/billing/total.ts");
  });
  it("retains imports and traces evidence across files", () => {
    const imports = searchRepository(index, "Where does registerAuthRoutes import verifyPassword from?", "graph", 8);
    expect(imports.hits.some((hit) => hit.chunk.filePath === "src/auth/routes.ts" && hit.chunk.content.includes('from "./users"'))).toBe(true);
    const flow = searchRepository(index, "Trace registerAuthRoutes through verifyPassword and createSessionToken", "graph", 8);
    expect(new Set(flow.hits.map((hit) => hit.chunk.filePath)).size).toBeGreaterThanOrEqual(3);
  });
  it("removes foreign and stale chunks and deduplicates repeated entries", () => {
    const copy = structuredClone(index), first = copy.chunks[0]!;
    copy.chunks.push(first, { ...first, projectId: "foreign" }, { ...first, commitSha: "old" });
    const hits = searchRepository(copy, "createSessionToken", "graph", 8).hits;
    expect(new Set(hits.map((hit) => hit.chunk.id)).size).toBe(hits.length);
    expect(hits.every((hit) => hit.chunk.projectId === index.projectId && hit.chunk.commitSha === index.commitSha)).toBe(true);
  });
  it("honors root and nested gitignore rules without deleting stored source", () => {
    const file = index.files[0]!;
    const sources = [
      [".gitignore", "ignored/\n*.log\n"], ["src/.gitignore", "private.ts\n"],
      ["ignored/file.ts", "export const secret = true;"], ["src/private.ts", "export const privateValue = true;"],
      [".venv/lib/x.py", "def foo(): pass"], ["dist/a.js", "export const generated = 1;"], ["src/ok.ts", "export const ok = true;"]
    ].map(([path, content]) => ({ ...file, path: path!, content: content!, size: content!.length }));
    const result = indexRepository(index.projectId, "v2", sources);
    expect(result.files.some((file) => file.path === "src/ok.ts")).toBe(true);
    expect(result.files.some((file) => /ignored|private|venv|dist/.test(file.path))).toBe(false);
    expect(sources).toHaveLength(7);
  });
  it("respects context budgets and handles empty/irrelevant queries", () => {
    expect(retrieveGroundedEvidence(index, "createSessionToken", "graph", 8, 1).hits).toEqual([]);
    expect(searchRepository(index, "zqxwvnoexist", "graph", 8).hits).toEqual([]);
    expect(searchRepository(indexRepository("empty", "v1", []), "authentication", "graph", 8).hits).toEqual([]);
  });
  it("preserves actual line ranges rather than claiming an entire truncated file", () => {
    for (const chunk of index.chunks) {
      const content = index.files.find((file) => file.path === chunk.filePath)!.content.split(/\r?\n/).slice(chunk.range.startLine - 1, chunk.range.endLine).join("\n");
      expect(content).toContain(chunk.content);
    }
  });
});
