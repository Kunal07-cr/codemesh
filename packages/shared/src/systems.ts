import { z } from "zod";
import { safeEngineeringPath } from "./engineering.js";

export const systemSourceSchema = z.object({ path: z.string().refine(safeEngineeringPath), content: z.string().max(250_000) }).strict();
export const revisionImportSchema = z.object({
  revision: z.string().regex(/^[a-f0-9]{40}$/), repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  files: z.array(systemSourceSchema).min(1).max(2000),
  complete: z.boolean(), capturedAt: z.string().datetime()
}).strict();
export type SystemRevision = {
  id: string; projectId: string; createdBy: string; createdAt: string;
  revision: string; repository?: string; origin: "workspace" | "git-export";
  complete: boolean; files: Array<{ path: string; content: string }>; sha256: string;
};
export const verificationStages = ["build", "lint", "test"] as const;
export const verificationBundleSchema = z.object({
  runId: z.string().uuid(), patchId: z.string().min(1).max(200), revision: z.string().min(1).max(120),
  files: z.array(systemSourceSchema).min(1).max(2000),
  edits: z.array(z.object({ path: z.string().refine(safeEngineeringPath), before: z.string().max(250_000), after: z.string().max(250_000) }).strict()).min(1).max(4),
  stages: z.array(z.enum(verificationStages)).min(1).max(3)
}).strict();
export type VerificationBundle = z.infer<typeof verificationBundleSchema>;
export const commandObservationSchema = z.object({
  stage: z.enum(verificationStages), command: z.string().max(100),
  status: z.enum(["PASS", "FAIL", "NOT_RUN"]), exitCode: z.number().int().nullable(),
  durationMs: z.number().int().min(0).max(240_000), detail: z.string().max(500), output: z.string().max(16_000)
}).strict();
export const verificationResultSchema = z.object({
  bundleHash: z.string().regex(/^[a-f0-9]{64}$/), image: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  baseline: z.array(commandObservationSchema).min(1).max(3), proposed: z.array(commandObservationSchema).min(1).max(3)
}).strict();
export type VerificationResult = z.infer<typeof verificationResultSchema>;
export type VerificationRun = {
  id: string; projectId: string; createdBy: string; createdAt: string; completedAt?: string;
  engineeringRunId: string; patchId: string; revision: string; bundleHash: string;
  status: "queued" | "running" | "completed" | "failed"; workerJobId?: string;
  stages: Array<typeof verificationStages[number]>; result?: VerificationResult; error?: string;
};
export type Publication = {
  id: string; projectId: string; createdBy: string; createdAt: string; runId: string;
  patchHash: string; base: string; repository: string; installationId: number;
  branch: string; title: string; status: "approved" | "publishing" | "published" | "failed";
  commitSha?: string; url?: string; number?: number; error?: string;
};
export const publishApprovalSchema = z.object({
  runId: z.string().uuid(), title: z.string().trim().min(5).max(150), base: z.string().regex(/^[\w./-]{1,120}$/),
  installationId: z.number().int().positive(), approved: z.literal(true)
}).strict();
export const otlpTraceSchema = z.object({ resourceSpans: z.array(z.object({
  resource: z.object({ attributes: z.array(z.object({ key: z.string().max(200), value: z.object({ stringValue: z.string().max(500).optional() }) })).max(50).optional() }).optional(),
  scopeSpans: z.array(z.object({ spans: z.array(z.object({
    traceId: z.string().regex(/^[a-fA-F0-9]{32}$/), spanId: z.string().regex(/^[a-fA-F0-9]{16}$/),
    parentSpanId: z.string().regex(/^(?:[a-fA-F0-9]{16})?$/).optional(), name: z.string().min(1).max(200),
    startTimeUnixNano: z.string().regex(/^\d{1,20}$/), endTimeUnixNano: z.string().regex(/^\d{1,20}$/),
    status: z.object({ code: z.union([z.number().int().min(0).max(2), z.enum(["STATUS_CODE_UNSET", "STATUS_CODE_OK", "STATUS_CODE_ERROR"])]) }).optional(),
    attributes: z.array(z.object({ key: z.string().max(200), value: z.object({ stringValue: z.string().max(500).optional(), intValue: z.string().max(20).optional() }) })).max(50).optional()
  })).min(1).max(200) })).min(1).max(10)
})).min(1).max(10) });
export type OtlpTraceInput = z.infer<typeof otlpTraceSchema>;
