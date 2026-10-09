import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Bot,
  Boxes,
  Check,
  CheckCircle2,
  Clipboard,
  Code2,
  Download,
  FileCode2,
  Fingerprint,
  Gauge,
  GitCompareArrows,
  GraduationCap,
  Network,
  PackageSearch,
  Play,
  Radar,
  RefreshCw,
  Route,
  Siren,
  ShieldCheck,
  Sparkles,
  TestTube2,
  UsersRound,
  WandSparkles
} from "lucide-react";
import type { GraphEdge, GraphNode, PublicUser } from "@codemesh/shared";
import { LoadingState } from "../components/LoadingState";
import { RepositoryChallengeRoom } from "../components/RepositoryChallengeRoom";
import { api } from "../lib/api";

type Risk = "low" | "medium" | "high";
type InvariantCategory = "access" | "configuration" | "interface" | "data" | "resilience" | "verification";
type LabTab = "impact" | "evolution" | "quality" | "guardrails" | "invariants" | "challenge" | "team" | "studio";

type LabsPayload = {
  project: { id: string; name: string; description: string; commitSha: string; source: string; languages: string[] };
  nodes: GraphNode[];
  impact: null | { node: GraphNode; incoming: GraphNode[]; outgoing: GraphNode[]; affectedFiles: string[]; risk: Risk };
  graphCommand: { command: string; intent: string; summary: string; nodes: GraphNode[]; connectingEdges: GraphEdge[] };
  evolution: {
    snapshots: RepositorySnapshot[];
    from: RepositorySnapshot | null;
    to: RepositorySnapshot | null;
    addedNodes: string[];
    removedNodes: string[];
    addedEdges: number;
    removedEdges: number;
  };
  qualityTimeline: QualitySnapshot[];
  architecturePolicies: Array<{ id: string; title: string; rule: string; status: "pass" | "warning" | "violation"; detail: string; evidenceFiles: string[] }>;
  securityFlows: Array<{ id: string; title: string; severity: "info" | "warning" | "critical"; source: string; sink: string; nodeIds: string[]; filePaths: string[]; detail: string }>;
  dependencies: Array<{ name: string; currentVersion: string; manifest: string; usageFiles: string[]; risk: Risk; reason: string; recommendedAction: string }>;
  testPlans: Array<{ id: string; targetNodeId: string; target: string; filePath: string; testFilePath: string; command: string; cases: string[] }>;
  hotspots: Array<{ filePath: string; score: number; relationships: number; sourceLines: number; findings: number; risk: Risk; suggestedSteward: PublicUser | null; ownershipEvidence: string }>;
  ownership: { members: Array<{ userId: string; role: string; activityEvents: number; user: PublicUser | null }>; activeStewards: number; busFactorRisk: "high" | "controlled" };
  onboarding: Array<{ id: string; title: string; detail: string; filePath: string; line: number; category: string }>;
  reviewCouncil: Array<{ id: string; name: string; verdict: "pass" | "review" | "block"; summary: string; findings: Array<{ title: string; detail: string; filePath?: string; line?: number }> }>;
  invariantLedger: {
    score: number;
    guarded: number;
    attention: number;
    categoryCoverage: number;
    contracts: Array<{ id: string; category: InvariantCategory; title: string; statement: string; status: "guarded" | "watch" | "unverified"; confidence: number; filePath: string; line: number; evidence: string; dependentFiles: string[]; contradiction?: string }>;
    drills: Array<{ id: string; title: string; hypothesis: string; severity: Risk; contractIds: string[]; affectedFiles: string[]; recoverySteps: string[] }>;
  };
  documentation: { generatedAt: string; files: number; symbols: number; relationships: number; entryPoints: string[]; modules: string[] };
};

type RepositorySnapshot = {
  id: string;
  commitSha: string;
  source: string;
  createdAt: string;
  files: number;
  symbols: number;
  relationships: number;
};

type QualitySnapshot = {
  id: string;
  commitSha: string;
  score: number;
  coverageEstimate: number;
  criticalFindings: number;
  warningFindings: number;
  reason: string;
  createdAt: string;
};

const tabs: Array<{ id: LabTab; label: string; icon: typeof Activity; tone: string }> = [
  { id: "impact", label: "Impact", icon: Radar, tone: "cm-tone-cyan" },
  { id: "evolution", label: "Evolution", icon: GitCompareArrows, tone: "cm-tone-violet" },
  { id: "quality", label: "Quality", icon: TestTube2, tone: "cm-tone-amber" },
  { id: "guardrails", label: "Guardrails", icon: ShieldCheck, tone: "cm-tone-coral" },
  { id: "invariants", label: "Invariants", icon: Fingerprint, tone: "cm-tone-cyan" },
  { id: "challenge", label: "Challenge Room", icon: GraduationCap, tone: "cm-tone-rose" },
  { id: "team", label: "Team", icon: UsersRound, tone: "cm-tone-mint" },
  { id: "studio", label: "Studio", icon: WandSparkles, tone: "cm-tone-rose" }
];

