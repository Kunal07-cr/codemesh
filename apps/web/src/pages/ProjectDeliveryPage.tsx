import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Bot,
  Boxes,
  Building2,
  CheckCircle2,
  CircleAlert,
  CloudCog,
  Code2,
  Copy,
  FileCode2,
  GitPullRequest,
  KeyRound,
  Network,
  Play,
  RefreshCw,
  Rocket,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  TestTube2,
  Trash2,
  Webhook,
  Workflow,
  Zap,
  type LucideIcon
} from "lucide-react";
import { LoadingState } from "../components/LoadingState";
import { api, jsonBody } from "../lib/api";

type Review = {
  score: number;
  status: "pass" | "review" | "block";
  changedFiles: string[];
  impactedFiles: string[];
  impactedSymbols: string[];
  summary: string;
  checks: Array<{ id: string; label: string; status: string; detail: string }>;
  annotations: Array<{ path: string; line: number; level: string; title: string; message: string }>;
  testPlan: Array<{ filePath: string; command: string; rationale: string }>;
};

type IncrementalPlan = {
  changedFiles: string[];
  removedOrUnknownFiles: string[];
  affectedFiles: string[];
  affectedSymbols: string[];
  estimatedFilesAvoided: number;
  strategy: "incremental" | "full";
  reason: string;
};

type Documentation = {
  generatedAt: string;
  entryPoints: string[];
  modules: Array<{ name: string; files: number; symbols: number; relationships: number; languages: string[] }>;
  mermaid: string;
  health: { score: number };
};

type GeneratedTest = {
  changedFile: string;
  suggestedPath: string;
  framework: string;
  cases: string[];
  evidence: string[];
};

type ForecastRange = { min: number; max: number };

type RepositoryFuture = {
  id: "surgical" | "boundary" | "compatibility";
  name: string;
  strategy: string;
  thesis: string;
  confidence: number;
  risk: "low" | "medium" | "high";
  effortPoints: number;
  reversibility: number;
  targetFiles: string[];
  affectedFiles: string[];
  affectedSymbols: string[];
  predicted: {
    changedFiles: ForecastRange;
    impactedFiles: ForecastRange;
    relationshipDelta: ForecastRange;
    healthDelta: ForecastRange;
    testAdditions: ForecastRange;
    reviewMinutes: ForecastRange;
  };
  assumptions: string[];
  evidence: string[];
  sequence: string[];
  compositeScore: number;
};

type RepositoryFutureSimulation = {
  objective: string;
  createdAt: string;
  baseline: {
    revision: string;
    files: number;
    symbols: number;
    relationships: number;
    testFiles: number;
    healthScore: number;
    modules: number;
    architectureSignature: string;
  };
  calibration: { samples: number; averageScore: number | null; confidenceAdjustment: number };
  futures: RepositoryFuture[];
  recommendation: { futureId: RepositoryFuture["id"]; reason: string };
  uncertainty: { level: "low" | "medium" | "high"; drivers: string[] };
  receipt: { id: string; architectureSignature: string; evidenceFiles: string[]; statement: string };
};

type FutureReconciliation = {
  simulationReceiptId: string;
  futureId: RepositoryFuture["id"];
  status: "awaiting_change" | "calibrated";
  calibrationScore: number | null;
  confidenceBefore: number;
  confidenceAfter: number;
  observedFiles: string[];
  dimensions: Array<{ label: string; predicted: ForecastRange; actual: number; score: number; status: "inside" | "outside" }>;
  lessons: string[];
  summary: string;
};

type DeliveryRun = {
  id: string;
  kind: string;
  status: string;
  title: string;
  input: Record<string, unknown>;
  result?: Record<string, unknown>;
  createdAt: string;
  completedAt?: string;
};

type AgentToken = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
};

type ProjectShare = {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
};

type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  createdAt: string;
  readAt?: string;
};

type DeliveryPayload = {
  project: { id: string; name: string; commitSha: string; repoUrl?: string; role: string | null };
  files: string[];
  changedFiles: string[];
  review: Review;
  incremental: IncrementalPlan;
  documentation: Documentation;
  generatedTests: GeneratedTest[];
  futureCalibration: { samples: number; averageScore: number | null; confidenceAdjustment: number };
  runs: DeliveryRun[];
  agentTokens: AgentToken[];
  shares: ProjectShare[];
  notifications: Notification[];
  sandbox: { enabled: boolean; mode: string; timeoutMs: number; boundary: string };
  integrations: {
    github: { configured: boolean; webhookVerification: boolean; capabilities: string[] };
    mcp: { endpoint: string; protocolVersion: string };
    vscode: { available: boolean; extensionPath: string };
    identity: { oidc: boolean; scim: boolean };
  };
  organization: {
    memberCount: number;
    roles: string[];
    controls: Array<{ label: string; status: string }>;
  };
};

type Tab = "review" | "futures" | "sandbox" | "sync" | "agents" | "incidents" | "automation" | "reports" | "organization";

const tabs: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: "review", label: "PR review", icon: GitPullRequest },
  { id: "futures", label: "Futures lab", icon: Sparkles },
  { id: "sandbox", label: "Verify", icon: ShieldCheck },
  { id: "sync", label: "Index sync", icon: RefreshCw },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "incidents", label: "Incidents", icon: Zap },
  { id: "automation", label: "Automation", icon: Workflow },
  { id: "reports", label: "Reports", icon: Share2 },
  { id: "organization", label: "Organization", icon: Building2 }
];

