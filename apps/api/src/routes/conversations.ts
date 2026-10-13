import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { conversationCreateSchema, hasPermission, type ConversationRun } from "@codemesh/shared";
import { advanceConversation, CONVERSATION_PROMPT_VERSION, conversationPrompt, conversationPromptHash, evaluateConversations, repositoryInstructionWarnings } from "@codemesh/ai";
import type { AppConfig } from "../config.js";
import type { JsonStore } from "../db/store.js";
import { badRequest, conflict, failedDependency, forbidden, notFound } from "../errors.js";
import { classifyConversation, conversationProviderInfo } from "../services/conversationModel.js";
import { createUserRateLimiter, requireProjectPermission } from "../services/security.js";
import { asyncHandler, ok, parseBody } from "./helpers.js";

export function conversationRoutes(config: AppConfig, store: JsonStore) {
  const router = Router(), path = "/:projectId/engineering/conversations", limiter = createUserRateLimiter(10), active = new Set<string>();
  const owned = (projectId: string, userId: string, runId: string) => { const run = store.listConversationRuns(projectId, userId).find((item) => item.id === runId); if (!run) throw notFound("Conversation test session unavailable"); return run; };
  router.get(path, requireProjectPermission(store, "ai.query"), (req, res) => ok(res, { provider: conversationProviderInfo(config), runs: store.listConversationRuns(String(req.params.projectId), req.auth!.user.id),
    promptVersion: CONVERSATION_PROMPT_VERSION, scope: "Synthetic demo-booking transcript prototype; no voice calls or real calendar bookings",
    prompts: ["zero-shot", "few-shot", "role", "persona"].map((promptMode) => ({ mode: promptMode, template: conversationPrompt(conversationCreateSchema.parse({ promptMode, language: "en" })) })) }));
  router.post(path, requireProjectPermission(store, "ai.query"), limiter, asyncHandler(async (req, res) => {
    const settings = parseBody(conversationCreateSchema, req);
    if (settings.providerMode === "configured-model" && (!settings.modelConsent || !conversationProviderInfo(config).configured)) throw failedDependency("Configure a provider and approve sending synthetic transcripts first");
    const now = new Date().toISOString(), run: ConversationRun = { id: randomUUID(), projectId: String(req.params.projectId), createdBy: req.auth!.user.id, createdAt: now, updatedAt: now, settings, state: "collect-need", turns: [], promptVersion: CONVERSATION_PROMPT_VERSION, promptHash: conversationPromptHash(settings) };
    ok(res, await store.saveConversationRun(run));
  }));
  router.post(`${path}/evaluate`, requireProjectPermission(store, "ai.query"), limiter, (req, res) => { parseBody(z.object({}).strict(), req); ok(res, evaluateConversations()); });
  router.post(`${path}/:runId/turns`, requireProjectPermission(store, "ai.query"), limiter, asyncHandler(async (req, res) => {
    const input = parseBody(z.object({ transcript: z.string().trim().min(1).max(1800), expectedTurns: z.number().int().min(0).max(20) }).strict(), req);
    const run = owned(String(req.params.projectId), req.auth!.user.id, String(req.params.runId));
    if (active.has(run.id) || run.turns.length !== input.expectedTurns) throw conflict("Conversation changed or a turn is already running; refresh the session");
    if (run.turns.length >= 20 || ["completed", "handed-off"].includes(run.state)) throw badRequest("This test session is complete or reached its turn limit");
    active.add(run.id);
    try {
      const start = performance.now();
      const result = repositoryInstructionWarnings(input.transcript).length ? { decision: { intent: "clarify" as const, slotId: null }, provider: "instruction-boundary", fallback: false } : await classifyConversation(config, run, input.transcript);
      if (!hasPermission(store.getRole(run.projectId, run.createdBy), "ai.query")) throw forbidden("Project access revoked during this turn");
      if (owned(run.projectId, run.createdBy, run.id).turns.length !== input.expectedTurns) throw conflict("Conversation changed during generation");
      const turn = advanceConversation(run, input.transcript, result.decision, result.provider, performance.now() - start);
      if (result.fallback) turn.flags.push("model-request-failed");
      await store.saveConversationRun(run); ok(res, run);
    } finally { active.delete(run.id); }
  }));
  router.post(`${path}/:runId/feedback`, requireProjectPermission(store, "ai.query"), asyncHandler(async (req, res) => {
    const feedback = parseBody(z.object({ rating: z.enum(["useful", "needs-work"]), category: z.enum(["clarification", "language", "tool-routing", "persona", "other"]), note: z.string().trim().max(500).default("") }).strict(), req);
    const run = owned(String(req.params.projectId), req.auth!.user.id, String(req.params.runId));
    if (active.has(run.id)) throw conflict("Wait until the current turn finishes");
    run.feedback = feedback; ok(res, await store.saveConversationRun(run));
  }));
  return router;
}
