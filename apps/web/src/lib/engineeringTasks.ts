import type { PublicEngineeringRun } from "@codemesh/shared";

type TaskSummary = Pick<PublicEngineeringRun, "objective" | "mode" | "status" | "clarifications">;
export function filterEngineeringTasks<T extends TaskSummary>(runs: T[], search: string, status: PublicEngineeringRun["status"] | "") {
  const term = search.trim().toLowerCase();
  return runs.filter((run) => (!status || run.status === status) && (!term ||
    [run.objective, run.mode, ...(run.clarifications?.map((item) => item.instruction) ?? [])].some((value) => value.toLowerCase().includes(term))));
}

export function engineeringTaskDraft(run: Pick<PublicEngineeringRun, "objective" | "mode" | "maxAttempts" | "clarifications">) {
  return { objective: run.clarifications?.at(-1)?.instruction ?? run.objective, mode: run.mode, maxAttempts: run.maxAttempts };
}
