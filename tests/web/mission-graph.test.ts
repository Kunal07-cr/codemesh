import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MissionTaskView } from "../../packages/shared/src/index";
import { sampleMission } from "../../apps/web/src/lib/missionDrafts";

type GraphProps = {
  children?: ReactNode;
  onNodeClick?: (event: null, node: { id: string }) => void;
  nodesDraggable?: boolean;
  nodes?: Array<{ id: string; data: { task: MissionTaskView; selected: boolean; onSelect(): void } }>;
  edges?: Array<{ animated: boolean }>;
  nodeTypes?: Record<string, (props: { data: { task: MissionTaskView; selected: boolean; onSelect(): void } }) => ReactNode>;
};
const captured = vi.hoisted(() => ({ flow: {} as GraphProps }));
vi.mock("../../apps/web/src/lib/useReducedMotion", () => ({ useReducedMotion: () => true }));
vi.mock("@xyflow/react", async () => {
  const react = await import("react");
  return { ReactFlow: (props: GraphProps) => { captured.flow = props; return react.createElement("div", null, props.children); }, Background: () => null, Controls: () => null, Handle: () => null, Position: { Left: "left", Right: "right" } };
});
import { MissionGraph } from "../../apps/web/src/components/MissionGraph";

describe("mission graph interactions", () => {
  const tasks: MissionTaskView[] = sampleMission("repo").tasks.map((task, index) => ({ ...task, projectName: "Sample", revision: "v1", sourceDigest: "hash", launches: 0, previousRuns: [], state: index ? "running" : "accepted", detail: "Fixture state", canAccept: false }));
  it("registers node clicks even when drag and built-in selection are disabled", () => {
    const select = vi.fn();
    renderToStaticMarkup(createElement(MissionGraph, { tasks, selectedId: "session", onSelect: select }));
    expect(captured.flow.nodesDraggable).toBe(false); expect(captured.flow.onNodeClick).toBeTypeOf("function");
    captured.flow.onNodeClick!(null, { id: "guard" }); expect(select).toHaveBeenCalledWith("guard");
  });
  it("keeps task buttons accessible and excludes clicks from graph panning", () => {
    renderToStaticMarkup(createElement(MissionGraph, { tasks, selectedId: "session", onSelect() {} }));
    const node = captured.flow.nodes![0]!, Component = captured.flow.nodeTypes!.missionTask!;
    const html = renderToStaticMarkup(createElement(Component, { data: node.data }));
    expect(html).toContain('class="nodrag nopan"'); expect(html).toContain('aria-label="Select Session creation"'); expect(html).toContain('aria-pressed="true"');
  });
  it("disables moving edges under reduced motion and retains the task-list alternative", () => {
    const html = renderToStaticMarkup(createElement(MissionGraph, { tasks, onSelect() {} }));
    expect(captured.flow.edges).toHaveLength(1); expect(captured.flow.edges![0]!.animated).toBe(false);
    expect(html).toContain('aria-label="Mission steps"'); expect(html).toContain("Request guard");
  });
});
