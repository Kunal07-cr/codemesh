import type { MissionRequest } from "@codemesh/shared";

export function newMissionTask(projectId: string, id = `step-${crypto.randomUUID()}`): MissionRequest["tasks"][number] {
  return { id, title: "", projectId, objective: "", mode: "investigate", dependsOn: [], maxAttempts: 2 };
}

export function removeMissionTask(tasks: MissionRequest["tasks"], id: string) {
  return tasks.filter((task) => task.id !== id).map((task) => ({ ...task, dependsOn: task.dependsOn.filter((parent) => parent !== id) }));
}

export function sampleMission(projectId: string): MissionRequest {
  return { title: "Trace the authentication boundary", goal: "Review session creation and request authentication using source-linked evidence.", tasks: [
    { ...newMissionTask(projectId, "session"), title: "Session creation", objective: "Explain createSessionToken in src/auth/session.ts." },
    { ...newMissionTask(projectId, "guard"), title: "Request guard", objective: "Explain requireAuth in src/auth/session.ts.", dependsOn: ["session"] }
  ] };
}
