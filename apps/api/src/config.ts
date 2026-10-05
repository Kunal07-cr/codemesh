import path from "node:path";
import { z } from "zod";

const optionalEnvString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().optional()
);

const optionalEnvUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().url().optional()
);

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  API_PORT: z.coerce.number().default(4200),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  API_ORIGIN: z.string().default("http://localhost:4200"),
  SESSION_SECRET: z.string().default("dev-session-secret-change-me"),
  DATA_PATH: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  LLM_BASE_URL: optionalEnvUrl,
  LLM_API_KEY: optionalEnvString,
  LLM_MODEL: optionalEnvString,
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.3),
  LLM_SYSTEM_PROMPT: optionalEnvString,
  MAX_CONTEXT_MESSAGES: z.coerce.number().int().min(1).max(100).default(30),
  ASSISTANT_DATASET_PATH: optionalEnvString,
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_PRIVATE_KEY_BASE64: z.string().optional()
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env = process.env) {
  const parsed = envSchema.parse(env);
  const dataPath = parsed.DATA_PATH ?? path.resolve(process.cwd(), "storage", "codemesh-dev.json");
  const isProduction = parsed.NODE_ENV === "production";
  return {
    ...parsed,
    dataPath,
    isProduction,
    corsOrigins: [parsed.WEB_ORIGIN, parsed.API_ORIGIN],
    cookie: {
      secure: isProduction,
      sameSite: isProduction ? ("strict" as const) : ("lax" as const)
    },
    githubConfigured: Boolean(
      parsed.GITHUB_APP_ID &&
        parsed.GITHUB_CLIENT_ID &&
        parsed.GITHUB_CLIENT_SECRET &&
        parsed.GITHUB_WEBHOOK_SECRET &&
        parsed.GITHUB_PRIVATE_KEY_BASE64
    ),
    aiProvider: parsed.LLM_BASE_URL && parsed.LLM_MODEL ? `openai-compatible:${parsed.LLM_MODEL}` : parsed.GEMINI_API_KEY && parsed.GEMINI_MODEL ? `gemini:${parsed.GEMINI_MODEL}` : "local-repository"
  };
}
