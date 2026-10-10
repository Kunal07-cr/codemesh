import ts from "typescript";
import ignore from "ignore";
import { retrieveGroundedEvidence } from "./groundedRetrieval.js";
import type {
  CodeChunk,
  CodeSymbol,
  GraphEdge,
  GraphNode,
  RepoFile,
  RepositoryGraph,
  RetrievalRecord,
  RetrievalMode,
  SourceRange,
  WorkspaceDoc
} from "@codemesh/shared";

export * from "./advanced.js";
export * from "./delivery.js";
export * from "./groundedRetrieval.js";

export type RepositoryIndex = {
  projectId: string;
  commitSha: string;
  files: RepoFile[];
  symbols: CodeSymbol[];
  graph: RepositoryGraph;
  chunks: CodeChunk[];
  languages: string[];
};

export type SearchHit = {
  chunk: CodeChunk;
  score: number;
  reason: string;
};

export type SearchResult = {
  mode: RetrievalMode;
  hits: SearchHit[];
  latencyMs: number;
  expandedFromChunkIds: string[];
  evidence?: { kind: string; requested: string[]; missing: string[]; ambiguous: string[]; contextTruncated: boolean; strategy: string };
};

export type GraphOntology = {
  repository: { projectId: string; commitSha: string; files: number; symbols: number };
  nodeKinds: Array<{ kind: GraphNode["type"]; count: number; facts: string[] }>;
  relationshipKinds: Array<{ kind: GraphEdge["type"]; count: number; meaning: string }>;
  languages: Array<{ language: string; files: number }>;
  queryHints: string[];
};

export type ExactCodeMatch = {
  filePath: string;
  range: SourceRange;
  excerpt: string;
};

export type CodeSpan = {
  filePath: string;
  language: string;
  range: SourceRange;
  content: string;
  commitSha: string;
};

export type GraphContextQuery = {
  selector: string;
  relationship?: GraphEdge["type"] | "all";
  direction?: "incoming" | "outgoing" | "both";
  depth?: number;
  limit?: number;
};

export type GraphContextResult = {
  selector: string;
  roots: GraphNode[];
  nodes: Array<GraphNode & { depth: number }>;
  edges: GraphEdge[];
  sourceSpans: Array<{ filePath: string; range?: SourceRange; label: string }>;
  truncated: boolean;
};

export type ContextObservatory = {
  summary: {
    questions: number;
    repositoryTokens: number;
    deliveredTokens: number;
    estimatedBaselineTokens: number;
    avoidedTokens: number;
    reductionPercentage: number | null;
    averageRetrievalLatencyMs: number;
    averageGenerationLatencyMs: number;
  };
  freshness: {
    status: "synced" | "workspace-ahead";
    manifest: string;
    commitSha: string;
    indexedAt: string;
    changedFiles: number;
    changedPaths: string[];
  };
  traces: Array<{
    id: string;
    question: string;
    mode: RetrievalMode;
    sourceRevision: string;
    createdAt: string;
    baselineTokens: number;
    deliveredTokens: number;
    avoidedTokens: number;
    reductionPercentage: number;
    retrievalLatencyMs: number;
    generationLatencyMs: number;
    spans: Array<{ filePath: string; range: SourceRange; symbolName?: string; tokenCount: number }>;
  }>;
};

export type RepositoryHealthIssue = {
  id: string;
  severity: "info" | "warning" | "critical";
  category: "maintainability" | "security" | "testing" | "structure";
  title: string;
  detail: string;
  filePath?: string;
  line?: number;
};

export type RepositoryHealth = {
  score: number;
  files: number;
  sourceLines: number;
  symbols: number;
  relationships: number;
  testFiles: number;
  coverageEstimate: number;
  issues: RepositoryHealthIssue[];
  suggestedTests: string[];
};

export type ImpactAnalysis = {
  node: GraphNode;
  incoming: GraphNode[];
  outgoing: GraphNode[];
  affectedFiles: string[];
  risk: "low" | "medium" | "high";
};

export type ArchitecturePolicyResult = {
  id: string;
  title: string;
  rule: string;
  status: "pass" | "warning" | "violation";
  detail: string;
  evidenceFiles: string[];
};

export type SecurityFlow = {
  id: string;
  title: string;
  severity: "info" | "warning" | "critical";
  source: string;
  sink: string;
  nodeIds: string[];
  filePaths: string[];
  detail: string;
};

export type DependencyUpgradeItem = {
  name: string;
  currentVersion: string;
  manifest: string;
  usageFiles: string[];
  risk: "low" | "medium" | "high";
  reason: string;
  recommendedAction: string;
};

export type TestPlan = {
  id: string;
  targetNodeId: string;
  target: string;
  filePath: string;
  testFilePath: string;
  command: string;
  cases: string[];
};

export type GraphCommandResult = {
  command: string;
  intent: "authentication" | "callers" | "dependencies" | "tests" | "entrypoints" | "search";
  summary: string;
  nodes: GraphNode[];
  connectingEdges: GraphEdge[];
};

export type RepositoryHotspot = {
  filePath: string;
  score: number;
  relationships: number;
  sourceLines: number;
  findings: number;
  risk: "low" | "medium" | "high";
};

export type OnboardingStep = {
  id: string;
  title: string;
  detail: string;
  filePath: string;
  line: number;
  category: "start" | "architecture" | "security" | "domain" | "testing";
};

export type ReviewAgentResult = {
  id: "architecture" | "security" | "testing" | "maintainability";
  name: string;
  verdict: "pass" | "review" | "block";
  summary: string;
  findings: Array<{ title: string; detail: string; filePath?: string; line?: number }>;
};

export type InvariantCategory = "access" | "configuration" | "interface" | "data" | "resilience" | "verification";

export type RepositoryInvariant = {
  id: string;
  category: InvariantCategory;
  title: string;
  statement: string;
  status: "guarded" | "watch" | "unverified";
  confidence: number;
  filePath: string;
  line: number;
  evidence: string;
  dependentFiles: string[];
  contradiction?: string;
};

export type InvariantFailureDrill = {
  id: string;
  title: string;
  hypothesis: string;
  severity: "low" | "medium" | "high";
  contractIds: string[];
  affectedFiles: string[];
  recoverySteps: string[];
};

export type InvariantLedger = {
  score: number;
  guarded: number;
  attention: number;
  categoryCoverage: number;
  contracts: RepositoryInvariant[];
  drills: InvariantFailureDrill[];
};

type PendingCall = {
  sourceFilePath: string;
  sourceSymbolId?: string;
  calleeName: string;
  direct?: boolean;
};

export const SAMPLE_COMMIT = "sample-commit-2026-09-27";

export const sampleRepositoryFiles: Array<Omit<RepoFile, "projectId" | "updatedAt">> = [
  {
    path: "package.json",
    language: "json",
    size: 248,
    binary: false,
    sensitive: false,
    content: JSON.stringify(
      {
        name: "taskpilot-sample",
        version: "0.1.0",
        scripts: {
          dev: "vite",
          test: "vitest run"
        },
        dependencies: {
          "@vitejs/plugin-react": "latest",
          react: "latest",
          "react-dom": "latest"
        }
      },
      null,
      2
    )
  },
  {
    path: "src/main.ts",
    language: "typescript",
    size: 295,
    binary: false,
    sensitive: false,
    content: `import { createApp } from "./server";
import { loadConfig } from "./config";

const config = loadConfig(process.env);
const app = createApp(config);

app.listen(config.port, () => {
  console.log(\`TaskPilot listening on \${config.port}\`);
});
`
  },
  {
    path: "src/config.ts",
    language: "typescript",
    size: 574,
    binary: false,
    sensitive: false,
    content: `export type AppConfig = {
  port: number;
  jwtSecret: string;
  allowSignup: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return {
    port: Number(env.PORT ?? 3000),
    jwtSecret: env.JWT_SECRET ?? "dev-secret-change-me",
    allowSignup: env.ALLOW_SIGNUP !== "false"
  };
}
`
  },
  {
    path: "src/server.ts",
    language: "typescript",
    size: 803,
    binary: false,
    sensitive: false,
    content: `import express from "express";
import { AppConfig } from "./config";
import { registerAuthRoutes } from "./auth/routes";
import { requireAuth } from "./auth/session";
import { listTasks, createTask } from "./tasks";

export function createApp(config: AppConfig) {
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, config);

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.get("/tasks", requireAuth(config), (_req, res) => {
    res.json({ tasks: listTasks() });
  });

  app.post("/tasks", requireAuth(config), (req, res) => {
    const task = createTask(String(req.body.title ?? ""));
    res.status(201).json({ task });
  });

  return app;
}
`
  },
  {
    path: "src/auth/routes.ts",
    language: "typescript",
    size: 729,
    binary: false,
    sensitive: false,
    content: `import type { Express } from "express";
import { AppConfig } from "../config";
import { createSessionToken } from "./session";
import { findUserByEmail, verifyPassword } from "./users";

export function registerAuthRoutes(app: Express, config: AppConfig) {
  app.post("/auth/login", async (req, res) => {
    const email = String(req.body.email ?? "").toLowerCase();
    const password = String(req.body.password ?? "");
    const user = findUserByEmail(email);

    if (!user || !(await verifyPassword(user, password))) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    res.json({ token: createSessionToken(user.id, config.jwtSecret), user });
  });
}
`
  },
  {
    path: "src/auth/session.ts",
    language: "typescript",
    size: 752,
    binary: false,
    sensitive: false,
    content: `import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { AppConfig } from "../config";

export function createSessionToken(userId: string, secret: string) {
  return jwt.sign({ sub: userId }, secret, { expiresIn: "15m" });
}

export function requireAuth(config: AppConfig): RequestHandler {
  return (req, res, next) => {
    const header = req.headers.authorization ?? "";
    const token = header.replace(/^Bearer\\s+/i, "");
    try {
      jwt.verify(token, config.jwtSecret);
      next();
    } catch {
      res.status(401).json({ error: "Authentication required" });
    }
  };
}
`
  },
  {
    path: "src/auth/users.ts",
    language: "typescript",
    size: 489,
    binary: false,
    sensitive: false,
    content: `import bcrypt from "bcryptjs";

export type User = {
  id: string;
  email: string;
  passwordHash: string;
};

const users: User[] = [
  { id: "u1", email: "owner@example.com", passwordHash: "$2a$10$sample" }
];

export function findUserByEmail(email: string) {
  return users.find((user) => user.email === email);
}

export function verifyPassword(user: User, password: string) {
  return bcrypt.compare(password, user.passwordHash);
}
`
  },
  {
    path: "src/tasks.ts",
    language: "typescript",
    size: 511,
    binary: false,
    sensitive: false,
    content: `export type Task = {
  id: string;
  title: string;
  done: boolean;
};

const tasks: Task[] = [
  { id: "t1", title: "Audit authentication flow", done: false }
];

export function listTasks() {
  return tasks;
}

export function createTask(title: string) {
  if (title.trim().length < 3) {
    throw new Error("Task title is too short");
  }
  const task = { id: crypto.randomUUID(), title, done: false };
  tasks.push(task);
  return task;
}
`
  },
  {
    path: "README.md",
    language: "markdown",
    size: 259,
    binary: false,
    sensitive: false,
    content: `# TaskPilot sample

TaskPilot is a tiny Express and TypeScript task API used as the default CodeMesh sample repository.

Interesting questions:

- How does request authentication work?
- Which files are involved when creating tasks?
- What changes would make the auth failure response easier to audit?
`
  }
];

