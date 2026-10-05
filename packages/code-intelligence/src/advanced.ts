import ts from "typescript";
import type { RetrievalRecord } from "@codemesh/shared";
import type { RepositoryIndex } from "./index.js";

export type ChangePlanStep = {
  id: string;
  title: string;
  detail: string;
  filePaths: string[];
  evidence: string;
  verification: string;
};

export type AutonomousChangePlan = {
  objective: string;
  risk: "low" | "medium" | "high";
  targetFiles: string[];
  steps: ChangePlanStep[];
  verificationCommands: string[];
  constraints: string[];
};

export type SandboxCheck = {
  id: string;
  label: string;
  status: "pass" | "attention" | "blocked";
  detail: string;
  evidenceFiles: string[];
};

export type VirtualSandboxReport = {
  executionMode: "static-isolated";
  status: "pass" | "attention" | "blocked";
  checks: SandboxCheck[];
  queuedCommands: string[];
  executedCommands: string[];
  repairAttempts: Array<{ attempt: number; action: string; outcome: "complete" | "needs-review"; detail: string }>;
  recommendedRepairs: string[];
  disclaimer: string;
};

export type SemanticMergeReport = {
  filePath: string;
  risk: "low" | "medium" | "high";
  graphRelationships: number;
  regions: Array<{
    id: string;
    label: string;
    kind: string;
    startLine: number;
    endLine: number;
    strategy: string;
  }>;
  recommendation: string;
};

export type PullRequestRisk = {
  score: number;
  status: "pass" | "review" | "block";
  changedFiles: string[];
  checks: Array<{ id: string; label: string; status: "pass" | "review" | "block"; detail: string }>;
};

export type RuntimeSpanInput = {
  id: string;
  parentId?: string;
  name: string;
  durationMs: number;
  status?: "ok" | "error";
  filePath?: string;
};

export type MappedRuntimeSpan = RuntimeSpanInput & {
  nodeId?: string;
  mappedFilePath?: string;
  confidence: number;
};

export type SecurityWorkbench = {
  score: number;
  secrets: Array<{ id: string; severity: "warning" | "critical"; filePath: string; line: number; title: string; remediation: string }>;
  dangerousApis: Array<{ id: string; filePath: string; line: number; api: string; remediation: string }>;
  sbom: Array<{ name: string; version: string; ecosystem: "npm" | "python"; manifest: string; purl: string }>;
};

export type AiEvaluation = {
  requests: number;
  groundedRetrievalRate: number;
  graphRetrievalRate: number;
  workspaceContextRate: number;
  averageLatencyMs: number;
  modelBreakdown: Array<{ model: string; requests: number }>;
  benchmarkCases: Array<{ id: string; question: string; expectedFile: string; expectedSymbol?: string }>;
  note: string;
};

