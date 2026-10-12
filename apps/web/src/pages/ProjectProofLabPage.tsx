import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Bot, Check, Copy, Download, FileCode2, FlaskConical, GitCompareArrows, ListChecks, Network, Pause, Play, RefreshCw, RotateCcw, ShieldCheck, Upload, Waypoints } from "lucide-react";
import type { GraphNode, Project, RepoFile, RepositoryGraph } from "@codemesh/shared";
import { LoadingState } from "../components/LoadingState";
import { RepositoryGraphCanvas } from "../components/RepositoryGraphCanvas";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useReducedMotion } from "../lib/useReducedMotion";
import { buildAiChallenges, buildInspectionPlan, dependencyEdges, exportProofCapsule, findDependencyCycles, graphFingerprint, importProofCapsule, runProofExperiment, type Arrival, type ProofExperiment } from "../lib/proofLab";
import "../proof-lab.css";

const tools = [
  { id: "observatory", title: "Observatory", icon: Waypoints },
  { id: "boundaries", title: "Boundaries", icon: ShieldCheck },
  { id: "cycles", title: "Cycle atlas", icon: Network },
  { id: "inspection", title: "Inspection", icon: ListChecks },
  { id: "capsules", title: "Capsules", icon: GitCompareArrows },
  { id: "challenges", title: "AI challenges", icon: Bot }
] as const;
type Tool = typeof tools[number]["id"];
type LabData = { project: Project; graph: RepositoryGraph; fingerprint: string };
const sourceUrl = (projectId: string, path: string, line = 1) => `/projects/${projectId}/workspace?path=${encodeURIComponent(path)}&line=${line}`;

export function ProjectProofLabPage() {
  const { projectId = "" } = useParams();
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["proof-lab", user?.id ?? "public", projectId],
    queryFn: async () => {
      const snapshot = await api<{ project: Project; graph: RepositoryGraph }>(`/api/projects/${projectId}/proof`);
      return { ...snapshot, fingerprint: await graphFingerprint(snapshot.graph) };
    }
  });
  if (query.isLoading) return <LoadingState label="Loading repository proof lab" />;
  if (!query.data) return <section className="mx-auto max-w-4xl px-4 py-8"><Link className="action-secondary" to={`/projects/${projectId}`}><ArrowLeft size={16} /> Project</Link><h1 className="mt-5 text-2xl font-semibold text-white">Proof Lab unavailable</h1><p className="mt-3 text-steel" role="alert">{query.error instanceof Error ? query.error.message : "The repository graph could not be loaded."}</p><button className="action-secondary mt-4" type="button" onClick={() => void query.refetch()}><RefreshCw size={16} /> Retry</button></section>;
  return <ProofWorkbench key={`${user?.id ?? "public"}:${query.data.project.id}:${query.data.project.commitSha}:${query.data.fingerprint}`} data={query.data} refresh={() => void query.refetch()} refreshing={query.isFetching} />;
}

