import { useState, type CSSProperties, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  CircleGauge,
  FileCode2,
  Github,
  Network,
  Search,
  ShieldCheck,
  Star,
  TestTube2
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

type Tab = "overview" | "search" | "tests" | "activity" | "integrations";
const tabs: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "Health", icon: CircleGauge },
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

function Integration({ icon: Icon, title, status, detail, tone }: { icon: typeof Activity; title: string; status: string; detail: string; tone: string }) {
  return <div className={`surface-panel cm-accent-card ${tone} p-4`}><div className="flex items-center justify-between"><Icon className="cm-icon-motion h-5 w-5" /><span className="text-xs font-semibold text-mint">{status}</span></div><h2 className="mt-5 font-semibold text-white">{title}</h2><p className="mt-2 break-words text-sm leading-6 text-steel">{detail}</p></div>;
}

function scoreTone(score: number) {
  return score >= 80 ? "is-good" : score >= 55 ? "is-warning" : "is-critical";
}

function formatAction(action: string) {
  return action.split(".").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
