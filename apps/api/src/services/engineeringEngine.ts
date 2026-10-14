import { createHash, randomUUID } from "node:crypto";
import { createAiProvider, type AiProvider } from "@codemesh/ai";
import { buildIncidentReport, buildSecurityWorkbench, hashContent, indexRepository, planAutonomousChange, searchRepository } from "@codemesh/code-intelligence";
import { compareLabProbe, hasPermission, labCanonical, labOutcomeKey, patchProposalSchema, safeEngineeringPath, type EngineeringRequest, type EngineeringRun, type EngineeringStep, type LabResult, type PatchProposal, type PublicEngineeringRun } from "@codemesh/shared";
import type { AppConfig } from "../config.js";
import type { JsonStore, OperationJob } from "../db/store.js";
import { evaluateCorpusRetrieval } from "./benchmarkDatasets.js";

export const engineeringHash = (value: string) => createHash("sha256").update(value).digest("hex");
export function publicEngineeringRun(run: EngineeringRun): PublicEngineeringRun {
  const { snapshot: _snapshot, ...safe } = run;
  return safe;
}

export function engineeringVerification(result: LabResult) {
  const comparisons = result.comparisons.map((item) => compareLabProbe(item.probe, item.baseline, item.proposed));
  const expected = comparisons.filter((item) => item.probe.expected !== undefined || item.probe.expectedError !== undefined);
  const mismatches = expected.filter((item) => labOutcomeKey(item.proposed) !== null && labOutcomeKey(item.proposed) !== (item.probe.expectedError !== undefined ? `error:${item.probe.expectedError}` : `value:${labCanonical(item.probe.expected!)}`));
  const uncertain = comparisons.some((item) => ["changed", "inconclusive"].includes(item.verdict)) || result.stability?.repeatMatched === false;
  const status = mismatches.length || comparisons.some((item) => item.verdict === "regression") ? "FAIL" as const : expected.length && !uncertain ? "PASS" as const : "NOT_RUN" as const;
  return { status, detail: `${expected.length} explicit expectations, ${mismatches.length} mismatches. ${comparisons.length} observed probes. Unscored or unstable outcomes are not proof of a repair.`,
    feedback: JSON.stringify(comparisons.filter((item) => mismatches.includes(item) || item.verdict === "regression").map((item) => ({ id: item.probe.id, args: item.probe.args, observed: item.proposed, verdict: item.verdict }))).slice(0, 4000) };
}

