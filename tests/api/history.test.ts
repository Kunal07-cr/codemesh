import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JsonStore, type StoreState } from "../../apps/api/src/db/store";

describe("workspace revision history", () => {
  it("captures an edit snapshot and restores it", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codemesh-history-test-"));
    const filePath = path.join(directory, "state.json");
    const state: StoreState = {
      users: [], refreshTokens: [], projects: [], members: [], files: [], discussions: [], replies: [], tasks: [],
      contributions: [], patches: [], annotations: [], workspaceChat: [], retrievals: [], auditEvents: [],
      workspaceDocs: [{ projectId: "project-a", workspaceId: "main", path: "src/app.ts", content: "const value = 1;\n", version: 1, updatedAt: new Date(0).toISOString() }],
      workspaceRevisions: []
    };

    try {
      await fs.writeFile(filePath, JSON.stringify(state), "utf8");
      const store = await new JsonStore(filePath).init();
      await store.upsertWorkspaceDoc("project-a", "main", "src/app.ts", "const value = 2;\n");
      const [revision] = store.listWorkspaceRevisions("project-a", "main", "src/app.ts");

      expect(revision?.content).toBe("const value = 1;\n");
      await store.restoreWorkspaceRevision("project-a", "main", revision!.id, "user-a");
      expect(store.getWorkspaceDoc("project-a", "main", "src/app.ts")?.content).toBe("const value = 1;\n");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
