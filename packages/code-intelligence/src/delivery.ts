import type { RepositoryHealth, RepositoryIndex, TestPlan } from "./index.js";
import { analyzeImpact, analyzeRepository, buildTestPlans } from "./index.js";
import { buildPullRequestRisk, buildSecurityWorkbench, planAutonomousChange, verifyVirtualSandbox } from "./advanced.js";

export type PullRequestReview = {
  score: number;
  status: "pass" | "review" | "block";
  changedFiles: string[];
  impactedFiles: string[];
  impactedSymbols: string[];
  checks: Array<{ id: string; label: string; status: "pass" | "review" | "block"; detail: string }>;
  annotations: Array<{ path: string; line: number; level: "notice" | "warning" | "failure"; title: string; message: string }>;
  testPlan: TestPlan[];
  summary: string;
};

export type IncrementalIndexPlan = {
  changedFiles: string[];
  removedOrUnknownFiles: string[];
  affectedFiles: string[];
  affectedSymbols: string[];
  estimatedFilesAvoided: number;
  strategy: "incremental" | "full";
  reason: string;
};

export type IncidentReport = {
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  matchedFiles: Array<{ path: string; confidence: number; evidence: string }>;
  matchedSymbols: Array<{ name: string; filePath: string; line: number; confidence: number }>;
  blastRadius: string[];
  runbook: string[];
  summary: string;
};

export type ArchitectureDocumentation = {
  generatedAt: string;
  entryPoints: string[];
  modules: Array<{ name: string; files: number; symbols: number; relationships: number; languages: string[] }>;
  mermaid: string;
  health: RepositoryHealth;
};

export type GeneratedTestPlan = {
  changedFile: string;
  suggestedPath: string;
  framework: string;
  cases: string[];
  evidence: string[];
};

export type ForecastRange = {
  min: number;
  max: number;
};

export type RepositoryFingerprint = {
  revision: string;
  files: number;
  symbols: number;
  relationships: number;
  testFiles: number;
  healthScore: number;
  modules: number;
  architectureSignature: string;
};

export type FutureCalibrationProfile = {
  samples: number;
  averageScore: number | null;
  confidenceAdjustment: number;
};

export type RepositoryFuture = {
  id: "surgical" | "boundary" | "compatibility";
  name: string;
  strategy: string;
  thesis: string;
  confidence: number;
  risk: "low" | "medium" | "high";
  effortPoints: number;
  reversibility: number;
  targetFiles: string[];
  affectedFiles: string[];
  affectedSymbols: string[];
  predicted: {
    changedFiles: ForecastRange;
    impactedFiles: ForecastRange;
    relationshipDelta: ForecastRange;
    healthDelta: ForecastRange;
    testAdditions: ForecastRange;
    reviewMinutes: ForecastRange;
  };
  assumptions: string[];
  evidence: string[];
  sequence: string[];
  compositeScore: number;
};

export type RepositoryFutureSimulation = {
  objective: string;
  createdAt: string;
  baseline: RepositoryFingerprint;
  calibration: FutureCalibrationProfile;
  futures: RepositoryFuture[];
  recommendation: { futureId: RepositoryFuture["id"]; reason: string };
  uncertainty: { level: "low" | "medium" | "high"; drivers: string[] };
  receipt: {
    id: string;
    architectureSignature: string;
    evidenceFiles: string[];
    statement: string;
  };
};

export type FutureReconciliation = {
  simulationReceiptId: string;
  futureId: RepositoryFuture["id"];
  status: "awaiting_change" | "calibrated";
  calibrationScore: number | null;
  confidenceBefore: number;
  confidenceAfter: number;
  baseline: RepositoryFingerprint;
  actual: RepositoryFingerprint;
  observedFiles: string[];
  dimensions: Array<{
    label: string;
    predicted: ForecastRange;
    actual: number;
    score: number;
    status: "inside" | "outside";
  }>;
  lessons: string[];
  notes?: string;
  summary: string;
};