function ProofWorkbench({ data, refresh, refreshing }: { data: LabData; refresh(): void; refreshing: boolean }) {
  const [params, setParams] = useSearchParams();
  const active = tools.find((tool) => tool.id === params.get("tool"))?.id ?? "observatory";
  const candidates = useMemo(() => data.graph.nodes.filter((node) => node.type === "file" || node.type === "symbol").sort((a, b) => (a.filePath ?? "").localeCompare(b.filePath ?? "") || a.label.localeCompare(b.label)), [data.graph]);
  const preferred = candidates.find((node) => node.type === "file" && node.filePath === "src/auth/session.ts") ?? candidates.find((node) => node.type === "file") ?? candidates[0];
  const [experiment, setExperiment] = useState<ProofExperiment>({ rootId: preferred?.id ?? "", direction: "dependents", depth: 6, verifiedOnly: false, barriers: [] });
  const [wave, setWave] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState(preferred?.id ?? "");
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [boundarySearch, setBoundarySearch] = useState("");
  const [capsule, setCapsule] = useState("");
  const [notice, setNotice] = useState("");
  const [capsuleError, setCapsuleError] = useState("");
  const [copied, setCopied] = useState(false);
  const reducedMotion = useReducedMotion();
  const run = useMemo(() => candidates.length ? runProofExperiment(data.graph, experiment) : null, [data.graph, experiment, candidates.length]);
  const cycles = useMemo(() => findDependencyCycles(data.graph, experiment.verifiedOnly), [data.graph, experiment.verifiedOnly]);
  const plan = useMemo(() => run ? buildInspectionPlan(run) : null, [run]);
  const origin = data.graph.nodes.find((node) => node.id === experiment.rootId);
  const chosen = run?.arrivals.find((item) => item.node.id === selected) ?? run?.arrivals[0];
  const challenges = useMemo(() => origin ? buildAiChallenges(data.graph, origin) : [], [data.graph, origin]);
  const context = { projectId: data.project.id, revision: data.project.commitSha, fingerprint: data.fingerprint, graph: data.graph };

  useEffect(() => {
    if (!playing || reducedMotion || !run) return;
    const timer = window.setInterval(() => setWave((current) => Math.min(current + 1, run.maxWave)), 950);
    return () => window.clearInterval(timer);
  }, [playing, reducedMotion, run]);
  useEffect(() => { if (playing && run && wave >= run.maxWave) setPlaying(false); }, [playing, run, wave]);
  useEffect(() => { if (reducedMotion) setPlaying(false); }, [reducedMotion]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  function change(next: Partial<ProofExperiment>) {
    setExperiment((current) => ({ ...current, ...next }));
    setPlaying(false); setWave(0); setReviewed(new Set()); setNotice("");
    if (next.rootId) setSelected(next.rootId);
  }
  function selectTool(next: Tool) { const search = new URLSearchParams(params); search.set("tool", next); setParams(search, { replace: true }); setPlaying(false); }
  function tabKeys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % tools.length : event.key === "ArrowLeft" ? (index + tools.length - 1) % tools.length : event.key === "Home" ? 0 : event.key === "End" ? tools.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); selectTool(tools[next]!.id);
    document.getElementById(`proof-tab-${tools[next]!.id}`)?.focus();
  }
  function toggleBoundary(value: string) {
    if (!experiment.barriers.includes(value) && experiment.barriers.length >= 100) { setNotice("A maximum of 100 hypothetical boundaries can be selected."); return; }
    change({ barriers: experiment.barriers.includes(value) ? experiment.barriers.filter((item) => item !== value) : [...experiment.barriers, value] });
  }
  function downloadCapsule() {
    try {
      const text = exportProofCapsule(context, experiment);
      setCapsule(text); setCapsuleError("");
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "codaventra-proof-capsule.json"; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Experiment exported. Source code and chat history were not included.");
    } catch (error) { setCapsuleError(error instanceof Error ? error.message : "Export failed."); }
  }
  function loadCapsule() {
    try {
      const next = importProofCapsule(capsule, context);
      change(next); setCapsuleError(""); setNotice("Capsule matches the current project, revision, and graph."); selectTool("observatory");
    } catch (error) { setCapsuleError(error instanceof Error ? error.message : "Import failed."); }
  }

  if (!run || !origin) return <section className="mx-auto max-w-4xl px-4 py-8"><h1 className="text-2xl font-semibold text-white">Proof Lab</h1><p className="mt-4 text-steel">No indexed files or symbols are available.</p><Link className="action-secondary mt-4" to={`/projects/${data.project.id}/settings`}><Upload size={16} /> Repository settings</Link></section>;
  const waveArrivals = run.arrivals.filter((item) => item.wave <= wave);
  const display = waveArrivals.slice(0, 80);
  const displayIds = new Set(display.map((item) => item.node.id));
  const visualGraph = {
    ...data.graph,
    nodes: display.map((item) => item.node),
    edges: run.edges.filter((edge) => displayIds.has(edge.source) && displayIds.has(edge.target) && !experiment.barriers.includes(experiment.direction === "dependents" ? edge.target : edge.source))
  };
  const boundaryCandidates = run.baseline.filter((item) => item.node.id !== origin.id && `${item.node.label} ${item.node.filePath ?? ""}`.toLowerCase().includes(boundarySearch.toLowerCase()));

  return <section className="cm-proof-lab mx-auto max-w-7xl px-4 py-8" data-no-tilt>
    <header className="cm-proof-heading"><div><Link className="inline-flex items-center gap-1 text-xs text-steel hover:text-white" to={`/projects/${data.project.id}`}><ArrowLeft size={14} /> {data.project.name}</Link><div className="eyebrow mt-4"><FlaskConical size={14} /> Repository experiments</div><h1 className="mt-2 text-3xl font-bold text-white">Proof Lab</h1><p className="mt-2 text-sm text-steel">Static dependency model. No code executed; no runtime safety guarantee.</p></div><button className="cm-tool-button" type="button" title="Refresh current graph" aria-label="Refresh current graph" disabled={refreshing} onClick={refresh}><RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /></button></header>
    <div className="cm-proof-controls">
      <label>Origin<select className="field" aria-label="Experiment origin" value={experiment.rootId} onChange={(event) => change({ rootId: event.target.value, barriers: [] })}>{candidates.map((node) => <option value={node.id} key={node.id}>{node.label} - {node.filePath ?? node.type}</option>)}</select></label>
      <label>Traversal<select className="field" aria-label="Experiment traversal" value={experiment.direction} onChange={(event) => change({ direction: event.target.value as ProofExperiment["direction"], barriers: [] })}><option value="dependents">Who depends on this?</option><option value="dependencies">What does this depend on?</option></select></label>
      <label>Horizon<select className="field" aria-label="Dependency horizon" value={experiment.depth} onChange={(event) => change({ depth: Number(event.target.value) })}>{Array.from({ length: 12 }, (_, index) => index + 1).map((depth) => <option value={depth} key={depth}>{depth} hops</option>)}</select></label>
      <label className="cm-proof-check"><input type="checkbox" checked={!experiment.verifiedOnly} onChange={(event) => change({ verifiedOnly: !event.target.checked })} />Include inferred links</label>
    </div>
    <div className="cm-proof-metrics"><Metric title="Reached entities" value={run.arrivals.length} tone="cyan" /><Metric title="Inferred paths" value={run.arrivals.filter((item) => item.inferred).length} tone="amber" /><Metric title="Beyond horizon" value={run.frontier.length} tone="violet" /><Metric title="Hypothetically isolated" value={run.avoided.length} tone="mint" /></div>
    <div className="cm-proof-tabs" role="tablist" aria-label="Proof lab tools">{tools.map((tool, index) => <button id={`proof-tab-${tool.id}`} aria-controls={`proof-panel-${tool.id}`} key={tool.id} type="button" role="tab" tabIndex={active === tool.id ? 0 : -1} aria-selected={active === tool.id} onClick={() => selectTool(tool.id)} onKeyDown={(event) => tabKeys(event, index)}><tool.icon size={15} />{tool.title}</button>)}</div>
    {notice && <p className="cm-proof-notice" role="status">{notice}</p>}
    <div role="tabpanel" id={`proof-panel-${active}`} aria-labelledby={`proof-tab-${active}`}>
      {active === "observatory" && <>
        <div className="cm-proof-replay"><div><h2>Change Observatory</h2><span className="text-xs text-steel">Wave {wave} / {run.maxWave} · {display.length} / {waveArrivals.length} entities displayed</span></div><div className="cm-proof-replay-actions"><button className="cm-tool-button" aria-label="Reset dependency waves" title="Reset dependency waves" type="button" onClick={() => { setPlaying(false); setWave(0); }}><RotateCcw size={16} /></button><button className="cm-tool-button" aria-label={playing ? "Pause dependency waves" : "Play dependency waves"} title={reducedMotion ? "Automatic playback disabled by reduced motion" : "Replay dependency waves"} type="button" disabled={reducedMotion || run.maxWave === 0} onClick={() => { if (!playing && wave >= run.maxWave) setWave(0); setPlaying((value) => !value); }}>{playing ? <Pause size={16} /> : <Play size={16} />}</button><input aria-label="Dependency wave" type="range" min={0} max={run.maxWave} value={wave} disabled={run.maxWave === 0} onChange={(event) => { setPlaying(false); setWave(Number(event.target.value)); }} /></div></div>
        <div className="cm-proof-canvas"><RepositoryGraphCanvas graph={visualGraph} selectedNodeId={chosen?.node.id} selectedPath={chosen?.node.filePath} onSelectNode={(node) => setSelected(node.id)} /></div>
        <div className="cm-proof-evidence-grid"><div><h3>Reached in this wave</h3><div className="cm-proof-arrivals">{waveArrivals.map((item) => <button className={chosen?.node.id === item.node.id ? "is-selected" : ""} type="button" key={item.node.id} onClick={() => setSelected(item.node.id)}><span className="cm-proof-hop">{item.wave}</span><span className="cm-proof-entity"><strong>{item.node.label}</strong><small>{item.node.filePath ?? item.node.type}</small></span><span className={`cm-proof-evidence-tag ${item.inferred ? "is-inferred" : ""}`}>{item.wave === 0 ? "origin" : item.inferred ? "inferred" : "indexed"}</span></button>)}</div></div>{chosen && <EvidencePath arrival={chosen} graph={data.graph} projectId={data.project.id} />}</div>
      </>}
      {active === "boundaries" && <div className="cm-proof-two-column"><section><h2>Boundary experiments</h2><div className="cm-proof-comparison"><Metric title="Baseline reached" value={run.baseline.length} tone="cyan" /><Metric title="With boundaries" value={run.arrivals.length} tone="violet" /></div><p className="cm-proof-disclosure">A selected boundary stops outgoing traversal in this hypothetical model. It does not add a real guard, repair code, or eliminate alternate paths.</p><input className="field" aria-label="Filter boundary candidates" placeholder="Filter entities" value={boundarySearch} onChange={(event) => setBoundarySearch(event.target.value)} /><div className="cm-proof-boundaries">{boundaryCandidates.map((item) => <label key={item.node.id}><input type="checkbox" checked={experiment.barriers.includes(item.node.id)} onChange={() => toggleBoundary(item.node.id)} /><span><strong>{item.node.label}</strong><small>{item.node.filePath ?? item.node.type}</small></span><span className="text-xs text-steel">hop {item.wave}</span></label>)}{!boundaryCandidates.length && <p className="cm-proof-empty">No reachable boundary candidates match.</p>}</div><button className="action-secondary mt-4" type="button" disabled={!experiment.barriers.length} onClick={() => change({ barriers: [] })}><RotateCcw size={15} /> Reset boundaries</button></section><section><h3>Hypothetically isolated entities</h3><div className="cm-proof-source-list">{run.avoided.map((node) => <SourceLink key={node.id} node={node} projectId={data.project.id} />)}</div>{!run.avoided.length && <p className="cm-proof-empty">No entities became unreachable. Alternate paths remain part of the model.</p>}<h3 className="mt-6">Still reached</h3><div className="cm-proof-source-list">{run.arrivals.filter((item) => item.wave > 0).slice(0, 30).map((item) => <SourceLink key={item.node.id} node={item.node} projectId={data.project.id} />)}</div></section></div>}
      {active === "cycles" && <section className="cm-proof-section"><h2>Dependency cycle atlas</h2><p className="cm-proof-disclosure">{cycles.length} strongly connected groups in the current dependency graph. Containment and export links are excluded; a cycle is not automatically a defect.</p>{cycles.length ? <div className="cm-proof-cycle-list">{cycles.map((cycle, index) => <article key={cycle.nodes[0]!.id}><header><h3>Group {index + 1} · {cycle.nodes.length} entities</h3><span className={`cm-proof-evidence-tag ${cycle.inferred ? "is-inferred" : ""}`}>{cycle.inferred ? "includes inferred links" : "indexed links"}</span></header><div className="cm-proof-source-list">{cycle.nodes.map((node) => <SourceLink key={node.id} node={node} projectId={data.project.id} />)}</div><p className="text-xs text-steel">{cycle.edges.length} internal relationships</p><button className="action-secondary mt-3" type="button" onClick={() => { change({ rootId: cycle.nodes[0]!.id, barriers: [] }); selectTool("observatory"); }}><Waypoints size={15} /> Inspect propagation</button></article>)}</div> : <div className="cm-proof-empty"><ShieldCheck size={24} /><h3>No dependency cycles found</h3><p>Under the selected evidence filter. Unindexed or runtime relationships are not covered.</p></div>}</section>}
      {active === "inspection" && plan && <section className="cm-proof-section"><h2>Source-inspection planner</h2><div className="cm-proof-inspection-summary"><span>{reviewed.size} / {plan.steps.length} files reviewed</span><span>{plan.total - plan.uncovered.length} / {plan.total} indexed relationships covered by the plan</span></div><p className="cm-proof-disclosure">Greedy file coverage, not a globally minimal plan or a passing test result. Review marks stay in this session.</p><div className="cm-proof-inspection-list">{plan.steps.map((step, index) => <div key={step.path}><label><input type="checkbox" checked={reviewed.has(step.path)} onChange={(event) => setReviewed((current) => { const next = new Set(current); if (event.target.checked) next.add(step.path); else next.delete(step.path); return next; })} /><span className="cm-proof-hop">{index + 1}</span><span className="cm-proof-entity"><strong>{step.path}</strong><small>{step.edgeIds.length} newly covered relationships</small></span></label><Link className="cm-tool-button" aria-label={`Inspect ${step.path}`} title={`Inspect ${step.path}`} to={sourceUrl(data.project.id, step.path, step.line)}><FileCode2 size={16} /></Link></div>)}</div>{plan.uncovered.length > 0 && <p role="status" className="cm-proof-disclosure">{plan.uncovered.length} relationships remain uncovered within the 20-file plan limit.</p>}{!plan.total && <p className="cm-proof-empty">No dependency relationships between the reached entities. <Link to={origin.filePath ? sourceUrl(data.project.id, origin.filePath, origin.range?.startLine) : `/projects/${data.project.id}/workspace`}>Inspect the origin source</Link>.</p>}</section>}
      {active === "capsules" && <section className="cm-proof-section"><h2>Revision-bound experiment capsules</h2><dl className="cm-proof-capsule-meta"><div><dt>Revision</dt><dd>{data.project.commitSha}</dd></div><div><dt>Graph SHA-256</dt><dd>{data.fingerprint}</dd></div></dl><p className="cm-proof-disclosure">Entity IDs, revision metadata, and settings only; no source or chats. The fingerprint checks compatibility, not authorship or authenticity.</p><div className="cm-proof-capsule-actions"><button className="action-primary" type="button" onClick={downloadCapsule}><Download size={16} /> Export capsule</button><button className="action-secondary" type="button" disabled={!capsule} onClick={loadCapsule}><Upload size={16} /> Load experiment</button><button className="cm-tool-button" type="button" title="Copy capsule JSON" aria-label="Copy capsule JSON" disabled={!capsule} onClick={() => void navigator.clipboard.writeText(capsule).then(() => setCopied(true)).catch(() => setCapsuleError("Clipboard access was unavailable."))}>{copied ? <Check size={16} /> : <Copy size={16} />}</button></div><textarea className="field cm-proof-json" aria-label="Experiment capsule JSON" value={capsule} maxLength={65537} onChange={(event) => { setCapsule(event.target.value); setCapsuleError(""); }} placeholder="Experiment capsule JSON" spellCheck={false} />{capsuleError && <p className="text-sm text-coral" role="alert">{capsuleError}</p>}</section>}
      {active === "challenges" && <section className="cm-proof-section"><h2>AI challenge builder</h2><p className="cm-proof-disclosure">Source, missing-symbol, guarantee, and ambiguity challenges for the selected origin. Expected responses are review criteria, not automatic accuracy scores.</p><div className="cm-proof-challenges">{challenges.map((challenge) => <article key={challenge.id}><h3>{challenge.title}</h3><p>{challenge.prompt}</p><div className="cm-proof-challenge-expectation"><ShieldCheck size={16} /><span>{challenge.expectation}</span></div><Link className="action-secondary" to={`/projects/${data.project.id}/assistant?path=${encodeURIComponent(origin.filePath ?? "")}&prompt=${encodeURIComponent(challenge.prompt)}`}><Bot size={16} /> Open in assistant</Link></article>)}</div></section>}
    </div>
    <footer className="cm-proof-footer"><span>{data.project.commitSha}</span><span>{dependencyEdges(data.graph, experiment.verifiedOnly).length} eligible dependency links · {run.omittedEdges} structural, filtered, or invalid links excluded</span>{data.graph.warnings.length > 0 && <span className="text-amber">{data.graph.warnings.length} index warnings</span>}</footer>
  </section>;
}

