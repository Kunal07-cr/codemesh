import type { GraphEdge, GraphNode, RepositoryGraph } from "@codemesh/shared";

export type GraphLayout = "layers" | "modules";
export type GraphRelationship = "all" | "calls" | GraphEdge["type"];

export function relationshipOf(edge: GraphEdge): Exclude<GraphRelationship, "all"> {
  return edge.label === "calls" ? "calls" : edge.type;
}

export function findGraphPath(nodes: GraphNode[], edges: GraphEdge[], source: string, target: string): string[] {
  const ids = new Set(nodes.map((node) => node.id));
  if (!ids.has(source) || !ids.has(target)) return [];
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    const next = adjacency.get(edge.source) ?? [];
    next.push(edge.target);
    adjacency.set(edge.source, next);
  }
  const queue = [source];
  const previous = new Map<string, string | null>([[source, null]]);
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]!;
    if (id === target) {
      const path: string[] = [];
      let step: string | null = target;
      while (step !== null) { path.push(step); step = previous.get(step) ?? null; }
      return path.reverse();
    }
    for (const next of adjacency.get(id) ?? []) {
      if (previous.has(next)) continue;
      previous.set(next, id);
      queue.push(next);
    }
  }
  return [];
}

export function exploreGraph(graph: RepositoryGraph, selectedId: string, relationship: GraphRelationship, focus: boolean, target = "") {
  const ids = new Set(graph.nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target) && (relationship === "all" || relationshipOf(edge) === relationship));
  const selected = graph.nodes.find((node) => node.id === selectedId);
  const neighbors = new Set<string>(selected ? [selected.id] : []);
  for (const edge of edges) {
    if (edge.source === selectedId) neighbors.add(edge.target);
    if (edge.target === selectedId) neighbors.add(edge.source);
  }
  const path = target ? findGraphPath(graph.nodes, edges, selectedId, target) : [];
  const pathIds = new Set(path);
  const visible = path.length ? pathIds : focus && selected ? neighbors : ids;
  const pathPairs = new Set(path.slice(1).map((id, index) => JSON.stringify([path[index], id])));
  return {
    selected, neighbors, path,
    nodes: graph.nodes.filter((node) => visible.has(node.id)),
    edges: edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target) && (!path.length || pathPairs.has(JSON.stringify([edge.source, edge.target])))),
    incoming: edges.filter((edge) => edge.target === selectedId),
    outgoing: edges.filter((edge) => edge.source === selectedId)
  };
}

export function layoutRepositoryGraph(nodes: GraphNode[], layout: GraphLayout) {
  const positions = new Map<string, { x: number; y: number }>();
  const groups = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    const path = node.filePath ?? "";
    const module = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "root";
    const key = layout === "layers" ? node.type : module;
    const group = groups.get(key) ?? [];
    group.push(node);
    groups.set(key, group);
  }
  const keys = layout === "layers" ? ["repository", "folder", "file", "symbol"] : [...groups.keys()].sort();
  let y = 0;
  for (const key of keys) {
    const group = groups.get(key) ?? [];
    group.forEach((node, index) => positions.set(node.id, { x: (index % 4) * 210, y: y + Math.floor(index / 4) * 102 }));
    if (group.length) y += Math.ceil(group.length / 4) * 102 + (layout === "modules" ? 78 : 52);
  }
  return positions;
}

export function graphNodeTone(node: GraphNode) {
  if (node.type === "repository") return "rose";
  if (node.type === "folder") return "amber";
  if (node.type === "file") return "cyan";
  if (node.symbolKind === "class" || node.symbolKind === "interface" || node.symbolKind === "type") return "violet";
  return "mint";
}
