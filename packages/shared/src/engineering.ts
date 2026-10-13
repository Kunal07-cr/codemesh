import { z } from "zod";
import type { Citation, PatchProposal, RepoFile } from "./index.js";

export function safeEngineeringPath(value: string): boolean {
  return value.length > 0 && value.length <= 500 && !/[\\\u0000-\u001f:]/.test(value) &&
    !value.startsWith("/") && !value.split("/").some((part) => !part || part === "." || part === ".." || part === ".git" || part === "node_modules") &&
    !/(^|\/)\.(?:env(?:\.|$)|npmrc$|pypirc$)|(^|\/)(?:id_rsa|id_ed25519|credentials\.json)$|\.(?:pem|key|p12)$/i.test(value);
}

export const benchmarkSources = ["swe-bench", "defects4j", "codesearchnet", "codexglue", "sard", "custom"] as const;
export const benchmarkImportSchema = z.object({
  name: z.string().trim().min(3).max(100), source: z.enum(benchmarkSources),
  sourceUrl: z.string().url().max(2000).refine((value) => value.startsWith("https://"), "Use an HTTPS provenance URL"),
  version: z.string().trim().min(1).max(120), license: z.string().trim().min(3).max(500),
  licenseReviewed: z.literal(true), split: z.enum(["development", "validation", "test"]),
  content: z.string().min(2).max(1_000_000)
}).strict();
export type BenchmarkImport = z.infer<typeof benchmarkImportSchema>;
export type BenchmarkRecord = {
  id: string; kind: "repair" | "retrieval" | "security";
  repository?: string; baseCommit?: string; issue: string;
  sourceFiles: Array<{ path: string; content: string }>;
  evaluation: { expectedFiles: string[]; referencePatch?: string; expectedTests: string[]; weakness?: string };
};
export type BenchmarkCorpus = {
  id: string; projectId: string; createdBy: string; createdAt: string;
  name: string; source: BenchmarkImport["source"]; split: BenchmarkImport["split"];
  provenance: { sourceUrl: string; version: string; license: string; licenseReviewed: true; retrievedAt: string; sha256: string; adapterVersion: string };
  raw: string; records: BenchmarkRecord[];
};
export type BenchmarkSummary = Omit<BenchmarkCorpus, "raw" | "records"> & {
  tasks: Array<{ id: string; kind: BenchmarkRecord["kind"]; issue: string; repository?: string; baseCommit?: string }>;
};
export const engineeringRequestSchema = z.object({
  objective: z.string().trim().min(8).max(4000),
  mode: z.enum(["investigate", "repair", "migration", "security", "review"]).default("investigate"),
  maxAttempts: z.number().int().min(1).max(3).default(2),
  corpusId: z.string().uuid().optional(), taskId: z.string().max(200).optional()
}).strict().refine((value) => Boolean(value.corpusId) === Boolean(value.taskId), "Select both a corpus and task");
export type EngineeringRequest = z.infer<typeof engineeringRequestSchema>;
export type EngineeringStep = { stage: "understand" | "investigate" | "plan" | "propose" | "verify" | "report"; status: "PASS" | "FAIL" | "NOT_RUN"; detail: string; latencyMs: number };
export type EngineeringRun = {
  id: string; projectId: string; createdBy: string; createdAt: string; completedAt?: string;
  objective: string; mode: EngineeringRequest["mode"]; maxAttempts: number; attempts: number;
  status: "queued" | "running" | "awaiting_review" | "needs_input" | "completed" | "failed" | "cancelled";
  revision: string; snapshot: RepoFile[]; manifest: Array<{ path: string; sha256: string }>;
  corpusId?: string; taskId?: string; steps: EngineeringStep[];
  answer?: string; citations: Citation[]; patch?: PatchProposal;
  findings: Array<{ kind: "hypothesis" | "static-warning"; title: string; filePath?: string; detail: string }>;
  targetFiles: string[]; testsSuggested: string[];
  verification: { status: "PASS" | "FAIL" | "NOT_RUN"; scope: string; labRunId?: string; detail: string };
  telemetry: { provider: string; durationMs: number; contextTokensEstimate: number; billedTokens: number | null; cost: number | null };
  error?: string;
  repairFeedback?: string;
  previousProposals?: Array<{ id: string; verification: "PASS" | "FAIL" | "NOT_RUN" }>;
};
export type PublicEngineeringRun = Omit<EngineeringRun, "snapshot">;
export type ContractLink = {
  id: string; projectId: string; consumerProjectId: string; name: string;
  producerPath: string; consumerPath: string; producerHash: string; consumerHash: string;
  createdBy: string; createdAt: string; evidence: "human-confirmed-source-link";
};
export const contractLinkSchema = z.object({
  consumerProjectId: z.string().min(1).max(200), name: z.string().trim().min(3).max(160),
  producerPath: z.string().min(1).max(500), consumerPath: z.string().min(1).max(500),
  confirmed: z.literal(true)
}).strict();