export function planAutonomousChange(index: RepositoryIndex, objective: string): AutonomousChangePlan {
  const ranked = rankFiles(index, objective);
  const targetFiles = ranked.slice(0, 5).map((entry) => entry.path);
  const verificationCommands = detectVerificationCommands(index);
  const sensitive = /auth|session|permission|secret|password|payment|database|migration|security/i.test(objective);
  const graphReach = ranked.slice(0, 3).reduce((total, entry) => total + entry.relationships, 0);
  const risk = sensitive || graphReach >= 20 ? "high" : graphReach >= 8 || targetFiles.length >= 4 ? "medium" : "low";
  const primary = targetFiles.slice(0, 2);
  const tests = index.files.filter((file) => /(^|\/)(tests?|__tests__)(\/|$)|\.(test|spec)\.[^.]+$/i.test(file.path)).map((file) => file.path);

  return {
    objective: objective.trim(),
    risk,
    targetFiles,
    steps: [
      {
        id: "understand",
        title: "Confirm the behavioral boundary",
        detail: "Read the highest-ranked implementation paths and their incoming and outgoing relationships before editing.",
        filePaths: targetFiles.slice(0, 4),
        evidence: `${graphReach} graph relationships touch the leading candidate files.`,
        verification: "Validate that the requested behavior is owned by these modules."
      },
      {
        id: "implement",
        title: "Prepare the smallest coherent patch",
        detail: "Keep the first patch inside the primary modules and preserve their public interfaces unless the objective requires a contract change.",
        filePaths: primary,
        evidence: primary.length ? `Primary edit surface: ${primary.join(", ")}.` : "No implementation file was confidently ranked.",
        verification: "Review the generated diff and re-index its symbol graph."
      },
      {
        id: "verify",
        title: "Exercise affected behavior",
        detail: tests.length ? "Extend the nearest existing tests and run repository verification commands." : "Create focused tests because no existing test file was detected.",
        filePaths: tests.slice(0, 4),
        evidence: `${tests.length} existing test file${tests.length === 1 ? "" : "s"} detected.`,
        verification: verificationCommands.join("; ") || "Review repository-specific verification instructions."
      },
      {
        id: "review",
        title: "Apply the risk gate",
        detail: "Re-run architecture, security, dependency, and blast-radius checks before a human approves the patch.",
        filePaths: targetFiles,
        evidence: `Plan risk is ${risk} based on repository relationships and sensitive-domain keywords.`,
        verification: "Require explicit reviewer approval before applying or publishing changes."
      }
    ],
    verificationCommands,
    constraints: [
      "CodeMesh does not apply or publish the plan automatically.",
      "Imported package scripts are queued for a trusted runner and are never executed by the analysis API.",
      "Every generated patch must pass stale-base and permission checks."
    ]
  };
}

export function verifyVirtualSandbox(index: RepositoryIndex, plan: AutonomousChangePlan): VirtualSandboxReport {
  const syntaxFailures: string[] = [];
  const manifestFailures: string[] = [];
  for (const file of index.files) {
    if (["typescript", "javascript"].includes(file.language)) {
      const result = ts.transpileModule(file.content, {
        fileName: file.path,
        reportDiagnostics: true,
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
      });
      if (result.diagnostics?.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)) syntaxFailures.push(file.path);
    }
    if (file.path.endsWith(".json")) {
      try { JSON.parse(file.content); } catch { manifestFailures.push(file.path); }
    }
  }
  const testFiles = index.files.filter((file) => /(^|\/)(tests?|__tests__)(\/|$)|\.(test|spec)\.[^.]+$/i.test(file.path));
  const secretFiles = scanSecrets(index).map((finding) => finding.filePath);
  const checks: SandboxCheck[] = [
    {
      id: "syntax",
      label: "Syntax and transpilation",
      status: syntaxFailures.length ? "blocked" : "pass",
      detail: syntaxFailures.length ? `${syntaxFailures.length} source file${syntaxFailures.length === 1 ? "" : "s"} produced compiler diagnostics.` : "Indexed JavaScript and TypeScript files transpile without syntax diagnostics.",
      evidenceFiles: syntaxFailures
    },
    {
      id: "manifests",
      label: "Structured manifest parsing",
      status: manifestFailures.length ? "blocked" : "pass",
      detail: manifestFailures.length ? "One or more JSON files could not be parsed." : "Indexed JSON manifests parse successfully.",
      evidenceFiles: manifestFailures
    },
    {
      id: "graph",
      label: "Graph resolution",
      status: index.graph.warnings.length ? "attention" : "pass",
      detail: index.graph.warnings.length ? `${index.graph.warnings.length} unresolved graph relationship${index.graph.warnings.length === 1 ? "" : "s"} need review.` : "Repository relationships resolved without graph warnings.",
      evidenceFiles: []
    },
    {
      id: "tests",
      label: "Verification coverage",
      status: testFiles.length ? "pass" : "attention",
      detail: testFiles.length ? `${testFiles.length} test file${testFiles.length === 1 ? "" : "s"} can support the change plan.` : "No test file was detected; the plan must add focused verification.",
      evidenceFiles: testFiles.map((file) => file.path)
    },
    {
      id: "secrets",
      label: "Credential exposure",
      status: secretFiles.length ? "blocked" : "pass",
      detail: secretFiles.length ? "Possible hard-coded credentials must be removed before execution." : "No hard-coded credential pattern was detected by the local scanner.",
      evidenceFiles: [...new Set(secretFiles)]
    }
  ];
  const blocked = checks.filter((check) => check.status === "blocked");
  const attention = checks.filter((check) => check.status === "attention");
  const recommendedRepairs = [
    ...blocked.map((check) => `Resolve ${check.label.toLowerCase()}: ${check.detail}`),
    ...attention.map((check) => `Review ${check.label.toLowerCase()}: ${check.detail}`)
  ];
  const repairAttempts: VirtualSandboxReport["repairAttempts"] = [
    { attempt: 1, action: "Index and static verification", outcome: blocked.length || attention.length ? "needs-review" : "complete", detail: `${checks.length} isolated checks completed.` }
  ];
  if (recommendedRepairs.length) {
    repairAttempts.push({ attempt: 2, action: "Generate constrained repair plan", outcome: "needs-review", detail: `${recommendedRepairs.length} repair action${recommendedRepairs.length === 1 ? "" : "s"} prepared without mutating workspace files.` });
    repairAttempts.push({ attempt: 3, action: "Await reviewed patch", outcome: "needs-review", detail: "Open the repository assistant to draft a patch, then rerun this sandbox against the reviewed workspace." });
  }
  return {
    executionMode: "static-isolated",
    status: blocked.length ? "blocked" : attention.length ? "attention" : "pass",
    checks,
    queuedCommands: plan.verificationCommands,
    executedCommands: [],
    repairAttempts,
    recommendedRepairs,
    disclaimer: "Static checks ran inside CodeMesh. Repository package scripts are displayed but not executed because imported code is untrusted."
  };
}

