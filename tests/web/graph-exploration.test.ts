import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode, RepositoryGraph } from "@codemesh/shared";
import { exploreGraph, findGraphPath, graphNodeTone, layoutRepositoryGraph, relationshipOf } from "../../apps/web/src/lib/graphExploration";

const nodes: GraphNode[] = [
  { id: "a", label: "createApp", type: "symbol", symbolKind: "function", filePath: "src/server.ts" },
  { id: "b", label: "authorize", type: "symbol", symbolKind: "function", filePath: "src/auth.ts" },
  { id: "c", label: "User", type: "symbol", symbolKind: "interface", filePath: "src/auth/types.ts" },
  { id: "d", label: "isolated.ts", type: "file", filePath: "isolated.ts" }
];
const edges: GraphEdge[] = [
  { id: "ab", source: "a", target: "b", type: "references", label: "calls", verified: false },
  { id: "bc", source: "b", target: "c", type: "references", label: "calls", verified: false },
  { id: "ca", source: "c", target: "a", type: "imports", verified: true },
  { id: "ac", source: "a", target: "c", type: "exports", verified: true }
];
const graph: RepositoryGraph = { nodes, edges, generatedAt: "2026-10-10T00:00:00Z", warnings: [] };

describe("repository graph exploration", () => {
  it("finds a shortest directed path and terminates on cycles", () => {
    expect(findGraphPath(nodes, edges, "a", "c")).toEqual(["a", "c"]);
    expect(findGraphPath(nodes, edges, "b", "a")).toEqual(["b", "c", "a"]);
    expect(findGraphPath(nodes, edges, "a", "a")).toEqual(["a"]);
    expect(findGraphPath(nodes, edges, "a", "d")).toEqual([]);
    expect(findGraphPath(nodes, edges, "missing", "a")).toEqual([]);
  });
  it("distinguishes recorded calls from generic references without upgrading verification", () => {
    expect(relationshipOf(edges[0]!)).toBe("calls");
    const result = exploreGraph(graph, "a", "calls", true);
    expect(result.nodes.map((node) => node.id)).toEqual(["a", "b"]);
    expect(result.edges).toEqual([edges[0]]);
    expect(result.edges[0]!.verified).toBe(false);
    expect(result.incoming).toEqual([]);
    expect(result.outgoing).toEqual([edges[0]]);
  });
  it("traces only paths in the requested relationship view", () => {
    const result = exploreGraph(graph, "a", "calls", false, "c");
    expect(result.path).toEqual(["a", "b", "c"]);
    expect(result.nodes.map((node) => node.id)).toEqual(["a", "b", "c"]);
    expect(result.edges.map((edge) => edge.id)).toEqual(["ab", "bc"]);
    expect(exploreGraph(graph, "a", "imports", false, "c").path).toEqual([]);
  });
  it("preserves the full graph when focus is off and handles missing selection", () => {
    expect(exploreGraph(graph, "a", "all", false).nodes).toEqual(nodes);
    expect(exploreGraph(graph, "missing", "all", true).nodes).toEqual(nodes);
    expect(exploreGraph({ ...graph, nodes: [], edges: [] }, "a", "all", true).nodes).toEqual([]);
  });
  it("ignores dangling edges instead of drawing nonexistent code entities", () => {
    const result = exploreGraph({ ...graph, edges: [...edges, { id: "bad", source: "a", target: "missing", type: "imports", verified: false }] }, "a", "all", true);
    expect(result.edges.map((edge) => edge.id)).not.toContain("bad");
  });
  it("lays out every entity deterministically with no overlapping node tracks", () => {
    const many: GraphNode[] = Array.from({ length: 250 }, (_, index) => ({ id: `node-${index}`, label: `fn${index}`, type: index % 2 ? "file" : "symbol", filePath: `src/module-${index % 7}/file-${index}.ts` }));
    for (const layout of ["layers", "modules"] as const) {
      const positions = layoutRepositoryGraph(many, layout);
      expect(positions.size).toBe(many.length);
      expect(new Set([...positions.values()].map((position) => `${position.x}:${position.y}`)).size).toBe(many.length);
      expect(layoutRepositoryGraph(many, layout)).toEqual(positions);
    }
  });
  it("uses semantic colors for files, functions, and type contracts", () => {
    expect(graphNodeTone(nodes[0]!)).toBe("mint");
    expect(graphNodeTone(nodes[2]!)).toBe("violet");
    expect(graphNodeTone(nodes[3]!)).toBe("cyan");
  });
});
