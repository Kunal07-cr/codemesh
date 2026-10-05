import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, GitPullRequest, ListFilter, LoaderCircle, MessageSquare, Plus, Search, Settings, ShieldCheck, Trash2 } from "lucide-react";
import type { Contribution, DiscussionThread, PatchProposal, ProjectTask } from "@codemesh/shared";
import { RepositoryImportPanel } from "../components/RepositoryImportPanel";
import { StatusPill } from "../components/StatusPill";
import { api, jsonBody } from "../lib/api";
import { relativeTime } from "../lib/format";

type ContributionsPayload = {
  contributions: Contribution[];
  patches: PatchProposal[];
  github: { configured: boolean; message: string };
};

export function ProjectActivityPage() {
  const { projectId = "", section = "discussions" } = useParams();
  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <Link className="inline-flex items-center gap-2 text-sm text-steel hover:text-white" to={`/projects/${projectId}`}>
        <ArrowLeft className="h-4 w-4" />
        Project overview
      </Link>
      {section === "discussions" && <Discussions projectId={projectId} />}
      {section === "tasks" && <Tasks projectId={projectId} />}
      {section === "contributions" && <Contributions projectId={projectId} />}
      {section === "settings" && <SettingsPanel projectId={projectId} />}
    </section>
  );
}

function Discussions({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const discussions = useQuery({
    queryKey: ["activity", projectId, "discussions"],
    queryFn: () => api<DiscussionThread[]>(`/api/projects/${projectId}/discussions`)
  });
  const create = useMutation({
    mutationFn: () =>
      api<DiscussionThread>(`/api/projects/${projectId}/discussions`, {
        method: "POST",
        body: jsonBody({ title, body })
      }),
    onSuccess: () => {
      setTitle("");
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["activity", projectId, "discussions"] });
    }
  });
  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
      <div>
        <h1 className="text-3xl font-bold text-white">Discussions</h1>
        <div className="mt-4 space-y-3">
          {discussions.data?.map((thread) => (
            <article key={thread.id} className="rounded border border-line bg-panel p-4">
              <div className="flex items-center gap-2 text-white">
                <MessageSquare className="h-4 w-4 text-mint" />
                <h2 className="font-semibold">{thread.title}</h2>
              </div>
              <p className="mt-2 leading-6 text-steel">{thread.body}</p>
              <div className="mt-3 text-xs text-steel">{relativeTime(thread.createdAt)}</div>
            </article>
          ))}
        </div>
      </div>
      <form
        className="rounded border border-line bg-panel p-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <h2 className="font-semibold text-white">Start discussion</h2>
        <input className="mt-3 w-full rounded border border-line bg-ink px-3 py-2 text-white" placeholder="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
        <textarea
          className="mt-3 h-32 w-full resize-none rounded border border-line bg-ink px-3 py-2 text-white"
          placeholder="Body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <button className="mt-3 flex items-center gap-2 rounded bg-mint px-3 py-2 font-semibold text-ink">
          <Plus className="h-4 w-4" />
          Post
        </button>
      </form>
    </div>
  );
}

