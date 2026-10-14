import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PublicEngineeringRun } from "../../packages/shared/src/index";
import { EngineeringTaskList } from "../../apps/web/src/components/EngineeringTaskList";
import { engineeringTaskDraft, filterEngineeringTasks } from "../../apps/web/src/lib/engineeringTasks";

const runs = [
  { id: "auth", objective: "Repair session validation", mode: "repair" as const, status: "needs_input" as const, maxAttempts: 3, attempts: 1, createdAt: "2026-10-14T09:00:00Z", clarifications: [{ instruction: "Use src/auth/session.ts", createdAt: "2026-10-14T09:01:00Z", attempt: 2 }] },
  { id: "tasks", objective: "Explain task creation", mode: "investigate" as const, status: "completed" as const, maxAttempts: 2, attempts: 1, createdAt: "2026-10-14T09:02:00Z" }
];

describe("engineering task navigation", () => {
  it("searches objectives and modes case-insensitively with whitespace trimming", () => {
    expect(filterEngineeringTasks(runs, "  VALIDATION  ", "").map((run) => run.id)).toEqual(["auth"]);
    expect(filterEngineeringTasks(runs, "investigate", "").map((run) => run.id)).toEqual(["tasks"]);
  });
  it("combines clarification searches with an exact status filter", () => {
    expect(filterEngineeringTasks(runs, "src/auth/session.ts", "needs_input").map((run) => run.id)).toEqual(["auth"]);
    expect(filterEngineeringTasks(runs, "src/auth/session.ts", "completed")).toEqual([]);
  });
  it("keeps retained order and never mutates the selected runs", () => {
    const before = JSON.stringify(runs);
    expect(filterEngineeringTasks(runs, "", "")).toEqual(runs);
    expect(JSON.stringify(runs)).toBe(before);
  });
  it("copies the newest instruction and only composer fields into a fresh draft", () => {
    const old = { ...runs[0]!, patch: { id: "old-proposal" }, corpusId: "old-benchmark", snapshot: ["old-source"], clarifications: [...runs[0]!.clarifications!, { instruction: "Use src/auth/routes.ts instead", createdAt: "2026-10-14T09:05:00Z", attempt: 3 }] };
    const before = JSON.stringify(old);
    expect(engineeringTaskDraft(old)).toEqual({ objective: "Use src/auth/routes.ts instead", mode: "repair", maxAttempts: 3 });
    expect(JSON.stringify(old)).toBe(before);
    expect(engineeringTaskDraft(runs[1]!)).toEqual({ objective: "Explain task creation", mode: "investigate", maxAttempts: 2 });
  });
  it("renders labeled filters, count, and the current selection", () => {
    const html = renderToStaticMarkup(createElement(EngineeringTaskList, { runs: runs as PublicEngineeringRun[], selectedId: "auth", onSelect() {} }));
    expect(html).toContain("Search tasks"); expect(html).toContain("Task status"); expect(html).toContain("2 / 2 tasks");
    expect(html).toContain('aria-pressed="true"'); expect(html).toContain("Repair session validation");
  });
  it("shows an empty state without dropping filter controls", () => {
    const html = renderToStaticMarkup(createElement(EngineeringTaskList, { runs: [], onSelect() {} }));
    expect(html).toContain("No task runs"); expect(html).toContain("0 / 0 tasks"); expect(html).toContain("Search tasks");
  });
});
