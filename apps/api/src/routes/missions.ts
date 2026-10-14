import { Router } from "express";
import { hasPermission, missionHandoffSchema, missionRequestSchema, missionVersionSchema } from "@codemesh/shared";
import type { JsonStore } from "../db/store.js";
import type { AppConfig } from "../config.js";
import type { OperationQueue } from "../services/jobQueue.js";
import { engineeringHash } from "../services/engineeringEngine.js";
import { MissionStudio, missionAccessible, missionView } from "../services/missionStudio.js";
import { createUserRateLimiter, requireProjectPermission } from "../services/security.js";
import { asyncHandler, ok, parseBody } from "./helpers.js";

export function missionRoutes(config: AppConfig, store: JsonStore, queue: OperationQueue) {
  const router = Router(), studio = new MissionStudio(store, queue), limiter = createUserRateLimiter(Math.min(10, config.AI_REQUESTS_PER_MINUTE));
  router.get("/:projectId/missions", requireProjectPermission(store, "ai.query"), (req, res) => {
    const projectId = String(req.params.projectId), userId = req.auth!.user.id;
    ok(res, { project: { id: projectId, name: store.getProject(projectId)!.name }, createAllowed: hasPermission(req.projectRole, "project.manage"),
      projects: store.listProjectsForUser(userId).filter((project) => hasPermission(store.getRole(project.id, userId), "ai.query")).map(({ id, name }) => ({ id, name })),
      missions: store.listMissions(projectId, userId).filter((mission) => missionAccessible(store, mission, userId)).map((mission) => missionView(store, mission)) });
  });
  router.post("/:projectId/missions", requireProjectPermission(store, "project.manage"), limiter, asyncHandler(async (req, res) => {
    const input = parseBody(missionRequestSchema, req);
    const mission = await studio.create(String(req.params.projectId), req.auth!.user.id, input);
    ok(res, missionView(store, mission));
  }));
  for (const action of ["dispatch", "cancel"] as const) router.post(`/:projectId/missions/:missionId/${action}`, requireProjectPermission(store, "ai.query"), limiter, asyncHandler(async (req, res) => {
    const input = parseBody(missionVersionSchema, req);
    const mission = await studio[action](String(req.params.projectId), req.auth!.user.id, String(req.params.missionId), input.expectedVersion);
    ok(res, missionView(store, mission));
  }));
  router.post("/:projectId/missions/:missionId/tasks/:taskId/accept", requireProjectPermission(store, "ai.query"), limiter, asyncHandler(async (req, res) => {
    const input = parseBody(missionHandoffSchema, req);
    const mission = await studio.accept(String(req.params.projectId), req.auth!.user.id, String(req.params.missionId), String(req.params.taskId), input.expectedVersion, input.evidenceDigest);
    ok(res, missionView(store, mission));
  }));
  router.post("/:projectId/missions/:missionId/tasks/:taskId/recapture", requireProjectPermission(store, "ai.query"), limiter, asyncHandler(async (req, res) => {
    const input = parseBody(missionVersionSchema, req);
    const mission = await studio.recapture(String(req.params.projectId), req.auth!.user.id, String(req.params.missionId), String(req.params.taskId), input.expectedVersion);
    ok(res, missionView(store, mission));
  }));
  router.get("/:projectId/missions/:missionId/report", requireProjectPermission(store, "ai.query"), (req, res) => {
    const mission = studio.owned(String(req.params.projectId), req.auth!.user.id, String(req.params.missionId));
    const payload = { schemaVersion: 1, mission: missionView(store, mission), scope: "Human-reviewed evidence orchestration; not an atomic multi-repository release.",
      limitations: ["No source, branch or pull request is written by a mission.", "Accepted evidence is not proof of an applied or behaviorally verified repair.", "Each model request uses its own repository, never other tasks' hidden source.", "Retention and durability follow the configured application store."] };
    ok(res, { payload, sha256: engineeringHash(JSON.stringify(payload)) });
  });
  return router;
}
