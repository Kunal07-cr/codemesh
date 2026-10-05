import { useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  Braces,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Code2,
  FileCode2,
  Fingerprint,
  Gauge,
  GitBranch,
  Github,
  KeyRound,
  Layers3,
  LockKeyhole,
  Network,
  Radio,
  Search,
  ServerCog,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  UsersRound,
  WandSparkles,
  Workflow
} from "lucide-react";

type QueryKey = "authorization" | "change" | "architecture";

const queries = {
  authorization: {
    label: "Trace authorization",
    prompt: "Where is project write access enforced?",
    conventional: ["Search for role names", "Open 14 matching files", "Follow route imports", "Inspect middleware", "Confirm the write path"],
    path: ["projects.ts", "authorize()", "permissions.ts", "updateProject()"],
    answer: "Project updates pass through authorize(), which resolves the member role and checks the project:update permission before the store mutation runs.",
    citations: ["apps/api/src/routes/projects.ts:118-136", "packages/shared/src/index.ts:84-111"],
    files: 14,
    standardTokens: 9180,
    meshTokens: 2140
  },
  change: {
    label: "Estimate change impact",
    prompt: "What breaks if the project role model changes?",
    conventional: ["Search role definitions", "Inspect API routes", "Inspect UI guards", "Find tests", "Build a dependency list"],
    path: ["ProjectRole", "authorize()", "AuthPanel", "registration.test.ts"],
    answer: "The role contract is shared by API guards, registration defaults, project controls, and tests. Change the shared union first, then validate route policy and UI capability checks.",
    citations: ["packages/shared/src/index.ts:41-52", "apps/api/src/routes/auth.ts:72-104"],
    files: 19,
    standardTokens: 12460,
    meshTokens: 2860
  },
  architecture: {
    label: "Explain architecture",
    prompt: "How does a repository become assistant context?",
    conventional: ["Find import handler", "Read indexing service", "Trace graph builder", "Open AI route", "Connect the response model"],
    path: ["GitHub / ZIP", "indexRepository()", "graph links", "retrieveContext()"],
    answer: "An import is normalized into source files, indexed into symbols and relationships, then hybrid retrieval selects text and graph neighbors for a source-cited assistant response.",
    citations: ["packages/code-intelligence/src/index.ts:205-286", "apps/api/src/routes/ai.ts:54-113"],
    files: 17,
    standardTokens: 10840,
    meshTokens: 2510
  }
} satisfies Record<QueryKey, {
  label: string;
  prompt: string;
  conventional: string[];
  path: string[];
  answer: string;
  citations: string[];
  files: number;
  standardTokens: number;
  meshTokens: number;
}>;

const surfaces = [
  { icon: Code2, name: "Monaco workspace", detail: "Edit indexed files" },
  { icon: Network, name: "Repository graph", detail: "Traverse relationships" },
  { icon: Bot, name: "AI assistant", detail: "Ask with citations" },
  { icon: Radio, name: "Realtime rooms", detail: "Presence and sync" },
  { icon: ServerCog, name: "REST surface", detail: "Automate workflows" }
];

const pipeline = [
  { icon: Github, label: "GitHub or ZIP", detail: "Source intake", tone: "cyan" },
  { icon: Braces, label: "AST index", detail: "Files and symbols", tone: "violet" },
  { icon: Network, label: "Code graph", detail: "Imports and calls", tone: "mint" },
  { icon: Search, label: "Hybrid retrieval", detail: "Text plus neighbors", tone: "amber" },
  { icon: Fingerprint, label: "Cited answer", detail: "Exact source ranges", tone: "rose" }
];

