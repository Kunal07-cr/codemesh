import { z } from "zod";
import type { RepositoryGraph } from "./index.js";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
function boundedJsonSchema(): z.ZodType<JsonValue> {
  const primitives = [z.null(), z.boolean(), z.number().finite(), z.string().max(20_000)] as const;
  let schema: z.ZodType<JsonValue> = z.union(primitives);
  for (let depth = 0; depth < 8; depth++) schema = z.union([...primitives, z.array(schema).max(100), z.record(z.string().max(200), schema)]);
  return schema;
}
export const labJsonSchema = boundedJsonSchema();
export const labPathSchema = z.string().min(1).max(300).refine((value) =>
  !value.startsWith("/") && !/[\\:\x00-\x1f]/.test(value) && value.split("/").every((part) => part && part !== "." && part !== ".."), "Use a relative repository path");
export const labProbeSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),
  label: z.string().trim().min(1).max(120),
  args: z.array(labJsonSchema).max(8),
  expected: labJsonSchema.optional(),
  expectedError: z.string().min(1).max(300).optional(),
  generated: z.boolean().optional()
}).strict().refine((value) => !(value.expected !== undefined && value.expectedError !== undefined), "Choose one expected outcome");
export type LabProbe = z.infer<typeof labProbeSchema>;
export const labRequestSchema = z.object({
  title: z.string().trim().min(3).max(120),
  patchId: z.string().min(1).max(100),
  filePath: labPathSchema,
  exportName: z.string().regex(/^[a-zA-Z_$][a-zA-Z0-9_$]{0,100}$/),
  probes: z.array(labProbeSchema).min(1).max(12),
  generateBoundaries: z.boolean().default(true),
  investigate: z.boolean().default(true)
}).strict().refine((value) => new Set(value.probes.map((probe) => probe.id)).size === value.probes.length && JSON.stringify(value.probes).length <= 30_000, "Probe IDs must be unique and cases must fit within 30000 characters");
export type LabRequest = z.infer<typeof labRequestSchema>;
export const labBundleSchema = z.object({
  files: z.array(z.object({ path: labPathSchema, content: z.string().max(200_000) }).strict()).min(1).max(200),
  changes: z.array(z.object({ path: labPathSchema, content: z.string().max(200_000) }).strict()).min(1).max(4),
  request: labRequestSchema
}).strict().refine((value) => new Set(value.files.map((file) => file.path)).size === value.files.length &&
  new Set(value.changes.map((file) => file.path)).size === value.changes.length &&
  value.changes.every((change) => value.files.some((file) => file.path === change.path)) &&
  value.files.some((file) => file.path === value.request.filePath) &&
  JSON.stringify(value).length <= 1_500_000, "Invalid or oversized repository bundle");
export type LabBundle = z.infer<typeof labBundleSchema>;

export const labEventSchema = z.object({
  kind: z.enum(["call", "return", "throw", "console", "timeout", "blocked"]),
  filePath: labPathSchema, exportName: z.string().max(110), detail: z.string().max(4000), offsetMs: z.number().min(0).max(120_000)
}).strict();
export const labOutcomeSchema = z.object({
  status: z.enum(["returned", "threw", "timeout", "blocked"]),
  value: labJsonSchema.optional(), error: z.string().max(4000).optional(),
  durationMs: z.number().min(0).max(120_000), events: z.array(labEventSchema).max(32)
}).strict().refine((value) => value.status !== "returned" || value.value !== undefined, "Returned outcomes need a JSON value");
export type LabOutcome = z.infer<typeof labOutcomeSchema>;
export type LabEvent = z.infer<typeof labEventSchema>;
export const labComparisonSchema = z.object({
  probe: labProbeSchema, baseline: labOutcomeSchema, proposed: labOutcomeSchema,
  verdict: z.enum(["same", "changed", "regression", "improvement", "inconclusive"]),
  reason: z.string().max(1000)
}).strict();
export type LabComparison = z.infer<typeof labComparisonSchema>;
export const labResultSchema = z.object({
  comparisons: z.array(labComparisonSchema).min(1).max(24),
  investigation: z.array(z.object({
    revertedPath: labPathSchema, probeId: z.string().max(60),
    outcome: labOutcomeSchema, matchesBaseline: z.boolean()
  }).strict()).max(4),
  counterexample: z.object({
    originalProbeId: z.string().max(60), probe: labProbeSchema,
    baseline: labOutcomeSchema, proposed: labOutcomeSchema, attempts: z.number().int().min(0).max(6)
  }).strict().nullable(),
  stability: z.object({ probeId: z.string().max(60), baseline: labOutcomeSchema, proposed: labOutcomeSchema, repeatMatched: z.boolean() }).strict().nullable().optional(),
  executionCount: z.number().int().min(2).max(64),
  environment: z.object({ runtime: z.string().max(200), image: z.string().max(300), isolation: z.string().max(1000), command: z.string().max(1000) }).strict(),
  unknowns: z.array(z.string().max(1000)).max(12)
}).strict();
export type LabResult = z.infer<typeof labResultSchema>;
export type LabRun = {
  id: string; projectId: string; createdBy: string; title: string; createdAt: string;
  completedAt?: string; status: "queued" | "running" | "completed" | "failed" | "cancelled";
  mode: "repository" | "example"; workerJobId?: string;
  revision: string; request: LabRequest;
  manifest: { path: string; baselineHash: string; proposedHash: string }[];
  bundleHash: string; result?: LabResult; error?: string;
  snapshot?: LabBundle;
  snapshotGraph?: RepositoryGraph;
};

