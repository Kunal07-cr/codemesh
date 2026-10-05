import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  CircleGauge,
  Clock3,
  Code2,
  FileCode2,
  FolderSearch,
  GitBranch,
  GitCompareArrows,
  Github,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  Network,
  Plus,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Trash2,
  UsersRound,
  Waypoints,
  Workflow,
  Zap
} from "lucide-react";
import type { Contribution, DiscussionThread, Project, ProjectTask } from "@codemesh/shared";
import { LoadingState } from "../components/LoadingState";
import { StatusPill } from "../components/StatusPill";
import { api, jsonBody } from "../lib/api";
import { relativeTime } from "../lib/format";

type ProjectPayload = {
  project: Project;
  role: string | null;
  insights: { fileCount: number; lineCount: number; graphNodes: number; graphEdges: number; languages: string[] };
};

type IntelligencePayload = {
  health: { score: number; issues: Array<{ severity: "info" | "warning" | "critical"; title: string; filePath?: string }> };
  integrations: { github: { connected: boolean; repositoryUrl?: string }; ai: { provider: string; retrieval: string } };
};

type AdvancedPayload = {
  project: { commitSha: string };
  pullRequestRisk: { score: number; status: "pass" | "review" | "block"; changedFiles: string[] };
  security: {
    score: number;
    secrets: Array<{ id: string; severity: "warning" | "critical"; filePath: string; line: number; title: string }>;
    dangerousApis: Array<{ id: string; filePath: string; line: number; api: string }>;
    sbom: Array<{ name: string; version: string; ecosystem: string }>;
  };
  runs: Array<{ id: string; objective: string; status: "pass" | "attention" | "blocked"; createdAt: string }>;
  aiEvaluation: { groundedRetrievalRate: number; averageLatencyMs: number };
};

type LabsPayload = {
  project: { commitSha: string };
  evolution: {
    snapshots: Array<{ id: string; commitSha: string; createdAt: string; nodeCount: number; edgeCount: number }>;
    addedNodes: Array<{ id: string; label: string }>;
    removedNodes: Array<{ id: string; label: string }>;
    addedEdges: number;
    removedEdges: number;
  };
  qualityTimeline: Array<{ score: number; coverageEstimate: number; criticalFindings: number; createdAt: string }>;
  hotspots: Array<{ filePath: string; score: number; reason: string }>;
  documentation: { entryPoints: string[]; files: number; symbols: number; relationships: number };
};

type RepoFileSummary = { path: string; language: string; size: number; binary: boolean; sensitive: boolean };

type ContributionsPayload = {
  contributions: Contribution[];
  patches: Array<{ id: string; title: string; status: string; files: Array<{ path: string }> }>;
  github: { configured: boolean; message: string };
};

const pulseBars = ["cyan", "violet", "mint", "coral", "amber", "cyan", "rose", "mint", "violet", "coral", "amber", "cyan"];
const taskStatuses: ProjectTask["status"][] = ["todo", "doing", "review", "done"];