export function RetrievalStudio() {
  const [queryKey, setQueryKey] = useState<QueryKey>("authorization");
  const [running, setRunning] = useState(false);
  const query = queries[queryKey];
  const reduction = Math.round((1 - query.meshTokens / query.standardTokens) * 100);

  const selectQuery = (key: QueryKey) => {
    setQueryKey(key);
    setRunning(true);
    window.setTimeout(() => setRunning(false), 620);
  };

  return (
    <div className="cm-retrieval-studio" data-reveal>
      <div className="cm-query-switcher" role="tablist" aria-label="Repository questions">
        <span className="cm-query-switcher-label"><Sparkles className="h-4 w-4" /> Try a repository question</span>
        {(Object.keys(queries) as QueryKey[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={queryKey === key}
            className={queryKey === key ? "is-active" : ""}
            onClick={() => selectQuery(key)}
          >
            {queries[key].label}
          </button>
        ))}
      </div>

      <div className={`cm-retrieval-race ${running ? "is-running" : ""}`} aria-live="polite">
        <article className="cm-race-lane cm-race-standard">
          <div className="cm-race-heading">
            <div>
              <span className="cm-race-kicker"><Search className="h-3.5 w-3.5" /> Conventional crawl</span>
              <h3>Search, open, read, repeat</h3>
            </div>
            <span className="cm-race-badge">{query.files} files</span>
          </div>
          <ol className="cm-crawl-list">
            {query.conventional.map((step, index) => (
              <li key={step} style={{ "--step-index": index } as React.CSSProperties}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{step}</p>
                <ChevronRight className="h-3.5 w-3.5" />
              </li>
            ))}
          </ol>
          <RaceMeter label="Estimated context" value={query.standardTokens} max={query.standardTokens} tone="coral" />
        </article>

        <article className="cm-race-lane cm-race-mesh">
          <div className="cm-race-heading">
            <div>
              <span className="cm-race-kicker"><Network className="h-3.5 w-3.5" /> Mesh retrieval</span>
              <h3>Follow the relevant path</h3>
            </div>
            <span className="cm-race-badge is-efficient">-{reduction}%</span>
          </div>
          <div className="cm-path-trace">
            {query.path.map((step, index) => (
              <div key={step} className="cm-path-node" style={{ "--step-index": index } as React.CSSProperties}>
                <span><FileCode2 className="h-4 w-4" /></span>
                <p>{step}</p>
                {index < query.path.length - 1 && <i aria-hidden="true"><ArrowRight className="h-3.5 w-3.5" /></i>}
              </div>
            ))}
          </div>
          <RaceMeter label="Estimated context" value={query.meshTokens} max={query.standardTokens} tone="mint" />
        </article>
      </div>

      <div className="cm-answer-console">
        <div className="cm-console-bar">
          <div className="cm-console-lights" aria-hidden="true"><i /><i /><i /></div>
          <span><TerminalSquare className="h-3.5 w-3.5" /> grounded-answer.log</span>
          <span className="cm-console-status"><i /> Graph index ready</span>
        </div>
        <div className="cm-console-body">
          <div className="cm-console-prompt"><span>question</span><p>{query.prompt}</p></div>
          <div className="cm-console-answer">
            <Bot className="h-5 w-5" />
            <div><span>CodeMesh assistant</span><p>{query.answer}</p></div>
          </div>
          <div className="cm-console-citations">
            {query.citations.map((citation, index) => <span key={citation}>[{index + 1}] {citation}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function RaceMeter({ label, value, max, tone }: { label: string; value: number; max: number; tone: "coral" | "mint" }) {
  return (
    <div className="cm-race-meter">
      <div><span>{label}</span><strong>{value.toLocaleString()} tokens</strong></div>
      <div className="cm-race-track"><i data-tone={tone} style={{ width: `${Math.max(10, (value / max) * 100)}%` }} /></div>
    </div>
  );
}

export function EfficiencyCalculator() {
  const [questions, setQuestions] = useState(320);
  const [filesPerQuestion, setFilesPerQuestion] = useState(16);
  const estimate = useMemo(() => {
    const crawl = questions * (1180 + filesPerQuestion * 560);
    const mesh = questions * (1980 + filesPerQuestion * 62);
    const saved = Math.max(0, crawl - mesh);
    return { crawl, mesh, saved, percent: Math.round((saved / crawl) * 100) };
  }, [filesPerQuestion, questions]);

  return (
    <div className="cm-efficiency-lab" data-reveal>
      <div className="cm-efficiency-controls">
        <div className="cm-lab-label"><Gauge className="h-4 w-4" /> Workload simulator <span>Illustrative estimate</span></div>
        <label>
          <span><b>Repository questions / month</b><output>{questions}</output></span>
          <input type="range" min="40" max="1200" step="20" value={questions} onChange={(event) => setQuestions(Number(event.target.value))} />
        </label>
        <label>
          <span><b>Files inspected / question</b><output>{filesPerQuestion}</output></span>
          <input type="range" min="4" max="48" step="1" value={filesPerQuestion} onChange={(event) => setFilesPerQuestion(Number(event.target.value))} />
        </label>
        <p>Move the controls to model a team workload. Values compare broad file loading with focused graph retrieval; they are a transparent simulation, not a production guarantee.</p>
      </div>

      <div className="cm-efficiency-results">
        <div className="cm-efficiency-primary">
          <span>Estimated context reduction</span>
          <strong>{estimate.percent}%</strong>
          <p>{compact(estimate.saved)} fewer tokens across the modeled month</p>
        </div>
        <div className="cm-volume-chart" aria-label="Estimated token volume comparison">
          <VolumeBar label="Broad file crawl" value={estimate.crawl} max={estimate.crawl} tone="coral" />
          <VolumeBar label="Graph-focused context" value={estimate.mesh} max={estimate.crawl} tone="mint" />
        </div>
        <div className="cm-efficiency-foot">
          <span><Clock3 className="h-4 w-4" /> Less context assembly</span>
          <span><CircleDollarSign className="h-4 w-4" /> Lower model input volume</span>
          <span><Fingerprint className="h-4 w-4" /> Source trace retained</span>
        </div>
      </div>
    </div>
  );
}

function VolumeBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: "coral" | "mint" }) {
  return (
    <div className="cm-volume-row">
      <div><span>{label}</span><strong>{compact(value)}</strong></div>
      <div><i data-tone={tone} style={{ width: `${Math.max(8, (value / max) * 100)}%` }} /></div>
    </div>
  );
}

export function PlatformFoundations() {
  return (
    <div className="space-y-5">
      <section className="cm-surface-rail" data-reveal>
        <div className="cm-surface-intro">
          <span><WandSparkles className="h-4 w-4" /> One repository identity</span>
          <h3>Move through the platform without losing context</h3>
          <p>The selected project, revision, permissions, and graph stay connected across every working surface.</p>
        </div>
        <div className="cm-surface-list">
          {surfaces.map((surface) => (
            <div key={surface.name}>
              <surface.icon className="h-5 w-5" />
              <span><b>{surface.name}</b><small>{surface.detail}</small></span>
            </div>
          ))}
        </div>
      </section>

      <section className="cm-index-pipeline" data-reveal>
        <div className="cm-pipeline-heading">
          <span><Activity className="h-4 w-4" /> Indexing pipeline</span>
          <small>Incremental, inspectable, source-linked</small>
        </div>
        <div className="cm-pipeline-track">
          {pipeline.map((stage, index) => (
            <div key={stage.label} className="cm-pipeline-stage" data-tone={stage.tone}>
              <span><stage.icon className="h-5 w-5" /></span>
              <div><b>{stage.label}</b><small>{stage.detail}</small></div>
              {index < pipeline.length - 1 && <ArrowRight className="cm-pipeline-arrow h-4 w-4" />}
            </div>
          ))}
        </div>
      </section>

      <section className="cm-trust-center" data-reveal>
        <div className="cm-trust-copy">
          <span className="cm-lab-label"><ShieldCheck className="h-4 w-4" /> Trust center</span>
          <h3>Permissions remain visible at every layer</h3>
          <p>CodeMesh separates viewing, collaboration, maintenance, and ownership. Assistant output is evidence for a reviewable change, never a hidden write.</p>
          <div className="cm-role-strip" aria-label="Project roles">
            <span>Viewer</span><i /><span>Contributor</span><i /><span>Maintainer</span><i /><span>Owner</span>
          </div>
        </div>
        <div className="cm-trust-checks">
          <TrustCheck icon={KeyRound} title="Session authentication" detail="Protected APIs require a signed-in CodeMesh identity." />
          <TrustCheck icon={UsersRound} title="Role-scoped actions" detail="Project capabilities are checked server-side before mutation." />
          <TrustCheck icon={LockKeyhole} title="Review-first AI" detail="Citations and proposed changes stay inspectable before publishing." />
          <TrustCheck icon={GitBranch} title="Revision awareness" detail="Answers and graph data carry repository revision context." />
        </div>
      </section>

      <section className="cm-setup-runway" data-reveal>
        <div><span>01</span><FileCode2 className="h-5 w-5" /><b>Import</b><p>Connect a public repository or upload a ZIP archive.</p></div>
        <ArrowRight className="h-4 w-4" />
        <div><span>02</span><Layers3 className="h-5 w-5" /><b>Index</b><p>Build files, symbols, imports, calls, and graph links.</p></div>
        <ArrowRight className="h-4 w-4" />
        <div><span>03</span><Workflow className="h-5 w-5" /><b>Understand and change</b><p>Explore, ask, collaborate, review, and verify in one workspace.</p></div>
      </section>
    </div>
  );
}

function TrustCheck({ icon: Icon, title, detail }: { icon: typeof Check; title: string; detail: string }) {
  return (
    <div>
      <span><Icon className="h-4 w-4" /></span>
      <p><b>{title}</b><small>{detail}</small></p>
      <Check className="h-4 w-4" />
    </div>
  );
}

function compact(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