export function makeEngineeringRun(store: JsonStore, projectId: string, createdBy: string, input: EngineeringRequest): EngineeringRun {
  const project = store.getProject(projectId)!;
  const docs = new Map(store.getWorkspaceDocs(projectId, "main").map((doc) => [doc.path, doc.content]));
  const snapshot = store.listFiles(projectId).filter((file) => !file.binary && !file.sensitive && safeEngineeringPath(file.path)).map((file) => ({ ...file, content: docs.get(file.path) ?? file.content }));
  if (!snapshot.length || snapshot.length > 2000 || snapshot.reduce((size, file) => size + Buffer.byteLength(file.content), 0) > 1_500_000) throw new Error("Select a repository with one to 2000 text files and at most 1.5 MB of source for an engineering run.");
  if (input.corpusId) {
    const corpus = store.getBenchmarkCorpus(projectId, input.corpusId);
    const task = corpus?.records.find((record) => record.id === input.taskId);
    if (!task) throw new Error("Benchmark task was not found in this project.");
    const repository = project.repoUrl?.replace(/^https:\/\/github\.com\//, "").replace(/\.git\/?$/, "").replace(/\/$/, "");
    if (!task.repository || !task.baseCommit || repository?.toLowerCase() !== task.repository.toLowerCase() || project.commitSha !== task.baseCommit) throw new Error("Import the benchmark's exact repository and base commit first. Fixture retrieval tasks belong in dataset evaluation, not project repair.");
    input = { ...input, objective: task.issue };
  }
  return {
    id: randomUUID(), projectId, createdBy, createdAt: new Date().toISOString(), ...input,
    status: "queued", attempts: 0, revision: project.commitSha, snapshot,
    manifest: snapshot.map((file) => ({ path: file.path, sha256: engineeringHash(file.content) })).sort((a, b) => a.path.localeCompare(b.path)),
    steps: [], citations: [], findings: [], targetFiles: [], testsSuggested: [],
    verification: { status: "NOT_RUN", scope: "No repository command executed", detail: "A proposed diff needs review and a separate restricted worker for behavioral verification." },
    telemetry: { provider: "pending", durationMs: 0, contextTokensEstimate: 0, billedTokens: null, cost: null }
  };
}

export function validateEngineeringPatch(patch: unknown, run: EngineeringRun): PatchProposal {
  const parsed = patchProposalSchema.parse(patch);
  if (parsed.projectId !== run.projectId || parsed.workspaceId !== "main" || parsed.status !== "proposed" || parsed.executedVerification.length) throw new Error("The provider returned an invalid proposal identity or claimed unexecuted verification.");
  if (!parsed.files.length || parsed.files.length > 4 || new Set(parsed.files.map((file) => file.path)).size !== parsed.files.length) throw new Error("A proposal must change one to four distinct existing files.");
  for (const edit of parsed.files) {
    const original = run.snapshot.find((file) => file.path === edit.path);
    if (!original || !safeEngineeringPath(edit.path) || edit.baseContent !== original.content || edit.baseHash !== hashContent(original.content)) throw new Error("A proposal has an unsupported path or stale source base.");
    if (edit.proposedContent === edit.baseContent || edit.proposedContent.length > 250_000) throw new Error("An edit is empty or exceeds the source limit.");
  }
  return parsed;
}

export class EngineeringEngine {
  readonly provider: AiProvider;
  constructor(private readonly store: JsonStore, config: AppConfig, provider?: AiProvider) {
    this.provider = provider ?? createAiProvider({ geminiApiKey: config.GEMINI_API_KEY, geminiModel: config.GEMINI_MODEL, llmBaseUrl: config.LLM_BASE_URL, llmApiKey: config.LLM_API_KEY, llmModel: config.LLM_MODEL, llmTemperature: config.LLM_TEMPERATURE, systemPrompt: config.LLM_SYSTEM_PROMPT, maxPromptCharacters: config.LLM_MAX_PROMPT_CHARS, maxContextMessages: config.MAX_CONTEXT_MESSAGES });
  }

  async execute(job: OperationJob): Promise<Record<string, unknown>> {
    if (!hasPermission(this.store.getRole(job.projectId, job.createdBy), job.type === "engineering.evaluate" ? "project.manage" : "ai.query")) throw new Error("Project access was revoked before execution.");
    if (job.type === "engineering.evaluate") {
      const corpus = this.store.getBenchmarkCorpus(job.projectId, String(job.metadata?.corpusId));
      if (!corpus) throw new Error("Dataset not found.");
      return { report: evaluateCorpusRetrieval(corpus) };
    }
    const run = this.store.getEngineeringRun(job.projectId, String(job.metadata?.runId));
    if (!run || run.createdBy !== job.createdBy) throw new Error("Engineering run not found.");
    if (run.status === "cancelled") return { runId: run.id, status: "cancelled" };
    const started = performance.now();
    const index = indexRepository(run.projectId, run.revision, run.snapshot);
    const plan = planAutonomousChange(index, run.objective);
    const step = async (stage: EngineeringStep["stage"], status: EngineeringStep["status"], detail: string, latencyMs = 0) => {
      this.assertActive(job, run);
      run.steps.push({ stage, status, detail: detail.slice(0, 2000), latencyMs: Math.round(latencyMs) });
      await this.store.saveEngineeringRun(run);
    };
    try {
      run.status = "running"; run.telemetry.provider = this.provider.name;
      run.targetFiles = plan.targetFiles; run.testsSuggested = plan.verificationCommands;
      await step("understand", "PASS", `${index.files.length} frozen source files and ${index.graph.edges.length} static graph relationships. Revision ${run.revision}.`);
      const incident = buildIncidentReport(index, "Task investigation", run.objective);
      run.findings = incident.matchedFiles.slice(0, 5).map((file) => ({ kind: "hypothesis" as const, title: "Source location mentioned in the task", filePath: file.path, detail: "A source match is a candidate, not proof of the defect's cause." }));
      if (run.mode === "security") {
        const security = buildSecurityWorkbench(index);
        run.findings.push(...security.dangerousApis.slice(0, 10).map((finding) => ({ kind: "static-warning" as const, title: finding.api, filePath: finding.filePath, detail: finding.remediation })));
      }
      await step("plan", "PASS", `Candidate files: ${plan.targetFiles.join(", ") || "none"}. Risk: ${plan.risk}. Changes remain proposals.`);
      while (run.attempts < run.maxAttempts) {
        this.assertActive(job, run);
        run.attempts++;
        await this.store.saveEngineeringRun(run);
        const before = performance.now();
        const retrieval = searchRepository(index, run.objective, "graph", 8);
        run.telemetry.contextTokensEstimate += retrieval.hits.reduce((count, hit) => count + Math.ceil(hit.chunk.content.length / 4), 0);
        try {
          const request = { question: run.objective, mode: run.mode === "repair" || run.mode === "migration" ? "propose" as const : "investigate" as const, retrievalMode: "graph" as const, includeWorkspace: true, knowledgeScope: "repository" as const, conversation: run.repairFeedback ? [{ role: "user" as const, content: `Observed prior worker outcomes, not benchmark reference answers:\n${run.repairFeedback}` }] : [] };
          // Only the task statement and frozen source enter this provider boundary.
          const answer = await deadline(this.provider.answer(request, {
            projectId: run.projectId, workspaceId: "main", commitSha: run.revision, index, retrieval,
            workspaceDocs: run.snapshot.map((file) => ({ projectId: run.projectId, workspaceId: "main", path: file.path, content: file.content, version: 0, updatedAt: file.updatedAt }))
          }), 90_000);
          this.assertActive(job, run);
          run.answer = answer.answer.slice(0, 24_000);
          run.error = undefined;
          run.citations = answer.citations.filter((citation) => {
            const file = run.snapshot.find((candidate) => candidate.path === citation.filePath);
            const lines = file?.content.split(/\r?\n/).slice(citation.range.startLine - 1, citation.range.endLine).join("\n");
            return citation.sourceType !== "dataset" && Boolean(lines && citation.excerpt.trim() && lines.includes(citation.excerpt.trim()));
          }).slice(0, 20);
          await step("investigate", run.citations.length ? "PASS" : "FAIL", `${run.citations.length} source-validated citations; provider output is not a verified diagnosis.`, performance.now() - before);
          if (answer.grounding?.status === "abstained") {
            await step("propose", "NOT_RUN", "The assistant needs clarified input or reviewed source. No automatic retry or patch was attempted.");
            run.status = "needs_input";
            break;
          }
          if (answer.patch) {
            const patch = validateEngineeringPatch(answer.patch, run);
            this.assertActive(job, run);
            await this.store.savePatch(patch);
            run.patch = patch;
            await step("propose", "PASS", `${patch.files.length} files in an unapplied, source-base-validated proposal.`);
            run.status = "awaiting_review";
            break;
          }
          if (run.mode !== "repair" && run.mode !== "migration") { run.status = run.citations.length ? "completed" : "needs_input"; break; }
          await step("propose", "NOT_RUN", "The provider did not return a valid diff. No patch was invented or applied.");
        } catch (error) {
          this.assertActive(job, run);
          run.error = "The provider failed or returned an invalid proposal. No original file was modified.";
          await step("propose", "FAIL", run.error, performance.now() - before);
        }
      }
      if (run.status === "running") run.status = "needs_input";
      await step("verify", "NOT_RUN", run.verification.detail);
      run.completedAt = new Date().toISOString(); run.telemetry.durationMs += Math.round(performance.now() - started);
      await step("report", "PASS", "Evidence saved. Verification remains NOT RUN until a matching completed worker experiment is attached.");
      await this.store.recordAudit({ projectId: run.projectId, userId: run.createdBy, action: "engineering.report", metadata: { runId: run.id, attempts: run.attempts, verification: run.verification.status } });
      return { runId: run.id, status: run.status, verification: run.verification.status };
    } catch {
      if (this.store.getOperationJob(job.id)?.status === "cancelled" || this.store.getEngineeringRun(run.projectId, run.id)?.status === "cancelled") return { runId: run.id, status: "cancelled" };
      run.status = "failed"; run.error = "Engineering execution stopped. Check project access and restart only after reviewing the source snapshot.";
      run.completedAt = new Date().toISOString(); await this.store.saveEngineeringRun(run);
      throw new Error(run.error);
    }
  }

  private assertActive(job: OperationJob, run: EngineeringRun) {
    if (this.store.getOperationJob(job.id)?.status === "cancelled" || this.store.getEngineeringRun(run.projectId, run.id)?.status === "cancelled" || !hasPermission(this.store.getRole(job.projectId, job.createdBy), "ai.query")) throw new Error("Engineering run cancelled or access revoked.");
  }
}

async function deadline<T>(request: Promise<T>, milliseconds: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([request, new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Provider deadline exceeded")), milliseconds); timer.unref(); })]); }
  finally { if (timer) clearTimeout(timer); }
}
