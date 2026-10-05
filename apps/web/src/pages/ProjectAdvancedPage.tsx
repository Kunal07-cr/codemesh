import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Bot,
  Boxes,
  Braces,
  CheckCircle2,
  CircleAlert,
  FileCode2,
  GitMerge,
  GitPullRequest,
  Network,
  Play,
  RefreshCw,
  Route,
  Save,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Workflow
} from "lucide-react";
import { LoadingState } from "../components/LoadingState";
import { api, jsonBody } from "../lib/api";

type Risk = "low" | "medium" | "high";
type AdvancedTab = "autonomy" | "merge" | "runtime" | "security" | "evals" | "decisions";

type ChangeRun = {
  id: string;
  objective: string;
  status: "pass" | "attention" | "blocked";
  createdAt: string;
  plan: {
    risk: Risk;
    targetFiles: string[];
    verificationCommands: string[];
    constraints: string[];
    steps: Array<{ id: string; title: string; detail: string; filePaths: string[]; evidence: string; verification: string }>;
  };
  sandbox: {
    executionMode: "static-isolated";
    status: "pass" | "attention" | "blocked";
    checks: Array<{ id: string; label: string; status: "pass" | "attention" | "blocked"; detail: string; evidenceFiles: string[] }>;
    queuedCommands: string[];
    executedCommands: string[];
    repairAttempts: Array<{ attempt: number; action: string; outcome: "complete" | "needs-review"; detail: string }>;
    recommendedRepairs: string[];
    disclaimer: string;
  };
};

type AdvancedPayload = {
  project: { id: string; name: string; commitSha: string };
  runs: ChangeRun[];
  semanticMerge: null | { filePath: string; risk: Risk; graphRelationships: number; recommendation: string; regions: Array<{ id: string; label: string; kind: string; startLine: number; endLine: number; strategy: string }> };
  pullRequestRisk: { score: number; status: "pass" | "review" | "block"; changedFiles: string[]; checks: Array<{ id: string; label: string; status: "pass" | "review" | "block"; detail: string }> };
  runtime: { traces: RuntimeTrace[]; active: RuntimeTrace & { preview?: boolean } };
  portfolio: { nodes: Array<{ id: string; name: string; files: number; symbols: number; languages: string[]; tags: string[] }>; connections: Array<{ source: string; target: string; reasons: string[] }> };
  security: { score: number; secrets: Array<{ id: string; severity: "warning" | "critical"; filePath: string; line: number; title: string; remediation: string }>; dangerousApis: Array<{ id: string; filePath: string; line: number; api: string; remediation: string }>; sbom: Array<{ name: string; version: string; ecosystem: "npm" | "python"; manifest: string; purl: string }> };
  aiEvaluation: { requests: number; groundedRetrievalRate: number; graphRetrievalRate: number; workspaceContextRate: number; averageLatencyMs: number; modelBreakdown: Array<{ model: string; requests: number }>; benchmarkCases: Array<{ id: string; question: string; expectedFile: string; expectedSymbol?: string }>; note: string };
  decisionDraft: DecisionDraft;
  decisions: Array<DecisionDraft & { id: string; status: "proposed" | "accepted" | "superseded"; createdAt: string }>;
  files: string[];
};

type RuntimeTrace = { id: string; name: string; source: string; createdAt: string; spans: Array<{ id: string; parentId?: string; name: string; durationMs: number; status?: "ok" | "error"; filePath?: string; nodeId?: string; mappedFilePath?: string; confidence: number }> };
type DecisionDraft = { title: string; context: string; decision: string; consequences: string; evidenceFiles: string[] };

const tabs: Array<{ id: AdvancedTab; label: string; icon: typeof Sparkles; tone: string }> = [
  { id: "autonomy", label: "Autonomy", icon: Sparkles, tone: "cm-tone-violet" },
  { id: "merge", label: "Merge & Risk", icon: GitMerge, tone: "cm-tone-coral" },
  { id: "runtime", label: "Runtime", icon: Activity, tone: "cm-tone-cyan" },
  { id: "security", label: "Security", icon: ShieldCheck, tone: "cm-tone-amber" },
  { id: "evals", label: "AI Evals", icon: TestTube2, tone: "cm-tone-mint" },
  { id: "decisions", label: "Decisions", icon: Braces, tone: "cm-tone-rose" }
];

