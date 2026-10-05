import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JsonStore, type StoreState } from "../../apps/api/src/db/store";

describe("task storage", () => {
  it("deletes only the requested task inside its project", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codemesh-task-test-"));
    const filePath = path.join(directory, "state.json");
    const state: StoreState = {
      users: [],
      refreshTokens: [],
      projects: [],
      members: [],
      files: [],
      workspaceDocs: [],
      discussions: [],
      replies: [],
      tasks: [
        { id: "task-a", projectId: "project-a", title: "Remove me", status: "todo", createdAt: new Date(0).toISOString() },
        { id: "task-b", projectId: "project-b", title: "Keep me", status: "doing", createdAt: new Date(0).toISOString() }
      ],
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

      await expect(store.deleteTask("project-a", "task-a")).resolves.toBe(true);
      expect(store.listTasks("project-a")).toEqual([]);
      expect(store.listTasks("project-b")).toHaveLength(1);
      await expect(store.deleteTask("project-a", "missing-task")).resolves.toBe(false);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
