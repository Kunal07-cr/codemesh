import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Check, Download, GitBranch, Play, Plus, RefreshCw, ShieldCheck, Square, Workflow, X } from "lucide-react";
import type { MissionRequest, MissionTaskView, MissionView } from "@codemesh/shared";
import { MissionComposer } from "../components/MissionComposer";
import { MissionGraph } from "../components/MissionGraph";
import { LoadingState } from "../components/LoadingState";
import { api, jsonBody } from "../lib/api";
import "../engineering.css";
import "../missions.css";

type Studio = { project: { id: string; name: string }; createAllowed: boolean; projects: Array<{ id: string; name: string }>; missions: MissionView[] };
export function ProjectMissionsPage() {
  const { projectId = "" } = useParams(), client = useQueryClient(), [params, setParams] = useSearchParams();
  const base = `/api/projects/${encodeURIComponent(projectId)}/missions`;
  const query = useQuery({ queryKey: ["missions", projectId], queryFn: () => api<Studio>(base), refetchInterval: (state) => state.state.data?.missions.some((mission) => mission.summary.running) ? 2000 : 10000 });
  const [selected, setSelected] = useState(params.get("mission") ?? ""), [taskId, setTaskId] = useState(""), [editing, setEditing] = useState(false), [error, setError] = useState(""), [confirmCancel, setConfirmCancel] = useState(false);
  const mission = query.data?.missions.find((item) => item.id === selected) ?? query.data?.missions[0];
  const task = mission?.tasks.find((item) => item.id === taskId) ?? mission?.tasks[0];
  function select(id: string) { setSelected(id); setTaskId(""); setConfirmCancel(false); setParams({ mission: id }, { replace: true }); }
  const mutation = useMutation({ mutationFn: ({ path = "", body }: { path?: string; body: unknown }) => api<MissionView>(`${base}${path}`, { method: "POST", body: jsonBody(body) }),
    onSuccess: async (saved) => { if (saved.id !== mission?.id) select(saved.id); else setConfirmCancel(false); setEditing(false); setError(""); await client.invalidateQueries({ queryKey: ["missions", projectId] }); },
    onError: async (problem) => { setError(problem instanceof Error ? problem.message : "Mission request failed."); await client.invalidateQueries({ queryKey: ["missions", projectId] }); } });
  function act(action: string, extra: Record<string, unknown> = {}) { if (mission) mutation.mutate({ path: `/${mission.id}/${action}`, body: { expectedVersion: mission.version, confirmed: true, ...extra } }); }
  async function download() {
    if (!mission) return;
    try { const report = await api<unknown>(`${base}/${mission.id}/report`), url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `codaventra-mission-${mission.id}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Report unavailable."); }
  }
  if (query.isLoading) return <LoadingState label="Opening Mission Studio" />;
  if (!query.data) return <section className="mx-auto max-w-7xl px-4 py-8"><h1 className="text-2xl font-bold">Mission Studio</h1><p className="studio-error" role="alert">{query.error?.message ?? "Studio unavailable"}</p><button className="action-secondary" onClick={() => void query.refetch()}><RefreshCw size={16} /> Retry</button></section>;
  const data = query.data, busy = mutation.isPending;
  return <section className="cm-missions mx-auto max-w-7xl px-4 py-6">
    <header className="studio-heading"><div><div className="eyebrow"><Workflow size={14} /> {data.project.name}</div><h1>Mission Studio</h1></div><div className="studio-heading-actions"><button className="cm-tool-button" title="Refresh missions" aria-label="Refresh missions" onClick={() => void query.refetch()}><RefreshCw size={17} /></button>{data.createAllowed && <button className="action-primary" disabled={busy} onClick={() => { setEditing(true); setError(""); }}><Plus size={16} /> New mission</button>}</div></header>
    {error && <p className="studio-error" role="alert">{error}</p>}
    {editing && <MissionComposer key={projectId} projectId={projectId} projects={data.projects} busy={busy} onClose={() => setEditing(false)} onSave={(body: MissionRequest) => mutation.mutate({ body })} />}
    {!data.missions.length && !editing && <div className="mission-empty"><GitBranch size={30} /><h2>No missions yet</h2>{data.createAllowed && <button className="action-primary" onClick={() => setEditing(true)}><Plus size={16} /> New mission</button>}</div>}
    {mission && <div className="mission-workspace">
      <aside className="mission-plans" aria-label="Saved missions"><h2>Missions <span>{data.missions.length}</span></h2>{data.missions.map((item) => <button key={item.id} aria-pressed={item.id === mission.id} onClick={() => select(item.id)}><strong>{item.title}</strong><small>{item.summary.accepted}/{item.summary.total} accepted</small><span className="mission-state" data-state={item.status}>{item.status}</span></button>)}</aside>
      <div className="mission-main">
        <header className="mission-section-heading"><div><h2>{mission.title}</h2><p>{mission.goal}</p></div><div><button className="cm-tool-button" title="Export mission evidence" aria-label="Export mission evidence" onClick={() => void download()}><Download size={17} /></button>{!mission.cancelled && <button className="cm-tool-button" title="Cancel mission" aria-label="Cancel mission" disabled={busy} onClick={() => setConfirmCancel(true)}><Square size={16} /></button>}</div></header>
        {confirmCancel && <div className="mission-cancel" role="alert"><span>Cancel active tasks and lock this mission?</span><button className="action-secondary" disabled={busy} onClick={() => setConfirmCancel(false)}><X size={15} /> Keep mission</button><button className="action-secondary" disabled={busy} onClick={() => act("cancel")}><Square size={15} /> Confirm cancellation</button></div>}
        <div className="mission-summary"><div><strong>{mission.summary.repositories}</strong><span>Repositories</span></div><div><strong>{mission.summary.ready}</strong><span>Ready</span></div><div><strong>{mission.summary.running}</strong><span>Running</span></div><div><strong>{mission.summary.accepted}/{mission.summary.total}</strong><span>Accepted evidence</span></div><button className="action-primary" disabled={busy || !mission.summary.ready || mission.cancelled} onClick={() => act("dispatch")}><Play size={16} /> Dispatch ready steps</button></div>
        <progress className="mission-progress" value={mission.summary.accepted} max={mission.summary.total} aria-label="Accepted mission evidence" />
        <MissionGraph key={mission.id} tasks={mission.tasks} selectedId={task?.id} onSelect={setTaskId} />
        {task && <MissionEvidence key={`${mission.id}:${task.id}:${task.state}:${task.evidenceDigest}`} task={task} cancelled={mission.cancelled} busy={busy} accept={() => act(`tasks/${task.id}/accept`, { evidenceDigest: task.evidenceDigest })} recapture={() => act(`tasks/${task.id}/recapture`)} />}
        <section className="mission-events"><h3>Mission activity</h3><ol>{mission.events.slice().reverse().map((event, index) => <li key={`${event.createdAt}:${index}`}><time>{new Date(event.createdAt).toLocaleString()}</time><span>{event.action.replaceAll(".", " ")}</span>{event.taskId && <strong>{mission.tasks.find((item) => item.id === event.taskId)?.title}</strong>}</li>)}</ol></section>
      </div>
    </div>}
  </section>;
}

function MissionEvidence({ task, cancelled, busy, accept, recapture }: { task: MissionTaskView; cancelled: boolean; busy: boolean; accept(): void; recapture(): void }) {
  const [reviewed, setReviewed] = useState(false);
  return <section className="mission-evidence" aria-label="Selected step evidence">
    <header className="mission-section-heading"><div><div className="eyebrow">{task.projectName}</div><h3>{task.title}</h3></div><span className="mission-state" data-state={task.state}>{task.state.replaceAll("_", " ")}</span></header>
    <p className="mission-task-objective">{task.objective}</p><p className="mission-task-detail" role="status">{task.detail}</p>
    <dl className="mission-facts"><div><dt>Source revision</dt><dd>{task.revision}</dd></div><div><dt>Capture launches</dt><dd>{task.launches}/3</dd></div><div><dt>Source citations</dt><dd>{task.run?.citations ?? 0}</dd></div><div><dt>Verification</dt><dd>{task.run?.verification.status ?? "NOT_RUN"}</dd></div></dl>
    <div className="mission-evidence-actions">{task.run && <Link className="action-secondary" to={`/projects/${encodeURIComponent(task.projectId)}/engineering?run=${encodeURIComponent(task.run.id)}`}><ArrowUpRight size={16} /> Open task evidence</Link>}{!cancelled && task.state !== "running" && task.launches < 3 && <button className="action-secondary" disabled={busy} onClick={recapture}><RefreshCw size={16} /> Recapture source</button>}{task.run?.patchId && <span className="mission-state">Unapplied proposal</span>}</div>
    {task.canAccept && !cancelled && <form className="mission-accept" onSubmit={(event) => { event.preventDefault(); accept(); }}><label><input type="checkbox" checked={reviewed} required onChange={(event) => setReviewed(event.target.checked)} /> I reviewed this task's source evidence and any proposed diff.</label><button className="action-primary" disabled={busy || !reviewed}><Check size={16} /> Accept evidence</button></form>}
    <p className="mission-safety"><ShieldCheck size={15} /> Evidence handoff only. Acceptance does not apply code or prove a verified repair.</p>
  </section>;
}