export function analyzeSemanticMerge(index: RepositoryIndex, requestedPath?: string): SemanticMergeReport | null {
  const ranked = rankFiles(index, requestedPath ?? "");
  const file = index.files.find((candidate) => candidate.path === requestedPath) ?? index.files.find((candidate) => candidate.path === ranked[0]?.path) ?? index.files[0];
  if (!file) return null;
  const symbols = index.symbols.filter((symbol) => symbol.filePath === file.path).sort((a, b) => a.range.startLine - b.range.startLine);
  const fileNode = index.graph.nodes.find((node) => node.type === "file" && node.filePath === file.path);
  const graphRelationships = fileNode ? index.graph.edges.filter((edge) => edge.source === fileNode.id || edge.target === fileNode.id).length : 0;
  const risk = graphRelationships >= 10 ? "high" : graphRelationships >= 5 || symbols.length >= 6 ? "medium" : "low";
  const regions = symbols.slice(0, 12).map((symbol) => ({
    id: symbol.id,
    label: symbol.name,
    kind: symbol.kind,
    startLine: symbol.range.startLine,
    endLine: symbol.range.endLine,
    strategy: symbol.exported ? "Preserve the exported contract and merge implementation changes inside this symbol." : "Merge this private region independently, then re-run callers and local tests."
  }));
  if (!regions.length) {
    regions.push({ id: `file:${file.path}`, label: file.path, kind: "file", startLine: 1, endLine: file.content.split(/\r?\n/).length, strategy: "Use a whole-file three-way review because no stable symbol boundary was indexed." });
  }
  return {
    filePath: file.path,
    risk,
    graphRelationships,
    regions,
    recommendation: risk === "high" ? "Resolve exported symbols separately and require an impact review before accepting the merged file." : "Merge by symbol boundary, then validate imports, callers, and the nearest tests."
  };
}