export function ProjectLabsPage() {
  const { projectId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const requestedTab = searchParams.get("lab") as LabTab | null;
  const tab = tabs.some((item) => item.id === requestedTab) ? requestedTab! : "impact";
  const [nodeId, setNodeId] = useState("");
  const [commandDraft, setCommandDraft] = useState("show the authentication flow");
  const [command, setCommand] = useState("show the authentication flow");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const labs = useQuery({
    queryKey: ["engineering-labs", projectId, nodeId, command, fromId, toId],
    queryFn: () => api<LabsPayload>(`/api/projects/${projectId}/labs?nodeId=${encodeURIComponent(nodeId)}&command=${encodeURIComponent(command)}&from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}`)
  });
  const snapshot = useMutation({
    mutationFn: () => api("/api/projects/" + projectId + "/labs/snapshot", { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["engineering-labs", projectId] })
  });

  if (labs.isLoading) return <LoadingState label="Loading engineering labs" />;
  if (!labs.data) return <div className="mx-auto max-w-7xl px-4 py-8 text-coral">Engineering Labs could not be loaded.</div>;
  const data = labs.data;
  const policyPasses = data.architecturePolicies.filter((policy) => policy.status === "pass").length;

  function runCommand(event: FormEvent) {
    event.preventDefault();
    setCommand(commandDraft.trim() || "show the repository entry points");
  }

  function selectTab(nextTab: LabTab) {
    const next = new URLSearchParams(searchParams);
    if (nextTab === "impact") next.delete("lab");
    else next.set("lab", nextTab);
    setSearchParams(next, { replace: true });
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div><Link className="inline-flex items-center gap-1 text-xs text-steel hover:text-white" to={`/projects/${projectId}`}><ArrowLeft className="h-3.5 w-3.5" /> Project</Link></div>
          <div className="eyebrow mt-4"><Sparkles className="h-3.5 w-3.5" /> Engineering labs</div>
          <h1 className="mt-2 text-3xl font-bold text-white">Repository decision laboratory</h1>
          <p className="mt-2 max-w-3xl text-steel">Evidence-backed analysis for change planning, architecture, security, quality, ownership, and onboarding.</p>
        </div>
        <div className="flex gap-2">
          <Link className="action-secondary" to={`/projects/${projectId}/intelligence`}><Activity className="h-4 w-4" /> Intelligence</Link>
          <Link className="action-primary" to={`/projects/${projectId}/workspace`}><Code2 className="h-4 w-4" /> Workspace</Link>
        </div>
      </div>

      <div className="cm-stagger mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryMetric label="Architecture policies" value={`${policyPasses}/${data.architecturePolicies.length}`} tone="cm-tone-cyan" />
        <SummaryMetric label="Security paths" value={String(data.securityFlows.length)} tone="cm-tone-coral" />
        <SummaryMetric label="Test targets" value={String(data.testPlans.length)} tone="cm-tone-violet" />
        <SummaryMetric label="Invariants with evidence" value={`${data.invariantLedger.guarded}/${data.invariantLedger.contracts.length}`} tone="cm-tone-mint" />
        <SummaryMetric label="Current commit" value={shortSha(data.project.commitSha)} tone="cm-tone-amber" mono />
      </div>

      <div className="cm-scrollbar mt-6 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Engineering lab workbenches">
        {tabs.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} className={`${item.tone} flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm ${tab === item.id ? "cm-tone-border text-white" : "border-transparent text-steel hover:text-white"}`} type="button" role="tab" aria-selected={tab === item.id} onClick={() => selectTab(item.id)}><Icon className="cm-tone-text h-4 w-4" />{item.label}</button>;
        })}
      </div>

      {tab === "impact" && <ImpactLab data={data} nodeId={nodeId} setNodeId={setNodeId} commandDraft={commandDraft} setCommandDraft={setCommandDraft} runCommand={runCommand} projectId={projectId} />}
      {tab === "evolution" && <EvolutionLab data={data} fromId={fromId} toId={toId} setFromId={setFromId} setToId={setToId} capture={() => snapshot.mutate()} capturing={snapshot.isPending} captureError={snapshot.error instanceof Error ? snapshot.error.message : ""} />}
      {tab === "quality" && <QualityLab data={data} projectId={projectId} />}
      {tab === "guardrails" && <GuardrailLab data={data} projectId={projectId} />}
      {tab === "invariants" && <InvariantLab data={data} projectId={projectId} />}
      {tab === "challenge" && <RepositoryChallengeRoom project={data.project} nodes={data.nodes} contracts={data.invariantLedger.contracts} />}
      {tab === "team" && <TeamLab data={data} projectId={projectId} />}
      {tab === "studio" && <StudioLab data={data} projectId={projectId} rerun={() => void labs.refetch()} running={labs.isFetching} />}
    </section>
  );
}

