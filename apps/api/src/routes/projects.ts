import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import {
  hasPermission,
  permissionsForRole,
  projectCreateSchema,
  ZIP_UPLOAD_LIMIT_BYTES,
  type ProjectSummary,
  type PublicUser
} from "@codemesh/shared";
import {
  analyzeArchitecturePolicies,
  analyzeDependencyUpgrades,
  analyzeImpact,
  analyzeRepository,
  analyzeRepositoryHotspots,
  buildOnboardingJourney,
  buildReviewCouncil,
  buildSampleRepoFiles,
  buildTestPlans,
  interpretGraphCommand,
  SAMPLE_COMMIT,
  searchRepository,
  traceSecurityFlows
} from "@codemesh/code-intelligence";
import type { JsonStore } from "../db/store.js";
import { badRequest, forbidden, notFound } from "../errors.js";
import { extractRepoFiles, validateZipArchive } from "../services/zipImport.js";
import { requireAuth, requireProjectPermission, requireVisibleProject } from "../services/security.js";
import { asyncHandler, ok, parseBody } from "./helpers.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: ZIP_UPLOAD_LIMIT_BYTES } });

export function projectRoutes(store: JsonStore) {
  const router = Router();

  router.get("/discovery", (req, res) => {
    const search = String(req.query.search ?? "");
    const projects = store.listPublicProjects(search).map((project) => summarizeProject(store, project.id, req.auth?.user.id));
    ok(res, projects);
  });

  router.get(
    "/dashboard",
    requireAuth(),
    (req, res) => {
      const projects = store.listProjectsForUser(req.auth!.user.id).map((project) => summarizeProject(store, project.id, req.auth!.user.id));
      ok(res, projects);
    }
  );

  router.post(
    "/",
    requireAuth(),
    asyncHandler(async (req, res) => {
      const input = parseBody(projectCreateSchema, req);
      const project = await store.createProject(req.auth!.user.id, input);
      ok(res, project);
    })
  );

  router.get(
    "/:projectId",
    requireVisibleProject(store),
    (req, res, next) => {
      const project = store.getProject(String(req.params.projectId));
      if (!project) {
        next(notFound("Project not found."));
        return;
      }
      const role = req.auth ? store.getRole(project.id, req.auth.user.id) : null;
      const files = store.listFiles(project.id);
      const graph = store.getIndex(project.id).graph;
      ok(res, {
        project,
        role,
        permissions: role ? permissionsForRole(role) : ["project.read"],
        members: store.listMembers(project.id).map((member) => ({
          ...member,
          user: store.getUser(member.userId)
        })),
        insights: {
          fileCount: files.length,
          lineCount: files.reduce((total, file) => total + file.content.split("\n").length, 0),
          graphNodes: graph.nodes.length,
          graphEdges: graph.edges.length,
          languages: project.languages
        }
      });
    }
  );

  router.get(
    "/:projectId/workspace",
    requireProjectPermission(store, "project.read"),
    (req, res) => {
      const project = store.getProject(String(req.params.projectId))!;
      const role = store.getRole(project.id, req.auth!.user.id)!;
      ok(res, {
        project,
        role,
        permissions: permissionsForRole(role),
        files: store.listFiles(project.id),
        graph: store.getIndex(project.id).graph,
        workspaceId: "main",
        docs: store.getWorkspaceDocs(project.id, "main"),
        chat: store.listWorkspaceChat(project.id, "main"),
        annotations: store.listAnnotations(project.id)
      });
    }
  );

  router.get(
    "/:projectId/files",
    requireVisibleProject(store),
    (req, res) => {
      const project = store.getProject(String(req.params.projectId))!;
      ok(
        res,
        store.listFiles(project.id).map(({ content: _content, ...file }) => file)
      );
    }
  );

  router.get(
    "/:projectId/files/content",
    requireVisibleProject(store),
    (req, res, next) => {
      const filePath = String(req.query.path ?? "");
      const file = store.getFile(String(req.params.projectId), filePath);
      if (!file) {
        next(notFound("File not found."));
        return;
      }
      ok(res, file);
    }
  );

  router.get(
    "/:projectId/graph",
    requireVisibleProject(store),
    (req, res) => {
      ok(res, store.getIndex(String(req.params.projectId)).graph);
    }
  );

  router.get(
    "/:projectId/intelligence",
    requireVisibleProject(store),
    (req, res) => {
      const projectId = String(req.params.projectId);
      const project = store.getProject(projectId)!;
      const index = store.getIndex(projectId);
      const query = String(req.query.query ?? "").trim();
      const search = query
        ? searchRepository(index, query, "graph", 8).hits.map((hit) => ({
            id: hit.chunk.id,
            filePath: hit.chunk.filePath,
            symbolName: hit.chunk.symbolName,
            range: hit.chunk.range,
            excerpt: hit.chunk.content.slice(0, 500),
            score: Math.round(hit.score * 100),
            reason: hit.reason
          }))
        : [];
      const role = req.auth ? store.getRole(projectId, req.auth.user.id) : null;
      ok(res, {
        health: analyzeRepository(index),
        search,
        activity: role ? store.listAuditEvents(projectId) : [],
        integrations: {
          github: { connected: project.repositorySource === "github", repositoryUrl: project.repoUrl },
          realtime: { enabled: true, transport: "Socket.io + Yjs" },
          ai: { retrieval: "graph + hybrid", provider: "local fallback or configured Gemini" }
        }
      });
    }
  );

  router.get(
    "/:projectId/impact",
    requireVisibleProject(store),
    (req, res, next) => {
      const result = analyzeImpact(store.getIndex(String(req.params.projectId)), String(req.query.nodeId ?? ""));
      if (!result) {
        next(notFound("Graph node not found."));
        return;
      }
      ok(res, result);
    }
  );

  router.get(
    "/:projectId/labs",
    requireVisibleProject(store),
    (req, res) => {
      const projectId = String(req.params.projectId);
      const project = store.getProject(projectId)!;
      const index = store.getIndex(projectId);
      const selectableNodes = index.graph.nodes
        .filter((node) => node.type === "symbol" || node.type === "file")
        .sort((a, b) => graphDegree(index.graph.edges, b.id) - graphDegree(index.graph.edges, a.id));
      const requestedNodeId = String(req.query.nodeId ?? "");
      const selectedNode = selectableNodes.find((node) => node.id === requestedNodeId) ?? selectableNodes[0];
      const command = String(req.query.command ?? "show the authentication flow").trim();
      const activity = store.listAuditEvents(projectId, 200);
      const members = store.listMembers(projectId).map((member) => ({
        ...member,
        user: store.getUser(member.userId),
        activityEvents: activity.filter((event) => event.userId === member.userId).length
      }));
      const hotspots = analyzeRepositoryHotspots(index).map((hotspot) => {
        const relatedEvent = activity.find((event) => event.userId && String(event.metadata.filePath ?? event.metadata.path ?? "") === hotspot.filePath);
        const steward = relatedEvent ? store.getUser(relatedEvent.userId!) : null;
        return { ...hotspot, suggestedSteward: steward, ownershipEvidence: steward ? "recent audited activity" : "unassigned" };
      });
      ok(res, {
        project: { id: project.id, name: project.name, description: project.description, commitSha: project.commitSha, source: project.repositorySource, languages: project.languages },
        nodes: selectableNodes.slice(0, 160),
        impact: selectedNode ? analyzeImpact(index, selectedNode.id) : null,
        graphCommand: interpretGraphCommand(index, command),
        evolution: store.getRepositoryEvolution(projectId, String(req.query.from ?? ""), String(req.query.to ?? "")),
        qualityTimeline: store.listQualitySnapshots(projectId),
        architecturePolicies: analyzeArchitecturePolicies(index),
        securityFlows: traceSecurityFlows(index),
        dependencies: analyzeDependencyUpgrades(index),
        testPlans: buildTestPlans(index),
        hotspots,
        ownership: {
          members,
          activeStewards: members.filter((member) => member.role !== "viewer").length,
          busFactorRisk: members.filter((member) => ["owner", "maintainer"].includes(member.role)).length < 2 ? "high" : "controlled"
        },
        onboarding: buildOnboardingJourney(index),
        reviewCouncil: buildReviewCouncil(index),
        documentation: {
          generatedAt: new Date().toISOString(),
          files: index.files.length,
          symbols: index.symbols.length,
          relationships: index.graph.edges.length,
          entryPoints: index.files.filter((file) => /(^|\/)(main|index|server|app)\.[^.]+$/i.test(file.path)).map((file) => file.path).slice(0, 8),
          modules: [...new Set(index.files.map((file) => file.path.split("/").slice(0, -1).join("/") || "root"))].slice(0, 12)
        }
      });
    }
  );

  router.post(
    "/:projectId/labs/snapshot",
    requireProjectPermission(store, "project.manage"),
    asyncHandler(async (req, res) => {
      const projectId = String(req.params.projectId);
      ok(res, await store.captureLabSnapshot(projectId, req.auth!.user.id));
    })
  );

  router.post(
    "/:projectId/import/sample",
    requireProjectPermission(store, "project.manage"),
    asyncHandler(async (req, res) => {
      const projectId = String(req.params.projectId);
      const files = buildSampleRepoFiles(projectId);
      await store.replaceProjectFiles(projectId, files, "sample", SAMPLE_COMMIT);
      ok(res, { files: files.length, commitSha: SAMPLE_COMMIT });
    })
  );

  router.post(
    "/:projectId/import/zip/validate",
    requireProjectPermission(store, "project.manage"),
    upload.single("archive"),
    (req, res, next) => {
      if (!req.file) {
        next(badRequest("ZIP archive is required."));
        return;
      }
      ok(res, validateZipArchive(req.file.buffer));
    }
  );

  router.post(
    "/:projectId/import/zip",
    requireProjectPermission(store, "project.manage"),
    upload.single("archive"),
    asyncHandler(async (req, res) => {
      if (!req.file) throw badRequest("ZIP archive is required.");
      const projectId = String(req.params.projectId);
      const files = extractRepoFiles(projectId, req.file.buffer);
      if (files.length === 0) throw badRequest("ZIP contains no indexable text files.");
      const commitSha = `zip-${Date.now()}`;
      await store.replaceProjectFiles(projectId, files, "zip", commitSha);
      ok(res, { files: files.length, commitSha });
    })
  );

  router.post(
    "/:projectId/import/github",
    requireProjectPermission(store, "project.manage"),
    asyncHandler(async (req, res) => {
      const input = z.object({
        url: z.string().url(),
        branch: z.string().trim().regex(/^[A-Za-z0-9._/-]{1,120}$/).optional()
      }).parse(req.body);
      const repository = parseGitHubRepository(input.url);
      if (!repository) throw badRequest("Use a public GitHub repository URL such as https://github.com/owner/repository.");

      const discoveredBranch = input.branch || repository.branch ? null : await discoverGitHubDefaultBranch(repository);
      const branchCandidates = buildGitHubBranchCandidates(input.branch, repository.branch, discoveredBranch ?? undefined);
      let archive: Buffer | null = null;
      let selectedBranch = branchCandidates[0];
      for (const branch of branchCandidates) {
        try {
          const response = await fetch(`https://github.com/${repository.owner}/${repository.name}/archive/refs/heads/${encodeURIComponent(branch)}.zip`, {
            headers: { "accept": "application/zip", "user-agent": "CodeMesh repository importer" },
            signal: AbortSignal.timeout(20_000)
          });
          if (!response.ok) continue;
          const contentLength = Number(response.headers.get("content-length") ?? 0);
          if (contentLength > ZIP_UPLOAD_LIMIT_BYTES) {
            throw badRequest(`GitHub archive is larger than the ${Math.round(ZIP_UPLOAD_LIMIT_BYTES / 1_000_000)} MB import limit.`);
          }
          archive = Buffer.from(await response.arrayBuffer());
          selectedBranch = branch;
          break;
        } catch (error) {
          if (error instanceof Error && error.message.includes("larger than")) throw error;
        }
      }
      if (!archive) throw badRequest("GitHub repository could not be downloaded. Check that it is public and the branch exists.");

      const projectId = String(req.params.projectId);
      const files = extractRepoFiles(projectId, archive, { stripCommonRoot: true });
      if (files.length === 0) throw badRequest("GitHub repository contains no safe text or code files.");
      const commitSha = `github-${Date.now()}`;
      await store.replaceProjectFiles(projectId, files, "github", commitSha);
      await store.updateProjectRepository(projectId, input.url);
      ok(res, { files: files.length, commitSha, branch: selectedBranch, repository: `${repository.owner}/${repository.name}` });
    })
  );

  router.get(
    "/:projectId/members",
    requireProjectPermission(store, "project.read"),
    (req, res) => {
      ok(
        res,
        store.listMembers(String(req.params.projectId)).map((member) => ({
          ...member,
          user: store.getUser(member.userId)
        }))
      );
    }
  );

  router.put(
    "/:projectId/members/:userId",
    requireProjectPermission(store, "member.manage"),
    asyncHandler(async (req, res) => {
      const schema = z.object({ role: z.enum(["owner", "maintainer", "contributor", "viewer"]), discussionAllowed: z.boolean() });
      const input = schema.parse(req.body);
      const userId = String(req.params.userId);
      const projectId = String(req.params.projectId);
      const user = store.getUser(userId);
      if (!user) throw notFound("User not found.");
      await store.updateMember(projectId, userId, input.role, input.discussionAllowed);
      ok(res, { member: store.getMember(projectId, userId) });
    })
  );

  router.get(
    "/:projectId/settings/access-check",
    requireAuth(),
    (req, res, next) => {
      const permission = String(req.query.permission ?? "");
      const project = store.getProject(String(req.params.projectId));
      if (!project) {
        next(notFound("Project not found."));
        return;
      }
      const role = store.getRole(project.id, req.auth!.user.id);
      ok(res, { role, allowed: hasPermission(role, permission as never) });
    }
  );

  return router;
}

