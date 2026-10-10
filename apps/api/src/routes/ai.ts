import { Router } from "express";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { aiAskSchema, type AiAskRequest } from "@codemesh/shared";
import { indexRepository, searchRepository } from "@codemesh/code-intelligence";
import { createAiProvider, type EvaluationReport } from "@codemesh/ai";
import type { AppConfig } from "../config.js";
import type { JsonStore } from "../db/store.js";
import type { AssistantDataset } from "../services/assistantDataset.js";
import type { OperationQueue } from "../services/jobQueue.js";
import { createUserRateLimiter, requireProjectPermission } from "../services/security.js";
import { notFound } from "../errors.js";
import { asyncHandler, ok, parseBody } from "./helpers.js";

export function aiRoutes(config: AppConfig, store: JsonStore, assistantDataset: AssistantDataset | null = null, queue?: OperationQueue) {
  const router = Router();
  const provider = createAiProvider({
    geminiApiKey: config.GEMINI_API_KEY,
    geminiModel: config.GEMINI_MODEL,
    llmBaseUrl: config.LLM_BASE_URL,
    llmApiKey: config.LLM_API_KEY,
    llmModel: config.LLM_MODEL,
    llmTemperature: config.LLM_TEMPERATURE,
    systemPrompt: config.LLM_SYSTEM_PROMPT,
    maxPromptCharacters: config.LLM_MAX_PROMPT_CHARS,
    maxContextMessages: config.MAX_CONTEXT_MESSAGES
  });
  const assistantLimiter = createUserRateLimiter(config.AI_REQUESTS_PER_MINUTE);
  const feedbackSchema = z.object({ rating: z.enum(["helpful", "unhelpful"]).nullable(), incorrectCitation: z.boolean(), note: z.string().trim().max(1000) }).strict();

  router.get("/:projectId/ai/evaluation", requireProjectPermission(store, "ai.query"), asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId), userId = req.auth!.user.id;
    const index = store.getIndex(projectId);
    const runs = store.listOperationJobs(projectId, 500).filter((job) => job.type === "assistant.evaluate" && job.createdBy === userId).slice(0, 20);
    let baseline: Pick<EvaluationReport, "metrics" | "provider" | "version" | "generatedAt" | "limitations"> | null = null;
    try {
      const report = JSON.parse(await readFile(new URL("../../../../docs/evaluation/accuracy/baseline.json", import.meta.url), "utf8")) as EvaluationReport;
      baseline = { metrics: report.metrics, provider: report.provider, version: report.version, generatedAt: report.generatedAt, limitations: report.limitations };
    } catch { /* Missing baseline is shown as unavailable, never as zero quality. */ }
    ok(res, { provider: provider.name, scope: "Fixed source-facts-v1 benchmark fixtures; not a score for this project's private code", index: { revision: index.commitSha, indexedAt: index.graph.generatedAt, indexedFiles: index.files.length, storedFiles: store.listFiles(projectId).length, chunks: index.chunks.length, warnings: index.graph.warnings, parsers: ["TypeScript/JavaScript AST", "Python indentation heuristic", "Other files: bounded text windows"] }, settings: { maxContextEstimatedTokens: 6000, maxChunks: 8, strategy: "Identifier + BM25-style lexical + dependency neighbors", learnedEmbeddings: false }, baseline, runs });
  }));
  router.post("/:projectId/ai/evaluation", requireProjectPermission(store, "ai.query"), assistantLimiter, asyncHandler(async (req, res) => {
    parseBody(z.object({}).strict(), req);
    if (!queue) throw new Error("The evaluation queue is unavailable.");
    const projectId = String(req.params.projectId), userId = req.auth!.user.id;
    const pending = store.listOperationJobs(projectId, 500).find((job) => job.type === "assistant.evaluate" && job.createdBy === userId && ["queued", "running"].includes(job.status));
    ok(res, pending ?? await queue.enqueue(projectId, "assistant.evaluate", userId, { suite: "source-facts-v1", provider: "local-repository" }));
  }));

  router.get("/:projectId/ai/feedback", requireProjectPermission(store, "ai.query"), (req, res) => {
    ok(res, { examples: store.exportAssistantFeedback(String(req.params.projectId), req.auth!.user.id) });
  });
  router.get("/:projectId/ai/feedback/:answerId", requireProjectPermission(store, "ai.query"), (req, res, next) => {
    const projectId = String(req.params.projectId), answerId = String(req.params.answerId), userId = req.auth!.user.id;
    if (!store.getOwnedAssistantAnswer(projectId, userId, answerId)) { next(notFound("Answer not found in your conversations.")); return; }
    ok(res, { feedback: store.getAssistantFeedback(projectId, userId, answerId) });
  });
  router.put("/:projectId/ai/feedback/:answerId", requireProjectPermission(store, "ai.query"), assistantLimiter, asyncHandler(async (req, res) => {
    const input = parseBody(feedbackSchema, req);
    const feedback = await store.saveAssistantFeedback(String(req.params.projectId), req.auth!.user.id, String(req.params.answerId), input);
    if (!feedback) throw notFound("Answer not found in your conversations.");
    ok(res, { feedback });
  }));

  router.get(
    "/:projectId/ai/dataset",
    requireProjectPermission(store, "ai.query"),
    (_req, res) => {
      ok(res, assistantDataset?.getSummary() ?? { available: false, synthetic: true, repositories: [], suggestions: [], counts: {}, limitations: ["The assistant dataset could not be loaded."] });
    }
  );

  router.post(
    "/:projectId/ai/ask",
    requireProjectPermission(store, "ai.query"),
    assistantLimiter,
    asyncHandler(async (req, res) => {
      const input = parseBody(aiAskSchema, req);
      const project = store.getProject(String(req.params.projectId))!;
      const workspaceDocs = store.getWorkspaceDocs(project.id, "main");
      const index = input.includeWorkspace
        ? buildWorkspaceIndex(project.id, project.commitSha, store.listFiles(project.id), workspaceDocs)
        : store.getIndex(project.id);
      const retrieval = searchRepository(index, buildRetrievalQuery(input), input.retrievalMode, 8);
      const supplemental = buildSupplementalContext(input, assistantDataset);
      const answer = await provider.answer(input, {
        projectId: project.id,
        workspaceId: "main",
        commitSha: project.commitSha,
        index,
        retrieval,
        workspaceDocs,
        supplemental
      });
      logEvidenceResult(req.id, answer);
      await store.saveRetrieval(answer.retrieval);
      if (answer.patch) {
        await store.savePatch(answer.patch);
      }
      ok(res, answer);
    })
  );

  router.get(
    "/:projectId/ai/conversations",
    requireProjectPermission(store, "ai.query"),
    (req, res) => {
      ok(res, { provider: provider.name, conversations: store.listAssistantConversations(String(req.params.projectId), req.auth!.user.id) });
    }
  );

  router.get(
    "/:projectId/ai/conversations/:conversationId",
    requireProjectPermission(store, "ai.query"),
    (req, res, next) => {
      const conversation = store.getAssistantConversation(String(req.params.projectId), String(req.params.conversationId), req.auth!.user.id);
      if (!conversation) {
        next(notFound("Conversation not found."));
        return;
      }
      ok(res, conversation);
    }
  );

  router.delete(
    "/:projectId/ai/conversations/:conversationId",
    requireProjectPermission(store, "ai.query"),
    asyncHandler(async (req, res) => {
      const deleted = await store.deleteAssistantConversation(String(req.params.projectId), String(req.params.conversationId), req.auth!.user.id);
      if (!deleted) throw notFound("Conversation not found.");
      ok(res, { deleted: true });
    })
  );

  router.post(
    "/:projectId/ai/stream",
    requireProjectPermission(store, "ai.query"),
    assistantLimiter,
    async (req, res) => {
      const streamSchema = aiAskSchema.extend({ conversationId: z.string().uuid().optional() });
      try {
        const input = streamSchema.parse(req.body);
        const projectId = String(req.params.projectId);
        const project = store.getProject(projectId)!;
        const existing = input.conversationId ? store.getAssistantConversation(projectId, input.conversationId, req.auth!.user.id) : null;
        if (input.conversationId && !existing) throw notFound("Conversation not found.");
        const conversation = existing?.conversation ?? await store.createAssistantConversation(projectId, req.auth!.user.id, input.question);
        const persistedHistory = (existing?.messages ?? []).slice(-config.MAX_CONTEXT_MESSAGES).map((message) => ({ role: message.role, content: message.content }));
        const request: AiAskRequest = { ...input, conversation: persistedHistory.slice(-10) };
        await store.addAssistantMessage(conversation.id, "user", input.question);

        res.status(200);
        res.setHeader("content-type", "text/event-stream; charset=utf-8");
        res.setHeader("cache-control", "no-cache, no-transform");
        res.setHeader("connection", "keep-alive");
        res.setHeader("x-accel-buffering", "no");
        res.flushHeaders();
        sendEvent(res, "meta", { conversationId: conversation.id, provider: provider.name });

        const workspaceDocs = store.getWorkspaceDocs(project.id, "main");
        const index = input.includeWorkspace
          ? buildWorkspaceIndex(project.id, project.commitSha, store.listFiles(project.id), workspaceDocs)
          : store.getIndex(project.id);
        const retrieval = searchRepository(index, buildRetrievalQuery(request), request.retrievalMode, 8);
        const supplemental = buildSupplementalContext(request, assistantDataset);
        const context = { projectId: project.id, workspaceId: "main", commitSha: project.commitSha, index, retrieval, workspaceDocs, supplemental };
        let streamed = false;
        const answer = provider.streamAnswer
          ? await provider.streamAnswer(request, context, (token) => { streamed = true; sendEvent(res, "token", { text: token }); })
          : await provider.answer(request, context);
        logEvidenceResult(req.id, answer);
        if (!streamed) {
          for (const token of answer.answer.match(/\S+\s*/g) ?? [answer.answer]) sendEvent(res, "token", { text: token });
        }
        await store.saveRetrieval(answer.retrieval);
        if (answer.patch) await store.savePatch(answer.patch);
        await store.addAssistantMessage(conversation.id, "assistant", answer.answer, answer);
        sendEvent(res, "result", { conversationId: conversation.id, result: answer });
        sendEvent(res, "done", {});
        res.end();
      } catch (error) {
        if (!res.headersSent) {
          const message = error instanceof Error ? error.message : "Streaming assistant failed.";
          res.status(400).json({ error: { code: "AI_STREAM_FAILED", message, requestId: req.id } });
          return;
        }
        sendEvent(res, "error", { message: error instanceof Error ? error.message : "Streaming assistant failed." });
        res.end();
      }
    }
  );

  return router;
}