export function buildPullRequestReview(index: RepositoryIndex, requestedFiles: string[]): PullRequestReview {
  const knownPaths = new Set(index.files.map((file) => file.path));
  const changedFiles = unique(requestedFiles.map(normalizePath).filter((filePath) => knownPaths.has(filePath)));
  const risk = buildPullRequestRisk(index, changedFiles);
  const impactedFiles = new Set<string>();
  const impactedSymbols = new Set<string>();
  const annotations: PullRequestReview["annotations"] = [];

  for (const filePath of changedFiles) {
    impactedFiles.add(filePath);
    const fileNode = index.graph.nodes.find((node) => node.type === "file" && node.filePath === filePath);
    if (fileNode) {
      const impact = analyzeImpact(index, fileNode.id);
      impact?.affectedFiles.forEach((path) => impactedFiles.add(path));
      [...(impact?.incoming ?? []), ...(impact?.outgoing ?? [])]
        .filter((node) => node.type === "symbol")
        .forEach((node) => impactedSymbols.add(node.label));
    }
    const security = buildSecurityWorkbench({ ...index, files: index.files.filter((file) => file.path === filePath) });
    for (const secret of security.secrets) {
      annotations.push({
        path: secret.filePath,
        line: secret.line,
        level: secret.severity === "critical" ? "failure" : "warning",
        title: secret.title,
        message: secret.remediation
      });
    }
    for (const api of security.dangerousApis) {
      annotations.push({ path: api.filePath, line: api.line, level: "warning", title: `Review ${api.api}`, message: api.remediation });
    }
  }

  const tests = buildTestPlans(index).filter((plan) => changedFiles.includes(plan.filePath));
  const summary = changedFiles.length === 0
    ? "No indexed files were selected for review."
    : `${changedFiles.length} changed file${changedFiles.length === 1 ? "" : "s"} reach ${Math.max(changedFiles.length, impactedFiles.size)} files and ${impactedSymbols.size} symbols. ${tests.length || "No"} targeted test plan${tests.length === 1 ? " is" : "s are"} available.`;

  return {
    score: risk.score,
    status: risk.status,
    changedFiles,
    impactedFiles: [...impactedFiles].sort(),
    impactedSymbols: [...impactedSymbols].sort(),
    checks: risk.checks,
    annotations: annotations.slice(0, 50),
    testPlan: tests.slice(0, 12),
    summary
  };
}

export function buildIncrementalIndexPlan(index: RepositoryIndex, requestedPaths: string[]): IncrementalIndexPlan {
  const normalized = unique(requestedPaths.map(normalizePath).filter(Boolean));
  const known = new Set(index.files.map((file) => file.path));
  const changedFiles = normalized.filter((filePath) => known.has(filePath));
  const removedOrUnknownFiles = normalized.filter((filePath) => !known.has(filePath));
  const affectedFiles = new Set(changedFiles);
  const affectedSymbols = new Set<string>();
  const nodeByPath = new Map(index.graph.nodes.filter((node) => node.filePath).map((node) => [node.filePath!, node]));

  for (const filePath of changedFiles) {
    const node = nodeByPath.get(filePath);
    if (!node) continue;
    const relatedIds = new Set<string>();
    for (const edge of index.graph.edges) {
      if (edge.source === node.id) relatedIds.add(edge.target);
      if (edge.target === node.id) relatedIds.add(edge.source);
    }
    for (const relatedId of relatedIds) {
      const related = index.graph.nodes.find((candidate) => candidate.id === relatedId);
      if (related?.filePath) affectedFiles.add(related.filePath);
      if (related?.type === "symbol") affectedSymbols.add(related.label);
    }
    index.symbols.filter((symbol) => symbol.filePath === filePath).forEach((symbol) => affectedSymbols.add(symbol.name));
  }

  const changeRatio = normalized.length / Math.max(1, index.files.length);
  const strategy = changeRatio <= 0.35 && removedOrUnknownFiles.length <= 20 ? "incremental" : "full";
  return {
    changedFiles,
    removedOrUnknownFiles,
    affectedFiles: [...affectedFiles].sort(),
    affectedSymbols: [...affectedSymbols].sort(),
    estimatedFilesAvoided: strategy === "incremental" ? Math.max(0, index.files.length - affectedFiles.size) : 0,
    strategy,
    reason: strategy === "incremental"
      ? "The changed set is contained, so CodeMesh can refresh the touched files and their graph neighborhood."
      : "The changed set is broad or contains many removals, so a full consistency rebuild is safer."
  };
}

