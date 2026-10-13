import { conversationDecisionSchema, type ConversationRun } from "@codemesh/shared";
import { conversationPrompt, scriptedDecision } from "@codemesh/ai";
import type { AppConfig } from "../config.js";

export function conversationProviderInfo(config: AppConfig) {
  return { configured: Boolean(config.LLM_BASE_URL && config.LLM_MODEL || config.GEMINI_API_KEY && config.GEMINI_MODEL),
    name: config.LLM_BASE_URL && config.LLM_MODEL ? `openai-compatible:${config.LLM_MODEL}` : config.GEMINI_API_KEY && config.GEMINI_MODEL ? `gemini:${config.GEMINI_MODEL}` : "unconfigured" };
}
export async function classifyConversation(config: AppConfig, run: ConversationRun, input: string) {
  if (run.settings.providerMode === "scripted") return { decision: scriptedDecision(input), provider: "scripted", fallback: false };
  if (!run.settings.modelConsent || !conversationProviderInfo(config).configured) throw new Error("Model access was not configured or approved");
  const context = JSON.stringify({ state: run.state, selectedSlot: run.selectedSlot ?? null, recentTurns: run.turns.slice(-4).map((turn) => ({ input: turn.input, reply: turn.reply })), transcript: input });
  const system = conversationPrompt(run.settings);
  try {
    let response: Response, extract: (payload: any) => string;
    if (config.LLM_BASE_URL && config.LLM_MODEL) {
      response = await fetch(`${config.LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${config.LLM_API_KEY ?? "not-needed"}` }, signal: AbortSignal.timeout(15_000), redirect: "error",
        body: JSON.stringify({ model: config.LLM_MODEL, temperature: 0.2, max_tokens: 150, messages: [{ role: "system", content: system }, { role: "user", content: context }] }) });
      extract = (payload) => payload.choices?.[0]?.message?.content ?? "";
    } else {
      if (!/^[\w.-]+$/.test(config.GEMINI_MODEL!)) throw new Error("Unsupported model identifier");
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_MODEL}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": config.GEMINI_API_KEY! }, signal: AbortSignal.timeout(15_000), redirect: "error",
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: context }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 150, responseMimeType: "application/json" } }) });
      extract = (payload) => payload.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? "").join("") ?? "";
    }
    if (!response.ok || !response.body) throw new Error("Model request unavailable");
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 32_000) throw new Error("Model response too large"); chunks.push(chunk.value); } }
    finally { await reader.cancel().catch(() => undefined); }
    const text = extract(JSON.parse(Buffer.concat(chunks).toString("utf8"))).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return { decision: conversationDecisionSchema.parse(JSON.parse(text)), provider: conversationProviderInfo(config).name, fallback: false };
  } catch { return { decision: { intent: "clarify" as const, slotId: null }, provider: "model-fallback", fallback: true }; }
}
