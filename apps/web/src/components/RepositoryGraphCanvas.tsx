import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import { ArrowUpRight, Boxes, Code2, Crosshair, FileCode2, Folder, Focus, GitBranch, Search, SlidersHorizontal, X } from "lucide-react";
import type { GraphNode, RepositoryGraph } from "@codemesh/shared";
import { exploreGraph, graphNodeTone, layoutRepositoryGraph, relationshipOf, type GraphLayout, type GraphRelationship } from "../lib/graphExploration";
import { useReducedMotion } from "../lib/useReducedMotion";

type MeshNodeData = { entity: GraphNode; dimmed: boolean; choose(node: GraphNode): void };
type MeshNode = Node<MeshNodeData, "mesh">;
type Props = {
  graph: RepositoryGraph;
  selectedNodeId?: string;
  selectedPath?: string;
  immersive?: boolean;
  onSelectNode?(node: GraphNode): void;
  onOpenSource?(path: string, line?: number): void;
};

const tones: Record<string, string> = { mint: "#64d6af", cyan: "#56c7e8", violet: "#a78bfa", rose: "#f472b6", amber: "#f2b86b" };
const MeshEntity = memo(function MeshEntity({ data, selected }: NodeProps<MeshNode>) {
  const node = data.entity;
  const Icon = node.type === "repository" ? Boxes : node.type === "folder" ? Folder : node.type === "file" ? FileCode2 : Code2;
  return <div className={`cm-entity ${selected ? "is-selected" : ""} ${data.dimmed ? "is-dimmed" : ""}`} data-tone={graphNodeTone(node)}>
    <Handle type="target" position={Position.Left} />
    <button type="button" className="nodrag cm-entity-button" aria-label={`${node.label}, ${node.symbolKind ?? node.type}${node.filePath ? `, ${node.filePath}` : ""}`} aria-pressed={selected} title={node.filePath ?? node.label} onClick={() => data.choose(node)}>
      <span className="cm-entity-icon"><Icon size={16} /></span>
      <span><small>{node.symbolKind ?? node.type}</small><strong>{node.label}</strong></span>
      <i aria-hidden="true" />
    </button>
    <Handle type="source" position={Position.Right} />
  </div>;
});
const nodeTypes = { mesh: MeshEntity };

