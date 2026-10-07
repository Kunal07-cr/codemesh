import { Router, type Request } from "express";
import {
  analyzeImpact,
  analyzeRepository,
  buildArchitectureDocumentation,
  buildAutomationMission,
  buildGeneratedTestPlans,
  buildIncidentReport,
  searchRepository
} from "@codemesh/code-intelligence";
import type { JsonStore } from "../db/store.js";
import { hashToken } from "./delivery.js";

type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

export function mcpRoutes(store: JsonStore) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({
      name: "CodeMesh MCP",
      protocolVersion: "2025-11-25",
      transport: "streamable-http-json",
      authentication: "Bearer cmcp_*",
      capabilities: ["tools", "resources", "prompts"]
    });
  });

  router.post("/", async (req, res) => {
    const access = authorizeMcp(req, store);
    if (!access) {
      res.setHeader("www-authenticate", 'Bearer realm="CodeMesh MCP"');
      res.status(401).json(rpcError(req.body?.id, -32001, "A valid CodeMesh MCP bearer token is required."));
      return;
    }
    await store.touchAgentAccessToken(access.id);
    const request = req.body as JsonRpcRequest;
    if (request.jsonrpc !== "2.0" || !request.method) {
      res.status(400).json(rpcError(request.id, -32600, "Invalid JSON-RPC request."));
      return;
    }
    if (request.method === "notifications/initialized") {
      res.status(202).end();
      return;
    }

    try {
      const result = await handleMcpRequest(store, access, request.method, request.params ?? {});
      res.json({ jsonrpc: "2.0", id: request.id ?? null, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "CodeMesh MCP request failed.";
      res.status(message.includes("Unknown") ? 404 : 400).json(rpcError(request.id, message.includes("Unknown") ? -32601 : -32602, message));
    }
  });

  return router;
}

async function handleMcpRequest(
  store: JsonStore,
  access: NonNullable<ReturnType<typeof authorizeMcp>>,
  method: string,
  params: Record<string, unknown>
) {
  const projectId = access.projectId;
  const index = store.getIndex(projectId);
  if (method === "initialize") {
    return {
      protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : "2025-11-25",
      capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false }, prompts: { listChanged: false } },
      serverInfo: { name: "CodeMesh", version: "0.2.0", description: "Source-linked repository graph and delivery intelligence" },
      instructions: "Use repository_search before requesting impact, tests, incidents, or a change plan. Cite returned file paths and ranges."
    };
  }
  if (method === "ping") return {};
  if (method === "tools/list") return { tools: toolDefinitions(access.scopes.includes("propose")) };
  if (method === "resources/list") {
    return {
      resources: index.files.filter((file) => !file.sensitive).slice(0, 2_000).map((file) => ({
        uri: fileUri(projectId, file.path),
        name: file.path,
        title: file.path,
        description: `${file.language} source file (${file.size} bytes)`,
        mimeType: mimeForLanguage(file.language)
      }))
    };
  }
  if (method === "resources/read") {
    const uri = String(params.uri ?? "");
    const filePath = parseFileUri(projectId, uri);
    const file = filePath ? store.getFile(projectId, filePath) : null;
    if (!file || file.sensitive) throw new Error("Unknown or protected CodeMesh resource.");
    return { contents: [{ uri, mimeType: mimeForLanguage(file.language), text: file.content }] };
  }
  if (method === "prompts/list") {
    return {
      prompts: [
        { name: "review-change", description: "Review changed files with graph impact and targeted tests", arguments: [{ name: "changedFiles", description: "Comma-separated repository paths", required: true }] },
        { name: "investigate-incident", description: "Map a stack trace to indexed code", arguments: [{ name: "stackTrace", description: "Stack trace or error log", required: true }] },
        { name: "explain-architecture", description: "Explain modules, entry points, and repository health", arguments: [] }
      ]
    };
  }
  if (method === "prompts/get") return getPrompt(String(params.name ?? ""), params.arguments as Record<string, string> | undefined);
  if (method === "tools/call") {
    const name = String(params.name ?? "");
    const args = (params.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>;
    const value = callTool(store, access, name, args);
    return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value, isError: false };
  }
  throw new Error(`Unknown MCP method: ${method}`);
}

