import { useState, type CSSProperties, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Braces,
  CheckCircle2,
  CircleGauge,
  Clock3,
  FileCode2,
  Fingerprint,
  Gauge,
  Github,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  TestTube2,
  Zap
} from "lucide-react";
import type { SourceRange } from "@codemesh/shared";
import { LoadingState } from "../components/LoadingState";
import { api } from "../lib/api";
import { relativeTime } from "../lib/format";

type IntelligencePayload = {
  health: {
    score: number;
    files: number;
    sourceLines: number;
    symbols: number;
    relationships: number;
    testFiles: number;
    coverageEstimate: number;
    issues: Array<{
      id: string;
      severity: "info" | "warning" | "critical";
      category: "maintainability" | "security" | "testing" | "structure";
      title: string;
      detail: string;
      filePath?: string;
      line?: number;
    }>;
    suggestedTests: string[];
  };
  context: {
    summary: {
      questions: number;
      repositoryTokens: number;
      deliveredTokens: number;
      estimatedBaselineTokens: number;
      avoidedTokens: number;
      reductionPercentage: number | null;
      averageRetrievalLatencyMs: number;
      averageGenerationLatencyMs: number;
    };
    freshness: {
      status: "synced" | "workspace-ahead";
      manifest: string;
      commitSha: string;
      indexedAt: string;
      changedFiles: number;
      changedPaths: string[];
    };
    traces: Array<{
      id: string;
      question: string;
      mode: "graph" | "hybrid" | "vector";
      sourceRevision: string;
      createdAt: string;
      baselineTokens: number;
      deliveredTokens: number;
      avoidedTokens: number;
      reductionPercentage: number;
      retrievalLatencyMs: number;
      generationLatencyMs: number;
      spans: Array<{ filePath: string; range: SourceRange; symbolName?: string; tokenCount: number }>;
    }>;
  };
  search: Array<{
    id: string;
    filePath: string;
    symbolName?: string;
    range: SourceRange;
    excerpt: string;
    score: number;
    reason: string;
  }>;
  activity: Array<{
    id: string;
    action: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
  integrations: {
    github: { connected: boolean; repositoryUrl?: string };
    realtime: { enabled: boolean; transport: string };
    ai: { retrieval: string; provider: string };
  };
};

type Tab = "overview" | "context" | "search" | "tests" | "activity" | "integrations";
const tabs: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "Health", icon: CircleGauge },
  { id: "context", label: "Context Observatory", icon: Gauge },
  { id: "search", label: "Semantic search", icon: Search },
  { id: "tests", label: "Test intelligence", icon: TestTube2 },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "integrations", label: "Integrations", icon: Network }
];