export function ProjectDeliveryPage() {
  const { projectId = "" } = useParams();
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("review");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [fileFilter, setFileFilter] = useState("");
  const [incident, setIncident] = useState({
    title: "Production request failure",
    stackTrace: "Error: Request failed\n    at handleLogin (src/auth/session.ts:18:9)\n    at login (src/routes/auth.ts:24:3)"
  });
  const [objective, setObjective] = useState("Add structured authentication error codes without changing existing response behavior.");
  const [futureObjective, setFutureObjective] = useState("Introduce passkey login while preserving the current session and password flows.");
  const [selectedFutureId, setSelectedFutureId] = useState<RepositoryFuture["id"] | "">("");
  const [tokenName, setTokenName] = useState("Local engineering agent");
  const [shareLabel, setShareLabel] = useState("Architecture review");
  const [revealedToken, setRevealedToken] = useState("");
  const [revealedShare, setRevealedShare] = useState("");

  const delivery = useQuery({
    queryKey: ["delivery", projectId],
    queryFn: () => api<DeliveryPayload>("/api/projects/" + projectId + "/delivery")
  });
  const data = delivery.data;
  const refresh = () => client.invalidateQueries({ queryKey: ["delivery", projectId] });

  useEffect(() => {
    if (!data || selectedFiles.length > 0) return;
    setSelectedFiles((data.changedFiles.length ? data.changedFiles : data.files.slice(0, 4)));
  }, [data, selectedFiles.length]);

  const review = useMutation({
    mutationFn: () => api<DeliveryRun>("/api/projects/" + projectId + "/delivery/reviews", {
      method: "POST",
      body: jsonBody({ title: "Delivery Hub review", changedFiles: selectedFiles })
    }),
    onSuccess: refresh
  });
  const sandbox = useMutation({
    mutationFn: (preset: "tests" | "typecheck" | "build") => api<DeliveryRun>("/api/projects/" + projectId + "/delivery/sandbox", {
      method: "POST",
      body: jsonBody({ preset })
    }),
    onSuccess: refresh
  });
  const sync = useMutation({
    mutationFn: () => api<{ plan: IncrementalPlan }>("/api/projects/" + projectId + "/delivery/sync", {
      method: "POST",
      body: jsonBody({ title: "Manual incremental sync", changedFiles: selectedFiles })
    }),
    onSuccess: refresh
  });
  const trace = useMutation({
    mutationFn: () => api<DeliveryRun>("/api/projects/" + projectId + "/delivery/incidents", {
      method: "POST",
      body: jsonBody(incident)
    }),
    onSuccess: refresh
  });
  const automate = useMutation({
    mutationFn: () => api<DeliveryRun>("/api/projects/" + projectId + "/delivery/automation", {
      method: "POST",
      body: jsonBody({ objective })
    }),
    onSuccess: refresh
  });
  const simulateFutures = useMutation({
    mutationFn: () => api<DeliveryRun>("/api/projects/" + projectId + "/delivery/futures", {
      method: "POST",
      body: jsonBody({ objective: futureObjective })
    }),
    onSuccess: (run) => {
      const simulation = run.result as RepositoryFutureSimulation | undefined;
      if (simulation) setSelectedFutureId(simulation.recommendation.futureId);
      void refresh();
    }
  });
  const reconcileFuture = useMutation({
    mutationFn: (input: { runId: string; futureId: RepositoryFuture["id"] }) => api<DeliveryRun>(
      "/api/projects/" + projectId + "/delivery/futures/" + input.runId + "/reconcile",
      {
        method: "POST",
        body: jsonBody({
          futureId: input.futureId,
          observedFiles: selectedFiles,
          notes: "Compared with the files currently selected in pull-request review."
        })
      }
    ),
    onSuccess: refresh
  });
  const createToken = useMutation({
    mutationFn: () => api<{ token: string }>("/api/projects/" + projectId + "/delivery/tokens", {
      method: "POST",
      body: jsonBody({ name: tokenName, scopes: ["read", "propose"], expiresInDays: 30 })
    }),
    onSuccess: (result) => {
      setRevealedToken(result.token);
      void refresh();
    }
  });
  const revokeToken = useMutation({
    mutationFn: (id: string) => api("/api/projects/" + projectId + "/delivery/tokens/" + id, { method: "DELETE" }),
    onSuccess: refresh
  });
  const createShare = useMutation({
    mutationFn: () => api<{ url: string }>("/api/projects/" + projectId + "/delivery/shares", {
      method: "POST",
      body: jsonBody({ label: shareLabel, expiresInDays: 7 })
    }),
    onSuccess: (result) => {
      setRevealedShare(result.url);
      void refresh();
    }
  });
  const revokeShare = useMutation({
    mutationFn: (id: string) => api("/api/projects/" + projectId + "/delivery/shares/" + id, { method: "DELETE" }),
    onSuccess: refresh
  });
  const readNotification = useMutation({
    mutationFn: (id: string) => api("/api/projects/" + projectId + "/delivery/notifications/" + id + "/read", { method: "POST" }),
    onSuccess: refresh
  });

  const filteredFiles = useMemo(() => {
    if (!data) return [];
    const term = fileFilter.trim().toLowerCase();
    return data.files.filter((file) => !term || file.toLowerCase().includes(term));
  }, [data, fileFilter]);

  const latestFutureRun = data?.runs.find((run) => run.kind === "future_simulation" && run.result);
  const activeFutureRun = simulateFutures.data ?? latestFutureRun;
  const activeSimulation = activeFutureRun?.result as RepositoryFutureSimulation | undefined;
  const latestMatchingReconciliation = data?.runs.find((run) =>
    run.kind === "future_reconciliation"
    && run.result?.simulationReceiptId === activeSimulation?.receipt.id
  );
  const activeReconciliation = (reconcileFuture.data?.result ?? latestMatchingReconciliation?.result) as FutureReconciliation | undefined;

  useEffect(() => {
    if (!activeSimulation || activeSimulation.futures.some((future) => future.id === selectedFutureId)) return;
    setSelectedFutureId(activeSimulation.recommendation.futureId);
  }, [activeSimulation, selectedFutureId]);

  if (delivery.isLoading) return <LoadingState label="Preparing Delivery Hub" />;
  if (!data) return <div className="mx-auto max-w-7xl px-4 py-10 text-coral">Delivery Hub could not be loaded.</div>;

  const activeReview = (review.data?.result as Review | undefined) ?? data.review;
  const activePlan = sync.data?.plan ?? data.incremental;
  const unread = data.notifications.filter((item) => !item.readAt).length;
  const latestSandbox = sandbox.data?.result as SandboxReport | undefined;
  const incidentResult = trace.data?.result as IncidentReport | undefined;
  const automationResult = automate.data?.result as AutomationResult | undefined;
  const error = [review.error, sandbox.error, sync.error, trace.error, automate.error, simulateFutures.error, reconcileFuture.error, createToken.error, revokeToken.error, createShare.error, revokeShare.error]
    .find((item): item is Error => item instanceof Error);

  return (
    <section className="cm-delivery-page mx-auto max-w-7xl px-4 py-8">
      <header className="surface-panel cm-hero-panel cm-delivery-hero overflow-hidden p-5 md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <Link className="inline-flex items-center gap-2 text-xs text-steel hover:text-mint" to={"/projects/" + projectId}>
              <ArrowLeft className="h-3.5 w-3.5" /> Repository command center
            </Link>
            <div className="eyebrow mt-5"><Rocket className="h-3.5 w-3.5" /> Release intelligence</div>
            <h1 className="mt-2 text-3xl font-bold text-white md:text-4xl">Delivery Hub</h1>
            <p className="mt-3 max-w-2xl leading-7 text-steel">
              Forecast implementation futures, review repository impact, verify changes, connect engineering agents, trace incidents, and publish evidence from one source-linked workflow.
            </p>
          </div>
          <div className="cm-delivery-orbit" aria-hidden="true">
            <div className="cm-delivery-orbit-ring" />
            <Rocket className="h-7 w-7 text-mint" />
          </div>
        </div>
        <div className="cm-stagger mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Review gate" value={activeReview.status} icon={GitPullRequest} tone="cm-tone-violet" />
          <Metric label="Forecast accuracy" value={data.futureCalibration.averageScore === null ? "learning" : data.futureCalibration.averageScore + "%"} icon={Sparkles} tone="cm-tone-mint" />
          <Metric label="Sandbox" value={data.sandbox.mode} icon={ShieldCheck} tone="cm-tone-cyan" />
          <Metric label="Agent access" value={String(data.agentTokens.filter((token) => !token.revokedAt).length) + " tokens"} icon={KeyRound} tone="cm-tone-amber" />
          <Metric label="Inbox" value={String(unread) + " unread"} icon={Bell} tone="cm-tone-coral" />
        </div>
      </header>

      <nav className="cm-delivery-tabs mt-5" aria-label="Delivery workflows">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={"cm-delivery-tab " + (tab === item.id ? "is-active" : "")}
            type="button"
            onClick={() => setTab(item.id)}
          >
            <item.icon className="h-4 w-4" />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {error && <ErrorBanner message={error.message} />}

      <div className="surface-panel cm-delivery-workspace mt-4 p-5 md:p-7">
        {tab === "review" && (
          <ReviewView
            projectId={projectId}
            data={data}
            files={filteredFiles}
            filter={fileFilter}
            setFilter={setFileFilter}
            selected={selectedFiles}
            setSelected={setSelectedFiles}
            review={activeReview}
            run={() => review.mutate()}
            pending={review.isPending}
          />
        )}
        {tab === "futures" && (
          <FuturesView
            objective={futureObjective}
            setObjective={setFutureObjective}
            simulation={activeSimulation}
            simulationRunId={activeFutureRun?.id}
            reconciliation={activeReconciliation}
            selectedFutureId={selectedFutureId || activeSimulation?.recommendation.futureId || "surgical"}
            setSelectedFutureId={setSelectedFutureId}
            observedFiles={selectedFiles}
            projectId={projectId}
            simulate={() => simulateFutures.mutate()}
            reconcile={(runId, futureId) => reconcileFuture.mutate({ runId, futureId })}
            pending={simulateFutures.isPending || reconcileFuture.isPending}
          />
        )}
        {tab === "sandbox" && <SandboxView info={data.sandbox} report={latestSandbox} run={(preset) => sandbox.mutate(preset)} pending={sandbox.isPending} />}
        {tab === "sync" && <SyncView plan={activePlan} selected={selectedFiles} run={() => sync.mutate()} pending={sync.isPending} />}
        {tab === "agents" && (
          <AgentsView
            data={data}
            tokenName={tokenName}
            setTokenName={setTokenName}
            revealedToken={revealedToken}
            create={() => createToken.mutate()}
            revoke={(id) => revokeToken.mutate(id)}
            pending={createToken.isPending || revokeToken.isPending}
          />
        )}
        {tab === "incidents" && <IncidentView value={incident} setValue={setIncident} result={incidentResult} run={() => trace.mutate()} pending={trace.isPending} projectId={projectId} />}
        {tab === "automation" && <AutomationView objective={objective} setObjective={setObjective} result={automationResult} run={() => automate.mutate()} pending={automate.isPending} projectId={projectId} />}
        {tab === "reports" && (
          <ReportsView
            data={data}
            label={shareLabel}
            setLabel={setShareLabel}
            revealedShare={revealedShare}
            create={() => createShare.mutate()}
            revoke={(id) => revokeShare.mutate(id)}
            pending={createShare.isPending || revokeShare.isPending}
          />
        )}
        {tab === "organization" && <OrganizationView data={data} markRead={(id) => readNotification.mutate(id)} />}
      </div>
    </section>
  );
}

