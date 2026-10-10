import { useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance
} from "@xyflow/react";
import {
  Bot,
  Braces,
  ChevronRight,
  CloudSun,
  Code2,
  FileCode2,
  Filter,
  FolderTree,
  History,
  Lightbulb,
  LoaderCircle,
  LocateFixed,
  Network,
  Orbit,
  Route,
  Search,
  Send,
  Sparkles,
  X
} from "lucide-react";
import type { AiAnswer, AiAskRequest, GraphEdge, GraphNode, Project, RepoFile, RepositoryGraph } from "@codemesh/shared";
import { LoadingState } from "../components/LoadingState";
import { api, jsonBody } from "../lib/api";
import { useReducedMotion } from "../lib/useReducedMotion";

type UniversePayload = {
  project: Project;
  files: RepoFile[];
  graph: RepositoryGraph;
};

type UniversePanel = "explorer" | "search" | "filters" | "insights" | "ai" | null;
type UniverseFilter = "all" | "files" | "symbols" | "critical";
type UniverseTone = "core" | "frontend" | "backend" | "database" | "ai" | "external" | "critical" | "unused";

type UniverseNodeData = {
  graphNode: GraphNode;
  tone: UniverseTone;
  degree: number;
  incoming: number;
  outgoing: number;
  selected: boolean;
  related: boolean;
  dimmed: boolean;
  weather: boolean;
  intelligence: boolean;
};

type UniverseFlowNode = Node<UniverseNodeData, "universe">;

const nodeTypes = { universe: UniverseNode };
const timelineLabels = ["Root", "Folders", "Files", "Types", "Functions", "All"];
const intelligencePrompts = [
  "Explain the most important module in this architecture.",
  "What will break if I change the selected module?",
  "Find circular dependencies and high-coupling areas.",
  "Show the critical path through this repository."
];

