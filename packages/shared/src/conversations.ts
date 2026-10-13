import { z } from "zod";

export const promptModes = ["zero-shot", "few-shot", "role", "persona"] as const;
export const conversationCreateSchema = z.object({
  promptMode: z.enum(promptModes), language: z.enum(["en", "hinglish"]),
  providerMode: z.enum(["scripted", "configured-model"]).default("scripted"),
  modelConsent: z.boolean().default(false), simulateToolFailure: z.boolean().default(false)
}).strict();
export type ConversationSettings = z.infer<typeof conversationCreateSchema>;
export type ConversationState = "collect-need" | "choose-slot" | "confirm-draft" | "completed" | "handed-off";
export const conversationDecisionSchema = z.object({
  intent: z.enum(["demo", "choose", "confirm", "handoff", "interrupt", "clarify", "out-of-scope"]),
  slotId: z.enum(["slot-a", "slot-b"]).nullable()
}).strict();
export type ConversationDecision = z.infer<typeof conversationDecisionSchema>;
export type ConversationTurn = {
  input: string; reply: string; before: ConversationState; after: ConversationState;
  intent: ConversationDecision["intent"]; tool?: "calendar.list" | "booking.draft" | "human.handoff";
  toolStatus?: "PASS" | "FAIL"; latencyMs: number; provider: string;
  flags: string[];
};
export type ConversationRun = {
  id: string; projectId: string; createdBy: string; createdAt: string; updatedAt: string;
  settings: ConversationSettings; state: ConversationState; selectedSlot?: "slot-a" | "slot-b";
  turns: ConversationTurn[]; promptVersion: string; promptHash: string;
  feedback?: { rating: "useful" | "needs-work"; category: "clarification" | "language" | "tool-routing" | "persona" | "other"; note: string };
};
export type ConversationCaseResult = { id: string; condition: string; promptMode: ConversationSettings["promptMode"]; language: ConversationSettings["language"]; passed: boolean; completion: boolean; toolSelection: boolean; concise: boolean; guardCompliance: boolean; provider: string; latencyMs: number; turns: ConversationTurn[] };
