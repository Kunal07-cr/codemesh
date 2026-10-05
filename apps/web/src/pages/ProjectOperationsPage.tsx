import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Bot,
  Boxes,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Cloud,
  Database,
  Gauge,
  Github,
  HardDrive,
  Mail,
  Play,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Square,
  Workflow,
  Zap
} from "lucide-react";
import { LoadingState } from "../components/LoadingState";
import { api, jsonBody } from "../lib/api";

type JobType = "repository.reindex" | "quality.scan" | "persistence.verify" | "audit.export";
type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

type OperationsPayload = {
  project: { id: string; name: string; commitSha: string };
  generatedAt: string;
  readiness: { score: number; status: "production-ready" | "needs-attention" | "foundation"; passing: number; total: number };
  dependencies: Array<{ id: string; label: string; ok: boolean; configured: boolean; status: "ready" | "degraded" | "optional"; detail: string }>;
  serviceLevels: { availability: number; targetAvailability: number; errorRate: number; p50Ms: number; p95Ms: number; p99Ms: number; targetP95Ms: number; requestsInWindow: number; windowMinutes: number };
  queue: { mode: string; concurrency: number; active: number; queued: number };
  jobs: Array<{ id: string; type: JobType; status: JobStatus; progress: number; attempts: number; maxAttempts: number; createdAt: string; completedAt?: string; error?: string; output?: Record<string, unknown> }>;
  security: Array<{ id: string; label: string; pass: boolean; detail: string }>;
  releaseGates: Array<{ id: string; label: string; pass: boolean; detail: string }>;
  usage: { assistantRequests: number; contextTokens: number; averageRetrievalLatencyMs: number; averageGenerationLatencyMs: number; configuredLimitPerMinute: number };
  integrations: Record<string, { configured: boolean; active?: boolean; connected?: boolean; repositoryUrl?: string; path?: string }>;
};

const operationActions: Array<{ type: JobType; label: string; detail: string; icon: typeof RefreshCw; tone: string }> = [
  { type: "repository.reindex", label: "Rebuild index", detail: "Regenerate symbols, chunks, and graph links.", icon: RefreshCw, tone: "cm-tone-cyan" },
  { type: "quality.scan", label: "Quality scan", detail: "Recalculate repository health and critical findings.", icon: ShieldCheck, tone: "cm-tone-amber" },
  { type: "persistence.verify", label: "Verify storage", detail: "Write and health-check the active persistence layer.", icon: Database, tone: "cm-tone-violet" },
  { type: "audit.export", label: "Seal audit log", detail: "Generate a count and SHA-256 digest for audit records.", icon: HardDrive, tone: "cm-tone-rose" }
];