export function buildIncidentReport(index: RepositoryIndex, title: string, stackTrace: string): IncidentReport {
  const trace = stackTrace.slice(0, 30_000);
  const lower = trace.toLowerCase();
  const matches = index.files.map((file) => {
    const pathHit = lower.includes(file.path.toLowerCase()) || lower.includes(baseName(file.path).toLowerCase());
    const matchingSymbols = index.symbols.filter((symbol) => symbol.filePath === file.path && lower.includes(symbol.name.toLowerCase()));
    const confidence = Math.min(1, (pathHit ? 0.72 : 0) + Math.min(0.27, matchingSymbols.length * 0.09));
    return { file, confidence, matchingSymbols };
  }).filter((item) => item.confidence > 0).sort((a, b) => b.confidence - a.confidence);

  const matchedFiles = matches.slice(0, 12).map((item) => ({
    path: item.file.path,
    confidence: Math.round(item.confidence * 100) / 100,
    evidence: item.matchingSymbols.length ? `Symbols: ${item.matchingSymbols.map((symbol) => symbol.name).join(", ")}` : "File path appears in the trace"
  }));
  const matchedSymbols = matches.flatMap((item) => item.matchingSymbols.map((symbol) => ({
    name: symbol.name,
    filePath: symbol.filePath,
    line: symbol.range.startLine,
    confidence: Math.round(Math.min(1, item.confidence + 0.08) * 100) / 100
  }))).slice(0, 16);
  const blastRadius = new Set<string>();
  for (const match of matches.slice(0, 4)) {
    const node = index.graph.nodes.find((candidate) => candidate.type === "file" && candidate.filePath === match.file.path);
    if (!node) continue;
    analyzeImpact(index, node.id)?.affectedFiles.forEach((filePath) => blastRadius.add(filePath));
  }
  const critical = /(data loss|corrupt|security|breach|outage|fatal)/i.test(trace);
  const errors = (trace.match(/\b(error|exception|failed|panic|fatal)\b/gi) ?? []).length;
  const severity: IncidentReport["severity"] = critical ? "critical" : errors >= 4 ? "high" : errors >= 1 ? "medium" : "low";
  const runbook = [
    matchedFiles[0] ? `Open ${matchedFiles[0].path} at the first mapped frame and confirm the deployed revision.` : "Capture a stack trace containing repository file paths or symbol names.",
    "Compare the incident revision with the latest indexed commit and inspect recent graph changes.",
    blastRadius.size ? `Run focused tests for ${Math.min(blastRadius.size, 8)} graph-adjacent files before applying a patch.` : "Run the repository test and type-check commands before applying a patch.",
    "Create a reviewable patch, attach verification logs, and keep rollback instructions with the contribution."
  ];
  return {
    title,
    severity,
    matchedFiles,
    matchedSymbols,
    blastRadius: [...blastRadius].slice(0, 30),
    runbook,
    summary: matchedFiles.length
      ? `CodeMesh mapped ${matchedFiles.length} source files and ${matchedSymbols.length} symbols from the incident evidence.`
      : "No indexed source location matched the supplied incident evidence. Add file paths, function names, or stack frames for a stronger trace."
  };
}

