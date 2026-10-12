import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileCode2, ListTodo, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import type { PatchProposal, ProjectTask } from "@codemesh/shared";
import { api, jsonBody } from "../lib/api";
import { WorkspaceDiff } from "./WorkspaceDiff";

function taskAssistantPrompt(title: string, paths: string[], notes: string) {
  const included: string[] = [];
  for (const path of paths) if (included.join(", ").length + path.length < 1600) included.push(path);
  const targets = included.length ? included.join(", ") : "the repository";
  return `For task "${title.slice(0, 160)}", inspect ${targets}. ${included.length < paths.length ? `${paths.length - included.length} other files are linked in the task record. ` : ""}Propose a minimal correction with source citations and focused verification. Task context: ${notes.slice(0, 1400)}`;
}

export function TaskWorkspace({ projectId, userId, taskId, paths, revision, canManage, onClose, onOpenFile, onAsk }: { projectId: string; userId: string; taskId: string; paths: string[]; revision: string; canManage: boolean; onClose(): void; onOpenFile(path: string): void; onAsk(prompt: string): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(taskId);
  const tasks = useQuery({ queryKey: ["activity", projectId, "tasks", userId], queryFn: () => api<ProjectTask[]>(`/api/projects/${projectId}/tasks`) });
  const contributions = useQuery({ queryKey: ["activity", projectId, "contributions", userId], queryFn: () => api<{ patches: PatchProposal[] }>(`/api/projects/${projectId}/contributions`) });
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); }; }, []);
  const chosen = tasks.data?.find((task) => task.id === (selected || tasks.data[0]?.id));
  return <dialog ref={ref} className="cm-task-work" aria-label="Issue-to-change workspace" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><strong className="flex items-center gap-2"><ListTodo size={17} />Issue-to-change workspace</strong><button type="button" className="cm-icon-button" title="Close task work" aria-label="Close task work" onClick={onClose}><X size={16} /></button></header>
    <label className="cm-task-picker">Task<select aria-label="Active task" value={chosen?.id ?? ""} onChange={(event) => setSelected(event.target.value)}><option value="" disabled>Select a task</option>{tasks.data?.map((task) => <option key={task.id} value={task.id}>{task.title} ({task.status})</option>)}</select></label>
    {tasks.isError || contributions.isError ? <p role="alert">Task work could not be loaded. <button type="button" onClick={() => { void tasks.refetch(); void contributions.refetch(); }}>Retry</button></p> : tasks.isLoading ? <p role="status">Loading task work...</p> : !chosen ? <p>No tasks available.</p> : <TaskWorkForm key={chosen.id} task={chosen} projectId={projectId} paths={paths} revision={revision} patches={contributions.data?.patches ?? []} canManage={canManage} onOpenFile={onOpenFile} onAsk={onAsk} />}
  </dialog>;
}