export function buildPullRequestRisk(index: RepositoryIndex, changedFiles: string[]): PullRequestRisk {
  const uniqueChanges = [...new Set(changedFiles)].filter((path) => index.files.some((file) => file.path === path));
  if (!uniqueChanges.length) {
    return { score: 0, status: "pass", changedFiles: [], checks: [{ id: "changes", label: "Workspace delta", status: "pass", detail: "No pending workspace change differs from the imported repository." }] };
  }
  const sensitive = uniqueChanges.filter((path) => /auth|session|permission|secret|payment|migration|config/i.test(path));
  const tests = uniqueChanges.filter((path) => /test|spec/i.test(path));
  const relationshipCount = uniqueChanges.reduce((total, path) => {
    const node = index.graph.nodes.find((candidate) => candidate.type === "file" && candidate.filePath === path);
    return total + (node ? index.graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id).length : 0);
  }, 0);
  const score = Math.min(100, uniqueChanges.length * 8 + sensitive.length * 22 + Math.min(30, relationshipCount * 2) + (tests.length ? 0 : 12));
  const status = score >= 70 ? "block" : score >= 35 ? "review" : "pass";
  return {
    score,
    status,
    changedFiles: uniqueChanges,
    checks: [
      { id: "surface", label: "Change surface", status: uniqueChanges.length > 8 ? "review" : "pass", detail: `${uniqueChanges.length} file${uniqueChanges.length === 1 ? "" : "s"} differ from the imported source.` },
      { id: "sensitive", label: "Sensitive paths", status: sensitive.length ? "review" : "pass", detail: sensitive.length ? `${sensitive.length} security or configuration path${sensitive.length === 1 ? "" : "s"} require specialist review.` : "No sensitive path name is present in the pending delta." },
      { id: "tests", label: "Changed tests", status: tests.length ? "pass" : "review", detail: tests.length ? `${tests.length} test file${tests.length === 1 ? "" : "s"} changed with the implementation.` : "No test file changed with the pending implementation." },
      { id: "graph", label: "Graph blast radius", status: relationshipCount >= 15 ? "review" : "pass", detail: `${relationshipCount} indexed relationships touch the changed files.` }
    ]
  };
}

export function buildRuntimeTracePreview(index: RepositoryIndex): MappedRuntimeSpan[] {
  const entry = index.graph.nodes.find((node) => node.type === "symbol" && /^(main|createApp|start|bootstrap)$/i.test(node.label))
    ?? index.graph.nodes.find((node) => node.type === "symbol");
  if (!entry) return [];
  const result: MappedRuntimeSpan[] = [];
  const queue: Array<{ nodeId: string; parentId?: string; depth: number }> = [{ nodeId: entry.id, depth: 0 }];
  const visited = new Set<string>();
  while (queue.length && result.length < 8) {
    const current = queue.shift()!;
    if (visited.has(current.nodeId)) continue;
    visited.add(current.nodeId);
    const node = index.graph.nodes.find((candidate) => candidate.id === current.nodeId);
    if (!node) continue;
    const id = `preview-${result.length + 1}`;
    result.push({ id, parentId: current.parentId, name: node.label, durationMs: 4 + current.depth * 7, status: "ok", filePath: node.filePath, nodeId: node.id, mappedFilePath: node.filePath, confidence: 1 });
    const outgoing = index.graph.edges.filter((edge) => edge.source === node.id && edge.label === "calls").slice(0, 3);
    outgoing.forEach((edge) => queue.push({ nodeId: edge.target, parentId: id, depth: current.depth + 1 }));
  }
  return result;
}

