import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { indexRepository, planAutonomousChange, verifyVirtualSandbox } from "@codemesh/code-intelligence";
import { JsonStore, type StoreState } from "../../apps/api/src/db/store";

describe("advanced operations persistence", () => {
  it("persists autonomous runs, traces, decisions, and assistant conversations", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codemesh-advanced-test-"));
    const filePath = path.join(directory, "state.json");
    const now = new Date(0).toISOString();
    const projectId = "project-a";
    const userId = "user-a";
    const state: StoreState = {
      users: [], refreshTokens: [], members: [], workspaceDocs: [], discussions: [], replies: [], tasks: [],
      contributions: [], patches: [], annotations: [], workspaceChat: [], retrievals: [], auditEvents: [],
      projects: [{
        id: projectId,
        name: "Advanced Project",
        slug: "advanced-project",
        description: "Advanced operations test.",
        tags: ["test"],
        languages: ["typescript"],
        visibility: "private",
        published: false,
        repositorySource: "sample",
        commitSha: "commit-a",
        guidelines: "Review every change.",
        createdAt: now,
        updatedAt: now
      }],
      files: [{
        projectId,
        path: "src/app.ts",
        language: "typescript",
        size: 42,
        binary: false,
        sensitive: false,
        updatedAt: now,
        content: "export function start() { return true; }\n"
      }]
    };

    try {
      await fs.writeFile(filePath, JSON.stringify(state), "utf8");
      const store = await new JsonStore(filePath).init();
      const index = indexRepository(projectId, "commit-a", state.files);
      const plan = planAutonomousChange(index, "Improve startup diagnostics");
      const sandbox = verifyVirtualSandbox(index, plan);
      await store.saveAutonomousRun({ projectId, userId, objective: plan.objective, status: sandbox.status, plan, sandbox });
      await store.saveRuntimeTrace({ projectId, name: "checkout", source: "manual", spans: [{ id: "span-1", name: "start", durationMs: 12, confidence: 1, mappedFilePath: "src/app.ts" }] }, userId);
      await store.createArchitectureDecision({ projectId, authorId: userId, title: "Keep review gates", status: "accepted", context: "AI changes need evidence.", decision: "Require graph and static checks.", consequences: "Review remains explicit.", evidenceFiles: ["src/app.ts"] });
      const conversation = await store.createAssistantConversation(projectId, userId, "Explain startup behavior");
      await store.addAssistantMessage(conversation.id, "user", "Explain startup behavior");
      await store.addAssistantMessage(conversation.id, "assistant", "The start function returns true.");

      const reloaded = await new JsonStore(filePath).init();
      expect(reloaded.listAutonomousRuns(projectId)).toHaveLength(1);
      expect(reloaded.listRuntimeTraces(projectId)[0]?.spans[0]?.mappedFilePath).toBe("src/app.ts");
      expect(reloaded.listArchitectureDecisions(projectId)[0]?.status).toBe("accepted");
      expect(reloaded.getAssistantConversation(projectId, conversation.id, userId)?.messages).toHaveLength(2);
      expect(await reloaded.deleteAssistantConversation(projectId, conversation.id, userId)).toBe(true);
      expect(reloaded.listAssistantConversations(projectId, userId)).toHaveLength(0);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