export function ProjectIntelligencePage() {
  const { projectId = "" } = useParams();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [savedSearches, setSavedSearches] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(`codemesh-searches:${projectId}`) ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const intelligence = useQuery({
    queryKey: ["intelligence", projectId, query],
    queryFn: () => api<IntelligencePayload>(`/api/projects/${projectId}/intelligence?query=${encodeURIComponent(query)}`)
  });

  if (intelligence.isLoading) return <LoadingState label="Analyzing repository intelligence" />;
  if (!intelligence.data) return <div className="mx-auto max-w-7xl px-4 py-8 text-coral">Repository intelligence could not be loaded.</div>;
  const data = intelligence.data;

  function submitSearch(event?: FormEvent) {
    event?.preventDefault();
    setQuery(draftQuery.trim());
    setActiveTab("search");
  }

  function saveSearch() {
    if (!query || savedSearches.includes(query)) return;
    const next = [query, ...savedSearches].slice(0, 8);
    setSavedSearches(next);
    localStorage.setItem(`codemesh-searches:${projectId}`, JSON.stringify(next));
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="inline-flex items-center gap-1 text-xs text-steel hover:text-white" to={`/projects/${projectId}`}><ArrowLeft className="h-3.5 w-3.5" /> Project</Link>
          <div className="eyebrow mt-4"><Bot className="h-3.5 w-3.5" /> Repository intelligence</div>
          <h1 className="mt-2 text-3xl font-bold text-white">Health, impact, and evidence</h1>
          <p className="mt-2 max-w-3xl text-steel">Static graph signals and grounded repository retrieval, kept separate from model speculation.</p>
        </div>
        <div className={`cm-score-ring ${scoreTone(data.health.score)}`} style={{ "--score": `${data.health.score * 3.6}deg` } as CSSProperties}>
          <strong>{data.health.score}</strong><span>health</span>
        </div>
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Repository intelligence views">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return <button key={tab.id} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm ${activeTab === tab.id ? "border-mint text-white" : "border-transparent text-steel hover:text-white"}`} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}><Icon className="h-4 w-4" />{tab.label}</button>;
        })}
      </div>

      {activeTab === "overview" && (
        <div className="cm-stagger mt-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Source files" value={data.health.files} tone="cm-tone-cyan" />
            <Metric label="Symbols" value={data.health.symbols} tone="cm-tone-violet" />
            <Metric label="Relationships" value={data.health.relationships} tone="cm-tone-coral" />
            <Metric label="Source lines" value={data.health.sourceLines} tone="cm-tone-amber" />
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_300px]">
            <div>
              <h2 className="font-semibold text-white">Review findings</h2>
              <div className="mt-3 divide-y divide-line border-y border-line">
                {data.health.issues.length === 0 && <div className="py-8 text-sm text-steel">No static review findings were detected.</div>}
                {data.health.issues.map((issue) => (
                  <div key={issue.id} className="flex gap-3 py-3" data-reveal>
                    <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${issue.severity === "critical" ? "text-coral" : issue.severity === "warning" ? "text-amber" : "text-cyan"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-white">{issue.title}</h3><span className="font-mono text-[10px] uppercase text-steel">{issue.category}</span></div>
                      <p className="mt-1 text-sm leading-6 text-steel">{issue.detail}</p>
                      {issue.filePath && <Link className="mt-1 inline-flex font-mono text-xs text-mint hover:underline" to={`/projects/${projectId}/workspace?path=${encodeURIComponent(issue.filePath)}&line=${issue.line ?? 1}`}>{issue.filePath}:{issue.line ?? 1}</Link>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <aside className="surface-panel cm-accent-card cm-tone-cyan self-start p-4">
              <ShieldCheck className="cm-icon-motion h-5 w-5" />
              <h2 className="mt-3 font-semibold text-white">Analysis boundary</h2>
              <p className="mt-2 text-sm leading-6 text-steel">Findings come from indexed source, graph relationships, and explicit static rules. They are review leads, not automatic proof of a defect.</p>
              <div className="mt-4 border-t border-line pt-3 text-xs text-steel">{data.health.testFiles} test files detected · {data.health.coverageEstimate}% structural estimate</div>
            </aside>
          </div>
        </div>
      )}

      {activeTab === "context" && <ContextObservatoryView context={data.context} projectId={projectId} />}

      {activeTab === "search" && (
        <div className="mt-6">
          <form className="flex gap-2" onSubmit={submitSearch}>
            <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel" /><input className="field pl-9" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder="Where is authentication validated?" /></label>
            <button className="action-primary" type="submit">Search graph</button>
            <button className="cm-icon-button h-auto" type="button" title="Save investigation" aria-label="Save investigation" disabled={!query} onClick={saveSearch}><Star className="h-4 w-4" /></button>
          </form>
          {savedSearches.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{savedSearches.map((saved) => <button key={saved} className="rounded border border-line px-2 py-1 text-xs text-steel hover:border-mint hover:text-white" type="button" onClick={() => { setDraftQuery(saved); setQuery(saved); }}>{saved}</button>)}</div>}
          <div className="mt-5 divide-y divide-line border-y border-line">
            {!query && <div className="py-10 text-center text-sm text-steel">Search by concept, behavior, dependency, or responsibility.</div>}
            {query && data.search.length === 0 && <div className="py-10 text-center text-sm text-steel">No grounded repository matches were found.</div>}
            {data.search.map((result) => (
              <article key={result.id} className="py-4" data-reveal>
                <div className="flex items-start justify-between gap-3"><div><h2 className="font-mono text-sm text-white">{result.symbolName ?? result.filePath}</h2><div className="mt-1 text-xs text-steel">{result.filePath}:{result.range.startLine}-{result.range.endLine}</div></div><span className="font-mono text-xs text-cyan">{result.score}% match</span></div>
                <pre className="cm-scrollbar mt-3 max-h-32 overflow-auto whitespace-pre-wrap border-l-2 border-cyan pl-3 font-mono text-xs leading-5 text-steel">{result.excerpt}</pre>
                <Link className="mt-3 inline-flex items-center gap-1 text-xs text-mint" to={`/projects/${projectId}/workspace?path=${encodeURIComponent(result.filePath)}&line=${result.range.startLine}`}><FileCode2 className="h-3.5 w-3.5" /> Open source range</Link>
              </article>
            ))}
          </div>
        </div>
      )}

      {activeTab === "tests" && (
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
          <div><h2 className="font-semibold text-white">Suggested verification</h2><div className="mt-3 divide-y divide-line border-y border-line">{data.health.suggestedTests.map((suggestion) => <div key={suggestion} className="flex gap-3 py-3 text-sm text-steel"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint" /><span>{suggestion}</span></div>)}</div></div>
          <aside className="surface-panel cm-accent-card cm-tone-violet self-start p-4"><TestTube2 className="cm-icon-motion h-5 w-5" /><h2 className="mt-3 font-semibold text-white">Coverage signal</h2><div className="mt-4 text-4xl font-bold text-white">{data.health.coverageEstimate}%</div><p className="mt-2 text-sm leading-6 text-steel">A structural estimate based on test-file presence. Connect CI coverage output for executable line coverage.</p></aside>
        </div>
      )}

      {activeTab === "activity" && (
        <div className="mt-6 divide-y divide-line border-y border-line">{data.activity.length === 0 ? <div className="py-10 text-center text-sm text-steel">Sign in as a project member to view its audit timeline.</div> : data.activity.map((event) => <div key={event.id} className="flex items-start gap-3 py-3"><Activity className="mt-0.5 h-4 w-4 text-cyan" /><div className="min-w-0 flex-1"><div className="text-sm text-white">{formatAction(event.action)}</div><div className="mt-1 truncate font-mono text-xs text-steel">{JSON.stringify(event.metadata)}</div></div><span className="shrink-0 text-xs text-steel">{relativeTime(event.createdAt)}</span></div>)}</div>
      )}

      {activeTab === "integrations" && (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Integration icon={Github} title="GitHub" status={data.integrations.github.connected ? "Connected" : "Available"} detail={data.integrations.github.repositoryUrl ?? "Import a public repository or configure the GitHub App for pull requests."} tone="cm-tone-coral" />
          <Integration icon={Network} title="Realtime collaboration" status="Active" detail={data.integrations.realtime.transport} tone="cm-tone-cyan" />
          <Integration icon={Bot} title="Grounded AI" status="Ready" detail={`${data.integrations.ai.retrieval} · ${data.integrations.ai.provider}`} tone="cm-tone-violet" />
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className={`surface-panel cm-accent-card ${tone} p-4`}><div className="text-xs uppercase text-steel">{label}</div><div className="mt-2 text-2xl font-bold text-white">{new Intl.NumberFormat().format(value)}</div></div>;
}

function ContextObservatoryView({ context, projectId }: { context: IntelligencePayload["context"]; projectId: string }) {
  const reduction = context.summary.reductionPercentage;
  const tools = ["graph_ontology", "code_answer", "code_context", "search_code", "fetch_code", "query_context"];
  return (
    <div className="cm-stagger mt-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ContextMetric icon={Zap} label="Context reduction" value={reduction === null ? "Learning" : `${reduction}%`} detail={`${context.summary.questions} measured question${context.summary.questions === 1 ? "" : "s"}`} tone="cm-tone-mint" />
        <ContextMetric icon={Gauge} label="Tokens avoided" value={formatNumber(context.summary.avoidedTokens)} detail={`${formatNumber(context.summary.deliveredTokens)} delivered`} tone="cm-tone-violet" />
        <ContextMetric icon={Clock3} label="Average lookup" value={`${context.summary.averageRetrievalLatencyMs} ms`} detail={`${context.summary.averageGenerationLatencyMs} ms generation`} tone="cm-tone-cyan" />
        <ContextMetric icon={RefreshCw} label="Graph freshness" value={context.freshness.status === "synced" ? "Synced" : "Workspace ahead"} detail={`${context.freshness.changedFiles} unindexed change${context.freshness.changedFiles === 1 ? "" : "s"}`} tone="cm-tone-amber" />
      </div>

      <section className="mt-6 border-y border-line">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="py-6 pr-0 lg:border-r lg:border-line lg:pr-8">
            <div className="eyebrow"><Gauge className="h-3.5 w-3.5" /> Measured context economy</div>
            <h2 className="mt-2 text-xl font-semibold text-white">What reached the model versus a repository-wide read</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-steel">The baseline is an explicit estimate from indexed repository tokens. Delivered context comes from recorded assistant retrievals, so the comparison remains inspectable instead of becoming a marketing claim.</p>
            <div className="mt-6 space-y-4">
              <TokenBar label="Estimated whole-repository baseline" value={context.summary.estimatedBaselineTokens} maximum={Math.max(1, context.summary.estimatedBaselineTokens)} tone="bg-coral" />
              <TokenBar label="Graph-selected context delivered" value={context.summary.deliveredTokens} maximum={Math.max(1, context.summary.estimatedBaselineTokens)} tone="bg-mint" />
            </div>
            {context.summary.questions === 0 && <div className="mt-5 border-l-2 border-cyan bg-cyan/5 px-4 py-3 text-sm text-steel">Ask the repository assistant a question to create the first measured context trace.</div>}
          </div>
          <div className="py-6 lg:pl-8">
            <div className="eyebrow"><Fingerprint className="h-3.5 w-3.5" /> Freshness receipt</div>
            <dl className="mt-4 divide-y divide-line border-y border-line text-sm">
              <ReceiptRow label="Manifest" value={context.freshness.manifest} mono />
              <ReceiptRow label="Revision" value={context.freshness.commitSha} mono />
              <ReceiptRow label="Indexed" value={relativeTime(context.freshness.indexedAt)} />
              <ReceiptRow label="Workspace drift" value={context.freshness.changedFiles ? `${context.freshness.changedFiles} file${context.freshness.changedFiles === 1 ? "" : "s"}` : "None detected"} />
            </dl>
            {context.freshness.changedPaths.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{context.freshness.changedPaths.slice(0, 8).map((path) => <Link className="border border-amber/30 px-2 py-1 font-mono text-[10px] text-amber hover:border-amber" key={path} to={`/projects/${projectId}/workspace?path=${encodeURIComponent(path)}`}>{path}</Link>)}</div>}
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><div className="eyebrow"><Braces className="h-3.5 w-3.5" /> Purpose-built MCP surface</div><h2 className="mt-2 text-xl font-semibold text-white">Six precise tools instead of one broad file reader</h2></div>
          <Link className="text-xs font-semibold text-mint hover:underline" to={`/projects/${projectId}/delivery`}>Manage agent access</Link>
        </div>
        <div className="mt-4 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 xl:grid-cols-3">
          {tools.map((tool, index) => <div className="bg-panel px-4 py-4" key={tool}><span className="font-mono text-[10px] text-steel">0{index + 1}</span><div className="mt-2 font-mono text-sm text-white">{tool}</div></div>)}
        </div>
      </section>

      <section className="mt-8">
        <div className="eyebrow"><Clock3 className="h-3.5 w-3.5" /> Retrieval ledger</div>
        <h2 className="mt-2 text-xl font-semibold text-white">Every answer leaves a source-span trace</h2>
        <div className="mt-4 divide-y divide-line border-y border-line">
          {context.traces.length === 0 && <div className="py-10 text-center text-sm text-steel">No retrieval traces recorded yet.</div>}
          {context.traces.slice(0, 20).map((trace) => (
            <article className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_15rem]" key={trace.id} data-reveal>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="border border-violet/30 bg-violet/5 px-2 py-1 font-mono text-[10px] uppercase text-violet">{trace.mode}</span><span className="text-xs text-steel">{relativeTime(trace.createdAt)}</span></div>
                <h3 className="mt-3 text-sm font-semibold leading-6 text-white">{trace.question}</h3>
                <div className="mt-3 flex flex-wrap gap-2">{trace.spans.slice(0, 6).map((span, index) => <Link className="inline-flex max-w-full items-center gap-1 border border-line px-2 py-1 font-mono text-[10px] text-cyan hover:border-cyan" key={`${span.filePath}-${span.range.startLine}-${index}`} to={`/projects/${projectId}/workspace?path=${encodeURIComponent(span.filePath)}&line=${span.range.startLine}`}><FileCode2 className="h-3 w-3 shrink-0" /><span className="truncate">{span.filePath}:{span.range.startLine}-{span.range.endLine}</span></Link>)}</div>
              </div>
              <dl className="grid grid-cols-2 gap-px self-start overflow-hidden border border-line bg-line text-xs">
                <TraceStat label="Reduction" value={`${trace.reductionPercentage}%`} />
                <TraceStat label="Lookup" value={`${trace.retrievalLatencyMs} ms`} />
                <TraceStat label="Delivered" value={formatNumber(trace.deliveredTokens)} />
                <TraceStat label="Avoided" value={formatNumber(trace.avoidedTokens)} />
              </dl>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ContextMetric({ icon: Icon, label, value, detail, tone }: { icon: typeof Activity; label: string; value: string; detail: string; tone: string }) {
  return <div className={`surface-panel cm-accent-card ${tone} p-4`}><div className="flex items-center justify-between"><Icon className="cm-icon-motion h-5 w-5" /><span className="text-[10px] uppercase text-steel">measured</span></div><div className="mt-4 text-xs uppercase text-steel">{label}</div><div className="mt-1 break-words text-2xl font-bold text-white">{value}</div><div className="mt-1 text-xs text-steel">{detail}</div></div>;
}

function TokenBar({ label, value, maximum, tone }: { label: string; value: number; maximum: number; tone: string }) {
  const width = value === 0 ? 0 : Math.max(2, Math.min(100, (value / maximum) * 100));
  return <div><div className="mb-2 flex items-center justify-between gap-4 text-xs"><span className="text-steel">{label}</span><strong className="font-mono text-white">{formatNumber(value)}</strong></div><div className="h-2 overflow-hidden bg-ink"><div className={`h-full transition-[width] duration-700 ${tone}`} style={{ width: `${width}%` }} /></div></div>;
}

function ReceiptRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="flex items-center justify-between gap-4 py-3"><dt className="text-steel">{label}</dt><dd className={`${mono ? "font-mono text-xs" : "text-sm"} max-w-[65%] truncate text-white`} title={value}>{value}</dd></div>;
}

function TraceStat({ label, value }: { label: string; value: string }) {
  return <div className="bg-panel p-3"><dt className="text-[10px] uppercase text-steel">{label}</dt><dd className="mt-1 font-mono text-sm text-white">{value}</dd></div>;
}

function Integration({ icon: Icon, title, status, detail, tone }: { icon: typeof Activity; title: string; status: string; detail: string; tone: string }) {
  return <div className={`surface-panel cm-accent-card ${tone} p-4`}><div className="flex items-center justify-between"><Icon className="cm-icon-motion h-5 w-5" /><span className="text-xs font-semibold text-mint">{status}</span></div><h2 className="mt-5 font-semibold text-white">{title}</h2><p className="mt-2 break-words text-sm leading-6 text-steel">{detail}</p></div>;
}

function scoreTone(score: number) {
  return score >= 80 ? "is-good" : score >= 55 ? "is-warning" : "is-critical";
}

function formatAction(action: string) {
  return action.split(".").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

