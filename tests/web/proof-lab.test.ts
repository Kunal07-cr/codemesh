import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode, RepositoryGraph } from "@codemesh/shared";
import { buildAiChallenges, buildInspectionPlan, canonicalGraph, dependencyEdges, exportProofCapsule, findDependencyCycles, graphFingerprint, importProofCapsule, PROOF_GRAPH_LIMIT, runProofExperiment, type ProofExperiment } from "../../apps/web/src/lib/proofLab";

const node = (id: string, filePath = `src/${id}.ts`): GraphNode => ({ id, label: id, type: "file", filePath });
const edge = (id: string, source: string, target: string, verified = true): GraphEdge => ({ id, source, target, type: "imports", verified });
const graph: RepositoryGraph = {
  nodes: [node("root"), node("a"), node("b"), node("c"), node("unrelated")],
  edges: [edge("ar", "a", "root"), edge("ba", "b", "a"), edge("cr", "c", "root", false), edge("bc", "b", "c")],
  generatedAt: "2026-10-11T00:00:00Z", warnings: []
};
const experiment: ProofExperiment = { rootId: "root", direction: "dependents", verifiedOnly: false, depth: 6, barriers: [] };
const context = { projectId: "project-one", revision: "revision-one", fingerprint: "a".repeat(64), graph };