export function buildSampleRepoFiles(projectId: string, updatedAt = new Date().toISOString()): RepoFile[] {
  return sampleRepositoryFiles.map((file) => ({
    ...file,
    projectId,
    updatedAt,
    size: file.content.length
  }));
}

export function inferLanguage(path: string): string {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".py")) return "python";
  return "text";
}

/** Maximum size retained as a repository file. Larger files are rejected before storage. */
export const MAX_REPOSITORY_FILE_BYTES = 10_000_000;

/** Maximum size sent through the semantic parser. The complete safe file remains in the workspace. */
export const MAX_INDEXABLE_FILE_BYTES = 2_000_000;

const ignoredRepositoryDirectories = new Set(["node_modules", ".git", ".hg", ".svn"]);
const sensitiveFileName = /^\.env(?:$|\.(?!example$|sample$|template$))/i;

export function isRepositoryTextFile(path: string, size: number): boolean {
  const normalized = normalizePath(path).toLowerCase();
  const segments = normalized.split("/").filter(Boolean);
  const fileName = segments.at(-1) ?? normalized;
  if (!normalized || normalized.endsWith("/") || size < 0 || size > MAX_REPOSITORY_FILE_BYTES) return false;
  if (segments.some((segment) => ignoredRepositoryDirectories.has(segment))) return false;
  if (fileName === ".ds_store" || sensitiveFileName.test(fileName) || /\.(?:pem|key|p12|pfx)$/i.test(fileName)) return false;
  return true;
}

export function isIndexableTextFile(path: string, size: number): boolean {
  return isRepositoryTextFile(path, size) && size <= MAX_INDEXABLE_FILE_BYTES;
}

export function indexRepository(projectId: string, commitSha: string, files: RepoFile[]): RepositoryIndex {
  const warnings: string[] = [];
  const graphNodes = new Map<string, GraphNode>();
  const graphEdges = new Map<string, GraphEdge>();
  const symbols: CodeSymbol[] = [];
  const chunks: CodeChunk[] = [];
  const pendingCalls: PendingCall[] = [];
  const exclusions = ignore().add(["**/node_modules/", "**/.git/", "**/.venv/", "**/venv/", "**/__pycache__/", "**/dist/", "**/build/", "**/coverage/", "**/.next/", "**/*.min.js", "**/*.map"]);
  const rules = files.filter((file) => file.projectId === projectId && /(^|\/)\.gitignore$/.test(file.path)).map((file) => ({ root: normalizePath(file.path).replace(/\.?gitignore$/, ""), rules: ignore().add(file.content) })).sort((a, b) => a.root.length - b.root.length);
  const uniqueFiles = new Map<string, RepoFile>();
  for (const file of files) {
    const safePath = normalizePath(file.path).replace(/^\.\//, "");
    if (file.projectId !== projectId || /(^|\/)\.\.(\/|$)|\0/.test(safePath) || /^[a-z]:/i.test(file.path) || !safePath) continue;
    if (file.binary || file.sensitive || !isRepositoryTextFile(safePath, file.size) || exclusions.ignores(safePath)) continue;
    let ignored = false;
    for (const rule of rules) {
      if (!safePath.startsWith(rule.root)) continue;
      const result = rule.rules.test(safePath.slice(rule.root.length));
      if (result.ignored) ignored = true;
      else if (result.unignored) ignored = false;
    }
    if (!ignored) uniqueFiles.set(safePath, { ...file, path: safePath });
  }
  const repositoryFiles = [...uniqueFiles.values()];
  const oversizedFiles = repositoryFiles.filter((file) => file.size > MAX_INDEXABLE_FILE_BYTES);
  if (oversizedFiles.length > 0) {
    warnings.push(`${oversizedFiles.length} large source file(s) remain available in the workspace but were omitted from semantic parsing.`);
  }
  const normalizedFiles = repositoryFiles
    .filter((file) => isIndexableTextFile(file.path, file.size))
    .map((file) => ({ ...file, path: normalizePath(file.path), language: file.language || inferLanguage(file.path) }));
  const paths = new Set(normalizedFiles.map((file) => file.path));

  graphNodes.set("repo", { id: "repo", label: "Repository", type: "repository" });

  for (const file of normalizedFiles) {
    const folderId = folderNodeId(file.path);
    if (folderId && !graphNodes.has(folderId)) {
      graphNodes.set(folderId, {
        id: folderId,
        label: folderId.replace(/^folder:/, "") || "/",
        type: "folder"
      });
      graphEdges.set(`repo->${folderId}`, {
        id: `repo->${folderId}`,
        source: "repo",
        target: folderId,
        type: "contains",
        verified: true
      });
    }

    const fileId = fileNodeId(file.path);
    graphNodes.set(fileId, {
      id: fileId,
      label: baseName(file.path),
      type: "file",
      filePath: file.path,
      language: file.language
    });
    graphEdges.set(`${folderId || "repo"}->${fileId}`, {
      id: `${folderId || "repo"}->${fileId}`,
      source: folderId || "repo",
      target: fileId,
      type: "contains",
      verified: true
    });

    if (file.language === "typescript" || file.language === "javascript") {
      const parsed = parseTypeScriptLikeFile(projectId, file, paths);
      for (const warning of parsed.warnings) warnings.push(warning);
      for (const edge of parsed.importEdges) {
        graphEdges.set(edge.id, edge);
      }
      for (const symbol of parsed.symbols) {
        symbols.push(symbol);
        graphNodes.set(symbol.id, {
          id: symbol.id,
          label: symbol.name,
          type: "symbol",
          filePath: symbol.filePath,
          symbolId: symbol.id,
          symbolKind: symbol.kind,
          range: symbol.range
        });
        graphEdges.set(`${fileId}->${symbol.id}`, {
          id: `${fileId}->${symbol.id}`,
          source: fileId,
          target: symbol.id,
          type: symbol.exported ? "exports" : "contains",
          verified: symbol.verified
        });
      }
      pendingCalls.push(...parsed.calls);
    } else if (file.language === "python") {
      const parsed = parsePythonFile(projectId, file, paths);
      for (const warning of parsed.warnings) warnings.push(warning);
      for (const edge of parsed.importEdges) graphEdges.set(edge.id, edge);
      for (const symbol of parsed.symbols) {
        symbols.push(symbol);
        graphNodes.set(symbol.id, {
          id: symbol.id,
          label: symbol.name,
          type: "symbol",
          filePath: symbol.filePath,
          symbolId: symbol.id,
          symbolKind: symbol.kind,
          range: symbol.range,
          language: "python"
        });
        graphEdges.set(`${fileId}->${symbol.id}`, {
          id: `${fileId}->${symbol.id}`,
          source: fileId,
          target: symbol.id,
          type: symbol.exported ? "exports" : "contains",
          verified: symbol.verified
        });
      }
      pendingCalls.push(...parsed.calls);
    }

    const fileSymbols = symbols.filter((symbol) => symbol.filePath === file.path);
    chunks.push(...chunkFile(projectId, commitSha, file, fileSymbols));
  }

  const symbolsByName = new Map<string, CodeSymbol[]>();
  for (const symbol of symbols) {
    const matches = symbolsByName.get(symbol.name) ?? [];
    matches.push(symbol);
    symbolsByName.set(symbol.name, matches);
  }
  for (const call of pendingCalls) {
    const candidates = symbolsByName.get(call.calleeName) ?? [];
    const target = candidates.find((symbol) => symbol.filePath === call.sourceFilePath) ?? candidates[0];
    if (!target) continue;
    const source = call.sourceSymbolId ?? fileNodeId(call.sourceFilePath);
    if (source === target.id) continue;
    const edgeId = `${source}=>${target.id}:calls`;
    graphEdges.set(edgeId, {
      id: edgeId,
      source,
      target: target.id,
      type: "references",
      verified: Boolean(call.direct) && candidates.length === 1 && target.filePath === call.sourceFilePath,
      label: "calls"
    });
  }

  return {
    projectId,
    commitSha,
    files: normalizedFiles,
    symbols,
    graph: {
      nodes: [...graphNodes.values()],
      edges: [...graphEdges.values()],
      generatedAt: new Date().toISOString(),
      warnings
    },
    chunks,
    languages: [...new Set(normalizedFiles.map((file) => file.language))].sort()
  };
}

function parseTypeScriptLikeFile(projectId: string, file: RepoFile, paths: Set<string>) {
  const sourceFile = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true);
  const symbols: CodeSymbol[] = [];
  const importEdges: GraphEdge[] = [];
  const warnings: string[] = [];
  const calls: PendingCall[] = [];
  const owners: string[] = [];

  const addSymbol = (
    node: ts.Node,
    name: string,
    kind: CodeSymbol["kind"],
    exported = hasExportModifier(node)
  ) => {
    const symbol: CodeSymbol = {
      id: symbolId(file.path, name, node.getStart(sourceFile)),
      projectId,
      filePath: file.path,
      name,
      kind,
      exported,
      range: rangeForNode(sourceFile, node),
      verified: true
    };
    symbols.push(symbol);
    return symbol;
  };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const target = resolveImport(file.path, node.moduleSpecifier.text, paths);
      if (target) {
        importEdges.push({
          id: `${fileNodeId(file.path)}=>${fileNodeId(target)}:${node.moduleSpecifier.text}`,
          source: fileNodeId(file.path),
          target: fileNodeId(target),
          type: "imports",
          verified: true,
          label: node.moduleSpecifier.text
        });
      } else if (node.moduleSpecifier.text.startsWith(".")) {
        warnings.push(`Unresolved import ${node.moduleSpecifier.text} from ${file.path}`);
      }
    }

    let owner: CodeSymbol | undefined;
    if (ts.isFunctionDeclaration(node) && node.name) {
      owner = addSymbol(node, node.name.text, "function");
    } else if (ts.isClassDeclaration(node) && node.name) {
      addSymbol(node, node.name.text, "class");
    } else if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      owner = addSymbol(node, node.name.text, "function");
    } else if (ts.isInterfaceDeclaration(node)) {
      addSymbol(node, node.name.text, "interface");
    } else if (ts.isTypeAliasDeclaration(node)) {
      addSymbol(node, node.name.text, "type");
    } else if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          const functionLike = declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer));
          const added = addSymbol(declaration, declaration.name.text, functionLike ? "function" : "variable", hasExportModifier(node));
          if (functionLike) owner = added;
        }
      }
    }

    if (ts.isCallExpression(node)) {
      const calleeName = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : "";
      if (calleeName) calls.push({ sourceFilePath: file.path, sourceSymbolId: owners.at(-1), calleeName, direct: ts.isIdentifier(node.expression) });
    }

    if (owner) owners.push(owner.id);
    ts.forEachChild(node, visit);
    if (owner) owners.pop();
  };

  try {
    ts.forEachChild(sourceFile, visit);
  } catch (error) {
    warnings.push(`Could not fully parse ${file.path}: ${(error as Error).message}`);
  }

  return { symbols, importEdges, warnings, calls };
}

