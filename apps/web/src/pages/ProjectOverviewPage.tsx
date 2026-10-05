import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, Bot, BrainCircuit, Code2, FlaskConical, Gauge, GitBranch, GitFork, MessageSquare, Orbit, ServerCog, Settings, ShieldCheck, Split, Users, Waypoints } from "lucide-react";
import type { Permission, Project, ProjectMember, ProjectRole, PublicUser } from "@codemesh/shared";
import { LoadingState } from "../components/LoadingState";
import { StatusPill } from "../components/StatusPill";
import { api } from "../lib/api";

type ProjectDetails = {
  project: Project;
  role: ProjectRole | null;
  permissions: Permission[];
  members: Array<ProjectMember & { user: PublicUser | null }>;
  insights?: {
    fileCount: number;
    lineCount: number;
    graphNodes: number;
    graphEdges: number;
    languages: string[];
  };
};

export function ProjectOverviewPage() {
  const { projectId = "" } = useParams();
  const details = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api<ProjectDetails>(`/api/projects/${projectId}`)
  });
  const data = details.data;

  if (details.isLoading) return <LoadingState label="Loading project command center" />;
  if (!data) return <div className="mx-auto max-w-7xl px-4 py-8 text-coral">Project could not be loaded.</div>;
  const insights = data.insights ?? {
    fileCount: 0,
    lineCount: 0,
    graphNodes: 0,
    graphEdges: 0,
    languages: data.project.languages
  };

  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className="surface-panel cm-hero-panel overflow-hidden p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="eyebrow"><GitFork className="h-3.5 w-3.5" /> Repository command center</div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="mt-2 text-3xl font-bold text-white">{data.project.name}</h1>
              <StatusPill tone={data.project.visibility === "public" ? "good" : "warn"}>{data.project.visibility}</StatusPill>
              {data.role && <StatusPill>{data.role}</StatusPill>}
            </div>
            <p className="mt-3 max-w-3xl leading-7 text-steel">{data.project.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link className="flex items-center gap-2 rounded bg-mint px-4 py-2 font-semibold text-ink hover:bg-mint/90" to={`/projects/${projectId}/universe`}>
              <Orbit className="h-4 w-4" />
              Enter universe
            </Link>
            <Link className="rounded border border-line px-4 py-2 font-semibold text-white hover:border-mint" to={`/projects/${projectId}/workspace`}>
              Open workspace
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={Code2} label="Indexed files" value={String(insights.fileCount)} tone="cm-tone-cyan" />
          <Metric icon={Activity} label="Source lines" value={formatNumber(insights.lineCount)} tone="cm-tone-violet" />
          <Metric icon={Waypoints} label="Graph links" value={formatNumber(insights.graphEdges)} tone="cm-tone-coral" />
          <Metric icon={Users} label="Members" value={String(data.members.length)} tone="cm-tone-amber" />
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="cm-stagger grid self-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[
          { icon: Orbit, label: "Code Universe", to: "universe", tone: "cm-tone-cyan", detail: "Enter the living architecture and follow dependency paths." },
          { icon: Bot, label: "AI Assistant", to: "assistant", tone: "cm-tone-violet", detail: "Ask, investigate, and draft changes." },
          { icon: BrainCircuit, label: "Intelligence", to: "intelligence", tone: "cm-tone-rose", detail: "Inspect health, search, and repository signals." },
          { icon: FlaskConical, label: "Engineering Labs", to: "labs", tone: "cm-tone-amber", detail: "Simulate impact and review repository evidence." },
          { icon: Orbit, label: "Advanced Operations", to: "advanced", tone: "cm-tone-violet", detail: "Plan, trace, gate, secure, and evaluate changes." },
          { icon: Gauge, label: "Mesh Control Room", to: "control-room", tone: "cm-tone-coral", detail: "Bring sync, security, Copilot, tasks, and team signals together." },
          ...(data.permissions.includes("project.manage") ? [{ icon: ServerCog, label: "Production Center", to: "operations", tone: "cm-tone-cyan", detail: "Operate persistence, SLOs, jobs, integrations, and release gates." }] : []),
          { icon: MessageSquare, label: "Discussions", to: "discussions", tone: "cm-tone-cyan", detail: "Keep technical decisions visible to the team." },
          { icon: Split, label: "Tasks", to: "tasks", tone: "cm-tone-amber", detail: "Plan and track focused engineering work." },
          { icon: GitBranch, label: "Contributions", to: "contributions", tone: "cm-tone-coral", detail: "Review patches and contribution history." },
          { icon: Settings, label: "Settings", to: "settings", tone: "cm-tone-mint", detail: "Import sources and manage access." }
        ].map((item) => (
          <Link key={item.to} className={`surface-panel cm-accent-card ${item.tone} p-4 text-white`} data-reveal to={`/projects/${projectId}/${item.to}`}>
            <item.icon className="cm-icon-motion h-5 w-5" />
            <div className="mt-3 font-semibold">{item.label}</div>
            <div className="mt-1 text-xs leading-5 text-steel">{item.detail}</div>
          </Link>
        ))}
        </div>
        <div className="surface-panel cm-accent-card cm-tone-cyan self-start p-4" data-reveal>
          <div className="flex items-center justify-between">
            <div className="eyebrow"><ShieldCheck className="h-3.5 w-3.5" /> Health signal</div>
            <span className="text-xs font-semibold text-mint">READY</span>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <HealthRow label="Source linked" value={data.project.repositorySource} />
            <HealthRow label="AI retrieval" value="Grounded" />
            <HealthRow label="Graph coverage" value={`${insights.graphNodes} nodes`} />
          </div>
          <div className="mt-4 space-y-3 border-t border-line pt-4">
            <HealthBar label="Source index" value={insights.fileCount > 0 ? 100 : 0} tone="cm-tone-cyan" />
            <HealthBar label="Graph density" value={healthScore(insights.graphEdges, insights.graphNodes)} tone="cm-tone-violet" />
            <HealthBar label="Language coverage" value={Math.min(100, insights.languages.length * 25)} tone="cm-tone-amber" />
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-4">
            {insights.languages.slice(0, 5).map((language) => <span key={language} className="rounded bg-ink px-2 py-1 font-mono text-[11px] text-steel">{language}</span>)}
          </div>
        </div>
      </div>
      <div className="surface-panel mt-5 p-5">
        <h2 className="font-semibold text-white">Contribution Guidelines</h2>
        <p className="mt-2 leading-7 text-steel">{data.project.guidelines}</p>
      </div>
    </section>
  );
}

function Metric({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone: string }) {
  return (
    <div className={`${tone} cm-tone-border border-l-2 py-1 pl-3`}>
      <Icon className="cm-icon-motion cm-tone-text h-4 w-4" />
      <div className="mt-2 text-xs uppercase tracking-wide text-steel">{label}</div>
      <div className="mt-1 truncate font-mono text-sm text-white">{value}</div>
    </div>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-steel">{label}</span><span className="font-mono text-xs text-white">{value}</span></div>;
}

function HealthBar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={tone}>
      <div className="flex items-center justify-between text-[11px]"><span className="text-steel">{label}</span><span className="font-mono text-white">{value}%</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink"><div className="cm-tone-fill h-full rounded-full transition-all duration-700" style={{ width: `${value}%` }} /></div>
    </div>
  );
}

function healthScore(edges: number, nodes: number) {
  if (nodes === 0) return 0;
  return Math.min(100, Math.round((edges / nodes) * 100));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}