export function mapRuntimeTrace(index: RepositoryIndex, spans: RuntimeSpanInput[]): MappedRuntimeSpan[] {
  return spans.slice(0, 200).map((span) => {
    const normalizedName = span.name.toLowerCase();
    const exact = index.graph.nodes.find((node) => node.label.toLowerCase() === normalizedName || (span.filePath && node.filePath === span.filePath));
    const partial = exact ?? index.graph.nodes.find((node) => normalizedName.includes(node.label.toLowerCase()) || node.label.toLowerCase().includes(normalizedName));
    return { ...span, nodeId: partial?.id, mappedFilePath: partial?.filePath, confidence: exact ? 1 : partial ? 0.65 : 0 };
  });
}

export function buildSecurityWorkbench(index: RepositoryIndex): SecurityWorkbench {
  const secrets = scanSecrets(index);
  const dangerousApis: SecurityWorkbench["dangerousApis"] = [];
  const apiPattern = /\b(eval|dangerouslySetInnerHTML|child_process\.(?:exec|spawn)|innerHTML)\b/;
  for (const file of index.files) {
    file.content.split(/\r?\n/).forEach((line, lineIndex) => {
      const match = line.match(apiPattern);
      if (match) dangerousApis.push({ id: `api:${file.path}:${lineIndex + 1}`, filePath: file.path, line: lineIndex + 1, api: match[1]!, remediation: "Validate inputs, prefer a constrained API, and add an adversarial test before approval." });
    });
  }
  const sbom: SecurityWorkbench["sbom"] = [];
  for (const file of index.files) {
    if (file.path.endsWith("package.json")) {
      try {
        const parsed = JSON.parse(file.content) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
        for (const [name, version] of Object.entries({ ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) })) {
          if (typeof version === "string") sbom.push({ name, version, ecosystem: "npm", manifest: file.path, purl: `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}` });
        }
      } catch {
        // Invalid manifests are reported by the sandbox parser.
      }
    }
    if (/requirements[^/]*\.txt$/i.test(file.path)) {
      file.content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).forEach((line) => {
        const [name, version = "unbounded"] = line.split(/==|>=|~=|<=/);
        if (name) sbom.push({ name: name.trim(), version: version.trim(), ecosystem: "python", manifest: file.path, purl: `pkg:pypi/${encodeURIComponent(name.trim())}@${encodeURIComponent(version.trim())}` });
      });
    }
  }
  return { score: Math.max(0, 100 - secrets.length * 25 - dangerousApis.length * 15), secrets, dangerousApis, sbom };
}

export function buildAiEvaluation(index: RepositoryIndex, retrievals: RetrievalRecord[]): AiEvaluation {
  const records = retrievals.filter((record) => record.projectId === index.projectId);
  const grounded = records.filter((record) => record.chunkIds.length > 0).length;
  const graph = records.filter((record) => record.mode === "graph").length;
  const workspace = records.filter((record) => record.sourceRevision.includes("workspace")).length;
  const modelCounts = new Map<string, number>();
  records.forEach((record) => modelCounts.set(record.model, (modelCounts.get(record.model) ?? 0) + 1));
  const exported = index.symbols.filter((symbol) => symbol.exported).slice(0, 6);
  const benchmarkCases: AiEvaluation["benchmarkCases"] = exported.map((symbol) => ({ id: `symbol:${symbol.id}`, question: `Where is ${symbol.name} defined and what calls it?`, expectedFile: symbol.filePath, expectedSymbol: symbol.name }));
  if (!benchmarkCases.length) {
    index.files.slice(0, 4).forEach((file) => benchmarkCases.push({ id: `file:${file.path}`, question: `What is the responsibility of ${file.path}?`, expectedFile: file.path }));
  }
  const rate = (value: number) => records.length ? Math.round((value / records.length) * 100) : 0;
  return {
    requests: records.length,
    groundedRetrievalRate: rate(grounded),
    graphRetrievalRate: rate(graph),
    workspaceContextRate: rate(workspace),
    averageLatencyMs: records.length ? Math.round(records.reduce((total, record) => total + record.retrievalLatencyMs + record.generationLatencyMs, 0) / records.length) : 0,
    modelBreakdown: [...modelCounts.entries()].map(([model, requests]) => ({ model, requests })).sort((a, b) => b.requests - a.requests),
    benchmarkCases,
    note: "Rates measure retrieval behavior from recorded requests. Answer correctness requires running the benchmark and reviewing returned citations."
  };
}