type SandboxReport = {
  mode: string;
  preset: string;
  status: string;
  command?: string;
  durationMs: number;
  checks: Array<{ label: string; status: string; detail: string }>;
  logs: string[];
  disclaimer: string;
};

type IncidentReport = {
  title: string;
  severity: string;
  summary: string;
  matchedFiles: Array<{ path: string; confidence: number; evidence: string }>;
  blastRadius: string[];
  runbook: string[];
};

type AutomationResult = {
  objective: string;
  plan: { risk: string; targetFiles: string[]; steps: Array<{ id: string; title: string; detail: string; evidence: string; filePaths: string[] }> };
  sandbox: { status: string; checks: Array<{ id: string; label: string; status: string; detail: string }> };
  review: Review;
  generatedTests: GeneratedTest[];
};

function ReviewView(props: {
  projectId: string;
  data: DeliveryPayload;
  files: string[];
  filter: string;
  setFilter(value: string): void;
  selected: string[];
  setSelected(value: string[]): void;
  review: Review;
  run(): void;
  pending: boolean;
}) {
  const toggle = (file: string) => props.setSelected(props.selected.includes(file) ? props.selected.filter((item) => item !== file) : [...props.selected, file]);
  return (
    <div className="grid gap-8 xl:grid-cols-[0.78fr_1.22fr]">
      <section>
        <SectionTitle icon={FileCode2} eyebrow="Change set" title="Choose files to review" detail="The graph expands this selection into affected files, symbols, tests, and security annotations." />
        <div className="relative mt-5">
          <Search className="absolute left-3 top-3 h-4 w-4 text-steel" />
          <input className="field pl-9" value={props.filter} onChange={(event) => props.setFilter(event.target.value)} placeholder="Filter repository files" />
        </div>
        <div className="cm-scrollbar mt-3 max-h-80 overflow-auto border-y border-line">
          {props.files.map((file) => (
            <label key={file} className="cm-file-choice flex cursor-pointer items-center gap-3 border-b border-line px-1 py-3 last:border-0">
              <input type="checkbox" checked={props.selected.includes(file)} onChange={() => toggle(file)} />
              <Code2 className="h-4 w-4 shrink-0 text-cyan" />
              <span className="min-w-0 truncate font-mono text-xs text-white">{file}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className="action-primary" type="button" disabled={props.pending || props.selected.length === 0} onClick={props.run}>
            <Play className="h-4 w-4" /> {props.pending ? "Reviewing" : "Run review"}
          </button>
          <button className="action-secondary" type="button" onClick={() => props.setSelected(props.data.files)}>Select all</button>
          <button className="action-secondary" type="button" onClick={() => props.setSelected([])}>Clear</button>
          <span className="ml-auto font-mono text-xs text-steel">{props.selected.length} selected</span>
        </div>
      </section>
      <section>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionTitle icon={GitPullRequest} eyebrow="Graph-aware gate" title="Pull request evidence" detail={props.review.summary} />
          <Score score={props.review.score} status={props.review.status} />
        </div>
        <div className="mt-5 divide-y divide-line border-y border-line">
          {props.review.checks.map((check) => (
            <div className="py-4" key={check.id}>
              <div className="flex items-center gap-2"><StatusIcon status={check.status} /><span className="font-semibold text-white">{check.label}</span><StatusText status={check.status} /></div>
              <p className="mt-1 text-sm leading-6 text-steel">{check.detail}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <ListBlock title={"Impact radius (" + props.review.impactedFiles.length + ")"} items={props.review.impactedFiles} projectId={props.projectId} />
          <ListBlock title={"Source annotations (" + props.review.annotations.length + ")"} items={props.review.annotations.map((item) => item.path + ":" + item.line + " - " + item.title)} />
        </div>
      </section>
    </div>
  );
}

function SandboxView(props: { info: DeliveryPayload["sandbox"]; report?: SandboxReport; run(preset: "tests" | "typecheck" | "build"): void; pending: boolean }) {
  return (
    <div className="grid gap-8 xl:grid-cols-[0.75fr_1.25fr]">
      <section>
        <SectionTitle icon={ShieldCheck} eyebrow="Verification boundary" title="Secure change verification" detail={props.info.boundary} />
        <div className="mt-5 grid gap-3">
          {(["tests", "typecheck", "build"] as const).map((preset, index) => {
            const Icon = [TestTube2, Code2, Boxes][index]!;
            return <button key={preset} className="cm-command-row" type="button" disabled={props.pending} onClick={() => props.run(preset)}><Icon className="h-5 w-5" /><span><strong>Run {preset}</strong><small>Allowlisted repository script</small></span><Play className="ml-auto h-4 w-4" /></button>;
          })}
        </div>
        <div className="mt-5 border-l-2 border-cyan pl-4 text-sm leading-6 text-steel">
          Mode: <span className="font-mono text-cyan">{props.info.mode}</span><br />
          Timeout: <span className="font-mono text-white">{props.info.timeoutMs} ms</span>
        </div>
      </section>
      <section>
        <SectionTitle icon={SquareTerminal} eyebrow="Verification output" title={props.report ? props.report.preset + " result" : "No run selected"} detail={props.report ? props.report.disclaimer : "Choose a preset to run static gates and, when configured, isolated repository commands."} />
        {props.report ? (
          <>
            <div className="mt-5 divide-y divide-line border-y border-line">
              {props.report.checks.map((check) => <div className="py-4" key={check.label}><div className="flex items-center gap-2"><StatusIcon status={check.status} /><span className="font-semibold text-white">{check.label}</span><StatusText status={check.status} /></div><p className="mt-1 text-sm text-steel">{check.detail}</p></div>)}
            </div>
            <pre className="cm-scrollbar mt-5 max-h-72 overflow-auto border border-line bg-ink p-4 font-mono text-xs leading-6 text-steel">{props.report.logs.join("\n")}</pre>
          </>
        ) : <Empty text="Verification logs and checks will appear here." />}
      </section>
    </div>
  );
}

function SyncView(props: { plan: IncrementalPlan; selected: string[]; run(): void; pending: boolean }) {
  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <section>
        <SectionTitle icon={RefreshCw} eyebrow="Incremental intelligence" title="Refresh only what changed" detail={props.plan.reason} />
        <div className="mt-6 grid grid-cols-2 gap-4">
          <Mini label="Strategy" value={props.plan.strategy} tone="text-cyan" />
          <Mini label="Files avoided" value={String(props.plan.estimatedFilesAvoided)} tone="text-mint" />
          <Mini label="Affected files" value={String(props.plan.affectedFiles.length)} tone="text-violet" />
          <Mini label="Affected symbols" value={String(props.plan.affectedSymbols.length)} tone="text-amber" />
        </div>
        <button className="action-primary mt-6" type="button" disabled={props.pending || props.selected.length === 0} onClick={props.run}><RefreshCw className={"h-4 w-4 " + (props.pending ? "animate-spin" : "")} /> Queue sync</button>
      </section>
      <section>
        <SectionTitle icon={Network} eyebrow="Graph neighborhood" title="Planned refresh radius" detail="GitHub push events use the same path and update repository content before rebuilding graph evidence." />
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <ListBlock title="Selected changes" items={props.selected} />
          <ListBlock title="Graph-adjacent files" items={props.plan.affectedFiles} />
        </div>
      </section>
    </div>
  );
}

function AgentsView(props: {
  data: DeliveryPayload;
  tokenName: string;
  setTokenName(value: string): void;
  revealedToken: string;
  create(): void;
  revoke(id: string): void;
  pending: boolean;
}) {
  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <section>
        <SectionTitle icon={Bot} eyebrow="Model Context Protocol" title="Connect engineering agents" detail="Issue scoped, revocable credentials for repository search, impact analysis, architecture docs, incident tracing, and change planning." />
        <label className="mt-5 block text-xs text-steel">Token name<input className="field mt-1" value={props.tokenName} onChange={(event) => props.setTokenName(event.target.value)} /></label>
        <button className="action-primary mt-3" type="button" disabled={props.pending || props.tokenName.trim().length < 3} onClick={props.create}><KeyRound className="h-4 w-4" /> Create 30-day token</button>
        {props.revealedToken && <SecretField label="Copy this token now. It is shown once." value={props.revealedToken} />}
        <div className="mt-6 border-y border-line py-4">
          <div className="text-xs uppercase text-steel">MCP endpoint</div>
          <CopyRow value={props.data.integrations.mcp.endpoint} />
          <div className="mt-2 font-mono text-[10px] text-steel">Protocol {props.data.integrations.mcp.protocolVersion}</div>
        </div>
        <div className="mt-5 divide-y divide-line border-y border-line">
          {props.data.agentTokens.map((token) => <div className="flex items-center gap-3 py-3" key={token.id}><KeyRound className={"h-4 w-4 " + (token.revokedAt ? "text-steel" : "text-mint")} /><div className="min-w-0 flex-1"><div className="truncate text-sm text-white">{token.name}</div><div className="font-mono text-[10px] text-steel">{token.prefix}... / {token.scopes.join(", ")}</div></div>{!token.revokedAt && <button className="cm-icon-button" title="Revoke token" type="button" onClick={() => props.revoke(token.id)}><Trash2 className="h-4 w-4" /></button>}</div>)}
        </div>
      </section>
      <section>
        <SectionTitle icon={Code2} eyebrow="Editor companion" title="VS Code extension" detail="Use CodeMesh search and impact analysis beside the code without copying repository context into a chat." />
        <ol className="mt-5 space-y-5">
          <Step number="01" title="Open the extension folder" detail={props.data.integrations.vscode.extensionPath} />
          <Step number="02" title="Configure three settings" detail="codemesh.endpoint, codemesh.token, and codemesh.projectId" />
          <Step number="03" title="Run CodeMesh commands" detail="Open Graph, Explain Selection, and Show Impact from the command palette." />
        </ol>
        <div className="mt-8 border-t border-line pt-5">
          <div className="eyebrow"><Webhook className="h-3.5 w-3.5" /> GitHub App</div>
          <div className="mt-3 flex items-center justify-between gap-4"><span className="text-sm text-white">Private repositories and PR checks</span><StatusBadge status={props.data.integrations.github.configured ? "ready" : "configuration_required"} /></div>
          <div className="mt-3 flex flex-wrap gap-2">{props.data.integrations.github.capabilities.map((item) => <span className="border border-line px-2 py-1 text-[10px] text-steel" key={item}>{item}</span>)}</div>
        </div>
      </section>
    </div>
  );
}

function IncidentView(props: { value: { title: string; stackTrace: string }; setValue(value: { title: string; stackTrace: string }): void; result?: IncidentReport; run(): void; pending: boolean; projectId: string }) {
  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <section>
        <SectionTitle icon={Zap} eyebrow="Production evidence" title="Trace an incident to source" detail="Paste stack frames, error text, file paths, or symbol names. CodeMesh maps them into the repository graph and builds a response runbook." />
        <label className="mt-5 block text-xs text-steel">Incident title<input className="field mt-1" value={props.value.title} onChange={(event) => props.setValue({ ...props.value, title: event.target.value })} /></label>
        <label className="mt-3 block text-xs text-steel">Stack trace or logs<textarea className="field cm-scrollbar mt-1 min-h-60 resize-y font-mono text-xs leading-6" value={props.value.stackTrace} onChange={(event) => props.setValue({ ...props.value, stackTrace: event.target.value })} /></label>
        <button className="action-primary mt-3" type="button" disabled={props.pending || props.value.stackTrace.length < 10} onClick={props.run}><Search className="h-4 w-4" /> Trace incident</button>
      </section>
      <section>
        <SectionTitle icon={Network} eyebrow="Blast radius" title={props.result?.title ?? "Awaiting incident evidence"} detail={props.result?.summary ?? "Mapped source locations and a graph-aware runbook will appear here."} />
        {props.result ? <><div className="mt-4"><StatusBadge status={props.result.severity} /></div><div className="mt-5 divide-y divide-line border-y border-line">{props.result.matchedFiles.map((file) => <Link className="block py-3" key={file.path} to={"/projects/" + props.projectId + "/workspace?path=" + encodeURIComponent(file.path)}><div className="flex items-center justify-between gap-3"><span className="font-mono text-xs text-mint">{file.path}</span><span className="font-mono text-xs text-cyan">{Math.round(file.confidence * 100)}%</span></div><p className="mt-1 text-xs text-steel">{file.evidence}</p></Link>)}</div><h3 className="mt-6 font-semibold text-white">Response runbook</h3><ol className="mt-3 space-y-3">{props.result.runbook.map((item, index) => <Step key={item} number={String(index + 1).padStart(2, "0")} title={item} />)}</ol></> : <Empty text="Run a trace to create a source-linked incident report." />}
      </section>
    </div>
  );
}

function AutomationView(props: { objective: string; setObjective(value: string): void; result?: AutomationResult; run(): void; pending: boolean; projectId: string }) {
  return (
    <div>
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <label className="block text-xs text-steel">Natural-language mission<textarea className="field mt-1 min-h-24 resize-y text-sm leading-6" value={props.objective} onChange={(event) => props.setObjective(event.target.value)} /></label>
        <button className="action-primary lg:mb-0.5" type="button" disabled={props.pending || props.objective.length < 8} onClick={props.run}><Sparkles className="h-4 w-4" /> Build guarded mission</button>
      </div>
      {props.result ? <div className="mt-8 grid gap-8 xl:grid-cols-2"><section><SectionTitle icon={Workflow} eyebrow="Execution plan" title={props.result.objective} detail={"Risk: " + props.result.plan.risk + ". Every step retains repository evidence."} /><div className="mt-5 divide-y divide-line border-y border-line">{props.result.plan.steps.map((step, index) => <div className="py-4" key={step.id}><div className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center border border-violet/40 font-mono text-xs text-violet">{index + 1}</span><div><div className="font-semibold text-white">{step.title}</div><p className="mt-1 text-sm leading-6 text-steel">{step.detail}</p><p className="mt-2 text-xs text-cyan">{step.evidence}</p></div></div></div>)}</div></section><section><SectionTitle icon={ShieldCheck} eyebrow="Guard rails" title={"Verification: " + props.result.sandbox.status} detail={props.result.review.summary} /><div className="mt-5 divide-y divide-line border-y border-line">{props.result.sandbox.checks.map((check) => <div className="py-3" key={check.id}><div className="flex items-center gap-2"><StatusIcon status={check.status} /><span className="text-sm font-semibold text-white">{check.label}</span></div><p className="mt-1 text-xs text-steel">{check.detail}</p></div>)}</div>{props.result.plan.targetFiles[0] && <Link className="action-primary mt-5 inline-flex" to={"/projects/" + props.projectId + "/assistant?path=" + encodeURIComponent(props.result.plan.targetFiles[0]) + "&prompt=" + encodeURIComponent("Implement this reviewed objective with the smallest safe patch: " + props.result.objective)}><Bot className="h-4 w-4" /> Draft in assistant</Link>}</section></div> : <Empty text="Describe a repository change to produce a scoped plan, virtual verification, risk review, and targeted tests." />}
    </div>
  );
}

function FuturesView(props: {
  objective: string;
  setObjective(value: string): void;
  simulation?: RepositoryFutureSimulation;
  simulationRunId?: string;
  reconciliation?: FutureReconciliation;
  selectedFutureId: RepositoryFuture["id"];
  setSelectedFutureId(value: RepositoryFuture["id"]): void;
  observedFiles: string[];
  projectId: string;
  simulate(): void;
  reconcile(runId: string, futureId: RepositoryFuture["id"]): void;
  pending: boolean;
}) {
  const selected = props.simulation?.futures.find((future) => future.id === props.selectedFutureId) ?? props.simulation?.futures[0];
  return (
    <div>
      <div className="grid gap-7 xl:grid-cols-[1.25fr_0.75fr] xl:items-end">
        <section>
          <SectionTitle
            icon={Sparkles}
            eyebrow="Self-calibrating change twin"
            title="Explore the codebase before it exists"
            detail="Describe one engineering outcome. CodeMesh creates three competing implementation futures, freezes their assumptions in a prediction receipt, and learns when reality arrives."
          />
          <label className="mt-5 block text-xs text-steel">
            Outcome to model
            <textarea
              className="field mt-1 min-h-28 resize-y text-sm leading-6"
              value={props.objective}
              onChange={(event) => props.setObjective(event.target.value)}
            />
          </label>
          <button className="action-primary mt-3" type="button" disabled={props.pending || props.objective.trim().length < 12} onClick={props.simulate}>
            <Sparkles className={"h-4 w-4 " + (props.pending ? "animate-pulse" : "")} /> {props.simulation ? "Simulate again" : "Simulate three futures"}
          </button>
        </section>
        <section className="cm-future-principle">
          <div className="eyebrow"><Network className="h-3.5 w-3.5" /> Closed evidence loop</div>
          <ol className="mt-4 space-y-4">
            <Step number="01" title="Forecast" detail="Compare distinct implementation strategies against the current graph." />
            <Step number="02" title="Freeze" detail="Record confidence, ranges, assumptions, revision, and evidence before editing." />
            <Step number="03" title="Reconcile" detail="Score prediction against the implemented files and tune later confidence." />
          </ol>
        </section>
      </div>

      {!props.simulation ? (
        <div className="cm-future-empty mt-8">
          <div className="cm-future-pulse" aria-hidden="true"><Sparkles className="h-6 w-6" /></div>
          <h3 className="mt-5 text-lg font-semibold text-white">No future has been observed yet</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-steel">Run the simulator to produce a surgical patch, a boundary redesign, and a compatibility bridge from the same objective.</p>
        </div>
      ) : (
        <>
          <div className="cm-future-receipt mt-8">
            <div>
              <div className="text-[10px] uppercase text-steel">Prediction receipt</div>
              <div className="mt-1 font-mono text-sm text-white">{props.simulation.receipt.id}</div>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-steel">{props.simulation.receipt.statement}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
              <ReceiptMetric label="Revision" value={props.simulation.baseline.revision.slice(0, 9)} />
              <ReceiptMetric label="Health" value={props.simulation.baseline.healthScore + "/100"} />
              <ReceiptMetric label="Graph links" value={String(props.simulation.baseline.relationships)} />
              <ReceiptMetric label="Prior checks" value={String(props.simulation.calibration.samples)} />
            </div>
          </div>

          <div className="cm-future-grid mt-6">
            {props.simulation.futures.map((future) => {
              const recommended = future.id === props.simulation?.recommendation.futureId;
              const active = future.id === selected?.id;
              return (
                <button
                  className={"cm-future-card " + (active ? "is-active" : "")}
                  key={future.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => props.setSelectedFutureId(future.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-left">
                      <div className="text-[10px] uppercase text-steel">{future.strategy}</div>
                      <h3 className="mt-1 font-semibold text-white">{future.name}</h3>
                    </div>
                    <div className="cm-future-score">{future.compositeScore}</div>
                  </div>
                  <p className="mt-3 text-left text-xs leading-5 text-steel">{future.thesis}</p>
                  <div className="mt-4 flex items-center justify-between gap-3 text-[10px] uppercase text-steel"><span>Confidence</span><span className="font-mono text-cyan">{future.confidence}%</span></div>
                  <div className="cm-confidence-track mt-1"><span style={{ width: future.confidence + "%" }} /></div>
                  <div className="mt-4 flex flex-wrap items-center gap-2"><StatusBadge status={future.risk} />{recommended && <span className="border border-violet/40 bg-violet/5 px-2 py-1 font-mono text-[10px] uppercase text-violet">recommended</span>}</div>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="mt-8 grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
              <section>
                <SectionTitle icon={Network} eyebrow="Selected future" title={selected.name} detail={props.simulation.recommendation.reason} />
                <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
                  <ForecastMetric label="Changed files" range={selected.predicted.changedFiles} tone="text-cyan" />
                  <ForecastMetric label="Impact radius" range={selected.predicted.impactedFiles} tone="text-violet" />
                  <ForecastMetric label="Graph delta" range={selected.predicted.relationshipDelta} signed tone="text-amber" />
                  <ForecastMetric label="Health delta" range={selected.predicted.healthDelta} signed tone="text-mint" />
                  <ForecastMetric label="New tests" range={selected.predicted.testAdditions} tone="text-coral" />
                  <ForecastMetric label="Review minutes" range={selected.predicted.reviewMinutes} tone="text-white" />
                </div>
                <div className="mt-7 grid gap-6 md:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Predicted edit surface</h3>
                    <div className="mt-2 border-y border-line">
                      {selected.targetFiles.map((path) => <Link className="block truncate border-b border-line py-2 font-mono text-[11px] text-mint last:border-0 hover:text-white" key={path} to={"/projects/" + props.projectId + "/workspace?path=" + encodeURIComponent(path)}>{path}</Link>)}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Implementation sequence</h3>
                    <ol className="mt-3 space-y-3">{selected.sequence.map((item, index) => <Step key={item} number={String(index + 1).padStart(2, "0")} title={item} />)}</ol>
                  </div>
                </div>
                <div className="mt-7 border-l-2 border-amber pl-4">
                  <div className="text-xs font-semibold uppercase text-amber">Uncertainty: {props.simulation.uncertainty.level}</div>
                  {props.simulation.uncertainty.drivers.map((driver) => <p className="mt-2 text-xs leading-5 text-steel" key={driver}>{driver}</p>)}
                </div>
              </section>

              <section>
                <SectionTitle icon={RefreshCw} eyebrow="Reality reconciliation" title="Make the forecast answer for itself" detail="The currently selected PR files become observed implementation evidence. CodeMesh compares measurable outcomes with the frozen forecast bands." />
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Mini label="Observed files" value={String(props.observedFiles.length)} tone="text-cyan" />
                  <Mini label="Reversibility" value={selected.reversibility + "%"} tone="text-mint" />
                  <Mini label="Effort points" value={String(selected.effortPoints)} tone="text-amber" />
                  <Mini label="Receipt evidence" value={String(props.simulation.receipt.evidenceFiles.length)} tone="text-violet" />
                </div>
                <button
                  className="action-primary mt-6"
                  type="button"
                  disabled={props.pending || !props.simulationRunId || props.observedFiles.length === 0}
                  onClick={() => props.simulationRunId && props.reconcile(props.simulationRunId, selected.id)}
                >
                  <RefreshCw className={"h-4 w-4 " + (props.pending ? "animate-spin" : "")} /> Reconcile with selected files
                </button>
                {props.observedFiles.length === 0 && <p className="mt-3 text-xs leading-5 text-amber">Select implemented files in PR Review first. CodeMesh will not invent an outcome without observed evidence.</p>}
                <div className="mt-6 border-y border-line py-4">
                  <div className="text-[10px] uppercase text-steel">Architecture signature</div>
                  <code className="mt-1 block font-mono text-xs text-cyan">{props.simulation.receipt.architectureSignature}</code>
                </div>
              </section>
            </div>
          )}

          {props.reconciliation && (
            <section className="cm-reconciliation mt-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <SectionTitle icon={CheckCircle2} eyebrow="Prediction outcome" title={props.reconciliation.status === "calibrated" ? "Reality scored the forecast" : "Waiting for implementation evidence"} detail={props.reconciliation.summary} />
                <div className="cm-reconciliation-score"><strong>{props.reconciliation.calibrationScore ?? "--"}</strong><span>accuracy</span></div>
              </div>
              {props.reconciliation.dimensions.length > 0 && <div className="mt-6 grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-5">{props.reconciliation.dimensions.map((dimension) => <div className="bg-panel p-4" key={dimension.label}><div className="flex items-center justify-between gap-2"><span className="text-xs text-steel">{dimension.label}</span><StatusIcon status={dimension.status === "inside" ? "pass" : "attention"} /></div><div className="mt-3 font-mono text-lg text-white">{dimension.actual}</div><div className="mt-1 font-mono text-[10px] text-cyan">forecast {formatRange(dimension.predicted)}</div><div className="mt-3 h-1 bg-ink"><span className={dimension.status === "inside" ? "block h-full bg-mint" : "block h-full bg-amber"} style={{ width: dimension.score + "%" }} /></div></div>)}</div>}
              <div className="mt-5 grid gap-5 md:grid-cols-[auto_1fr] md:items-start">
                <div className="border-l-2 border-violet pl-4"><div className="text-[10px] uppercase text-steel">Confidence update</div><div className="mt-1 font-mono text-sm text-white">{props.reconciliation.confidenceBefore}% → {props.reconciliation.confidenceAfter}%</div></div>
                <div>{props.reconciliation.lessons.map((lesson) => <p className="mb-2 text-xs leading-5 text-steel last:mb-0" key={lesson}>{lesson}</p>)}</div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ReceiptMetric({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[9px] uppercase text-steel">{label}</div><div className="mt-1 font-mono text-xs text-white">{value}</div></div>;
}

function ForecastMetric({ label, range, tone, signed = false }: { label: string; range: ForecastRange; tone: string; signed?: boolean }) {
  const value = signed ? `${formatSigned(range.min)} to ${formatSigned(range.max)}` : formatRange(range);
  return <div className="cm-forecast-metric"><div className="text-[9px] uppercase text-steel">{label}</div><div className={"mt-2 font-mono text-sm font-semibold " + tone}>{value}</div></div>;
}

function formatRange(range: ForecastRange) {
  return range.min === range.max ? String(range.min) : `${range.min}-${range.max}`;
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function ReportsView(props: { data: DeliveryPayload; label: string; setLabel(value: string): void; revealedShare: string; create(): void; revoke(id: string): void; pending: boolean }) {
  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <section>
        <SectionTitle icon={Share2} eyebrow="Evidence sharing" title="Publish a read-only report" detail="Create an expiring link containing architecture, repository health, and quality evidence. Source contents and credentials are never included." />
        <label className="mt-5 block text-xs text-steel">Report label<input className="field mt-1" value={props.label} onChange={(event) => props.setLabel(event.target.value)} /></label>
        <button className="action-primary mt-3" type="button" disabled={props.pending || props.label.length < 3} onClick={props.create}><Share2 className="h-4 w-4" /> Create 7-day link</button>
        {props.revealedShare && <SecretField label="Public report URL" value={props.revealedShare} />}
        <div className="mt-6 divide-y divide-line border-y border-line">{props.data.shares.map((share) => <div className="flex items-center gap-3 py-3" key={share.id}><Share2 className={"h-4 w-4 " + (share.revokedAt ? "text-steel" : "text-mint")} /><div className="min-w-0 flex-1"><div className="truncate text-sm text-white">{share.label}</div><div className="text-[10px] text-steel">Expires {new Date(share.expiresAt).toLocaleString()}</div></div>{!share.revokedAt && <button className="cm-icon-button" type="button" title="Revoke share link" onClick={() => props.revoke(share.id)}><Trash2 className="h-4 w-4" /></button>}</div>)}</div>
      </section>
      <section>
        <SectionTitle icon={BookOpen} eyebrow="Living documentation" title="Architecture generated from the graph" detail={props.data.documentation.entryPoints.length + " entry points and " + props.data.documentation.modules.length + " modules are documented from the current index."} />
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <ListBlock title="Entry points" items={props.data.documentation.entryPoints} />
          <ListBlock title="Most connected modules" items={props.data.documentation.modules.slice(0, 8).map((module) => module.name + " - " + module.relationships + " links")} />
        </div>
        <div className="mt-6 text-xs uppercase text-steel">Mermaid source</div>
        <pre className="cm-scrollbar mt-2 max-h-60 overflow-auto border border-line bg-ink p-4 font-mono text-xs leading-6 text-cyan">{props.data.documentation.mermaid}</pre>
      </section>
    </div>
  );
}

function OrganizationView(props: { data: DeliveryPayload; markRead(id: string): void }) {
  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <section>
        <SectionTitle icon={Building2} eyebrow="Organization controls" title="Identity, policy, and audit posture" detail={props.data.organization.memberCount + " members across " + props.data.organization.roles.length + " active project roles."} />
        <div className="mt-5 divide-y divide-line border-y border-line">{props.data.organization.controls.map((control) => <div className="flex items-center justify-between gap-4 py-4" key={control.label}><span className="text-sm text-white">{control.label}</span><StatusBadge status={control.status} /></div>)}</div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Mini label="OIDC" value={props.data.integrations.identity.oidc ? "Connected" : "Not configured"} tone={props.data.integrations.identity.oidc ? "text-mint" : "text-amber"} />
          <Mini label="SCIM" value={props.data.integrations.identity.scim ? "Connected" : "Not configured"} tone={props.data.integrations.identity.scim ? "text-mint" : "text-amber"} />
        </div>
      </section>
      <section>
        <SectionTitle icon={Bell} eyebrow="Engineering inbox" title="Delivery notifications" detail="Review runs, sync jobs, and security events are recorded for project members." />
        <div className="mt-5 divide-y divide-line border-y border-line">{props.data.notifications.map((item) => <button className={"block w-full py-4 text-left " + (!item.readAt ? "cm-unread-notification" : "")} key={item.id} type="button" onClick={() => !item.readAt && props.markRead(item.id)}><div className="flex items-center gap-2"><span className="font-semibold text-white">{item.title}</span>{!item.readAt && <span className="h-1.5 w-1.5 rounded-full bg-coral" />}</div><p className="mt-1 text-sm text-steel">{item.body}</p><div className="mt-2 font-mono text-[10px] uppercase text-cyan">{item.kind} / {new Date(item.createdAt).toLocaleString()}</div></button>)}{props.data.notifications.length === 0 && <div className="py-12 text-center text-sm text-steel">No delivery notifications yet.</div>}</div>
      </section>
    </div>
  );
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: string; icon: LucideIcon; tone: string }) {
  return <div className={"cm-delivery-metric " + tone}><Icon className="cm-tone-text h-4 w-4" /><div><div className="text-[10px] uppercase text-steel">{label}</div><div className="mt-1 truncate font-mono text-sm text-white">{value}</div></div></div>;
}

function SectionTitle({ icon: Icon, eyebrow, title, detail }: { icon: LucideIcon; eyebrow: string; title: string; detail: string }) {
  return <div><div className="eyebrow"><Icon className="h-3.5 w-3.5" /> {eyebrow}</div><h2 className="mt-2 text-xl font-semibold text-white">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-steel">{detail}</p></div>;
}

function Score({ score, status }: { score: number; status: string }) {
  return <div className="cm-review-score"><span className={status === "pass" ? "text-mint" : status === "block" ? "text-coral" : "text-amber"}>{score}</span><small>{status}</small></div>;
}

function StatusIcon({ status }: { status: string }) {
  return isGood(status) ? <CheckCircle2 className="h-4 w-4 shrink-0 text-mint" /> : <CircleAlert className={"h-4 w-4 shrink-0 " + (isBad(status) ? "text-coral" : "text-amber")} />;
}

function StatusText({ status }: { status: string }) {
  return <span className={"ml-auto font-mono text-[10px] uppercase " + (isGood(status) ? "text-mint" : isBad(status) ? "text-coral" : "text-amber")}>{status}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={"border px-2 py-1 font-mono text-[10px] uppercase " + (isGood(status) ? "border-mint/40 bg-mint/5 text-mint" : isBad(status) ? "border-coral/40 bg-coral/5 text-coral" : "border-amber/40 bg-amber/5 text-amber")}>{status.replaceAll("_", " ")}</span>;
}

function Mini({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className="border-l border-line py-1 pl-3"><div className="text-[10px] uppercase text-steel">{label}</div><div className={"mt-1 font-mono text-lg font-semibold " + tone}>{value}</div></div>;
}

function ListBlock({ title, items, projectId }: { title: string; items: string[]; projectId?: string }) {
  return <div><h3 className="text-sm font-semibold text-white">{title}</h3><div className="cm-scrollbar mt-2 max-h-52 overflow-auto border-y border-line">{items.map((item) => projectId ? <Link className="block truncate border-b border-line py-2 font-mono text-[11px] text-mint last:border-0 hover:text-white" key={item} to={"/projects/" + projectId + "/workspace?path=" + encodeURIComponent(item)}>{item}</Link> : <div className="truncate border-b border-line py-2 font-mono text-[11px] text-steel last:border-0" key={item}>{item}</div>)}{items.length === 0 && <div className="py-6 text-xs text-steel">No items in this set.</div>}</div></div>;
}

function Step({ number, title, detail }: { number: string; title: string; detail?: string }) {
  return <li className="flex gap-3"><span className="font-mono text-xs text-violet">{number}</span><div><div className="text-sm text-white">{title}</div>{detail && <p className="mt-1 text-xs leading-5 text-steel">{detail}</p>}</div></li>;
}

function SecretField({ label, value }: { label: string; value: string }) {
  return <div className="mt-4 border border-amber/35 bg-amber/5 p-3"><div className="text-xs text-amber">{label}</div><CopyRow value={value} /></div>;
}

function CopyRow({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return <div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 truncate font-mono text-xs text-white">{value}</code><button className="cm-icon-button shrink-0" type="button" title="Copy" onClick={() => void copy()}>{copied ? <CheckCircle2 className="h-4 w-4 text-mint" /> : <Copy className="h-4 w-4" />}</button></div>;
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="mt-4 border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{message}</div>;
}

function Empty({ text }: { text: string }) {
  return <div className="mt-5 border-y border-line py-14 text-center text-sm text-steel">{text}</div>;
}

function isGood(status: string) {
  return ["pass", "passed", "ready", "complete", "success", "low"].includes(status);
}

function isBad(status: string) {
  return ["block", "blocked", "failed", "critical", "high"].includes(status);
}
