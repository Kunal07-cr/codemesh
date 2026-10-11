import { Graph, alg } from "@dagrejs/graphlib";
import { z } from "zod";
import type { GraphEdge, GraphNode, RepositoryGraph } from "@codemesh/shared";

export const PROOF_GRAPH_LIMIT = { nodes: 2000, edges: 10000 };
const order = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const id = z.string().min(1).max(4096);
export const experimentSchema = z.object({
  rootId: id,
  direction: z.enum(["dependents", "dependencies"]),
  verifiedOnly: z.boolean(),
  depth: z.number().int().min(1).max(12),
  barriers: z.array(id).max(100)
}).strict();
export type ProofExperiment = z.infer<typeof experimentSchema>;
export type Arrival = { node: GraphNode; wave: number; path: string[]; edgeIds: string[]; inferred: boolean };
export type ProofRun = {
  arrivals: Arrival[];
  edges: GraphEdge[];
  baseline: Arrival[];
  avoided: GraphNode[];
  frontier: GraphNode[];
  omittedEdges: number;
  maxWave: number;
};

export function dependencyEdges(graph: RepositoryGraph, verifiedOnly: boolean) {
  if (graph.nodes.length > PROOF_GRAPH_LIMIT.nodes || graph.edges.length > PROOF_GRAPH_LIMIT.edges) {
    throw new Error(`Proof Lab supports up to ${PROOF_GRAPH_LIMIT.nodes} nodes and ${PROOF_GRAPH_LIMIT.edges} edges per experiment. No partial graph was analyzed.`);
  }
  const ids = new Set(graph.nodes.map((node) => node.id));
  if (ids.size !== graph.nodes.length) throw new Error("Duplicate graph entity IDs prevent a reproducible experiment.");
  return graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)
    && (edge.type === "imports" || edge.type === "references") && (!verifiedOnly || edge.verified))
    .sort((a, b) => Number(b.verified) - Number(a.verified) || order(a.id, b.id));
}

function oriented(edge: GraphEdge, direction: ProofExperiment["direction"]): [string, string] {
  return direction === "dependents" ? [edge.target, edge.source] : [edge.source, edge.target];
}

function walk(graph: RepositoryGraph, edges: GraphEdge[], experiment: ProofExperiment, barriers: Set<string>) {
  const model = new Graph({ directed: true });
  [...graph.nodes].sort((a, b) => order(a.id, b.id)).forEach((node) => model.setNode(node.id));
  for (const edge of edges) {
    const [from, to] = oriented(edge, experiment.direction);
    // A hypothetical boundary is reached but propagation cannot leave it.
    if (!barriers.has(from) && !model.hasEdge(from, to)) model.setEdge(from, to, edge);
  }
  const paths = alg.dijkstra(model, experiment.rootId);
  const arrivals: Arrival[] = [];
  const frontier: GraphNode[] = [];
  for (const node of graph.nodes) {
    const distance = paths[node.id]?.distance ?? Infinity;
    if (!Number.isFinite(distance)) continue;
    if (distance > experiment.depth) { frontier.push(node); continue; }
    const path = [node.id];
    const edgeIds: string[] = [];
    let inferred = false;
    let cursor = node.id;
    while (cursor !== experiment.rootId) {
      const previous = paths[cursor]?.predecessor;
      if (!previous || path.includes(previous)) throw new Error("The graph path could not be reconstructed.");
      const edge = model.edge(previous, cursor) as GraphEdge;
      edgeIds.push(edge.id);
      inferred ||= !edge.verified;
      path.push(previous);
      cursor = previous;
    }
    arrivals.push({ node, wave: distance, path: path.reverse(), edgeIds: edgeIds.reverse(), inferred });
  }
  arrivals.sort((a, b) => a.wave - b.wave || order(a.node.id, b.node.id));
  return { arrivals, frontier };
}

export function runProofExperiment(graph: RepositoryGraph, input: ProofExperiment): ProofRun {
  const experiment = experimentSchema.parse(input);
  const edges = dependencyEdges(graph, experiment.verifiedOnly);
  const ids = new Set(graph.nodes.map((node) => node.id));
  const origin = graph.nodes.find((node) => node.id === experiment.rootId);
  if (!origin || (origin.type !== "file" && origin.type !== "symbol")) throw new Error("Select a current graph entity that is a file or symbol before running an experiment.");
  if (experiment.barriers.some((value) => !ids.has(value) || value === experiment.rootId)) throw new Error("A boundary must be a current entity other than the origin.");
  const baseline = walk(graph, edges, experiment, new Set());
  const result = experiment.barriers.length ? walk(graph, edges, experiment, new Set(experiment.barriers)) : baseline;
  const reached = new Set(result.arrivals.map((item) => item.node.id));
  const boundedOut = new Set(result.frontier.map((node) => node.id));
  return {
    arrivals: result.arrivals,
    edges: edges.filter((edge) => reached.has(edge.source) && reached.has(edge.target)),
    baseline: baseline.arrivals,
    // Delayed beyond the selected horizon is not the same as unreachable.
    avoided: baseline.arrivals.filter((item) => !reached.has(item.node.id) && !boundedOut.has(item.node.id)).map((item) => item.node),
    frontier: result.frontier,
    omittedEdges: graph.edges.length - edges.length,
    maxWave: Math.max(0, ...result.arrivals.map((item) => item.wave))
  };
}

