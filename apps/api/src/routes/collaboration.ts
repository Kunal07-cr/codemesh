import { Router } from "express";
import { z } from "zod";
import { applyWholeFilePatch } from "@codemesh/code-intelligence";
import type { AppConfig } from "../config.js";
import type { JsonStore } from "../db/store.js";
import { badRequest, conflict, failedDependency, notFound } from "../errors.js";
import { requireProjectPermission } from "../services/security.js";
import { asyncHandler, ok } from "./helpers.js";

export function collaborationRoutes(config: AppConfig, store: JsonStore) {
  const router = Router();

  router.get(
    "/:projectId/discussions",
    requireProjectPermission(store, "project.read"),
    (req, res) => {
      ok(res, store.listDiscussions(String(req.params.projectId)));
    }
  );

  router.post(
    "/:projectId/discussions",
    requireProjectPermission(store, "discussion.post"),
    asyncHandler(async (req, res) => {
      const input = z.object({ title: z.string().min(3), body: z.string().min(3) }).parse(req.body);
      const projectId = String(req.params.projectId);
      const member = store.getMember(projectId, req.auth!.user.id);
      if (!member?.discussionAllowed) throw badRequest("Discussion permission is disabled for this member.");
      const thread = await store.createDiscussion(projectId, req.auth!.user.id, input.title, input.body);
      ok(res, thread);
    })
  );

  router.get(
    "/:projectId/discussions/:threadId/replies",
    requireProjectPermission(store, "project.read"),
    (req, res) => {
      ok(res, store.listReplies(String(req.params.projectId), String(req.params.threadId)));
    }
  );

  router.post(
    "/:projectId/discussions/:threadId/replies",
    requireProjectPermission(store, "discussion.post"),
    asyncHandler(async (req, res) => {
      const input = z.object({ body: z.string().min(2) }).parse(req.body);
      const reply = await store.createReply(String(req.params.projectId), String(req.params.threadId), req.auth!.user.id, input.body);
      ok(res, reply);
    })
  );

  router.get(
    "/:projectId/tasks",
    requireProjectPermission(store, "project.read"),
    (req, res) => {
      ok(res, store.listTasks(String(req.params.projectId)));
    }
  );

  router.get(
    "/:projectId/workspace/history",
    requireProjectPermission(store, "project.read"),
    (req, res) => {
      const path = String(req.query.path ?? "");
      ok(res, store.listWorkspaceRevisions(String(req.params.projectId), "main", path).map(({ content: _content, ...revision }) => revision));
    }
  );

  router.post(
    "/:projectId/tasks",
    requireProjectPermission(store, "task.manage"),
    asyncHandler(async (req, res) => {
      const input = z.object({ title: z.string().min(3), assigneeId: z.string().optional() }).parse(req.body);
      const task = await store.createTask(String(req.params.projectId), input.title, input.assigneeId);
      ok(res, task);
    })
  );

  router.patch(
    "/:projectId/tasks/:taskId",
    requireProjectPermission(store, "task.manage"),
    asyncHandler(async (req, res) => {
      const input = z.object({ status: z.enum(["todo", "doing", "review", "done"]) }).parse(req.body);
      const task = await store.updateTask(String(req.params.projectId), String(req.params.taskId), input.status);
      if (!task) throw notFound("Task not found.");
      ok(res, task);
    })
  );

  router.delete(
    "/:projectId/tasks/:taskId",
    requireProjectPermission(store, "task.manage"),
    asyncHandler(async (req, res) => {
      const taskId = String(req.params.taskId);
      const deleted = await store.deleteTask(String(req.params.projectId), taskId);
      if (!deleted) throw notFound("Task not found.");
      ok(res, { deleted: true, taskId });
    })
  );

  router.get(
    "/:projectId/contributions",
    requireProjectPermission(store, "project.read"),
    (req, res) => {
      ok(res, {
        contributions: store.listContributions(String(req.params.projectId)),
        patches: store.listPatches(String(req.params.projectId)),
        github: {
          configured: config.githubConfigured,
          message: config.githubConfigured
            ? "GitHub App configuration detected. The demo still requires a repository installation token before real PR creation."
            : "GitHub App is not configured. PR creation is disabled but review and patch workflows remain available."
        }
      });
    }
  );

  router.post(
    "/:projectId/patches/:patchId/apply",
    requireProjectPermission(store, "workspace.review"),
    asyncHandler(async (req, res) => {
      const projectId = String(req.params.projectId);
      const patch = store.getPatch(projectId, String(req.params.patchId));
      if (!patch) throw notFound("Patch not found.");
      const applied: string[] = [];
      for (const file of patch.files) {
        const doc = store.getWorkspaceDoc(projectId, patch.workspaceId, file.path);
        if (!doc) throw notFound(`Workspace file missing: ${file.path}`);
        const result = applyWholeFilePatch(file.baseContent, doc.content, file.proposedContent, file.baseHash);
        if (!result.ok) {
          patch.status = "stale";
          await store.savePatch(patch);
          throw conflict(result.reason, { path: file.path });
        }
        await store.upsertWorkspaceDoc(projectId, patch.workspaceId, file.path, result.content);
        applied.push(file.path);
      }
      patch.status = "applied";
      patch.executedVerification = [];
      await store.savePatch(patch);
      const contribution = await store.createContribution({
        projectId,
        workspaceId: patch.workspaceId,
        title: patch.title,
        summary: patch.summary,
        authorId: req.auth!.user.id,
        patchId: patch.id,
        status: "ready"
      });
      ok(res, { patch, contribution, applied });
    })
  );

  router.post(
    "/:projectId/patches/:patchId/reject",
    requireProjectPermission(store, "workspace.review"),
    asyncHandler(async (req, res) => {
      const patch = store.getPatch(String(req.params.projectId), String(req.params.patchId));
      if (!patch) throw notFound("Patch not found.");
      patch.status = "rejected";
      await store.savePatch(patch);
      ok(res, patch);
    })
  );

  router.post(
    "/:projectId/contributions/:contributionId/create-pr",
    requireProjectPermission(store, "github.publish"),
    asyncHandler(async (_req, _res) => {
      if (!config.githubConfigured) {
        throw failedDependency("GitHub App credentials are not configured. Set the GitHub App env vars to enable PR creation.");
      }
      throw failedDependency(
        "GitHub credentials are present, but this local demo does not have an installation token flow completed. Review docs/github-setup.md before enabling real writes."
      );
    })
  );

  return router;
}
