import { describe, expect, it } from "vitest";
import {
  applyWholeFilePatch,
  analyzeSemanticMerge,
  analyzeArchitecturePolicies,
  analyzeDependencyUpgrades,
  analyzeImpact,
  analyzeRepository,
  analyzeRepositoryHotspots,
  buildOnboardingJourney,
  buildReviewCouncil,
  buildAiEvaluation,
  buildArchitectureDocumentation,
  buildAutomationMission,
  buildContextObservatory,
  buildFutureReconciliation,
  buildGraphOntology,
  buildGeneratedTestPlans,
  buildIncidentReport,
  buildIncrementalIndexPlan,
  buildPullRequestReview,
  buildPullRequestRisk,
  buildRepositoryFutureSimulation,
  buildRuntimeTracePreview,
  buildSampleRepoFiles,
  buildSecurityWorkbench,
  buildTestPlans,
  fetchCodeSpan,
  hashContent,
  isIndexableTextFile,
  isRepositoryTextFile,
  indexRepository,
  interpretGraphCommand,
  generateArchitectureDecisionDraft,
  mapRuntimeTrace,
  planAutonomousChange,
  queryRepositoryContext,
  SAMPLE_COMMIT,
  searchRepository,
  searchExactCode,
  traceSecurityFlows,
  verifyVirtualSandbox
} from "@codemesh/code-intelligence";

