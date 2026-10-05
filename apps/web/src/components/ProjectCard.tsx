import { Link } from "react-router-dom";
import { ArrowUpRight, Gauge, GitBranch, Lock, Users } from "lucide-react";
import type { ProjectSummary } from "@codemesh/shared";
import { StatusPill } from "./StatusPill";

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const tones = ["cm-tone-cyan", "cm-tone-violet", "cm-tone-coral", "cm-tone-amber"];
  const tone = tones[project.id.split("").reduce((total, character) => total + character.charCodeAt(0), 0) % tones.length];

  return (
    <article className={`surface-panel cm-accent-card ${tone} group p-4`} data-reveal>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to={`/projects/${project.id}`} className="flex items-center gap-2 text-lg font-semibold text-white hover:text-mint">
            {project.name}<ArrowUpRight className="cm-icon-motion cm-tone-text h-4 w-4" />
          </Link>
          <p className="mt-1 text-sm leading-6 text-steel">{project.description}</p>
        </div>
        <StatusPill tone={project.visibility === "public" ? "good" : "warn"}>
          {project.visibility === "public" ? "Public" : <Lock className="h-3 w-3" />}
        </StatusPill>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {[...project.tags, ...project.languages.slice(0, 2)].map((tag, index) => (
          <span key={`${tag}-${index}`} className="rounded bg-ink px-2 py-1 text-xs text-steel">
            {tag}
          </span>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs text-steel">
        <span className="flex items-center gap-1">
          <GitBranch className="h-3.5 w-3.5" />
          {project.commitSha}
        </span>
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {project.memberCount} members
        </span>
        <span>{project.fileCount} files</span>
        {project.role && <StatusPill>{project.role}</StatusPill>}
      </div>
      <div className="mt-4 flex items-center gap-3 border-t border-line pt-3">
        <Link className="inline-flex items-center gap-1 text-xs font-semibold text-white hover:text-mint" to={`/projects/${project.id}/control-room`}>
          <Gauge className="h-3.5 w-3.5 text-coral" />
          Open control room
        </Link>
        <Link className="inline-flex items-center gap-1 text-xs text-steel hover:text-white" to={`/projects/${project.id}/workspace`}>
          Workspace <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}
