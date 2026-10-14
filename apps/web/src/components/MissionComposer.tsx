import { useState } from "react";
import { Database, Plus, Save, Trash2, X } from "lucide-react";
import { missionRequestSchema, type MissionRequest } from "@codemesh/shared";
import { newMissionTask, removeMissionTask, sampleMission } from "../lib/missionDrafts";

export function MissionComposer({ projectId, projects, busy, onSave, onClose }: {
  projectId: string; projects: Array<{ id: string; name: string }>; busy: boolean;
  onSave(input: MissionRequest): void; onClose(): void;
}) {
  const [draft, setDraft] = useState<MissionRequest>(() => ({ title: "", goal: "", tasks: [newMissionTask(projectId), newMissionTask(projectId)] }));
  const [error, setError] = useState("");
  function update(id: string, changes: Partial<MissionRequest["tasks"][number]>) {
    setDraft((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, ...changes } : task) }));
  }
  return <form className="mission-composer" onSubmit={(event) => {
    event.preventDefault(); const parsed = missionRequestSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the mission plan."); return; }
    if (!draft.tasks.some((task) => task.projectId === projectId)) { setError("Include the current repository in at least one step."); return; }
    setError(""); onSave(parsed.data);
  }}>
    <header className="mission-section-heading"><h2>New mission</h2><div>{projects.some((project) => project.id === "project-sample-taskpilot") && <button type="button" className="action-secondary" disabled={busy} onClick={() => setDraft(sampleMission("project-sample-taskpilot"))}><Database size={16} /> Load TaskPilot example</button>}<button type="button" className="cm-tool-button" title="Close mission editor" aria-label="Close mission editor" onClick={onClose} disabled={busy}><X size={18} /></button></div></header>
    <div className="mission-plan-fields"><label>Mission title<input className="field" required minLength={3} maxLength={100} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>Mission goal<textarea className="field" required minLength={8} maxLength={2000} rows={2} value={draft.goal} onChange={(event) => setDraft({ ...draft, goal: event.target.value })} /></label></div>
    <ol className="mission-draft-steps">{draft.tasks.map((task, index) => <li key={task.id}>
      <div className="mission-step-heading"><strong>Step {index + 1}</strong><button type="button" className="cm-tool-button" title="Remove step" aria-label={`Remove step ${index + 1}`} disabled={busy || draft.tasks.length <= 2} onClick={() => setDraft({ ...draft, tasks: removeMissionTask(draft.tasks, task.id) })}><Trash2 size={16} /></button></div>
      <div className="mission-step-fields"><label>Step {index + 1} title<input className="field" required minLength={3} maxLength={100} value={task.title} onChange={(event) => update(task.id, { title: event.target.value })} /></label><label>Step {index + 1} repository<select className="field" value={task.projectId} onChange={(event) => update(task.id, { projectId: event.target.value })}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Step {index + 1} mode<select className="field" value={task.mode} onChange={(event) => update(task.id, { mode: event.target.value as MissionRequest["tasks"][number]["mode"] })}>{["investigate", "repair", "migration", "security", "review"].map((mode) => <option key={mode}>{mode}</option>)}</select></label><label>Step {index + 1} attempt limit<input className="field" type="number" min={1} max={3} required value={task.maxAttempts} onChange={(event) => update(task.id, { maxAttempts: Number(event.target.value) })} /></label><label className="mission-objective">Step {index + 1} objective<textarea className="field" required minLength={8} maxLength={2000} rows={2} value={task.objective} onChange={(event) => update(task.id, { objective: event.target.value })} /></label></div>
      {index > 0 && <fieldset className="mission-dependencies"><legend>Depends on accepted evidence</legend>{draft.tasks.slice(0, index).map((parent, parentIndex) => <label key={parent.id}><input type="checkbox" checked={task.dependsOn.includes(parent.id)} onChange={(event) => update(task.id, { dependsOn: event.target.checked ? [...task.dependsOn, parent.id] : task.dependsOn.filter((id) => id !== parent.id) })} /> Step {parentIndex + 1}: {parent.title || "Untitled"}</label>)}</fieldset>}
    </li>)}</ol>
    {error && <p className="studio-error" role="alert">{error}</p>}
    <footer className="mission-editor-actions"><button type="button" className="action-secondary" disabled={busy || draft.tasks.length >= 10} onClick={() => setDraft({ ...draft, tasks: [...draft.tasks, newMissionTask(projectId)] })}><Plus size={16} /> Add step</button><button className="action-primary" disabled={busy}><Save size={16} /> {busy ? "Saving" : "Save plan"}</button></footer>
  </form>;
}