export function RepositoryGraphCanvas({ graph, selectedNodeId, selectedPath = "", immersive = false, onSelectNode, onOpenSource }: Props) {
  const preferred = graph.nodes.find((node) => immersive ? node.label === "createApp" : node.filePath === selectedPath && node.type === "file") ?? graph.nodes[0];
  const [selectedId, setSelectedId] = useState(selectedNodeId ?? preferred?.id ?? "");
  const [focus, setFocus] = useState(immersive);
  const [layout, setLayout] = useState<GraphLayout>("modules");
  const [relationship, setRelationship] = useState<GraphRelationship>("all");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [instance, setInstance] = useState<ReactFlowInstance<MeshNode, Edge> | null>(null);
  const onSelectRef = useRef(onSelectNode);
  const stageRef = useRef<HTMLDivElement>(null);
  onSelectRef.current = onSelectNode;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const next = selectedNodeId ?? (!immersive ? graph.nodes.find((node) => node.filePath === selectedPath && node.type === "file")?.id : undefined);
    if (next) { setSelectedId(next); setTarget(""); }
  }, [selectedNodeId, selectedPath, graph.nodes, immersive]);

  const choose = useCallback((node: GraphNode) => {
    setSelectedId(node.id); setTarget(""); setQuery(""); onSelectRef.current?.(node);
  }, []);
  const model = useMemo(() => exploreGraph(graph, selectedId, relationship, focus, target), [graph, selectedId, relationship, focus, target]);
  const positions = useMemo(() => layoutRepositoryGraph(model.nodes, layout), [model.nodes, layout]);
  const pathIds = useMemo(() => new Set(model.path), [model.path]);
  const nodes = useMemo<MeshNode[]>(() => model.nodes.map((node) => ({
    id: node.id, type: "mesh", selected: node.id === selectedId,
    position: positions.get(node.id)!,
    data: { entity: node, choose, dimmed: Boolean(model.selected) && !model.neighbors.has(node.id) && !pathIds.has(node.id) },
    style: { width: 178, border: 0, background: "transparent", borderRadius: 0 }
  })), [model.nodes, model.selected, model.neighbors, selectedId, positions, pathIds, choose]);
  const edges = useMemo<Edge[]>(() => model.edges.map((edge, edgeIndex) => {
    const kind = relationshipOf(edge);
    const active = edge.source === selectedId || edge.target === selectedId || (pathIds.has(edge.source) && pathIds.has(edge.target));
    const color = kind === "calls" ? tones.cyan! : kind === "imports" ? tones.amber! : kind === "exports" ? tones.violet! : tones.mint!;
    return { id: edge.id, source: edge.source, target: edge.target, type: "smoothstep", label: active ? kind : undefined,
      animated: active && !reducedMotion && edgeIndex < 64,
      className: active ? "cm-relation-active" : "cm-relation-muted",
      style: { stroke: color, strokeWidth: active ? 1.8 : 1, opacity: active ? 0.9 : model.selected ? 0.18 : 0.38, strokeDasharray: edge.verified ? undefined : "4 5" },
      labelStyle: { fill: color, fontSize: 10 }, labelBgStyle: { fill: "#0e1219", fillOpacity: 0.95 },
      markerEnd: { type: MarkerType.ArrowClosed, color },
      ariaLabel: `${kind}: ${edge.source} to ${edge.target}${edge.verified ? "" : ", unverified"}` };
  }), [model.edges, model.selected, selectedId, pathIds, reducedMotion]);
  const visibleKey = model.nodes.map((node) => node.id).join("\n");
  useEffect(() => {
    if (!instance || !nodes.length) return;
    // Let React Flow measure nodes before fitting a changed filter or layout.
    const frame = requestAnimationFrame(() => void instance.fitView({ padding: immersive ? 0.24 : 0.18, duration: reducedMotion ? 0 : 260, maxZoom: immersive ? 1.25 : 1 }));
    return () => cancelAnimationFrame(frame);
  }, [instance, visibleKey, layout, reducedMotion, immersive]);
  useEffect(() => {
    if (!instance || !stageRef.current) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => void instance.fitView({ padding: 0.2, duration: 0, maxZoom: immersive ? 1.25 : 1 }));
    });
    observer.observe(stageRef.current);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [instance, immersive]);

  const matches = query.trim() ? graph.nodes.filter((node) => `${node.label} ${node.filePath ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())) : [];
  const selected = model.selected;
  const relatedIds = new Set([...model.incoming.map((edge) => edge.source), ...model.outgoing.map((edge) => edge.target)]);
  const related = graph.nodes.filter((node) => relatedIds.has(node.id));
  const selectList = graph.nodes.filter((node) => node.type === "file" || node.type === "symbol");

  return <section className={`cm-repository-canvas ${immersive ? "is-immersive" : ""}`} aria-label={immersive ? "TaskPilot sample architecture" : "Repository graph explorer"}>
    <div className="cm-canvas-toolbar">
      {immersive ? <span className="cm-sample-label"><i /> TaskPilot / sample repository</span> : <label className="cm-canvas-search"><Search size={14} /><input aria-label="Search graph entities" placeholder="Find a file or symbol" value={query} onChange={(event) => setQuery(event.target.value)} /><span>{graph.nodes.length}</span></label>}
      <button className="cm-icon-button" type="button" aria-label="Focus connected entities" title="Focus connected entities" aria-pressed={focus} disabled={!selected} onClick={() => setFocus((value) => !value)}><Focus size={16} /></button>
      <button className="cm-icon-button" type="button" aria-label="Fit graph" title="Fit graph" onClick={() => void instance?.fitView({ padding: 0.2, duration: reducedMotion ? 0 : 260 })}><Crosshair size={16} /></button>
      <button className="cm-icon-button" type="button" aria-label="Graph options" title="Graph options" aria-expanded={optionsOpen} onClick={() => setOptionsOpen((value) => !value)}><SlidersHorizontal size={16} /></button>
    </div>
    {query.trim() && <div className="cm-canvas-results" role="region" aria-label="Graph search results">
      {matches.slice(0, 8).map((node) => <button type="button" key={node.id} onClick={() => { setFocus(true); choose(node); }}><Code2 size={14} /><span>{node.label}<small>{node.filePath ?? node.type}</small></span><ArrowUpRight size={13} /></button>)}
      <span role="status">{matches.length ? `${matches.length} matching entities${matches.length > 8 ? "; refine search for more" : ""}` : "No matching entities"}</span>
    </div>}
    {optionsOpen && <div className="cm-canvas-options">
      <label>Layout<select aria-label="Graph layout" value={layout} onChange={(event) => setLayout(event.target.value as GraphLayout)}><option value="modules">Module clusters</option><option value="layers">Entity layers</option></select></label>
      <label>Relationships<select aria-label="Graph relationships" value={relationship} onChange={(event) => setRelationship(event.target.value as GraphRelationship)}>{(["all", "calls", "imports", "contains", "exports", "references"] as const).map((kind) => <option key={kind} value={kind}>{kind === "all" ? "All relationships" : kind}</option>)}</select></label>
      {!immersive && <label>Directed path to<select aria-label="Trace destination" value={target} onChange={(event) => setTarget(event.target.value)}><option value="">No path filter</option>{selectList.filter((node) => node.id !== selectedId).map((node) => <option key={node.id} value={node.id}>{node.label} · {node.filePath}</option>)}</select></label>}
      <button type="button" className="cm-icon-button" title="Close graph options" aria-label="Close graph options" onClick={() => setOptionsOpen(false)}><X size={15} /></button>
    </div>}
    <div className="cm-canvas-stage" ref={stageRef}>
      {nodes.length ? <ReactFlow<MeshNode, Edge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onInit={setInstance} fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.15} maxZoom={2} nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false} panOnScroll={!immersive} zoomOnScroll={!immersive} preventScrolling={!immersive} colorMode="dark">
        <Background color="#283039" gap={28} size={1} />
        <Controls position="bottom-left" showInteractive={false} fitViewOptions={{ padding: 0.2, duration: reducedMotion ? 0 : 260 }} />
        {!immersive && <MiniMap<MeshNode> pannable zoomable nodeColor={(node) => tones[graphNodeTone(node.data.entity)]!} maskColor="rgba(9, 12, 17, 0.8)" />}
      </ReactFlow> : <div className="cm-canvas-empty"><GitBranch size={24} /><p>No indexed entities in this graph.</p></div>}
    </div>
    <div className="cm-canvas-insight">
      <div className="cm-canvas-selection"><span className="cm-kind-label" data-tone={selected ? graphNodeTone(selected) : "cyan"}>{selected?.symbolKind ?? selected?.type ?? "graph"}</span><strong title={selected?.filePath}>{selected?.label ?? "Repository architecture"}</strong><span>{selected?.filePath}{selected?.range ? `:${selected.range.startLine}` : ""}</span>{selected?.filePath && onOpenSource && <button type="button" className="cm-icon-button" title="Open selected source" aria-label="Open selected source" onClick={() => onOpenSource(selected.filePath!, selected.range?.startLine)}><ArrowUpRight size={16} /></button>}</div>
      <div className="cm-canvas-readout" role="status">{target ? model.path.length ? `${model.path.length - 1} directed connection${model.path.length === 2 ? "" : "s"}` : "No directed path in this relationship view" : `${model.incoming.length} incoming · ${model.outgoing.length} outgoing`}<span>{model.nodes.length} / {graph.nodes.length} entities · {model.edges.length} links</span></div>
      {related.length > 0 && !immersive && <div className="cm-canvas-neighbors" aria-label="Connected entities">{related.slice(0, 6).map((node) => <button type="button" key={node.id} title={node.filePath ?? node.label} onClick={() => choose(node)}><GitBranch size={11} />{node.label}</button>)}</div>}
      {graph.warnings.length > 0 && <span className="cm-canvas-warning">{graph.warnings.length} index warning{graph.warnings.length === 1 ? "" : "s"}</span>}
    </div>
  </section>;
}