function callTool(store: JsonStore, access: NonNullable<ReturnType<typeof authorizeMcp>>, name: string, args: Record<string, unknown>) {
  const index = store.getIndex(access.projectId);
  if (name === "repository_search") {
    const query = requiredString(args.query, "query");
    const mode = ["vector", "hybrid", "graph"].includes(String(args.mode)) ? String(args.mode) as "vector" | "hybrid" | "graph" : "graph";
    const limit = Math.max(1, Math.min(20, Number(args.limit ?? 8)));
    const result = searchRepository(index, query, mode, limit);
    return {
      query,
      mode,
      hits: result.hits.map((hit) => ({ filePath: hit.chunk.filePath, symbolName: hit.chunk.symbolName, range: hit.chunk.range, score: hit.score, reason: hit.reason, excerpt: hit.chunk.content.slice(0, 1_500) }))
    };
  }
  if (name === "impact_analysis") {
    const selector = requiredString(args.nodeId ?? args.filePath, "nodeId or filePath");
    const node = index.graph.nodes.find((candidate) => candidate.id === selector || candidate.filePath === selector);
    if (!node) throw new Error("Unknown graph node or file path.");
    return analyzeImpact(index, node.id);
  }
  if (name === "repository_health") return analyzeRepository(index);
  if (name === "architecture_documentation") return buildArchitectureDocumentation(index);
  if (name === "generate_test_plan") return buildGeneratedTestPlans(index, stringArray(args.changedFiles));
  if (name === "trace_incident") return buildIncidentReport(index, String(args.title ?? "Repository incident"), requiredString(args.stackTrace, "stackTrace"));
  if (name === "plan_change") {
    if (!access.scopes.includes("propose")) throw new Error("This token does not include the propose scope.");
    return buildAutomationMission(index, requiredString(args.objective, "objective"));
  }
  throw new Error(`Unknown CodeMesh tool: ${name}`);
}

function authorizeMcp(req: Request, store: JsonStore) {
  const authorization = req.header("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]?.startsWith("cmcp_")) return null;
  return store.getAgentAccessTokenByHash(hashToken(match[1]));
}

function toolDefinitions(canPropose: boolean) {
  const tools: Array<Record<string, unknown>> = [
    { name: "repository_search", description: "Search CodeMesh chunks and graph neighbors with source ranges.", inputSchema: { type: "object", properties: { query: { type: "string" }, mode: { type: "string", enum: ["graph", "hybrid", "vector"] }, limit: { type: "number", minimum: 1, maximum: 20 } }, required: ["query"] } },
    { name: "impact_analysis", description: "Find incoming, outgoing, and affected files for a graph node or file.", inputSchema: { type: "object", properties: { nodeId: { type: "string" }, filePath: { type: "string" } } } },
    { name: "repository_health", description: "Return repository health, coverage estimate, issues, and suggested tests.", inputSchema: { type: "object", properties: {} } },
    { name: "architecture_documentation", description: "Generate module inventory, entry points, Mermaid architecture, and health evidence.", inputSchema: { type: "object", properties: {} } },
    { name: "generate_test_plan", description: "Generate focused test plans for changed files.", inputSchema: { type: "object", properties: { changedFiles: { type: "array", items: { type: "string" } } }, required: ["changedFiles"] } },
    { name: "trace_incident", description: "Map a stack trace or error log to source, symbols, blast radius, and a runbook.", inputSchema: { type: "object", properties: { title: { type: "string" }, stackTrace: { type: "string" } }, required: ["stackTrace"] } }
  ];
  if (canPropose) tools.push({ name: "plan_change", description: "Prepare a reviewable change mission with graph evidence, tests, and static gates. It never writes source directly.", inputSchema: { type: "object", properties: { objective: { type: "string" } }, required: ["objective"] } });
  return tools;
}

function getPrompt(name: string, args: Record<string, string> = {}) {
  if (name === "review-change") return { description: "Review repository changes", messages: [{ role: "user", content: { type: "text", text: `Review these changed files using CodeMesh impact_analysis and generate_test_plan: ${args.changedFiles ?? ""}` } }] };
  if (name === "investigate-incident") return { description: "Investigate an incident", messages: [{ role: "user", content: { type: "text", text: `Trace this incident to source and return evidence plus a runbook:\n${args.stackTrace ?? ""}` } }] };
  if (name === "explain-architecture") return { description: "Explain repository architecture", messages: [{ role: "user", content: { type: "text", text: "Use architecture_documentation and repository_health to explain the system, its entry points, and its highest-priority risks." } }] };
  throw new Error(`Unknown CodeMesh prompt: ${name}`);
}

function fileUri(projectId: string, filePath: string) {
  return `codemesh://project/${encodeURIComponent(projectId)}/file/${filePath.split("/").map(encodeURIComponent).join("/")}`;
}

function parseFileUri(projectId: string, uri: string) {
  const prefix = `codemesh://project/${encodeURIComponent(projectId)}/file/`;
  if (!uri.startsWith(prefix)) return null;
  return uri.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
}

function mimeForLanguage(language: string) {
  return ({ typescript: "text/typescript", javascript: "text/javascript", json: "application/json", markdown: "text/markdown", python: "text/x-python" } as Record<string, string>)[language] ?? "text/plain";
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length < 1) throw new Error(`${label} is required.`);
  return value.trim();
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 200);
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

