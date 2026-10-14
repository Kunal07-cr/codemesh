import { describe, expect, it } from "vitest";
import { missionLevels, missionOrder, missionRequestSchema } from "../../packages/shared/src/index";
import { newMissionTask, removeMissionTask, sampleMission } from "../../apps/web/src/lib/missionDrafts";

describe("mission plans and draft operations", () => {
  const task = (id: string, dependsOn: string[] = []) => ({ ...newMissionTask("repo", id), title: `Task ${id}`, objective: "Explain the session function", dependsOn });
  const plan = (tasks = [task("a"), task("b", ["a"])]) => ({ title: "Auth review", goal: "Review the authentication boundary", tasks });
  it("validates fork/join ordering with stable graph levels", () => {
    const parsed = missionRequestSchema.parse(plan([task("a"), task("b", ["a"]), task("c", ["a"]), task("d", ["b", "c"])]));
    expect(missionLevels(parsed.tasks)).toEqual({ a: 0, b: 1, c: 1, d: 2 });
    expect(missionOrder(parsed.tasks)[0]).toBe("a"); expect(missionOrder(parsed.tasks).at(-1)).toBe("d");
  });
  it.each([
    [task("a", ["b"]), task("b", ["a"])],
    [task("a", ["a"]), task("b")],
    [task("a", ["missing"]), task("b")],
    [task("a"), task("a")],
    [task("a"), task("b", ["a", "a"])]
  ])("rejects invalid dependency topology %j", (...tasks) => { expect(missionRequestSchema.safeParse(plan(tasks)).success).toBe(false); });
  it("bounds plans and rejects injected command fields", () => {
    expect(missionRequestSchema.safeParse(plan([task("a")])).success).toBe(false);
    expect(missionRequestSchema.safeParse(plan(Array.from({ length: 11 }, (_, index) => task(String(index))))).success).toBe(false);
    expect(missionRequestSchema.safeParse({ ...plan(), shell: "execute" }).success).toBe(false);
    expect(missionRequestSchema.safeParse(plan([{ ...task("a"), maxAttempts: 4 }, task("b")])).success).toBe(false);
  });
  it("removes a task and all references without altering remaining objectives", () => {
    const tasks = [task("a"), task("b", ["a"]), task("c", ["a", "b"])];
    expect(removeMissionTask(tasks, "b")).toEqual([tasks[0], { ...tasks[2], dependsOn: ["a"] }]);
    expect(tasks[2]!.dependsOn).toEqual(["a", "b"]);
  });
  it("creates a valid sample plan without fabricated runs or approvals", () => {
    const sample = missionRequestSchema.parse(sampleMission("project-sample-taskpilot"));
    expect(sample.tasks[1]!.dependsOn).toEqual([sample.tasks[0]!.id]);
    expect(sample.tasks[0]).not.toHaveProperty("runId"); expect(sample.tasks[0]).not.toHaveProperty("handoff");
  });
});