function parsePythonFile(projectId: string, file: RepoFile, paths: Set<string>) {
  const lines = file.content.split(/\r?\n/);
  const symbols: CodeSymbol[] = [];
  const importEdges: GraphEdge[] = [];
  const warnings: string[] = [];
  const calls: PendingCall[] = [];
  const declarations: Array<{ symbol: CodeSymbol; indent: number; startIndex: number }> = [];

  try {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const declaration = line.match(/^(\s*)(?:async\s+)?(def|class)\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (declaration) {
        const indent = declaration[1]!.replace(/\t/g, "    ").length;
        const kind = declaration[2] === "class" ? "class" : "function";
        const name = declaration[3]!;
        let endIndex = lines.length - 1;
        for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
          const candidate = lines[cursor] ?? "";
          if (!candidate.trim()) continue;
          const candidateIndent = candidate.match(/^\s*/)?.[0].replace(/\t/g, "    ").length ?? 0;
          if (candidateIndent <= indent) {
            endIndex = cursor - 1;
            break;
          }
        }
        const symbol: CodeSymbol = {
          id: symbolId(file.path, name, index),
          projectId,
          filePath: file.path,
          name,
          kind,
          exported: !name.startsWith("_"),
          range: { startLine: index + 1, startColumn: indent + 1, endLine: Math.max(index + 1, endIndex + 1), endColumn: (lines[endIndex]?.length ?? 0) + 1 },
          verified: true
        };
        symbols.push(symbol);
        declarations.push({ symbol, indent, startIndex: index });
      }

      const importMatch = line.match(/^\s*(?:from\s+([.\w]+)\s+import|import\s+([.\w]+))/);
      const moduleName = importMatch?.[1] ?? importMatch?.[2];
      if (moduleName) {
        const target = resolvePythonImport(file.path, moduleName, paths);
        if (target) {
          importEdges.push({
            id: `${fileNodeId(file.path)}=>${fileNodeId(target)}:${moduleName}`,
            source: fileNodeId(file.path),
            target: fileNodeId(target),
            type: "imports",
            verified: true,
            label: moduleName
          });
        }
      }
    }

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const owner = [...declarations].reverse().find(({ symbol }) => index + 1 >= symbol.range.startLine && index + 1 <= symbol.range.endLine);
      for (const match of line.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
        const calleeName = match[1]!;
        if (["def", "class", "if", "for", "while", "print", "len", "range", "str", "int"].includes(calleeName)) continue;
        calls.push({ sourceFilePath: file.path, sourceSymbolId: owner?.symbol.id, calleeName });
      }
    }
  } catch (error) {
    warnings.push(`Could not fully parse ${file.path}: ${(error as Error).message}`);
  }

  return { symbols, importEdges, warnings, calls };
}

function resolvePythonImport(fromPath: string, moduleName: string, paths: Set<string>) {
  const fromParts = normalizePath(fromPath).split("/");
  fromParts.pop();
  const cleanModule = moduleName.replace(/^\.+/, "").replace(/\./g, "/");
  const local = collapseDots([...fromParts, cleanModule].join("/"));
  const candidates = [`${cleanModule}.py`, `${cleanModule}/__init__.py`, `${local}.py`, `${local}/__init__.py`];
  return candidates.find((candidate) => paths.has(candidate)) ?? null;
}

