import { z } from "zod";

export const ZIP_UPLOAD_LIMIT_MB = 100;
export const ZIP_UPLOAD_LIMIT_BYTES = ZIP_UPLOAD_LIMIT_MB * 1024 * 1024;
export const ZIP_EXTRACTED_LIMIT_MB = 250;
export const ZIP_EXTRACTED_LIMIT_BYTES = ZIP_EXTRACTED_LIMIT_MB * 1024 * 1024;

export const roleSchema = z.enum(["owner", "maintainer", "contributor", "viewer"]);
export type ProjectRole = z.infer<typeof roleSchema>;

export const permissionSchema = z.enum([
  "project.read",
  "project.manage",
  "member.manage",
  "discussion.post",
  "task.manage",
  "workspace.edit",
  "workspace.review",
  "ai.query",
  "github.publish"
]);
export type Permission = z.infer<typeof permissionSchema>;

const rolePermissions: Record<ProjectRole, Permission[]> = {
  owner: [
    "project.read",
    "project.manage",
    "member.manage",
    "discussion.post",
    "task.manage",
    "workspace.edit",
    "workspace.review",
    "ai.query",
    "github.publish"
  ],
  maintainer: [
    "project.read",
    "discussion.post",
    "task.manage",
    "workspace.edit",
    "workspace.review",
    "ai.query",
    "github.publish"
  ],
  contributor: ["project.read", "discussion.post", "workspace.edit", "workspace.review", "ai.query"],
  viewer: ["project.read", "ai.query"]
};

export function permissionsForRole(role: ProjectRole): Permission[] {
  return rolePermissions[role];
}

export function hasPermission(role: ProjectRole | null | undefined, permission: Permission): boolean {
  return Boolean(role && rolePermissions[role].includes(permission));
}

export const visibilitySchema = z.enum(["public", "private"]);
export type ProjectVisibility = z.infer<typeof visibilitySchema>;

export const userPublicSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  avatarUrl: z.string().url().optional(),
  createdAt: z.string()
});
export type PublicUser = z.infer<typeof userPublicSchema>;

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  languages: z.array(z.string()),
  visibility: visibilitySchema,
  published: z.boolean(),
  repositorySource: z.enum(["sample", "github", "zip"]),
  repoUrl: z.string().optional(),
  commitSha: z.string(),
  guidelines: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Project = z.infer<typeof projectSchema>;

export const projectMemberSchema = z.object({
  projectId: z.string(),
  userId: z.string(),
  role: roleSchema,
  discussionAllowed: z.boolean(),
  joinedAt: z.string()
});
export type ProjectMember = z.infer<typeof projectMemberSchema>;

export const repoFileSchema = z.object({
  projectId: z.string(),
  path: z.string(),
  language: z.string(),
  size: z.number(),
  binary: z.boolean(),
  sensitive: z.boolean(),
  content: z.string(),
  updatedAt: z.string()
});
export type RepoFile = z.infer<typeof repoFileSchema>;

export const sourceRangeSchema = z.object({
  startLine: z.number(),
  startColumn: z.number(),
  endLine: z.number(),
  endColumn: z.number()
});
export type SourceRange = z.infer<typeof sourceRangeSchema>;

export const codeSymbolSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  filePath: z.string(),
  name: z.string(),
  kind: z.enum(["function", "class", "interface", "type", "variable", "export", "file"]),
  exported: z.boolean(),
  range: sourceRangeSchema,
  verified: z.boolean()
});
export type CodeSymbol = z.infer<typeof codeSymbolSchema>;

export const graphNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["repository", "folder", "file", "symbol"]),
  filePath: z.string().optional(),
  symbolId: z.string().optional(),
  symbolKind: z.enum(["function", "class", "interface", "type", "variable", "export", "file"]).optional(),
  language: z.string().optional(),
  range: sourceRangeSchema.optional()
});
export type GraphNode = z.infer<typeof graphNodeSchema>;

export const graphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.enum(["contains", "imports", "exports", "references"]),
  verified: z.boolean(),
  label: z.string().optional()
});
export type GraphEdge = z.infer<typeof graphEdgeSchema>;

export const graphSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  generatedAt: z.string(),
  warnings: z.array(z.string())
});
export type RepositoryGraph = z.infer<typeof graphSchema>;

export const codeChunkSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  commitSha: z.string(),
  filePath: z.string(),
  language: z.string(),
  symbolId: z.string().optional(),
  symbolName: z.string().optional(),
  content: z.string(),
  range: sourceRangeSchema,
  tokenCount: z.number(),
  embeddingModel: z.string(),
  embeddingDimensions: z.number(),
  sourceRevision: z.enum(["committed", "workspace"])
});
export type CodeChunk = z.infer<typeof codeChunkSchema>;

export const retrievalModeSchema = z.enum(["vector", "hybrid", "graph"]);
export type RetrievalMode = z.infer<typeof retrievalModeSchema>;

export const retrievalRecordSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  question: z.string(),
  mode: retrievalModeSchema,
  chunkIds: z.array(z.string()),
  sourceRevision: z.string(),
  model: z.string(),
  embeddingModel: z.string(),
  contextTokens: z.number(),
  retrievalLatencyMs: z.number(),
  generationLatencyMs: z.number(),
  createdAt: z.string()
});
export type RetrievalRecord = z.infer<typeof retrievalRecordSchema>;

