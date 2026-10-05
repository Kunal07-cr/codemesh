import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JsonStore, type StoreState } from "../../apps/api/src/db/store";

describe("engineering lab snapshots", () => {
  it("creates a baseline, captures another snapshot, and compares them", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codemesh-labs-test-"));
    const filePath = path.join(directory, "state.json");
    const now = new Date(0).toISOString();
    const state: StoreState = {
      users: [],
      refreshTokens: [],
      projects: [{
        id: "project-a",
        name: "Snapshot Project",
        slug: "snapshot-project",
        description: "Repository snapshot test.",
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
      members: [],
      files: [{
        projectId: "project-a",
        path: "src/app.ts",
        language: "typescript",
        size: 42,
        binary: false,
        sensitive: false,
        updatedAt: now,
        content: "export function start() { return true; }\n"
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
      expect(store.listRepositorySnapshots("project-a")).toHaveLength(1);
      expect(store.listQualitySnapshots("project-a")).toHaveLength(1);

      await store.captureLabSnapshot("project-a", "user-a");
      const snapshots = store.listRepositorySnapshots("project-a");
      const evolution = store.getRepositoryEvolution("project-a", snapshots[1]?.id, snapshots[0]?.id);

      expect(snapshots).toHaveLength(2);
      expect(evolution.from?.id).toBe(snapshots[1]?.id);
      expect(evolution.to?.id).toBe(snapshots[0]?.id);
      expect(store.listAuditEvents("project-a")[0]?.action).toBe("labs.baseline_captured");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