function Tasks({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProjectTask["status"]>("all");
  const [message, setMessage] = useState("");
  const tasks = useQuery({
    queryKey: ["activity", projectId, "tasks"],
    queryFn: () => api<ProjectTask[]>(`/api/projects/${projectId}/tasks`)
  });
  const create = useMutation({
    mutationFn: () => api<ProjectTask>(`/api/projects/${projectId}/tasks`, { method: "POST", body: jsonBody({ title }) }),
    onSuccess: (task) => {
      setTitle("");
      setMessage(`Added "${task.title}".`);
      void queryClient.invalidateQueries({ queryKey: ["activity", projectId, "tasks"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Task could not be added.")
  });
  const update = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: ProjectTask["status"] }) =>
      api<ProjectTask>(`/api/projects/${projectId}/tasks/${taskId}`, {
        method: "PATCH",
        body: jsonBody({ status })
      }),
    onSuccess: (task) => {
      setMessage(`Moved "${task.title}" to ${task.status}.`);
      queryClient.setQueryData<ProjectTask[]>(["activity", projectId, "tasks"], (current = []) =>
        current.map((candidate) => candidate.id === task.id ? task : candidate)
      );
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Task status could not be updated.")
  });
  const remove = useMutation({
    mutationFn: (task: ProjectTask) =>
      api<{ deleted: true; taskId: string }>(`/api/projects/${projectId}/tasks/${task.id}`, { method: "DELETE" }),
    onSuccess: (_result, task) => {
      setMessage(`Removed "${task.title}".`);
      queryClient.setQueryData<ProjectTask[]>(["activity", projectId, "tasks"], (current = []) =>
        current.filter((candidate) => candidate.id !== task.id)
      );
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Task could not be removed.")
  });

  const allTasks = tasks.data ?? [];
  const visibleTasks = allTasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const completed = allTasks.filter((task) => task.status === "done").length;
  const busy = create.isPending || update.isPending || remove.isPending;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">Tasks</h1>
          <p className="mt-1 text-sm text-steel">{completed} of {allTasks.length} completed</p>
        </div>
        <div className="flex gap-2 text-xs text-steel">
          <span>{allTasks.filter((task) => task.status === "doing").length} active</span>
          <span aria-hidden="true">/</span>
          <span>{allTasks.filter((task) => task.status === "review").length} in review</span>
        </div>
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage("");
          create.mutate();
        }}
      >
        <input className="min-w-0 flex-1 rounded border border-line bg-panel px-3 py-2 text-white" maxLength={160} placeholder="New task" value={title} onChange={(event) => setTitle(event.target.value)} />
        <button className="flex items-center gap-2 rounded bg-mint px-3 py-2 font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50" disabled={title.trim().length < 3 || busy}>
          {create.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </button>
      </form>
      <div className="mt-4 flex flex-col gap-2 border-y border-line py-3 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-steel" />
          <input className="w-full rounded border border-line bg-panel py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-steel focus:border-mint" placeholder="Search tasks" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label className="relative sm:w-44">
          <ListFilter className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-steel" />
          <select className="w-full appearance-none rounded border border-line bg-panel py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-mint" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="Filter tasks by status">
            <option value="all">All statuses</option>
            <option value="todo">To do</option>
            <option value="doing">Doing</option>
            <option value="review">Review</option>
            <option value="done">Done</option>
          </select>
        </label>
      </div>
      {message && <p className="mt-3 text-sm text-steel" role="status">{message}</p>}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {visibleTasks.map((task) => (
          <article key={task.id} className="rounded border border-line bg-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className={`break-words font-semibold ${task.status === "done" ? "text-steel line-through" : "text-white"}`}>{task.title}</h2>
                <div className="mt-3 text-xs text-steel">Created {relativeTime(task.createdAt)}</div>
              </div>
              <button
                className="shrink-0 rounded p-2 text-steel hover:bg-coral/10 hover:text-coral disabled:opacity-40"
                type="button"
                title="Remove task"
                aria-label={`Remove ${task.title}`}
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Remove "${task.title}"?`)) {
                    setMessage("");
                    remove.mutate(task);
                  }
                }}
              >
                {remove.isPending && remove.variables?.id === task.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
              <StatusPill tone={task.status === "done" ? "good" : task.status === "review" ? "warn" : "neutral"}>{task.status}</StatusPill>
              <select
                className="rounded border border-line bg-ink px-2 py-1.5 text-xs text-white outline-none focus:border-mint disabled:opacity-50"
                value={task.status}
                disabled={busy}
                aria-label={`Status for ${task.title}`}
                onChange={(event) => {
                  setMessage("");
                  update.mutate({ taskId: task.id, status: event.target.value as ProjectTask["status"] });
                }}
              >
                <option value="todo">To do</option>
                <option value="doing">Doing</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
            </div>
          </article>
        ))}
        {!tasks.isLoading && visibleTasks.length === 0 && (
          <div className="md:col-span-2 py-12 text-center text-sm text-steel">
            {allTasks.length === 0 ? "No tasks yet. Add the first task above." : "No tasks match the current search and status filter."}
          </div>
        )}
        {tasks.isLoading && (
          <div className="md:col-span-2 flex items-center justify-center gap-2 py-12 text-sm text-steel">
            <LoaderCircle className="h-4 w-4 animate-spin text-mint" /> Loading tasks...
          </div>
        )}
      </div>
    </div>
  );
}

function Contributions({ projectId }: { projectId: string }) {
  const contributions = useQuery({
    queryKey: ["activity", projectId, "contributions"],
    queryFn: () => api<ContributionsPayload>(`/api/projects/${projectId}/contributions`)
  });
  return (
    <div className="mt-6">
      <h1 className="text-3xl font-bold text-white">Contributions</h1>
      <div className="mt-4 rounded border border-line bg-panel p-4 text-sm text-steel">
        <GitPullRequest className="mr-2 inline h-4 w-4 text-mint" />
        {contributions.data?.github.message ?? "Checking GitHub configuration..."}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {contributions.data?.contributions.map((contribution) => (
          <article key={contribution.id} className="rounded border border-line bg-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold text-white">{contribution.title}</h2>
              <StatusPill tone={contribution.status === "published" ? "good" : contribution.status === "blocked" ? "danger" : "warn"}>
                {contribution.status}
              </StatusPill>
            </div>
            <p className="mt-2 text-sm leading-6 text-steel">{contribution.summary}</p>
          </article>
        ))}
        {contributions.data?.patches.map((patch) => (
          <article key={patch.id} className="rounded border border-mint/30 bg-mint/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold text-white">{patch.title}</h2>
              <StatusPill tone={patch.status === "applied" ? "good" : patch.status === "stale" ? "danger" : "warn"}>{patch.status}</StatusPill>
            </div>
            <p className="mt-2 text-sm leading-6 text-steel">{patch.summary}</p>
            <div className="mt-3 text-xs text-steel">{patch.files.length} changed file(s)</div>
          </article>
        ))}
      </div>
    </div>
  );
}

function SettingsPanel({ projectId }: { projectId: string }) {
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Project control plane</div>
          <h1 className="mt-2 text-3xl font-bold text-white">Settings</h1>
        </div>
        <StatusPill tone="good">Protected workspace</StatusPill>
      </div>
      <div className="mt-5">
        <RepositoryImportPanel projectId={projectId} />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="surface-panel p-4">
          <Settings className="h-5 w-5 text-mint" />
          <h2 className="mt-3 font-semibold text-white">Repository Import</h2>
          <p className="mt-2 text-sm leading-6 text-steel">
            Public GitHub import and ZIP ingestion rebuild the source-linked index, workspace documents, and retrieval context.
          </p>
        </div>
        <div className="surface-panel p-4">
          <ShieldCheck className="h-5 w-5 text-mint" />
          <h2 className="mt-3 font-semibold text-white">Authorization</h2>
          <p className="mt-2 text-sm leading-6 text-steel">
            Server middleware enforces project membership, discussion permissions, workspace editing, AI retrieval, patch application, and PR actions.
          </p>
          <p className="mt-3 font-mono text-xs text-steel">Project ID: {projectId}</p>
        </div>
      </div>
    </div>
  );
}