function buildSupplementalContext(input: AiAskRequest, assistantDataset: AssistantDataset | null) {
  if (!assistantDataset || !input.knowledgeScope || input.knowledgeScope === "repository") return undefined;
  const result = assistantDataset.search(input.question, input.datasetRepositoryId, input.knowledgeScope);
  if (input.knowledgeScope === "combined" && result.relevance < 0.25) return undefined;
  return {
    label: `CodeMesh synthetic dataset · ${result.repositoryIds.length} repositor${result.repositoryIds.length === 1 ? "y" : "ies"}`,
    context: result.context,
    answer: result.answer,
    citations: result.citations,
    chunkIds: result.chunkIds,
    relevance: result.relevance,
    preferDataset: result.preferDataset,
    answerable: result.answerable,
    synthetic: result.synthetic
  };
}

function sendEvent(res: import("express").Response, event: string, payload: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function buildRetrievalQuery(input: AiAskRequest) {
  const recentUserQuestion = [...input.conversation].reverse().find((message) => message.role === "user")?.content;
  const followUp = /^(?:why is (?:that|this)|what about (?:it|that|this)|how does (?:it|that|this)|explain (?:it|that|this)|and (?:why|how))\b/i.test(input.question.trim());
  const needsActiveFile = /\b(selected|current|active) file\b|\bthis file\b|\bfile I (selected|opened)\b/i.test(input.question);
  return [input.question, followUp ? recentUserQuestion : undefined, needsActiveFile ? input.activeFilePath : undefined]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function logEvidenceResult(requestId: unknown, answer: import("@codemesh/shared").AiAnswer) {
  console.info(JSON.stringify({ event: "assistant.evidence", requestId: typeof requestId === "string" || typeof requestId === "number" ? requestId : null, projectId: answer.retrieval.projectId, model: answer.retrieval.model, status: answer.grounding?.status ?? "dataset", acceptedCitations: answer.grounding?.validatedCitations ?? 0, rejectedCitations: answer.grounding?.rejectedCitations ?? 0, contextTokensEstimate: answer.retrieval.contextTokens, retrievalLatencyMs: answer.retrieval.retrievalLatencyMs }));
}

function buildWorkspaceIndex(
  projectId: string,
  commitSha: string,
  files: ReturnType<JsonStore["listFiles"]>,
  docs: ReturnType<JsonStore["getWorkspaceDocs"]>
) {
  const drafts = new Map(docs.map((doc) => [doc.path, doc.content]));
  const index = indexRepository(
    projectId,
    `${commitSha}:workspace`,
    files.map((file) => {
      const content = drafts.get(file.path) ?? file.content;
      return { ...file, content, size: content.length };
    })
  );
  index.chunks = index.chunks.map((chunk) => ({ ...chunk, sourceRevision: "workspace" }));
  return index;
}