function graphDegree(edges: Array<{ source: string; target: string }>, nodeId: string) {
  return edges.filter((edge) => edge.source === nodeId || edge.target === nodeId).length;
}

export function parseGitHubRepository(value: string) {
  try {
    const url = new URL(value);
    if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) return null;
    const segments = url.pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
    const [owner, rawName] = segments;
    const name = rawName?.replace(/\.git$/, "");
    if (!owner || !name || owner.length > 100 || name.length > 100) return null;
    const markerIndex = segments.findIndex((segment) => segment === "tree" || segment === "blob");
    const branch = markerIndex >= 0 ? segments[markerIndex + 1] : undefined;
    return { owner, name, branch: branch && isValidBranch(branch) ? branch : undefined };
  } catch {
    return null;
  }
}

async function discoverGitHubDefaultBranch(repository: { owner: string; name: string }) {
  try {
    const response = await fetch(`https://api.github.com/repos/${repository.owner}/${repository.name}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "CodeMesh repository importer" },
      signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) return null;
    const payload = await response.json() as { default_branch?: unknown };
    return typeof payload.default_branch === "string" && isValidBranch(payload.default_branch) ? payload.default_branch : null;
  } catch {
    return null;
  }
}

function uniqueBranches(branches: Array<string | undefined>) {
  return [...new Set(branches.filter((branch): branch is string => Boolean(branch && isValidBranch(branch))))];
}

export function buildGitHubBranchCandidates(inputBranch?: string, urlBranch?: string, discoveredBranch?: string) {
  if (inputBranch) return [inputBranch];
  return uniqueBranches([urlBranch, discoveredBranch, "main", "master", "develop", "trunk"]);
}

function isValidBranch(branch: string) {
  return /^[A-Za-z0-9._/-]{1,120}$/.test(branch);
}

function summarizeProject(store: JsonStore, projectId: string, userId?: string): ProjectSummary {
  const project = store.getProject(projectId)!;
  return {
    ...project,
    role: userId ? store.getRole(project.id, userId) : null,
    memberCount: store.listMembers(project.id).length,
    fileCount: store.listFiles(project.id).length
  };
}