const sampleTrace = JSON.stringify({
  name: "Login request",
  source: "opentelemetry",
  spans: [
    { id: "span-1", name: "createApp", durationMs: 42, status: "ok", filePath: "src/server.ts" },
    { id: "span-2", parentId: "span-1", name: "registerAuthRoutes", durationMs: 19, status: "ok", filePath: "src/auth/routes.ts" },
    { id: "span-3", parentId: "span-2", name: "verifyPassword", durationMs: 11, status: "ok", filePath: "src/auth/users.ts" }
  ]
}, null, 2);

export function ProjectAdvancedPage() {
  const { projectId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const requestedTab = searchParams.get("view") as AdvancedTab | null;
  const tab = tabs.some((item) => item.id === requestedTab) ? requestedTab! : "autonomy";
  const [mergeFile, setMergeFile] = useState("");
  const advanced = useQuery({
    queryKey: ["advanced-operations", projectId, mergeFile],
    queryFn: () => api<AdvancedPayload>(`/api/projects/${projectId}/advanced?mergeFile=${encodeURIComponent(mergeFile)}`)
  });
  const data = advanced.data;

  function selectTab(nextTab: AdvancedTab) {
    const next = new URLSearchParams(searchParams);
    if (nextTab === "autonomy") next.delete("view"); else next.set("view", nextTab);
    setSearchParams(next, { replace: true });
  }

  if (advanced.isLoading) return <LoadingState label="Loading advanced operations" />;
  if (!data) return <div className="mx-auto max-w-7xl px-4 py-8 text-coral">Advanced Operations could not be loaded. Sign in with project access and retry.</div>;

  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div><Link className="inline-flex items-center gap-1 text-xs text-steel hover:text-white" to={`/projects/${projectId}`}><ArrowLeft className="h-3.5 w-3.5" /> Project</Link></div>
          <div className="eyebrow mt-4"><Workflow className="h-3.5 w-3.5" /> Advanced operations</div>
          <h1 className="mt-2 text-3xl font-bold text-white">Evidence before automation</h1>
          <p className="mt-2 max-w-3xl leading-7 text-steel">Plan changes, validate them in a non-executing sandbox, trace runtime behavior, gate pull requests, evaluate AI retrieval, and preserve architecture decisions.</p>
        </div>
        <div className="flex gap-2"><Link className="action-secondary" to={`/projects/${projectId}/labs`}><Boxes className="h-4 w-4" /> Labs</Link><Link className="action-primary" to={`/projects/${projectId}/assistant`}><Bot className="h-4 w-4" /> Assistant</Link></div>
      </div>

      <div className="cm-stagger mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="PR risk gate" value={`${data.pullRequestRisk.score}/100`} tone={data.pullRequestRisk.status === "block" ? "cm-tone-coral" : "cm-tone-cyan"} />
        <Summary label="Security score" value={`${data.security.score}/100`} tone="cm-tone-amber" />
        <Summary label="Grounded retrieval" value={`${data.aiEvaluation.groundedRetrievalRate}%`} tone="cm-tone-mint" />
        <Summary label="Connected repositories" value={String(data.portfolio.nodes.length)} tone="cm-tone-violet" />
      </div>

      <div className="cm-scrollbar mt-6 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Advanced operation workbenches">
        {tabs.map((item) => { const Icon = item.icon; return <button key={item.id} className={`${item.tone} flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm ${tab === item.id ? "cm-tone-border text-white" : "border-transparent text-steel hover:text-white"}`} type="button" role="tab" aria-selected={tab === item.id} onClick={() => selectTab(item.id)}><Icon className="cm-tone-text h-4 w-4" />{item.label}</button>; })}
      </div>

      {tab === "autonomy" && <AutonomyView data={data} projectId={projectId} refresh={() => queryClient.invalidateQueries({ queryKey: ["advanced-operations", projectId] })} />}
      {tab === "merge" && <MergeView data={data} projectId={projectId} mergeFile={mergeFile} setMergeFile={setMergeFile} />}
      {tab === "runtime" && <RuntimeView data={data} projectId={projectId} refresh={() => queryClient.invalidateQueries({ queryKey: ["advanced-operations", projectId] })} />}
      {tab === "security" && <SecurityView data={data} projectId={projectId} />}
      {tab === "evals" && <EvaluationView data={data} projectId={projectId} />}
      {tab === "decisions" && <DecisionView data={data} projectId={projectId} refresh={() => queryClient.invalidateQueries({ queryKey: ["advanced-operations", projectId] })} />}
    </section>
  );
}