function chunkFile(projectId: string, commitSha: string, file: RepoFile, symbols: CodeSymbol[]): CodeChunk[] {
  const lines = file.content.split(/\r?\n/);
  const chunks: CodeChunk[] = [];
  const seen = new Set<string>();
  const append = (start: number, end: number, symbol?: CodeSymbol) => {
    for (let cursor = start; cursor <= end; cursor += 100) {
      const last = Math.min(end, cursor + 99);
      let content = lines.slice(cursor - 1, last).join("\n");
      if (!content.trim()) continue;
      // Bounds describe the actual prefix delivered, never an invented truncation comment.
      content = content.slice(0, 24_000);
      const delivered = content.split("\n");
      const key = `${cursor}:${content}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chunks.push({
        id: chunkId(file.path, symbol?.name ?? "module", chunks.length), projectId, commitSha,
        filePath: file.path, language: file.language, symbolId: symbol?.id, symbolName: symbol?.name,
        content, range: { startLine: cursor, startColumn: 1, endLine: cursor + delivered.length - 1, endColumn: (delivered.at(-1)?.length ?? 0) + 1 },
        tokenCount: Math.ceil(content.length / 4), embeddingModel: "none-lexical-structural", embeddingDimensions: 0, sourceRevision: "committed"
      });
    }
  };
  for (const symbol of symbols) {
    const nestedVariable = symbol.kind === "variable" && symbols.some((parent) => parent.id !== symbol.id && ["function", "class"].includes(parent.kind) && parent.range.startLine <= symbol.range.startLine && parent.range.endLine >= symbol.range.endLine);
    if (!nestedVariable) append(symbol.range.startLine, symbol.range.endLine, symbol);
  }
  // Bounded module windows preserve imports and top-level execution alongside syntax-aware definitions.
  append(1, lines.length);
  return chunks;
}

export function searchRepository(index: RepositoryIndex, query: string, mode: RetrievalMode, limit = 6): SearchResult {
  return retrieveGroundedEvidence(index, query, mode, limit);
}

export function buildGraphOntology(index: RepositoryIndex): GraphOntology {
  const nodeFacts: Record<GraphNode["type"], string[]> = {
    repository: ["projectId", "commitSha"],
    folder: ["path", "parent"],
    file: ["path", "language", "sensitivity"],
    symbol: ["name", "kind", "source range", "file"]
  };
  const relationshipMeaning: Record<GraphEdge["type"], string> = {
    contains: "Repository, folder, file, and symbol ownership.",
    imports: "A source file imports another indexed file.",
    exports: "A file exposes an indexed symbol.",
    references: "A source symbol or file references another indexed entity."
  };
  const nodeCounts = new Map<GraphNode["type"], number>();
  const edgeCounts = new Map<GraphEdge["type"], number>();
  const languageCounts = new Map<string, number>();
  index.graph.nodes.forEach((node) => nodeCounts.set(node.type, (nodeCounts.get(node.type) ?? 0) + 1));
  index.graph.edges.forEach((edge) => edgeCounts.set(edge.type, (edgeCounts.get(edge.type) ?? 0) + 1));
  index.files.forEach((file) => languageCounts.set(file.language, (languageCounts.get(file.language) ?? 0) + 1));
  return {
    repository: { projectId: index.projectId, commitSha: index.commitSha, files: index.files.length, symbols: index.symbols.length },
    nodeKinds: (["repository", "folder", "file", "symbol"] as GraphNode["type"][]).map((kind) => ({ kind, count: nodeCounts.get(kind) ?? 0, facts: nodeFacts[kind] })),
    relationshipKinds: (["contains", "imports", "exports", "references"] as GraphEdge["type"][]).map((kind) => ({ kind, count: edgeCounts.get(kind) ?? 0, meaning: relationshipMeaning[kind] })),
    languages: [...languageCounts.entries()].map(([language, files]) => ({ language, files })).sort((a, b) => b.files - a.files || a.language.localeCompare(b.language)),
    queryHints: [
      "Use code_context for a natural-language question.",
      "Use search_code for an exact identifier or string.",
      "Use query_context to walk imports, references, exports, or containment.",
      "Use fetch_code only after a source range has been identified."
    ]
  };
}

export function searchExactCode(index: RepositoryIndex, query: string, limit = 20): ExactCodeMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const matches: ExactCodeMatch[] = [];
  for (const file of index.files.filter((candidate) => !candidate.sensitive)) {
    const lines = file.content.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex] ?? "";
      if (!line.toLowerCase().includes(needle)) continue;
      const excerptStart = Math.max(0, lineIndex - 1);
      const excerptEnd = Math.min(lines.length, lineIndex + 2);
      matches.push({
        filePath: file.path,
        range: { startLine: lineIndex + 1, startColumn: 1, endLine: lineIndex + 1, endColumn: line.length + 1 },
        excerpt: lines.slice(excerptStart, excerptEnd).join("\n")
      });
      if (matches.length >= Math.max(1, Math.min(limit, 100))) return matches;
    }
  }
  return matches;
}

export function fetchCodeSpan(index: RepositoryIndex, filePath: string, startLine = 1, endLine?: number): CodeSpan | null {
  const normalized = normalizePath(filePath);
  const file = index.files.find((candidate) => candidate.path === normalized && !candidate.sensitive);
  if (!file) return null;
  const lines = file.content.split(/\r?\n/);
  const start = Math.max(1, Math.min(Math.trunc(startLine), Math.max(1, lines.length)));
  const requestedEnd = endLine === undefined ? start + 79 : Math.trunc(endLine);
  const end = Math.max(start, Math.min(requestedEnd, start + 249, Math.max(1, lines.length)));
  return {
    filePath: file.path,
    language: file.language,
    range: { startLine: start, startColumn: 1, endLine: end, endColumn: (lines[end - 1]?.length ?? 0) + 1 },
    content: lines.slice(start - 1, end).join("\n"),
    commitSha: index.commitSha
  };
}

export function queryRepositoryContext(index: RepositoryIndex, query: GraphContextQuery): GraphContextResult {
  const selector = query.selector.trim().toLowerCase();
  const relationship = query.relationship ?? "all";
  const direction = query.direction ?? "both";
  const maxDepth = Math.max(1, Math.min(Math.trunc(query.depth ?? 1), 4));
  const limit = Math.max(1, Math.min(Math.trunc(query.limit ?? 30), 100));
  const ranked = index.graph.nodes
    .map((node) => {
      const id = node.id.toLowerCase();
      const label = node.label.toLowerCase();
      const path = (node.filePath ?? "").toLowerCase();
      const score = id === selector || path === selector ? 4 : label === selector ? 3 : id.includes(selector) || path.includes(selector) ? 2 : label.includes(selector) ? 1 : 0;
      return { node, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const roots = ranked.map((item) => item.node);
  const depthById = new Map(roots.map((node) => [node.id, 0]));
  const selectedEdges = new Map<string, GraphEdge>();
  const queue = roots.map((node) => node.id);
  while (queue.length && depthById.size < limit) {
    const current = queue.shift()!;
    const currentDepth = depthById.get(current) ?? 0;
    if (currentDepth >= maxDepth) continue;
    const candidates = index.graph.edges.filter((edge) => {
      if (relationship !== "all" && edge.type !== relationship) return false;
      return direction === "incoming" ? edge.target === current : direction === "outgoing" ? edge.source === current : edge.source === current || edge.target === current;
    });
    for (const edge of candidates) {
      selectedEdges.set(edge.id, edge);
      const next = edge.source === current ? edge.target : edge.source;
      if (!depthById.has(next)) {
        depthById.set(next, currentDepth + 1);
        queue.push(next);
        if (depthById.size >= limit) break;
      }
    }
  }
  const nodes = index.graph.nodes
    .filter((node) => depthById.has(node.id))
    .map((node) => ({ ...node, depth: depthById.get(node.id)! }))
    .sort((a, b) => a.depth - b.depth || a.label.localeCompare(b.label));
  return {
    selector: query.selector,
    roots,
    nodes,
    edges: [...selectedEdges.values()],
    sourceSpans: nodes.filter((node) => node.filePath).map((node) => ({ filePath: node.filePath!, range: node.range, label: node.label })),
    truncated: depthById.size >= limit
  };
}

export function buildContextObservatory(index: RepositoryIndex, retrievals: RetrievalRecord[], workspaceDocs: WorkspaceDoc[] = []): ContextObservatory {
  const repositoryTokens = index.files.filter((file) => !file.sensitive).reduce((total, file) => total + roughTokenCount(file.content), 0);
  const chunkById = new Map(index.chunks.map((chunk) => [chunk.id, chunk]));
  const traces = retrievals.slice(0, 100).map((retrieval) => {
    const chunks = retrieval.chunkIds.map((id) => chunkById.get(id)).filter((chunk): chunk is CodeChunk => Boolean(chunk));
    const deliveredTokens = Math.max(0, retrieval.contextTokens || chunks.reduce((total, chunk) => total + chunk.tokenCount, 0));
    const baselineTokens = Math.max(repositoryTokens, deliveredTokens);
    const avoidedTokens = Math.max(0, baselineTokens - deliveredTokens);
    return {
      id: retrieval.id,
      question: retrieval.question,
      mode: retrieval.mode,
      sourceRevision: retrieval.sourceRevision,
      createdAt: retrieval.createdAt,
      baselineTokens,
      deliveredTokens,
      avoidedTokens,
      reductionPercentage: baselineTokens ? Math.round((avoidedTokens / baselineTokens) * 1000) / 10 : 0,
      retrievalLatencyMs: retrieval.retrievalLatencyMs,
      generationLatencyMs: retrieval.generationLatencyMs,
      spans: chunks.map((chunk) => ({ filePath: chunk.filePath, range: chunk.range, symbolName: chunk.symbolName, tokenCount: chunk.tokenCount }))
    };
  });
  const deliveredTokens = traces.reduce((total, trace) => total + trace.deliveredTokens, 0);
  const estimatedBaselineTokens = traces.reduce((total, trace) => total + trace.baselineTokens, 0);
  const avoidedTokens = Math.max(0, estimatedBaselineTokens - deliveredTokens);
  const baseByPath = new Map(index.files.map((file) => [file.path, file.content]));
  const changedPaths = workspaceDocs.filter((doc) => baseByPath.get(doc.path) !== doc.content).map((doc) => doc.path).sort();
  const manifestInput = [...index.files]
    .filter((file) => !file.sensitive)
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => `${file.path}:${hashContent(file.content)}`)
    .join("|");
  return {
    summary: {
      questions: traces.length,
      repositoryTokens,
      deliveredTokens,
      estimatedBaselineTokens,
      avoidedTokens,
      reductionPercentage: traces.length && estimatedBaselineTokens ? Math.round((avoidedTokens / estimatedBaselineTokens) * 1000) / 10 : null,
      averageRetrievalLatencyMs: averageNumber(traces.map((trace) => trace.retrievalLatencyMs)),
      averageGenerationLatencyMs: averageNumber(traces.map((trace) => trace.generationLatencyMs))
    },
    freshness: {
      status: changedPaths.length ? "workspace-ahead" : "synced",
      manifest: hashContent(manifestInput),
      commitSha: index.commitSha,
      indexedAt: index.graph.generatedAt,
      changedFiles: changedPaths.length,
      changedPaths
    },
    traces
  };
}

export function hashContent(content: string): string {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function applyWholeFilePatch(baseContent: string, currentContent: string, proposedContent: string, baseHash: string) {
  if (hashContent(baseContent) !== baseHash) {
    return { ok: false as const, reason: "The patch base hash does not match the recorded base content." };
  }
  if (currentContent !== baseContent) {
    return { ok: false as const, reason: "The workspace file changed after the patch was proposed." };
  }
  return { ok: true as const, content: proposedContent };
}

export function analyzeRepository(index: RepositoryIndex): RepositoryHealth {
  const issues: RepositoryHealthIssue[] = [];
  const testFiles = index.files.filter((file) => /(^|\/)(__tests__\/|test[s]?\/)|\.(test|spec)\.[^.]+$/i.test(file.path));
  const sourceFiles = index.files.filter((file) => ["typescript", "javascript", "python"].includes(file.language));
  let sourceLines = 0;

  for (const file of sourceFiles) {
    const lines = file.content.split(/\r?\n/);
    sourceLines += lines.length;
    if (lines.length > 350) {
      issues.push({
        id: `large:${file.path}`,
        severity: lines.length > 700 ? "critical" : "warning",
        category: "maintainability",
        title: "Large source file",
        detail: `${file.path} contains ${lines.length} lines and may be difficult to review safely.`,
        filePath: file.path
      });
    }
    lines.forEach((line, indexInFile) => {
      if (/\b(TODO|FIXME|HACK)\b/i.test(line)) {
        issues.push({
          id: `todo:${file.path}:${indexInFile + 1}`,
          severity: "info",
          category: "maintainability",
          title: "Outstanding code note",
          detail: line.trim().slice(0, 180),
          filePath: file.path,
          line: indexInFile + 1
        });
      }
      if (/\beval\s*\(|dangerouslySetInnerHTML|child_process\.(exec|spawn)\s*\(/.test(line)) {
        issues.push({
          id: `security:${file.path}:${indexInFile + 1}`,
          severity: "critical",
          category: "security",
          title: "Review potentially unsafe execution",
          detail: "This line uses an execution or HTML injection API that requires explicit input validation.",
          filePath: file.path,
          line: indexInFile + 1
        });
      }
      if (/(api[_-]?key|password|secret)\s*[:=]\s*["'][^"']{8,}["']/i.test(line) && !/process\.env|os\.environ|getenv/.test(line)) {
        issues.push({
          id: `secret:${file.path}:${indexInFile + 1}`,
          severity: "critical",
          category: "security",
          title: "Possible hard-coded credential",
          detail: "Move credentials to a secret manager or environment configuration.",
          filePath: file.path,
          line: indexInFile + 1
        });
      }
    });
  }

  if (sourceFiles.length > 0 && testFiles.length === 0) {
    issues.push({
      id: "testing:none",
      severity: "warning",
      category: "testing",
      title: "No test files detected",
      detail: "Add focused unit tests for exported functions and integration tests for repository entry points."
    });
  }
  index.graph.warnings.slice(0, 20).forEach((warning, indexInWarnings) => {
    issues.push({ id: `graph:${indexInWarnings}`, severity: "info", category: "structure", title: "Unresolved graph relationship", detail: warning });
  });

  const critical = issues.filter((issue) => issue.severity === "critical").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const score = Math.max(0, 100 - critical * 18 - warnings * 7 - Math.min(15, index.graph.warnings.length * 2));
  const coverageEstimate = sourceFiles.length === 0 ? 0 : Math.min(100, Math.round((testFiles.length / sourceFiles.length) * 180));
  const suggestedTests = buildTestSuggestions(index, testFiles.length);

  return {
    score,
    files: index.files.length,
    sourceLines,
    symbols: index.symbols.length,
    relationships: index.graph.edges.length,
    testFiles: testFiles.length,
    coverageEstimate,
    issues: issues.slice(0, 60),
    suggestedTests
  };
}

export function analyzeImpact(index: RepositoryIndex, nodeId: string): ImpactAnalysis | null {
  const node = index.graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return null;
  const incomingIds = new Set(index.graph.edges.filter((edge) => edge.target === nodeId).map((edge) => edge.source));
  const outgoingIds = new Set(index.graph.edges.filter((edge) => edge.source === nodeId).map((edge) => edge.target));
  const incoming = index.graph.nodes.filter((candidate) => incomingIds.has(candidate.id));
  const outgoing = index.graph.nodes.filter((candidate) => outgoingIds.has(candidate.id));
  const affectedFiles = [...new Set([node, ...incoming, ...outgoing].map((candidate) => candidate.filePath).filter((value): value is string => Boolean(value)))];
  const reach = incoming.length + outgoing.length;
  return { node, incoming, outgoing, affectedFiles, risk: reach >= 8 ? "high" : reach >= 3 ? "medium" : "low" };
}

export function analyzeArchitecturePolicies(index: RepositoryIndex): ArchitecturePolicyResult[] {
  const nodeById = new Map(index.graph.nodes.map((node) => [node.id, node]));
  const imports = index.graph.edges.filter((edge) => edge.type === "imports");
  const cycles = findImportCycles(index.graph);
  const uiServerCrossings = imports.filter((edge) => {
    const source = nodeById.get(edge.source)?.filePath ?? "";
    const target = nodeById.get(edge.target)?.filePath ?? "";
    return /(^|\/)(components|pages|ui|client)(\/|$)/i.test(source) && /(^|\/)(db|database|store|repositories)(\/|$)/i.test(target);
  });
  const highFanOut = index.graph.nodes
    .map((node) => ({ node, count: index.graph.edges.filter((edge) => edge.source === node.id).length }))
    .filter(({ node, count }) => node.type === "file" && count > 8);
  const authFiles = index.files.filter((file) => /auth|session|permission|login/i.test(file.path));
  const authEvidence = authFiles.filter((file) => /verify|requireAuth|authori[sz]|permission|jwt\./i.test(file.content));
  const environmentLeaks = index.files.filter((file) => !/config|environment|settings/i.test(file.path) && /(process\.env\.[A-Z_]+|os\.environ\[|getenv\()/i.test(file.content));

  return [
    {
      id: "imports:no-cycles",
      title: "Acyclic module dependencies",
      rule: "Import relationships should not form circular dependency chains.",
      status: cycles.length ? "violation" : "pass",
      detail: cycles.length ? `${cycles.length} circular import chain${cycles.length === 1 ? "" : "s"} require review.` : "No circular file-import chain was found in the indexed graph.",
      evidenceFiles: [...new Set(cycles.flat())].slice(0, 12)
    },
    {
      id: "layers:ui-storage",
      title: "UI and persistence separation",
      rule: "UI modules should access persistence through an application or service boundary.",
      status: uiServerCrossings.length ? "violation" : "pass",
      detail: uiServerCrossings.length ? `${uiServerCrossings.length} direct UI-to-persistence import${uiServerCrossings.length === 1 ? "" : "s"} detected.` : "No direct UI-to-persistence import was detected.",
      evidenceFiles: uiServerCrossings.flatMap((edge) => [nodeById.get(edge.source)?.filePath, nodeById.get(edge.target)?.filePath]).filter((value): value is string => Boolean(value)).slice(0, 12)
    },
    {
      id: "boundaries:auth",
      title: "Explicit authentication boundary",
      rule: "Authentication modules should expose visible verification or authorization checks.",
      status: authFiles.length === 0 ? "warning" : authEvidence.length ? "pass" : "violation",
      detail: authFiles.length === 0 ? "No authentication module was identified." : authEvidence.length ? `Verification evidence appears in ${authEvidence.length} authentication-related file${authEvidence.length === 1 ? "" : "s"}.` : "Authentication files were found without an explicit verification signal.",
      evidenceFiles: (authEvidence.length ? authEvidence : authFiles).map((file) => file.path).slice(0, 12)
    },
    {
      id: "coupling:fan-out",
      title: "Controlled module fan-out",
      rule: "A source file should not directly coordinate an excessive number of graph relationships.",
      status: highFanOut.length ? "warning" : "pass",
      detail: highFanOut.length ? `${highFanOut.length} highly connected file${highFanOut.length === 1 ? "" : "s"} may be acting as a change hotspot.` : "File fan-out remains within the default review threshold.",
      evidenceFiles: highFanOut.map(({ node }) => node.filePath).filter((value): value is string => Boolean(value)).slice(0, 12)
    },
    {
      id: "config:environment",
      title: "Centralized environment access",
      rule: "Environment variables should be read through configuration modules.",
      status: environmentLeaks.length ? "warning" : "pass",
      detail: environmentLeaks.length ? `${environmentLeaks.length} non-configuration file${environmentLeaks.length === 1 ? "" : "s"} read environment values directly.` : "Environment access is isolated to configuration-oriented modules.",
      evidenceFiles: environmentLeaks.map((file) => file.path).slice(0, 12)
    }
  ];
}

export function traceSecurityFlows(index: RepositoryIndex): SecurityFlow[] {
  const candidates = index.graph.nodes.filter((node) => node.type === "symbol");
  const sources = candidates.filter((node) => /route|handler|controller|createApp|register|input|request/i.test(`${node.label} ${node.filePath ?? ""}`));
  const sinks = candidates.filter((node) => /requireAuth|verify|password|token|session|authori[sz]|secret|sanitize|validate/i.test(`${node.label} ${node.filePath ?? ""}`));
  const flows: SecurityFlow[] = [];
  for (const source of sources) {
    for (const sink of sinks) {
      if (source.id === sink.id) continue;
      const nodeIds = shortestGraphPath(index.graph, source.id, sink.id, 7);
      if (!nodeIds) continue;
      const pathNodes = nodeIds.map((id) => index.graph.nodes.find((node) => node.id === id)).filter((node): node is GraphNode => Boolean(node));
      const filePaths = [...new Set(pathNodes.map((node) => node.filePath).filter((value): value is string => Boolean(value)))];
      const authorizationSink = /requireAuth|authori[sz]|verify/i.test(sink.label);
      flows.push({
        id: `${source.id}->${sink.id}`,
        title: `${source.label} to ${sink.label}`,
        severity: authorizationSink ? "info" : /password|secret/i.test(sink.label) ? "warning" : "info",
        source: source.label,
        sink: sink.label,
        nodeIds,
        filePaths,
        detail: authorizationSink ? "The graph exposes an explicit route-to-verification path." : "Review validation, error handling, and secret exposure along this path."
      });
    }
  }
  if (flows.length === 0) {
    for (const file of index.files.filter((candidate) => /auth|session|password|token/i.test(`${candidate.path} ${candidate.content}`)).slice(0, 4)) {
      flows.push({
        id: `security-file:${file.path}`,
        title: `Review ${file.path}`,
        severity: "warning",
        source: file.path,
        sink: "security boundary",
        nodeIds: [fileNodeId(file.path)],
        filePaths: [file.path],
        detail: "A security-sensitive file was found, but the current graph does not expose a complete directed path."
      });
    }
  }
  return uniqueBy(flows, (flow) => flow.filePaths.join("|")).slice(0, 8);
}

export function analyzeDependencyUpgrades(index: RepositoryIndex): DependencyUpgradeItem[] {
  const items: DependencyUpgradeItem[] = [];
  for (const manifest of index.files.filter((file) => file.path.endsWith("package.json"))) {
    try {
      const parsed = JSON.parse(manifest.content) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
      for (const [name, rawVersion] of Object.entries({ ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) })) {
        if (typeof rawVersion !== "string") continue;
        const usageFiles = index.files
          .filter((file) => file.path !== manifest.path && (file.content.includes(`from \"${name}`) || file.content.includes(`from '${name}`) || file.content.includes(`require(\"${name}`) || file.content.includes(`require('${name}`)))
          .map((file) => file.path);
        const unbounded = rawVersion === "latest" || rawVersion === "*" || /^(git|https?|file):/i.test(rawVersion);
        const earlyMajor = /^[~^]?0\./.test(rawVersion);
        const risk = unbounded ? "high" : earlyMajor || usageFiles.length >= 5 ? "medium" : "low";
        items.push({
          name,
          currentVersion: rawVersion,
          manifest: manifest.path,
          usageFiles,
          risk,
          reason: unbounded ? "The version is unbounded or points outside the package registry." : earlyMajor ? "Pre-1.0 releases may introduce breaking changes in minor versions." : usageFiles.length >= 5 ? "The package has a broad repository usage surface." : "The declared range and observed usage surface are comparatively contained.",
          recommendedAction: unbounded ? "Pin a reviewed version, regenerate the lockfile, and run the affected test plan." : `Review release notes, update in a branch, and verify ${usageFiles.length || "manifest"} affected area${usageFiles.length === 1 ? "" : "s"}.`
        });
      }
    } catch {
      items.push({ name: "Invalid manifest", currentVersion: "unknown", manifest: manifest.path, usageFiles: [], risk: "high", reason: "The dependency manifest could not be parsed.", recommendedAction: "Repair the JSON before planning dependency upgrades." });
    }
  }
  return items.sort((a, b) => riskWeight(b.risk) - riskWeight(a.risk) || b.usageFiles.length - a.usageFiles.length);
}