export function buildArchitectureDocumentation(index: RepositoryIndex): ArchitectureDocumentation {
  const moduleMap = new Map<string, { files: Set<string>; symbols: number; relationships: number; languages: Set<string> }>();
  for (const file of index.files) {
    const moduleName = file.path.includes("/") ? file.path.split("/").slice(0, -1).join("/") : "root";
    const module = moduleMap.get(moduleName) ?? { files: new Set<string>(), symbols: 0, relationships: 0, languages: new Set<string>() };
    module.files.add(file.path);
    module.languages.add(file.language);
    module.symbols += index.symbols.filter((symbol) => symbol.filePath === file.path).length;
    const node = index.graph.nodes.find((candidate) => candidate.type === "file" && candidate.filePath === file.path);
    if (node) module.relationships += index.graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id).length;
    moduleMap.set(moduleName, module);
  }
  const modules = [...moduleMap.entries()].map(([name, value]) => ({
    name,
    files: value.files.size,
    symbols: value.symbols,
    relationships: value.relationships,
    languages: [...value.languages].sort()
  })).sort((a, b) => b.relationships - a.relationships || b.files - a.files);
  const entryPoints = index.files.filter((file) => /(^|\/)(main|index|server|app|cli)\.[^.]+$/i.test(file.path)).map((file) => file.path).slice(0, 12);
  const moduleId = (value: string) => `m_${value.replace(/[^a-z0-9]/gi, "_")}`;
  const fileModule = new Map(index.files.map((file) => [file.path, file.path.includes("/") ? file.path.split("/").slice(0, -1).join("/") : "root"]));
  const connections = new Map<string, number>();
  for (const edge of index.graph.edges) {
    const sourcePath = index.graph.nodes.find((node) => node.id === edge.source)?.filePath;
    const targetPath = index.graph.nodes.find((node) => node.id === edge.target)?.filePath;
    const sourceModule = sourcePath ? fileModule.get(sourcePath) : undefined;
    const targetModule = targetPath ? fileModule.get(targetPath) : undefined;
    if (!sourceModule || !targetModule || sourceModule === targetModule) continue;
    const key = `${sourceModule}\u0000${targetModule}`;
    connections.set(key, (connections.get(key) ?? 0) + 1);
  }
  const mermaidLines = ["flowchart LR"];
  modules.slice(0, 16).forEach((module) => mermaidLines.push(`  ${moduleId(module.name)}["${escapeMermaid(module.name)}\\n${module.files} files"]`));
  [...connections.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).forEach(([key, count]) => {
    const [source, target] = key.split("\u0000");
    if (source && target && moduleMap.has(source) && moduleMap.has(target)) mermaidLines.push(`  ${moduleId(source)} -->|${count}| ${moduleId(target)}`);
  });
  return { generatedAt: new Date().toISOString(), entryPoints, modules, mermaid: mermaidLines.join("\n"), health: analyzeRepository(index) };
}

export function buildGeneratedTestPlans(index: RepositoryIndex, changedFiles: string[]): GeneratedTestPlan[] {
  const existingPlans = buildTestPlans(index);
  return unique(changedFiles.map(normalizePath)).filter((filePath) => index.files.some((file) => file.path === filePath)).map((filePath) => {
    const extension = filePath.split(".").pop()?.toLowerCase();
    const stem = filePath.replace(/\.[^.]+$/, "");
    const framework = extension === "py" ? "pytest" : index.files.some((file) => /vitest/i.test(file.content)) ? "Vitest" : "repository test runner";
    const suggestedPath = extension === "py" ? `tests/test_${baseName(stem)}.py` : `${stem}.test.${extension === "tsx" ? "tsx" : "ts"}`;
    const related = existingPlans.filter((plan) => plan.filePath === filePath);
    const symbols = index.symbols.filter((symbol) => symbol.filePath === filePath).slice(0, 5);
    const cases = [
      `covers the primary behavior in ${baseName(filePath)}`,
      symbols[0] ? `exercises ${symbols[0].name} with valid and invalid input` : "covers valid and invalid input",
      "asserts failure behavior without leaking sensitive implementation details",
      related.length ? `runs with ${related.map((plan) => plan.command).slice(0, 2).join(" and ")}` : "protects graph-adjacent callers"
    ];
    const node = index.graph.nodes.find((candidate) => candidate.type === "file" && candidate.filePath === filePath);
    const evidence = node ? analyzeImpact(index, node.id)?.affectedFiles.slice(0, 8) ?? [] : [];
    return { changedFile: filePath, suggestedPath, framework, cases, evidence };
  }).slice(0, 20);
}