export function labSafeFilePath(value: string): boolean {
  return labPathSchema.safeParse(value).success && /\.(?:js|mjs|cjs|ts|mts|cts|json)$/i.test(value) &&
    !value.split("/").some((part) => part.startsWith(".") || ["node_modules", "coverage"].includes(part)) &&
    !/(?:secret|credential|token)[^/]*\.json$/i.test(value);
}

export function labCanonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(labCanonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${labCanonical(value[key]!)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function labOutcomeKey(outcome: LabOutcome): string | null {
  if (outcome.status === "returned" && outcome.value !== undefined) return `value:${labCanonical(outcome.value)}`;
  if (outcome.status === "threw") return `error:${outcome.error ?? ""}`;
  return null;
}

export function compareLabProbe(probe: LabProbe, baseline: LabOutcome, proposed: LabOutcome): LabComparison {
  const left = labOutcomeKey(baseline), right = labOutcomeKey(proposed);
  let verdict: LabComparison["verdict"] = "inconclusive", reason = "A timeout or execution failure prevents comparison.";
  const expected = probe.expectedError !== undefined ? `error:${probe.expectedError}` : probe.expected !== undefined ? `value:${labCanonical(probe.expected)}` : null;
  if (left !== null && right !== null) {
    if (expected !== null && left === expected && right !== expected) { verdict = "regression"; reason = "The baseline matches the supplied expectation; the proposal does not."; }
    else if (expected !== null && left !== expected && right === expected) { verdict = "improvement"; reason = "The proposal matches the supplied expectation; the baseline does not."; }
    else if (expected !== null && left !== expected && right !== expected) { reason = "Neither revision matches the supplied expectation."; }
    else if (left === right) { verdict = baseline.status === "threw" && expected === null ? "inconclusive" : "same"; reason = verdict === "same" ? "Both revisions produced the same outcome." : "Both revisions threw without a supplied expected error."; }
    else { verdict = "changed"; reason = "Outcomes differ. Without an expectation this is not automatically a defect."; }
  }
  return { probe, baseline, proposed, verdict, reason };
}

export function generateLabBoundaries(probes: LabProbe[], maximum = 24): LabProbe[] {
  const result = [...probes];
  const seen = new Set(probes.map((probe) => labCanonical(probe.args)));
  let sequence = 0;
  for (const probe of probes) {
    for (let index = 0; index < probe.args.length && result.length < maximum; index++) {
      const argument = probe.args[index];
      const candidates: JsonValue[] = typeof argument === "number" ? [argument - 1, argument + 1, 0, -1] : typeof argument === "string" ? ["", argument.slice(0, 1), null] : Array.isArray(argument) ? [[], argument.slice(0, 1), null] : [null, false, {}];
      for (const candidate of candidates) {
        if (result.length >= maximum) break;
        const args = [...probe.args]; args[index] = candidate;
        const key = labCanonical(args);
        if (seen.has(key)) continue;
        let id: string; do { id = `boundary-${++sequence}`; } while (result.some((item) => item.id === id));
        result.push({ id, label: `Boundary ${sequence}: ${probe.label}`.slice(0, 120), args, generated: true }); seen.add(key);
      }
    }
  }
  return result;
}

export function labShrinkCandidates(args: JsonValue[]): JsonValue[][] {
  const candidates: JsonValue[][] = [];
  args.forEach((value, index) => {
    const smaller: JsonValue[] = typeof value === "number" ? [0, Math.sign(value)] : typeof value === "string" ? ["", value.slice(0, 1)] : Array.isArray(value) ? [[], value.slice(0, 1)] : value && typeof value === "object" ? [{}] : [];
    for (const replacement of smaller) { const next = [...args]; next[index] = replacement; if (labCanonical(next).length < labCanonical(args).length) candidates.push(next); }
  });
  return candidates.sort((a, b) => labCanonical(a).length - labCanonical(b).length);
}