export function generateArchitectureDecisionDraft(index: RepositoryIndex) {
  const entryPoints = index.files.filter((file) => /(^|\/)(main|index|server|app)\.[^.]+$/i.test(file.path)).map((file) => file.path).slice(0, 6);
  const modules = [...new Set(index.files.map((file) => file.path.split("/").slice(0, -1).join("/") || "root"))].slice(0, 8);
  return {
    title: "Adopt graph-assisted change review",
    context: `The repository contains ${index.files.length} indexed files, ${index.symbols.length} symbols, and ${index.graph.edges.length} relationships across ${modules.length} modules.`,
    decision: "Use the repository graph, isolated static checks, and explicit human approval as required gates for AI-assisted changes.",
    consequences: "Changes gain traceable evidence and stale-patch protection, while maintainers remain responsible for executing trusted tests and approving publication.",
    evidenceFiles: entryPoints
  };
}

function rankFiles(index: RepositoryIndex, query: string) {
  const terms = query.toLowerCase().replace(/[^a-z0-9_./-]+/g, " ").split(/\s+/).filter((term) => term.length > 2);
  return index.files.map((file) => {
    const content = `${file.path} ${file.content}`.toLowerCase();
    const fileNode = index.graph.nodes.find((node) => node.type === "file" && node.filePath === file.path);
    const relationships = fileNode ? index.graph.edges.filter((edge) => edge.source === fileNode.id || edge.target === fileNode.id).length : 0;
    const termScore = terms.reduce((score, term) => score + (file.path.toLowerCase().includes(term) ? 6 : 0) + Math.min(4, content.split(term).length - 1), 0);
    const entryScore = /(^|\/)(main|index|server|app)\.[^.]+$/i.test(file.path) ? 2 : 0;
    return { path: file.path, score: termScore + entryScore + Math.min(5, relationships / 2), relationships };
  }).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

function detectVerificationCommands(index: RepositoryIndex) {
  const commands: string[] = [];
  for (const file of index.files.filter((candidate) => candidate.path.endsWith("package.json"))) {
    try {
      const parsed = JSON.parse(file.content) as { scripts?: Record<string, unknown> };
      for (const name of ["typecheck", "lint", "test", "build"]) {
        if (typeof parsed.scripts?.[name] === "string") commands.push(name === "test" ? "npm test" : `npm run ${name}`);
      }
    } catch {
      // The sandbox parser reports invalid JSON separately.
    }
  }
  if (index.files.some((file) => /pytest|unittest/.test(file.content) || /requirements[^/]*\.txt$/i.test(file.path))) commands.push("pytest");
  return [...new Set(commands)].slice(0, 8);
}

function scanSecrets(index: RepositoryIndex): SecurityWorkbench["secrets"] {
  const findings: SecurityWorkbench["secrets"] = [];
  const pattern = /\b(api[_-]?key|password|secret|token)\s*[:=]\s*["'][^"']{8,}["']/i;
  for (const file of index.files) {
    file.content.split(/\r?\n/).forEach((line, lineIndex) => {
      if (pattern.test(line) && !/process\.env|import\.meta\.env|os\.environ|getenv|example|placeholder/i.test(line)) {
        findings.push({ id: `secret:${file.path}:${lineIndex + 1}`, severity: /api[_-]?key|secret|token/i.test(line) ? "critical" : "warning", filePath: file.path, line: lineIndex + 1, title: "Possible hard-coded credential", remediation: "Rotate the value if it is real, remove it from source history, and load it through managed configuration." });
      }
    });
  }
  return findings.slice(0, 50);
}