export function buildRepositoryFutureSimulation(
  index: RepositoryIndex,
  objective: string,
  calibration: FutureCalibrationProfile = { samples: 0, averageScore: null, confidenceAdjustment: 0 }
): RepositoryFutureSimulation {
  const normalizedObjective = objective.trim() || "Improve the repository with the smallest safe change.";
  const plan = planAutonomousChange(index, normalizedObjective);
  const baseline = fingerprintRepository(index);
  const sourceFiles = index.files.filter((file) => !isTestFile(file.path));
  const planned = plan.targetFiles.filter((path) => sourceFiles.some((file) => file.path === path));
  const relationshipRanked = [...sourceFiles].sort((left, right) => relationshipCount(index, right.path) - relationshipCount(index, left.path));
  const candidates = unique([...planned, ...relationshipRanked.map((file) => file.path)]);
  const primary = candidates.slice(0, 4);
  const hub = relationshipRanked[0]?.path;
  const adjacent = adjacentFiles(index, primary);
  const nearestTests = index.files
    .filter((file) => isTestFile(file.path))
    .sort((left, right) => testAffinity(right.path, primary) - testAffinity(left.path, primary))
    .map((file) => file.path);
  const fallback = index.files[0]?.path;

  const variants: Array<{
    id: RepositoryFuture["id"];
    name: string;
    strategy: string;
    thesis: string;
    targetFiles: string[];
    reversibility: number;
    relationshipDelta: ForecastRange;
    healthDelta: ForecastRange;
    extraEffort: number;
  }> = [
    {
      id: "surgical",
      name: "Surgical patch",
      strategy: "Preserve current boundaries",
      thesis: "Change the smallest coherent implementation surface and protect its existing public behavior with focused tests.",
      targetFiles: unique([...primary.slice(0, 2), ...nearestTests.slice(0, 1), ...(primary.length ? [] : fallback ? [fallback] : [])]),
      reversibility: 94,
      relationshipDelta: { min: -1, max: 2 },
      healthDelta: { min: 0, max: 3 },
      extraEffort: 0
    },
    {
      id: "boundary",
      name: "Boundary redesign",
      strategy: "Move responsibility to a clearer module boundary",
      thesis: "Use the change to reduce structural coupling around the most connected relevant module, accepting a broader review surface now.",
      targetFiles: unique([...(hub ? [hub] : []), ...primary.slice(0, 3), ...nearestTests.slice(0, 1), ...(primary.length ? [] : fallback ? [fallback] : [])]).slice(0, 6),
      reversibility: 62,
      relationshipDelta: { min: -Math.max(2, Math.ceil(index.graph.edges.length * 0.04)), max: 0 },
      healthDelta: { min: 1, max: 7 },
      extraEffort: 5
    },
    {
      id: "compatibility",
      name: "Compatibility bridge",
      strategy: "Introduce the new behavior behind an adapter",
      thesis: "Keep old and new behavior valid together, make migration observable, and remove the bridge only after callers have moved.",
      targetFiles: unique([...primary.slice(0, 3), ...adjacent.slice(0, 2), ...nearestTests.slice(0, 1), ...(primary.length ? [] : fallback ? [fallback] : [])]).slice(0, 7),
      reversibility: 86,
      relationshipDelta: { min: 0, max: Math.max(3, primary.length + 2) },
      healthDelta: { min: 0, max: 5 },
      extraEffort: 3
    }
  ];

  const futures = variants.map((variant) => buildFuture(index, normalizedObjective, plan.risk, calibration, variant));
  const recommended = [...futures].sort((left, right) => right.compositeScore - left.compositeScore)[0] ?? futures[0]!;
  const averageConfidence = futures.length
    ? Math.round(futures.reduce((total, future) => total + future.confidence, 0) / futures.length)
    : 0;
  const uncertaintyDrivers = [
    ...(calibration.samples === 0 ? ["No reconciled forecasts exist yet; confidence begins from structural evidence only."] : []),
    ...(baseline.testFiles === 0 ? ["No indexed test files were detected, so behavior coverage is uncertain."] : []),
    ...(index.graph.edges.length < index.files.length ? ["The repository graph is sparse relative to the file count."] : []),
    ...(/migration|database|auth|permission|payment|security/i.test(normalizedObjective)
      ? ["The objective touches a sensitive or stateful domain where runtime behavior can exceed static evidence."]
      : [])
  ];
  const createdAt = new Date().toISOString();
  const evidenceFiles = unique(futures.flatMap((future) => future.targetFiles)).slice(0, 20);
  return {
    objective: normalizedObjective,
    createdAt,
    baseline,
    calibration,
    futures,
    recommendation: {
      futureId: recommended.id,
      reason: `${recommended.name} leads the evidence-weighted score at ${recommended.compositeScore}/100 with ${recommended.confidence}% confidence and ${recommended.reversibility}% reversibility.`
    },
    uncertainty: {
      level: averageConfidence >= 80 && uncertaintyDrivers.length <= 1 ? "low" : averageConfidence >= 64 ? "medium" : "high",
      drivers: uncertaintyDrivers.length ? uncertaintyDrivers : ["Static graph evidence is strong; runtime and organizational effects still require human review."]
    },
    receipt: {
      id: `future_${hashText(`${index.projectId}|${index.commitSha}|${normalizedObjective}|${createdAt}`)}`,
      architectureSignature: baseline.architectureSignature,
      evidenceFiles,
      statement: "This receipt freezes the assumptions, graph revision, forecast ranges, and confidence available before implementation."
    }
  };
}