export function buildTestPlans(index: RepositoryIndex): TestPlan[] {
  const testFiles = index.files.filter((file) => /(^|\/)(__tests__|tests?)(\/|$)|\.(test|spec)\.[^.]+$/i.test(file.path));
  const command = detectTestCommand(index.files);
  return index.symbols
    .filter((symbol) => symbol.exported && ["function", "class"].includes(symbol.kind))
    .map((symbol) => {
      const matchingTest = testFiles.find((file) => file.content.includes(symbol.name) || baseName(file.path).includes(baseName(symbol.filePath).split(".")[0]!));
      const pathWithoutExtension = symbol.filePath.replace(/\.[^.]+$/, "");
      const cases = [`returns the expected result for a valid ${symbol.name} input`, `handles missing or malformed input without leaking internal state`];
      if (/auth|session|password|token|permission/i.test(`${symbol.name} ${symbol.filePath}`)) cases.push("rejects unauthorized or expired credentials");
      if (/create|update|delete|save|write/i.test(symbol.name)) cases.push("preserves state when the operation fails");
      return {
        id: `test-plan:${symbol.id}`,
        targetNodeId: symbol.id,
        target: symbol.name,
        filePath: symbol.filePath,
        testFilePath: matchingTest?.path ?? `${pathWithoutExtension}.test.${symbol.filePath.split(".").pop() ?? "ts"}`,
        command,
        cases
      };
    })
    .sort((a, b) => Number(/auth|session|password/i.test(`${b.target} ${b.filePath}`)) - Number(/auth|session|password/i.test(`${a.target} ${a.filePath}`)))
    .slice(0, 8);
}

