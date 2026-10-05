import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bot, Code2, FileCode2 } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { Permission, Project, RepoFile, WorkspaceDoc } from "@codemesh/shared";
import { RepositoryAssistant } from "../components/RepositoryAssistant";
import { LoadingState } from "../components/LoadingState";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

type AssistantWorkspace = {
  project: Project;
  permissions: Permission[];
  files: RepoFile[];
  docs: WorkspaceDoc[];
};

export function AssistantPage() {
  const { projectId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const requestedPath = searchParams.get("path") ?? "";
  const initialPrompt = searchParams.get("prompt") ?? "";
  const [selectedPath, setSelectedPath] = useState(requestedPath);
  const workspace = useQuery({
    queryKey: ["workspace", projectId],
    queryFn: () => api<AssistantWorkspace>(`/api/projects/${projectId}/workspace`),
    enabled: Boolean(user && projectId)
  });
  const data = workspace.data;

  useEffect(() => {
    if (!data?.files.length) return;
    if (requestedPath && data.files.some((file) => file.path === requestedPath)) {
      setSelectedPath(requestedPath);
      return;
    }
    if (selectedPath) return;
    const preferred = data.files.find((file) => file.path === "src/auth/session.ts") ?? data.files[0];
    setSelectedPath(preferred?.path ?? "");
  }, [data?.files, requestedPath, selectedPath]);

  if (!user) return <div className="mx-auto max-w-3xl px-4 py-12 text-steel">Sign in to use the repository assistant.</div>;
  if (workspace.isLoading) return <LoadingState label="Loading repository assistant" />;
  if (!data) return <div className="mx-auto max-w-7xl px-4 py-8 text-coral">The repository assistant could not load this project.</div>;

  return (
    <section className="h-[calc(100vh-3.5rem)] overflow-hidden bg-ink">
      <header className="flex h-14 items-center justify-between gap-3 border-b border-line px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link className="rounded p-1.5 text-steel hover:bg-panel hover:text-white" to={`/projects/${projectId}`} title="Back to project" aria-label="Back to project">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Bot className="h-5 w-5 shrink-0 text-mint" />
          <div className="min-w-0">
            <h1 className="truncate font-semibold text-white">AI Assistant</h1>
            <p className="truncate text-xs text-steel">{data.project.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="max-w-48 rounded border border-line bg-panel px-2 py-1.5 font-mono text-xs text-white md:hidden"
            aria-label="Selected repository file"
            value={selectedPath}
            onChange={(event) => setSelectedPath(event.target.value)}
          >
            {data.files.map((file) => <option key={file.path} value={file.path}>{file.path}</option>)}
          </select>
          <Link className="flex items-center gap-2 rounded border border-line px-3 py-2 text-sm text-white hover:border-mint" to={`/projects/${projectId}/workspace`}>
            <Code2 className="h-4 w-4" />
            <span className="hidden sm:inline">Open editor</span>
          </Link>
        </div>
      </header>

      <div className="grid h-[calc(100%-3.5rem)] grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 border-r border-line bg-panel md:block">
          <div className="border-b border-line px-3 py-3 text-xs font-semibold uppercase text-steel">Repository files</div>
          <div className="cm-scrollbar h-[calc(100%-2.6rem)] overflow-y-auto p-2">
            {data.files.map((file) => (
              <button
                key={file.path}
                className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left font-mono text-xs ${file.path === selectedPath ? "bg-mint/15 text-mint" : "text-steel hover:bg-ink hover:text-white"}`}
                type="button"
                onClick={() => setSelectedPath(file.path)}
              >
                <FileCode2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{file.path}</span>
              </button>
            ))}
          </div>
        </aside>
        <main className="flex min-h-0 flex-col bg-panel">
          {selectedPath ? (
            <RepositoryAssistant
              projectId={projectId}
              activeFilePath={selectedPath}
              canReview={data.permissions.includes("workspace.review")}
              initialPrompt={initialPrompt}
              onOpenFile={setSelectedPath}
            />
          ) : (
            <div className="grid h-full place-items-center text-sm text-steel">Import repository files to start chatting.</div>
          )}
        </main>
      </div>
    </section>
  );
}