export function buildFutureReconciliation(
  index: RepositoryIndex,
  simulation: RepositoryFutureSimulation,
  futureId: RepositoryFuture["id"],
  observedPaths: string[] = [],
  notes?: string
): FutureReconciliation {
  const future = simulation.futures.find((candidate) => candidate.id === futureId);
  if (!future) throw new Error("Unknown repository future.");
  const knownPaths = new Set(index.files.map((file) => file.path));
  const observedFiles = unique(observedPaths.map(normalizePath).filter((path) => knownPaths.has(path)));
  const actual = fingerprintRepository(index);
  const repositoryChanged = actual.architectureSignature !== simulation.baseline.architectureSignature
    || actual.revision !== simulation.baseline.revision;
  if (!repositoryChanged && observedFiles.length === 0) {
    return {
      simulationReceiptId: simulation.receipt.id,
      futureId,
      status: "awaiting_change",
      calibrationScore: null,
      confidenceBefore: future.confidence,
      confidenceAfter: future.confidence,
      baseline: simulation.baseline,
      actual,
      observedFiles,
      dimensions: [],
      lessons: ["Import or select the implemented files, then reconcile again to score this forecast against evidence."],
      notes,
      summary: "The repository still matches the forecast baseline, so CodeMesh preserved the receipt without inventing an outcome."
    };
  }

  const reviewFiles = observedFiles.length ? observedFiles : future.targetFiles.filter((path) => knownPaths.has(path));
  const review = buildPullRequestReview(index, reviewFiles);
  const values = [
    { label: "Changed files", predicted: future.predicted.changedFiles, actual: reviewFiles.length },
    { label: "Impacted files", predicted: future.predicted.impactedFiles, actual: review.impactedFiles.length },
    { label: "Relationship delta", predicted: future.predicted.relationshipDelta, actual: actual.relationships - simulation.baseline.relationships },
    { label: "Health delta", predicted: future.predicted.healthDelta, actual: actual.healthScore - simulation.baseline.healthScore },
    { label: "Test additions", predicted: future.predicted.testAdditions, actual: Math.max(0, actual.testFiles - simulation.baseline.testFiles) }
  ];
  const dimensions = values.map((dimension) => {
    const score = rangeScore(dimension.actual, dimension.predicted);
    return { ...dimension, score, status: score === 100 ? "inside" as const : "outside" as const };
  });
  const calibrationScore = Math.round(dimensions.reduce((total, dimension) => total + dimension.score, 0) / dimensions.length);
  const confidenceAfter = clamp(Math.round(future.confidence + (calibrationScore - 75) * 0.25), 35, 98);
  const misses = dimensions.filter((dimension) => dimension.status === "outside");
  const lessons = misses.length
    ? misses.map((dimension) => `${dimension.label} landed at ${dimension.actual}, outside the forecast band ${dimension.predicted.min}-${dimension.predicted.max}; widen or re-weight this signal next time.`)
    : ["Every measurable outcome landed inside its forecast band; future confidence can increase modestly without removing human review."];
  return {
    simulationReceiptId: simulation.receipt.id,
    futureId,
    status: "calibrated",
    calibrationScore,
    confidenceBefore: future.confidence,
    confidenceAfter,
    baseline: simulation.baseline,
    actual,
    observedFiles: reviewFiles,
    dimensions,
    lessons,
    notes,
    summary: `CodeMesh compared ${dimensions.length} predicted dimensions with the observed repository and scored this forecast ${calibrationScore}/100.`
  };
}

