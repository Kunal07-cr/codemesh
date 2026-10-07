import bcrypt from "bcryptjs";
import {
  analyzeRepository,
  buildSampleRepoFiles,
  indexRepository,
  SAMPLE_COMMIT,
  type AutonomousChangePlan,
  type RepositoryIndex,
  type VirtualSandboxReport
} from "@codemesh/code-intelligence";
import type {
  AiAnswer,
  CodeAnnotation,
  Contribution,
  DiscussionReply,
  DiscussionThread,
  PatchProposal,
  Project,
  ProjectCreateInput,
  ProjectMember,
  ProjectRole,
  ProjectTask,
  PublicUser,
  RepoFile,
  RetrievalRecord,
  SourceRange,
  WorkspaceDoc
} from "@codemesh/shared";
import { createStatePersistence, type PersistenceHealth, type StatePersistence } from "./persistence.js";

export type UserRecord = PublicUser & {
  passwordHash: string;
  githubUserId?: string;
  emailVerifiedAt?: string;
};

export type RefreshTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt?: string;
  rotatedFromId?: string;
};

export type WorkspaceChatMessage = {
  id: string;
  projectId: string;
  workspaceId: string;
  body: string;
  authorId: string;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  projectId?: string;
  userId?: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type WorkspaceRevision = {
  id: string;
  projectId: string;
  workspaceId: string;
  path: string;
  content: string;
  version: number;
  reason: string;
  createdAt: string;
};

export type RepositorySnapshot = {
  id: string;
  projectId: string;
  commitSha: string;
  source: Project["repositorySource"] | "manual";
  createdAt: string;
  files: number;
  symbols: number;
  relationships: number;
  nodeIds: string[];
  edgeIds: string[];
};

export type QualitySnapshot = {
  id: string;
  projectId: string;
  commitSha: string;
  score: number;
  coverageEstimate: number;
  criticalFindings: number;
  warningFindings: number;
  reason: string;
  createdAt: string;
};

export type AutonomousRun = {
  id: string;
  projectId: string;
  userId: string;
  objective: string;
  status: "pass" | "attention" | "blocked";
  plan: AutonomousChangePlan;
  sandbox: VirtualSandboxReport;
  createdAt: string;
};

export type RuntimeTraceRecord = {
  id: string;
  projectId: string;
  name: string;
  source: "opentelemetry" | "manual";
  spans: Array<{ id: string; parentId?: string; name: string; durationMs: number; status?: "ok" | "error"; filePath?: string; nodeId?: string; mappedFilePath?: string; confidence: number }>;
  createdAt: string;
};

export type ArchitectureDecisionRecord = {
  id: string;
  projectId: string;
  title: string;
  status: "proposed" | "accepted" | "superseded";
  context: string;
  decision: string;
  consequences: string;
  evidenceFiles: string[];
  authorId: string;
  createdAt: string;
};

export type AssistantConversation = {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type AssistantMessageRecord = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  result?: AiAnswer;
  createdAt: string;
};

export type OperationJobType = "repository.reindex" | "repository.incremental_sync" | "quality.scan" | "persistence.verify" | "audit.export";
export type OperationJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type OperationJob = {
  id: string;
  projectId: string;
  type: OperationJobType;
  status: OperationJobStatus;
  progress: number;
  attempts: number;
  maxAttempts: number;
  createdBy: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
};

export type AuthActionTokenRecord = {
  id: string;
  userId: string;
  kind: "password_reset" | "email_verification";
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  consumedAt?: string;
};

export type WebhookDeliveryRecord = {
  id: string;
  provider: "github";
  event: string;
  status: "received" | "processed" | "ignored" | "failed";
  receivedAt: string;
  processedAt?: string;
  projectIds: string[];
};

export type DeliveryRunKind = "pull_request" | "sandbox" | "incremental_sync" | "incident" | "automation";
export type DeliveryRun = {
  id: string;
  projectId: string;
  kind: DeliveryRunKind;
  status: "queued" | "running" | "passed" | "attention" | "blocked" | "failed";
  title: string;
  input: Record<string, unknown>;
  result?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
};

export type AgentAccessToken = {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  prefix: string;
  tokenHash: string;
  scopes: Array<"read" | "propose">;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
};

export type ProjectShare = {
  id: string;
  projectId: string;
  createdBy: string;
  label: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
};

export type UserNotification = {
  id: string;
  userId: string;
  projectId?: string;
  kind: "delivery" | "github" | "security" | "system";
  title: string;
  body: string;
  createdAt: string;
  readAt?: string;
};

export type StoreState = {
  users: UserRecord[];
  refreshTokens: RefreshTokenRecord[];
  projects: Project[];
  members: ProjectMember[];
  files: RepoFile[];
  workspaceDocs: WorkspaceDoc[];
  discussions: DiscussionThread[];
  replies: DiscussionReply[];
  tasks: ProjectTask[];
  contributions: Contribution[];
  patches: PatchProposal[];
  annotations: CodeAnnotation[];
  workspaceChat: WorkspaceChatMessage[];
  retrievals: RetrievalRecord[];
  auditEvents: AuditEvent[];
  workspaceRevisions?: WorkspaceRevision[];
  repositorySnapshots?: RepositorySnapshot[];
  qualitySnapshots?: QualitySnapshot[];
  autonomousRuns?: AutonomousRun[];
  runtimeTraces?: RuntimeTraceRecord[];
  architectureDecisions?: ArchitectureDecisionRecord[];
  assistantConversations?: AssistantConversation[];
  assistantMessages?: AssistantMessageRecord[];
  operationJobs?: OperationJob[];
  authActionTokens?: AuthActionTokenRecord[];
  webhookDeliveries?: WebhookDeliveryRecord[];
  deliveryRuns?: DeliveryRun[];
  agentAccessTokens?: AgentAccessToken[];
  projectShares?: ProjectShare[];
  notifications?: UserNotification[];
};

export class JsonStore {
  private state!: StoreState;
  private indexes = new Map<string, RepositoryIndex>();
  private readonly persistence: StatePersistence;
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string, databaseUrl?: string) {
    this.persistence = createStatePersistence(filePath, databaseUrl);
  }

  async init() {
    await this.persistence.init();
    const raw = await this.persistence.load();
    if (raw) {
      this.state = JSON.parse(raw) as StoreState;
      this.state.annotations ??= [];
      this.state.auditEvents ??= [];
      this.state.workspaceRevisions ??= [];
      this.state.repositorySnapshots ??= [];
      this.state.qualitySnapshots ??= [];
      this.state.autonomousRuns ??= [];
      this.state.runtimeTraces ??= [];
      this.state.architectureDecisions ??= [];
      this.state.assistantConversations ??= [];
      this.state.assistantMessages ??= [];
      this.state.operationJobs ??= [];
      this.state.authActionTokens ??= [];
      this.state.webhookDeliveries ??= [];
      this.state.deliveryRuns ??= [];
      this.state.agentAccessTokens ??= [];
      this.state.projectShares ??= [];
      this.state.notifications ??= [];
    } else {
      this.state = await seedState();
      await this.save();
    }
    this.rebuildIndexes();
    if (this.ensureBaselineSnapshots()) await this.save();
    return this;
  }

  snapshot() {
    return structuredClone(this.state);
  }

  async save() {
    const serialized = JSON.stringify(this.state, null, 2);
    const pending = this.saveQueue.then(() => this.persistence.save(serialized));
    this.saveQueue = pending.catch(() => undefined);
    await pending;
  }

  persistenceInfo() {
    return { provider: this.persistence.provider, durable: this.persistence.durable };
  }

  async persistenceHealth(): Promise<PersistenceHealth> {
    await this.saveQueue;
    return this.persistence.health();
  }

  async verifyPersistence() {
    await this.save();
    return this.persistence.health();
  }

  async close() {
    await this.saveQueue;
    await this.persistence.close();
  }

  async resetWithSeed() {
    this.state = await seedState();
    this.rebuildIndexes();
    this.ensureBaselineSnapshots();
    await this.save();
  }

  listUsers() {
    return this.state.users.map(publicUser);
  }

  getUser(id: string) {
    const user = this.state.users.find((candidate) => candidate.id === id);
    return user ? publicUser(user) : null;
  }

  getUserRecordByEmail(email: string) {
    return this.state.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  getUserRecord(id: string) {
    return this.state.users.find((user) => user.id === id) ?? null;
  }

  isEmailVerified(userId: string) {
    return Boolean(this.getUserRecord(userId)?.emailVerifiedAt);
  }

  async createUser(input: { name: string; email: string; password: string }) {
    if (this.getUserRecordByEmail(input.email)) {
      throw new Error("A user with this email already exists.");
    }
    const now = new Date().toISOString();
    const user: UserRecord = {
      id: crypto.randomUUID(),
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: await bcrypt.hash(input.password, 12),
      createdAt: now
    };
    this.state.users.push(user);
    const sampleProject = this.state.projects.find((project) => project.repositorySource === "sample" && project.published);
    if (sampleProject && !this.getMember(sampleProject.id, user.id)) {
      this.state.members.push({
        projectId: sampleProject.id,
        userId: user.id,
        role: "viewer",
        discussionAllowed: false,
        joinedAt: now
      });
    }
    await this.save();
    return publicUser(user);
  }

  async addRefreshToken(token: RefreshTokenRecord) {
    this.state.refreshTokens.push(token);
    await this.save();
  }

  getRefreshToken(id: string) {
    return this.state.refreshTokens.find((token) => token.id === id) ?? null;
  }

  async revokeRefreshToken(id: string) {
    const token = this.getRefreshToken(id);
    if (token && !token.revokedAt) {
      token.revokedAt = new Date().toISOString();
      await this.save();
    }
  }

  listRefreshTokens(userId: string) {
    return this.state.refreshTokens
      .filter((token) => token.userId === userId)
      .map(({ tokenHash: _tokenHash, ...token }) => token)
      .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
  }

  async revokeAllRefreshTokens(userId: string, exceptId?: string) {
    const now = new Date().toISOString();
    let revoked = 0;
    for (const token of this.state.refreshTokens) {
      if (token.userId === userId && token.id !== exceptId && !token.revokedAt) {
        token.revokedAt = now;
        revoked += 1;
      }
    }
    if (revoked > 0) await this.save();
    return revoked;
  }

  async updateUserPassword(userId: string, password: string) {
    const user = this.getUserRecord(userId);
    if (!user) return false;
    user.passwordHash = await bcrypt.hash(password, 12);
    await this.revokeAllRefreshTokens(userId);
    await this.save();
    return true;
  }

  async markEmailVerified(userId: string) {
    const user = this.getUserRecord(userId);
    if (!user) return false;
    user.emailVerifiedAt = new Date().toISOString();
    await this.save();
    return true;
  }

  async addAuthActionToken(input: Omit<AuthActionTokenRecord, "id" | "createdAt">) {
    this.state.authActionTokens ??= [];
    const now = new Date().toISOString();
    for (const token of this.state.authActionTokens) {
      if (token.userId === input.userId && token.kind === input.kind && !token.consumedAt) token.consumedAt = now;
    }
    const record: AuthActionTokenRecord = { ...input, id: crypto.randomUUID(), createdAt: now };
    this.state.authActionTokens.unshift(record);
    this.state.authActionTokens = this.state.authActionTokens.slice(0, 500);
    await this.save();
    return record;
  }

  async consumeAuthActionToken(kind: AuthActionTokenRecord["kind"], tokenHash: string) {
    const record = (this.state.authActionTokens ?? []).find((candidate) =>
      candidate.kind === kind &&
      candidate.tokenHash === tokenHash &&
      !candidate.consumedAt &&
      Date.parse(candidate.expiresAt) > Date.now()
    );
    if (!record) return null;
    record.consumedAt = new Date().toISOString();
    await this.save();
    return record;
  }

  listPublicProjects(search = "") {
    const needle = search.trim().toLowerCase();
    return this.state.projects.filter((project) => {
      const visible = project.visibility === "public" && project.published;
      if (!visible) return false;
      if (!needle) return true;
      return [project.name, project.description, project.tags.join(" "), project.languages.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }

  listProjectsForUser(userId: string) {
    const ids = new Set(this.state.members.filter((member) => member.userId === userId).map((member) => member.projectId));
    return this.state.projects.filter((project) => ids.has(project.id));
  }

  getProject(id: string) {
    return this.state.projects.find((project) => project.id === id) ?? null;
  }

  getProjectBySlug(slug: string) {
    return this.state.projects.find((project) => project.slug === slug) ?? null;
  }

  findProjectsByRepositoryUrl(repoUrl: string) {
    const normalized = normalizeRepositoryUrl(repoUrl);
    return this.state.projects.filter((project) => project.repoUrl && normalizeRepositoryUrl(project.repoUrl) === normalized);
  }

  getRole(projectId: string, userId?: string | null): ProjectRole | null {
    if (!userId) return null;
    return this.state.members.find((member) => member.projectId === projectId && member.userId === userId)?.role ?? null;
  }

  getMember(projectId: string, userId: string) {
    return this.state.members.find((member) => member.projectId === projectId && member.userId === userId) ?? null;
  }

  listMembers(projectId: string) {
    return this.state.members.filter((member) => member.projectId === projectId);
  }

  async updateMember(projectId: string, userId: string, role: ProjectRole, discussionAllowed = true) {
    const member = this.getMember(projectId, userId);
    if (member) {
      member.role = role;
      member.discussionAllowed = discussionAllowed;
    } else {
      this.state.members.push({
        projectId,
        userId,
        role,
        discussionAllowed,
        joinedAt: new Date().toISOString()
      });
    }
    await this.save();
  }

  async createProject(ownerId: string, input: ProjectCreateInput) {
    const now = new Date().toISOString();
    const project: Project = {
      id: crypto.randomUUID(),
      name: input.name,
      slug: slugify(input.name),
      description: input.description,
      tags: input.tags,
      languages: [],
      visibility: input.visibility,
      published: input.published,
      repositorySource: "zip",
      commitSha: `draft-${Date.now()}`,
      guidelines: input.guidelines,
      createdAt: now,
      updatedAt: now
    };
    this.state.projects.push(project);
    this.state.members.push({
      projectId: project.id,
      userId: ownerId,
      role: "owner",
      discussionAllowed: true,
      joinedAt: now
    });
    await this.recordAudit({ projectId: project.id, userId: ownerId, action: "project.created", metadata: { name: project.name } });
    await this.save();
    return project;
  }

  async replaceProjectFiles(projectId: string, files: RepoFile[], source: Project["repositorySource"], commitSha: string) {
    this.state.files = this.state.files.filter((file) => file.projectId !== projectId);
    this.state.workspaceDocs = this.state.workspaceDocs.filter((doc) => doc.projectId !== projectId);
    this.state.files.push(...files);
    for (const file of files) {
      this.state.workspaceDocs.push({
        projectId,
        workspaceId: "main",
        path: file.path,
        content: file.content,
        version: 1,
        updatedAt: new Date().toISOString()
      });
    }
    const project = this.getProject(projectId);
    if (project) {
      project.repositorySource = source;
      project.commitSha = commitSha;
      project.languages = [...new Set(files.map((file) => file.language))].sort();
      project.updatedAt = new Date().toISOString();
    }
    this.rebuildIndex(projectId);
    this.captureRepositorySnapshot(projectId, source);
    this.captureQualitySnapshot(projectId, "Repository import");
    await this.save();
  }

  async applyIncrementalProjectFiles(projectId: string, upserts: RepoFile[], removedPaths: string[], commitSha: string) {
    const project = this.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const removed = new Set(removedPaths.map(normalizeRepositoryPath));
    const updateByPath = new Map(upserts.map((file) => [normalizeRepositoryPath(file.path), { ...file, projectId, path: normalizeRepositoryPath(file.path) }]));
    this.state.files = this.state.files.filter((file) => file.projectId !== projectId || (!removed.has(file.path) && !updateByPath.has(file.path)));
    this.state.files.push(...updateByPath.values());
    this.state.workspaceDocs = this.state.workspaceDocs.filter((doc) =>
      doc.projectId !== projectId || (!removed.has(doc.path) && !updateByPath.has(doc.path))
    );
    const now = new Date().toISOString();
    for (const file of updateByPath.values()) {
      this.state.workspaceDocs.push({ projectId, workspaceId: "main", path: file.path, content: file.content, version: 1, updatedAt: now });
    }
    project.commitSha = commitSha;
    project.languages = [...new Set(this.listFiles(projectId).map((file) => file.language))].sort();
    project.updatedAt = now;
    const index = this.rebuildIndex(projectId);
    this.captureRepositorySnapshot(projectId, project.repositorySource, true);
    this.captureQualitySnapshot(projectId, "Incremental repository sync");
    await this.recordAudit({
      projectId,
      action: "repository.incremental_sync",
      metadata: { commitSha, upserted: updateByPath.size, removed: removed.size, files: index.files.length, symbols: index.symbols.length }
    });
    await this.save();
    return { upserted: updateByPath.size, removed: removed.size, index };
  }

  async updateProjectRepository(projectId: string, repoUrl: string) {
    const project = this.getProject(projectId);
    if (!project) return null;
    project.repoUrl = repoUrl;
    project.updatedAt = new Date().toISOString();
    await this.save();
    return project;
  }

  listFiles(projectId: string) {
    return this.state.files.filter((file) => file.projectId === projectId);
  }

  getFile(projectId: string, filePath: string) {
    return this.state.files.find((file) => file.projectId === projectId && file.path === filePath) ?? null;
  }

  getWorkspaceDocs(projectId: string, workspaceId = "main") {
    return this.state.workspaceDocs.filter((doc) => doc.projectId === projectId && doc.workspaceId === workspaceId);
  }

  getWorkspaceDoc(projectId: string, workspaceId: string, filePath: string) {
    return (
      this.state.workspaceDocs.find(
        (doc) => doc.projectId === projectId && doc.workspaceId === workspaceId && doc.path === filePath
      ) ?? null
    );
  }

  async upsertWorkspaceDoc(projectId: string, workspaceId: string, filePath: string, content: string) {
    const now = new Date().toISOString();
    const existing = this.getWorkspaceDoc(projectId, workspaceId, filePath);
    if (existing) {
      const latestRevision = this.listWorkspaceRevisions(projectId, workspaceId, filePath)[0];
      const shouldSnapshot = existing.content !== content && (!latestRevision || Date.now() - Date.parse(latestRevision.createdAt) > 30_000);
      if (shouldSnapshot) {
        this.state.workspaceRevisions!.unshift({
          id: crypto.randomUUID(),
          projectId,
          workspaceId,
          path: filePath,
          content: existing.content,
          version: existing.version,
          reason: "Collaborative edit snapshot",
          createdAt: now
        });
      }
      existing.content = content;
      existing.version += 1;
      existing.updatedAt = now;
    } else {
      this.state.workspaceDocs.push({ projectId, workspaceId, path: filePath, content, version: 1, updatedAt: now });
    }
    await this.save();
    return this.getWorkspaceDoc(projectId, workspaceId, filePath)!;
  }

  listWorkspaceRevisions(projectId: string, workspaceId: string, filePath: string) {
    return (this.state.workspaceRevisions ?? [])
      .filter((revision) => revision.projectId === projectId && revision.workspaceId === workspaceId && revision.path === filePath)
      .slice(0, 20);
  }

  async restoreWorkspaceRevision(projectId: string, workspaceId: string, revisionId: string, userId: string) {
    const revision = (this.state.workspaceRevisions ?? []).find((candidate) => candidate.projectId === projectId && candidate.workspaceId === workspaceId && candidate.id === revisionId);
    if (!revision) return null;
    const doc = await this.upsertWorkspaceDoc(projectId, workspaceId, revision.path, revision.content);
    await this.recordAudit({ projectId, userId, action: "workspace.revision_restored", metadata: { revisionId, path: revision.path, version: revision.version } });
    await this.save();
    return { revision, doc };
  }

  getIndex(projectId: string) {
    const index = this.indexes.get(projectId);
    if (index) return index;
    return this.rebuildIndex(projectId);
  }

  rebuildIndex(projectId: string) {
    const project = this.getProject(projectId);
    const files = this.listFiles(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const index = indexRepository(projectId, project.commitSha, files);
    this.indexes.set(projectId, index);
    project.languages = index.languages;
    return index;
  }

  rebuildIndexes() {
    this.indexes.clear();
    for (const project of this.state.projects) {
      this.rebuildIndex(project.id);
    }
  }

  listRepositorySnapshots(projectId: string) {
    return (this.state.repositorySnapshots ?? []).filter((snapshot) => snapshot.projectId === projectId).slice(0, 20);
  }

  listQualitySnapshots(projectId: string) {
    return (this.state.qualitySnapshots ?? []).filter((snapshot) => snapshot.projectId === projectId).slice(0, 30);
  }

  getRepositoryEvolution(projectId: string, fromId?: string, toId?: string) {
    const snapshots = this.listRepositorySnapshots(projectId);
    const to = snapshots.find((snapshot) => snapshot.id === toId) ?? snapshots[0];
    const from = snapshots.find((snapshot) => snapshot.id === fromId) ?? snapshots[1] ?? snapshots[0];
    if (!from || !to) return { snapshots, from: null, to: null, addedNodes: [], removedNodes: [], addedEdges: 0, removedEdges: 0 };
    const fromNodes = new Set(from.nodeIds);
    const toNodes = new Set(to.nodeIds);
    const fromEdges = new Set(from.edgeIds);
    const toEdges = new Set(to.edgeIds);
    return {
      snapshots,
      from,
      to,
      addedNodes: to.nodeIds.filter((id) => !fromNodes.has(id)),
      removedNodes: from.nodeIds.filter((id) => !toNodes.has(id)),
      addedEdges: to.edgeIds.filter((id) => !fromEdges.has(id)).length,
      removedEdges: from.edgeIds.filter((id) => !toEdges.has(id)).length
    };
  }

  async captureLabSnapshot(projectId: string, userId: string) {
    const repository = this.captureRepositorySnapshot(projectId, "manual", true);
    const quality = this.captureQualitySnapshot(projectId, "Manual engineering baseline");
    await this.recordAudit({ projectId, userId, action: "labs.baseline_captured", metadata: { repositorySnapshotId: repository.id, qualitySnapshotId: quality.id } });
    await this.save();
    return { repository, quality };
  }

  private ensureBaselineSnapshots() {
    this.state.repositorySnapshots ??= [];
    this.state.qualitySnapshots ??= [];
    let changed = false;
    for (const project of this.state.projects) {
      if (!this.state.repositorySnapshots.some((snapshot) => snapshot.projectId === project.id)) {
        this.captureRepositorySnapshot(project.id, project.repositorySource, true, project.updatedAt);
        changed = true;
      }
      if (!this.state.qualitySnapshots.some((snapshot) => snapshot.projectId === project.id)) {
        this.captureQualitySnapshot(project.id, "Initial repository baseline", project.updatedAt);
        changed = true;
      }
    }
    return changed;
  }

  private captureRepositorySnapshot(projectId: string, source: RepositorySnapshot["source"], force = false, createdAt = new Date().toISOString()) {
    this.state.repositorySnapshots ??= [];
    const project = this.getProject(projectId);
    const index = this.getIndex(projectId);
    const latest = this.listRepositorySnapshots(projectId)[0];
    if (!force && latest?.commitSha === project?.commitSha && latest.nodeIds.length === index.graph.nodes.length && latest.edgeIds.length === index.graph.edges.length) return latest;
    const snapshot: RepositorySnapshot = {
      id: crypto.randomUUID(),
      projectId,
      commitSha: project?.commitSha ?? index.commitSha,
      source,
      createdAt,
      files: index.files.length,
      symbols: index.symbols.length,
      relationships: index.graph.edges.length,
      nodeIds: index.graph.nodes.map((node) => node.id),
      edgeIds: index.graph.edges.map((edge) => edge.id)
    };
    this.state.repositorySnapshots.unshift(snapshot);
    this.state.repositorySnapshots = this.state.repositorySnapshots.filter((candidate, position, all) => position === all.findIndex((item) => item.id === candidate.id)).slice(0, 80);
    return snapshot;
  }

  private captureQualitySnapshot(projectId: string, reason: string, createdAt = new Date().toISOString()) {
    this.state.qualitySnapshots ??= [];
    const project = this.getProject(projectId);
    const health = analyzeRepository(this.getIndex(projectId));
    const snapshot: QualitySnapshot = {
      id: crypto.randomUUID(),
      projectId,
      commitSha: project?.commitSha ?? "unknown",
      score: health.score,
      coverageEstimate: health.coverageEstimate,
      criticalFindings: health.issues.filter((issue) => issue.severity === "critical").length,
      warningFindings: health.issues.filter((issue) => issue.severity === "warning").length,
      reason,
      createdAt
    };
    this.state.qualitySnapshots.unshift(snapshot);
    this.state.qualitySnapshots = this.state.qualitySnapshots.slice(0, 120);
    return snapshot;
  }

  listDiscussions(projectId: string) {
    return this.state.discussions.filter((thread) => thread.projectId === projectId);
  }

  listReplies(projectId: string, threadId: string) {
    return this.state.replies.filter((reply) => reply.projectId === projectId && reply.threadId === threadId);
  }

  async createDiscussion(projectId: string, authorId: string, title: string, body: string) {
    const thread: DiscussionThread = {
      id: crypto.randomUUID(),
      projectId,
      authorId,
      title,
      body,
      createdAt: new Date().toISOString(),
      locked: false
    };
    this.state.discussions.unshift(thread);
    await this.save();
    return thread;
  }

  async createReply(projectId: string, threadId: string, authorId: string, body: string) {
    const reply: DiscussionReply = {
      id: crypto.randomUUID(),
      projectId,
      threadId,
      authorId,
      body,
      createdAt: new Date().toISOString(),
      moderated: false
    };
    this.state.replies.push(reply);
    await this.save();
    return reply;
  }

  listTasks(projectId: string) {
    return this.state.tasks.filter((task) => task.projectId === projectId);
  }

  async createTask(projectId: string, title: string, assigneeId?: string) {
    const task: ProjectTask = {
      id: crypto.randomUUID(),
      projectId,
      title,
      status: "todo",
      assigneeId,
      createdAt: new Date().toISOString()
    };
    this.state.tasks.unshift(task);
    await this.recordAudit({ projectId, action: "task.created", metadata: { taskId: task.id, title: task.title } });
    await this.save();
    return task;
  }

  async updateTask(projectId: string, taskId: string, status: ProjectTask["status"]) {
    const task = this.state.tasks.find((candidate) => candidate.projectId === projectId && candidate.id === taskId);
    if (!task) return null;
    task.status = status;
    await this.recordAudit({ projectId, action: "task.status_changed", metadata: { taskId, status } });
    await this.save();
    return task;
  }

  async deleteTask(projectId: string, taskId: string) {
    const index = this.state.tasks.findIndex((task) => task.projectId === projectId && task.id === taskId);
    if (index < 0) return false;
    this.state.tasks.splice(index, 1);
    await this.recordAudit({ projectId, action: "task.deleted", metadata: { taskId } });
    await this.save();
    return true;
  }

  listContributions(projectId: string) {
    return this.state.contributions.filter((contribution) => contribution.projectId === projectId);
  }

  getContribution(projectId: string, id: string) {
    return this.state.contributions.find((contribution) => contribution.projectId === projectId && contribution.id === id) ?? null;
  }

  async createContribution(input: Omit<Contribution, "id" | "createdAt">) {
    const contribution: Contribution = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    this.state.contributions.unshift(contribution);
    await this.save();
    return contribution;
  }

  async savePatch(patch: PatchProposal) {
    const existing = this.state.patches.findIndex((candidate) => candidate.id === patch.id);
    if (existing >= 0) this.state.patches[existing] = patch;
    else this.state.patches.unshift(patch);
    await this.save();
    return patch;
  }

  getPatch(projectId: string, patchId: string) {
    return this.state.patches.find((patch) => patch.projectId === projectId && patch.id === patchId) ?? null;
  }

  listPatches(projectId: string) {
    return this.state.patches.filter((patch) => patch.projectId === projectId);
  }

  async saveRetrieval(record: RetrievalRecord) {
    this.state.retrievals.unshift(record);
    await this.save();
  }

  listRetrievals(projectId: string, limit = 100) {
    return this.state.retrievals.filter((record) => record.projectId === projectId).slice(0, limit);
  }

  listAutonomousRuns(projectId: string) {
    return (this.state.autonomousRuns ?? []).filter((run) => run.projectId === projectId).slice(0, 20);
  }

  async saveAutonomousRun(input: Omit<AutonomousRun, "id" | "createdAt">) {
    const run: AutonomousRun = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    this.state.autonomousRuns ??= [];
    this.state.autonomousRuns.unshift(run);
    this.state.autonomousRuns = this.state.autonomousRuns.slice(0, 100);
    await this.recordAudit({ projectId: run.projectId, userId: run.userId, action: "advanced.change_run", metadata: { runId: run.id, status: run.status, objective: run.objective } });
    await this.save();
    return run;
  }

  listRuntimeTraces(projectId: string) {
    return (this.state.runtimeTraces ?? []).filter((trace) => trace.projectId === projectId).slice(0, 20);
  }

  async saveRuntimeTrace(input: Omit<RuntimeTraceRecord, "id" | "createdAt">, userId: string) {
    const trace: RuntimeTraceRecord = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    this.state.runtimeTraces ??= [];
    this.state.runtimeTraces.unshift(trace);
    this.state.runtimeTraces = this.state.runtimeTraces.slice(0, 100);
    await this.recordAudit({ projectId: trace.projectId, userId, action: "advanced.trace_ingested", metadata: { traceId: trace.id, spans: trace.spans.length } });
    await this.save();
    return trace;
  }

  listArchitectureDecisions(projectId: string) {
    return (this.state.architectureDecisions ?? []).filter((decision) => decision.projectId === projectId).slice(0, 50);
  }

  async createArchitectureDecision(input: Omit<ArchitectureDecisionRecord, "id" | "createdAt">) {
    const decision: ArchitectureDecisionRecord = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    this.state.architectureDecisions ??= [];
    this.state.architectureDecisions.unshift(decision);
    await this.recordAudit({ projectId: decision.projectId, userId: decision.authorId, action: "advanced.adr_created", metadata: { decisionId: decision.id, title: decision.title, status: decision.status } });
    await this.save();
    return decision;
  }

  listAssistantConversations(projectId: string, userId: string) {
    return (this.state.assistantConversations ?? []).filter((conversation) => conversation.projectId === projectId && conversation.userId === userId).slice(0, 50);
  }

  getAssistantConversation(projectId: string, conversationId: string, userId: string) {
    const conversation = (this.state.assistantConversations ?? []).find((candidate) => candidate.id === conversationId && candidate.projectId === projectId && candidate.userId === userId) ?? null;
    if (!conversation) return null;
    return { conversation, messages: (this.state.assistantMessages ?? []).filter((message) => message.conversationId === conversation.id) };
  }

  async createAssistantConversation(projectId: string, userId: string, title: string) {
    const now = new Date().toISOString();
    const conversation: AssistantConversation = { id: crypto.randomUUID(), projectId, userId, title: title.trim().replace(/\s+/g, " ").slice(0, 64), createdAt: now, updatedAt: now };
    this.state.assistantConversations ??= [];
    this.state.assistantConversations.unshift(conversation);
    await this.save();
    return conversation;
  }

  async addAssistantMessage(conversationId: string, role: AssistantMessageRecord["role"], content: string, result?: AiAnswer) {
    const message: AssistantMessageRecord = { id: crypto.randomUUID(), conversationId, role, content, result, createdAt: new Date().toISOString() };
    this.state.assistantMessages ??= [];
    this.state.assistantMessages.push(message);
    const conversation = (this.state.assistantConversations ?? []).find((candidate) => candidate.id === conversationId);
    if (conversation) conversation.updatedAt = message.createdAt;
    await this.save();
    return message;
  }

  async deleteAssistantConversation(projectId: string, conversationId: string, userId: string) {
    const index = (this.state.assistantConversations ?? []).findIndex((conversation) => conversation.id === conversationId && conversation.projectId === projectId && conversation.userId === userId);
    if (index < 0) return false;
    this.state.assistantConversations!.splice(index, 1);
    this.state.assistantMessages = (this.state.assistantMessages ?? []).filter((message) => message.conversationId !== conversationId);
    await this.save();
    return true;
  }

  listAnnotations(projectId: string) {
    return this.state.annotations.filter((annotation) => annotation.projectId === projectId);
  }

  async createAnnotation(input: {
    projectId: string;
    filePath: string;
    range: SourceRange;
    symbolId?: string;
    body: string;
    authorId: string;
    sourceRevision: string;
  }) {
    const annotation: CodeAnnotation = {
      ...input,
      id: crypto.randomUUID(),
      outdated: false,
      createdAt: new Date().toISOString()
    };
    this.state.annotations.unshift(annotation);
    await this.recordAudit({
      projectId: input.projectId,
      userId: input.authorId,
      action: "annotation.created",
      metadata: { annotationId: annotation.id, filePath: input.filePath, symbolId: input.symbolId }
    });
    await this.save();
    return annotation;
  }

  async deleteAnnotation(projectId: string, annotationId: string, userId: string, canManage = false) {
    const index = this.state.annotations.findIndex((annotation) => annotation.projectId === projectId && annotation.id === annotationId);
    if (index < 0) return false;
    const annotation = this.state.annotations[index]!;
    if (annotation.authorId !== userId && !canManage) return false;
    this.state.annotations.splice(index, 1);
    await this.recordAudit({ projectId, userId, action: "annotation.deleted", metadata: { annotationId } });
    await this.save();
    return true;
  }

  listAuditEvents(projectId: string, limit = 40) {
    return this.state.auditEvents.filter((event) => event.projectId === projectId).slice(0, limit);
  }

  listWorkspaceChat(projectId: string, workspaceId: string) {
    return this.state.workspaceChat.filter((message) => message.projectId === projectId && message.workspaceId === workspaceId);
  }

  async addWorkspaceChat(projectId: string, workspaceId: string, authorId: string, body: string) {
    const message: WorkspaceChatMessage = {
      id: crypto.randomUUID(),
      projectId,
      workspaceId,
      authorId,
      body,
      createdAt: new Date().toISOString()
    };
    this.state.workspaceChat.push(message);
    await this.save();
    return message;
  }

  async recordAudit(input: Omit<AuditEvent, "id" | "createdAt">) {
    this.state.auditEvents.unshift({ ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
  }

  listOperationJobs(projectId: string, limit = 30) {
    return (this.state.operationJobs ?? []).filter((job) => job.projectId === projectId).slice(0, limit);
  }

  listPendingOperationJobs() {
    return (this.state.operationJobs ?? []).filter((job) => job.status === "queued" || job.status === "running");
  }

  getOperationJob(id: string) {
    return (this.state.operationJobs ?? []).find((job) => job.id === id) ?? null;
  }

  async createOperationJob(input: { projectId: string; type: OperationJobType; createdBy: string; maxAttempts?: number; metadata?: Record<string, unknown> }) {
    const job: OperationJob = {
      id: crypto.randomUUID(),
      projectId: input.projectId,
      type: input.type,
      status: "queued",
      progress: 0,
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      metadata: input.metadata
    };
    this.state.operationJobs ??= [];
    this.state.operationJobs.unshift(job);
    this.state.operationJobs = this.state.operationJobs.slice(0, 500);
    await this.recordAudit({ projectId: job.projectId, userId: job.createdBy, action: "operations.job_queued", metadata: { jobId: job.id, type: job.type } });
    await this.save();
    return job;
  }

  async updateOperationJob(id: string, patch: Partial<Omit<OperationJob, "id" | "projectId" | "type" | "createdBy" | "createdAt">>) {
    const job = this.getOperationJob(id);
    if (!job) return null;
    Object.assign(job, patch);
    await this.save();
    return job;
  }

  async cancelOperationJob(projectId: string, id: string) {
    const job = this.getOperationJob(id);
    if (!job || job.projectId !== projectId || !["queued", "running"].includes(job.status)) return null;
    job.status = "cancelled";
    job.completedAt = new Date().toISOString();
    await this.recordAudit({ projectId, action: "operations.job_cancelled", metadata: { jobId: id, type: job.type } });
    await this.save();
    return job;
  }

  getWebhookDelivery(id: string) {
    return (this.state.webhookDeliveries ?? []).find((delivery) => delivery.id === id) ?? null;
  }

  async recordWebhookDelivery(input: Omit<WebhookDeliveryRecord, "receivedAt">) {
    const existing = this.getWebhookDelivery(input.id);
    if (existing) return existing;
    const delivery: WebhookDeliveryRecord = { ...input, receivedAt: new Date().toISOString() };
    this.state.webhookDeliveries ??= [];
    this.state.webhookDeliveries.unshift(delivery);
    this.state.webhookDeliveries = this.state.webhookDeliveries.slice(0, 1000);
    await this.save();
    return delivery;
  }

  async updateWebhookDelivery(id: string, patch: Partial<Pick<WebhookDeliveryRecord, "status" | "processedAt" | "projectIds">>) {
    const delivery = this.getWebhookDelivery(id);
    if (!delivery) return null;
    Object.assign(delivery, patch);
    await this.save();
    return delivery;
  }

  listDeliveryRuns(projectId: string, kind?: DeliveryRunKind, limit = 60) {
    return (this.state.deliveryRuns ?? [])
      .filter((run) => run.projectId === projectId && (!kind || run.kind === kind))
      .slice(0, limit);
  }

  async saveDeliveryRun(input: Omit<DeliveryRun, "id" | "createdAt">) {
    const run: DeliveryRun = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    this.state.deliveryRuns ??= [];
    this.state.deliveryRuns.unshift(run);
    this.state.deliveryRuns = this.state.deliveryRuns.slice(0, 800);
    await this.recordAudit({ projectId: run.projectId, userId: run.createdBy, action: `delivery.${run.kind}`, metadata: { runId: run.id, status: run.status, title: run.title } });
    await this.notifyProject(run.projectId, {
      kind: "delivery",
      title: `${deliveryKindLabel(run.kind)} ${run.status}`,
      body: `${run.title} finished with status ${run.status}.`
    });
    await this.save();
    return run;
  }

  listAgentAccessTokens(projectId: string) {
    return (this.state.agentAccessTokens ?? []).filter((token) => token.projectId === projectId).slice(0, 100);
  }

  getAgentAccessTokenByHash(tokenHash: string) {
    const token = (this.state.agentAccessTokens ?? []).find((candidate) => candidate.tokenHash === tokenHash) ?? null;
    if (!token || token.revokedAt || (token.expiresAt && Date.parse(token.expiresAt) <= Date.now())) return null;
    return token;
  }

  async createAgentAccessToken(input: Omit<AgentAccessToken, "id" | "createdAt">) {
    const token: AgentAccessToken = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    this.state.agentAccessTokens ??= [];
    this.state.agentAccessTokens.unshift(token);
    this.state.agentAccessTokens = this.state.agentAccessTokens.slice(0, 500);
    await this.recordAudit({ projectId: token.projectId, userId: token.userId, action: "agent.token_created", metadata: { tokenId: token.id, name: token.name, scopes: token.scopes } });
    await this.save();
    return token;
  }

  async touchAgentAccessToken(id: string) {
    const token = (this.state.agentAccessTokens ?? []).find((candidate) => candidate.id === id);
    if (!token) return null;
    token.lastUsedAt = new Date().toISOString();
    await this.save();
    return token;
  }

  async revokeAgentAccessToken(projectId: string, id: string, userId: string) {
    const token = (this.state.agentAccessTokens ?? []).find((candidate) => candidate.id === id && candidate.projectId === projectId);
    if (!token || token.revokedAt) return null;
    token.revokedAt = new Date().toISOString();
    await this.recordAudit({ projectId, userId, action: "agent.token_revoked", metadata: { tokenId: id, name: token.name } });
    await this.save();
    return token;
  }

  listProjectShares(projectId: string) {
    return (this.state.projectShares ?? []).filter((share) => share.projectId === projectId).slice(0, 100);
  }

  getProjectShareByHash(tokenHash: string) {
    const share = (this.state.projectShares ?? []).find((candidate) => candidate.tokenHash === tokenHash) ?? null;
    if (!share || share.revokedAt || Date.parse(share.expiresAt) <= Date.now()) return null;
    return share;
  }

  async createProjectShare(input: Omit<ProjectShare, "id" | "createdAt">) {
    const share: ProjectShare = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    this.state.projectShares ??= [];
    this.state.projectShares.unshift(share);
    this.state.projectShares = this.state.projectShares.slice(0, 300);
    await this.recordAudit({ projectId: share.projectId, userId: share.createdBy, action: "share.created", metadata: { shareId: share.id, label: share.label, expiresAt: share.expiresAt } });
    await this.save();
    return share;
  }

  async revokeProjectShare(projectId: string, id: string, userId: string) {
    const share = (this.state.projectShares ?? []).find((candidate) => candidate.id === id && candidate.projectId === projectId);
    if (!share || share.revokedAt) return null;
    share.revokedAt = new Date().toISOString();
    await this.recordAudit({ projectId, userId, action: "share.revoked", metadata: { shareId: id, label: share.label } });
    await this.save();
    return share;
  }

  listNotifications(userId: string, limit = 40) {
    return (this.state.notifications ?? []).filter((notification) => notification.userId === userId).slice(0, limit);
  }

  async createNotification(input: Omit<UserNotification, "id" | "createdAt">) {
    const notification: UserNotification = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    this.state.notifications ??= [];
    this.state.notifications.unshift(notification);
    this.state.notifications = this.state.notifications.slice(0, 1_500);
    await this.save();
    return notification;
  }

  async markNotificationRead(userId: string, id: string) {
    const notification = (this.state.notifications ?? []).find((candidate) => candidate.id === id && candidate.userId === userId);
    if (!notification) return null;
    notification.readAt ??= new Date().toISOString();
    await this.save();
    return notification;
  }

  private async notifyProject(projectId: string, input: Pick<UserNotification, "kind" | "title" | "body">) {
    const now = new Date().toISOString();
    this.state.notifications ??= [];
    for (const member of this.listMembers(projectId)) {
      this.state.notifications.unshift({ id: crypto.randomUUID(), userId: member.userId, projectId, ...input, createdAt: now });
    }
    this.state.notifications = this.state.notifications.slice(0, 1_500);
  }
}

export async function createStore(filePath: string, databaseUrl?: string) {
  return new JsonStore(filePath, databaseUrl).init();
}

function publicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt
  };
}

function normalizeRepositoryUrl(value: string) {
  return value.trim().toLowerCase().replace(/\.git$/, "").replace(/\/$/, "");
}

function normalizeRepositoryPath(value: string) {
  return value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function deliveryKindLabel(kind: DeliveryRunKind) {
  return ({
    pull_request: "Pull request review",
    sandbox: "Verification run",
    incremental_sync: "Incremental sync",
    incident: "Incident trace",
    automation: "Automation mission"
  } as const)[kind];
}

async function seedState(): Promise<StoreState> {
  const now = new Date().toISOString();
  const ownerId = "user-owner";
  const maintainerId = "user-maintainer";
  const contributorId = "user-contributor";
  const viewerId = "user-viewer";
  const projectId = "project-sample-taskpilot";
  const files = buildSampleRepoFiles(projectId, now);
  const project: Project = {
    id: projectId,
    name: "TaskPilot Sample",
    slug: "taskpilot-sample",
    description: "A seeded Express and TypeScript repository for exploring CodeMesh without external credentials.",
    tags: ["sample", "typescript", "express", "auth"],
    languages: [...new Set(files.map((file) => file.language))].sort(),
    visibility: "public",
    published: true,
    repositorySource: "sample",
    repoUrl: "sample://taskpilot",
    commitSha: SAMPLE_COMMIT,
    guidelines:
      "Keep changes focused, explain verification clearly, and never publish to the upstream repository without maintainer review.",
    createdAt: now,
    updatedAt: now
  };
  return {
    users: [
      {
        id: ownerId,
        name: "Olivia Owner",
        email: "owner@codemesh.dev",
        passwordHash: await bcrypt.hash("CodeMesh123!", 12),
        createdAt: now
      },
      {
        id: maintainerId,
        name: "Mika Maintainer",
        email: "maintainer@codemesh.dev",
        passwordHash: await bcrypt.hash("CodeMesh123!", 12),
        createdAt: now
      },
      {
        id: contributorId,
        name: "Casey Contributor",
        email: "contributor@codemesh.dev",
        passwordHash: await bcrypt.hash("CodeMesh123!", 12),
        createdAt: now
      },
      {
        id: viewerId,
        name: "Vera Viewer",
        email: "viewer@codemesh.dev",
        passwordHash: await bcrypt.hash("CodeMesh123!", 12),
        createdAt: now
      }
    ],
    refreshTokens: [],
    projects: [project],
    members: [
      { projectId, userId: ownerId, role: "owner", discussionAllowed: true, joinedAt: now },
      { projectId, userId: maintainerId, role: "maintainer", discussionAllowed: true, joinedAt: now },
      { projectId, userId: contributorId, role: "contributor", discussionAllowed: true, joinedAt: now },
      { projectId, userId: viewerId, role: "viewer", discussionAllowed: false, joinedAt: now }
    ],
    files,
    workspaceDocs: files.map((file) => ({
      projectId,
      workspaceId: "main",
      path: file.path,
      content: file.content,
      version: 1,
      updatedAt: now
    })),
    discussions: [
      {
        id: "discussion-sample-auth",
        projectId,
        title: "Should auth errors expose machine-readable codes?",
        body:
          "The sample API currently returns display text for auth errors. A stable code could help clients, logs, and tests.",
        authorId: maintainerId,
        createdAt: now,
        locked: false
      }
    ],
    replies: [
      {
        id: "reply-sample-auth-1",
        threadId: "discussion-sample-auth",
        projectId,
        body: "Good first AI patch candidate: keep the behavior unchanged but add a structured code field.",
        authorId: ownerId,
        createdAt: now,
        moderated: false
      }
    ],
    tasks: [
      {
        id: "task-sample-1",
        projectId,
        title: "Trace the login route and session middleware",
        status: "doing",
        assigneeId: contributorId,
        createdAt: now
      },
      {
        id: "task-sample-2",
        projectId,
        title: "Add a reviewable auth error-code patch",
        status: "todo",
        assigneeId: maintainerId,
        createdAt: now
      }
    ],
    contributions: [
      {
        id: "contribution-sample-1",
        projectId,
        workspaceId: "main",
        title: "Auth error-code proposal",
        summary: "Draft contribution created from the seeded demonstration workflow.",
        authorId: contributorId,
        status: "draft",
        createdAt: now
      }
    ],
    patches: [],
    annotations: [],
    workspaceChat: [
      {
        id: "chat-sample-1",
        projectId,
        workspaceId: "main",
        authorId: maintainerId,
        body: "Open src/auth/session.ts and ask the assistant for a reviewable auth patch.",
        createdAt: now
      }
    ],
    retrievals: [],
    auditEvents: [
      {
        id: "audit-seed",
        projectId,
        userId: ownerId,
        action: "project.seeded",
        metadata: { source: "sample" },
        createdAt: now
      }
    ]
  };
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

