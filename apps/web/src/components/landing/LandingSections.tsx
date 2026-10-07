import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Cpu,
  GitBranch,
  Lock,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
  X,
  Zap
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const compact = (value: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);

const money = (value: number) =>
  new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const read = () =>
      setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced");
    read();
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);
  return reduced;
}

function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, seen] as const;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="lp-copy"
      aria-label={copied ? "Copied" : `${label} to clipboard`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Token race — hero card                                              */
/* ------------------------------------------------------------------ */

const CRAWL_TOKENS = 258_115;
const MESH_TOKENS = 12_524;

export function HeroTokenCard() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!seen) return;
    if (reduced) {
      setProgress(1);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1400);
      setProgress(1 - Math.pow(1 - t, 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [seen, reduced]);

  const reduction = Math.round((1 - MESH_TOKENS / CRAWL_TOKENS) * 1000) / 10;

  return (
    <div ref={ref} className="lp-hero-card" aria-label="Illustrative token comparison for one repository question">
      <div className="lp-hero-card-head">
        <span className="lp-dot lp-dot-live" /> trace_query · auth question
        <span className="lp-chip">illustrative</span>
      </div>
      <p className="lp-hero-question">Where is authentication handled, and what depends on it?</p>

      <div className="lp-meter">
        <div className="lp-meter-label"><span>Whole-file crawl</span><strong>{compact(CRAWL_TOKENS * progress)} tokens</strong></div>
        <div className="lp-meter-track"><i className="lp-bar-bad" style={{ width: `${progress * 100}%` }} /></div>
      </div>
      <div className="lp-meter">
        <div className="lp-meter-label"><span>Graph-focused context</span><strong>{compact(MESH_TOKENS * progress)} tokens</strong></div>
        <div className="lp-meter-track"><i className="lp-bar-good" style={{ width: `${Math.max(2, (MESH_TOKENS / CRAWL_TOKENS) * progress * 100)}%` }} /></div>
      </div>

      <div className="lp-hero-card-foot">
        <div><strong>{(reduction * progress).toFixed(1)}%</strong><span>fewer tokens</span></div>
        <div><strong>9 → 6</strong><span>retrieval steps</span></div>
        <div><strong>~1 ms</strong><span>graph lookup</span></div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Integrations strip                                                  */
/* ------------------------------------------------------------------ */

const integrations = ["Claude Code", "Cursor", "VS Code", "Claude.ai", "ChatGPT", "Windsurf", "Any MCP client"];

export function IntegrationStrip() {
  const items = [...integrations, ...integrations];
  return (
    <div className="lp-marquee" aria-label="Works with the AI tools you already use">
      <div className="lp-marquee-track">
        {items.map((name, index) => (
          <span key={`${name}-${index}`} aria-hidden={index >= integrations.length}>{name}</span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Side-by-side step trace                                             */
/* ------------------------------------------------------------------ */

const withoutSteps = [
  "Search repo",
  "Open file",
  "Read thousands of tokens",
  "Follow imports",
  "Open related files",
  "Search callers",
  "Read callers",
  "Read configuration",
  "Reason about answer"
];

const withSteps = [
  "Search structural graph",
  "Identify implementation",
  "Identify callers",
  "Retrieve precise context",
  "Send relevant context to model",
  "Reason about answer"
];

export function StepTrace() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!seen) return;
    if (reduced) {
      setTick(withoutSteps.length);
      return;
    }
    setTick(0);
    const id = window.setInterval(() => setTick((current) => (current >= withoutSteps.length ? current : current + 1)), 330);
    return () => window.clearInterval(id);
  }, [seen, reduced]);

  return (
    <div ref={ref} className="lp-trace">
      <TraceColumn tone="bad" title="Without a graph" steps={withoutSteps} tick={tick} />
      <TraceColumn tone="good" title="With CodeMesh" steps={withSteps} tick={tick} />
    </div>
  );
}

function TraceColumn({ tone, title, steps, tick }: { tone: "bad" | "good"; title: string; steps: string[]; tick: number }) {
  return (
    <div className={`lp-trace-col lp-trace-${tone}`}>
      <div className="lp-trace-title">{title} <span>{steps.length} steps</span></div>
      <ol>
        {steps.map((step, index) => (
          <li key={step} className={index < tick ? "is-on" : ""}>
            <b>{String(index + 1).padStart(2, "0")}</b>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ask-the-graph terminal demo                                         */
/* ------------------------------------------------------------------ */

type DemoQuery = {
  id: string;
  question: string;
  tool: string;
  spans: Array<{ file: string; line: number; score: number; note: string }>;
  answer: string;
};

const demoQueries: DemoQuery[] = [
  {
    id: "auth",
    question: "Where do we handle token refresh, and who calls it?",
    tool: "search-code → query-context",
    spans: [
      { file: "server/auth/tokens.ts", line: 118, score: 0.94, note: "refreshTokens() rotates the token" },
      { file: "server/routes/auth.ts", line: 62, score: 0.88, note: "POST /refresh calls refreshTokens" },
      { file: "server/middleware/session.ts", line: 31, score: 0.79, note: "retries once on 401" }
    ],
    answer: "refreshTokens() rotates the refresh token and revokes the session family if a spent token is replayed. It is called from the refresh route and the session middleware's 401 retry."
  },
  {
    id: "impact",
    question: "What breaks if I change Task.status?",
    tool: "impact-analysis",
    spans: [
      { file: "server/tasks.ts", line: 44, score: 0.97, note: "Task type declares status" },
      { file: "web/components/TaskBoard.tsx", line: 90, score: 0.86, note: "groups columns by status" },
      { file: "server/reports.ts", line: 17, score: 0.74, note: "aggregates counts per status" }
    ],
    answer: "Three direct dependents: the task model, the board's column grouping, and the weekly report aggregation. Tests in tasks.test.ts cover the first; the other two have no coverage."
  },
  {
    id: "entry",
    question: "Show me how a request reaches the database.",
    tool: "trace-path",
    spans: [
      { file: "server/server.ts", line: 12, score: 0.91, note: "createApp mounts routers" },
      { file: "server/routes/projects.ts", line: 55, score: 0.85, note: "handler validates and calls store" },
      { file: "server/db/store.ts", line: 203, score: 0.82, note: "persist() writes atomically" }
    ],
    answer: "createApp → projects router → permission check → store.persist(). Writes go through one atomic persist path, so there is a single place to audit."
  }
];

export function QueryDemo() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [shown, setShown] = useState(0);
  const timers = useRef<number[]>([]);
  const query = demoQueries[active] ?? demoQueries[0]!;

  const clear = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  useEffect(() => clear, []);

  const run = (index = active) => {
    clear();
    const selected = demoQueries[index] ?? demoQueries[0]!;
    setActive(demoQueries[index] ? index : 0);
    setShown(0);
    if (reduced) {
      setShown(selected.spans.length);
      setPhase("done");
      return;
    }
    setPhase("running");
    selected.spans.forEach((_, spanIndex) => {
      timers.current.push(window.setTimeout(() => setShown(spanIndex + 1), 450 + spanIndex * 420));
    });
    timers.current.push(window.setTimeout(() => setPhase("done"), 450 + selected.spans.length * 420 + 250));
  };

  return (
    <div className="lp-terminal">
      <div className="lp-terminal-tabs" role="tablist" aria-label="Sample questions">
        {demoQueries.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active === index}
            className={active === index ? "is-active" : ""}
            onClick={() => run(index)}
          >
            {item.question}
          </button>
        ))}
      </div>

      <div className="lp-terminal-body" aria-live="polite">
        <div className="lp-terminal-bar"><span /><span /><span /> <em>agent · codemesh connected</em></div>
        {phase === "idle" ? (
          <div className="lp-terminal-empty">
            <p>Pick a question, then run it against the sample graph.</p>
            <button type="button" className="action-primary" onClick={() => run()}><Play className="h-4 w-4" /> Run the query</button>
          </div>
        ) : (
          <div className="lp-terminal-lines">
            <p className="lp-t-prompt">❯ {query.question}</p>
            <p className="lp-t-tool">⚙ {query.tool}</p>
            {query.spans.slice(0, shown).map((span) => (
              <p key={span.file} className="lp-t-span">
                <span>→ {span.file}:{span.line}</span>
                <em>{span.score.toFixed(2)}</em>
                <small>{span.note}</small>
              </p>
            ))}
            {phase === "running" && <p className="lp-t-cursor">walking graph<span /></p>}
            {phase === "done" && (
              <>
                <p className="lp-t-answer">{query.answer}</p>
                <button type="button" className="lp-link-button" onClick={() => run()}><RefreshCw className="h-3.5 w-3.5" /> Replay</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Team cost calculator                                                */
/* ------------------------------------------------------------------ */

export function SavingsCalculator() {
  const [developers, setDevelopers] = useState(25);
  const [spend, setSpend] = useState(100);
  const [share, setShare] = useState(30);
  const [reduction, setReduction] = useState(70);

  const result = useMemo(() => {
    const monthly = developers * spend;
    const eligible = monthly * (share / 100);
    const saved = eligible * (reduction / 100);
    return { monthly, eligible, saved, annual: saved * 12 };
  }, [developers, spend, share, reduction]);

  return (
    <div className="lp-calc">
      <div className="lp-calc-controls">
        <Slider label="Developers" value={developers} min={1} max={500} step={1} onChange={setDevelopers} format={(v) => String(v)} />
        <Slider label="AI spend / developer / month" value={spend} min={10} max={500} step={5} onChange={setSpend} format={money} />
        <Slider label="Share spent on code retrieval" value={share} min={5} max={80} step={1} onChange={setShare} format={(v) => `${v}%`} />
        <Slider label="Assumed reduction on that share" value={reduction} min={10} max={95} step={1} onChange={setReduction} format={(v) => `${v}%`} />
        <p className="lp-fine">
          Illustrative model, not a guarantee. It only applies your assumed reduction to the part of the bill spent on
          loading repository context. Adjust each slider to match your own numbers.
        </p>
      </div>
      <div className="lp-calc-result">
        <div className="lp-calc-row"><span>Monthly AI spend</span><strong>{money(result.monthly)}</strong></div>
        <div className="lp-calc-row"><span>Eligible (retrieval) spend</span><strong>{money(result.eligible)}</strong></div>
        <div className="lp-calc-hero">
          <span>Potential savings</span>
          <strong>{money(result.saved)}<small>/ month</small></strong>
          <em>{money(result.annual)} per year</em>
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(value: number): void;
  format(value: number): string;
}) {
  return (
    <label className="lp-slider">
      <span><b>{label}</b><output>{format(value)}</output></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Install in three steps                                              */
/* ------------------------------------------------------------------ */

const installTabs = [
  {
    id: "editor",
    label: "Editor",
    steps: [
      { title: "Open the repository", body: "Import a public GitHub branch, upload a ZIP, or start from the seeded sample.", code: "npm run seed" },
      { title: "Build the mesh", body: "CodeMesh indexes files and symbols, then resolves calls, imports and containment.", code: "npm run build && npm run dev" },
      { title: "Ask with context", body: "Open the assistant or the graph and inspect answers with source citations.", code: "http://localhost:4200" }
    ]
  },
  {
    id: "cli",
    label: "Terminal",
    steps: [
      { title: "Install dependencies", body: "Node 22.12 or newer is required.", code: "npm install" },
      { title: "Run the tests", body: "Unit and integration tests cover retrieval, auth and permissions.", code: "npm test" },
      { title: "Evaluate retrieval", body: "Reproduce the recall numbers with the evaluation script.", code: "npm run evaluate:retrieval" }
    ]
  },
  {
    id: "docker",
    label: "Docker",
    steps: [
      { title: "Copy the environment file", body: "Leave Gemini and GitHub blank to use the deterministic local provider.", code: "cp .env.example .env" },
      { title: "Start the infrastructure", body: "PostgreSQL, Redis and S3-compatible storage activate when configured.", code: "docker compose -f infra/docker-compose.yml up -d" },
      { title: "Open the app", body: "Sign in with a seeded demo account or create your own.", code: "http://localhost:4200" }
    ]
  }
];

export function InstallSteps() {
  const [tab, setTab] = useState(0);
  const current = installTabs[tab] ?? installTabs[0]!;
  return (
    <div className="lp-install">
      <div className="lp-pills" role="tablist" aria-label="Setup method">
        {installTabs.map((item, index) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === index} className={tab === index ? "is-active" : ""} onClick={() => setTab(index)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="lp-install-grid">
        {current.steps.map((step, index) => (
          <article key={step.title} className="lp-install-card">
            <div className="lp-install-num">{String(index + 1).padStart(2, "0")}</div>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
            <div className="lp-code">
              <code>{step.code}</code>
              <CopyButton text={step.code} />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Console preview                                                     */
/* ------------------------------------------------------------------ */

const consoleViews = [
  {
    id: "overview",
    label: "Overview",
    heading: "Your graph is healthy",
    note: "Every repository synced clean, with no drift detected.",
    stats: [["Repositories", "6"], ["Code nodes", "159,609"], ["Relationships", "267,508"], ["Seats", "5 / 8"]],
    rows: [["openclaw", "main", "just now", "OK"], ["react", "main", "4m ago", "OK"], ["django", "main", "12m ago", "OK"]]
  },
  {
    id: "repos",
    label: "Repositories",
    heading: "Import and re-index",
    note: "Connect a public branch or upload a ZIP. Each import records the indexed revision.",
    stats: [["Indexed files", "9"], ["Graph links", "45"], ["Symbols", "112"], ["ZIP ceiling", "50 MB"]],
    rows: [["taskpilot", "main", "seeded", "OK"], ["your-repo", "main", "queued", "Pending"], ["archive.zip", "—", "uploaded", "Pending"]]
  },
  {
    id: "agents",
    label: "Agents",
    heading: "Who can read the graph",
    note: "Applications authorized to query your repository, each with scoped access.",
    stats: [["Connected", "3"], ["Scopes", "read-only"], ["Tokens", "rotating"], ["Revoke", "1 click"]],
    rows: [["Claude Code", "code.read", "2m ago", "Connected"], ["Cursor", "query.read", "18m ago", "Connected"], ["OpenCode", "repos.read", "1h ago", "Connected"]]
  }
] as const;

export function ConsolePreview() {
  const [view, setView] = useState(0);
  const current = consoleViews[view] ?? consoleViews[0]!;
  return (
    <div className="lp-console">
      <div className="lp-pills" role="tablist" aria-label="Console screens">
        {consoleViews.map((item, index) => (
          <button key={item.id} type="button" role="tab" aria-selected={view === index} className={view === index ? "is-active" : ""} onClick={() => setView(index)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="lp-console-window">
        <div className="lp-console-head">
          <strong>{current.heading}</strong>
          <span>{current.note}</span>
        </div>
        <div className="lp-console-stats">
          {current.stats.map(([label, value]) => (
            <div key={label}><span>{label}</span><strong>{value}</strong></div>
          ))}
        </div>
        <table>
          <tbody>
            {current.rows.map((row) => (
              <tr key={row[0]}>
                <td>{row[0]}</td>
                <td>{row[1]}</td>
                <td>{row[2]}</td>
                <td><span className={`lp-status lp-status-${row[3] === "Pending" ? "warn" : "ok"}`}>{row[3]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="lp-fine">Sample data shown for illustration.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Security                                                            */
/* ------------------------------------------------------------------ */

const securityPoints = [
  { icon: Lock, title: "Scoped by credential", body: "Access comes from the signed-in session and project role, never from anything the client sends." },
  { icon: ShieldCheck, title: "CSRF and cookie hardening", body: "HttpOnly cookies, refresh-token rotation, CSRF checks and a CORS allowlist protect every protected route." },
  { icon: GitBranch, title: "Review-first changes", body: "AI suggestions stay visible as proposals until a maintainer reviews and applies them." },
  { icon: Cpu, title: "Per-user AI limits", body: "Rate limits and usage telemetry keep assistant cost and abuse visible." }
];

export function SecurityPanel() {
  return (
    <div className="lp-security">
      <div className="lp-security-list">
        {securityPoints.map((point) => (
          <div key={point.title} className="lp-security-item">
            <point.icon className="h-5 w-5" />
            <div>
              <h3>{point.title}</h3>
              <p>{point.body}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="lp-scope" aria-label="Example of granted and refused actions">
        <div className="lp-scope-head"><Terminal className="h-4 w-4" /> role · contributor</div>
        <p className="lp-scope-label">granted</p>
        <p className="is-ok"><Check className="h-3.5 w-3.5" /> read repository graph</p>
        <p className="is-ok"><Check className="h-3.5 w-3.5" /> ask grounded questions</p>
        <p className="is-ok"><Check className="h-3.5 w-3.5" /> propose a patch for review</p>
        <p className="lp-scope-label">refused</p>
        <p className="is-no"><X className="h-3.5 w-3.5" /> apply a patch without review</p>
        <p className="is-no"><X className="h-3.5 w-3.5" /> change project permissions</p>
        <p className="is-no"><X className="h-3.5 w-3.5" /> read another account&apos;s project</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Why-it-matters feature tiles                                        */
/* ------------------------------------------------------------------ */

const featureTiles = [
  { icon: Search, title: "Exact spans, not whole files", body: "Ask about a function and get that function back with its file and line numbers." },
  { icon: GitBranch, title: "Relationships already resolved", body: "Callers, imports and call edges come back from one query instead of ten tool calls." },
  { icon: Zap, title: "Fast graph lookups", body: "Structural queries return in about a millisecond, so context arrives before a file read would finish." },
  { icon: RefreshCw, title: "Fresh on every change", body: "Re-import or re-index and the graph and assistant context rebuild to match the code." },
  { icon: ShieldCheck, title: "Citations on every answer", body: "Every assistant answer links back to files, symbols, ranges and the indexed revision." },
  { icon: Cpu, title: "Works with your tools", body: "Use the web app today and bring the same graph to your editor and agents." }
];

export function FeatureTiles() {
  return (
    <div className="lp-tiles">
      {featureTiles.map((tile) => (
        <article key={tile.title} className="lp-tile" data-reveal>
          <tile.icon className="h-5 w-5" />
          <h3>{tile.title}</h3>
          <p>{tile.body}</p>
        </article>
      ))}
    </div>
  );
}