export function buildAutomationMission(index: RepositoryIndex, objective: string) {
  const plan = planAutonomousChange(index, objective);
  const sandbox = verifyVirtualSandbox(index, plan);
  const review = buildPullRequestReview(index, plan.targetFiles);
  return { objective, plan, sandbox, review, generatedTests: buildGeneratedTestPlans(index, plan.targetFiles) };
}

function buildFuture(
  index: RepositoryIndex,
  objective: string,
  planRisk: "low" | "medium" | "high",
  calibration: FutureCalibrationProfile,
  variant: {
    id: RepositoryFuture["id"];
    name: string;
    strategy: string;
    thesis: string;
    targetFiles: string[];
    reversibility: number;
    relationshipDelta: ForecastRange;
    healthDelta: ForecastRange;
    extraEffort: number;
  }
): RepositoryFuture {
  const review = buildPullRequestReview(index, variant.targetFiles);
  const impactedFiles = Math.max(variant.targetFiles.length, review.impactedFiles.length);
  const relationshipEvidence = variant.targetFiles.reduce((total, path) => total + relationshipCount(index, path), 0);
  const risk: RepositoryFuture["risk"] = review.status === "block" || planRisk === "high"
    ? "high"
    : review.status === "review" || planRisk === "medium" || variant.id === "boundary"
      ? "medium"
      : "low";
  const effortPoints = Math.max(2, Math.ceil(variant.targetFiles.length * 1.7 + impactedFiles * 0.45 + variant.extraEffort));
  const evidenceCoverage = variant.targetFiles.length
    ? Math.min(16, Math.round((review.impactedSymbols.length + relationshipEvidence) / variant.targetFiles.length))
    : 0;
  const riskPenalty = risk === "high" ? 10 : risk === "medium" ? 4 : 0;
  const confidence = clamp(62 + evidenceCoverage - riskPenalty + calibration.confidenceAdjustment, 42, 96);
  const reviewMinutes = Math.max(12, effortPoints * 4);
  const changedSpread = variant.id === "surgical" ? 1 : variant.id === "compatibility" ? 2 : 3;
  const impactedMinimum = Math.max(variant.targetFiles.length, Math.floor(impactedFiles * 0.8));
  const predicted = {
    changedFiles: { min: Math.max(1, variant.targetFiles.length - 1), max: variant.targetFiles.length + changedSpread },
    impactedFiles: { min: impactedMinimum, max: Math.max(impactedMinimum, Math.ceil(impactedFiles * 1.3) + changedSpread) },
    relationshipDelta: variant.relationshipDelta,
    healthDelta: variant.healthDelta,
    testAdditions: { min: 1, max: Math.max(1, Math.ceil(variant.targetFiles.length / 2) + (variant.id === "compatibility" ? 1 : 0)) },
    reviewMinutes: { min: reviewMinutes, max: Math.max(reviewMinutes, Math.ceil(reviewMinutes * 1.9)) }
  };
  const effortScore = Math.max(0, 100 - effortPoints * 4);
  const compositeScore = clamp(Math.round(confidence * 0.45 + variant.reversibility * 0.35 + effortScore * 0.2 - riskPenalty), 0, 100);
  const objectiveTerms = objective.toLowerCase().replace(/[^a-z0-9_./-]+/g, " ").split(/\s+/).filter((term) => term.length > 2);
  const directMatches = variant.targetFiles.filter((path) => objectiveTerms.some((term) => path.toLowerCase().includes(term)));
  return {
    id: variant.id,
    name: variant.name,
    strategy: variant.strategy,
    thesis: variant.thesis,
    confidence,
    risk,
    effortPoints,
    reversibility: variant.reversibility,
    targetFiles: variant.targetFiles,
    affectedFiles: review.impactedFiles,
    affectedSymbols: review.impactedSymbols,
    predicted,
    assumptions: [
      "The imported revision matches the code that will be changed.",
      "Static imports and calls represent the important behavioral paths.",
      variant.id === "compatibility"
        ? "The old contract can remain available during a measured migration window."
        : variant.id === "boundary"
          ? "The selected boundary can absorb responsibility without creating a new cycle."
          : "The requested behavior can be delivered without changing a public contract."
    ],
    evidence: [
      `${variant.targetFiles.length} candidate files connect to ${review.impactedFiles.length} files and ${review.impactedSymbols.length} symbols.`,
      `${relationshipEvidence} graph relationships touch the proposed edit surface.`,
      directMatches.length
        ? `${directMatches.length} target file${directMatches.length === 1 ? " directly matches" : "s directly match"} objective terms.`
        : "Candidate ranking relies on graph centrality because no file path directly matches the objective."
    ],
    sequence: variant.id === "compatibility"
      ? ["Introduce an observable adapter or feature boundary.", "Move callers in measured groups.", "Compare runtime and test evidence.", "Retire the old path after the receipt reconciles."]
      : variant.id === "boundary"
        ? ["Freeze the existing contract with characterization tests.", "Move responsibility toward the selected boundary.", "Remove redundant relationships.", "Re-index and inspect architecture delta."]
        : ["Lock current behavior with a focused test.", "Apply the smallest coherent edit.", "Run graph-adjacent verification.", "Reconcile the forecast before merge."],
    compositeScore
  };
}