function ImpactLab({ data, nodeId, setNodeId, commandDraft, setCommandDraft, runCommand, projectId }: { data: LabsPayload; nodeId: string; setNodeId(value: string): void; commandDraft: string; setCommandDraft(value: string): void; runCommand(event: FormEvent): void; projectId: string }) {
  const impact = data.impact;
  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><div className="eyebrow"><Radar className="h-3.5 w-3.5" /> Change impact simulator</div><h2 className="mt-2 text-xl font-semibold text-white">Blast radius</h2></div>
          <label className="min-w-64 text-xs text-steel">Graph target<select className="field mt-1" value={nodeId || impact?.node.id || ""} onChange={(event) => setNodeId(event.target.value)}>{data.nodes.map((node) => <option key={node.id} value={node.id}>{node.filePath ? `${node.label} - ${node.filePath}` : node.label}</option>)}</select></label>
        </div>
        {impact && <div className="mt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetric label="Incoming" value={impact.incoming.length} tone="text-cyan" />
            <MiniMetric label="Outgoing" value={impact.outgoing.length} tone="text-violet" />
            <MiniMetric label="Risk" value={impact.risk.toUpperCase()} tone={riskText(impact.risk)} />
          </div>
          <div className="mt-4 divide-y divide-line border-y border-line">
            {impact.affectedFiles.map((path) => <Link key={path} className="flex items-center justify-between gap-3 py-3 font-mono text-sm text-steel hover:text-white" to={`/projects/${projectId}/workspace?path=${encodeURIComponent(path)}`}><span className="truncate">{path}</span><ArrowRight className="h-4 w-4 shrink-0 text-mint" /></Link>)}
          </div>
        </div>}
      </section>

      <section>
        <div className="eyebrow"><Network className="h-3.5 w-3.5" /> Natural-language graph command</div>
        <form className="mt-3 flex gap-2" onSubmit={runCommand}><input className="field" value={commandDraft} onChange={(event) => setCommandDraft(event.target.value)} placeholder="Show every function involved in authentication" /><button className="action-primary" type="submit"><Play className="h-4 w-4" /> Run</button></form>
        <div className="mt-4 flex items-center justify-between border-b border-line pb-3"><div><div className="text-xs uppercase text-steel">{data.graphCommand.intent}</div><p className="mt-1 text-sm text-white">{data.graphCommand.summary}</p></div><span className="font-mono text-xs text-cyan">{data.graphCommand.connectingEdges.length} links</span></div>
        <div className="divide-y divide-line">
          {data.graphCommand.nodes.map((node) => <Link key={node.id} className="flex items-center gap-3 py-3" to={node.filePath ? `/projects/${projectId}/workspace?path=${encodeURIComponent(node.filePath)}&line=${node.range?.startLine ?? 1}` : `/projects/${projectId}/workspace`}><div className={`h-2 w-2 shrink-0 rounded-full ${node.type === "file" ? "bg-cyan" : node.symbolKind === "class" ? "bg-violet" : "bg-mint"}`} /><div className="min-w-0"><div className="truncate text-sm text-white">{node.label}</div><div className="truncate font-mono text-xs text-steel">{node.filePath ?? node.type}</div></div></Link>)}
        </div>
      </section>
    </div>
  );
}

