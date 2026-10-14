import { Background, Controls, Handle, Position, ReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { Check, Clock, GitBranch, ShieldCheck } from "lucide-react";
import { missionLevels, type MissionTaskView } from "@codemesh/shared";
import { useReducedMotion } from "../lib/useReducedMotion";

type TaskNode = Node<{ task: MissionTaskView; selected: boolean; onSelect(): void }, "missionTask">;
function MissionNode({ data }: NodeProps<TaskNode>) {
  const Icon = data.task.state === "accepted" ? ShieldCheck : data.task.state === "running" ? Clock : GitBranch;
  return <div className="mission-node" data-state={data.task.state} data-selected={data.selected}>
    <Handle type="target" position={Position.Left} isConnectable={false} />
    <button type="button" onClick={data.onSelect} aria-label={`Select ${data.task.title}`} aria-pressed={data.selected}><span><Icon size={16} /><small>{data.task.state.replaceAll("_", " ")}</small></span><strong>{data.task.title}</strong><em>{data.task.projectName}</em></button>
    <Handle type="source" position={Position.Right} isConnectable={false} />
  </div>;
}
const nodeTypes = { missionTask: MissionNode };

export function MissionGraph({ tasks, selectedId, onSelect }: { tasks: MissionTaskView[]; selectedId?: string; onSelect(id: string): void }) {
  const reduced = useReducedMotion(), levels = missionLevels(tasks), rows = new Map<number, number>();
  const nodes: TaskNode[] = tasks.map((task) => {
    const level = levels[task.id] ?? 0, row = rows.get(level) ?? 0; rows.set(level, row + 1);
    return { id: task.id, type: "missionTask", position: { x: level * 300, y: row * 154 }, data: { task, selected: task.id === selectedId, onSelect: () => onSelect(task.id) }, draggable: false };
  });
  const edges = tasks.flatMap((task) => task.dependsOn.map((parent) => ({ id: `${parent}:${task.id}`, source: parent, target: task.id, animated: !reduced && task.state === "running", style: { stroke: tasks.find((item) => item.id === parent)?.state === "accepted" ? "#62d6b3" : "#78879c", strokeWidth: 2 } })));
  return <>
    <div className="mission-graph" aria-label="Mission dependency graph"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.22, maxZoom: 1 }} minZoom={0.2} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} colorMode="dark" proOptions={{ hideAttribution: false }}><Background color="#27323e" gap={24} /><Controls showInteractive={false} /></ReactFlow></div>
    <ol className="mission-step-list" aria-label="Mission steps">{tasks.map((task, index) => <li key={task.id}><button type="button" aria-pressed={task.id === selectedId} onClick={() => onSelect(task.id)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{task.title}<small>{task.projectName}</small></strong><span className="mission-state" data-state={task.state}>{task.state === "accepted" && <Check size={13} />}{task.state.replaceAll("_", " ")}</span></button></li>)}</ol>
  </>;
}
