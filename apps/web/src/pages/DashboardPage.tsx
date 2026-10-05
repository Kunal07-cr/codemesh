import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowUpRight, FolderPlus, Layers3, Search, ShieldCheck } from "lucide-react";
import type { ProjectSummary } from "@codemesh/shared";
import { NewProjectDialog } from "../components/NewProjectDialog";
import { LoadingState } from "../components/LoadingState";
import { ProjectCard } from "../components/ProjectCard";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";

export function DashboardPage() {
  const { user } = useAuth();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const projects = useQuery({
    queryKey: ["projects", "dashboard"],
    queryFn: () => api<ProjectSummary[]>("/api/projects/dashboard"),
    enabled: Boolean(user)
  });

  if (!user) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded border border-line bg-panel p-6 text-steel">Sign in from the landing page to see personal projects.</div>
      </section>
    );
  }

  if (projects.isLoading) return <LoadingState label="Loading dashboard projects" />;

  const visibleProjects = projects.data?.filter((project) => {
    const needle = filter.trim().toLowerCase();
    return !needle || `${project.name} ${project.description} ${project.tags.join(" ")}`.toLowerCase().includes(needle);
  }) ?? [];
  const totalFiles = projects.data?.reduce((total, project) => total + project.fileCount, 0) ?? 0;
  const publicProjects = projects.data?.filter((project) => project.visibility === "public").length ?? 0;

  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow"><Activity className="h-3.5 w-3.5" /> Your engineering surface</div>
          <h1 className="mt-2 text-3xl font-bold text-white md:text-4xl">Dashboard</h1>
          <p className="mt-2 text-steel">A fast view of the repositories, signals, and workspaces in your orbit.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link className="flex items-center gap-2 rounded border border-line px-3 py-2 text-sm text-white hover:border-mint" to="/discover">
            <Search className="h-4 w-4" />
            Find project
          </Link>
          <button
            className="flex items-center gap-2 rounded bg-mint px-3 py-2 text-sm font-semibold text-ink hover:bg-mint/90"
            type="button"
            onClick={() => setNewProjectOpen(true)}
          >
            <FolderPlus className="h-4 w-4" />
            New project
          </button>
        </div>
      </div>
      <div className="cm-stagger mt-6 grid gap-3 md:grid-cols-3">
        <DashboardMetric icon={Layers3} label="Tracked projects" value={String(projects.data?.length ?? 0)} detail="with server permissions" tone="cm-tone-cyan" />
        <DashboardMetric icon={FolderPlus} label="Indexed files" value={String(totalFiles)} detail="ready for retrieval" tone="cm-tone-violet" />
        <DashboardMetric icon={ShieldCheck} label="Public surfaces" value={String(publicProjects)} detail="discoverable projects" tone="cm-tone-coral" />
      </div>
      <div className="surface-panel mt-6 flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded border border-mint/30 bg-mint/10"><Activity className="h-4 w-4 text-mint" /></div>
          <div><div className="text-sm font-semibold text-white">Workspace pulse</div><div className="text-xs text-steel">Search across your project names, tags, and descriptions.</div></div>
        </div>
        <label className="relative block w-full md:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel" />
          <input className="field pl-9" placeholder="Filter projects" value={filter} onChange={(event) => setFilter(event.target.value)} />
        </label>
      </div>
      {projects.isError && <div className="mt-6 rounded border border-coral/40 bg-coral/10 p-4 text-sm text-coral">Projects could not be loaded.</div>}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {visibleProjects.map((project) => <ProjectCard key={project.id} project={project} />)}
      </div>
      {visibleProjects.length === 0 && (
        <div className="mt-6 border-y border-line py-12 text-center">
          <FolderPlus className="mx-auto h-8 w-8 text-mint" />
          <h2 className="mt-3 text-lg font-semibold text-white">{filter ? "No projects match that filter" : "Create your first project"}</h2>
          {!filter && <button className="action-primary mx-auto mt-4" type="button" onClick={() => setNewProjectOpen(true)}><FolderPlus className="h-4 w-4" /> New project <ArrowUpRight className="h-4 w-4" /></button>}
        </div>
      )}
      <NewProjectDialog open={newProjectOpen} onClose={() => setNewProjectOpen(false)} />
    </section>
  );
}

function DashboardMetric({ icon: Icon, label, value, detail, tone }: { icon: React.ElementType; label: string; value: string; detail: string; tone: string }) {
  return (
    <div className={`surface-panel cm-accent-card ${tone} flex items-center gap-4 p-4`} data-reveal>
      <div className="grid h-10 w-10 place-items-center rounded border border-line bg-ink"><Icon className="cm-icon-motion h-5 w-5" /></div>
      <div className="min-w-0"><div className="text-xs uppercase tracking-wide text-steel">{label}</div><div className="mt-1 text-2xl font-bold text-white">{value}</div><div className="text-xs text-steel">{detail}</div></div>
    </div>
  );
}
