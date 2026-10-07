import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { BookOpen, CheckCircle2, Code2, GitBranch, Network, Share2 } from "lucide-react";
import { LoadingState } from "../components/LoadingState";
import { api } from "../lib/api";

type SharedReport = {
  share: { label: string; expiresAt: string };
  project: { name: string; description: string; commitSha: string; languages: string[]; updatedAt: string };
  repository: { files: number; symbols: number; relationships: number };
  documentation: {
    generatedAt: string;
    entryPoints: string[];
    modules: Array<{ name: string; files: number; symbols: number; relationships: number; languages: string[] }>;
    mermaid: string;
    health: { score: number; summary?: string };
  };
  review: { score: number; status: string; summary: string; checks: Array<{ id: string; label: string; status: string; detail: string }> };
  qualityTimeline: Array<{ id: string; score: number; coverageEstimate: number; warningFindings: number; criticalFindings: number; createdAt: string }>;
  generatedAt: string;
};

export function SharedReportPage() {
  const { token = "" } = useParams();
  const report = useQuery({
    queryKey: ["shared-report", token],
    queryFn: () => api<SharedReport>("/api/shares/" + token),
    retry: false
  });

  if (report.isLoading) return <LoadingState label="Opening architecture report" />;
  if (!report.data) {
    return <section className="mx-auto max-w-3xl px-4 py-20 text-center"><Share2 className="mx-auto h-8 w-8 text-coral" /><h1 className="mt-4 text-2xl font-bold text-white">Report unavailable</h1><p className="mt-2 text-steel">{report.error instanceof Error ? report.error.message : "This link is invalid, expired, or revoked."}</p></section>;
  }

  const data = report.data;
  return (
    <section className="mx-auto max-w-6xl px-4 py-8">
      <header className="surface-panel cm-hero-panel overflow-hidden p-6 md:p-8">
        <div className="eyebrow"><Share2 className="h-3.5 w-3.5" /> Read-only engineering report</div>
        <h1 className="mt-3 text-3xl font-bold text-white md:text-4xl">{data.project.name}</h1>
        <p className="mt-3 max-w-3xl leading-7 text-steel">{data.project.description}</p>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs text-steel">
          <span>{data.share.label}</span>
          <span>Commit {data.project.commitSha.slice(0, 12)}</span>
          <span>Expires {new Date(data.share.expiresAt).toLocaleString()}</span>
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ReportMetric icon={Code2} label="Files" value={data.repository.files} tone="cm-tone-cyan" />
          <ReportMetric icon={GitBranch} label="Symbols" value={data.repository.symbols} tone="cm-tone-violet" />
          <ReportMetric icon={Network} label="Relationships" value={data.repository.relationships} tone="cm-tone-coral" />
          <ReportMetric icon={CheckCircle2} label="Health" value={data.documentation.health.score} tone="cm-tone-amber" />
        </div>
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="surface-panel p-5 md:p-6">
          <div className="eyebrow"><BookOpen className="h-3.5 w-3.5" /> Architecture inventory</div>
          <h2 className="mt-2 text-xl font-semibold text-white">Repository modules</h2>
          <div className="mt-4 divide-y divide-line border-y border-line">
            {data.documentation.modules.slice(0, 16).map((module) => (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-4" key={module.name}>
                <div className="min-w-0"><div className="truncate font-mono text-sm text-white">{module.name}</div><div className="mt-1 text-xs text-steel">{module.languages.join(", ") || "Source"}</div></div>
                <div className="text-right font-mono text-xs text-cyan">{module.files} files<br /><span className="text-steel">{module.relationships} links</span></div>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-panel p-5 md:p-6">
          <div className="eyebrow"><CheckCircle2 className="h-3.5 w-3.5" /> Review evidence</div>
          <div className="mt-3 flex items-end justify-between gap-4"><h2 className="text-xl font-semibold text-white">Repository gate</h2><div className="font-mono text-3xl font-bold text-mint">{data.review.score}</div></div>
          <p className="mt-3 text-sm leading-6 text-steel">{data.review.summary}</p>
          <div className="mt-4 divide-y divide-line border-y border-line">{data.review.checks.map((check) => <div className="py-4" key={check.id}><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-mint" /><span className="text-sm font-semibold text-white">{check.label}</span><span className="ml-auto font-mono text-[10px] uppercase text-steel">{check.status}</span></div><p className="mt-1 text-xs leading-5 text-steel">{check.detail}</p></div>)}</div>
          <h3 className="mt-6 text-sm font-semibold text-white">Entry points</h3>
          <div className="mt-2 border-y border-line">{data.documentation.entryPoints.map((path) => <div className="border-b border-line py-2 font-mono text-xs text-cyan last:border-0" key={path}>{path}</div>)}{data.documentation.entryPoints.length === 0 && <div className="py-5 text-xs text-steel">No conventional entry points detected.</div>}</div>
        </section>
      </div>

      <footer className="mt-5 border-t border-line py-5 text-xs text-steel">
        Generated by CodeMesh at {new Date(data.generatedAt).toLocaleString()}. This report excludes source contents and credentials.
      </footer>
    </section>
  );
}

function ReportMetric({ icon: Icon, label, value, tone }: { icon: typeof Code2; label: string; value: number; tone: string }) {
  return <div className={tone + " border-l-2 border-line py-1 pl-3"}><Icon className="cm-tone-text h-4 w-4" /><div className="mt-2 text-[10px] uppercase text-steel">{label}</div><div className="mt-1 font-mono text-xl font-bold text-white">{value}</div></div>;
}