function EvolutionLab({ data, fromId, toId, setFromId, setToId, capture, capturing, captureError }: { data: LabsPayload; fromId: string; toId: string; setFromId(value: string): void; setToId(value: string): void; capture(): void; capturing: boolean; captureError: string }) {
  const snapshots = data.evolution.snapshots;
  const timeline = [...data.qualityTimeline].reverse();
  return (
    <div className="mt-6 space-y-8">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="eyebrow"><GitCompareArrows className="h-3.5 w-3.5" /> Architecture time machine</div><h2 className="mt-2 text-xl font-semibold text-white">Graph evolution</h2></div><button className="action-primary" type="button" disabled={capturing} onClick={capture}><RefreshCw className={`h-4 w-4 ${capturing ? "animate-spin" : ""}`} /> {capturing ? "Capturing" : "Capture baseline"}</button></div>
        {captureError && <div className="mt-3 border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{captureError}</div>}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <SnapshotSelect label="From" value={fromId || data.evolution.from?.id || ""} snapshots={snapshots} onChange={setFromId} />
          <SnapshotSelect label="To" value={toId || data.evolution.to?.id || ""} snapshots={snapshots} onChange={setToId} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DeltaMetric label="Nodes added" value={data.evolution.addedNodes.length} positive />
          <DeltaMetric label="Nodes removed" value={data.evolution.removedNodes.length} />
          <DeltaMetric label="Links added" value={data.evolution.addedEdges} positive />
          <DeltaMetric label="Links removed" value={data.evolution.removedEdges} />
        </div>
      </section>

      <section>
        <div className="eyebrow"><Activity className="h-3.5 w-3.5" /> Repository quality timeline</div>
        <div className="mt-4 flex min-h-64 items-end gap-3 border-b border-l border-line px-4 pb-4 pt-8">
          {timeline.map((point) => <div key={point.id} className="group flex min-w-14 flex-1 flex-col items-center justify-end gap-2" title={`${point.reason}: ${point.score}/100`}><div className="font-mono text-xs text-white">{point.score}</div><div className={`w-full max-w-16 rounded-t transition-all duration-700 ${point.score >= 80 ? "bg-mint" : point.score >= 55 ? "bg-amber" : "bg-coral"}`} style={{ height: `${Math.max(12, point.score * 1.55)}px` }} /><div className="max-w-20 truncate text-[10px] text-steel">{shortSha(point.commitSha)}</div></div>)}
          {timeline.length === 0 && <div className="m-auto text-sm text-steel">Capture a baseline to start the timeline.</div>}
        </div>
      </section>
    </div>
  );
}

function QualityLab({ data, projectId }: { data: LabsPayload; projectId: string }) {
  return (
    <div className="mt-6 grid gap-7 xl:grid-cols-2">
      <section>
        <div className="eyebrow"><TestTube2 className="h-3.5 w-3.5" /> AI test and repair lab</div>
        <h2 className="mt-2 text-xl font-semibold text-white">Targeted verification plans</h2>
        <div className="mt-4 divide-y divide-line border-y border-line">
          {data.testPlans.map((plan) => <details key={plan.id} className="group py-3"><summary className="flex cursor-pointer list-none items-center justify-between gap-3"><div><div className="font-mono text-sm text-white">{plan.target}</div><div className="mt-1 text-xs text-steel">{plan.filePath}</div></div><span className="rounded border border-line px-2 py-1 font-mono text-[10px] text-mint">{plan.command}</span></summary><div className="mt-3 border-l-2 border-violet pl-4"><div className="text-xs uppercase text-steel">Proposed test file</div><div className="mt-1 font-mono text-xs text-white">{plan.testFilePath}</div>{plan.cases.map((testCase) => <div key={testCase} className="mt-2 flex gap-2 text-sm text-steel"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint" />{testCase}</div>)}<div className="mt-3 flex gap-2"><Link className="action-secondary" to={`/projects/${projectId}/workspace?path=${encodeURIComponent(plan.filePath)}`}><FileCode2 className="h-4 w-4" /> Source</Link><Link className="action-primary" to={`/projects/${projectId}/assistant?path=${encodeURIComponent(plan.filePath)}&prompt=${encodeURIComponent(`Create focused tests for ${plan.target} in ${plan.filePath}. Cover: ${plan.cases.join("; ")}.`)}`}><Bot className="h-4 w-4" /> Draft with Copilot</Link></div></div></details>)}
        </div>
      </section>

      <section>
        <div className="eyebrow"><PackageSearch className="h-3.5 w-3.5" /> Dependency upgrade planner</div>
        <h2 className="mt-2 text-xl font-semibold text-white">Upgrade readiness</h2>
        <div className="mt-4 divide-y divide-line border-y border-line">
          {data.dependencies.map((dependency) => <div key={`${dependency.manifest}:${dependency.name}`} className="py-3"><div className="flex items-start justify-between gap-3"><div><div className="font-mono text-sm text-white">{dependency.name}</div><div className="mt-1 font-mono text-xs text-steel">{dependency.currentVersion} in {dependency.manifest}</div></div><RiskPill risk={dependency.risk} /></div><p className="mt-2 text-sm leading-6 text-steel">{dependency.reason}</p><p className="mt-1 text-xs leading-5 text-cyan">{dependency.recommendedAction}</p><div className="mt-2 text-xs text-steel">Usage surface: {dependency.usageFiles.length} file{dependency.usageFiles.length === 1 ? "" : "s"}</div></div>)}
          {data.dependencies.length === 0 && <div className="py-8 text-sm text-steel">No supported dependency manifest was indexed.</div>}
        </div>
      </section>
    </div>
  );
}

function GuardrailLab({ data, projectId }: { data: LabsPayload; projectId: string }) {
  return (
    <div className="mt-6 grid gap-7 xl:grid-cols-2">
      <section>
        <div className="eyebrow"><Boxes className="h-3.5 w-3.5" /> Architecture drift detection</div>
        <h2 className="mt-2 text-xl font-semibold text-white">Policy results</h2>
        <div className="mt-4 divide-y divide-line border-y border-line">
          {data.architecturePolicies.map((policy) => <div key={policy.id} className="py-4"><div className="flex items-center gap-2">{policy.status === "pass" ? <CheckCircle2 className="h-4 w-4 text-mint" /> : <AlertTriangle className={`h-4 w-4 ${policy.status === "violation" ? "text-coral" : "text-amber"}`} />}<h3 className="text-sm font-semibold text-white">{policy.title}</h3><span className="ml-auto font-mono text-[10px] uppercase text-steel">{policy.status}</span></div><p className="mt-2 text-sm text-steel">{policy.detail}</p><p className="mt-1 text-xs text-cyan">Rule: {policy.rule}</p><div className="mt-2 flex flex-wrap gap-2">{policy.evidenceFiles.map((path) => <Link key={path} className="font-mono text-[11px] text-mint hover:underline" to={`/projects/${projectId}/workspace?path=${encodeURIComponent(path)}`}>{path}</Link>)}</div></div>)}
        </div>
      </section>

      <section>
        <div className="eyebrow"><Route className="h-3.5 w-3.5" /> Security data-flow tracing</div>
        <h2 className="mt-2 text-xl font-semibold text-white">Trust-boundary paths</h2>
        <div className="mt-4 space-y-3">
          {data.securityFlows.map((flow) => <div key={flow.id} className={`surface-panel cm-accent-card ${flow.severity === "critical" ? "cm-tone-coral" : flow.severity === "warning" ? "cm-tone-amber" : "cm-tone-cyan"} p-4`} data-reveal><div className="flex items-center gap-2"><ShieldCheck className="cm-icon-motion h-4 w-4" /><h3 className="text-sm font-semibold text-white">{flow.title}</h3></div><div className="mt-3 flex items-center gap-2 font-mono text-xs"><span className="text-cyan">{flow.source}</span><ArrowRight className="h-3.5 w-3.5 text-steel" /><span className="text-violet">{flow.sink}</span></div><p className="mt-2 text-sm leading-6 text-steel">{flow.detail}</p><div className="mt-2 flex flex-wrap gap-2">{flow.filePaths.map((path) => <Link key={path} className="font-mono text-[11px] text-mint hover:underline" to={`/projects/${projectId}/workspace?path=${encodeURIComponent(path)}`}>{path}</Link>)}</div></div>)}
        </div>
      </section>
    </div>
  );
}

function InvariantLab({ data, projectId }: { data: LabsPayload; projectId: string }) {
  const ledger = data.invariantLedger;
  const [filter, setFilter] = useState<"all" | "attention" | InvariantCategory>("all");
  const [drillId, setDrillId] = useState(ledger.drills[0]?.id ?? "");
  const [phase, setPhase] = useState(0);
  const [runningId, setRunningId] = useState("");
  const [runRevision, setRunRevision] = useState(0);
  const drill = ledger.drills.find((candidate) => candidate.id === drillId) ?? ledger.drills[0];
  const triggered = new Set(phase >= 2 && runningId === drill?.id ? drill?.contractIds ?? [] : []);
  useEffect(() => {
    if (!runningId) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced";
    if (reduced) { setPhase(3); return; }
    const mapping = window.setTimeout(() => setPhase(2), 500);
    const completion = window.setTimeout(() => setPhase(3), 1100);
    return () => { window.clearTimeout(mapping); window.clearTimeout(completion); };
  }, [runningId, runRevision]);
  const contracts = ledger.contracts.filter((contract) => filter === "all" || (filter === "attention" ? contract.status !== "guarded" : contract.category === filter));
  const filters: Array<{ id: typeof filter; label: string }> = [
    { id: "all", label: "All" },
    { id: "attention", label: "Needs attention" },
    { id: "access", label: "Trust" },
    { id: "configuration", label: "Runtime" },
    { id: "interface", label: "Interfaces" },
    { id: "data", label: "Data" },
    { id: "resilience", label: "Resilience" },
    { id: "verification", label: "Tests" }
  ];

  return (
    <div className="mt-6 space-y-7">
      <section className="cm-invariant-stage" data-reveal>
        <div className="cm-invariant-copy">
          <div className="eyebrow"><Fingerprint className="h-3.5 w-3.5" /> Repository invariant ledger</div>
          <h2>Invariant Ledger</h2>
          <p>Static TypeScript and JavaScript evidence. Scenarios are modeled from graph relationships; no source code or tests are executed.</p>
        </div>
        <div className="cm-invariant-score" style={{ "--invariant-score": `${ledger.score * 3.6}deg` } as CSSProperties} aria-label={`Heuristic static evidence score ${ledger.score} out of 100`} title="Heuristic evidence score, not test coverage or an accuracy measurement">
          <span><strong>{ledger.score}</strong><small>/100</small></span>
        </div>
        <dl className="cm-invariant-stats">
          <div><dt>Evidence linked</dt><dd>{ledger.guarded}</dd></div>
          <div><dt>Attention</dt><dd>{ledger.attention}</dd></div>
          <div><dt>Signal types</dt><dd>{ledger.categoryCoverage}/6</dd></div>
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.08fr)_minmax(24rem,0.92fr)]">
        <section className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><div className="eyebrow"><Gauge className="h-3.5 w-3.5" /> Contract evidence</div><h2 className="mt-2 text-xl font-semibold text-white">Repository promises</h2></div>
            <span className="font-mono text-xs text-steel">{contracts.length} visible</span>
          </div>
          <div className="cm-invariant-filters mt-4" role="group" aria-label="Filter repository invariants">
            {filters.map((item) => <button key={item.id} className={filter === item.id ? "is-active" : ""} type="button" onClick={() => setFilter(item.id)}>{item.label}</button>)}
          </div>
          <div className="mt-4 border-y border-line">
            {contracts.map((contract) => (
              <details key={contract.id} className={`cm-invariant-contract ${triggered.has(contract.id) ? "is-triggered" : ""}`} data-category={contract.category}>
                <summary>
                  <span className="cm-invariant-marker"><Fingerprint className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><strong>{contract.title}</strong><small>{contract.category} · {contract.dependentFiles.length} connected file{contract.dependentFiles.length === 1 ? "" : "s"}</small></span>
                  <span className={`cm-invariant-status ${contract.status}`}>{contract.status === "guarded" ? "evidence linked" : contract.status}</span>
                </summary>
                <div className="cm-invariant-evidence">
                  <p>{contract.statement}</p>
                  <code>{contract.evidence}</code>
                  {contract.contradiction && <div className="cm-invariant-warning"><AlertTriangle className="h-4 w-4" /> {contract.contradiction}</div>}
                  <div className="mt-3 flex flex-wrap items-center gap-3"><Link className="inline-flex items-center gap-1 font-mono text-xs text-mint" to={`/projects/${projectId}/workspace?path=${encodeURIComponent(contract.filePath)}&line=${contract.line}`}><FileCode2 className="h-3.5 w-3.5" /> {contract.filePath}:{contract.line}</Link><Link className="inline-flex items-center gap-1 text-xs text-violet" to={`/projects/${projectId}/assistant?path=${encodeURIComponent(contract.filePath)}&prompt=${encodeURIComponent(`Draft a focused regression test for this inferred contract: ${contract.statement} Source: ${contract.filePath}:${contract.line}. Check the implementation before proposing a patch.`)}`}><Bot className="h-3.5 w-3.5" /> Draft regression test</Link><span className="text-xs text-steel">Related files: {contract.dependentFiles.slice(0, 3).join(", ")}</span></div>
                </div>
              </details>
            ))}
            {contracts.length === 0 && <div className="py-10 text-center text-sm text-steel">No contracts match this filter.</div>}
          </div>
        </section>

        <section className="cm-failure-drill min-w-0">
          <div className="eyebrow"><Siren className="h-3.5 w-3.5" /> Failure drill console</div>
          <h2 className="mt-2 text-xl font-semibold text-white">Failure scenario explorer</h2>
          <div className="cm-failure-drill-tabs mt-4" role="tablist" aria-label="Invariant failure drills">
            {ledger.drills.map((item, index) => <button key={item.id} className={item.id === drill?.id ? "is-active" : ""} type="button" role="tab" aria-selected={item.id === drill?.id} title={item.title} onClick={() => { setDrillId(item.id); setRunningId(""); setPhase(0); }}><span>{String(index + 1).padStart(2, "0")}</span>{item.title}</button>)}
          </div>
          {drill ? <div className="cm-failure-drill-body">
            <div className="flex items-start justify-between gap-3"><div><div className="text-xs uppercase text-steel">Hypothetical condition</div><h3 className="mt-1 text-lg font-semibold text-white">{drill.title}</h3></div><RiskPill risk={drill.severity} /></div>
            <p className="mt-3 text-sm leading-6 text-steel">{drill.hypothesis}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3"><button className="action-primary" type="button" disabled={phase > 0 && phase < 3} onClick={() => { setPhase(1); setRunningId(drill.id); setRunRevision((revision) => revision + 1); }}><Play className="h-4 w-4" /> {phase > 0 && phase < 3 ? "Mapping" : "Map scenario"}</button><span className="text-xs text-steel" role="status">{phase === 3 ? "Scenario mapped; source unchanged" : phase === 2 ? "Tracing related files" : phase === 1 ? "Matching source contracts" : "Static model"}</span></div>
            <div className={`cm-invariant-ripple mt-5 ${phase >= 2 ? "is-mapped" : ""}`}>
              <div className="cm-invariant-cause"><Siren className="h-5 w-5" /><span>{phase >= 2 ? "Modeled assumption break" : "Scenario ready"}</span></div>
              {drill.contractIds.map((id, index) => { const contract = ledger.contracts.find((candidate) => candidate.id === id); return contract ? <button key={id} type="button" onClick={() => setFilter(contract.category)}><i style={{ "--ripple-index": index } as CSSProperties} /><span>{contract.title}</span><small>{contract.filePath}:{contract.line}</small></button> : null; })}
            </div>
            <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <div><div className="text-xs font-semibold uppercase text-cyan">Recovery sequence</div><ol className="mt-2 space-y-2">{drill.recoverySteps.map((step, index) => <li key={step} className="flex gap-2 text-sm leading-5 text-steel"><span className="font-mono text-xs text-mint">{index + 1}</span>{step}</li>)}</ol></div>
              <div><div className="text-xs font-semibold uppercase text-violet">Graph-related surface</div><div className="mt-2 max-h-36 space-y-2 overflow-y-auto pr-1">{drill.affectedFiles.map((path) => <Link key={path} className="block truncate font-mono text-xs text-steel hover:text-white" to={`/projects/${projectId}/workspace?path=${encodeURIComponent(path)}`}>{path}</Link>)}</div></div>
            </div>
          </div> : <div className="mt-6 border-y border-line py-10 text-center text-sm text-steel">Import more source code to generate failure drills.</div>}
        </section>
      </div>
    </div>
  );
}

function TeamLab({ data, projectId }: { data: LabsPayload; projectId: string }) {
  const storageKey = `codemesh-onboarding:${projectId}`;
  const [completed, setCompleted] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "[]") as string[]; } catch { return []; }
  });
  function toggle(id: string) {
    const next = completed.includes(id) ? completed.filter((item) => item !== id) : [...completed, id];
    setCompleted(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }
  return (
    <div className="mt-6 grid gap-7 xl:grid-cols-2">
      <section>
        <div className="eyebrow"><UsersRound className="h-3.5 w-3.5" /> Knowledge and ownership map</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><MiniMetric label="Active stewards" value={data.ownership.activeStewards} tone="text-mint" /><MiniMetric label="Bus-factor signal" value={data.ownership.busFactorRisk.toUpperCase()} tone={data.ownership.busFactorRisk === "high" ? "text-coral" : "text-cyan"} /></div>
        <div className="mt-4 divide-y divide-line border-y border-line">{data.ownership.members.map((member) => <div key={member.userId} className="flex items-center justify-between gap-3 py-3"><div><div className="text-sm text-white">{member.user?.name ?? member.userId}</div><div className="text-xs text-steel">{member.role}</div></div><span className="font-mono text-xs text-cyan">{member.activityEvents} events</span></div>)}</div>
        <h2 className="mt-6 font-semibold text-white">Change hotspots</h2>
        <div className="mt-2 divide-y divide-line border-y border-line">{data.hotspots.slice(0, 6).map((hotspot) => <Link key={hotspot.filePath} className="flex items-center gap-3 py-3" to={`/projects/${projectId}/workspace?path=${encodeURIComponent(hotspot.filePath)}`}><div className="grid h-9 w-9 place-items-center rounded border border-line bg-ink font-mono text-xs text-white">{hotspot.score}</div><div className="min-w-0 flex-1"><div className="truncate font-mono text-xs text-white">{hotspot.filePath}</div><div className="mt-1 text-xs text-steel">{hotspot.relationships} links, {hotspot.sourceLines} lines, {hotspot.suggestedSteward?.name ?? "unassigned"}</div></div><RiskPill risk={hotspot.risk} /></Link>)}</div>
      </section>

      <section>
        <div className="flex items-end justify-between gap-3"><div><div className="eyebrow"><GraduationCap className="h-3.5 w-3.5" /> Interactive onboarding journey</div><h2 className="mt-2 text-xl font-semibold text-white">Repository learning path</h2></div><span className="font-mono text-xs text-mint">{completed.length}/{data.onboarding.length}</span></div>
        <div className="mt-4 space-y-3">{data.onboarding.map((step, index) => { const done = completed.includes(step.id); return <div key={step.id} className={`surface-panel cm-accent-card ${["cm-tone-cyan", "cm-tone-violet", "cm-tone-coral", "cm-tone-amber", "cm-tone-mint"][index % 5]} flex gap-3 p-4`} data-reveal><button className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded border ${done ? "border-mint bg-mint text-ink" : "border-line text-steel hover:border-mint"}`} type="button" aria-label={done ? `Mark ${step.title} incomplete` : `Complete ${step.title}`} aria-pressed={done} onClick={() => toggle(step.id)}>{done ? <Check className="h-4 w-4" /> : <span className="font-mono text-[10px]">{index + 1}</span>}</button><div className="min-w-0"><h3 className={`text-sm font-semibold ${done ? "text-steel line-through" : "text-white"}`}>{step.title}</h3><p className="mt-1 text-sm leading-6 text-steel">{step.detail}</p><Link className="mt-2 inline-flex items-center gap-1 font-mono text-xs text-mint" to={`/projects/${projectId}/workspace?path=${encodeURIComponent(step.filePath)}&line=${step.line}`}><BookOpenCheck className="h-3.5 w-3.5" /> {step.filePath}</Link></div></div>; })}</div>
      </section>
    </div>
  );
}

function StudioLab({ data, projectId, rerun, running }: { data: LabsPayload; projectId: string; rerun(): void; running: boolean }) {
  const [documentType, setDocumentType] = useState<"architecture" | "onboarding" | "review">("architecture");
  const [copied, setCopied] = useState(false);
  const markdown = useMemo(() => generateDocumentation(data, documentType), [data, documentType]);
  async function copyDocument() {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  function downloadDocument() {
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${data.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${documentType}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="mt-6 grid gap-7 xl:grid-cols-2">
      <section>
        <div className="eyebrow"><FileCode2 className="h-3.5 w-3.5" /> Automated documentation studio</div>
        <div className="mt-3 flex flex-wrap gap-2"><select className="field max-w-56" value={documentType} onChange={(event) => setDocumentType(event.target.value as typeof documentType)}><option value="architecture">Architecture brief</option><option value="onboarding">Onboarding guide</option><option value="review">Review report</option></select><button className="action-secondary" type="button" onClick={() => void copyDocument()}><Clipboard className="h-4 w-4" /> {copied ? "Copied" : "Copy"}</button><button className="action-primary" type="button" onClick={downloadDocument}><Download className="h-4 w-4" /> Download</button></div>
        <pre className="cm-scrollbar mt-4 max-h-[34rem] overflow-auto whitespace-pre-wrap border border-line bg-ink p-4 font-mono text-xs leading-6 text-steel">{markdown}</pre>
      </section>

      <section>
        <div className="flex items-end justify-between gap-3"><div><div className="eyebrow"><Bot className="h-3.5 w-3.5" /> Multi-agent code review</div><h2 className="mt-2 text-xl font-semibold text-white">Review council</h2></div><button className="action-secondary" type="button" disabled={running} onClick={rerun}><RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} /> Run council</button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{data.reviewCouncil.map((agent) => <article key={agent.id} className={`surface-panel cm-accent-card ${agent.verdict === "block" ? "cm-tone-coral" : agent.verdict === "review" ? "cm-tone-amber" : "cm-tone-mint"} p-4`} data-reveal><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-white">{agent.name}</h3><span className={`font-mono text-[10px] uppercase ${agent.verdict === "block" ? "text-coral" : agent.verdict === "review" ? "text-amber" : "text-mint"}`}>{agent.verdict}</span></div><p className="mt-2 text-sm leading-6 text-steel">{agent.summary}</p><div className="mt-3 space-y-2">{agent.findings.slice(0, 3).map((finding) => <div key={`${finding.title}:${finding.filePath ?? ""}`} className="border-l border-line pl-3"><div className="text-xs text-white">{finding.title}</div><div className="mt-1 text-[11px] leading-5 text-steel">{finding.detail}</div>{finding.filePath && <Link className="mt-1 block truncate font-mono text-[10px] text-mint" to={`/projects/${projectId}/workspace?path=${encodeURIComponent(finding.filePath)}&line=${finding.line ?? 1}`}>{finding.filePath}:{finding.line ?? 1}</Link>}</div>)}{agent.findings.length === 0 && <div className="flex items-center gap-2 text-xs text-mint"><CheckCircle2 className="h-3.5 w-3.5" /> No blocking evidence</div>}</div></article>)}</div>
      </section>
    </div>
  );
}

function SummaryMetric({ label, value, tone, mono = false }: { label: string; value: string; tone: string; mono?: boolean }) {
  return <div className={`surface-panel cm-accent-card ${tone} p-4`} data-reveal><div className="text-xs uppercase text-steel">{label}</div><div className={`mt-2 truncate text-2xl font-bold text-white ${mono ? "font-mono" : ""}`}>{value}</div></div>;
}

function MiniMetric({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return <div className="border-l border-line py-1 pl-3"><div className="text-xs uppercase text-steel">{label}</div><div className={`mt-1 text-xl font-bold ${tone}`}>{value}</div></div>;
}

function DeltaMetric({ label, value, positive = false }: { label: string; value: number; positive?: boolean }) {
  return <div className="surface-panel p-4"><div className="text-xs uppercase text-steel">{label}</div><div className={`mt-2 text-2xl font-bold ${positive ? "text-mint" : value ? "text-coral" : "text-white"}`}>{positive && value > 0 ? "+" : value > 0 ? "-" : ""}{value}</div></div>;
}

function SnapshotSelect({ label, value, snapshots, onChange }: { label: string; value: string; snapshots: RepositorySnapshot[]; onChange(value: string): void }) {
  return <label className="text-xs text-steel">{label}<select className="field mt-1" value={value} onChange={(event) => onChange(event.target.value)}>{snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{shortSha(snapshot.commitSha)} - {snapshot.source} - {new Date(snapshot.createdAt).toLocaleString()}</option>)}</select></label>;
}

function RiskPill({ risk }: { risk: Risk }) {
  return <span className={`rounded border px-2 py-1 font-mono text-[10px] uppercase ${risk === "high" ? "border-coral/40 bg-coral/10 text-coral" : risk === "medium" ? "border-amber/40 bg-amber/10 text-amber" : "border-mint/40 bg-mint/10 text-mint"}`}>{risk}</span>;
}

function riskText(risk: Risk) {
  return risk === "high" ? "text-coral" : risk === "medium" ? "text-amber" : "text-mint";
}

function shortSha(value: string) {
  return value.length > 16 ? value.slice(0, 13) + "..." : value;
}

function generateDocumentation(data: LabsPayload, type: "architecture" | "onboarding" | "review") {
  const header = `# ${data.project.name}\n\nGenerated from repository evidence on ${new Date(data.documentation.generatedAt).toLocaleString()}.\n`;
  if (type === "architecture") {
    return `${header}\n## Architecture Summary\n\n- Commit: \`${data.project.commitSha}\`\n- Source: ${data.project.source}\n- Languages: ${data.project.languages.join(", ") || "Unknown"}\n- Indexed files: ${data.documentation.files}\n- Symbols: ${data.documentation.symbols}\n- Relationships: ${data.documentation.relationships}\n\n## Entry Points\n\n${list(data.documentation.entryPoints)}\n\n## Modules\n\n${list(data.documentation.modules)}\n\n## Architecture Policies\n\n${data.architecturePolicies.map((policy) => `- **${policy.status.toUpperCase()}** ${policy.title}: ${policy.detail}`).join("\n")}\n`;
  }
  if (type === "onboarding") {
    return `${header}\n## Contributor Onboarding\n\n${data.onboarding.map((step, index) => `${index + 1}. **${step.title}**\n   - File: \`${step.filePath}\`\n   - ${step.detail}`).join("\n")}\n\n## High-Impact Files\n\n${data.hotspots.slice(0, 8).map((hotspot) => `- \`${hotspot.filePath}\`: ${hotspot.risk} risk, ${hotspot.relationships} graph links`).join("\n")}\n`;
  }
  return `${header}\n## Review Council\n\n${data.reviewCouncil.map((agent) => `### ${agent.name}: ${agent.verdict.toUpperCase()}\n\n${agent.summary}\n\n${agent.findings.length ? agent.findings.map((finding) => `- ${finding.title}: ${finding.detail}${finding.filePath ? ` (\`${finding.filePath}:${finding.line ?? 1}\`)` : ""}`).join("\n") : "- No blocking evidence."}`).join("\n\n")}\n`;
}

function list(items: string[]) {
  return items.length ? items.map((item) => `- \`${item}\``).join("\n") : "- None detected";
}