export function ProjectUniversePage() {
  const { projectId = "" } = useParams();
  const flowRef = useRef<ReactFlowInstance<UniverseFlowNode, Edge> | null>(null);
  const [panel, setPanel] = useState<UniversePanel>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<UniverseFilter>("all");
  const [weather, setWeather] = useState(false);
  const [tunnel, setTunnel] = useState(false);
  const [timeline, setTimeline] = useState(5);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const reducedMotion = useReducedMotion();

  const workspace = useQuery({
    queryKey: ["workspace", projectId],
    queryFn: () => api<UniversePayload>(`/api/projects/${projectId}/workspace`)
  });
  const data = workspace.data;

  const intelligence = useMutation({
    mutationFn: (prompt: string) => api<AiAnswer>(`/api/projects/${projectId}/ai/ask`, {
      method: "POST",
      body: jsonBody({
        question: prompt,
        mode: "investigate",
        retrievalMode: "graph",
        includeWorkspace: true,
        activeFilePath: selectedId ? data?.graph.nodes.find((node) => node.id === selectedId)?.filePath : undefined,
        knowledgeScope: "repository",
        conversation: []
      } satisfies AiAskRequest)
    }),
    onSuccess: (result) => {
      setAnswer(result);
      const cited = data?.graph.nodes.find((node) => result.citations.some((citation) => citation.filePath === node.filePath));
      if (cited) setSelectedId(cited.id);
    }
  });

  const model = useMemo(() => data ? buildUniverseModel(data.graph, {
    selectedId,
    query,
    filter,
    weather,
    tunnel,
    timeline,
    reducedMotion,
    intelligenceFiles: new Set(answer?.citations.map((citation) => citation.filePath) ?? [])
  }) : null, [answer?.citations, data, filter, query, selectedId, timeline, tunnel, weather, reducedMotion]);

  if (workspace.isLoading) return <LoadingState label="Entering the code universe" />;
  if (!data || !model) return <div className="mx-auto max-w-4xl px-4 py-12 text-coral">The repository universe could not be initialized.</div>;

  const selected = selectedId ? data.graph.nodes.find((node) => node.id === selectedId) ?? null : null;
  const selectedDegree = selected ? model.degree.get(selected.id) ?? { incoming: 0, outgoing: 0 } : null;
  const criticalNodes = [...data.graph.nodes]
    .sort((a, b) => totalDegree(model.degree.get(b.id)) - totalDegree(model.degree.get(a.id)))
    .slice(0, 4);
  const isolated = data.graph.nodes.filter((node) => totalDegree(model.degree.get(node.id)) === 0);
  const cycleCount = countCircularRelationships(data.graph);

  function togglePanel(next: Exclude<UniversePanel, null>) {
    setPanel((current) => current === next ? null : next);
  }

  function askMesh(event?: FormEvent) {
    event?.preventDefault();
    const prompt = question.trim();
    if (prompt.length < 3 || intelligence.isPending) return;
    intelligence.mutate(prompt);
  }

  return (
    <section className={`cm-universe-page ${weather ? "is-weather" : ""} ${tunnel ? "is-tunnel" : ""}`}>
      <div className="cm-universe-identity">
        <div className="eyebrow"><Orbit className="h-3.5 w-3.5" /> Living repository</div>
        <h1>{data.project.name}</h1>
        <p>{data.graph.nodes.length} nodes <span /> {data.graph.edges.length} relationships</p>
      </div>

      <div className="cm-universe-signal" aria-live="polite">
        <i /> {weather ? "Code weather active" : tunnel ? "Dependency tunnel active" : "Mesh synchronized"}
      </div>

      <ReactFlow<UniverseFlowNode, Edge>
        nodes={model.nodes}
        edges={model.edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.15}
        maxZoom={2.2}
        panOnScroll
        selectionOnDrag={false}
        onInit={(instance) => { flowRef.current = instance; }}
        onPaneClick={() => setSelectedId(null)}
        onNodeClick={(_event: MouseEvent, node) => setSelectedId(node.id)}
      >
        <Background color={weather ? "#3b2430" : "#1c2b37"} gap={30} size={1} />
        <Controls showInteractive={false} position="bottom-right" />
        <MiniMap
          pannable
          zoomable
          position="top-right"
          nodeColor={(node) => toneColor((node.data as UniverseNodeData).tone)}
          maskColor="rgba(5, 9, 14, 0.78)"
        />
      </ReactFlow>

      <div className="cm-universe-dock" aria-label="Universe tools">
        <UniverseTool icon={FolderTree} label="Explorer" active={panel === "explorer"} onClick={() => togglePanel("explorer")} />
        <UniverseTool icon={Search} label="Search" active={panel === "search"} onClick={() => togglePanel("search")} />
        <UniverseTool icon={Bot} label="Mesh Intelligence" active={panel === "ai"} onClick={() => togglePanel("ai")} featured />
        <UniverseTool icon={Route} label="Dependency tunnel" active={tunnel} onClick={() => setTunnel((value) => !value)} disabled={!selectedId} />
        <UniverseTool icon={Lightbulb} label="Insights" active={panel === "insights"} onClick={() => togglePanel("insights")} />
        <UniverseTool icon={Filter} label="Filters" active={panel === "filters"} onClick={() => togglePanel("filters")} />
        <UniverseTool icon={CloudSun} label="Code weather" active={weather} onClick={() => setWeather((value) => !value)} />
        <UniverseTool icon={LocateFixed} label="Reset view" onClick={() => {
          setSelectedId(null);
          setTunnel(false);
          setQuery("");
          setFilter("all");
          void flowRef.current?.fitView({ duration: reducedMotion ? 0 : 260, padding: 0.16 });
        }} />
      </div>

      {panel && panel !== "ai" && (
        <aside className="cm-universe-panel cm-universe-panel-left">
          <button className="cm-universe-panel-close" type="button" title="Close panel" aria-label="Close panel" onClick={() => setPanel(null)}><X className="h-4 w-4" /></button>
          {panel === "explorer" && <ExplorerPanel nodes={data.graph.nodes} selectedId={selectedId} onSelect={setSelectedId} />}
          {panel === "search" && <SearchPanel value={query} onChange={setQuery} results={model.searchResults} onSelect={setSelectedId} />}
          {panel === "filters" && <FilterPanel value={filter} onChange={setFilter} />}
          {panel === "insights" && <InsightsPanel critical={criticalNodes} isolated={isolated.length} cycles={cycleCount} degree={model.degree} onSelect={setSelectedId} />}
        </aside>
      )}

      {panel === "ai" && (
        <aside className="cm-universe-panel cm-universe-intelligence">
          <button className="cm-universe-panel-close" type="button" title="Close intelligence" aria-label="Close intelligence" onClick={() => setPanel(null)}><X className="h-4 w-4" /></button>
          <div className="eyebrow"><Sparkles className="h-3.5 w-3.5" /> Mesh Intelligence</div>
          <h2>The graph can answer back.</h2>
          <p className="cm-universe-panel-copy">Questions use graph retrieval and illuminate cited repository nodes.</p>
          <div className="cm-intelligence-prompts">
            {intelligencePrompts.map((prompt) => <button key={prompt} type="button" onClick={() => setQuestion(prompt)}>{prompt}</button>)}
          </div>
          <form className="cm-intelligence-composer" onSubmit={askMesh}>
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about architecture, impact, or risk..." />
            <button type="submit" title="Ask Mesh Intelligence" aria-label="Ask Mesh Intelligence" disabled={question.trim().length < 3 || intelligence.isPending}>
              {intelligence.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
          {intelligence.error instanceof Error && <p className="cm-intelligence-error">{intelligence.error.message}</p>}
          {answer && (
            <div className="cm-intelligence-answer" aria-live="polite">
              <p>{answer.answer}</p>
              <div>{answer.citations.slice(0, 4).map((citation) => (
                <Link key={`${citation.filePath}:${citation.range.startLine}`} to={`/projects/${projectId}/workspace?path=${encodeURIComponent(citation.filePath)}&line=${citation.range.startLine}`}>
                  <FileCode2 className="h-3.5 w-3.5" /> {citation.filePath}:{citation.range.startLine}
                </Link>
              ))}</div>
            </div>
          )}
        </aside>
      )}

      {selected && selectedDegree && (
        <aside className="cm-universe-inspector">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="eyebrow"><Code2 className="h-3.5 w-3.5" /> Code inspector</div>
              <h2>{selected.label}</h2>
              <p>{selected.filePath ?? selected.type}</p>
            </div>
            <button type="button" title="Close inspector" aria-label="Close inspector" onClick={() => setSelectedId(null)}><X className="h-4 w-4" /></button>
          </div>
          <dl>
            <div><dt>Type</dt><dd>{selected.symbolKind ?? selected.type}</dd></div>
            <div><dt>Language</dt><dd>{selected.language ?? "mixed"}</dd></div>
            <div><dt>Dependencies</dt><dd>{selectedDegree.outgoing}</dd></div>
            <div><dt>Dependents</dt><dd>{selectedDegree.incoming}</dd></div>
            <div><dt>Complexity</dt><dd>{complexityLabel(totalDegree(selectedDegree))}</dd></div>
            <div><dt>Risk</dt><dd className={totalDegree(selectedDegree) >= 7 ? "text-coral" : totalDegree(selectedDegree) >= 4 ? "text-amber" : "text-mint"}>{riskLabel(totalDegree(selectedDegree))}</dd></div>
          </dl>
          {selected.filePath && <Link className="cm-inspector-open" to={`/projects/${projectId}/workspace?path=${encodeURIComponent(selected.filePath)}${selected.range ? `&line=${selected.range.startLine}` : ""}`}>Open source <ChevronRight className="h-4 w-4" /></Link>}
        </aside>
      )}

      <div className="cm-time-machine">
        <div className="cm-time-machine-label" title="Assembly of the current index, not repository commit history"><History className="h-3.5 w-3.5" /> Index assembly</div>
        <div className="cm-time-machine-track">
          <input aria-label="Index assembly stage" type="range" min="0" max="5" step="1" value={timeline} onChange={(event) => setTimeline(Number(event.target.value))} />
          <div>{timelineLabels.map((label, index) => <button key={label} type="button" className={timeline === index ? "is-active" : ""} onClick={() => setTimeline(index)}>{label}</button>)}</div>
        </div>
        <span>{timeline === 5 ? "current" : "preview"}</span>
      </div>
    </section>
  );
}

function UniverseNode({ data }: NodeProps<UniverseFlowNode>) {
  return (
    <div
      className={`cm-live-node ${data.selected ? "is-selected" : ""} ${data.related ? "is-related" : ""} ${data.dimmed ? "is-dimmed" : ""} ${data.weather ? "is-weather" : ""} ${data.intelligence ? "is-intelligence" : ""}`}
      data-tone={data.tone}
      style={{ "--node-degree": Math.min(10, data.degree) } as CSSProperties}
    >
      <Handle type="target" position={Position.Left} />
      <span className="cm-live-node-orbit"><i /></span>
      <div>
        <strong>{data.graphNode.label}</strong>
        <small>{data.graphNode.language ?? data.graphNode.symbolKind ?? data.graphNode.type}</small>
      </div>
      <em>{data.degree}</em>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function UniverseTool({ icon: Icon, label, active = false, featured = false, disabled = false, onClick }: { icon: typeof Bot; label: string; active?: boolean; featured?: boolean; disabled?: boolean; onClick(): void }) {
  return <button type="button" title={label} aria-label={label} aria-pressed={active} className={`${active ? "is-active" : ""} ${featured ? "is-featured" : ""}`} disabled={disabled} onClick={onClick}><Icon className="h-4 w-4" /><span>{label}</span></button>;
}

function ExplorerPanel({ nodes, selectedId, onSelect }: { nodes: GraphNode[]; selectedId: string | null; onSelect(id: string): void }) {
  return <><div className="eyebrow"><FolderTree className="h-3.5 w-3.5" /> Explorer</div><h2>Repository organisms</h2><div className="cm-universe-list">{nodes.slice(0, 80).map((node) => <button key={node.id} type="button" className={node.id === selectedId ? "is-active" : ""} onClick={() => onSelect(node.id)}><span>{node.type === "file" ? <FileCode2 className="h-3.5 w-3.5" /> : <Braces className="h-3.5 w-3.5" />}</span><div><strong>{node.label}</strong><small>{node.filePath ?? node.type}</small></div></button>)}</div></>;
}

function SearchPanel({ value, onChange, results, onSelect }: { value: string; onChange(value: string): void; results: GraphNode[]; onSelect(id: string): void }) {
  return <><div className="eyebrow"><Search className="h-3.5 w-3.5" /> Search universe</div><h2>Find any symbol.</h2><label className="cm-universe-search"><Search className="h-4 w-4" /><input autoFocus value={value} onChange={(event) => onChange(event.target.value)} placeholder="File, function, class..." /></label><div className="cm-universe-list">{results.slice(0, 18).map((node) => <button key={node.id} type="button" onClick={() => onSelect(node.id)}><span><LocateFixed className="h-3.5 w-3.5" /></span><div><strong>{node.label}</strong><small>{node.filePath ?? node.type}</small></div></button>)}</div></>;
}

function FilterPanel({ value, onChange }: { value: UniverseFilter; onChange(value: UniverseFilter): void }) {
  const options: Array<{ value: UniverseFilter; label: string; detail: string }> = [
    { value: "all", label: "Complete system", detail: "Files, symbols, and architecture" },
    { value: "files", label: "Files only", detail: "Collapse symbol-level detail" },
    { value: "symbols", label: "Functions and classes", detail: "Inspect code-level structure" },
    { value: "critical", label: "Critical modules", detail: "Show highly connected nodes" }
  ];
  return <><div className="eyebrow"><Filter className="h-3.5 w-3.5" /> Filters</div><h2>Reduce the signal.</h2><div className="cm-universe-options">{options.map((option) => <button key={option.value} type="button" className={value === option.value ? "is-active" : ""} onClick={() => onChange(option.value)}><strong>{option.label}</strong><small>{option.detail}</small></button>)}</div></>;
}

function InsightsPanel({ critical, isolated, cycles, degree, onSelect }: { critical: GraphNode[]; isolated: number; cycles: number; degree: Map<string, { incoming: number; outgoing: number }>; onSelect(id: string): void }) {
  return <><div className="eyebrow"><Lightbulb className="h-3.5 w-3.5" /> Architecture insights</div><h2>Signals in the mesh.</h2><div className="cm-insight-summary"><div><strong>{critical[0]?.label ?? "No core"}</strong><span>highest centrality</span></div><div><strong>{cycles}</strong><span>circular relationships</span></div><div><strong>{isolated}</strong><span>isolated nodes</span></div></div><div className="cm-universe-list">{critical.map((node) => <button key={node.id} type="button" onClick={() => onSelect(node.id)}><span><Network className="h-3.5 w-3.5" /></span><div><strong>{node.label}</strong><small>{totalDegree(degree.get(node.id))} direct relationships</small></div></button>)}</div></>;
}

function buildUniverseModel(graph: RepositoryGraph, state: { selectedId: string | null; query: string; filter: UniverseFilter; weather: boolean; tunnel: boolean; timeline: number; reducedMotion: boolean; intelligenceFiles: Set<string> }) {
  const degree = new Map<string, { incoming: number; outgoing: number }>();
  for (const node of graph.nodes) degree.set(node.id, { incoming: 0, outgoing: 0 });
  for (const edge of graph.edges) {
    const source = degree.get(edge.source); const target = degree.get(edge.target);
    if (source) source.outgoing += 1;
    if (target) target.incoming += 1;
  }
  const selectedNeighbors = new Set<string>();
  if (state.selectedId) {
    selectedNeighbors.add(state.selectedId);
    for (const edge of graph.edges) {
      if (edge.source === state.selectedId) selectedNeighbors.add(edge.target);
      if (edge.target === state.selectedId) selectedNeighbors.add(edge.source);
    }
  }
  const chain = state.tunnel && state.selectedId ? dependencyChain(graph, state.selectedId) : [];
  const chainSet = new Set(chain);
  const normalizedQuery = state.query.trim().toLowerCase();
  const searchResults = normalizedQuery ? graph.nodes.filter((node) => `${node.label} ${node.filePath ?? ""} ${node.symbolKind ?? ""}`.toLowerCase().includes(normalizedQuery)) : [];
  const searchIds = new Set(searchResults.map((node) => node.id));
  const visibleIds = new Set(graph.nodes.filter((node) => {
    const introducedAt = node.type === "repository" ? 0 : node.type === "folder" ? 1 : node.type === "file" ? 2 : ["class", "interface", "type"].includes(node.symbolKind ?? "") ? 3 : node.symbolKind === "function" ? 4 : 5;
    if (introducedAt > state.timeline) return false;
    const nodeDegree = totalDegree(degree.get(node.id));
    if (state.filter === "files" && node.type !== "file" && node.type !== "repository") return false;
    if (state.filter === "symbols" && node.type !== "symbol") return false;
    if (state.filter === "critical" && nodeDegree < 4) return false;
    return true;
  }).map((node) => node.id));
  const regularPositions = radialPositions(graph.nodes);
  const nodes: UniverseFlowNode[] = graph.nodes.map((node) => {
    const nodeDegree = degree.get(node.id) ?? { incoming: 0, outgoing: 0 };
    const total = totalDegree(nodeDegree);
    const isVisible = visibleIds.has(node.id);
    const isSelected = node.id === state.selectedId;
    const related = selectedNeighbors.has(node.id);
    const inSearch = searchIds.has(node.id);
    const inChain = chainSet.has(node.id);
    const tunnelPosition = inChain ? { x: chain.indexOf(node.id) * 270, y: 0 } : regularPositions.get(node.id)!;
    return {
      id: node.id,
      type: "universe",
      position: state.tunnel ? tunnelPosition : regularPositions.get(node.id)!,
      hidden: !isVisible,
      data: {
        graphNode: node,
        tone: semanticTone(node, total),
        degree: total,
        incoming: nodeDegree.incoming,
        outgoing: nodeDegree.outgoing,
        selected: isSelected,
        related,
        weather: state.weather,
        intelligence: Boolean(node.filePath && state.intelligenceFiles.has(node.filePath)),
        dimmed: (Boolean(state.selectedId) && !related) || (Boolean(normalizedQuery) && !inSearch) || (state.tunnel && !inChain)
      },
      style: { zIndex: isSelected ? 20 : related || inSearch || inChain ? 10 : 1 }
    };
  });
  const edges: Edge[] = graph.edges.map((edge) => {
    const active = Boolean(state.selectedId) && (edge.source === state.selectedId || edge.target === state.selectedId);
    const chainEdge = state.tunnel && chain.some((id, index) => id === edge.source && chain[index + 1] === edge.target);
    const dimmed = state.tunnel ? !chainEdge : Boolean(state.selectedId) && !active;
    const stroke = chainEdge ? "#f3ead6" : active ? (edge.source === state.selectedId ? "#64d6af" : "#56c7e8") : edgeColor(edge);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      hidden: !visibleIds.has(edge.source) || !visibleIds.has(edge.target),
      animated: !state.reducedMotion && (active || chainEdge),
      style: { stroke, strokeWidth: active || chainEdge ? 2.2 : 1, opacity: dimmed ? 0.08 : active || chainEdge ? 0.95 : 0.3 },
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 12, height: 12 }
    };
  });
  return { nodes, edges, degree, searchResults };
}

function radialPositions(nodes: GraphNode[]) {
  const positions = new Map<string, { x: number; y: number }>();
  const repository = nodes.find((node) => node.type === "repository");
  if (repository) positions.set(repository.id, { x: 0, y: 0 });
  const remaining = nodes.filter((node) => node.id !== repository?.id);
  remaining.forEach((node, index) => {
    const ring = Math.floor(index / 12) + 1;
    const ringItems = Math.min(12, remaining.length - (ring - 1) * 12);
    const ringIndex = index - (ring - 1) * 12;
    const angle = (ringIndex / Math.max(1, ringItems)) * Math.PI * 2 - Math.PI / 2;
    const radiusX = 300 + ring * 180;
    const radiusY = 210 + ring * 120;
    positions.set(node.id, { x: Math.cos(angle) * radiusX, y: Math.sin(angle) * radiusY });
  });
  return positions;
}

function dependencyChain(graph: RepositoryGraph, start: string) {
  const chain = [start];
  const seen = new Set(chain);
  let current = start;
  while (chain.length < 6) {
    const next = graph.edges.find((edge) => edge.source === current && !seen.has(edge.target))?.target
      ?? graph.edges.find((edge) => edge.target === current && !seen.has(edge.source))?.source;
    if (!next) break;
    chain.push(next);
    seen.add(next);
    current = next;
  }
  return chain;
}

function semanticTone(node: GraphNode, degree: number): UniverseTone {
  const source = `${node.label} ${node.filePath ?? ""} ${node.language ?? ""}`.toLowerCase();
  if (degree >= 8) return "critical";
  if (node.type === "repository") return "core";
  if (/ai|model|assistant|embedding|retrieval/.test(source)) return "ai";
  if (/prisma|sql|database|store|redis|mongo|postgres/.test(source)) return "database";
  if (/react|tsx|jsx|css|html|component|page/.test(source)) return "frontend";
  if (/github|http|client|socket|external|api\//.test(source)) return "external";
  if (degree === 0) return "unused";
  return "backend";
}

function toneColor(tone: UniverseTone) {
  return { core: "#f3ead6", frontend: "#56c7e8", backend: "#5b8cff", database: "#64d6af", ai: "#a78bfa", external: "#f2a65a", critical: "#ef746f", unused: "#526273" }[tone];
}

function edgeColor(edge: GraphEdge) {
  if (edge.label === "calls") return "#56c7e8";
  if (edge.type === "imports") return "#f2a65a";
  if (edge.type === "contains") return "#526273";
  return "#a78bfa";
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

function totalDegree(value?: { incoming: number; outgoing: number }) {
  return value ? value.incoming + value.outgoing : 0;
}

function complexityLabel(degree: number) {
  return degree >= 7 ? "High" : degree >= 4 ? "Medium" : "Focused";
}

function riskLabel(degree: number) {
  return degree >= 7 ? "High" : degree >= 4 ? "Review" : "Low";
}

function countCircularRelationships(graph: RepositoryGraph) {
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const edge of graph.edges) adjacency.get(edge.source)?.push(edge.target);
  let circular = 0;
  for (const edge of graph.edges) {
    if (hasPath(adjacency, edge.target, edge.source, new Set())) circular += 1;
  }
  return Math.min(circular, Math.floor(graph.edges.length / 2));
}

function hasPath(adjacency: Map<string, string[]>, current: string, target: string, seen: Set<string>): boolean {
  if (current === target) return true;
  if (seen.has(current)) return false;
  seen.add(current);
  return (adjacency.get(current) ?? []).some((next) => hasPath(adjacency, next, target, seen));
}