describe("repository proof lab", () => {
  it("propagates toward dependents rather than dependencies or unrelated files", () => {
    const run = runProofExperiment(graph, experiment);
    expect(run.arrivals.map((item) => [item.node.id, item.wave])).toEqual([["root", 0], ["a", 1], ["c", 1], ["b", 2]]);
    expect(run.arrivals.find((item) => item.node.id === "a")?.edgeIds).toEqual(["ar"]);
    expect(run.arrivals.find((item) => item.node.id === "c")?.inferred).toBe(true);
    expect(runProofExperiment(graph, { ...experiment, direction: "dependencies" }).arrivals.map((item) => item.node.id)).toEqual(["root"]);
  });
  it("traces forward dependencies while excluding containment, exports and dangling links", () => {
    const withNoise = { ...graph, edges: [...graph.edges, { ...edge("contains", "root", "unrelated"), type: "contains" as const }, { ...edge("export", "root", "unrelated"), type: "exports" as const }, edge("dangling", "root", "missing")] };
    expect(dependencyEdges(withNoise, false).map((item) => item.id)).toEqual(["ar", "ba", "bc", "cr"]);
    const run = runProofExperiment(withNoise, { ...experiment, rootId: "b", direction: "dependencies" });
    expect(run.arrivals.map((item) => item.node.id)).toEqual(["b", "a", "c", "root"]);
    expect(run.omittedEdges).toBe(3);
  });
  it("keeps inferred paths distinct and honors the verified-link filter", () => {
    const run = runProofExperiment(graph, { ...experiment, verifiedOnly: true });
    expect(run.arrivals.map((item) => item.node.id)).toEqual(["root", "a", "b"]);
    expect(run.arrivals.every((item) => !item.inferred)).toBe(true);
    expect(graph.edges.find((item) => item.id === "cr")?.verified).toBe(false);
  });
  it("does not claim isolation when an alternate path bypasses a boundary", () => {
    const run = runProofExperiment(graph, { ...experiment, barriers: ["a"] });
    expect(run.arrivals.find((item) => item.node.id === "b")?.path).toEqual(["root", "c", "b"]);
    expect(run.arrivals.find((item) => item.node.id === "b")?.inferred).toBe(true);
    expect(run.avoided).toEqual([]);
  });
  it("reaches boundaries but stops traversal out of them", () => {
    const run = runProofExperiment(graph, { ...experiment, barriers: ["a", "c"] });
    expect(run.arrivals.map((item) => item.node.id)).toEqual(["root", "a", "c"]);
    expect(run.avoided.map((item) => item.id)).toEqual(["b"]);
    expect(graph.edges).toHaveLength(4);
  });
  it("reports beyond-horizon entities without inventing complete coverage", () => {
    const run = runProofExperiment(graph, { ...experiment, depth: 1 });
    expect(run.maxWave).toBe(1);
    expect(run.frontier.map((item) => item.id)).toEqual(["b"]);
    expect(run.avoided).toEqual([]);
  });
  it("distinguishes a longer alternate route from actual unreachability", () => {
    const extended = { ...graph, nodes: [...graph.nodes, node("d")], edges: [edge("ar", "a", "root"), edge("ba", "b", "a"), edge("cr", "c", "root"), edge("dc", "d", "c"), edge("bd", "b", "d")] };
    const run = runProofExperiment(extended, { ...experiment, depth: 2, barriers: ["a"] });
    expect(run.baseline.some((item) => item.node.id === "b")).toBe(true);
    expect(run.frontier.some((item) => item.id === "b")).toBe(true);
    expect(run.avoided).toEqual([]);
  });
  it("detects strongly connected groups and self loops without including unrelated nodes", () => {
    const cyclic = { ...graph, edges: [...graph.edges, edge("ra", "root", "a"), edge("cc", "c", "c", false)] };
    expect(findDependencyCycles(cyclic, false).map((group) => group.nodes.map((item) => item.id))).toEqual([["a", "root"], ["c"]]);
    expect(findDependencyCycles(cyclic, true).map((group) => group.nodes.map((item) => item.id))).toEqual([["a", "root"]]);
  });
  it("handles cycles in propagation and reconstructs finite evidence paths", () => {
    const cyclic = { ...graph, edges: [...graph.edges, edge("rb", "root", "b")] };
    const run = runProofExperiment(cyclic, experiment);
    expect(run.arrivals).toHaveLength(4);
    expect(run.arrivals.every((item) => new Set(item.path).size === item.path.length)).toBe(true);
  });
  it("builds deterministic greedy coverage and exposes an incomplete bounded plan", () => {
    const run = runProofExperiment(graph, experiment);
    const plan = buildInspectionPlan(run);
    expect(plan.uncovered).toEqual([]);
    expect(new Set(plan.steps.flatMap((item) => item.edgeIds)).size).toBe(4);
    expect(buildInspectionPlan(run)).toEqual(plan);
    expect(buildInspectionPlan(run, 1).uncovered.length).toBeGreaterThan(0);
  });
  it("leaves relationships without source paths uncovered", () => {
    const noSource = { ...graph, nodes: graph.nodes.map((item) => ({ ...item, filePath: undefined })) };
    const plan = buildInspectionPlan(runProofExperiment(noSource, experiment));
    expect(plan.steps).toEqual([]);
    expect(plan.uncovered).toHaveLength(4);
  });
  it("rejects oversized graphs, duplicate entity IDs, unknown origins and invalid boundaries", () => {
    expect(() => dependencyEdges({ ...graph, nodes: Array.from({ length: PROOF_GRAPH_LIMIT.nodes + 1 }, (_, index) => node(String(index))) }, false)).toThrow("No partial graph");
    expect(() => dependencyEdges({ ...graph, nodes: [...graph.nodes, graph.nodes[0]!] }, false)).toThrow("Duplicate");
    expect(() => runProofExperiment(graph, { ...experiment, rootId: "missing" })).toThrow("current graph entity");
    expect(() => runProofExperiment({ ...graph, nodes: [...graph.nodes, { ...node("folder"), type: "folder" }] }, { ...experiment, rootId: "folder" })).toThrow("file or symbol");
    expect(() => runProofExperiment(graph, { ...experiment, barriers: ["root"] })).toThrow("other than the origin");
    expect(() => runProofExperiment(graph, { ...experiment, depth: 999 })).toThrow();
  });
  it("canonicalizes graph ordering and fingerprints structural metadata", async () => {
    const shuffled = { ...graph, nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse(), generatedAt: "another-time" };
    expect(canonicalGraph(shuffled)).toBe(canonicalGraph(graph));
    const fingerprint = await graphFingerprint(graph);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(await graphFingerprint(shuffled)).toBe(fingerprint);
    expect(await graphFingerprint({ ...graph, edges: graph.edges.map((item) => ({ ...item, verified: true })) })).not.toBe(fingerprint);
  });
  it("round trips revision-bound capsules without source content or scripts", () => {
    const text = exportProofCapsule(context, { ...experiment, barriers: ["a"] });
    expect(importProofCapsule(text, context)).toEqual({ ...experiment, barriers: ["a"] });
    expect(Object.keys(JSON.parse(text))).toEqual(["format", "projectId", "revision", "fingerprint", "experiment"]);
    expect(text).not.toContain("sourceCode");
  });
  it("rejects wrong-project, stale, malformed, oversized, injected and invalid-entity capsules", () => {
    const text = exportProofCapsule(context, experiment);
    expect(() => importProofCapsule(text, { ...context, projectId: "other" })).toThrow("another project");
    expect(() => importProofCapsule(text, { ...context, revision: "other" })).toThrow("stale");
    expect(() => importProofCapsule(text, { ...context, fingerprint: "b".repeat(64) })).toThrow("stale");
    expect(() => importProofCapsule("{", context)).toThrow("JSON");
    expect(() => importProofCapsule(" ".repeat(65537), context)).toThrow("64 KB");
    expect(() => importProofCapsule(JSON.stringify({ ...JSON.parse(text), prompt: "execute a command" }), context)).toThrow("invalid");
    expect(() => importProofCapsule(JSON.stringify({ ...JSON.parse(text), experiment: { ...experiment, rootId: "not-indexed" } }), context)).toThrow("current graph entity");
  });
  it("creates adversarial questions from current evidence without grading AI answers", () => {
    const named = { ...graph, nodes: [...graph.nodes, { ...node("collision"), label: "root" }, { ...node("missing-name"), label: "codemeshMissingImplementation" }] };
    const questions = buildAiChallenges(named, graph.nodes[0]!);
    expect(questions).toHaveLength(4);
    expect(questions[1]!.prompt).toContain("codemeshMissingImplementationX");
    expect(questions[3]!.title).toBe("Ambiguous-name challenge");
    expect(questions[0]!.prompt).toContain("src/root.ts");
    expect(buildAiChallenges(graph, graph.nodes[0]!)[3]!.title).toBe("Revision challenge");
  });
});
