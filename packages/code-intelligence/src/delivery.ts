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

export function buildAutomationMission(index: RepositoryIndex, objective: string) {
  const plan = planAutonomousChange(index, objective);
  const sandbox = verifyVirtualSandbox(index, plan);
  const review = buildPullRequestReview(index, plan.targetFiles);
  return { objective, plan, sandbox, review, generatedTests: buildGeneratedTestPlans(index, plan.targetFiles) };
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