function fingerprintRepository(index: RepositoryIndex): RepositoryFingerprint {
  const health = analyzeRepository(index);
  const modules = new Set(index.files.map((file) => file.path.includes("/") ? file.path.split("/").slice(0, -1).join("/") : "root"));
  const signatureInput = [
    index.commitSha,
    ...index.files.map((file) => `${file.path}:${file.size}`).sort(),
    ...index.graph.edges.map((edge) => `${edge.source}>${edge.target}:${edge.type}`).sort()
  ].join("|");
  return {
    revision: index.commitSha,
    files: index.files.length,
    symbols: index.symbols.length,
    relationships: index.graph.edges.length,
    testFiles: index.files.filter((file) => isTestFile(file.path)).length,
    healthScore: health.score,
    modules: modules.size,
    architectureSignature: hashText(signatureInput)
  };
}

function adjacentFiles(index: RepositoryIndex, paths: string[]) {
  const selected = new Set(paths);
  const fileByNode = new Map(index.graph.nodes.filter((node) => node.type === "file" && node.filePath).map((node) => [node.id, node.filePath!]));
  const nodeByFile = new Map([...fileByNode.entries()].map(([nodeId, path]) => [path, nodeId]));
  const related = new Set<string>();
  for (const path of paths) {
    const nodeId = nodeByFile.get(path);
    if (!nodeId) continue;
    for (const edge of index.graph.edges) {
      const other = edge.source === nodeId ? fileByNode.get(edge.target) : edge.target === nodeId ? fileByNode.get(edge.source) : undefined;
      if (other && !selected.has(other)) related.add(other);
    }
  }
  return [...related].sort((left, right) => relationshipCount(index, right) - relationshipCount(index, left));
}

function relationshipCount(index: RepositoryIndex, filePath: string) {
  const nodeIds = new Set(index.graph.nodes.filter((node) => node.filePath === filePath).map((node) => node.id));
  return index.graph.edges.filter((edge) => nodeIds.has(edge.source) || nodeIds.has(edge.target)).length;
}

function testAffinity(testPath: string, targetPaths: string[]) {
  const lower = testPath.toLowerCase();
  return targetPaths.reduce((score, path) => {
    const stem = baseName(path).replace(/\.[^.]+$/, "").toLowerCase();
    const directory = path.includes("/") ? path.split("/").slice(0, -1).join("/").toLowerCase() : "";
    return score + (stem && lower.includes(stem) ? 5 : 0) + (directory && lower.includes(directory) ? 2 : 0);
  }, 0);
}

function isTestFile(filePath: string) {
  return /(^|\/)(tests?|__tests__)(\/|$)|\.(test|spec)\.[^.]+$/i.test(filePath);
}

function rangeScore(actual: number, range: ForecastRange) {
  if (actual >= range.min && actual <= range.max) return 100;
  const distance = actual < range.min ? range.min - actual : actual - range.max;
  const width = Math.max(1, range.max - range.min + 1);
  return clamp(100 - Math.round((distance / width) * 40), 0, 99);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function normalizePath(value: string) {
  return value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function baseName(value: string) {
  return value.split("/").pop() ?? value;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function escapeMermaid(value: string) {
  return value.replace(/["\n\r]/g, " ").slice(0, 100);
}
