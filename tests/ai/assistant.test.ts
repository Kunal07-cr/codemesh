import { describe, expect, it, vi } from "vitest";
import { createAiProvider } from "@codemesh/ai";
import { buildSampleRepoFiles, indexRepository, SAMPLE_COMMIT, searchRepository } from "@codemesh/code-intelligence";

describe("repository assistant", () => {
  it("creates a reviewable local patch for an explicit selected-file edit", async () => {
    const projectId = "project-assistant-test";
    const files = buildSampleRepoFiles(projectId);
    const index = indexRepository(projectId, SAMPLE_COMMIT, files);
    const retrieval = searchRepository(index, "allowSignup configuration", "graph");
    const provider = createAiProvider({});

    const answer = await provider.answer(
      {
        question: "rename `allowSignup` to `allowRegistration`",
        mode: "propose",
        retrievalMode: "graph",
        includeWorkspace: true,
        activeFilePath: "src/config.ts",
        conversation: []
      },
      {
        projectId,
        workspaceId: "main",
        commitSha: SAMPLE_COMMIT,
        index,
        retrieval,
        workspaceDocs: files.map((file) => ({
          projectId,
          workspaceId: "main",
          path: file.path,
          content: file.content,
          version: 1,
          updatedAt: new Date(0).toISOString()
        }))
      }
    );

    expect(answer.patch?.files).toHaveLength(1);
    expect(answer.patch?.files[0]?.path).toBe("src/config.ts");
    expect(answer.patch?.files[0]?.proposedContent).toContain("allowRegistration");
    expect(answer.patch?.files[0]?.proposedContent).not.toContain("allowSignup");
  });

  it("produces distinct evidence-based answers for different repository questions", async () => {
    const projectId = "project-answer-test";
    const files = buildSampleRepoFiles(projectId);
    const index = indexRepository(projectId, SAMPLE_COMMIT, files);
    const provider = createAiProvider({});
    const context = (question: string) => ({
      projectId,
      workspaceId: "main",
      commitSha: SAMPLE_COMMIT,
      index,
      retrieval: searchRepository(index, question, "graph", 8),
      workspaceDocs: files.map((file) => ({
        projectId,
        workspaceId: "main",
        path: file.path,
        content: file.content,
        version: 1,
        updatedAt: new Date(0).toISOString()
      }))
    });

    const securityQuestion = "How does authentication protect the task routes?";
    const security = await provider.answer(
      { question: securityQuestion, mode: "explain", retrievalMode: "graph", includeWorkspace: true, conversation: [] },
      context(securityQuestion)
    );
    const setupQuestion = "How do I run and test this project?";
    const setup = await provider.answer(
      { question: setupQuestion, mode: "explain", retrievalMode: "graph", includeWorkspace: true, conversation: [] },
      context(setupQuestion)
    );

    expect(security.answer).not.toBe(setup.answer);
    expect(security.answer).toMatch(/Security|auth|permission|session/i);
    expect(setup.answer).toMatch(/npm run dev|npm test|scripts/i);
    expect(security.citations.length).toBeGreaterThan(0);
    expect(setup.citations.length).toBeGreaterThan(0);
  });

  it("keeps the previous topic when answering a short follow-up", async () => {
    const projectId = "project-follow-up-test";
    const files = buildSampleRepoFiles(projectId);
    const index = indexRepository(projectId, SAMPLE_COMMIT, files);
    const question = "Why is that important?";
    const previous = "How is authentication enforced?";
    const provider = createAiProvider({});
    const answer = await provider.answer(
      {
        question,
        mode: "explain",
        retrievalMode: "graph",
        includeWorkspace: true,
        conversation: [{ role: "user", content: previous }]
      },
      {
        projectId,
        workspaceId: "main",
        commitSha: SAMPLE_COMMIT,
        index,
        retrieval: searchRepository(index, `${previous} ${question}`, "graph", 8),
        workspaceDocs: files.map((file) => ({
          projectId,
          workspaceId: "main",
          path: file.path,
          content: file.content,
          version: 1,
          updatedAt: new Date(0).toISOString()
        }))
      }
    );

    expect(answer.answer).toMatch(/Security|authentication|session|permission/i);
    expect(answer.citations.length).toBeGreaterThan(0);
  });

  it("buffers and replaces an unsupported OpenAI-compatible response before streaming", async () => {
    const projectId = "project-compatible-test";
    const files = buildSampleRepoFiles(projectId);
    const index = indexRepository(projectId, SAMPLE_COMMIT, files);
    const question = "Explain authentication routing";
    const retrieval = searchRepository(index, question, "graph", 8);
    const encoded = new TextEncoder();
    const fetchMock = vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoded.encode('data: {"choices":[{"delta":{"content":"Authentication "}}]}\n\n'));
        controller.enqueue(encoded.encode('data: {"choices":[{"delta":{"content":"uses protected routes."}}]}\n\n'));
        controller.enqueue(encoded.encode("data: [DONE]\n\n"));
        controller.close();
      }
    }), { status: 200, headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const provider = createAiProvider({
        llmBaseUrl: "http://localhost:11434/v1",
        llmModel: "qwen-test",
        llmApiKey: "not-needed",
        maxContextMessages: 12
      });
      const tokens: string[] = [];
      const answer = await provider.streamAnswer!(
        { question, mode: "explain", retrievalMode: "graph", includeWorkspace: true, conversation: [] },
        {
          projectId,
          workspaceId: "main",
          commitSha: SAMPLE_COMMIT,
          index,
          retrieval,
          workspaceDocs: files.map((file) => ({ projectId, workspaceId: "main", path: file.path, content: file.content, version: 1, updatedAt: new Date(0).toISOString() }))
        },
        (token) => tokens.push(token)
      );

      expect(tokens.join("")).not.toContain("Authentication uses protected routes.");
      expect(answer.grounding?.status).toBe("provider-fallback");
      expect(answer.answer).toBe(tokens.join(""));
      expect(answer.citations.length).toBeGreaterThan(0);
      expect(answer.retrieval.model).toBe("openai-compatible:qwen-test");
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:11434/v1/chat/completions");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses a synthetic dataset answer in dataset-only scope", async () => {
    const projectId = "project-dataset-test";
    const files = buildSampleRepoFiles(projectId);
    const index = indexRepository(projectId, SAMPLE_COMMIT, files);
    const question = "What does save_item do?";
    const provider = createAiProvider({});
    const answer = await provider.answer(
      { question, mode: "explain", retrievalMode: "graph", includeWorkspace: true, conversation: [], knowledgeScope: "dataset", datasetRepositoryId: "r001" },
      {
        projectId,
        workspaceId: "main",
        commitSha: SAMPLE_COMMIT,
        index,
        retrieval: searchRepository(index, question, "graph", 8),
        workspaceDocs: files.map((file) => ({ projectId, workspaceId: "main", path: file.path, content: file.content, version: 1, updatedAt: new Date(0).toISOString() })),
        supplemental: {
          label: "CodeMesh synthetic dataset · 1 repository",
          context: "Synthetic retail-inventory source fixture.",
          answer: "save_item validates the item and returns a copy with a fixed demo ID; it does not persist data.",
          citations: [{
            filePath: "dataset/retail-inventory/src/repository.py",
            range: { startLine: 1, startColumn: 1, endLine: 5, endColumn: 1 },
            symbolName: "save_item",
            sourceRevision: "synthetic-dataset",
            excerpt: "def save_item(item): ...",
            sourceType: "dataset",
            datasetRepositoryId: "r001",
            datasetRepositoryName: "retail-inventory",
            chunkId: "r001-chunk-2"
          }],
          chunkIds: ["r001-chunk-2"],
          relevance: 1,
          preferDataset: true,
          answerable: true,
          synthetic: true
        }
      }
    );

    expect(answer.answer).toMatch(/does not persist data/i);
    expect(answer.citations).toHaveLength(1);
    expect(answer.citations[0]?.sourceRevision).toBe("synthetic-dataset");
    expect(answer.uncertainty).toMatch(/synthetic/i);
  });
});
