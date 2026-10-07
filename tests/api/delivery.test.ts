import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JsonStore, type StoreState } from "../../apps/api/src/db/store";
import { hashToken } from "../../apps/api/src/routes/delivery";

describe("delivery platform persistence", () => {
  it("persists scoped tokens, shares, delivery runs, notifications, and incremental files", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codemesh-delivery-test-"));
    const filePath = path.join(directory, "state.json");
    const now = new Date(0).toISOString();
    const projectId = "project-delivery";
    const userId = "user-owner";
    const state: StoreState = {
      users: [],
      refreshTokens: [],
      projects: [{
        id: projectId,
        name: "Delivery Project",
        slug: "delivery-project",
        description: "Delivery persistence test.",
        tags: ["delivery"],
        languages: ["typescript"],
        visibility: "private",
        published: false,
        repositorySource: "github",
        repoUrl: "https://github.com/example/delivery",
        commitSha: "commit-one",
        guidelines: "Review every change.",
        createdAt: now,
        updatedAt: now
      }],
      members: [{ projectId, userId, role: "owner", discussionAllowed: true, joinedAt: now }],
      files: [{
        projectId,
        path: "src/app.ts",
        language: "typescript",
        size: 31,
        binary: false,
        sensitive: false,
        updatedAt: now,
        content: "export const value = 'one';\n"
      }],
      workspaceDocs: [],
      discussions: [],
      replies: [],
      tasks: [],
      contributions: [],
      patches: [],
      annotations: [],
      workspaceChat: [],
      retrievals: [],
      auditEvents: []
    };

    try {
      await fs.writeFile(filePath, JSON.stringify(state), "utf8");
      const store = await new JsonStore(filePath).init();
      const rawToken = "cmcp_delivery_test_token";
      const token = await store.createAgentAccessToken({
        projectId,
        userId,
        name: "Test agent",
        prefix: rawToken.slice(0, 14),
        tokenHash: hashToken(rawToken),
        scopes: ["read", "propose"]
      });
      await store.createProjectShare({
        projectId,
        createdBy: userId,
        label: "Review report",
        tokenHash: hashToken("cmshare_delivery_test"),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString()
      });
      await store.saveDeliveryRun({
        projectId,
        kind: "pull_request",
        status: "passed",
        title: "PR review",
        input: { changedFiles: ["src/app.ts"] },
        result: { score: 92 },
        createdBy: userId,
        completedAt: new Date().toISOString()
      });
      await store.applyIncrementalProjectFiles(projectId, [{
        projectId,
        path: "src/app.ts",
        language: "typescript",
        size: 31,
        binary: false,
        sensitive: false,
        updatedAt: new Date().toISOString(),
        content: "export const value = 'two';\n"
      }], [], "commit-two");
      await store.close();

      const reloaded = await new JsonStore(filePath).init();
      expect(reloaded.getAgentAccessTokenByHash(hashToken(rawToken))?.id).toBe(token.id);
      expect(reloaded.listProjectShares(projectId)).toHaveLength(1);
      expect(reloaded.listDeliveryRuns(projectId)[0]?.status).toBe("passed");
      expect(reloaded.listNotifications(userId).some((notification) => notification.title.includes("Pull request review"))).toBe(true);
      expect(reloaded.getFile(projectId, "src/app.ts")?.content).toContain("two");
      expect(reloaded.getProject(projectId)?.commitSha).toBe("commit-two");
      expect(await reloaded.revokeAgentAccessToken(projectId, token.id, userId)).not.toBeNull();
      expect(reloaded.getAgentAccessTokenByHash(hashToken(rawToken))).toBeNull();
      await reloaded.close();
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});