function TaskWorkForm({ task, projectId, paths, revision, patches, canManage, onOpenFile, onAsk }: { task: ProjectTask; projectId: string; paths: string[]; revision: string; patches: PatchProposal[]; canManage: boolean; onOpenFile(path: string): void; onAsk(prompt: string): void }) {
  const queryClient = useQueryClient();
  const [work, setWork] = useState(() => ({ paths: task.work?.paths ?? [], patchIds: task.work?.patchIds ?? [], checks: task.work?.checks ?? [], notes: task.work?.notes ?? "" }));
  const [version, setVersion] = useState(task.work?.version ?? 0);
  const [file, setFile] = useState("");
  const [patchId, setPatchId] = useState("");
  const [check, setCheck] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ patch: PatchProposal; path: string } | null>(null);
  const save = useMutation({
    mutationFn: () => api<ProjectTask>(`/api/projects/${projectId}/tasks/${task.id}/work`, { method: "PUT", body: jsonBody({ ...work, expectedVersion: version }) }),
    onSuccess: (saved) => { setVersion(saved.work!.version); setMessage("Task work saved. Check results are manually recorded, not executed."); void queryClient.invalidateQueries({ queryKey: ["activity", projectId, "tasks"] }); },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Task work could not be saved.")
  });
  const busy = !canManage || save.isPending;
  async function reloadSaved() {
    try {
      const tasks = await api<ProjectTask[]>(`/api/projects/${projectId}/tasks`);
      const current = tasks.find((item) => item.id === task.id);
      if (!current) throw new Error("This task was removed.");
      setWork({ paths: current.work?.paths ?? [], patchIds: current.work?.patchIds ?? [], checks: current.work?.checks ?? [], notes: current.work?.notes ?? "" });
      setVersion(current.work?.version ?? 0); setMessage("Loaded the latest task work.");
      void queryClient.invalidateQueries({ queryKey: ["activity", projectId, "tasks"] });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Task reload failed."); }
  }
  async function navigate(action: () => void) {
    try { if (canManage) await save.mutateAsync(); action(); } catch { /* Save error keeps the task editor open. */ }
  }
  const previewFile = preview?.patch.files.find((file) => file.path === preview.path);
  return <div className="cm-task-work-body">
    {task.work && task.work.revision !== revision && <p role="status" className="text-amber">Repository revision changed. Review linked files and previous check results before reuse.</p>}
    <section><h3>Relevant files</h3><div className="cm-work-actions"><select aria-label="Link source file" value={file} onChange={(event) => setFile(event.target.value)}><option value="">Choose a file</option>{paths.filter((path) => !work.paths.includes(path)).map((path) => <option key={path} value={path}>{path}</option>)}</select><button type="button" disabled={!file || busy || work.paths.length >= 30} title="Link file" aria-label="Link file" onClick={() => { setWork({ ...work, paths: [...work.paths, file] }); setFile(""); }}><Plus size={15} /></button></div>
      {work.paths.map((path) => <div key={path} className="cm-work-linked"><button type="button" disabled={!paths.includes(path) || save.isPending} onClick={() => void navigate(() => onOpenFile(path))}><FileCode2 size={14} />{path}</button><button type="button" disabled={busy} aria-label={`Unlink ${path}`} title="Unlink file" onClick={() => setWork({ ...work, paths: work.paths.filter((item) => item !== path) })}><X size={14} /></button></div>)}
    </section>
    <section><h3>AI suggestions and review</h3><div className="cm-work-actions"><button type="button" disabled={save.isPending} onClick={() => void navigate(() => onAsk(taskAssistantPrompt(task.title, work.paths, work.notes)))}><Sparkles size={14} />Draft suggestion</button><select aria-label="Link suggested patch" value={patchId} onChange={(event) => setPatchId(event.target.value)}><option value="">Choose a patch</option>{patches.filter((patch) => !work.patchIds.includes(patch.id)).map((patch) => <option key={patch.id} value={patch.id}>{patch.title} ({patch.status})</option>)}</select><button type="button" disabled={!patchId || busy || work.patchIds.length >= 30} title="Link patch" aria-label="Link patch" onClick={() => { setWork({ ...work, patchIds: [...work.patchIds, patchId] }); setPatchId(""); }}><Plus size={15} /></button></div>
      {work.patchIds.map((id) => { const patch = patches.find((candidate) => candidate.id === id); return <div key={id} className="cm-work-linked"><div><strong>{patch?.title ?? "Patch no longer available"}</strong><span>{patch?.status ?? "unavailable"}</span>{patch?.files.map((file) => <button type="button" key={file.path} onClick={() => setPreview({ patch, path: file.path })}>{file.path}</button>)}</div><button type="button" disabled={busy} title="Unlink patch" aria-label={`Unlink patch ${id}`} onClick={() => setWork({ ...work, patchIds: work.patchIds.filter((candidate) => candidate !== id) })}><X size={14} /></button></div>; })}
    </section>
    <section><h3>Verification record <span>Manual results</span></h3><div className="cm-work-actions"><input aria-label="Verification check" maxLength={300} placeholder="Check to verify" value={check} onChange={(event) => setCheck(event.target.value)} /><button type="button" disabled={check.trim().length < 2 || busy || work.checks.length >= 30} title="Add check" aria-label="Add verification check" onClick={() => { setWork({ ...work, checks: [...work.checks, { id: crypto.randomUUID(), label: check.trim(), status: "pending", note: "" }] }); setCheck(""); }}><Plus size={15} /></button></div>
      {work.checks.map((item) => <div className="cm-work-check" key={item.id}><label>{item.label}<select aria-label={`Result for ${item.label}`} value={item.status} disabled={busy} onChange={(event) => setWork({ ...work, checks: work.checks.map((candidate) => candidate.id === item.id ? { ...candidate, status: event.target.value as typeof item.status } : candidate) })}><option value="pending">Pending</option><option value="passed">Passed (manual)</option><option value="failed">Failed (manual)</option></select></label><input aria-label={`Evidence for ${item.label}`} maxLength={1000} placeholder="Observed result or evidence link" value={item.note} disabled={busy} onChange={(event) => setWork({ ...work, checks: work.checks.map((candidate) => candidate.id === item.id ? { ...candidate, note: event.target.value } : candidate) })} /><button type="button" title="Remove check" aria-label={`Remove check ${item.label}`} disabled={busy} onClick={() => setWork({ ...work, checks: work.checks.filter((candidate) => candidate.id !== item.id) })}><Trash2 size={14} /></button></div>)}
    </section>
    <label className="cm-work-notes">Task notes<textarea aria-label="Task context notes" maxLength={2000} value={work.notes} disabled={busy} onChange={(event) => setWork({ ...work, notes: event.target.value })} /></label>
    <footer className="cm-work-actions"><button type="button" disabled={busy} onClick={() => save.mutate()}><Save size={15} />{save.isPending ? "Saving..." : "Save task work"}</button><button type="button" disabled={save.isPending} onClick={() => void reloadSaved()}><Check size={15} />Reload saved</button><span role="status">{message}</span></footer>
    {previewFile && <WorkspaceDiff title="Linked patch review" path={previewFile.path} before={previewFile.baseContent} after={previewFile.proposedContent} onClose={() => setPreview(null)}><span>{preview?.patch.status} - verification is not automatically executed</span></WorkspaceDiff>}
  </div>;
}
