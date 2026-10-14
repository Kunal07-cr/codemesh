import { z } from "zod";
import { Graph, alg } from "@dagrejs/graphlib";
import type { EngineeringRequest, PublicEngineeringRun } from "./engineering.js";

export const missionTaskSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9-]{1,64}$/),
  title: z.string().trim().min(3).max(100), projectId: z.string().min(1).max(200),
  objective: z.string().trim().min(8).max(2000),
  mode: z.enum(["investigate", "repair", "migration", "security", "review"]),
  dependsOn: z.array(z.string().max(64)).max(9), maxAttempts: z.number().int().min(1).max(3)
}).strict();
export const missionRequestSchema = z.object({
  title: z.string().trim().min(3).max(100), goal: z.string().trim().min(8).max(2000),
  tasks: z.array(missionTaskSchema).min(2).max(10)
}).strict().superRefine((value, context) => {
  const ids = new Set(value.tasks.map((task) => task.id));
  if (ids.size !== value.tasks.length || value.tasks.some((task) => new Set(task.dependsOn).size !== task.dependsOn.length || task.dependsOn.some((id) => id === task.id || !ids.has(id)))) {
    context.addIssue({ code: "custom", message: "Use distinct task IDs and valid, non-repeated dependencies." }); return;
  }
  if (!alg.isAcyclic(missionGraph(value.tasks))) context.addIssue({ code: "custom", message: "Mission dependencies contain a cycle." });
});
export type MissionRequest = z.infer<typeof missionRequestSchema>;
export function missionGraph(tasks: Array<{ id: string; dependsOn: string[] }>) {
  const graph = new Graph({ directed: true });
  for (const task of tasks) graph.setNode(task.id);
  for (const task of tasks) for (const id of task.dependsOn) graph.setEdge(id, task.id);
  return graph;
}
export function missionLevels(tasks: Array<{ id: string; dependsOn: string[] }>) {
  const graph = missionGraph(tasks), levels = new Map<string, number>();
  for (const id of alg.topsort(graph)) levels.set(id, Math.max(0, ...(graph.predecessors(id) ?? []).map((parent: string) => levels.get(parent)! + 1)));
  return Object.fromEntries(levels);
}
export function missionOrder(tasks: Array<{ id: string; dependsOn: string[] }>) { return alg.topsort(missionGraph(tasks)); }
export type MissionTask = MissionRequest["tasks"][number] & {
  projectName: string; revision: string; sourceDigest: string; launches: number;
  runId?: string; jobId?: string; previousRuns: string[];
  handoff?: { digest: string; acceptedAt: string; acceptedBy: string };
};
export type Mission = {
  id: string; projectId: string; createdBy: string; createdAt: string; updatedAt: string;
  title: string; goal: string; version: number; cancelled: boolean; tasks: MissionTask[];
  events: Array<{ action: string; taskId?: string; createdAt: string }>;
};
export type MissionTaskState = "waiting" | "ready" | "running" | "needs_input" | "review" | "accepted" | "stale" | "blocked" | "cancelled";
export type MissionTaskView = MissionTask & {
  state: MissionTaskState; detail: string; evidenceDigest?: string; canAccept: boolean;
  run?: Pick<PublicEngineeringRun, "id" | "status" | "attempts" | "maxAttempts" | "verification"> & { citations: number; patchId?: string };
};
export type MissionView = Omit<Mission, "tasks"> & {
  tasks: MissionTaskView[]; status: "planned" | "running" | "attention" | "complete" | "cancelled";
  summary: { ready: number; running: number; accepted: number; total: number; repositories: number };
};
export const missionVersionSchema = z.object({ expectedVersion: z.number().int().min(1), confirmed: z.literal(true) }).strict();
export const missionHandoffSchema = z.object({ expectedVersion: z.number().int().min(1), evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict();
export type MissionMode = EngineeringRequest["mode"];