describe("code intelligence", () => {
  it("keeps safe source paths visible while limiting only oversized semantic parsing", () => {
    expect(isRepositoryTextFile("dist/generated.js", 250_000)).toBe(true);
    expect(isIndexableTextFile("dist/generated.js", 250_000)).toBe(true);
    expect(isRepositoryTextFile("node_modules/package/index.js", 100)).toBe(false);
    expect(isIndexableTextFile("src/huge.ts", 2_500_000)).toBe(false);
  });

  it("extracts TypeScript imports and symbols from the sample repo", () => {
    const files = buildSampleRepoFiles("project-test");
    const index = indexRepository("project-test", SAMPLE_COMMIT, files);

    expect(index.symbols.some((symbol) => symbol.name === "createApp")).toBe(true);
    expect(index.graph.edges.some((edge) => edge.type === "imports" && edge.source.includes("src/server.ts"))).toBe(true);
    expect(index.chunks.length).toBeGreaterThan(3);
  });

  it("returns graph-expanded retrieval hits", () => {
    const index = indexRepository("project-test", SAMPLE_COMMIT, buildSampleRepoFiles("project-test"));
    const result = searchRepository(index, "jwt authentication invalid credentials session middleware", "graph");

    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits.some((hit) => hit.chunk.filePath.includes("auth"))).toBe(true);
  });

  it("rejects stale patch application", () => {
    const base = "export const status = 'old';\n";
    const proposed = "export const status = 'new';\n";
    const result = applyWholeFilePatch(base, "export const status = 'edited';\n", proposed, hashContent(base));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/changed/);
  });

  it("indexes resilient Python symbols, imports, and function calls", () => {
    const now = new Date().toISOString();
    const index = indexRepository("python-project", "python-commit", [
      {
        projectId: "python-project",
        path: "app.py",
        language: "python",
        size: 110,
        binary: false,
        sensitive: false,
        updatedAt: now,
        content: "from services.orders import create_order\n\ndef checkout(items):\n    return create_order(items)\n"
      },
      {
        projectId: "python-project",
        path: "services/orders.py",
        language: "python",
        size: 80,
        binary: false,
        sensitive: false,
        updatedAt: now,
        content: "class Order:\n    pass\n\ndef create_order(items):\n    return Order()\n"
      }
    ]);

    expect(index.symbols.map((symbol) => symbol.name)).toEqual(expect.arrayContaining(["checkout", "Order", "create_order"]));
    expect(index.graph.edges.some((edge) => edge.type === "imports" && edge.target.includes("services/orders.py"))).toBe(true);
    expect(index.graph.edges.some((edge) => edge.type === "references" && edge.label === "calls")).toBe(true);
  });

  it("reports health findings and graph impact from indexed evidence", () => {
    const files = buildSampleRepoFiles("project-health").map((file) =>
      file.path === "src/config.ts"
        ? { ...file, content: `${file.content}\nconst apiKey = \"hard-coded-demo-secret\";\n`, size: file.size + 45 }
        : file
    );
    const index = indexRepository("project-health", SAMPLE_COMMIT, files);
    const health = analyzeRepository(index);
    const createApp = index.graph.nodes.find((node) => node.label === "createApp")!;
    const impact = analyzeImpact(index, createApp.id);

    expect(health.issues.some((issue) => issue.category === "security")).toBe(true);
    expect(health.suggestedTests.length).toBeGreaterThan(0);
    expect(impact?.node.id).toBe(createApp.id);
    expect(impact?.affectedFiles.length).toBeGreaterThan(0);
  });

  it("builds evidence-linked engineering lab analyses", () => {
    const index = indexRepository("project-labs", SAMPLE_COMMIT, buildSampleRepoFiles("project-labs"));
    const policies = analyzeArchitecturePolicies(index);
    const securityFlows = traceSecurityFlows(index);
    const dependencies = analyzeDependencyUpgrades(index);
    const testPlans = buildTestPlans(index);
    const graphCommand = interpretGraphCommand(index, "show the authentication flow");
    const hotspots = analyzeRepositoryHotspots(index);
    const onboarding = buildOnboardingJourney(index);
    const council = buildReviewCouncil(index);

    expect(policies.length).toBeGreaterThanOrEqual(4);
    expect(policies.every((policy) => policy.detail.length > 0)).toBe(true);
    expect(securityFlows.some((flow) => flow.filePaths.some((filePath) => filePath.includes("auth")))).toBe(true);
    expect(dependencies.some((dependency) => dependency.name === "react" && dependency.risk === "high")).toBe(true);
    expect(testPlans.some((plan) => plan.filePath.includes("auth"))).toBe(true);
    expect(graphCommand.nodes.some((node) => `${node.label} ${node.filePath ?? ""}`.toLowerCase().includes("auth"))).toBe(true);
    expect(hotspots[0]?.score).toBeGreaterThan(0);
    expect(onboarding.length).toBeGreaterThanOrEqual(3);
    expect(council.map((agent) => agent.id)).toEqual(expect.arrayContaining(["architecture", "security", "testing", "maintainability"]));
  });

  it("builds advanced planning, runtime, security, risk, and governance evidence", () => {
    const projectId = "project-advanced";
    const index = indexRepository(projectId, SAMPLE_COMMIT, buildSampleRepoFiles(projectId));
    const plan = planAutonomousChange(index, "Harden authentication and add focused tests");
    const sandbox = verifyVirtualSandbox(index, plan);
    const merge = analyzeSemanticMerge(index, "src/auth/routes.ts");
    const risk = buildPullRequestRisk(index, ["src/auth/routes.ts"]);
    const preview = buildRuntimeTracePreview(index);
    const mapped = mapRuntimeTrace(index, [{ id: "span-1", name: "createApp", durationMs: 18, status: "ok" }]);
    const security = buildSecurityWorkbench(index);
    const evaluation = buildAiEvaluation(index, []);
    const decision = generateArchitectureDecisionDraft(index);

    expect(plan.steps).toHaveLength(4);
    expect(plan.constraints.some((constraint) => constraint.includes("never executed"))).toBe(true);
    expect(sandbox.executionMode).toBe("static-isolated");
    expect(sandbox.executedCommands).toEqual([]);
    expect(merge?.regions.length).toBeGreaterThan(0);
    expect(risk.changedFiles).toEqual(["src/auth/routes.ts"]);
    expect(preview.length).toBeGreaterThan(0);
    expect(mapped[0]?.confidence).toBeGreaterThan(0);
    expect(security.sbom.some((component) => component.name === "react")).toBe(true);
    expect(evaluation.benchmarkCases.length).toBeGreaterThan(0);
    expect(decision.evidenceFiles.length).toBeGreaterThan(0);
  });

  it("builds delivery, incident, documentation, and incremental-index evidence", () => {
    const projectId = "project-delivery";
    const index = indexRepository(projectId, SAMPLE_COMMIT, buildSampleRepoFiles(projectId));
    const authFile = index.files.find((file) => file.path.includes("auth"))!.path;
    const review = buildPullRequestReview(index, [authFile]);
    const incremental = buildIncrementalIndexPlan(index, [authFile]);
    const incident = buildIncidentReport(index, "Login failure", "Error in " + authFile + " while calling createSession");
    const documentation = buildArchitectureDocumentation(index);
    const tests = buildGeneratedTestPlans(index, [authFile]);
    const mission = buildAutomationMission(index, "Add stable authentication error codes with focused tests");

    expect(review.changedFiles).toEqual([authFile]);
    expect(review.impactedFiles).toContain(authFile);
    expect(review.checks.length).toBeGreaterThan(0);
    expect(incremental.strategy).toBe("incremental");
    expect(incremental.estimatedFilesAvoided).toBeGreaterThanOrEqual(0);
    expect(incident.matchedFiles[0]?.path).toBe(authFile);
    expect(incident.runbook).toHaveLength(4);
    expect(documentation.mermaid).toContain("flowchart LR");
    expect(documentation.modules.length).toBeGreaterThan(0);
    expect(tests[0]?.changedFile).toBe(authFile);
    expect(mission.plan.steps.length).toBeGreaterThan(0);
  });

  it("forecasts competing repository futures and calibrates them against observed files", () => {
    const projectId = "project-futures";
    const index = indexRepository(projectId, SAMPLE_COMMIT, buildSampleRepoFiles(projectId));
    const simulation = buildRepositoryFutureSimulation(index, "Introduce passkey login while preserving password authentication");

    expect(simulation.futures).toHaveLength(3);
    expect(new Set(simulation.futures.map((future) => future.id)).size).toBe(3);
    expect(simulation.receipt.architectureSignature).toBe(simulation.baseline.architectureSignature);
    expect(simulation.futures.every((future) => future.targetFiles.length > 0)).toBe(true);
    expect(simulation.futures.some((future) => future.id === simulation.recommendation.futureId)).toBe(true);

    const selected = simulation.futures.find((future) => future.id === simulation.recommendation.futureId)!;
    const reconciliation = buildFutureReconciliation(index, simulation, selected.id, selected.targetFiles);
    expect(reconciliation.status).toBe("calibrated");
    expect(reconciliation.calibrationScore).toBeGreaterThanOrEqual(0);
    expect(reconciliation.dimensions).toHaveLength(5);
    expect(reconciliation.confidenceAfter).toBeGreaterThanOrEqual(35);

    const awaiting = buildFutureReconciliation(index, simulation, selected.id);
    expect(awaiting.status).toBe("awaiting_change");
    expect(awaiting.calibrationScore).toBeNull();
  });

  it("returns precise MCP context and a measurable context-efficiency receipt", () => {
    const projectId = "project-context";
    const index = indexRepository(projectId, SAMPLE_COMMIT, buildSampleRepoFiles(projectId));
    const search = searchRepository(index, "authentication session", "graph", 4);
    const ontology = buildGraphOntology(index);
    const exact = searchExactCode(index, "createSession", 5);
    const span = fetchCodeSpan(index, "src/auth/session.ts", 1, 12);
    const graph = queryRepositoryContext(index, { selector: "src/auth/session.ts", relationship: "all", depth: 2 });
    const observatory = buildContextObservatory(index, [{
      id: "retrieval-one",
      projectId,
      question: "Where is authentication handled?",
      mode: "graph",
      chunkIds: search.hits.map((hit) => hit.chunk.id),
      sourceRevision: SAMPLE_COMMIT,
      model: "test-model",
      embeddingModel: "local-hash-demo",
      contextTokens: search.hits.reduce((total, hit) => total + hit.chunk.tokenCount, 0),
      retrievalLatencyMs: 2,
      generationLatencyMs: 9,
      createdAt: new Date(0).toISOString()
    }]);

    expect(ontology.nodeKinds.find((kind) => kind.kind === "symbol")?.count).toBeGreaterThan(0);
    expect(ontology.relationshipKinds.some((kind) => kind.kind === "imports")).toBe(true);
    expect(exact[0]?.range.startLine).toBeGreaterThan(0);
    expect(span?.content).toContain("createSession");
    expect(graph.roots.length).toBeGreaterThan(0);
    expect(graph.sourceSpans.some((item) => item.filePath === "src/auth/session.ts")).toBe(true);
    expect(observatory.summary.questions).toBe(1);
    expect(observatory.summary.avoidedTokens).toBeGreaterThanOrEqual(0);
    expect(observatory.traces[0]?.spans.length).toBeGreaterThan(0);
    expect(observatory.freshness.manifest).toMatch(/^[0-9a-f]{8}$/);
  });
});