function Metric({ title, value, tone }: { title: string; value: number; tone: string }) {
  return <div className={`cm-proof-metric is-${tone}`}><span>{title}</span><strong>{value}</strong></div>;
}

function SourceLink({ node, projectId }: { node: GraphNode; projectId: string }) {
  return node.filePath ? <Link to={sourceUrl(projectId, node.filePath, node.range?.startLine)}><FileCode2 size={15} /><span><strong>{node.label}</strong><small>{node.filePath}:{node.range?.startLine ?? 1}</small></span><ArrowRight size={14} /></Link> : <div><Network size={15} /><span>{node.label}</span></div>;
}

function EvidencePath({ arrival, graph, projectId }: { arrival: Arrival; graph: RepositoryGraph; projectId: string }) {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  return <section className="cm-proof-path"><h3>Evidence path</h3><ol>{arrival.path.map((value, index) => { const node = byId.get(value)!; const edge = graph.edges.find((item) => item.id === arrival.edgeIds[index - 1]); return <li key={value}>{edge && <span className={`cm-proof-path-edge ${edge.verified ? "" : "is-inferred"}`}><ArrowRight size={12} /> {edge.label ?? edge.type} · {edge.verified ? "indexed" : "inferred"}</span>}<SourceLink node={node} projectId={projectId} /></li>; })}</ol>{arrival.node.filePath && <SourceExcerpt projectId={projectId} node={arrival.node} />}</section>;
}

function SourceExcerpt({ projectId, node }: { projectId: string; node: GraphNode }) {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ["proof-source", user?.id ?? "public", projectId, node.filePath], queryFn: () => api<RepoFile>(`/api/projects/${projectId}/files/content?path=${encodeURIComponent(node.filePath!)}`) });
  if (query.isLoading) return <p className="text-xs text-steel" role="status">Loading source range...</p>;
  if (!query.data) return <p className="text-xs text-coral" role="alert">Source range unavailable.</p>;
  const lines = query.data.content.split("\n");
  const start = Math.max(1, Math.min(node.range?.startLine ?? 1, lines.length));
  const end = Math.min(lines.length, node.range?.endLine ?? start + 79, start + 79);
  return <div className="cm-proof-source"><div><span>Source lines {start}-{end}</span><Link to={sourceUrl(projectId, node.filePath!, start)} title="Open source in editor" aria-label="Open source in editor"><FileCode2 size={15} /></Link></div><pre><code>{lines.slice(start - 1, end).join("\n")}</code></pre></div>;
}
