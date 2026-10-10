import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowRight, ArrowUpRight, Boxes, GitBranch, RefreshCw } from "lucide-react";
import { graphSchema } from "@codemesh/shared";
import { api } from "../lib/api";

const GraphCanvas = lazy(() => import("./RepositoryGraphCanvas").then((module) => ({ default: module.RepositoryGraphCanvas })));
const sampleId = "project-sample-taskpilot";

export function ArchitectureHero() {
  const navigate = useNavigate();
  const graph = useQuery({ queryKey: ["public-sample-graph"], queryFn: async () => graphSchema.parse(await api(`/api/projects/${sampleId}/graph`)), retry: 1 });
  return <section className="cm-architecture-hero">
    <div className="cm-hero-map">
      {graph.data ? <Suspense fallback={<GraphPlaceholder />}><GraphCanvas graph={graph.data} immersive onOpenSource={(path, line) => navigate(`/projects/${sampleId}/workspace?path=${encodeURIComponent(path)}${line ? `&line=${line}` : ""}`)} /></Suspense> : graph.isError ? <div className="cm-hero-map-unavailable" role="status"><GitBranch size={24} /><span>The sample graph is unavailable.</span><button type="button" className="action-secondary" onClick={() => void graph.refetch()} disabled={graph.isFetching}><RefreshCw size={14} /> Retry graph</button></div> : <GraphPlaceholder />}
    </div>
    <div className="cm-architecture-copy">
      <span className="eyebrow"><Boxes size={15} /> Repository intelligence workspace</span>
      <h1>CodeMesh<span>Understand your codebase.<br />See the bigger picture.</span></h1>
      <p>Turn complex repositories into interactive maps. Discover dependencies, explore architecture, and investigate your code with source-linked AI.</p>
      <div className="cm-architecture-actions"><Link className="action-primary" to="/discover">Explore your codebase <ArrowRight size={16} /></Link><a className="action-secondary" href="#workflow">See how it works <ArrowDown size={16} /></a></div>
      <div className="cm-hero-proof"><span><i data-tone="cyan" /> Source-linked graphs</span><span><i data-tone="mint" /> Live collaboration</span><span><i data-tone="violet" /> Reviewable AI edits</span></div>
    </div>
    <div className="cm-hero-coordinate" aria-hidden="true">01 / ARCHITECTURE</div>
  </section>;
}

function GraphPlaceholder() {
  return <div className="cm-graph-skeleton" role="status" aria-label="Loading sample graph"><span /><span /><span /><span /><span /><span /><small>Loading TaskPilot architecture</small></div>;
}

export function RepositoryWorkflow() {
  const steps = [
    { title: "Connect", detail: "Create a project and import a public GitHub repository or ZIP.", path: "/dashboard", tone: "cyan" },
    { title: "Index", detail: "Inspect imported files, source ranges, and index warnings.", path: `/projects/${sampleId}/settings`, tone: "amber" },
    { title: "Explore", detail: "Navigate files and symbols with their recorded relationships.", path: `/projects/${sampleId}/workspace`, tone: "mint" },
    { title: "Investigate", detail: "Ask contextual questions, inspect citations, and review proposed edits.", path: `/projects/${sampleId}/assistant`, tone: "violet" }
  ];
  return <ol className="cm-repository-workflow">{steps.map((step, index) => <li key={step.title} data-tone={step.tone}><span className="cm-workflow-number">0{index + 1}</span><h3>{step.title}</h3><p>{step.detail}</p><Link to={step.path} aria-label={`Open ${step.title.toLowerCase()} step`} title={`Open ${step.title.toLowerCase()} step`}><ArrowUpRight size={17} /></Link></li>)}</ol>;
}
