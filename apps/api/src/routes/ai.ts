import { Router } from "express";
import { z } from "zod";
import { aiAskSchema, type AiAskRequest } from "@codemesh/shared";
import { indexRepository, searchRepository } from "@codemesh/code-intelligence";
import { createAiProvider } from "@codemesh/ai";
import type { AppConfig } from "../config.js";
import type { JsonStore } from "../db/store.js";
import type { AssistantDataset } from "../services/assistantDataset.js";
import { createUserRateLimiter, requireProjectPermission } from "../services/security.js";
import { notFound } from "../errors.js";
import { asyncHandler, ok, parseBody } from "./helpers.js";

export function aiRoutes(config: AppConfig, store: JsonStore, assistantDataset: AssistantDataset | null = null) {
  const router = Router();
  const provider = createAiProvider({
    geminiApiKey: config.GEMINI_API_KEY,
    geminiModel: config.GEMINI_MODEL,
    llmBaseUrl: config.LLM_BASE_URL,
    llmApiKey: config.LLM_API_KEY,
    llmModel: config.LLM_MODEL,
    llmTemperature: config.LLM_TEMPERATURE,
    systemPrompt: config.LLM_SYSTEM_PROMPT,
    maxContextMessages: config.MAX_CONTEXT_MESSAGES
  });
  const assistantLimiter = createUserRateLimiter(config.AI_REQUESTS_PER_MINUTE);

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
        const request: AiAskRequest = { ...input, conversation: [...persistedHistory, ...input.conversation].slice(-config.MAX_CONTEXT_MESSAGES) };
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
  const followUp = input.question.trim().split(/\s+/).length <= 8 || /\b(it|this|that|they|them|those|why|how)\b/i.test(input.question);
  const needsActiveFile = /\b(selected|current|active) file\b|\bthis file\b|\bfile I (selected|opened)\b/i.test(input.question);
  return [input.question, followUp ? recentUserQuestion : undefined, needsActiveFile ? input.activeFilePath : undefined]
    .filter((value): value is string => Boolean(value))
    .join(" ");
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