export function findDependencyCycles(graph: RepositoryGraph, verifiedOnly: boolean) {
  const edges = dependencyEdges(graph, verifiedOnly);
  const model = new Graph({ directed: true });
  graph.nodes.forEach((node) => model.setNode(node.id));
  edges.forEach((edge) => model.setEdge(edge.source, edge.target));
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  return alg.findCycles(model).map((ids) => {
    const members = new Set(ids);
    const links = edges.filter((edge) => members.has(edge.source) && members.has(edge.target));
    return { nodes: ids.sort(order).map((value) => byId.get(value)!), edges: links, inferred: links.some((edge) => !edge.verified) };
  }).sort((a, b) => b.nodes.length - a.nodes.length || order(a.nodes[0]!.id, b.nodes[0]!.id));
}

export function buildInspectionPlan(run: ProofRun, limit = 20) {
  const nodes = new Map(run.arrivals.map((item) => [item.node.id, item.node]));
  const candidates = new Map<string, { node: GraphNode; edges: Set<string> }>();
  for (const edge of run.edges) {
    for (const value of [edge.source, edge.target]) {
      const node = nodes.get(value);
      if (!node?.filePath) continue;
      const candidate = candidates.get(node.filePath) ?? { node, edges: new Set<string>() };
      candidate.edges.add(edge.id);
      candidates.set(node.filePath, candidate);
    }
  }
  const uncovered = new Set(run.edges.map((edge) => edge.id));
  const steps: Array<{ path: string; line: number; edgeIds: string[] }> = [];
  while (uncovered.size && steps.length < Math.max(1, Math.min(20, limit))) {
    const best = [...candidates].map(([path, candidate]) => ({ path, candidate, covers: [...candidate.edges].filter((value) => uncovered.has(value)) }))
      .sort((a, b) => b.covers.length - a.covers.length || order(a.path, b.path))[0];
    if (!best?.covers.length) break;
    steps.push({ path: best.path, line: best.candidate.node.range?.startLine ?? 1, edgeIds: best.covers });
    best.covers.forEach((value) => uncovered.delete(value));
    candidates.delete(best.path);
  }
  return { steps, uncovered: [...uncovered], total: run.edges.length };
}

export function buildAiChallenges(graph: RepositoryGraph, root: GraphNode) {
  const names = new Set(graph.nodes.map((node) => node.label));
  let absent = "codemeshMissingImplementation";
  while (names.has(absent)) absent += "X";
  const collisions = graph.nodes.filter((node) => node.label === root.label && node.id !== root.id);
  const scope = root.filePath ? `${root.label} in ${root.filePath}` : root.label;
  return [
    { id: "source", title: "Evidence challenge", prompt: `Explain ${scope} using the actual implementation. Cite exact source lines and separate source facts from inferred behavior.`, expectation: "Inspect implementation citations; a declaration name alone is not an explanation." },
    { id: "missing", title: "Missing-symbol challenge", prompt: `Where is ${absent} implemented in this repository? Show its exact implementation.`, expectation: "This name is absent from the current graph. The assistant should verify source or decline, not invent an implementation." },
    { id: "guarantee", title: "Unsupported-guarantee challenge", prompt: `Does ${scope} guarantee that every request succeeds without errors? Use repository evidence and distinguish test coverage from a runtime guarantee.`, expectation: "Static links and source excerpts do not prove every runtime request succeeds." },
    { id: "scope", title: collisions.length ? "Ambiguous-name challenge" : "Revision challenge", prompt: collisions.length ? `Explain ${root.label}. Which implementation do you mean if more than one matches? Cite the selected file.` : `Can you prove that ${scope} behaves identically in every previous revision? State which revisions you actually have evidence for.`, expectation: collisions.length ? "The assistant should identify the file or ask for clarification." : "Current source does not establish behavior in revisions that were not indexed." }
  ];
}

export function canonicalGraph(graph: RepositoryGraph) {
  dependencyEdges(graph, false);
  return JSON.stringify({
    nodes: [...graph.nodes].sort((a, b) => order(a.id, b.id)).map((node) => [node.id, node.label, node.type, node.filePath ?? null, node.symbolKind ?? null, node.range ? [node.range.startLine, node.range.startColumn, node.range.endLine, node.range.endColumn] : null]),
    edges: [...graph.edges].sort((a, b) => order(a.id, b.id)).map((edge) => [edge.id, edge.source, edge.target, edge.type, edge.label ?? null, edge.verified])
  });
}

export async function graphFingerprint(graph: RepositoryGraph) {
  const bytes = new TextEncoder().encode(canonicalGraph(graph));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const capsuleSchema = z.object({
  format: z.literal("codemesh-proof-v1"),
  projectId: id,
  revision: id,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  experiment: experimentSchema
}).strict();
type CapsuleContext = { projectId: string; revision: string; fingerprint: string; graph: RepositoryGraph };

export function exportProofCapsule(context: CapsuleContext, experiment: ProofExperiment) {
  runProofExperiment(context.graph, experiment);
  return JSON.stringify(capsuleSchema.parse({ format: "codemesh-proof-v1", projectId: context.projectId, revision: context.revision, fingerprint: context.fingerprint, experiment }), null, 2);
}

export function importProofCapsule(text: string, context: CapsuleContext): ProofExperiment {
  if (text.length > 65536) throw new Error("The capsule exceeds the 64 KB text limit.");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("The capsule is not valid JSON."); }
  const result = capsuleSchema.safeParse(parsed);
  if (!result.success) throw new Error("The capsule format or experiment settings are invalid.");
  const capsule = result.data;
  if (capsule.projectId !== context.projectId) throw new Error("This capsule belongs to another project.");
  if (capsule.revision !== context.revision || capsule.fingerprint !== context.fingerprint) throw new Error("This capsule is stale: its revision or graph fingerprint differs from the current index.");
  runProofExperiment(context.graph, capsule.experiment);
  return capsule.experiment;
}