export function ProjectOperationsPage() {
  const { projectId = "" } = useParams();
  const queryClient = useQueryClient();
  const operations = useQuery({
    queryKey: ["production-operations", projectId],
    queryFn: () => api<OperationsPayload>(`/api/projects/${projectId}/operations`),
    refetchInterval: (query) => query.state.data?.jobs.some((job) => job.status === "queued" || job.status === "running") ? 1_500 : 10_000
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["production-operations", projectId] });
  const launch = useMutation({
    mutationFn: (type: JobType) => api(`/api/projects/${projectId}/operations/jobs`, { method: "POST", body: jsonBody({ type }) }),
    onSuccess: () => void refresh()
  });
  const cancel = useMutation({
    mutationFn: (jobId: string) => api(`/api/projects/${projectId}/operations/jobs/${jobId}`, { method: "DELETE" }),
    onSuccess: () => void refresh()
  });
  const data = operations.data;

  if (operations.isLoading) return <LoadingState label="Opening Production Center" />;
  if (!data) return <div className="mx-auto max-w-7xl px-4 py-8 text-coral">Production Center requires project management access.</div>;

  const scoreTone = data.readiness.score >= 85 ? "text-mint" : data.readiness.score >= 60 ? "text-amber" : "text-coral";

  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <Link className="inline-flex items-center gap-1 text-xs text-steel hover:text-white" to={`/projects/${projectId}`}><ArrowLeft className="h-3.5 w-3.5" /> Project</Link>
          <div className="eyebrow mt-4"><ServerCog className="h-3.5 w-3.5" /> Production Center</div>
          <h1 className="mt-2 text-3xl font-bold text-white">Ship with evidence, operate with signals.</h1>
          <p className="mt-2 max-w-3xl leading-7 text-steel">One operational view for persistence, scaling, security, release gates, service levels, integrations, and repeatable maintenance work.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="cm-ops-score" style={{ background: `conic-gradient(var(--cm-accent) ${data.readiness.score * 3.6}deg, #1b2734 0deg)` }} aria-label={`Production readiness ${data.readiness.score} percent`}>
            <div><strong className={scoreTone}>{data.readiness.score}</strong><span>readiness</span></div>
          </div>
          <div><div className={`font-mono text-xs uppercase ${scoreTone}`}>{data.readiness.status.replace("-", " ")}</div><div className="mt-1 text-xs text-steel">{data.readiness.passing}/{data.readiness.total} controls passing</div></div>
        </div>
      </div>

      <div className="cm-stagger mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Signal icon={Gauge} label="Availability" value={formatPercent(data.serviceLevels.availability)} detail={`${data.serviceLevels.windowMinutes} minute window`} tone="cm-tone-mint" />
        <Signal icon={Zap} label="p95 latency" value={`${data.serviceLevels.p95Ms} ms`} detail={`target < ${data.serviceLevels.targetP95Ms} ms`} tone="cm-tone-cyan" />
        <Signal icon={Workflow} label="Operations" value={`${data.queue.active} active`} detail={`${data.queue.queued} queued · ${data.queue.concurrency} workers`} tone="cm-tone-violet" />
        <Signal icon={Bot} label="Assistant usage" value={String(data.usage.assistantRequests)} detail={`${formatNumber(data.usage.contextTokens)} context tokens`} tone="cm-tone-rose" />
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
        <section>
          <SectionTitle icon={Cloud} eyebrow="Runtime topology" title="Service dependencies" detail="Live adapter state from this running CodeMesh instance." />
          <div className="mt-4 divide-y divide-line border-y border-line">
            {data.dependencies.map((dependency, index) => <DependencyRow key={dependency.id} dependency={dependency} index={index} />)}
          </div>
        </section>
        <section>
          <SectionTitle icon={Activity} eyebrow="Service levels" title="Current request window" detail={`${data.serviceLevels.requestsInWindow} measured requests. Empty windows start at a neutral baseline.`} />
          <div className="mt-5 space-y-5">
            <Slo label="Availability" value={data.serviceLevels.availability * 100} target={data.serviceLevels.targetAvailability * 100} suffix="%" good={data.serviceLevels.availability >= data.serviceLevels.targetAvailability} />
            <Slo label="Error-free requests" value={(1 - data.serviceLevels.errorRate) * 100} target={99} suffix="%" good={data.serviceLevels.errorRate <= 0.01} />
            <Slo label="p95 latency budget" value={Math.max(0, 100 - (data.serviceLevels.p95Ms / Math.max(1, data.serviceLevels.targetP95Ms)) * 100)} target={20} suffix="% remaining" good={data.serviceLevels.p95Ms <= data.serviceLevels.targetP95Ms} />
          </div>
          <div className="mt-6 grid grid-cols-3 divide-x divide-line border-y border-line py-3 text-center">
            <MiniMetric label="p50" value={`${data.serviceLevels.p50Ms}ms`} />
            <MiniMetric label="p95" value={`${data.serviceLevels.p95Ms}ms`} />
            <MiniMetric label="p99" value={`${data.serviceLevels.p99Ms}ms`} />
          </div>
        </section>
      </div>

      <section className="mt-10">
        <SectionTitle icon={ServerCog} eyebrow="Runbook actions" title="Durable operations" detail="Jobs persist across restarts, retry failures, expose progress, and remain auditable." />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {operationActions.map((action) => { const Icon = action.icon; return <button key={action.type} className={`surface-panel cm-accent-card ${action.tone} min-h-36 p-4 text-left`} type="button" disabled={launch.isPending} onClick={() => launch.mutate(action.type)}><Icon className={`cm-tone-text h-5 w-5 ${launch.isPending && launch.variables === action.type ? "animate-spin" : ""}`} /><strong className="mt-4 block text-sm text-white">{action.label}</strong><span className="mt-1 block text-xs leading-5 text-steel">{action.detail}</span><span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-mint"><Play className="h-3 w-3" /> Queue operation</span></button>; })}
        </div>
        {launch.error instanceof Error && <ErrorBanner message={launch.error.message} />}
        <div className="cm-scrollbar mt-5 overflow-x-auto border-y border-line">
          <table className="cm-ops-table w-full min-w-[760px] text-left">
            <thead><tr><th>Operation</th><th>Status</th><th>Progress</th><th>Attempts</th><th>Created</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{data.jobs.map((job) => <JobRow key={job.id} job={job} onCancel={() => cancel.mutate(job.id)} cancelling={cancel.isPending && cancel.variables === job.id} />)}{data.jobs.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-sm text-steel">No maintenance operations have been queued yet.</td></tr>}</tbody>
          </table>
        </div>
      </section>

      <div className="mt-10 grid gap-8 xl:grid-cols-2">
        <CheckSection icon={ShieldCheck} eyebrow="Security posture" title="Platform controls" checks={data.security} />
        <CheckSection icon={CheckCircle2} eyebrow="Release policy" title="Deployment gates" checks={data.releaseGates} />
      </div>

      <section className="mt-10">
        <SectionTitle icon={Boxes} eyebrow="External systems" title="Integration matrix" detail="Configured means credentials exist; active means the running adapter has connected successfully." />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(data.integrations).map(([name, integration]) => <Integration key={name} name={name} integration={integration} />)}
        </div>
      </section>
    </section>
  );
}

function Signal({ icon: Icon, label, value, detail, tone }: { icon: typeof Gauge; label: string; value: string; detail: string; tone: string }) {
  return <div className={`surface-panel cm-accent-card ${tone} p-4`} data-reveal><div className="flex items-center justify-between"><Icon className="cm-tone-text h-5 w-5" /><span className="cm-pulse-dot h-2 w-2 rounded-full bg-current opacity-70" /></div><div className="mt-4 text-xs uppercase text-steel">{label}</div><div className="mt-1 text-2xl font-bold text-white">{value}</div><div className="mt-1 text-xs text-steel">{detail}</div></div>;
}

function SectionTitle({ icon: Icon, eyebrow, title, detail }: { icon: typeof Cloud; eyebrow: string; title: string; detail: string }) {
  return <div><div className="eyebrow"><Icon className="h-3.5 w-3.5" /> {eyebrow}</div><h2 className="mt-2 text-xl font-semibold text-white">{title}</h2><p className="mt-1 text-sm leading-6 text-steel">{detail}</p></div>;
}

function DependencyRow({ dependency, index }: { dependency: OperationsPayload["dependencies"][number]; index: number }) {
  const icons = [Database, Zap, HardDrive, Bot, Github, Mail];
  const Icon = icons[index % icons.length]!;
  return <div className="grid gap-3 py-4 sm:grid-cols-[2.2rem_minmax(0,1fr)_auto] sm:items-center"><span className={`grid h-9 w-9 place-items-center border ${dependency.ok ? "border-mint/30 text-mint" : dependency.configured ? "border-coral/30 text-coral" : "border-line text-steel"}`}><Icon className="h-4 w-4" /></span><div><div className="text-sm font-semibold text-white">{dependency.label}</div><div className="mt-1 text-xs leading-5 text-steel">{dependency.detail}</div></div><Status status={dependency.status} /></div>;
}

function Slo({ label, value, target, suffix, good }: { label: string; value: number; target: number; suffix: string; good: boolean }) {
  const width = Math.max(0, Math.min(100, value));
  return <div><div className="flex items-center justify-between gap-3 text-xs"><span className="text-steel">{label}</span><span className={good ? "text-mint" : "text-amber"}>{value.toFixed(value >= 99 ? 2 : 0)}{suffix} <span className="text-steel">/ {target}{suffix}</span></span></div><div className="mt-2 h-2 overflow-hidden bg-ink"><div className={`cm-ops-progress h-full ${good ? "bg-mint" : "bg-amber"}`} style={{ width: `${width}%` }} /></div></div>;
}

function MiniMetric({ label, value }: { label: string; value: string }) { return <div><div className="font-mono text-sm text-white">{value}</div><div className="mt-1 text-[10px] uppercase text-steel">{label}</div></div>; }

function JobRow({ job, onCancel, cancelling }: { job: OperationsPayload["jobs"][number]; onCancel(): void; cancelling: boolean }) {
  const active = job.status === "queued" || job.status === "running";
  return <tr><td><div className="font-mono text-xs text-white">{job.type}</div>{job.error && <div className="mt-1 max-w-xs truncate text-[10px] text-coral" title={job.error}>{job.error}</div>}</td><td><Status status={job.status} /></td><td><div className="flex min-w-32 items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden bg-ink"><div className={`cm-ops-progress h-full ${job.status === "failed" ? "bg-coral" : job.status === "succeeded" ? "bg-mint" : "bg-violet"}`} style={{ width: `${job.progress}%` }} /></div><span className="w-8 font-mono text-[10px] text-steel">{job.progress}%</span></div></td><td className="font-mono text-xs text-steel">{job.attempts}/{job.maxAttempts}</td><td className="text-xs text-steel">{new Date(job.createdAt).toLocaleString()}</td><td>{active && <button className="grid h-8 w-8 place-items-center border border-line text-steel hover:border-coral hover:text-coral" type="button" title="Cancel operation" disabled={cancelling} onClick={onCancel}>{cancelling ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}</button>}</td></tr>;
}

function CheckSection({ icon: Icon, eyebrow, title, checks }: { icon: typeof ShieldCheck; eyebrow: string; title: string; checks: OperationsPayload["security"] }) {
  return <section><SectionTitle icon={Icon} eyebrow={eyebrow} title={title} detail={`${checks.filter((item) => item.pass).length} of ${checks.length} controls currently pass.`} /><div className="mt-4 divide-y divide-line border-y border-line">{checks.map((item) => <div key={item.id} className="flex gap-3 py-4">{item.pass ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-mint" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber" />}<div><div className="text-sm font-semibold text-white">{item.label}</div><p className="mt-1 text-xs leading-5 text-steel">{item.detail}</p></div></div>)}</div></section>;
}

function Integration({ name, integration }: { name: string; integration: OperationsPayload["integrations"][string] }) {
  const icons: Record<string, typeof Cloud> = { github: Github, postgres: Database, redis: Zap, objectStorage: HardDrive, email: Mail, metrics: Activity };
  const Icon = icons[name] ?? Cloud;
  const active = integration.active ?? integration.connected ?? integration.configured;
  return <div className="surface-panel cm-accent-card cm-tone-cyan p-4"><div className="flex items-center justify-between"><Icon className="cm-tone-text h-5 w-5" /><Status status={active ? "active" : integration.configured ? "configured" : "optional"} /></div><div className="mt-4 text-sm font-semibold capitalize text-white">{name.replace(/([A-Z])/g, " $1")}</div><div className="mt-1 truncate font-mono text-[10px] text-steel" title={integration.repositoryUrl ?? integration.path}>{integration.repositoryUrl ?? integration.path ?? (integration.configured ? "Credentials configured" : "Not configured")}</div></div>;
}

function Status({ status }: { status: string }) {
  const good = ["ready", "succeeded", "active", "production-ready"].includes(status);
  const bad = ["failed", "degraded"].includes(status);
  return <span className={`inline-flex w-fit items-center gap-1 border px-2 py-1 font-mono text-[10px] uppercase ${good ? "border-mint/30 bg-mint/5 text-mint" : bad ? "border-coral/30 bg-coral/5 text-coral" : "border-line text-steel"}`}>{status === "running" && <Clock3 className="h-3 w-3 animate-pulse" />}{status.replace("-", " ")}</span>;
}

function ErrorBanner({ message }: { message: string }) { return <div className="mt-3 border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{message}</div>; }
function formatPercent(value: number) { return `${(value * 100).toFixed(value >= 0.999 ? 2 : 1)}%`; }
function formatNumber(value: number) { return new Intl.NumberFormat().format(value); }
