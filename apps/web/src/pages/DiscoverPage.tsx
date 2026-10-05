import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Compass, Search } from "lucide-react";
import type { ProjectSummary } from "@codemesh/shared";
import { ProjectCard } from "../components/ProjectCard";
import { LoadingState } from "../components/LoadingState";
import { api } from "../lib/api";

export function DiscoverPage() {
  const [search, setSearch] = useState("");
  const projects = useQuery({
    queryKey: ["projects", "discovery", search],
    queryFn: () => api<ProjectSummary[]>(`/api/projects/discovery?search=${encodeURIComponent(search)}`)
  });

  if (projects.isLoading) return <LoadingState label="Searching public projects" />;

  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="eyebrow"><Compass className="h-3.5 w-3.5" /> Open source map</div>
          <h1 className="mt-2 text-3xl font-bold text-white">Project Discovery</h1>
          <p className="mt-2 text-steel">Only explicitly published public projects appear here.</p>
        </div>
        <label className="relative block w-full md:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel" />
          <input className="field pl-9" placeholder="Search language, tag, or name" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
      </div>
      <div className="mt-6 flex items-center justify-between border-y border-line py-3 text-xs text-steel">
        <span>Public projects indexed by CodeMesh</span>
        <span className="font-mono text-mint">{projects.data?.length ?? 0} matches</span>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {projects.data?.map((project) => <ProjectCard key={project.id} project={project} />)}
      </div>
      {projects.data?.length === 0 && (
        <div className="mt-8 rounded border border-line bg-panel p-6 text-steel">No public projects matched the current search.</div>
      )}
    </section>
  );
}
