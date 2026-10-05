import { describe, expect, it } from "vitest";
import { loadConfig } from "../../apps/api/src/config";

describe("AI provider configuration", () => {
  it("treats blank optional OpenAI-compatible values as unconfigured", () => {
    const config = loadConfig({ LLM_BASE_URL: "", LLM_API_KEY: "", LLM_MODEL: "", LLM_SYSTEM_PROMPT: "" });

    expect(config.LLM_BASE_URL).toBeUndefined();
    expect(config.LLM_MODEL).toBeUndefined();
    expect(config.aiProvider).toBe("local-repository");
  });

  it("selects an OpenAI-compatible model when endpoint and model are present", () => {
    const config = loadConfig({ LLM_BASE_URL: "http://localhost:11434/v1", LLM_MODEL: "qwen2.5-coder:14b" });

    expect(config.aiProvider).toBe("openai-compatible:qwen2.5-coder:14b");
  });
});