export function ProjectControlRoomPage() {
  const { projectId = "" } = useParams();
  const queryClient = useQueryClient();
  const [fileFilter, setFileFilter] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskMessage, setTaskMessage] = useState("");
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);

  const project = useQuery({
    queryKey: ["control-project", projectId],
    queryFn: () => api<ProjectPayload>(`/api/projects/${projectId}`),
    enabled: Boolean(projectId)
  });
  const intelligence = useQuery({
    queryKey: ["control-intelligence", projectId],
    queryFn: () => api<IntelligencePayload>(`/api/projects/${projectId}/intelligence`),
    enabled: Boolean(projectId)
  });
  const advanced = useQuery({
    queryKey: ["control-advanced", projectId],
    queryFn: () => api<AdvancedPayload>(`/api/projects/${projectId}/advanced`),
    enabled: Boolean(projectId)
  });
  const labs = useQuery({
    queryKey: ["control-labs", projectId],
    queryFn: () => api<LabsPayload>(`/api/projects/${projectId}/labs`),
    enabled: Boolean(projectId)
  });
  const files = useQuery({
    queryKey: ["control-files", projectId],
    queryFn: () => api<RepoFileSummary[]>(`/api/projects/${projectId}/files`),
    enabled: Boolean(projectId)
  });
  const tasks = useQuery({
    queryKey: ["control-tasks", projectId],
    queryFn: () => api<ProjectTask[]>(`/api/projects/${projectId}/tasks`),
    enabled: Boolean(projectId)
  });
  const discussions = useQuery({
    queryKey: ["control-discussions", projectId],
    queryFn: () => api<DiscussionThread[]>(`/api/projects/${projectId}/discussions`),
    enabled: Boolean(projectId)
  });
  const contributions = useQuery({
    queryKey: ["control-contributions", projectId],
    queryFn: () => api<ContributionsPayload>(`/api/projects/${projectId}/contributions`),
    enabled: Boolean(projectId)
  });

  const createTask = useMutation({
    mutationFn: () => api<ProjectTask>(`/api/projects/${projectId}/tasks`, { method: "POST", body: jsonBody({ title: taskTitle }) }),
    onSuccess: (task) => {
      setTaskTitle("");
      setTaskMessage(`Added “${task.title}” to the delivery queue.`);
      void queryClient.invalidateQueries({ queryKey: ["control-tasks", projectId] });
    },
    onError: (error) => setTaskMessage(error instanceof Error ? error.message : "Task could not be added.")
  });
  const removeTask = useMutation({
    mutationFn: (task: ProjectTask) => api<{ deleted: true }>(`/api/projects/${projectId}/tasks/${task.id}`, { method: "DELETE" }),
    onSuccess: (_result, task) => {
      setTaskMessage(`Removed “${task.title}”.`);
      queryClient.setQueryData<ProjectTask[]>(["control-tasks", projectId], (current = []) => current.filter((candidate) => candidate.id !== task.id));
    },
    onError: (error) => setTaskMessage(error instanceof Error ? error.message : "Task could not be removed.")
  });
  const updateTask = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: ProjectTask["status"] }) => api<ProjectTask>(`/api/projects/${projectId}/tasks/${taskId}`, { method: "PATCH", body: jsonBody({ status }) }),
    onSuccess: (updated) => queryClient.setQueryData<ProjectTask[]>(["control-tasks", projectId], (current = []) => current.map((task) => task.id === updated.id ? updated : task))
  });

  const filteredFiles = useMemo(() => {
    const needle = fileFilter.trim().toLowerCase();
    return (files.data ?? []).filter((file) => !needle || `${file.path} ${file.language}`.toLowerCase().includes(needle));
  }, [fileFilter, files.data]);
  const allTasks = tasks.data ?? [];
  const openTasks = allTasks.filter((task) => task.status !== "done");
  const health = intelligence.data?.health.score ?? 0;
  const securityScore = advanced.data?.security.score ?? 0;
  const securityFindings = (advanced.data?.security.secrets.length ?? 0) + (advanced.data?.security.dangerousApis.length ?? 0);
  const issueCount = intelligence.data?.health.issues.length ?? 0;
  const riskScore = advanced.data?.pullRequestRisk.score ?? 0;
  const latestQuality = labs.data?.qualityTimeline.at(-1);
  const isRefreshing = [project, intelligence, advanced, labs, files, tasks, discussions, contributions].some((query) => query.isFetching);

  if (project.isLoading) return <LoadingState label="Opening mesh control room" />;
  if (!project.data) return <div className="mx-auto max-w-7xl px-4 py-8 text-coral">The mesh control room could not load this project.</div>;

  const data = project.data;
  const sourceLabel = data.project.repositorySource === "github" ? "GitHub sync" : data.project.repositorySource === "zip" ? "ZIP workspace" : "Sample repository";
  const primaryFile = labs.data?.hotspots[0]?.filePath ?? files.data?.[0]?.path ?? "";

  async function refreshMesh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["control-project", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["control-intelligence", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["control-advanced", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["control-labs", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["control-files", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["control-tasks", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["control-discussions", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["control-contributions", projectId] })
    ]);
    setLastRefresh(Date.now());
  }

  function submitTask(event: FormEvent) {
    event.preventDefault();
    if (taskTitle.trim().length >= 3 && !createTask.isPending) createTask.mutate();
  }

  return (
    <section className="cm-control-room mx-auto max-w-7xl px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <Link className="inline-flex items-center gap-2 text-xs text-steel hover:text-white" to={`/projects/${projectId}`}><ArrowLeft className="h-3.5 w-3.5" /> Project overview</Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-steel">mesh control room / live</span>
      </div>

      <header className="cm-control-hero surface-panel mt-4 overflow-hidden p-5 md:p-7" data-reveal>
        <div className="cm-control-grid-lines" aria-hidden="true" />
        <div className="relative z-[1] grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-center">
          <div>
            <div className="eyebrow"><Zap className="h-3.5 w-3.5" /> Engineering control room <span className="cm-live-chip"><i /> live mesh</span></div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-white md:text-5xl">{data.project.name}</h1>
              <StatusPill tone={data.project.visibility === "public" ? "good" : "warn"}>{data.project.visibility}</StatusPill>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-steel md:text-base">One animated command surface for repository sync, code health, security, AI review, delivery work, and team signals.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link className="action-primary" to={`/projects/${projectId}/assistant${primaryFile ? `?path=${encodeURIComponent(primaryFile)}` : ""}`}><Bot className="h-4 w-4" /> Open Copilot</Link>
              <Link className="action-secondary" to={`/projects/${projectId}/workspace`}><Code2 className="h-4 w-4" /> Open workspace</Link>
              <Link className="action-secondary" to={`/projects/${projectId}/settings`}><Github className="h-4 w-4" /> Manage source</Link>
            </div>
          </div>
          <div className="cm-signal-console" aria-label="Live repository signal">
            <div className="flex items-center justify-between gap-3"><span className="eyebrow"><Activity className="h-3.5 w-3.5" /> Runtime pulse</span><span className="font-mono text-xs text-mint">{isRefreshing ? "SCANNING" : "NOMINAL"}</span></div>
            <div className="cm-pulse-bars" aria-hidden="true">{pulseBars.map((tone, index) => <span key={`${tone}-${index}`} className={`cm-pulse-bar cm-tone-${tone}`} style={{ "--bar-index": index, "--bar-height": `${30 + ((index * 17) % 62)}%` } as React.CSSProperties} />)}</div>
            <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3 text-xs">
              <div><span className="block text-steel">Source</span><strong className="mt-1 block text-white">{sourceLabel}</strong></div>
              <div><span className="block text-steel">Commit</span><strong className="mt-1 block truncate font-mono text-white">{shortSha(data.project.commitSha)}</strong></div>
              <div><span className="block text-steel">Role</span><strong className="mt-1 block text-white">{data.role ?? "viewer"}</strong></div>
            </div>
          </div>
        </div>
      </header>

      <div className="cm-control-commandbar surface-panel mt-3 flex flex-wrap items-center gap-2 p-3" data-reveal>
        <div className="mr-auto flex items-center gap-2 text-sm text-steel"><CircleGauge className="h-4 w-4 text-mint" /> Mesh status <span className="font-semibold text-white">{lastRefresh ? "just refreshed" : "ready for inspection"}</span></div>
        <button className="action-secondary" type="button" onClick={() => void refreshMesh()} disabled={isRefreshing}><RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} /> {isRefreshing ? "Refreshing" : "Refresh mesh"}</button>
        <Link className="action-secondary" to={`/projects/${projectId}/advanced?view=security`}><ShieldCheck className="h-4 w-4" /> Security</Link>
        <Link className="action-secondary" to={`/projects/${projectId}/labs?lab=evolution`}><GitCompareArrows className="h-4 w-4" /> Compare evolution</Link>
      </div>

      <div className="cm-stagger mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <ControlMetric icon={CircleGauge} label="Health" value={`${health}/100`} detail={issueCount ? `${issueCount} review signals` : "No review signals"} tone="cm-tone-cyan" progress={health} />
        <ControlMetric icon={ShieldCheck} label="Security" value={`${securityScore}/100`} detail={`${securityFindings} findings`} tone="cm-tone-amber" progress={securityScore} />
        <ControlMetric icon={FolderSearch} label="Repository" value={String(data.insights.fileCount)} detail={`${formatNumber(data.insights.lineCount)} source lines`} tone="cm-tone-violet" />
        <ControlMetric icon={ListChecks} label="Delivery" value={String(openTasks.length)} detail={`${allTasks.filter((task) => task.status === "done").length} completed`} tone="cm-tone-coral" />
        <ControlMetric icon={GitBranch} label="PR gate" value={`${riskScore}/100`} detail={advanced.data?.pullRequestRisk.status ?? "loading"} tone="cm-tone-rose" progress={riskScore} inverse />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="surface-panel cm-control-section cm-tone-cyan p-5" data-reveal>
          <SectionHeader icon={Network} tone="cm-tone-cyan" eyebrow="Repository radar" title="See what changed, what matters, and what needs attention." detail="The control room keeps graph, source, and review signals in the same frame." />
          <div className="cm-radar-grid mt-5">
            <div className="cm-radar-visual" aria-hidden="true"><div className="cm-radar-ring cm-radar-ring-one" /><div className="cm-radar-ring cm-radar-ring-two" /><div className="cm-radar-ring cm-radar-ring-three" /><div className="cm-radar-sweep" /><div className="cm-radar-core"><Network className="h-5 w-5" /></div><i className="cm-radar-ping cm-radar-ping-one" /><i className="cm-radar-ping cm-radar-ping-two" /><i className="cm-radar-ping cm-radar-ping-three" /></div>
            <div className="space-y-3">
              <SignalRow icon={GitBranch} label="Source connection" value={intelligence.data?.integrations.github.connected ? "GitHub linked" : sourceLabel} detail={data.project.repoUrl ?? "Local repository source"} tone="cm-tone-coral" />
              <SignalRow icon={Waypoints} label="Graph coverage" value={`${data.insights.graphNodes} nodes`} detail={`${data.insights.graphEdges} relationships mapped`} tone="cm-tone-cyan" />
              <SignalRow icon={Bot} label="AI grounding" value={intelligence.data?.integrations.ai.retrieval ?? "Graph + hybrid"} detail={intelligence.data?.integrations.ai.provider ?? "Local fallback"} tone="cm-tone-violet" />
              <SignalRow icon={Clock3} label="Latest quality" value={latestQuality ? `${latestQuality.score}/100` : "Baseline ready"} detail={latestQuality ? `${latestQuality.coverageEstimate}% structural coverage` : "Capture a lab snapshot"} tone="cm-tone-amber" />
            </div>
          </div>
        </section>

        <section className="surface-panel cm-control-section cm-tone-amber p-5" data-reveal>
          <SectionHeader icon={ScanSearch} tone="cm-tone-amber" eyebrow="Security watch" title="Review before you ship." detail="Secrets, risky APIs, and dependency inventory stay visible next to the code they affect." action={<Link className="cm-inline-action" to={`/projects/${projectId}/advanced?view=security`}>Open scanner <ArrowUpRight className="h-3.5 w-3.5" /></Link>} />
          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            <SecurityStat value={String(advanced.data?.security.secrets.length ?? 0)} label="Secrets" tone="cm-tone-coral" />
            <SecurityStat value={String(advanced.data?.security.dangerousApis.length ?? 0)} label="Risky APIs" tone="cm-tone-amber" />
            <SecurityStat value={String(advanced.data?.security.sbom.length ?? 0)} label="Packages" tone="cm-tone-cyan" />
          </div>
          <div className="mt-5 space-y-2 border-t border-line pt-4">
            {(advanced.data?.security.secrets.slice(0, 2) ?? []).map((finding) => <FindingRow key={finding.id} icon={AlertTriangle} title={finding.title} path={`${finding.filePath}:${finding.line}`} tone="cm-tone-coral" />)}
            {(advanced.data?.security.dangerousApis.slice(0, 2) ?? []).map((finding) => <FindingRow key={finding.id} icon={ShieldCheck} title={`Review ${finding.api}`} path={`${finding.filePath}:${finding.line}`} tone="cm-tone-amber" />)}
            {!securityFindings && <div className="flex items-center gap-2 py-4 text-sm text-mint"><CheckCircle2 className="h-4 w-4" /> No security findings are currently flagged.</div>}
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="surface-panel cm-control-section cm-tone-violet p-5" data-reveal>
          <SectionHeader icon={Bot} tone="cm-tone-violet" eyebrow="Copilot launchpad" title="Turn a signal into a reviewed change." detail="Start grounded prompts from the hottest part of the repository, then inspect the patch before it is applied." />
          <div className="mt-5 grid gap-2">
            <CopilotAction icon={Sparkles} label="Explain the most connected module" detail="Architecture and dependency context" to={`/projects/${projectId}/assistant?path=${encodeURIComponent(primaryFile)}&prompt=${encodeURIComponent("Explain the most connected module, its responsibilities, dependencies, risks, and safe extension points.")}`} />
            <CopilotAction icon={AlertTriangle} label="Find likely bugs in the hot paths" detail="Grounded investigation with citations" to={`/projects/${projectId}/assistant?path=${encodeURIComponent(primaryFile)}&prompt=${encodeURIComponent("Investigate the highest-risk code paths and identify likely bugs or edge cases. Cite the exact files and lines.")}`} />
            <CopilotAction icon={Workflow} label="Draft tests for the current architecture" detail="A test plan tied to repository evidence" to={`/projects/${projectId}/assistant?path=${encodeURIComponent(primaryFile)}&prompt=${encodeURIComponent("Propose focused tests for the repository's most important flows. Explain what each test protects and where it should live.")}`} />
          </div>
          <div className="cm-copilot-footnote mt-5"><span className="cm-live-chip"><i /> grounded</span><span>Uses repository retrieval, graph relationships, and the active workspace.</span></div>
        </section>

        <section className="surface-panel cm-control-section cm-tone-rose p-5" data-reveal>
          <SectionHeader icon={GitCompareArrows} tone="cm-tone-rose" eyebrow="Change flight recorder" title="Compare the repository as it evolves." detail="Use graph deltas and quality snapshots to understand the cost of a change before opening a contribution." action={<Link className="cm-inline-action" to={`/projects/${projectId}/labs?lab=evolution`}>Open timeline <ArrowUpRight className="h-3.5 w-3.5" /></Link>} />
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <DeltaTile label="Snapshots" value={labs.data?.evolution.snapshots.length ?? 0} tone="cm-tone-violet" />
            <DeltaTile label="Nodes added" value={labs.data?.evolution.addedNodes.length ?? 0} tone="cm-tone-mint" />
            <DeltaTile label="Links changed" value={(labs.data?.evolution.addedEdges ?? 0) + (labs.data?.evolution.removedEdges ?? 0)} tone="cm-tone-coral" />
          </div>
          <div className="cm-timeline mt-5">
            {(labs.data?.evolution.snapshots.slice(-4).reverse() ?? []).map((snapshot, index) => <div className="cm-timeline-item" key={snapshot.id}><span className={`cm-timeline-dot ${index === 0 ? "is-current" : ""}`} /><div className="min-w-0"><div className="flex items-center justify-between gap-3"><strong className="truncate font-mono text-xs text-white">{shortSha(snapshot.commitSha)}</strong><span className="shrink-0 text-[11px] text-steel">{relativeTime(snapshot.createdAt)}</span></div><p className="mt-1 text-xs text-steel">{snapshot.nodeCount} nodes · {snapshot.edgeCount} relationships</p></div></div>)}
            {!labs.data?.evolution.snapshots.length && <div className="py-4 text-sm text-steel">Capture a baseline in Engineering Labs to start the architecture timeline.</div>}
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="surface-panel cm-control-section cm-tone-amber p-5" data-reveal>
          <div className="flex flex-wrap items-start justify-between gap-3"><SectionHeader icon={ListChecks} tone="cm-tone-amber" eyebrow="Delivery queue" title="Keep the next move obvious." detail="Create, advance, or remove focused tasks without leaving the command surface." /><Link className="cm-inline-action" to={`/projects/${projectId}/tasks`}>Full task board <ArrowUpRight className="h-3.5 w-3.5" /></Link></div>
          <form className="mt-5 flex gap-2" onSubmit={submitTask}><input className="field min-w-0 flex-1" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Add a focused engineering task" maxLength={160} /><button className="action-primary shrink-0" type="submit" disabled={taskTitle.trim().length < 3 || createTask.isPending}>{createTask.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add</button></form>
          {taskMessage && <p className="mt-2 text-xs text-steel" role="status">{taskMessage}</p>}
          <div className="mt-4 space-y-2">
            {allTasks.slice(0, 5).map((task) => <div key={task.id} className="cm-task-row"><div className="min-w-0 flex-1"><div className={`truncate text-sm font-semibold ${task.status === "done" ? "text-steel line-through" : "text-white"}`}>{task.title}</div><div className="mt-1 text-[11px] text-steel">{relativeTime(task.createdAt)}</div></div><select className="cm-compact-select" aria-label={`Status for ${task.title}`} value={task.status} disabled={updateTask.isPending} onChange={(event) => updateTask.mutate({ taskId: task.id, status: event.target.value as ProjectTask["status"] })}>{taskStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select><button className="cm-icon-button h-8 w-8" type="button" title="Remove task" aria-label={`Remove ${task.title}`} disabled={removeTask.isPending} onClick={() => { if (window.confirm(`Remove “${task.title}”?`)) removeTask.mutate(task); }}>{removeTask.isPending && removeTask.variables?.id === task.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button></div>)}
            {!allTasks.length && <div className="py-6 text-center text-sm text-steel">Your delivery queue is clear. Add the first task above.</div>}
          </div>
        </section>

        <section className="surface-panel cm-control-section cm-tone-cyan p-5" data-reveal>
          <SectionHeader icon={UsersRound} tone="cm-tone-cyan" eyebrow="Team signal" title="Keep context moving." detail="Collaboration activity, patches, and discussions are visible before they become blockers." />
          <div className="mt-5 grid grid-cols-3 gap-3 text-center"><DeltaTile label="Discussions" value={discussions.data?.length ?? 0} tone="cm-tone-cyan" /><DeltaTile label="Patches" value={contributions.data?.patches.length ?? 0} tone="cm-tone-violet" /><DeltaTile label="Contributions" value={contributions.data?.contributions.length ?? 0} tone="cm-tone-coral" /></div>
          <div className="mt-5 space-y-3 border-t border-line pt-4">
            {(discussions.data?.slice(0, 2) ?? []).map((thread) => <div className="flex gap-3" key={thread.id}><MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-cyan" /><div className="min-w-0"><div className="truncate text-sm font-semibold text-white">{thread.title}</div><div className="mt-1 truncate text-xs text-steel">{thread.body}</div></div></div>)}
            {(contributions.data?.contributions.slice(0, 2) ?? []).map((contribution) => <div className="flex gap-3" key={contribution.id}><GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-coral" /><div className="min-w-0"><div className="truncate text-sm font-semibold text-white">{contribution.title}</div><div className="mt-1 text-xs text-steel">{contribution.status} contribution</div></div></div>)}
            {!discussions.data?.length && !contributions.data?.contributions.length && <div className="py-4 text-sm text-steel">No collaboration signals yet. Start a discussion or draft a reviewed patch.</div>}
          </div>
        </section>
      </div>

      <section className="surface-panel cm-control-section cm-tone-violet mt-4 p-5" data-reveal>
        <div className="flex flex-wrap items-end justify-between gap-3"><SectionHeader icon={FolderSearch} tone="cm-tone-violet" eyebrow="Repository atlas" title="Every indexed source file, one quick search away." detail={`${filteredFiles.length} visible of ${files.data?.length ?? data.insights.fileCount} indexed files. Binary and sensitive files remain protected by the importer.`} /><Link className="cm-inline-action" to={`/projects/${projectId}/workspace`}>Open full explorer <ArrowUpRight className="h-3.5 w-3.5" /></Link></div>
        <label className="cm-atlas-search mt-5"><ScanSearch className="h-4 w-4" /><input value={fileFilter} onChange={(event) => setFileFilter(event.target.value)} placeholder="Filter by path or language" /></label>
        <div className="cm-atlas-list mt-3">{filteredFiles.map((file) => <Link className="cm-atlas-row" key={file.path} to={`/projects/${projectId}/workspace?path=${encodeURIComponent(file.path)}`}><FileCode2 className="cm-tone-text h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate font-mono text-xs text-white">{file.path}</span><span className="hidden text-[10px] uppercase text-steel sm:inline">{file.language}</span><span className="font-mono text-[10px] text-steel">{formatBytes(file.size)}</span><ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-steel" /></Link>)}{!filteredFiles.length && <div className="py-8 text-center text-sm text-steel">No indexed files match this filter.</div>}</div>
      </section>
    </section>
  );
}

function SectionHeader({ icon: Icon, tone, eyebrow, title, detail, action }: { icon: typeof Activity; tone: string; eyebrow: string; title: string; detail: string; action?: React.ReactNode }) {
  return <div className="flex min-w-0 flex-1 items-start justify-between gap-3"><div className="min-w-0"><div className={`eyebrow ${tone}`}><Icon className="cm-tone-text h-3.5 w-3.5" /> {eyebrow}</div><h2 className="mt-2 text-xl font-semibold text-white">{title}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-steel">{detail}</p></div>{action}</div>;
}

function ControlMetric({ icon: Icon, label, value, detail, tone, progress, inverse = false }: { icon: typeof Activity; label: string; value: string; detail: string; tone: string; progress?: number; inverse?: boolean }) {
  const score = inverse ? 100 - (progress ?? 0) : progress;
  return <div className={`surface-panel cm-control-metric cm-accent-card ${tone} p-4`} data-reveal><div className="flex items-center justify-between gap-2"><Icon className="cm-icon-motion cm-tone-text h-4 w-4" /><span className="font-mono text-[10px] uppercase text-steel">{label}</span></div><div className="mt-2 text-xl font-bold text-white">{value}</div><div className="mt-1 truncate text-[11px] text-steel">{detail}</div>{progress !== undefined && <div className="cm-mini-progress mt-3"><span className="cm-tone-fill" style={{ width: `${Math.max(4, Math.min(100, score ?? 0))}%` }} /></div>}</div>;
}

function SignalRow({ icon: Icon, label, value, detail, tone }: { icon: typeof Activity; label: string; value: string; detail: string; tone: string }) {
  return <div className={`cm-signal-row ${tone}`}><Icon className="cm-tone-text mt-0.5 h-4 w-4 shrink-0" /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><span className="text-sm text-white">{label}</span><strong className="truncate text-xs text-white">{value}</strong></div><div className="mt-1 truncate text-[11px] text-steel">{detail}</div></div></div>;
}

function SecurityStat({ value, label, tone }: { value: string; label: string; tone: string }) {
  return <div className={`cm-security-stat ${tone}`}><strong className="cm-tone-text text-2xl">{value}</strong><span className="mt-1 block text-[10px] uppercase tracking-wide text-steel">{label}</span></div>;
}

function FindingRow({ icon: Icon, title, path, tone }: { icon: typeof AlertTriangle; title: string; path: string; tone: string }) {
  return <div className={`cm-finding-row ${tone}`}><Icon className="cm-tone-text h-4 w-4 shrink-0" /><div className="min-w-0"><div className="truncate text-xs font-semibold text-white">{title}</div><div className="mt-1 truncate font-mono text-[10px] text-steel">{path}</div></div></div>;
}

function CopilotAction({ icon: Icon, label, detail, to }: { icon: typeof Sparkles; label: string; detail: string; to: string }) {
  return <Link className="cm-copilot-action" to={to}><span className="cm-copilot-icon"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-white">{label}</strong><small className="mt-1 block truncate text-xs text-steel">{detail}</small></span><ArrowUpRight className="h-4 w-4 shrink-0 text-steel" /></Link>;
}

function DeltaTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className={`cm-delta-tile ${tone}`}><strong className="cm-tone-text text-xl">{new Intl.NumberFormat().format(value)}</strong><span className="mt-1 block text-[10px] uppercase tracking-wide text-steel">{label}</span></div>;
}

function shortSha(value: string) {
  return value.length > 14 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
