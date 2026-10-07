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

const envBoolean = z.preprocess(
  (value) => typeof value === "string" ? ["1", "true", "yes", "on"].includes(value.toLowerCase()) : value,
  z.boolean()
);

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  API_PORT: z.coerce.number().default(4200),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  API_ORIGIN: z.string().default("http://localhost:4200"),
  SESSION_SECRET: z.string().default("dev-session-secret-change-me"),
  DATA_PATH: z.string().optional(),
  DATABASE_URL: optionalEnvString,
  REDIS_URL: optionalEnvUrl,
  S3_ENDPOINT: optionalEnvUrl,
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: optionalEnvString,
  S3_ACCESS_KEY_ID: optionalEnvString,
  S3_SECRET_ACCESS_KEY: optionalEnvString,
  S3_FORCE_PATH_STYLE: envBoolean.default(true),
  METRICS_TOKEN: optionalEnvString,
  EMAIL_WEBHOOK_URL: optionalEnvUrl,
  APP_PUBLIC_URL: optionalEnvUrl,
  AI_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(60),
  JOB_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  SANDBOX_EXECUTION_ENABLED: envBoolean.default(false),
  SANDBOX_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
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
  GITHUB_PRIVATE_KEY_BASE64: z.string().optional(),
  OIDC_ISSUER_URL: optionalEnvUrl,
  OIDC_CLIENT_ID: optionalEnvString,
  OIDC_CLIENT_SECRET: optionalEnvString,
  SCIM_BEARER_TOKEN: optionalEnvString
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
    objectStorageConfigured: Boolean(parsed.S3_BUCKET && parsed.S3_ACCESS_KEY_ID && parsed.S3_SECRET_ACCESS_KEY),
    emailDeliveryConfigured: Boolean(parsed.EMAIL_WEBHOOK_URL),
    enterpriseIdentityConfigured: Boolean(parsed.OIDC_ISSUER_URL && parsed.OIDC_CLIENT_ID && parsed.OIDC_CLIENT_SECRET),
    scimConfigured: Boolean(parsed.SCIM_BEARER_TOKEN),
    publicUrl: parsed.APP_PUBLIC_URL ?? parsed.API_ORIGIN,
    aiProvider: parsed.LLM_BASE_URL && parsed.LLM_MODEL ? `openai-compatible:${parsed.LLM_MODEL}` : parsed.GEMINI_API_KEY && parsed.GEMINI_MODEL ? `gemini:${parsed.GEMINI_MODEL}` : "local-repository"
  };
}