export function interpretGraphCommand(index: RepositoryIndex, command: string): GraphCommandResult {
  const normalized = command.trim().toLowerCase();
  const intent: GraphCommandResult["intent"] = /auth|login|session|password|permission/.test(normalized)
    ? "authentication"
    : /caller|who calls|incoming|used by/.test(normalized)
      ? "callers"
      : /depend|import|package|library/.test(normalized)
        ? "dependencies"
        : /test|coverage|spec/.test(normalized)
          ? "tests"
          : /entry|start|bootstrap|main/.test(normalized)
            ? "entrypoints"
            : "search";
  const terms = tokenize(command);
  const scored = index.graph.nodes.map((node) => {
    const text = `${node.label} ${node.filePath ?? ""}`.toLowerCase();
    let score = terms.reduce((total, term) => total + (text.includes(term) ? 3 : 0), 0);
    if (intent === "authentication" && /auth|session|password|token|verify|login/.test(text)) score += 5;
    if (intent === "tests" && /test|spec/.test(text)) score += 5;
    if (intent === "entrypoints" && /(^|\/)(main|index|server|app)\.[^.]+$/.test(node.filePath ?? "")) score += 5;
    if (intent === "dependencies" && node.type === "file" && index.graph.edges.some((edge) => edge.source === node.id && edge.type === "imports")) score += 2;
    return { node, score };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);
  let nodes = scored.slice(0, 10).map(({ node }) => node);
  if (intent === "callers" && nodes[0]) {
    const incomingIds = new Set(index.graph.edges.filter((edge) => edge.target === nodes[0]!.id).map((edge) => edge.source));
    nodes = [nodes[0], ...index.graph.nodes.filter((node) => incomingIds.has(node.id))].slice(0, 10);
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  const connectingEdges = index.graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  return {
    command,
    intent,
    summary: nodes.length ? `Focused ${nodes.length} graph node${nodes.length === 1 ? "" : "s"} for the ${intent} intent.` : "No graph node matched this command. Try a symbol, file, route, or architectural concept.",
    nodes,
    connectingEdges
  };
}

export function analyzeRepositoryHotspots(index: RepositoryIndex): RepositoryHotspot[] {
  const health = analyzeRepository(index);
  return index.files.map((file) => {
    const id = fileNodeId(file.path);
    const relationships = index.graph.edges.filter((edge) => edge.source === id || edge.target === id).length;
    const sourceLines = file.content.split(/\r?\n/).length;
    const findings = health.issues.filter((issue) => issue.filePath === file.path).length;
    const score = Math.min(100, relationships * 7 + Math.min(35, Math.round(sourceLines / 12)) + findings * 12);
    const risk: RepositoryHotspot["risk"] = score >= 70 ? "high" : score >= 38 ? "medium" : "low";
    return { filePath: file.path, score, relationships, sourceLines, findings, risk };
  }).sort((a, b) => b.score - a.score).slice(0, 10);
}

export function buildOnboardingJourney(index: RepositoryIndex): OnboardingStep[] {
  const hotspots = analyzeRepositoryHotspots(index);
  const entry = index.files.find((file) => /(^|\/)(main|index|server|app)\.(ts|tsx|js|jsx|py)$/i.test(file.path)) ?? index.files[0];
  const config = index.files.find((file) => /config|environment|settings/i.test(file.path));
  const security = index.files.find((file) => /auth|session|permission|login/i.test(file.path));
  const domain = hotspots.map((hotspot) => index.files.find((file) => file.path === hotspot.filePath)).find((file) => file && file.path !== entry?.path && file.path !== security?.path);
  const test = index.files.find((file) => /(^|\/)(__tests__|tests?)(\/|$)|\.(test|spec)\.[^.]+$/i.test(file.path));
  const candidates: Array<OnboardingStep | undefined> = [
    entry && { id: "start", title: "Start at the runtime entry point", detail: "Understand how the application starts and which modules it composes.", filePath: entry.path, line: 1, category: "start" },
    config && { id: "config", title: "Review configuration boundaries", detail: "Identify required environment values, defaults, and runtime assumptions.", filePath: config.path, line: 1, category: "architecture" },
    security && { id: "security", title: "Trace authentication and authorization", detail: "Follow the repository's trust boundary before changing protected behavior.", filePath: security.path, line: 1, category: "security" },
    domain && { id: "domain", title: "Study the highest-impact domain module", detail: "This file has a comparatively large relationship and change surface.", filePath: domain.path, line: 1, category: "domain" },
    test ? { id: "tests", title: "Learn the verification strategy", detail: "Read existing tests and the conventions used to prove behavior.", filePath: test.path, line: 1, category: "testing" } : entry && { id: "tests-gap", title: "Plan the first verification test", detail: "No test file was detected; use the Test Lab to create a focused starting plan.", filePath: entry.path, line: 1, category: "testing" }
  ];
  return uniqueBy(candidates.filter((step): step is OnboardingStep => Boolean(step)), (step) => step.filePath).slice(0, 5);
}

export function buildReviewCouncil(index: RepositoryIndex): ReviewAgentResult[] {
  const health = analyzeRepository(index);
  const policies = analyzeArchitecturePolicies(index);
  const flows = traceSecurityFlows(index);
  const dependencies = analyzeDependencyUpgrades(index);
  const architectureFindings = policies.filter((policy) => policy.status !== "pass");
  const securityFindings = health.issues.filter((issue) => issue.category === "security");
  const testingFindings = health.issues.filter((issue) => issue.category === "testing");
  const maintenanceFindings = health.issues.filter((issue) => issue.category === "maintainability");
  return [
    {
      id: "architecture",
      name: "Architecture reviewer",
      verdict: architectureFindings.some((finding) => finding.status === "violation") ? "block" : architectureFindings.length ? "review" : "pass",
      summary: `${policies.length - architectureFindings.length}/${policies.length} default architecture policies pass.`,
      findings: architectureFindings.slice(0, 4).map((finding) => ({ title: finding.title, detail: finding.detail, filePath: finding.evidenceFiles[0] }))
    },
    {
      id: "security",
      name: "Security reviewer",
      verdict: securityFindings.some((finding) => finding.severity === "critical") ? "block" : securityFindings.length || flows.some((flow) => flow.severity === "warning") ? "review" : "pass",
      summary: `${flows.length} security path${flows.length === 1 ? "" : "s"} traced and ${securityFindings.length} static finding${securityFindings.length === 1 ? "" : "s"} recorded.`,
      findings: securityFindings.slice(0, 4).map((finding) => ({ title: finding.title, detail: finding.detail, filePath: finding.filePath, line: finding.line }))
    },
    {
      id: "testing",
      name: "Test reviewer",
      verdict: health.testFiles === 0 ? "block" : health.coverageEstimate < 50 ? "review" : "pass",
      summary: `${health.testFiles} test file${health.testFiles === 1 ? "" : "s"} detected with a ${health.coverageEstimate}% structural coverage estimate.`,
      findings: testingFindings.slice(0, 4).map((finding) => ({ title: finding.title, detail: finding.detail, filePath: finding.filePath, line: finding.line }))
    },
    {
      id: "maintainability",
      name: "Maintainability reviewer",
      verdict: maintenanceFindings.some((finding) => finding.severity === "critical") ? "block" : maintenanceFindings.length || dependencies.some((dependency) => dependency.risk === "high") ? "review" : "pass",
      summary: `${maintenanceFindings.length} maintainability finding${maintenanceFindings.length === 1 ? "" : "s"}; ${dependencies.filter((dependency) => dependency.risk === "high").length} high-risk dependency declaration${dependencies.filter((dependency) => dependency.risk === "high").length === 1 ? "" : "s"}.`,
      findings: maintenanceFindings.slice(0, 4).map((finding) => ({ title: finding.title, detail: finding.detail, filePath: finding.filePath, line: finding.line }))
    }
  ];
}

export function buildInvariantLedger(index: RepositoryIndex): InvariantLedger {
  const contracts: RepositoryInvariant[] = [];
  const sourceFiles = index.files.filter((file) => !file.binary && !file.sensitive && /\.[cm]?[jt]sx?$/i.test(file.path) && isIndexableTextFile(file.path, file.size));
  const isTest = (path: string) => /(^|\/)(__tests__|tests?)(\/|$)|\.(test|spec)\.[^.]+$/i.test(path);
  const signals = new Map(sourceFiles.map((file) => [file.path, extractInvariantSignals(file.path, file.content, isTest(file.path))]));
  const testFiles = sourceFiles.filter((file) => isTest(file.path) && signals.get(file.path)!.some((signal) => signal.kind === "test"));
  const categoryCounts = new Map<InvariantCategory, number>();
  const categoryLimits: Record<InvariantCategory, number> = { access: 8, configuration: 8, interface: 12, data: 8, resilience: 8, verification: 8 };

  const hasTestEvidence = (filePath: string, token: string) => {
    const stem = baseName(filePath).replace(/\.[^.]+$/, "");
    return testFiles.some((file) => signals.get(file.path)!.some((signal) => signal.kind === "reference" && signal.name === token) || baseName(file.path).replace(/\.(test|spec)\.[^.]+$/, "") === stem);
  };

  const addContract = (input: Omit<RepositoryInvariant, "id" | "dependentFiles">) => {
    const count = categoryCounts.get(input.category) ?? 0;
    if (count >= categoryLimits[input.category]) return;
    categoryCounts.set(input.category, count + 1);
    const impact = analyzeImpact(index, fileNodeId(input.filePath));
    const dependentFiles = [...new Set([input.filePath, ...(impact?.affectedFiles ?? [])])].slice(0, 12);
    contracts.push({
      ...input,
      id: `invariant:${hashContent(`${input.category}:${input.filePath}:${input.line}:${input.title}`)}`,
      dependentFiles
    });
  };

  for (const file of sourceFiles) {
    const fileSignals = signals.get(file.path)!;
    if (isTest(file.path)) {
      const test = fileSignals.find((signal) => signal.kind === "test");
      if (test) addContract({
        category: "verification", title: `${baseName(file.path)} retains regression checks`,
        statement: `Test declarations are present in ${file.path}; their execution result is not known to this analysis.`,
        status: "unverified", confidence: 65, filePath: file.path, line: test.line, evidence: test.evidence,
        contradiction: "Run these checks in CI before treating this behavior as verified."
      });
      continue;
    }
    let accessAdded = false;
    let dataAdded = false;
    let resilienceAdded = false;

    fileSignals.forEach((signal) => {
      const { evidence, line } = signal;

      if (!accessAdded && signal.kind === "access") {
          const gate = signal.name;
          const tested = hasTestEvidence(file.path, gate.replace("jwt.", ""));
          addContract({
            category: "access",
            title: `${gate} remains on the trust boundary`,
            statement: `Protected work through ${file.path} must continue to cross the ${gate} gate.`,
            status: tested ? "guarded" : "watch",
            confidence: tested ? 96 : 84,
            filePath: file.path,
            line,
            evidence,
            contradiction: tested ? undefined : "A gate call is visible, but no matching test reference was found."
          });
          accessAdded = true;
      }

      if (signal.kind === "environment") {
        const name = signal.name;
        const sensitiveDefault = /SECRET|TOKEN|PASSWORD|KEY/.test(name) && /\?\?\s*["'`]/.test(evidence);
        addContract({
          category: "configuration",
          title: `${name} remains an explicit runtime input`,
          statement: `${name} must be supplied by the environment or retain a reviewed fallback.`,
          status: "watch",
          confidence: sensitiveDefault ? 68 : 88,
          filePath: file.path,
          line,
          evidence,
          contradiction: sensitiveDefault ? "A sensitive setting appears to have a source-code fallback." : "Environment read detected; required-value validation has not been established."
        });
      }

      if (signal.kind === "route") {
        const method = signal.name.split(" ")[0]!;
        const routePath = signal.name.slice(method.length + 1);
        const tested = hasTestEvidence(file.path, routePath);
        addContract({
          category: "interface",
          title: `${method} ${routePath} preserves its contract`,
          statement: `Consumers depend on the ${method} ${routePath} request and response boundary.`,
          status: tested ? "guarded" : "unverified",
          confidence: tested ? 94 : 61,
          filePath: file.path,
          line,
          evidence,
          contradiction: tested ? undefined : "No test file was found that names this endpoint."
        });
      }

      if (!dataAdded && (signal.kind === "schema" || signal.kind === "shape")) {
          const runtimeShape = signal.kind === "schema";
          const shape = signal.name;
          addContract({
            category: "data",
            title: `${shape} preserves its declared shape`,
            statement: `Callers rely on the fields and constraints represented by ${shape}.`,
            status: runtimeShape ? "guarded" : "watch",
            confidence: runtimeShape ? 93 : 72,
            filePath: file.path,
            line,
            evidence,
            contradiction: runtimeShape ? undefined : "The shape is compile-time only; no runtime validator was detected on this line."
          });
          dataAdded = true;
      }

      if (!resilienceAdded && signal.kind === "failure") {
        addContract({
          category: "resilience",
          title: `${baseName(file.path)} keeps a controlled failure path`,
          statement: `Failures in ${file.path} must remain contained and observable.`,
          status: "watch",
          confidence: 82,
          filePath: file.path,
          line,
          evidence,
          contradiction: "Failure handling is present; rollback and observability still require runtime verification."
        });
        resilienceAdded = true;
      }
    });

  }

  const ranked = uniqueBy(contracts, (contract) => `${contract.category}:${contract.filePath}:${contract.title}`)
    .sort((left, right) => invariantPriority(right) - invariantPriority(left) || right.dependentFiles.length - left.dependentFiles.length)
    .slice(0, 24);
  const statusScore = { guarded: 100, watch: 66, unverified: 42 } as const;
  const score = ranked.length ? Math.round(ranked.reduce((total, contract) => total + statusScore[contract.status], 0) / ranked.length) : 0;
  const guarded = ranked.filter((contract) => contract.status === "guarded").length;
  const categories = new Set(ranked.map((contract) => contract.category));

  return {
    score,
    guarded,
    attention: ranked.length - guarded,
    categoryCoverage: categories.size,
    contracts: ranked,
    drills: buildInvariantFailureDrills(ranked)
  };
}

type InvariantSignal = { kind: "access" | "environment" | "route" | "schema" | "shape" | "failure" | "test" | "reference"; name: string; line: number; evidence: string };

function extractInvariantSignals(path: string, content: string, includeReferences = false): InvariantSignal[] {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  const result: InvariantSignal[] = [];
  const add = (node: ts.Node, kind: InvariantSignal["kind"], name: string) => {
    result.push({ kind, name, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, evidence: kind === "reference" ? "" : node.getText(source).replace(/\s+/g, " ").slice(0, 220) });
  };
  // AST signals exclude examples in documentation, comments, and string literals.
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const target = node.expression.getText(source);
      if (/^(requireAuth|authori[sz]e|requirePermission|verifyToken|jwt\.verify|canAccess)$/i.test(target)) add(node, "access", target);
      if (/^(app|router)\.(get|post|put|patch|delete)$/i.test(target) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) add(node, "route", `${target.split(".")[1]!.toUpperCase()} ${node.arguments[0].text}`);
      if (target === "z.object") add(node, "schema", `${baseName(path)} schema`);
      if (/^(it|test)(\.(only|skip))?$/.test(target)) add(node, "test", target);
      if (/\b(rollback|transaction)$/.test(target)) add(node, "failure", target);
    }
    if (ts.isPropertyAccessExpression(node) && /^(process\.env|env)$/.test(node.expression.getText(source)) && /^[A-Z][A-Z0-9_]*$/.test(node.name.text)) {
      add(ts.isBinaryExpression(node.parent) ? node.parent : node, "environment", node.name.text);
    }
    if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) add(node, "shape", node.name.text);
    if (ts.isCatchClause(node)) add(node, "failure", "catch");
    if (includeReferences && (ts.isIdentifier(node) || ts.isStringLiteralLike(node))) add(node, "reference", node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

function buildInvariantFailureDrills(contracts: RepositoryInvariant[]): InvariantFailureDrill[] {
  const definitions: Array<{
    category: InvariantCategory;
    id: string;
    title: string;
    hypothesis: string;
    recoverySteps: string[];
  }> = [
    { category: "access", id: "trust-boundary", title: "Bypass a trust boundary", hypothesis: "Assume one authorization gate is accidentally removed from a protected path.", recoverySteps: ["Restore the gate at the earliest request boundary.", "Run focused unauthorized and expired-session tests.", "Review every dependent route before publishing."] },
    { category: "configuration", id: "missing-runtime-input", title: "Remove a runtime input", hypothesis: "Assume a required environment value is missing or replaced with an unsafe fallback.", recoverySteps: ["Fail startup with a precise configuration error.", "Review fallbacks and rotate any exposed credentials.", "Verify deployment configuration before traffic resumes."] },
    { category: "interface", id: "contract-break", title: "Break a public interface", hypothesis: "Assume a route, parameter, or response shape changes without a compatible migration.", recoverySteps: ["Restore compatibility or version the interface.", "Run consumer-facing contract tests.", "Publish a migration note for every dependent surface."] },
    { category: "data", id: "shape-drift", title: "Introduce shape drift", hypothesis: "Assume a required domain field is renamed or its type changes across a boundary.", recoverySteps: ["Add runtime validation at the boundary.", "Migrate stored and in-flight representations.", "Re-run affected serialization and API tests."] },
    { category: "resilience", id: "failure-path", title: "Force a downstream failure", hypothesis: "Assume a dependency throws after partial work has begun.", recoverySteps: ["Confirm the operation fails closed.", "Verify rollback, retry, and audit signals.", "Exercise the nearest incident runbook."] },
    { category: "verification", id: "proof-gap", title: "Remove regression proof", hypothesis: "Assume a critical test is skipped while its implementation continues to change.", recoverySteps: ["Restore the smallest focused regression test.", "Bind it to the affected contract in CI.", "Require the proof before accepting the change."] }
  ];

  return definitions.flatMap((definition) => {
    const matching = contracts.filter((contract) => contract.category === definition.category).slice(0, 4);
    if (!matching.length) return [];
    const affectedFiles = [...new Set(matching.flatMap((contract) => contract.dependentFiles))].slice(0, 16);
    const severity: InvariantFailureDrill["severity"] = definition.category === "access" || definition.category === "configuration"
      ? "high"
      : affectedFiles.length >= 6 || matching.some((contract) => contract.status !== "guarded")
        ? "medium"
        : "low";
    return [{
      id: `drill:${definition.id}`,
      title: definition.title,
      hypothesis: definition.hypothesis,
      severity,
      contractIds: matching.map((contract) => contract.id),
      affectedFiles,
      recoverySteps: definition.recoverySteps
    }];
  });
}

function invariantPriority(contract: RepositoryInvariant) {
  const categoryWeight: Record<InvariantCategory, number> = { access: 60, configuration: 50, interface: 40, data: 30, resilience: 20, verification: 10 };
  const statusWeight = contract.status === "unverified" ? 24 : contract.status === "watch" ? 16 : 0;
  return categoryWeight[contract.category] + statusWeight + Math.min(12, contract.dependentFiles.length);
}

function findImportCycles(graph: RepositoryGraph) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, string[]>();
  graph.edges.filter((edge) => edge.type === "imports").forEach((edge) => adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]));
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const active = new Set<string>();
  const stack: string[] = [];
  const visit = (id: string) => {
    if (active.has(id)) {
      const start = stack.indexOf(id);
      const cycle = stack.slice(start).map((nodeId) => nodeById.get(nodeId)?.filePath).filter((value): value is string => Boolean(value));
      if (cycle.length > 1) cycles.push(cycle);
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    active.add(id);
    stack.push(id);
    for (const target of adjacency.get(id) ?? []) visit(target);
    stack.pop();
    active.delete(id);
  };
  for (const id of adjacency.keys()) visit(id);
  return uniqueBy(cycles, (cycle) => [...cycle].sort().join("|"));
}

function shortestGraphPath(graph: RepositoryGraph, sourceId: string, targetId: string, maxDepth: number) {
  const queue: string[][] = [[sourceId]];
  const visited = new Set([sourceId]);
  while (queue.length) {
    const path = queue.shift()!;
    const current = path.at(-1)!;
    if (current === targetId) return path;
    if (path.length >= maxDepth) continue;
    for (const edge of graph.edges.filter((candidate) => candidate.source === current)) {
      if (visited.has(edge.target)) continue;
      visited.add(edge.target);
      queue.push([...path, edge.target]);
    }
  }
  return null;
}

function detectTestCommand(files: RepoFile[]) {
  for (const file of files.filter((candidate) => candidate.path.endsWith("package.json"))) {
    try {
      const parsed = JSON.parse(file.content) as { scripts?: Record<string, unknown> };
      if (typeof parsed.scripts?.test === "string") return "npm test";
    } catch {
      // Keep searching other manifests.
    }
  }
  if (files.some((file) => /pytest|unittest/.test(file.content) || /requirements.*\.txt$/.test(file.path))) return "pytest";
  return "Run the repository test command";
}

function riskWeight(risk: "low" | "medium" | "high") {
  return risk === "high" ? 3 : risk === "medium" ? 2 : 1;
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function buildTestSuggestions(index: RepositoryIndex, existingTests: number) {
  const exported = index.symbols.filter((symbol) => symbol.exported && ["function", "class"].includes(symbol.kind));
  const suggestions = exported.slice(0, 5).map((symbol) => `Add a focused test for ${symbol.name} in ${symbol.filePath}.`);
  if (existingTests === 0) suggestions.unshift("Create a test directory and add one smoke test for the main entry point.");
  if (index.graph.edges.some((edge) => edge.type === "imports")) suggestions.push("Add an integration test for the highest-connected import path.");
  return [...new Set(suggestions)].slice(0, 6);
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function baseName(path: string) {
  const normalized = normalizePath(path);
  return normalized.split("/").pop() ?? normalized;
}

function folderNodeId(path: string) {
  const parts = normalizePath(path).split("/");
  parts.pop();
  return parts.length > 0 ? `folder:${parts.join("/")}` : "";
}

function fileNodeId(path: string) {
  return `file:${normalizePath(path)}`;
}

function symbolId(path: string, name: string, offset: number) {
  return `symbol:${normalizePath(path)}:${name}:${offset}`;
}

function chunkId(path: string, name: string, index: number) {
  return `chunk:${normalizePath(path)}:${name}:${index}`;
}

function hasExportModifier(node: ts.Node) {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function rangeForNode(sourceFile: ts.SourceFile, node: ts.Node): SourceRange {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    startLine: start.line + 1,
    startColumn: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1
  };
}

function fullFileRange(content: string): SourceRange {
  const lines = content.split(/\r?\n/);
  return {
    startLine: 1,
    startColumn: 1,
    endLine: Math.max(1, lines.length),
    endColumn: (lines.at(-1)?.length ?? 0) + 1
  };
}

function resolveImport(fromPath: string, specifier: string, paths: Set<string>) {
  if (!specifier.startsWith(".")) return null;
  const fromParts = normalizePath(fromPath).split("/");
  fromParts.pop();
  const normalized = normalizePath([...fromParts, specifier].join("/"));
  const collapsed = collapseDots(normalized);
  const candidates = [
    collapsed,
    `${collapsed}.ts`,
    `${collapsed}.tsx`,
    `${collapsed}.js`,
    `${collapsed}.jsx`,
    `${collapsed}/index.ts`,
    `${collapsed}/index.tsx`,
    `${collapsed}/index.js`
  ];
  return candidates.find((candidate) => paths.has(candidate)) ?? null;
}

function collapseDots(path: string) {
  const stack: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function roughTokenCount(content: string) {
  return Math.ceil(tokenize(content).length * 1.25);
}

function clampContent(content: string) {
  return content.length > 4000 ? `${content.slice(0, 4000)}\n/* truncated */` : content;
}

function extractRange(content: string, range: SourceRange) {
  const lines = content.split(/\r?\n/);
  return lines.slice(range.startLine - 1, range.endLine).join("\n");
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_./-]+/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 1);
}

function lexicalScore(queryTerms: string[], contentTerms: string[]) {
  if (queryTerms.length === 0 || contentTerms.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const term of contentTerms) counts.set(term, (counts.get(term) ?? 0) + 1);
  const matched = queryTerms.reduce((score, term) => score + Math.min(counts.get(term) ?? 0, 3), 0);
  return matched / queryTerms.length;
}

function hashVector(terms: string[], dimensions = 256) {
  const vector = new Array(dimensions).fill(0);
  for (const term of terms) {
    let hash = 0;
    for (let index = 0; index < term.length; index += 1) {
      hash = Math.imul(31, hash) + term.charCodeAt(index);
    }
    vector[Math.abs(hash) % dimensions] += 1;
  }
  return vector;
}

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index]! * b[index]!;
    aNorm += a[index]! * a[index]!;
    bNorm += b[index]! * b[index]!;
  }
  return aNorm === 0 || bNorm === 0 ? 0 : dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

function averageNumber(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function relatedFilePaths(graph: RepositoryGraph, filePath: string): string[] {
  const fileId = fileNodeId(filePath);
  const relatedIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.source === fileId) relatedIds.add(edge.target);
    if (edge.target === fileId) relatedIds.add(edge.source);
  }
  return graph.nodes
    .filter((node) => relatedIds.has(node.id) && node.type === "file" && node.filePath)
    .map((node) => node.filePath!);
}