export const citationSchema = z.object({
  filePath: z.string(),
  range: sourceRangeSchema,
  symbolName: z.string().optional(),
  sourceRevision: z.enum(["committed", "workspace", "synthetic-dataset"]),
  excerpt: z.string(),
  sourceType: z.enum(["repository", "dataset"]).optional(),
  datasetRepositoryId: z.string().optional(),
  datasetRepositoryName: z.string().optional(),
  chunkId: z.string().optional()
});
export type Citation = z.infer<typeof citationSchema>;

export const aiModeSchema = z.enum(["explain", "investigate", "propose"]);
export type AiMode = z.infer<typeof aiModeSchema>;

export const aiConversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000)
});
export type AiConversationMessage = z.infer<typeof aiConversationMessageSchema>;

export const aiAskSchema = z.object({
  question: z.string().min(3),
  mode: aiModeSchema,
  retrievalMode: retrievalModeSchema,
  includeWorkspace: z.boolean().default(true),
  activeFilePath: z.string().max(500).optional(),
  knowledgeScope: z.enum(["repository", "combined", "dataset"]).optional(),
  datasetRepositoryId: z.string().regex(/^r\d{3}$/).optional(),
  conversation: z.array(aiConversationMessageSchema).max(10).default([])
});
export type AiAskRequest = z.infer<typeof aiAskSchema>;

export const patchFileSchema = z.object({
  path: z.string(),
  baseContent: z.string(),
  proposedContent: z.string(),
  baseHash: z.string()
});
export type PatchFile = z.infer<typeof patchFileSchema>;

export const patchProposalSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  summary: z.string(),
  files: z.array(patchFileSchema),
  suggestedVerification: z.array(z.string()),
  executedVerification: z.array(z.string()),
  status: z.enum(["proposed", "applied", "rejected", "stale"]),
  createdAt: z.string()
});
export type PatchProposal = z.infer<typeof patchProposalSchema>;

export const aiAnswerSchema = z.object({
  id: z.string(),
  answer: z.string(),
  uncertainty: z.string().optional(),
  citations: z.array(citationSchema),
  retrieval: retrievalRecordSchema,
  patch: patchProposalSchema.optional()
});
export type AiAnswer = z.infer<typeof aiAnswerSchema>;

export const workspaceDocSchema = z.object({
  projectId: z.string(),
  workspaceId: z.string(),
  path: z.string(),
  content: z.string(),
  version: z.number(),
  updatedAt: z.string()
});
export type WorkspaceDoc = z.infer<typeof workspaceDocSchema>;

export const discussionThreadSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  body: z.string(),
  authorId: z.string(),
  createdAt: z.string(),
  locked: z.boolean()
});
export type DiscussionThread = z.infer<typeof discussionThreadSchema>;

export const discussionReplySchema = z.object({
  id: z.string(),
  threadId: z.string(),
  projectId: z.string(),
  body: z.string(),
  authorId: z.string(),
  createdAt: z.string(),
  moderated: z.boolean()
});
export type DiscussionReply = z.infer<typeof discussionReplySchema>;

export const taskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  status: z.enum(["todo", "doing", "review", "done"]),
  assigneeId: z.string().optional(),
  createdAt: z.string()
});
export type ProjectTask = z.infer<typeof taskSchema>;

export const contributionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  workspaceId: z.string(),
  title: z.string(),
  summary: z.string(),
  authorId: z.string(),
  patchId: z.string().optional(),
  status: z.enum(["draft", "ready", "published", "blocked"]),
  prUrl: z.string().optional(),
  createdAt: z.string()
});
export type Contribution = z.infer<typeof contributionSchema>;

export const annotationSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  filePath: z.string(),
  range: sourceRangeSchema,
  symbolId: z.string().optional(),
  body: z.string(),
  authorId: z.string(),
  sourceRevision: z.string(),
  outdated: z.boolean(),
  createdAt: z.string()
});
export type CodeAnnotation = z.infer<typeof annotationSchema>;

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  requestId: z.string().optional()
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export type ApiSuccess<T> = {
  data: T;
};

export type ApiFailure = {
  error: ApiError;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const projectCreateSchema = z.object({
  name: z.string().min(3).max(80),
  description: z.string().min(10).max(500),
  visibility: visibilitySchema,
  published: z.boolean().default(false),
  tags: z.array(z.string().min(1).max(24)).max(10).default([]),
  guidelines: z.string().max(4000).default("")
});
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8)
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = loginSchema.extend({
  name: z.string().trim().min(2).max(80)
});
export type RegisterInput = z.infer<typeof registerSchema>;

export type ProjectSummary = Project & {
  role: ProjectRole | null;
  memberCount: number;
  fileCount: number;
};

export type ProjectWorkspacePayload = {
  project: Project;
  role: ProjectRole;
  permissions: Permission[];
  files: RepoFile[];
  graph: RepositoryGraph;
  workspaceId: string;
};

export type ZipValidationResult = {
  accepted: boolean;
  files: Array<{ path: string; size: number; language: string }>;
  errors: string[];
};

export type HealthPayload = {
  ok: boolean;
  service: string;
  version: string;
  dependencies: Record<string, "ok" | "not_configured" | "degraded">;
};