function AutonomyView({ data, projectId, refresh }: { data: AdvancedPayload; projectId: string; refresh(): Promise<unknown> }) {
  const [objective, setObjective] = useState("Add structured authorization errors without changing public API behavior.");
  const run = useMutation({
    mutationFn: () => api<ChangeRun>(`/api/projects/${projectId}/advanced/runs`, { method: "POST", body: jsonBody({ objective }) }),
    onSuccess: () => void refresh()
  });
  const result = run.data ?? data.runs[0];
  return (
    <div className="mt-6 space-y-8">
      <section>
        <div className="eyebrow"><Sparkles className="h-3.5 w-3.5" /> Agentic change planner</div>
        <form className="mt-3 flex flex-col gap-2 md:flex-row" onSubmit={(event) => { event.preventDefault(); if (objective.trim().length >= 8) run.mutate(); }}><input className="field" value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Describe the repository change" maxLength={1000} /><button className="action-primary shrink-0" type="submit" disabled={run.isPending || objective.trim().length < 8}>{run.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Plan and inspect</button></form>
        <p className="mt-2 text-xs text-steel">This workflow analyzes an isolated repository representation. It queues trusted verification commands but never executes imported scripts automatically.</p>
        {run.error instanceof Error && <ErrorBanner message={run.error.message} />}
      </section>
      {!result && <Empty text="Run a change objective to generate a file-level plan and repair loop." />}
      {result && <div className="grid gap-7 xl:grid-cols-2">
        <section><div className="flex items-center justify-between gap-3"><div><div className="eyebrow"><Workflow className="h-3.5 w-3.5" /> Change plan</div><h2 className="mt-2 text-xl font-semibold text-white">{result.objective}</h2></div><RiskPill risk={result.plan.risk} /></div><div className="mt-4 divide-y divide-line border-y border-line">{result.plan.steps.map((step, index) => <div key={step.id} className="py-4"><div className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded border border-violet/40 font-mono text-xs text-violet">{index + 1}</span><div><h3 className="font-semibold text-white">{step.title}</h3><p className="mt-1 text-sm leading-6 text-steel">{step.detail}</p><p className="mt-2 text-xs text-cyan">{step.evidence}</p><div className="mt-2 flex flex-wrap gap-2">{step.filePaths.map((path) => <Link key={path} className="font-mono text-[11px] text-mint hover:underline" to={`/projects/${projectId}/workspace?path=${encodeURIComponent(path)}`}>{path}</Link>)}</div></div></div></div>)}</div>{result.plan.targetFiles[0] && <Link className="action-primary mt-4 inline-flex" to={`/projects/${projectId}/assistant?path=${encodeURIComponent(result.plan.targetFiles[0])}&prompt=${encodeURIComponent(`Implement this reviewed objective with the smallest safe patch: ${result.objective}`)}`}><Bot className="h-4 w-4" /> Draft reviewed patch</Link>}</section>
        <section><div className="flex items-center justify-between"><div className="eyebrow"><ShieldCheck className="h-3.5 w-3.5" /> Isolated verification sandbox</div><StatusPill status={result.sandbox.status} /></div><div className="mt-4 divide-y divide-line border-y border-line">{result.sandbox.checks.map((check) => <div key={check.id} className="py-3"><div className="flex items-center gap-2"><StatusIcon status={check.status} /><span className="text-sm font-semibold text-white">{check.label}</span></div><p className="mt-1 text-sm leading-6 text-steel">{check.detail}</p></div>)}</div><h3 className="mt-5 font-semibold text-white">Automatic repair loop</h3><div className="mt-2 space-y-3">{result.sandbox.repairAttempts.map((attempt) => <div key={attempt.attempt} className="border-l-2 border-violet pl-3"><div className="font-mono text-xs text-violet">Attempt {attempt.attempt} · {attempt.outcome}</div><div className="mt-1 text-sm text-white">{attempt.action}</div><p className="mt-1 text-xs leading-5 text-steel">{attempt.detail}</p></div>)}</div><p className="mt-4 border border-amber/30 bg-amber/5 p-3 text-xs leading-5 text-amber">{result.sandbox.disclaimer}</p></section>
      </div>}
    </div>
  );
}

function MergeView({ data, projectId, mergeFile, setMergeFile }: { data: AdvancedPayload; projectId: string; mergeFile: string; setMergeFile(value: string): void }) {
  const merge = data.semanticMerge;
  return <div className="mt-6 grid gap-7 xl:grid-cols-2"><section><div className="eyebrow"><GitMerge className="h-3.5 w-3.5" /> Semantic merge assistant</div><label className="mt-3 block text-xs text-steel">Repository file<select className="field mt-1" value={mergeFile || merge?.filePath || ""} onChange={(event) => setMergeFile(event.target.value)}>{data.files.map((path) => <option key={path} value={path}>{path}</option>)}</select></label>{merge && <><div className="mt-4 flex items-center justify-between"><div><h2 className="font-mono text-sm text-white">{merge.filePath}</h2><p className="mt-1 text-sm text-steel">{merge.graphRelationships} graph relationships</p></div><RiskPill risk={merge.risk} /></div><p className="mt-3 border-l-2 border-violet pl-3 text-sm leading-6 text-steel">{merge.recommendation}</p><div className="mt-4 divide-y divide-line border-y border-line">{merge.regions.map((region) => <Link key={region.id} className="block py-3" to={`/projects/${projectId}/workspace?path=${encodeURIComponent(merge.filePath)}&line=${region.startLine}`}><div className="flex items-center justify-between gap-3"><span className="font-mono text-sm text-white">{region.label}</span><span className="text-xs text-violet">L{region.startLine}-{region.endLine}</span></div><p className="mt-1 text-xs leading-5 text-steel">{region.strategy}</p></Link>)}</div></>}</section><section><div className="flex items-center justify-between"><div><div className="eyebrow"><GitPullRequest className="h-3.5 w-3.5" /> Pull-request risk gate</div><h2 className="mt-2 text-xl font-semibold text-white">Workspace delta</h2></div><div className={`font-mono text-2xl font-bold ${data.pullRequestRisk.status === "block" ? "text-coral" : data.pullRequestRisk.status === "review" ? "text-amber" : "text-mint"}`}>{data.pullRequestRisk.score}</div></div><div className="mt-4 divide-y divide-line border-y border-line">{data.pullRequestRisk.checks.map((check) => <div key={check.id} className="py-4"><div className="flex items-center gap-2"><StatusIcon status={check.status} /><span className="text-sm font-semibold text-white">{check.label}</span><span className="ml-auto font-mono text-[10px] uppercase text-steel">{check.status}</span></div><p className="mt-1 text-sm leading-6 text-steel">{check.detail}</p></div>)}</div>{data.pullRequestRisk.changedFiles.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{data.pullRequestRisk.changedFiles.map((path) => <Link key={path} className="font-mono text-xs text-mint" to={`/projects/${projectId}/workspace?path=${encodeURIComponent(path)}`}>{path}</Link>)}</div>}</section></div>;
}

function RuntimeView({ data, projectId, refresh }: { data: AdvancedPayload; projectId: string; refresh(): Promise<unknown> }) {
  const [traceText, setTraceText] = useState(sampleTrace);
  const ingest = useMutation({ mutationFn: () => api(`/api/projects/${projectId}/advanced/traces`, { method: "POST", body: jsonBody(JSON.parse(traceText)) }), onSuccess: () => void refresh() });
  const trace = data.runtime.active;
  return <div className="mt-6 grid gap-7 xl:grid-cols-2"><section><div className="eyebrow"><Route className="h-3.5 w-3.5" /> Runtime trace overlay</div><div className="mt-3 flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold text-white">{trace.name}</h2><p className="mt-1 text-xs text-steel">{trace.preview ? "Graph-derived preview; import spans for observed runtime evidence." : `${trace.source} · ${new Date(trace.createdAt).toLocaleString()}`}</p></div><span className="font-mono text-xs text-cyan">{trace.spans.length} spans</span></div><div className="mt-4 space-y-2">{trace.spans.map((span) => <div key={span.id} className="surface-panel cm-accent-card cm-tone-cyan flex items-center gap-3 p-3"><div className={`h-2 w-2 shrink-0 rounded-full ${span.status === "error" ? "bg-coral" : "bg-mint"}`} /><div className="min-w-0 flex-1"><div className="truncate text-sm text-white">{span.name}</div><div className="truncate font-mono text-[10px] text-steel">{span.mappedFilePath ?? span.filePath ?? "unmapped"}</div></div><div className="text-right"><div className="font-mono text-xs text-cyan">{span.durationMs} ms</div><div className="text-[10px] text-steel">{Math.round(span.confidence * 100)}% mapped</div></div></div>)}</div><h3 className="mt-6 font-semibold text-white">Import OTLP-compatible spans</h3><textarea className="field cm-scrollbar mt-2 min-h-56 font-mono text-xs leading-5" value={traceText} onChange={(event) => setTraceText(event.target.value)} /><button className="action-primary mt-2" type="button" disabled={ingest.isPending} onClick={() => { try { JSON.parse(traceText); ingest.mutate(); } catch { /* error is shown below */ } }}><Network className="h-4 w-4" /> Ingest trace</button>{ingest.error instanceof Error && <ErrorBanner message={ingest.error.message} />}</section><section><div className="eyebrow"><Network className="h-3.5 w-3.5" /> Multi-repository graph</div><h2 className="mt-2 text-xl font-semibold text-white">Engineering portfolio</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{data.portfolio.nodes.map((node) => <Link key={node.id} className="surface-panel cm-accent-card cm-tone-violet p-4" to={`/projects/${node.id}`}><h3 className="font-semibold text-white">{node.name}</h3><p className="mt-2 font-mono text-xs text-steel">{node.files} files · {node.symbols} symbols</p><div className="mt-3 flex flex-wrap gap-1">{node.languages.slice(0, 4).map((language) => <span key={language} className="rounded bg-ink px-2 py-1 text-[10px] text-violet">{language}</span>)}</div></Link>)}</div><h3 className="mt-6 font-semibold text-white">Detected connections</h3><div className="mt-2 divide-y divide-line border-y border-line">{data.portfolio.connections.map((connection) => { const source = data.portfolio.nodes.find((node) => node.id === connection.source); const target = data.portfolio.nodes.find((node) => node.id === connection.target); return <div key={`${connection.source}:${connection.target}`} className="py-3"><div className="text-sm text-white">{source?.name} <span className="text-violet">→</span> {target?.name}</div><p className="mt-1 text-xs text-steel">{connection.reasons.join(", ")}</p></div>; })}{data.portfolio.connections.length === 0 && <div className="py-8 text-sm text-steel">Import another repository with shared tags or languages to reveal portfolio connections.</div>}</div></section></div>;
}

function SecurityView({ data, projectId }: { data: AdvancedPayload; projectId: string }) {
  return <div className="mt-6 space-y-8"><section><div className="flex items-end justify-between"><div><div className="eyebrow"><ShieldCheck className="h-3.5 w-3.5" /> Security workbench</div><h2 className="mt-2 text-xl font-semibold text-white">Secrets, unsafe APIs, and SBOM</h2></div><div className={`font-mono text-3xl font-bold ${data.security.score >= 80 ? "text-mint" : data.security.score >= 50 ? "text-amber" : "text-coral"}`}>{data.security.score}</div></div><div className="mt-5 grid gap-6 lg:grid-cols-2"><div><h3 className="font-semibold text-white">Source findings</h3><div className="mt-2 divide-y divide-line border-y border-line">{[...data.security.secrets.map((finding) => ({ ...finding, detail: finding.remediation })), ...data.security.dangerousApis.map((finding) => ({ ...finding, title: `Review ${finding.api}`, severity: "warning" as const, detail: finding.remediation }))].map((finding) => <Link key={finding.id} className="block py-3" to={`/projects/${projectId}/workspace?path=${encodeURIComponent(finding.filePath)}&line=${finding.line}`}><div className="flex items-center gap-2"><CircleAlert className={`h-4 w-4 ${finding.severity === "critical" ? "text-coral" : "text-amber"}`} /><span className="text-sm text-white">{finding.title}</span><span className="ml-auto font-mono text-[10px] text-steel">{finding.filePath}:{finding.line}</span></div><p className="mt-1 text-xs leading-5 text-steel">{finding.detail}</p></Link>)}{data.security.secrets.length + data.security.dangerousApis.length === 0 && <div className="py-8 text-sm text-mint">No local secret or unsafe-API pattern was detected.</div>}</div></div><div><h3 className="font-semibold text-white">Software bill of materials</h3><div className="cm-scrollbar mt-2 max-h-[30rem] overflow-auto border-y border-line">{data.security.sbom.map((component) => <div key={`${component.manifest}:${component.name}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-line py-3 last:border-0"><div className="min-w-0"><div className="truncate font-mono text-sm text-white">{component.name}</div><div className="truncate font-mono text-[10px] text-steel">{component.purl}</div></div><div className="text-right"><div className="font-mono text-xs text-amber">{component.version}</div><div className="text-[10px] uppercase text-steel">{component.ecosystem}</div></div></div>)}</div></div></div></section></div>;
}

function EvaluationView({ data, projectId }: { data: AdvancedPayload; projectId: string }) {
  const metrics = data.aiEvaluation;
  return <div className="mt-6 grid gap-7 xl:grid-cols-[0.8fr_1.2fr]"><section><div className="eyebrow"><TestTube2 className="h-3.5 w-3.5" /> AI evaluation center</div><h2 className="mt-2 text-xl font-semibold text-white">Recorded retrieval behavior</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><Mini label="Requests" value={metrics.requests} /><Mini label="Grounded" value={`${metrics.groundedRetrievalRate}%`} /><Mini label="Graph mode" value={`${metrics.graphRetrievalRate}%`} /><Mini label="Average latency" value={`${metrics.averageLatencyMs} ms`} /></div><p className="mt-4 border-l-2 border-mint pl-3 text-sm leading-6 text-steel">{metrics.note}</p><h3 className="mt-6 font-semibold text-white">Models</h3><div className="mt-2 divide-y divide-line border-y border-line">{metrics.modelBreakdown.map((model) => <div key={model.model} className="flex items-center justify-between gap-3 py-3"><span className="truncate font-mono text-xs text-white">{model.model}</span><span className="font-mono text-xs text-mint">{model.requests}</span></div>)}{metrics.modelBreakdown.length === 0 && <div className="py-6 text-sm text-steel">Ask the repository assistant to start collecting evaluation evidence.</div>}</div></section><section><div className="eyebrow"><Bot className="h-3.5 w-3.5" /> Repository benchmark</div><h2 className="mt-2 text-xl font-semibold text-white">Ground-truth cases</h2><div className="mt-4 divide-y divide-line border-y border-line">{metrics.benchmarkCases.map((testCase) => <div key={testCase.id} className="py-4"><div className="text-sm text-white">{testCase.question}</div><div className="mt-2 flex flex-wrap items-center gap-2"><Link className="font-mono text-xs text-mint" to={`/projects/${projectId}/workspace?path=${encodeURIComponent(testCase.expectedFile)}`}>{testCase.expectedFile}</Link>{testCase.expectedSymbol && <span className="rounded border border-line px-2 py-1 font-mono text-[10px] text-violet">{testCase.expectedSymbol}</span>}<Link className="action-secondary ml-auto" to={`/projects/${projectId}/assistant?path=${encodeURIComponent(testCase.expectedFile)}&prompt=${encodeURIComponent(testCase.question)}`}><Play className="h-3.5 w-3.5" /> Run case</Link></div></div>)}</div></section></div>;
}

function DecisionView({ data, projectId, refresh }: { data: AdvancedPayload; projectId: string; refresh(): Promise<unknown> }) {
  const [form, setForm] = useState({ ...data.decisionDraft, status: "proposed" as "proposed" | "accepted" | "superseded" });
  useEffect(() => { setForm((current) => current.title ? current : { ...data.decisionDraft, status: "proposed" }); }, [data.decisionDraft]);
  const save = useMutation({ mutationFn: () => api(`/api/projects/${projectId}/advanced/decisions`, { method: "POST", body: jsonBody(form) }), onSuccess: () => void refresh() });
  return <div className="mt-6 grid gap-7 xl:grid-cols-2"><section><div className="eyebrow"><Braces className="h-3.5 w-3.5" /> Architecture decision records</div><h2 className="mt-2 text-xl font-semibold text-white">Record a decision</h2><form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}><label className="block text-xs text-steel">Title<input className="field mt-1" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="block text-xs text-steel">Status<select className="field mt-1" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as typeof form.status })}><option value="proposed">Proposed</option><option value="accepted">Accepted</option><option value="superseded">Superseded</option></select></label><TextField label="Context" value={form.context} onChange={(context) => setForm({ ...form, context })} /><TextField label="Decision" value={form.decision} onChange={(decision) => setForm({ ...form, decision })} /><TextField label="Consequences" value={form.consequences} onChange={(consequences) => setForm({ ...form, consequences })} /><div className="flex flex-wrap gap-2">{form.evidenceFiles.map((path) => <span key={path} className="rounded border border-line px-2 py-1 font-mono text-[10px] text-mint">{path}</span>)}</div><button className="action-primary" type="submit" disabled={save.isPending}><Save className="h-4 w-4" /> Save ADR</button>{save.error instanceof Error && <ErrorBanner message={save.error.message} />}</form></section><section><div className="eyebrow"><FileCode2 className="h-3.5 w-3.5" /> Decision history</div><div className="mt-4 divide-y divide-line border-y border-line">{data.decisions.map((decision) => <article key={decision.id} className="py-4"><div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-white">{decision.title}</h3><span className="font-mono text-[10px] uppercase text-violet">{decision.status}</span></div><p className="mt-2 text-sm leading-6 text-steel">{decision.decision}</p><div className="mt-2 flex flex-wrap gap-2">{decision.evidenceFiles.map((path) => <Link key={path} className="font-mono text-[10px] text-mint" to={`/projects/${projectId}/workspace?path=${encodeURIComponent(path)}`}>{path}</Link>)}</div><div className="mt-2 text-[10px] text-steel">{new Date(decision.createdAt).toLocaleString()}</div></article>)}{data.decisions.length === 0 && <div className="py-8 text-sm text-steel">No ADR has been recorded yet. The generated draft is based on the current repository graph.</div>}</div></section></div>;
}

function Summary({ label, value, tone }: { label: string; value: string; tone: string }) { return <div className={`surface-panel cm-accent-card ${tone} p-4`} data-reveal><div className="text-xs uppercase text-steel">{label}</div><div className="mt-2 text-2xl font-bold text-white">{value}</div></div>; }
function Mini({ label, value }: { label: string; value: string | number }) { return <div className="border-l border-line py-1 pl-3"><div className="text-xs uppercase text-steel">{label}</div><div className="mt-1 text-xl font-bold text-white">{value}</div></div>; }
function RiskPill({ risk }: { risk: Risk }) { return <span className={`rounded border px-2 py-1 font-mono text-[10px] uppercase ${risk === "high" ? "border-coral/40 bg-coral/10 text-coral" : risk === "medium" ? "border-amber/40 bg-amber/10 text-amber" : "border-mint/40 bg-mint/10 text-mint"}`}>{risk}</span>; }
function StatusPill({ status }: { status: string }) { return <span className={`rounded border px-2 py-1 font-mono text-[10px] uppercase ${status === "pass" || status === "complete" ? "border-mint/40 text-mint" : status === "blocked" || status === "block" ? "border-coral/40 text-coral" : "border-amber/40 text-amber"}`}>{status}</span>; }
function StatusIcon({ status }: { status: string }) { return status === "pass" || status === "complete" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-mint" /> : <CircleAlert className={`h-4 w-4 shrink-0 ${status === "blocked" || status === "block" ? "text-coral" : "text-amber"}`} />; }
function ErrorBanner({ message }: { message: string }) { return <div className="mt-3 border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{message}</div>; }
function Empty({ text }: { text: string }) { return <div className="border-y border-line py-12 text-center text-sm text-steel">{text}</div>; }
function TextField({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) { return <label className="block text-xs text-steel">{label}<textarea className="field mt-1 min-h-24 resize-y text-sm leading-6" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
